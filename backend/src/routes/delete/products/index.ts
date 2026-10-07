import type { FastifyInstance } from "fastify";

const { sqlite } = require("../../../db/index");

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
                    SELECT
                        id,
                        sm_code,
                        bar_code,
                        name
                    FROM products
                    WHERE id = ?
                `)
                .get(id);

            if (!product) {
                return reply.code(404).send({
                    message: "Product not found"
                });
            }

            // DELETE PRODUCT
            sqlite
                .prepare(`
                    DELETE FROM products
                    WHERE id = ?
                `)
                .run(id);

            return {
                message: "Product deleted successfully",
                data: product
            };
        }
    );
}

module.exports = products;