import type { FastifyInstance } from "fastify";

const { sqlite } = require("../../../db/index");

async function products(fastify: FastifyInstance) {

    // ============================================================
    // GET ALL PRODUCTS
    // ============================================================

    fastify.get(
        "/products",
        {
            onRequest: [fastify.authenticate]
        },
        async () => {

            const products = sqlite
                .prepare(`
                    SELECT
                        p.id,
                        p.sm_code,
                        p.bar_code,
                        p.name,
                        p.description,
                        p.value,
                        p.cost,
                        p.amount,
                        um.unity AS unit_measure,
                        p.status
                    FROM products p
                    LEFT JOIN un_measure um
                        ON um.id = p.unit_id
                `)
                .all();

            return {
                message: "Successful Request",
                data: products
            };
        }
    );


    // ============================================================
    // SEARCH PRODUCTS
    // ============================================================

    fastify.get(
        "/products/search/:query",
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
                        p.id,
                        p.sm_code,
                        p.bar_code,
                        p.name,
                        p.description,
                        p.value,
                        p.cost,
                        p.amount,
                        um.unity AS unit_measure,
                        p.status
                    FROM products p
                    LEFT JOIN un_measure um
                        ON um.id = p.unit_id
                    WHERE
                        p.sm_code LIKE ?
                        OR p.bar_code LIKE ?
                        OR p.name LIKE ?
                    ORDER BY p.name ASC
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


    // ============================================================
    // GET PRODUCT BY ID
    // ============================================================

    fastify.get(
        "/product/:id",
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
                        p.id,
                        p.sm_code,
                        p.bar_code,
                        p.name,
                        p.description,
                        p.value,
                        p.cost,
                        p.amount,
                        um.unity AS unit_measure,
                        p.status
                    FROM products p
                    LEFT JOIN un_measure um
                        ON um.id = p.unit_id
                    WHERE p.id = ?
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


    // ============================================================
    // GET PRODUCTS BY SM CODE
    // ============================================================

    fastify.get(
        "/product/smcode/:sm_code",
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
                        p.id,
                        p.sm_code,
                        p.bar_code,
                        p.name,
                        p.description,
                        p.value,
                        p.cost,
                        p.amount,
                        um.unity AS unit_measure,
                        p.status
                    FROM products p
                    LEFT JOIN un_measure um
                        ON um.id = p.unit_id
                    WHERE p.sm_code LIKE ?
                    ORDER BY p.sm_code ASC
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


    // ============================================================
    // GET PRODUCTS BY BARCODE
    // ============================================================

    fastify.get(
        "/product/barcode/:bar_code",
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
                        p.id,
                        p.sm_code,
                        p.bar_code,
                        p.name,
                        p.description,
                        p.value,
                        p.cost,
                        p.amount,
                        um.unity AS unit_measure,
                        p.status
                    FROM products p
                    LEFT JOIN un_measure um
                        ON um.id = p.unit_id
                    WHERE p.bar_code LIKE ?
                    ORDER BY p.bar_code ASC
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


    // ============================================================
    // GET PRODUCTS BY NAME
    // ============================================================

    fastify.get(
        "/product/name/:name",
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
                        p.id,
                        p.sm_code,
                        p.bar_code,
                        p.name,
                        p.description,
                        p.value,
                        p.cost,
                        p.amount,
                        um.unity AS unit_measure,
                        p.status
                    FROM products p
                    LEFT JOIN un_measure um
                        ON um.id = p.unit_id
                    WHERE p.name LIKE ?
                    ORDER BY p.name ASC
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


    // ============================================================
    // GET PRODUCTS STOCK
    // ============================================================

    fastify.get(
        "/products/stock",
        {
            onRequest: [fastify.authenticate]
        },
        async () => {

            const products = sqlite
                .prepare(`
                    SELECT
                        p.id,
                        p.sm_code,
                        p.bar_code,
                        p.name,
                        p.description,
                        p.value,
                        p.cost,
                        p.amount,
                        um.unity AS unit_measure,
                        p.ncm,
                        p.cst,
                        p.csosn,
                        p.icms,
                        p.status
                    FROM products p
                    LEFT JOIN un_measure um
                        ON um.id = p.unit_id
                    ORDER BY p.name COLLATE NOCASE ASC
                `)
                .all() as any[];

            const movements = sqlite
                .prepare(`
                    SELECT *
                    FROM update_stock
                    WHERE movement_type IN (
                        'create',
                        'stock_add',
                        'stock_remove',
                        'sale'
                    )
                    ORDER BY dt_update DESC, id DESC
                `)
                .all() as any[];

            const grouped = new Map<number, any[]>();

            for (const movement of movements) {
                const list =
                    grouped.get(Number(movement.product_id)) ?? [];

                list.push(movement);

                grouped.set(
                    Number(movement.product_id),
                    list
                );
            }

            const data = products.flatMap((product) => {

                const list =
                    grouped.get(Number(product.id)) ?? [];

                const hasStockMovement = list.some(
                    (row) =>
                        row.movement_type !== "create" &&
                        (
                            Number(row.qunt_add) > 0 ||
                            Number(row.qunt_remove) > 0
                        )
                );

                if (!hasStockMovement) {
                    return [];
                }

                return [
                    {
                        ...product,

                        latest_entry:
                            list.find(
                                (row) =>
                                    (
                                        row.movement_type === "stock_add" ||
                                        row.movement_type === "create"
                                    ) &&
                                    Number(row.qunt_add) > 0
                            ) ?? null,

                        latest_sale:
                            list.find(
                                (row) =>
                                    row.movement_type === "sale"
                            ) ?? null,

                        latest_exit:
                            list.find(
                                (row) =>
                                    row.movement_type === "stock_remove"
                            ) ?? null,

                        latest_movement_at:
                            list.find(
                                (row) =>
                                    row.movement_type !== "create" &&
                                    (
                                        Number(row.qunt_add) > 0 ||
                                        Number(row.qunt_remove) > 0
                                    )
                            )?.dt_update ?? null
                    }
                ];
            });

            data.sort(
                (left, right) =>
                    String(right.latest_movement_at)
                        .localeCompare(
                            String(left.latest_movement_at)
                        )
            );

            return {
                message: "Successful Request",
                data
            };
        }
    );


    // ============================================================
    // GET PRODUCT STOCK MOVEMENTS
    // ============================================================

    fastify.get(
        "/product/:id/stock-movements",
        {
            onRequest: [fastify.authenticate]
        },
        async (request, reply) => {

            const id = Number(
                (request.params as { id: string }).id
            );

            if (!Number.isInteger(id) || id <= 0) {
                return reply.code(400).send({
                    message: "Produto inválido."
                });
            }

            const product = sqlite
                .prepare(`
                    SELECT id
                    FROM products
                    WHERE id = ?
                `)
                .get(id);

            if (!product) {
                return reply.code(404).send({
                    message: "Produto não encontrado."
                });
            }

            const data = sqlite
                .prepare(`
                    SELECT *
                    FROM update_stock
                    WHERE product_id = ?
                    ORDER BY dt_update DESC, id DESC
                `)
                .all(id);

            return {
                message: "Successful Request",
                data
            };
        }
    );


    // ============================================================
    // GET PRODUCTS REPORTS
    // ============================================================

    fastify.get(
        "/products/reports",
        {
            onRequest: [fastify.authenticate]
        },
        async (request, reply) => {

            const { from, to } = (
                request.query ?? {}
            ) as {
                from?: string;
                to?: string;
            };

            const isValidDate = (value?: string) => {

                if (!value) {
                    return true;
                }

                if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
                    return false;
                }

                const date = new Date(
                    value + "T00:00:00.000Z"
                );

                return (
                    !Number.isNaN(date.getTime()) &&
                    date.toISOString().slice(0, 10) === value
                );
            };

            if (
                !isValidDate(from) ||
                !isValidDate(to) ||
                (from && to && from > to)
            ) {
                return reply.code(400).send({
                    message: "Informe um periodo valido para o relatorio."
                });
            }

            const dateFilters: string[] = [];
            const dateParams: string[] = [];

            if (from) {
                dateFilters.push(
                    "date(m.dt_update) >= date(?)"
                );

                dateParams.push(from);
            }

            if (to) {
                dateFilters.push(
                    "date(m.dt_update) <= date(?)"
                );

                dateParams.push(to);
            }

            const dateClause = dateFilters.length
                ? " AND " + dateFilters.join(" AND ")
                : "";

            const data = sqlite
                .prepare(
                    `
                    SELECT
                        p.id,
                        p.name,
                        um.unity AS unit_measure,

                        COALESCE(
                            SUM(
                                CASE
                                    WHEN m.movement_type IN ('create', 'stock_add')
                                    THEN CAST(
                                        COALESCE(m.qunt_add, 0) AS REAL
                                    )
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS units_purchased,

                        COALESCE(
                            SUM(
                                CASE
                                    WHEN m.movement_type = 'sale'
                                    THEN CAST(
                                        COALESCE(m.qunt_remove, 0) AS REAL
                                    )
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS units_sold,

                        COALESCE(
                            SUM(
                                CASE
                                    WHEN m.movement_type = 'stock_remove'
                                    THEN CAST(
                                        COALESCE(m.qunt_remove, 0) AS REAL
                                    )
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS units_lost,

                        COALESCE(
                            SUM(
                                CASE
                                    WHEN m.movement_type IN ('create', 'stock_add')
                                    THEN
                                        CAST(
                                            COALESCE(m.qunt_add, 0) AS REAL
                                        ) *
                                        CAST(
                                            COALESCE(m.cost, 0) AS REAL
                                        )
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS entry_cost,

                        COALESCE(
                            SUM(
                                CASE
                                    WHEN
                                        m.movement_type = 'sale'
                                        AND m.cost IS NOT NULL
                                    THEN
                                        CAST(
                                            COALESCE(m.qunt_remove, 0) AS REAL
                                        ) *
                                        CAST(m.cost AS REAL)
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS sales_cost,

                        COALESCE(
                            SUM(
                                CASE
                                    WHEN
                                        m.movement_type = 'stock_remove'
                                        AND m.cost IS NOT NULL
                                    THEN
                                        CAST(
                                            COALESCE(m.qunt_remove, 0) AS REAL
                                        ) *
                                        CAST(m.cost AS REAL)
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS loss_cost,

                        COALESCE(
                            SUM(
                                CASE
                                    WHEN m.movement_type = 'sale'
                                    THEN
                                        CAST(
                                            COALESCE(m.qunt_remove, 0) AS REAL
                                        ) *
                                        CAST(
                                            COALESCE(
                                                m.movement_value,
                                                m.value,
                                                '0'
                                            ) AS REAL
                                        )
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS revenue,

                        COUNT(
                            CASE
                                WHEN
                                    m.movement_type = 'sale'
                                    AND m.cost IS NULL
                                THEN 1
                            END
                        ) AS unknown_sale_cost_count,

                        COUNT(
                            CASE
                                WHEN
                                    m.movement_type = 'stock_remove'
                                    AND m.cost IS NULL
                                THEN 1
                            END
                        ) AS unknown_loss_cost_count

                    FROM products p

                    LEFT JOIN un_measure um
                        ON um.id = p.unit_id

                    LEFT JOIN update_stock m
                        ON m.product_id = p.id
                        AND m.movement_type IN (
                            'create',
                            'stock_add',
                            'sale',
                            'stock_remove'
                        )
                        ${dateClause}

                    GROUP BY
                        p.id,
                        p.name,
                        um.unity

                    ORDER BY p.name COLLATE NOCASE ASC
                    `
                )
                .all(...dateParams);

            return {
                message: "Successful Request",
                data
            };
        }
    );

}

module.exports = products;