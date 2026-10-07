import type { FastifyInstance } from "fastify";

const { sqlite } = require("../../../db/index");

async function installments(fastify: FastifyInstance) {

    fastify.put("/installment/:id",
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
                in_installments,
                percentage
            } = request.body as {
                in_installments?: number | string | null;
                percentage?: number | string | null;
            };

            const installment = sqlite
                .prepare(`
                    SELECT id
                    FROM installments
                    WHERE id = ?
                `)
                .get(id);

            if (!installment) {
                return reply.code(404).send({
                    message: "Installment option not found"
                });
            }

            let convertedInstallments: number | null = null;

            if (in_installments !== undefined) {

                if (
                    in_installments === null ||
                    String(in_installments).trim() === ""
                ) {
                    return reply.code(400).send({
                        message: "Number of installments cannot be null or empty"
                    });
                }

                const installmentsNumber = Number(in_installments);

                if (
                    !Number.isFinite(installmentsNumber) ||
                    !Number.isInteger(installmentsNumber) ||
                    installmentsNumber <= 0
                ) {
                    return reply.code(400).send({
                        message: "Number of installments must be a positive integer"
                    });
                }

                convertedInstallments = installmentsNumber;

                const existing = sqlite
                    .prepare(`
                        SELECT id
                        FROM installments
                        WHERE in_installments = ?
                        AND id != ?
                    `)
                    .get(convertedInstallments, id);

                if (existing) {
                    return reply.code(409).send({
                        message: "Installment option already registered"
                    });
                }
            }

            let convertedPercentage: number | null = null;

            if (percentage !== undefined) {

                if (
                    percentage === null ||
                    String(percentage).trim() === ""
                ) {
                    return reply.code(400).send({
                        message: "Percentage cannot be null or empty"
                    });
                }

                const installmentsPercentage = Number(percentage);

                if (
                    !Number.isFinite(installmentsPercentage) ||
                    installmentsPercentage < 0
                ) {
                    return reply.code(400).send({
                        message: "Percentage must be a valid non-negative number"
                    });
                }

                convertedPercentage = installmentsPercentage;
            }

            sqlite
                .prepare(`
                    UPDATE installments
                    SET
                        in_installments = COALESCE(?, in_installments),
                        percentage = COALESCE(?, percentage)
                    WHERE id = ?
                `)
                .run(
                    convertedInstallments,
                    convertedPercentage,
                    id
                );

            const updatedInstallment = sqlite
                .prepare(`
                    SELECT
                        id,
                        in_installments,
                        percentage
                    FROM installments
                    WHERE id = ?
                `)
                .get(id);

            return {
                message: "Installment option updated successfully",
                data: updatedInstallment
            };
        }
    );
}

module.exports = installments;