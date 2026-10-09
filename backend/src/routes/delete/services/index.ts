import type { FastifyInstance } from "fastify";

const { sqlite } = require("../../../db/index");

async function services(fastify: FastifyInstance) {
    fastify.delete(
        "/service/:id",
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

            // CHECK SERVICE
            const service = sqlite
                .prepare(`
                    SELECT * FROM services
                    WHERE id = ?
                `)
                .get(id);

            if (!service) {
                return reply.code(404).send({
                    message: "Service not found"
                });
            }

            // CHECK SALES
            const sales = sqlite
                .prepare(`
                    SELECT COUNT(*) AS count
                    FROM stock_sale
                    WHERE service_id = ?
                `)
                .get(id);

            // CHECK FISCAL INVOICES
            const invoices = sqlite
                .prepare(`
                    SELECT COUNT(*) AS count
                    FROM fiscal_invoice_items
                    WHERE service_id = ?
                `)
                .get(id);

            if (Number(sales?.count) || Number(invoices?.count)) {
                return reply.code(409).send({
                    message: "Serviço vinculado a uma venda ou documento fiscal. Desative-o para ocultá-lo do Caixa."
                });
            }

            try {
                sqlite.exec("BEGIN IMMEDIATE");

                // DELETE PRODUCT LINKS
                sqlite
                    .prepare(`
                        DELETE FROM stock_service
                        WHERE service_id = ?
                    `)
                    .run(id);

                // DELETE SERVICE
                sqlite
                    .prepare(`
                        DELETE FROM services
                        WHERE id = ?
                    `)
                    .run(id);

                sqlite.exec("COMMIT");
            } catch (error) {
                sqlite.exec("ROLLBACK");

                request.log.error(error);

                return reply.code(500).send({
                    message: "Could not delete service"
                });
            }

            return {
                message: "Service deleted successfully",
                data: service
            };
        }
    );
}

module.exports = services;