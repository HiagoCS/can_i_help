import type { FastifyInstance } from "fastify";

const { sqlite } = require("../../../db/index");

async function products(fastify: FastifyInstance) {

    fastify.put("/product/:id",
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
                sm_code,
                bar_code,
                name,
                description,
                value,
                cost,
                amount,
                status
            } = request.body as {
                sm_code?: string | null;
                bar_code?: string | null;
                name?: string;
                description?: string | null;
                value?: number | string | null;
                cost?: number | string | null;
                amount?: number | string | null;
                status?: number | null;
            };


            // CHECK PRODUCT
            const product = sqlite
                .prepare(`
                    SELECT id
                    FROM products
                    WHERE id = ?
                `)
                .get(id);

            if (!product) {
                return reply.code(404).send({
                    message: "Product not found"
                });
            }


            /*
             * VALIDATE VALUE
             *
             * Aceita:
             * 45
             * 45.90
             * "45"
             * "45.90"
             *
             * Rejeita:
             * "string"
             */
            let convertedValue: string | null = null;

            if (value !== undefined) {

                if (value === null) {

                    convertedValue = null;

                } else {

                    const numericValue = Number(value);

                    if (
                        Number.isNaN(numericValue) ||
                        !Number.isFinite(numericValue)
                    ) {
                        return reply.code(400).send({
                            message: "Value must be a valid number"
                        });
                    }

                    convertedValue = String(
                        Number.parseFloat(String(numericValue))
                    );
                }
            }


            /*
             * VALIDATE COST
             *
             * Aceita:
             * 45
             * 45.90
             * "45"
             * "45.90"
             *
             * Rejeita:
             * "string"
             */
            let convertedCost: string | null = null;

            if (cost !== undefined) {

                if (cost === null) {

                    convertedCost = null;

                } else {

                    const numericCost = Number(cost);

                    if (
                        Number.isNaN(numericCost) ||
                        !Number.isFinite(numericCost)
                    ) {
                        return reply.code(400).send({
                            message: "Cost must be a valid number"
                        });
                    }

                    convertedCost = String(
                        Number.parseFloat(String(numericCost))
                    );
                }
            }


            /*
             * VALIDATE AMOUNT
             *
             * Aceita:
             * 15
             * 15.8
             * "15"
             * "15.8"
             *
             * Rejeita:
             * "string"
             *
             * Float é convertido para inteiro.
             */
            let convertedAmount: string | null = null;

            if (amount !== undefined) {

                if (amount === null) {

                    convertedAmount = null;

                } else {

                    const numericAmount = Number(amount);

                    if (
                        Number.isNaN(numericAmount) ||
                        !Number.isFinite(numericAmount)
                    ) {
                        return reply.code(400).send({
                            message: "Amount must be a valid number"
                        });
                    }

                    convertedAmount = String(
                        Math.trunc(numericAmount)
                    );
                }
            }


            /*
             * CHECK SM CODE
             */
            if (sm_code !== undefined) {

                if (sm_code === null || !sm_code.trim()) {

                    return reply.code(400).send({
                        message: "SM code cannot be null or empty"
                    });
                }

                const existingSmCode = sqlite
                    .prepare(`
                        SELECT id
                        FROM products
                        WHERE sm_code = ?
                        AND id != ?
                    `)
                    .get(
                        sm_code.trim().toUpperCase(),
                        id
                    );

                if (existingSmCode) {

                    return reply.code(409).send({
                        message: "SM code already registered"
                    });
                }
            }


            /*
             * CHECK BAR CODE
             */
            if (bar_code !== undefined) {

                if (bar_code === null || !bar_code.trim()) {

                    return reply.code(400).send({
                        message: "Bar code cannot be null or empty"
                    });
                }

                const existingBarCode = sqlite
                    .prepare(`
                        SELECT id
                        FROM products
                        WHERE bar_code = ?
                        AND id != ?
                    `)
                    .get(
                        bar_code.trim(),
                        id
                    );

                if (existingBarCode) {

                    return reply.code(409).send({
                        message: "Bar code already registered"
                    });
                }
            }


            /*
             * NAME
             */
            if (
                name !== undefined &&
                !name.trim()
            ) {

                return reply.code(400).send({
                    message: "Name cannot be empty"
                });
            }


            /*
             * UPDATE PRODUCT
             */
            sqlite
                .prepare(`
                    UPDATE products
                    SET
                        sm_code = COALESCE(?, sm_code),
                        bar_code = COALESCE(?, bar_code),
                        name = COALESCE(?, name),
                        description = COALESCE(?, description),
                        value = COALESCE(?, value),
                        cost = COALESCE(?, cost),
                        amount = COALESCE(?, amount),
                        status = COALESCE(?, status)
                    WHERE id = ?
                `)
                .run(
                    sm_code !== undefined
                        ? sm_code.trim().toUpperCase()
                        : null,

                    bar_code !== undefined
                        ? bar_code.trim()
                        : null,

                    name !== undefined
                        ? name.trim()
                        : null,

                    description !== undefined
                        ? description
                        : null,

                    convertedValue,

                    convertedCost,

                    convertedAmount,

                    status !== undefined
                        ? status
                        : null,

                    id
                );


            // GET UPDATED PRODUCT
            const updatedProduct = sqlite
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


            return {
                message: "Product updated successfully",
                data: updatedProduct
            };
        }
    );
}

module.exports = products;