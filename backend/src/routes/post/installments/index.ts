import type { FastifyInstance } from "fastify";

const { sqlite } = require("../../../db/index");

async function installments(fastify: FastifyInstance) {

    fastify.post("/installment/new",
        {
            onRequest: [
                fastify.authenticate,
                fastify.authorize(3)
            ]
        },
        async (request, reply) => {

            const {
                in_installments,
                percentage
            } = request.body as {
                in_installments: number;
                percentage: number;
            };

            if (
                in_installments === undefined ||
                in_installments === null
            ) {
                return reply.code(400).send({
                    message: "Number of installments is required"
                });
            }

            if (
                percentage === undefined ||
                percentage === null
            ) {
                return reply.code(400).send({
                    message: "Percentage is required"
                });
            }

            const installmentsNumber = Number(in_installments);
            const installmentsPercentage = Number(percentage);

            // Deve ser um número inteiro positivo
            if (
                !Number.isFinite(installmentsNumber) ||
                !Number.isInteger(installmentsNumber) ||
                installmentsNumber <= 0
            ) {
                return reply.code(400).send({
                    message: "Number of installments must be a positive integer"
                });
            }

            // Pode ser número inteiro ou decimal
            if (
                !Number.isFinite(installmentsPercentage) ||
                installmentsPercentage < 0
            ) {
                return reply.code(400).send({
                    message: "Percentage must be a valid non-negative number"
                });
            }

            const existing = sqlite
                .prepare(`
                    SELECT id
                    FROM installments
                    WHERE in_installments = ?
                `)
                .get(installmentsNumber);

            if (existing) {
                return reply.code(409).send({
                    message: "Installment option already registered"
                });
            }

            const result = sqlite
                .prepare(`
                    INSERT INTO installments (
                        in_installments,
                        percentage
                    )
                    VALUES (?, ?)
                `)
                .run(
                    installmentsNumber,
                    installmentsPercentage
                );

            const installment = sqlite
                .prepare(`
                    SELECT
                        id,
                        in_installments,
                        percentage
                    FROM installments
                    WHERE id = ?
                `)
                .get(result.lastInsertRowid);

            return reply.code(201).send({
                message: "Installment option created successfully",
                data: installment
            });
        }
    );
}

module.exports = installments;