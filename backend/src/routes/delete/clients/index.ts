import type { FastifyInstance } from "fastify";

const { sqlite } = require("../../../db/index");

async function clients(fastify: FastifyInstance) {
    // ============================================================
    // DELETE CLIENT
    // DELETE /clients/:clientId
    // Remove o cliente e limpa suas referências em vendas/orçamentos.
    // ============================================================

    fastify.delete(
        "/clients/:clientId",
        {
            onRequest: [
                fastify.authenticate,
                fastify.authorize(3)
            ]
        },
        async (request, reply) => {
            const { clientId: clientIdParam } = request.params as {
                clientId: string;
            };

            const clientId = Number(clientIdParam);

            if (!Number.isSafeInteger(clientId) || clientId <= 0) {
                return reply.code(400).send({
                    message: "O identificador do cliente é inválido."
                });
            }

            let transactionOpen = false;

            try {
                // Mantém a desvinculação e a exclusão do cliente atômicas.
                sqlite.exec("BEGIN IMMEDIATE");
                transactionOpen = true;

                // ------------------------------------------------
                // 1. VERIFICAR SE O CLIENTE EXISTE
                // ------------------------------------------------

                const client = sqlite
                    .prepare(`
                        SELECT id, name
                        FROM clients
                        WHERE id = ?
                        LIMIT 1
                    `)
                    .get(clientId) as {
                        id: number;
                        name: string;
                    } | undefined;

                if (!client) {
                    sqlite.exec("ROLLBACK");
                    transactionOpen = false;

                    return reply.code(404).send({
                        message: "Cliente não encontrado."
                    });
                }

                // ------------------------------------------------
                // 2. REMOVER A REFERÊNCIA NAS VENDAS
                // ------------------------------------------------
                // A venda permanece no histórico. Apenas o vínculo com o
                // cadastro do cliente é removido.

                const detachedSales = sqlite
                    .prepare(`
                        UPDATE cashier
                        SET client_id = NULL
                        WHERE client_id = ?
                    `)
                    .run(clientId);

                // ------------------------------------------------
                // 3. REMOVER A REFERÊNCIA NOS ORÇAMENTOS
                // ------------------------------------------------
                // Preserva os orçamentos, desvinculando o cliente para que
                // a chave estrangeira não impeça a exclusão do cadastro.

                const detachedBudgets = sqlite
                    .prepare(`
                        UPDATE budget
                        SET client_id = NULL
                        WHERE client_id = ?
                    `)
                    .run(clientId);

                // ------------------------------------------------
                // 4. EXCLUIR O CLIENTE
                // ------------------------------------------------

                const deleteResult = sqlite
                    .prepare(`
                        DELETE FROM clients
                        WHERE id = ?
                    `)
                    .run(clientId);

                if (Number(deleteResult.changes) !== 1) {
                    throw new Error(
                        "Não foi possível excluir o registro do cliente."
                    );
                }

                sqlite.exec("COMMIT");
                transactionOpen = false;

                return reply.code(200).send({
                    message: "Cliente excluído com sucesso. As vendas e os orçamentos foram preservados sem o vínculo com o cliente.",
                    data: {
                        clientId,
                        clientName: client.name,
                        detachedSales: Number(detachedSales.changes),
                        detachedBudgets: Number(detachedBudgets.changes)
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
                            "Falha ao executar ROLLBACK da exclusão do cliente."
                        );
                    }
                }

                const errorMessage = error instanceof Error
                    ? error.message
                    : String(error);

                request.log.error(
                    { err: error, clientId },
                    `Erro ao excluir o cliente ${clientId}.`
                );

                if (/foreign key constraint failed/i.test(errorMessage)) {
                    return reply.code(409).send({
                        message: "Não foi possível excluir o cliente porque ainda existem registros vinculados a ele.",
                        error: process.env.NODE_ENV === "production"
                            ? undefined
                            : errorMessage
                    });
                }

                return reply.code(500).send({
                    message: "Não foi possível excluir o cliente. As alterações no banco foram revertidas.",
                    error: process.env.NODE_ENV === "production"
                        ? undefined
                        : errorMessage
                });
            }
        }
    );
}

module.exports = clients;