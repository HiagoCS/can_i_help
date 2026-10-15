import type { FastifyInstance } from "fastify";

const { sqlite } = require("../../../db/index");
const { recordProductMovement } = require("../../../db/product_stock");

async function products(fastify: FastifyInstance) {
    fastify.delete(
        "/product/:id",
        {
            onRequest: [
                fastify.authenticate,
                fastify.authorize(3)
            ]
        },
        async (request, reply) => {
            const { id } = request.params as {
                id: string;
            };

            // CHECK PRODUCT
            const product = sqlite
                .prepare(`
                    SELECT * FROM products
                    WHERE id = ?
                `)
                .get(id);

            if (!product) {
                return reply.code(404).send({
                    message: "Product not found"
                });
            }

            const sales = sqlite
                .prepare(`
                    SELECT COUNT(*) AS count
                    FROM stock_sale
                    WHERE product_id = ?
                `)
                .get(id);

            if (Number(sales?.count)) {
                return reply.code(409).send({
                    message: "Produto ligado a venda ou documento fiscal. Desative-o para ocultá-lo do Caixa."
                });
            }

            let transactionOpen = false;

            try {
                sqlite.exec("BEGIN IMMEDIATE");
                transactionOpen = true;

                recordProductMovement(product, "delete", 0, 0);

                // DELETE PRODUCT
                const result = sqlite
                    .prepare(`
                        DELETE FROM products
                        WHERE id = ?
                    `)
                    .run(id);

                if (Number(result.changes) !== 1) {
                    sqlite.exec("ROLLBACK");
                    transactionOpen = false;

                    return reply.code(404).send({
                        message: "Product not found"
                    });
                }

                sqlite.exec("COMMIT");
                transactionOpen = false;

                return reply.code(200).send({
                    message: "Product deleted successfully",
                    data: product
                });
            } catch (error) {
                if (transactionOpen) {
                    try {
                        sqlite.exec("ROLLBACK");
                    } catch (rollbackError) {
                        request.log.error(
                            { err: rollbackError, productId: id },
                            "Falha ao executar ROLLBACK da exclusão do produto"
                        );
                    }
                }

                request.log.error(
                    { err: error, productId: id },
                    "Erro ao excluir produto"
                );

                return reply.code(500).send({
                    message: "Não foi possível excluir o produto. As alterações no banco foram revertidas."
                });
            }
        }
    );

    // ============================================================
    // DELETE STOCK MOVEMENT HISTORY RECORD
    // DELETE /update-stock/:id
    // Reverte o efeito no estoque para sale, stock_add e stock_remove.
    // ============================================================

    fastify.delete(
        "/update-stock/:id",
        {
            onRequest: [
                fastify.authenticate,
                fastify.authorize(3)
            ]
        },
        async (request, reply) => {
            const { id } = request.params as {
                id: string;
            };

            const movementId = Number(id);

            if (!Number.isSafeInteger(movementId) || movementId <= 0) {
                return reply.code(400).send({
                    message: "ID do registro de movimentação inválido."
                });
            }

            let transactionOpen = false;

            try {
                // Evita que o estoque ou o histórico sejam alterados durante a reversão.
                sqlite.exec("BEGIN IMMEDIATE");
                transactionOpen = true;

                const movement = sqlite
                    .prepare(`
                        SELECT *
                        FROM update_stock
                        WHERE id = ?
                        LIMIT 1
                    `)
                    .get(movementId) as {
                        id: number;
                        product_id: number | null;
                        movement_type: string;
                        qunt_remove: number | string | null;
                        qunt_add: number | string | null;
                        [key: string]: any;
                    } | undefined;

                if (!movement) {
                    sqlite.exec("ROLLBACK");
                    transactionOpen = false;

                    return reply.code(404).send({
                        message: "Registro de movimentação não encontrado."
                    });
                }

                const movementType = String(movement.movement_type ?? "")
                    .trim()
                    .toLowerCase();

                const addsStockBack =
                    movementType === "sale" || movementType === "stock_remove";
                const removesStock = movementType === "stock_add";
                const affectsStock = addsStockBack || removesStock;

                if (affectsStock) {
                    const productId = Number(movement.product_id);

                    if (!Number.isSafeInteger(productId) || productId <= 0) {
                        sqlite.exec("ROLLBACK");
                        transactionOpen = false;

                        return reply.code(409).send({
                            message: "Não é possível reverter esta movimentação porque ela não possui um produto válido vinculado."
                        });
                    }

                    const rawQuantity = addsStockBack
                        ? movement.qunt_remove
                        : movement.qunt_add;
                    const quantity = Number(rawQuantity);

                    if (
                        rawQuantity === null ||
                        rawQuantity === undefined ||
                        !Number.isFinite(quantity) ||
                        quantity < 0
                    ) {
                        sqlite.exec("ROLLBACK");
                        transactionOpen = false;

                        return reply.code(409).send({
                            message: "A quantidade registrada na movimentação é inválida. O registro não foi excluído."
                        });
                    }

                    const product = sqlite
                        .prepare(`
                            SELECT id, name, amount
                            FROM products
                            WHERE id = ?
                            LIMIT 1
                        `)
                        .get(productId) as {
                            id: number;
                            name: string;
                            amount: number | string | null;
                        } | undefined;

                    if (!product) {
                        sqlite.exec("ROLLBACK");
                        transactionOpen = false;

                        return reply.code(409).send({
                            message: "O produto desta movimentação não existe mais. O registro não foi excluído para evitar inconsistência no estoque."
                        });
                    }

                    const currentAmount = Number(product.amount ?? 0);

                    if (!Number.isFinite(currentAmount) || currentAmount < 0) {
                        sqlite.exec("ROLLBACK");
                        transactionOpen = false;

                        return reply.code(409).send({
                            message: `O estoque atual de ${product.name} está inválido. Corrija a quantidade antes de excluir esta movimentação.`
                        });
                    }

                    // Excluir sale/stock_remove desfaz uma saída: devolve a quantidade.
                    // Excluir stock_add desfaz uma entrada: retira a quantidade adicionada.
                    const nextAmount = addsStockBack
                        ? currentAmount + quantity
                        : currentAmount - quantity;

                    if (nextAmount < 0) {
                        sqlite.exec("ROLLBACK");
                        transactionOpen = false;

                        return reply.code(409).send({
                            message: `Não é possível excluir esta movimentação: o estoque de ${product.name} ficaria negativo. Estoque atual: ${currentAmount}; quantidade a retirar: ${quantity}.`
                        });
                    }

                    // Quantidades podem ser fracionárias; limita o erro de ponto flutuante.
                    const normalizedAmount = Math.round(
                        (nextAmount + Number.EPSILON) * 10000
                    ) / 10000;

                    const updateResult = sqlite
                        .prepare(`
                            UPDATE products
                            SET amount = ?
                            WHERE id = ?
                        `)
                        .run(String(normalizedAmount), productId);

                    if (Number(updateResult.changes) !== 1) {
                        throw new Error(
                            `Não foi possível atualizar o estoque do produto ${productId}.`
                        );
                    }
                }

                const deleteResult = sqlite
                    .prepare(`
                        DELETE FROM update_stock
                        WHERE id = ?
                    `)
                    .run(movementId);

                if (Number(deleteResult.changes) !== 1) {
                    throw new Error(
                        "Não foi possível excluir o registro de movimentação."
                    );
                }

                sqlite.exec("COMMIT");
                transactionOpen = false;

                return reply.code(200).send({
                    message: affectsStock
                        ? "Movimentação excluída e estoque revertido com sucesso."
                        : "Registro de movimentação excluído com sucesso.",
                    data: movement
                });
            } catch (error) {
                if (transactionOpen) {
                    try {
                        sqlite.exec("ROLLBACK");
                    } catch (rollbackError) {
                        request.log.error(
                            { err: rollbackError, movementId },
                            "Falha ao executar ROLLBACK da exclusão da movimentação"
                        );
                    }
                }

                request.log.error(
                    { err: error, movementId },
                    "Erro ao excluir registro de movimentação de estoque"
                );

                return reply.code(500).send({
                    message: "Não foi possível excluir o registro de movimentação. As alterações no banco foram revertidas.",
                    error: process.env.NODE_ENV === "production"
                        ? undefined
                        : error instanceof Error
                            ? error.message
                            : String(error)
                });
            }
        }
    );
}

module.exports = products;
