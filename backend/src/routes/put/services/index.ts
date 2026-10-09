import type { FastifyInstance } from "fastify";

const { sqlite } = require("../../../db/index");

async function services(fastify: FastifyInstance) {

    fastify.put(
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

            const {
                sm_code,
                bar_code,
                name,
                description,
                cost,
                status,
                products
            } = request.body as {
                sm_code?: string | null;
                bar_code?: string | null;
                name?: string;
                description?: string | null;
                cost?: number | string | null;
                status?: number | boolean;
                products?: {
                    product_id: number;
                    qunt: number;
                }[];
            };

            // ====================================================
            // CHECK SERVICE
            // ====================================================

            const service = sqlite
                .prepare(`
                    SELECT *
                    FROM services
                    WHERE id = ?
                `)
                .get(id);

            if (!service) {
                return reply.code(404).send({
                    message: "Service not found"
                });
            }

            // ====================================================
            // VALIDATE NAME
            // ====================================================

            if (
                name !== undefined &&
                !name.trim()
            ) {
                return reply.code(400).send({
                    message: "Name cannot be empty"
                });
            }

            // ====================================================
            // VALIDATE SM CODE
            // ====================================================

            if (sm_code !== undefined) {

                if (!sm_code || !sm_code.trim()) {
                    return reply.code(400).send({
                        message: "SM code cannot be null or empty"
                    });
                }

                const existingSmCode = sqlite
                    .prepare(`
                        SELECT id
                        FROM services
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

            // ====================================================
            // VALIDATE BAR CODE
            // ====================================================

            if (bar_code !== undefined) {

                if (!bar_code || !bar_code.trim()) {
                    return reply.code(400).send({
                        message: "Bar code cannot be null or empty"
                    });
                }

                const existingBarCode = sqlite
                    .prepare(`
                        SELECT id
                        FROM services
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

            // ====================================================
            // VALIDATE COST
            // ====================================================

            let convertedCost: string | null = null;

            if (cost !== undefined) {

                if (cost === null) {
                    convertedCost = null;
                } else {

                    const numericCost = Number(cost);

                    if (
                        !Number.isFinite(numericCost) ||
                        numericCost < 0
                    ) {
                        return reply.code(400).send({
                            message: "Cost must be a valid non-negative number"
                        });
                    }

                    convertedCost = numericCost.toFixed(2);
                }
            }

            // ====================================================
            // VALIDATE PRODUCTS
            // ====================================================

            if (products !== undefined) {

                if (!Array.isArray(products)) {
                    return reply.code(400).send({
                        message: "Products must be an array"
                    });
                }

                const productIds = new Set<number>();

                for (const item of products) {

                    const productId = Number(item.product_id);
                    const quantity = Number(item.qunt);

                    if (
                        !Number.isInteger(productId) ||
                        productId <= 0 ||
                        !Number.isInteger(quantity) ||
                        quantity <= 0
                    ) {
                        return reply.code(400).send({
                            message: "Each product must have a valid product_id and a positive integer qunt"
                        });
                    }

                    if (productIds.has(productId)) {
                        return reply.code(400).send({
                            message: "A product cannot appear more than once in the service"
                        });
                    }

                    productIds.add(productId);

                    const existingProduct = sqlite
                        .prepare(`
                            SELECT id
                            FROM products
                            WHERE id = ?
                        `)
                        .get(productId);

                    if (!existingProduct) {
                        return reply.code(400).send({
                            message: `Product ${productId} not found`
                        });
                    }
                }
            }

            // ====================================================
            // UPDATE SERVICE AND PRODUCTS
            // ====================================================

            try {

                sqlite.exec("BEGIN IMMEDIATE");

                sqlite.prepare(`
                    UPDATE services
                    SET
                        sm_code = COALESCE(?, sm_code),
                        bar_code = COALESCE(?, bar_code),
                        name = COALESCE(?, name),
                        description = CASE
                            WHEN ? = 1 THEN ?
                            ELSE description
                        END,
                        cost = COALESCE(?, cost),
                        status = COALESCE(?, status)
                    WHERE id = ?
                `).run(
                    sm_code !== undefined
                        ? sm_code.trim().toUpperCase()
                        : null,

                    bar_code !== undefined
                        ? bar_code.trim()
                        : null,

                    name !== undefined
                        ? name.trim()
                        : null,

                    description !== undefined ? 1 : 0,
                    description ?? null,

                    convertedCost,

                    status !== undefined
                        ? (status ? 1 : 0)
                        : null,

                    id
                );

                // Se products foi enviado, substitui os vínculos.
                // Um array vazio remove todos os produtos associados.
                if (products !== undefined) {

                    sqlite.prepare(`
                        DELETE FROM stock_service
                        WHERE service_id = ?
                    `).run(id);

                    const insertProduct = sqlite.prepare(`
                        INSERT INTO stock_service (
                            service_id,
                            product_id,
                            qunt
                        )
                        VALUES (?, ?, ?)
                    `);

                    for (const item of products) {
                        insertProduct.run(
                            Number(id),
                            Number(item.product_id),
                            Number(item.qunt)
                        );
                    }
                }

                sqlite.exec("COMMIT");

            } catch (error) {

                sqlite.exec("ROLLBACK");

                request.log.error(error);

                return reply.code(500).send({
                    message: "Could not update service"
                });
            }

            // ====================================================
            // GET UPDATED SERVICE WITH PRODUCTS
            // ====================================================

            const updatedService = sqlite
                .prepare(`
                    SELECT
                        id,
                        sm_code,
                        bar_code,
                        name,
                        description,
                        cost,
                        status
                    FROM services
                    WHERE id = ?
                `)
                .get(id) as Record<string, any>;

            const serviceProducts = sqlite
                .prepare(`
                    SELECT
                        p.id AS product_id,
                        p.sm_code,
                        p.bar_code,
                        p.name,
                        p.description,
                        p.value,
                        p.cost,
                        p.amount,
                        um.unity AS unit_measure,
                        ss.qunt
                    FROM stock_service ss
                    INNER JOIN products p
                        ON p.id = ss.product_id
                    LEFT JOIN un_measure um
                        ON um.id = p.unit_id
                    WHERE ss.service_id = ?
                    ORDER BY p.name COLLATE NOCASE ASC
                `)
                .all(id);

            return {
                message: "Service updated successfully",
                data: {
                    ...updatedService,
                    products: serviceProducts
                }
            };
        }
    );
}

module.exports = services;