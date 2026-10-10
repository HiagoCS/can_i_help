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

            if (!Number.isSafeInteger(saleId) || saleId <= 0) {
                return reply.code(400).send({
                    message: "ID da venda inválido."
                });
            }

            let transactionOpen = false;

            try {
                // Impede alterações concorrentes no estoque durante a exclusão.
                sqlite.exec("BEGIN IMMEDIATE");
                transactionOpen = true;

                // ------------------------------------------------
                // 1. VERIFICAR SE A VENDA EXISTE
                // ------------------------------------------------

                const sale = sqlite
                    .prepare(`
                        SELECT id, total_value, dt_sale
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
                // 2. LER OS ITENS DA VENDA
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

                // Soma por produto para evitar atualizações duplicadas de estoque.
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
                            "Foi encontrada uma quantidade ou referência de estoque inválida na venda."
                        );
                    }

                    stockToRestore.set(
                        productId,
                        (stockToRestore.get(productId) ?? 0) + quantity
                    );
                };

                // ------------------------------------------------
                // 3. RECUPERAR A SAÍDA ORIGINAL PELO HISTÓRICO
                // ------------------------------------------------
                // Quando existem movimentos de venda vinculados à venda,
                // restauramos as quantidades registradas naquele momento.

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
                    // Compatibilidade com vendas antigas sem histórico de estoque.
                    // Para serviços, usa a composição atual em stock_service.
                    const getServiceMaterials = sqlite.prepare(`
                        SELECT product_id, qunt
                        FROM stock_service
                        WHERE service_id = ?
                    `);

                    for (const item of saleItems) {
                        const productId = item.product_id == null
                            ? null
                            : Number(item.product_id);
                        const serviceId = item.service_id == null
                            ? null
                            : Number(item.service_id);

                        const hasProduct = productId !== null;
                        const hasService = serviceId !== null;

                        if (hasProduct === hasService) {
                            throw new Error(
                                `Item ${item.id} da venda ${saleId} possui referência de produto/serviço inválida.`
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
                            addStockToRestore(productId!, soldQuantity);
                            continue;
                        }

                        const materials = getServiceMaterials
                            .all(serviceId!) as Array<{
                                product_id: number;
                                qunt: number;
                            }>;

                        for (const material of materials) {
                            const quantityPerService = Number(material.qunt);

                            if (
                                !Number.isSafeInteger(quantityPerService) ||
                                quantityPerService <= 0
                            ) {
                                throw new Error(
                                    `Quantidade inválida de material no serviço ${serviceId}.`
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
                // 4. RESTAURAR ESTOQUE E REGISTRAR MOVIMENTAÇÃO
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
                        CAST(COALESCE(NULLIF(amount, ''), '0') AS INTEGER) + ?
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
                            `O produto ${productId} referenciado pela venda não foi encontrado. A exclusão foi cancelada para evitar uma inconsistência de estoque.`
                        );
                    }

                    recordProductMovement(product, "stock_add", quantity, 0, {
                        referenceId: saleId,
                        notes: `Restauração de estoque pela exclusão da venda ${saleId}.`
                    });

                    const updateResult = updateProductStock.run(
                        quantity,
                        productId
                    );

                    if (Number(updateResult.changes) !== 1) {
                        throw new Error(
                            `Não foi possível restaurar o estoque do produto ${productId}.`
                        );
                    }

                    restoredItems.push({
                        productId,
                        name: product.name,
                        quantity
                    });
                }

                // ------------------------------------------------
                // 5. REMOVER DOCUMENTOS INTERNOS DA VENDA
                // ------------------------------------------------
                // O PDF A4 e o cupom interno não dependem de documentos fiscais.
                // Removemos os registros internos associados a esta venda;
                // os arquivos físicos serão apagados após o COMMIT.

                const internalDocuments = sqlite
                    .prepare(`
                        SELECT id, pdf_path
                        FROM internal_documents
                        WHERE sale_id = ?
                    `)
                    .all(saleId) as Array<{
                        id: number;
                        pdf_path: string | null;
                    }>;

                sqlite
                    .prepare(`
                        DELETE FROM internal_documents
                        WHERE sale_id = ?
                    `)
                    .run(saleId);

                // ------------------------------------------------
                // 6. REMOVER OS ITENS DA VENDA
                // ------------------------------------------------

                sqlite
                    .prepare(`
                        DELETE FROM stock_sale
                        WHERE sale_id = ?
                    `)
                    .run(saleId);

                // ------------------------------------------------
                // 7. REMOVER A VENDA
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

                sqlite.exec("COMMIT");
                transactionOpen = false;

                // ------------------------------------------------
                // 8. LIMPAR PDFs INTERNOS SEM OUTRAS REFERÊNCIAS
                // ------------------------------------------------
                // Falhas ao excluir arquivos não revertem o COMMIT.

                const removedFiles: string[] = [];

                for (const document of internalDocuments) {
                    if (!document.pdf_path) {
                        continue;
                    }

                    try {
                        const references = sqlite
                            .prepare(`
                                SELECT COUNT(*) AS total
                                FROM internal_documents
                                WHERE pdf_path = ?
                            `)
                            .get(document.pdf_path) as {
                                total: number;
                            };

                        if (Number(references.total) > 0) {
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
                        "Não foi possível excluir a venda. As alterações no banco foram revertidas.",
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
