import type { FastifyInstance } from "fastify";

const { sqlite } = require("../../../db/index");

async function installments(fastify: FastifyInstance) {

    fastify.delete("/installment/:id",
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

            const installment = sqlite
                .prepare(`
                    SELECT
                        id,
                        in_installments,
                        percentage
                    FROM installments
                    WHERE id = ?
                `)
                .get(id);

            if (!installment) {
                return reply.code(404).send({
                    message: "Installment option not found"
                });
            }

            sqlite
                .prepare(`
                    DELETE FROM installments
                    WHERE id = ?
                `)
                .run(id);

            return {
                message: "Installment option deleted successfully",
                data: installment
            };
        }
    );
}

module.exports = installments;