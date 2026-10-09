import type { FastifyInstance } from "fastify";

const { sqlite } = require("../../../db/index");
const { recordProductMovement } = require("../../../db/product_stock");
const fs = require("node:fs");

async function cashier(fastify: FastifyInstance) {

    // ============================================================
    // DELETE SALE
    // DELETE /cashier/:saleId
    // ============================================================

    fastify.delete(
        "/cashier/:saleId",
        {
            onRequest: [
                fastify.authenticate,
                fastify.authorize(3)
            ]
        },
        async (request, reply) => {
            const { saleId: saleIdParam } = request.params as {
                saleId: string;
            };

            const saleId = Number(saleIdParam);

            if (
                !Number.isSafeInteger(saleId) ||
                saleId <= 0
            ) {
                return reply.code(400).send({
                    message: "ID da venda inválido."
                });
            }

            let transactionOpen = false;

            try {
                // Impede operações concorrentes de alterar o estoque
                // durante o processo de exclusão.
                sqlite.exec("BEGIN IMMEDIATE");
                transactionOpen = true;

                // ------------------------------------------------
                // 1. VERIFICAR SE A VENDA EXISTE
                // ------------------------------------------------

                const sale = sqlite
                    .prepare(`
                        SELECT
                            id,
                            total_value,
                            dt_sale
                        FROM cashier
                        WHERE id = ?
                        LIMIT 1
                    `)
                    .get(saleId) as {
                        id: number;
                        total_value: string | number;
                        dt_sale: string;
                    } | undefined;

                if (!sale) {
                    sqlite.exec("ROLLBACK");
                    transactionOpen = false;

                    return reply.code(404).send({
                        message: "Venda não encontrada."
                    });
                }

                // ------------------------------------------------
                // 2. PROTEGER O HISTÓRICO FISCAL
                // ------------------------------------------------
                //
                // Não apagamos uma venda que possua uma NF-e vinculada.
                // Mesmo rejeitada ou cancelada, a documentação fiscal
                // deve permanecer preservada para consulta e auditoria.
                //
                // O cancelamento fiscal deve ser feito pelo fluxo próprio.

                const fiscalInvoice = sqlite
                    .prepare(`
                        SELECT
                            id,
                            status
                        FROM fiscal_invoices
                        WHERE sale_id = ?
                        LIMIT 1
                    `)
                    .get(saleId) as {
                        id: number;
                        status: string;
                    } | undefined;

                if (fiscalInvoice) {
                    sqlite.exec("ROLLBACK");
                    transactionOpen = false;

                    return reply.code(409).send({
                        message:
                            "Esta venda possui um documento fiscal vinculado. " +
                            "A exclusão física foi bloqueada para preservar o " +
                            "histórico fiscal. Utilize o procedimento fiscal " +
                            "adequado antes de realizar qualquer estorno.",
                        data: {
                            saleId,
                            fiscalInvoiceId: fiscalInvoice.id,
                            fiscalStatus: fiscalInvoice.status
                        }
                    });
                }

                // ------------------------------------------------
                // 3. LER OS ITENS DA VENDA
                // ------------------------------------------------

                type SaleItem = {
                    id: number;
                    product_id: number | null;
                    service_id: number | null;
                    qunt_sale: number;
                    unit_measure: string;
                };

                const saleItems = sqlite
                    .prepare(`
                        SELECT
                            id,
                            product_id,
                            service_id,
                            qunt_sale,
                            unit_measure
                        FROM stock_sale
                        WHERE sale_id = ?
                        ORDER BY id ASC
                    `)
                    .all(saleId) as SaleItem[];

                // Quantidade a devolver por produto.
                // A soma evita atualizações repetidas quando o mesmo
                // produto aparece em vários itens ou serviços.
                const stockToRestore = new Map<number, number>();

                const addStockToRestore = (
                    productId: number,
                    quantity: number
                ) => {
                    if (
                        !Number.isSafeInteger(productId) ||
                        productId <= 0 ||
                        !Number.isSafeInteger(quantity) ||
                        quantity <= 0
                    ) {
                        throw new Error(
                            "Foi encontrada uma quantidade ou referência " +
                            "de estoque inválida na venda."
                        );
                    }

                    stockToRestore.set(
                        productId,
                        (stockToRestore.get(productId) ?? 0) + quantity
                    );
                };

                // ------------------------------------------------
                // 4. RECUPERAR O CONSUMO REGISTRADO NO HISTÓRICO
                // ------------------------------------------------
                //
                // Se a venda possui movimentos registrados em update_stock
                // com reference_id = saleId e movement_type = 'sale',
                // utilizamos esses movimentos para devolver as quantidades
                // efetivamente registradas na saída do estoque.
                //
                // Assim, uma mudança posterior na composição de um serviço
                // não altera a quantidade restaurada para vendas rastreadas.

                const saleMovements = sqlite
                    .prepare(`
                        SELECT
                            product_id,
                            SUM(qunt_remove) AS quantity
                        FROM update_stock
                        WHERE reference_id = ?
                          AND movement_type = 'sale'
                          AND qunt_remove > 0
                        GROUP BY product_id
                    `)
                    .all(saleId) as Array<{
                        product_id: number;
                        quantity: number;
                    }>;

                if (saleMovements.length > 0) {
                    for (const movement of saleMovements) {
                        addStockToRestore(
                            Number(movement.product_id),
                            Number(movement.quantity)
                        );
                    }
                } else {
                    // --------------------------------------------
                    // 5. COMPATIBILIDADE COM VENDAS SEM HISTÓRICO
                    // --------------------------------------------
                    //
                    // Para vendas antigas sem movimentos relacionados,
                    // recuperamos os produtos vendidos e os materiais
                    // associados aos serviços.
                    //
                    // ATENÇÃO: neste fallback, stock_service representa
                    // a composição atual do serviço.

                    const getServiceMaterials = sqlite.prepare(`
                        SELECT
                            product_id,
                            qunt
                        FROM stock_service
                        WHERE service_id = ?
                    `);

                    for (const item of saleItems) {
                        const productId =
                            item.product_id === null
                                ? null
                                : Number(item.product_id);

                        const serviceId =
                            item.service_id === null
                                ? null
                                : Number(item.service_id);

                        const hasProduct = productId !== null;
                        const hasService = serviceId !== null;

                        // Cada item precisa ser exclusivamente produto
                        // ou serviço.
                        if (hasProduct === hasService) {
                            throw new Error(
                                `Item ${item.id} da venda ${saleId} possui ` +
                                "referência de produto/serviço inválida."
                            );
                        }

                        const soldQuantity = Number(item.qunt_sale);

                        if (
                            !Number.isSafeInteger(soldQuantity) ||
                            soldQuantity <= 0
                        ) {
                            throw new Error(
                                `Quantidade inválida no item ${item.id}.`
                            );
                        }

                        if (hasProduct) {
                            addStockToRestore(
                                productId!,
                                soldQuantity
                            );

                            continue;
                        }

                        // Serviço: devolve os materiais previstos
                        // na composição registrada em stock_service.
                        const materials = getServiceMaterials
                            .all(serviceId!) as Array<{
                                product_id: number;
                                qunt: number;
                            }>;

                        for (const material of materials) {
                            const quantityPerService =
                                Number(material.qunt);

                            if (
                                !Number.isSafeInteger(quantityPerService) ||
                                quantityPerService <= 0
                            ) {
                                throw new Error(
                                    `Quantidade inválida de material ` +
                                    `no serviço ${serviceId}.`
                                );
                            }

                            addStockToRestore(
                                Number(material.product_id),
                                quantityPerService * soldQuantity
                            );
                        }
                    }
                }

                // ------------------------------------------------
                // 6. RESTAURAR ESTOQUE E REGISTRAR A MOVIMENTAÇÃO
                // ------------------------------------------------

                const getProduct = sqlite.prepare(`
                    SELECT
                        p.id,
                        p.sm_code,
                        p.bar_code,
                        p.name,
                        p.description,
                        p.value,
                        p.cost,
                        p.amount,
                        um.unity AS unit_measure,
                        p.ncm,
                        p.cst,
                        p.csosn,
                        p.icms,
                        p.status
                    FROM products p
                    LEFT JOIN un_measure um
                        ON um.id = p.unit_id
                    WHERE p.id = ?
                    LIMIT 1
                `);

                const updateProductStock = sqlite.prepare(`
                    UPDATE products
                    SET amount =
                        CAST(
                            COALESCE(NULLIF(amount, ''), '0')
                            AS INTEGER
                        ) + ?
                    WHERE id = ?
                `);

                const restoredItems: Array<{
                    productId: number;
                    name: string;
                    quantity: number;
                }> = [];

                for (const [productId, quantity] of stockToRestore) {
                    const product = getProduct.get(productId) as {
                        id: number;
                        name: string;
                        amount: string | number;
                        [key: string]: any;
                    } | undefined;

                    if (!product) {
                        throw new Error(
                            `O produto ${productId} referenciado pela venda ` +
                            "não foi encontrado. A exclusão foi cancelada " +
                            "para evitar uma inconsistência de estoque."
                        );
                    }

                    // Mantém o registro da devolução no histórico.
                    // Não removemos os movimentos originais da venda.
                    recordProductMovement(
                        product,
                        "stock_add",
                        quantity,
                        0
                    );

                    const updateResult = updateProductStock.run(
                        quantity,
                        productId
                    );

                    if (Number(updateResult.changes) !== 1) {
                        throw new Error(
                            `Não foi possível restaurar o estoque do produto ` +
                            `${productId}.`
                        );
                    }

                    restoredItems.push({
                        productId,
                        name: product.name,
                        quantity
                    });
                }

                // ------------------------------------------------
                // 7. SEPARAR OS DOCUMENTOS INTERNOS
                // ------------------------------------------------
                //
                // A exclusão física da venda remove os registros de
                // documentos internos que não estão ligados a NF-e.
                // Os arquivos só serão removidos depois do COMMIT.

                const internalDocuments = sqlite
                    .prepare(`
                        SELECT
                            id,
                            pdf_path
                        FROM internal_documents
                        WHERE sale_id = ?
                          AND fiscal_invoice_id IS NULL
                    `)
                    .all(saleId) as Array<{
                        id: number;
                        pdf_path: string;
                    }>;

                sqlite
                    .prepare(`
                        DELETE FROM internal_documents
                        WHERE sale_id = ?
                          AND fiscal_invoice_id IS NULL
                    `)
                    .run(saleId);

                // ------------------------------------------------
                // 8. REMOVER OS ITENS DA VENDA
                // ------------------------------------------------

                sqlite
                    .prepare(`
                        DELETE FROM stock_sale
                        WHERE sale_id = ?
                    `)
                    .run(saleId);

                // ------------------------------------------------
                // 9. REMOVER A VENDA
                // ------------------------------------------------

                const deleteResult = sqlite
                    .prepare(`
                        DELETE FROM cashier
                        WHERE id = ?
                    `)
                    .run(saleId);

                if (Number(deleteResult.changes) !== 1) {
                    throw new Error(
                        "Não foi possível excluir o registro da venda."
                    );
                }

                // Todas as alterações no banco são confirmadas juntas.
                sqlite.exec("COMMIT");
                transactionOpen = false;

                // ------------------------------------------------
                // 10. LIMPAR ARQUIVOS PDF SEM OUTRAS REFERÊNCIAS
                // ------------------------------------------------
                //
                // Falha ao apagar um arquivo não deve desfazer uma
                // transação já confirmada no banco.

                const removedFiles: string[] = [];

                for (const document of internalDocuments) {
                    if (!document.pdf_path) {
                        continue;
                    }

                    try {
                        const internalReference = sqlite
                            .prepare(`
                                SELECT COUNT(*) AS total
                                FROM internal_documents
                                WHERE pdf_path = ?
                            `)
                            .get(document.pdf_path) as {
                                total: number;
                            };

                        const danfeReference = sqlite
                            .prepare(`
                                SELECT COUNT(*) AS total
                                FROM danfes
                                WHERE pdf_path = ?
                            `)
                            .get(document.pdf_path) as {
                                total: number;
                            };

                        // Não apagar arquivos ainda referenciados
                        // por outro documento.
                        if (
                            Number(internalReference.total) > 0 ||
                            Number(danfeReference.total) > 0
                        ) {
                            continue;
                        }

                        if (fs.existsSync(document.pdf_path)) {
                            fs.unlinkSync(document.pdf_path);
                            removedFiles.push(document.pdf_path);
                        }
                    } catch (fileError) {
                        request.log.warn(
                            {
                                err: fileError,
                                saleId,
                                pdfPath: document.pdf_path
                            },
                            "Venda excluída, mas não foi possível remover um PDF interno."
                        );
                    }
                }

                return reply.code(200).send({
                    message: "Venda excluída com sucesso.",
                    data: {
                        saleId,
                        totalValue: sale.total_value,
                        restoredStock: restoredItems,
                        removedInternalDocuments: internalDocuments.length,
                        removedFiles: removedFiles.length
                    }
                });
            } catch (error) {
                if (transactionOpen) {
                    try {
                        sqlite.exec("ROLLBACK");
                        transactionOpen = false;
                    } catch (rollbackError) {
                        request.log.error(
                            rollbackError,
                            "Falha ao executar ROLLBACK da exclusão da venda."
                        );
                    }
                }

                request.log.error(
                    error,
                    `Erro ao excluir a venda ${saleId}.`
                );

                return reply.code(500).send({
                    message:
                        "Não foi possível excluir a venda. " +
                        "As alterações no banco foram revertidas.",
                    error:
                        process.env.NODE_ENV === "production"
                            ? undefined
                            : error instanceof Error
                                ? error.message
                                : String(error)
                });
            }
        }
    );

}

module.exports = cashier;