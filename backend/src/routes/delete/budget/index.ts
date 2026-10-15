import type { FastifyInstance } from "fastify";

const { sqlite } = require("../../../db/index");

async function budget(fastify: FastifyInstance) {
    // ============================================================
    // DELETE BUDGET
    // DELETE /budget/:budgetId
    // ============================================================
    fastify.delete(
        "/budget/:budgetId",
        {
            onRequest: [
                fastify.authenticate,
                fastify.authorize(3)
            ]
        },
        async (request, reply) => {
            const { budgetId: budgetIdParam } = request.params as {
                budgetId: string;
            };
            const budgetId = Number(budgetIdParam);

            if (!Number.isSafeInteger(budgetId) || budgetId <= 0) {
                return reply.code(400).send({
                    message: "ID do orçamento inválido."
                });
            }

            let transactionOpen = false;

            try {
                sqlite.exec("BEGIN IMMEDIATE");
                transactionOpen = true;

                const budget = sqlite.prepare(`
                    SELECT id, total_value, dt_budget
                    FROM budget
                    WHERE id = ?
                    LIMIT 1
                `).get(budgetId) as {
                    id: number;
                    total_value: number | string;
                    dt_budget: string;
                } | undefined;

                if (!budget) {
                    sqlite.exec("ROLLBACK");
                    transactionOpen = false;
                    return reply.code(404).send({
                        message: "Orçamento não encontrado."
                    });
                }

                const countResult = sqlite.prepare(`
                    SELECT COUNT(*) AS total
                    FROM stock_budget
                    WHERE budget_id = ?
                `).get(budgetId) as { total: number };

                const removedItems = Number(countResult.total) || 0;

                // Exclui primeiro os itens dependentes e depois o cabeçalho.
                // Orçamentos não movimentam estoque, portanto nada é restaurado.
                sqlite.prepare(`
                    DELETE FROM stock_budget
                    WHERE budget_id = ?
                `).run(budgetId);

                const deleteResult = sqlite.prepare(`
                    DELETE FROM budget
                    WHERE id = ?
                `).run(budgetId);

                if (Number(deleteResult.changes) !== 1) {
                    throw new Error("Não foi possível excluir o orçamento.");
                }

                sqlite.exec("COMMIT");
                transactionOpen = false;

                return reply.code(200).send({
                    message: "Orçamento excluído com sucesso.",
                    data: {
                        budgetId,
                        totalValue: Number(budget.total_value) || 0,
                        dtBudget: budget.dt_budget,
                        removedItems
                    }
                });
            } catch (error) {
                if (transactionOpen) {
                    try {
                        sqlite.exec("ROLLBACK");
                    } catch (rollbackError) {
                        request.log.error(
                            { err: rollbackError, budgetId },
                            "Falha ao reverter exclusão do orçamento"
                        );
                    }
                }

                request.log.error({ err: error, budgetId }, "Erro ao excluir orçamento");
                return reply.code(500).send({
                    message: "Não foi possível excluir o orçamento. As alterações no banco foram revertidas.",
                    error: process.env.NODE_ENV === "production"
                        ? undefined
                        : error instanceof Error ? error.message : String(error)
                });
            }
        }
    );
}

module.exports = budget;
