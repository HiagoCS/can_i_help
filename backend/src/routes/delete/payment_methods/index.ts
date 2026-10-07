import type { FastifyInstance } from "fastify";

const { sqlite } = require("../../../db/index");

async function paymentMethods(fastify: FastifyInstance) {

    fastify.delete("/payment-method/:id",
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

            const paymentMethod = sqlite
                .prepare(`
                    SELECT
                        id,
                        name,
                        status
                    FROM payment_method
                    WHERE id = ?
                `)
                .get(id);

            if (!paymentMethod) {
                return reply.code(404).send({
                    message: "Payment method not found"
                });
            }

            sqlite
                .prepare(`
                    DELETE FROM payment_method
                    WHERE id = ?
                `)
                .run(id);

            return {
                message: "Payment method deleted successfully",
                data: paymentMethod
            };
        }
    );
}

module.exports = paymentMethods;