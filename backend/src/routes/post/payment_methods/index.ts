import type { FastifyInstance } from "fastify";

const { sqlite } = require("../../../db/index");

async function paymentMethods(fastify: FastifyInstance) {

    fastify.post("/payment-method/new",
        {
            onRequest: [
                fastify.authenticate,
                fastify.authorize(3)
            ]
        },
        async (request, reply) => {

            const {
                name,
                status
            } = request.body as {
                name: string;
                status?: number | null;
            };

            if (!name || !name.trim()) {
                return reply.code(400).send({
                    message: "Name is required"
                });
            }

            const finalName = name.trim();

            const existing = sqlite
                .prepare(`
                    SELECT id
                    FROM payment_method
                    WHERE name = ?
                `)
                .get(finalName);

            if (existing) {
                return reply.code(409).send({
                    message: "Payment method already registered"
                });
            }

            const result = sqlite
                .prepare(`
                    INSERT INTO payment_method (
                        name,
                        status
                    )
                    VALUES (?, ?)
                `)
                .run(
                    finalName,
                    status ?? 1
                );

            const paymentMethod = sqlite
                .prepare(`
                    SELECT
                        id,
                        name,
                        status
                    FROM payment_method
                    WHERE id = ?
                `)
                .get(result.lastInsertRowid);

            return reply.code(201).send({
                message: "Payment method created successfully",
                data: paymentMethod
            });
        }
    );
}

module.exports = paymentMethods;