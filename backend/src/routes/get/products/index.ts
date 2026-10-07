import type { FastifyInstance } from "fastify";

const { sqlite } = require("../../../db/index");

async function products(fastify: FastifyInstance) {

    fastify.get("/products",
        {
            onRequest: [fastify.authenticate]
        },
        async () => {

            const products = sqlite
                .prepare(`
                    SELECT
                        id,
                        sm_code,
                        bar_code,
                        name,
                        description,
                        value,
                        cost,
                        amount,
                        status
                    FROM products
                `)
                .all();

            return {
                message: "Successful Request",
                data: products
            };
        }
    );
    fastify.get("/products/search/:query",
        {
            onRequest: [fastify.authenticate]
        },
        async (request, reply) => {

            const { query } = request.params as {
                query: string;
            };

            const products = sqlite
                .prepare(`
                    SELECT
                        id,
                        sm_code,
                        bar_code,
                        name,
                        description,
                        value,
                        cost,
                        amount,
                        status
                    FROM products
                    WHERE
                        sm_code LIKE ?
                        OR bar_code LIKE ?
                        OR name LIKE ?
                    ORDER BY name ASC
                `)
                .all(
                    `${query}%`,
                    `${query}%`,
                    `%${query}%`
                );

            if (products.length === 0) {
                return reply.code(404).send({
                    message: "Product not found"
                });
            }

            return {
                message: "Successful Request",
                data: products
            };
        }
    );
    fastify.get("/product/:id",
        {
            onRequest: [fastify.authenticate]
        },
        async (request, reply) => {

            const { id } = request.params as {
                id: string;
            };

            const product = sqlite
                .prepare(`
                    SELECT
                        id,
                        sm_code,
                        bar_code,
                        name,
                        description,
                        value,
                        cost,
                        amount,
                        status
                    FROM products
                    WHERE id = ?
                `)
                .get(id);

            if (!product) {
                return reply.code(404).send({
                    message: "Product not found"
                });
            }

            return {
                message: "Successful Request",
                data: product
            };
        }
    );
    fastify.get("/product/smcode/:sm_code",
        {
            onRequest: [fastify.authenticate]
        },
        async (request, reply) => {

            const { sm_code } = request.params as {
                sm_code: string;
            };

            const products = sqlite
                .prepare(`
                    SELECT
                        id,
                        sm_code,
                        bar_code,
                        name,
                        description,
                        value,
                        cost,
                        amount,
                        status
                    FROM products
                    WHERE sm_code LIKE ?
                    ORDER BY sm_code ASC
                `)
                .all(`${sm_code}%`);

            if (products.length === 0) {
                return reply.code(404).send({
                    message: "Product not found"
                });
            }

            return {
                message: "Successful Request",
                data: products
            };
        }
    );
    fastify.get("/product/barcode/:bar_code",
        {
            onRequest: [fastify.authenticate]
        },
        async (request, reply) => {

            const { bar_code } = request.params as {
                bar_code: string;
            };

            const products = sqlite
                .prepare(`
                    SELECT
                        id,
                        sm_code,
                        bar_code,
                        name,
                        description,
                        value,
                        cost,
                        amount,
                        status
                    FROM products
                    WHERE bar_code LIKE ?
                    ORDER BY bar_code ASC
                `)
                .all(`${bar_code}%`);

            if (products.length === 0) {
                return reply.code(404).send({
                    message: "Product not found"
                });
            }

            return {
                message: "Successful Request",
                data: products
            };
        }
    );
    fastify.get("/product/name/:name",
        {
            onRequest: [fastify.authenticate]
        },
        async (request, reply) => {

            const { name } = request.params as {
                name: string;
            };

            const products = sqlite
                .prepare(`
                    SELECT
                        id,
                        sm_code,
                        bar_code,
                        name,
                        description,
                        value,
                        cost,
                        amount,
                        status
                    FROM products
                    WHERE name LIKE ?
                    ORDER BY name ASC
                `)
                .all(`%${name}%`);

            if (products.length === 0) {
                return reply.code(404).send({
                    message: "Product not found"
                });
            }

            return {
                message: "Successful Request",
                data: products
            };
        }
    );
}

module.exports = products;