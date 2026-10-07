import type { FastifyInstance } from "fastify";

const { sqlite } = require("../../../db/index");

async function paymentMethods(fastify: FastifyInstance) {

    fastify.put("/payment-method/:id",
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

            const {
                name,
                status
            } = request.body as {
                name?: string | null;
                status?: number | null;
            };

            const paymentMethod = sqlite
                .prepare(`
                    SELECT id
                    FROM payment_method
                    WHERE id = ?
                `)
                .get(id);

            if (!paymentMethod) {
                return reply.code(404).send({
                    message: "Payment method not found"
                });
            }

            if (name !== undefined) {

                if (name === null || !name.trim()) {
                    return reply.code(400).send({
                        message: "Name cannot be null or empty"
                    });
                }

                const finalName = name.trim();

                const existing = sqlite
                    .prepare(`
                        SELECT id
                        FROM payment_method
                        WHERE name = ?
                        AND id != ?
                    `)
                    .get(finalName, id);

                if (existing) {
                    return reply.code(409).send({
                        message: "Payment method already registered"
                    });
                }
            }

            if (status !== undefined && status !== null) {

                if (
                    status !== 0 &&
                    status !== 1
                ) {
                    return reply.code(400).send({
                        message: "Status must be 0 or 1"
                    });
                }
            }

            sqlite
                .prepare(`
                    UPDATE payment_method
                    SET
                        name = COALESCE(?, name),
                        status = COALESCE(?, status)
                    WHERE id = ?
                `)
                .run(
                    name !== undefined
                        ? name.trim()
                        : null,

                    status !== undefined
                        ? status
                        : null,

                    id
                );

            const updatedPaymentMethod = sqlite
                .prepare(`
                    SELECT
                        id,
                        name,
                        status
                    FROM payment_method
                    WHERE id = ?
                `)
                .get(id);

            return {
                message: "Payment method updated successfully",
                data: updatedPaymentMethod
            };
        }
    );
}

module.exports = paymentMethods;