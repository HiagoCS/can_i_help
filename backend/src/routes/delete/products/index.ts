import type { FastifyInstance } from "fastify";

const { sqlite } = require("../../../db/index");
const { recordProductMovement } = require("../../../db/product_stock");

async function products(fastify: FastifyInstance) {
    fastify.delete("/product/:id",
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

            const sales = sqlite.prepare("SELECT COUNT(*) AS count FROM stock_sale WHERE product_id = ?").get(id);
            const invoices = sqlite.prepare("SELECT COUNT(*) AS count FROM fiscal_invoice_items WHERE product_id = ?").get(id);
            if (Number(sales?.count) || Number(invoices?.count)) return reply.code(409).send({ message: "Produto ligado a venda ou documento fiscal. Desative-o para ocultá-lo do Caixa." });
            sqlite.exec("BEGIN IMMEDIATE");
            recordProductMovement(product, "delete", 0, 0);
            // DELETE PRODUCT
            sqlite
                .prepare(`
                    DELETE FROM products
                    WHERE id = ?
                `)
                .run(id);
            sqlite.exec("COMMIT");

            return {
                message: "Product deleted successfully",
                data: product
            };
        }
    );
}

module.exports = products;