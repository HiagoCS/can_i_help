import type { FastifyInstance } from "fastify";

const { sqlite } = require("../../../db/index");

async function services(fastify: FastifyInstance) {
    /* ---------------------------------------------------------------------- */
    /* Consultas auxiliares                                                   */
    /* ---------------------------------------------------------------------- */

    /**
     * Busca os produtos associados a um serviço.
     */
    const getProducts = sqlite.prepare(`
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
    `);

    /**
     * Formata o serviço com seus produtos e calcula seu valor.
     *
     * Valor do serviço = custo do serviço + valor dos produtos associados.
     */
    function formatService(service: any) {
        const products = getProducts.all(service.id) as any[];

        const productsValue = products.reduce(
            (total: number, product: any) => {
                const value = Number(product.value) || 0;
                const quantity = Number(product.qunt) || 0;

                return total + value * quantity;
            },
            0
        );

        const serviceCost = Number(service.cost) || 0;

        const value = Number(
            (serviceCost + productsValue).toFixed(2)
        );

        return {
            ...service,
            value: value.toFixed(2),
            products
        };
    }

    /**
     * Consulta os dados básicos de um serviço pelo ID.
     */
    const getServiceById = sqlite.prepare(`
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
    `);

    /* ---------------------------------------------------------------------- */
    /* GET SERVICE REPORTS                                                    */
    /* GET /services/reports?from=YYYY-MM-DD&to=YYYY-MM-DD                    */
    /* ---------------------------------------------------------------------- */

    fastify.get(
        "/services/reports",
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
                    `${value}T00:00:00.000Z`
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
                    message: "Informe um período válido para o relatório."
                });
            }

            const dateFilters: string[] = [];
            const dateParams: string[] = [];

            if (from) {
                dateFilters.push(
                    "date(c.dt_sale) >= date(?)"
                );

                dateParams.push(from);
            }

            if (to) {
                dateFilters.push(
                    "date(c.dt_sale) <= date(?)"
                );

                dateParams.push(to);
            }

            const dateClause = dateFilters.length
                ? ` AND ${dateFilters.join(" AND ")}`
                : "";

            /*
             * Valor atual estimado do serviço:
             *
             * services.cost + Σ(produto.value × quantidade)
             *
             * Custo atual estimado dos materiais:
             *
             * Σ(produto.cost × quantidade)
             *
             * stock_sale não possui uma coluna dedicada ao custo
             * histórico do serviço. Por isso, o custo histórico
             * é sinalizado como não confirmado.
             */
            const data = sqlite
                .prepare(`
                    WITH service_values AS (
                        SELECT
                            s.id,

                            CAST(
                                COALESCE(s.cost, '0')
                                AS REAL
                            ) +
                            COALESCE(
                                (
                                    SELECT SUM(
                                        CAST(
                                            COALESCE(p.value, '0')
                                            AS REAL
                                        ) *
                                        CAST(
                                            COALESCE(ssv.qunt, 0)
                                            AS REAL
                                        )
                                    )
                                    FROM stock_service ssv
                                    INNER JOIN products p
                                        ON p.id = ssv.product_id
                                    WHERE ssv.service_id = s.id
                                ),
                                0
                            ) AS unit_value,

                            COALESCE(
                                (
                                    SELECT SUM(
                                        CAST(
                                            COALESCE(p.cost, '0')
                                            AS REAL
                                        ) *
                                        CAST(
                                            COALESCE(ssv.qunt, 0)
                                            AS REAL
                                        )
                                    )
                                    FROM stock_service ssv
                                    INNER JOIN products p
                                        ON p.id = ssv.product_id
                                    WHERE ssv.service_id = s.id
                                ),
                                0
                            ) AS material_cost

                        FROM services s
                    )

                    SELECT
                        s.id,
                        s.name,

                        COALESCE(
                            SUM(
                                CASE
                                    WHEN c.id IS NOT NULL
                                    THEN CAST(
                                        COALESCE(ss.qunt_sale, 0)
                                        AS REAL
                                    )
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS units_sold,

                        COALESCE(
                            SUM(
                                CASE
                                    WHEN c.id IS NOT NULL
                                    THEN
                                        CAST(
                                            COALESCE(ss.qunt_sale, 0)
                                            AS REAL
                                        ) *
                                        CAST(
                                            COALESCE(
                                                ss.value,
                                                sv.unit_value
                                            )
                                            AS REAL
                                        )
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS revenue,

                        COALESCE(
                            SUM(
                                CASE
                                    WHEN c.id IS NOT NULL
                                    THEN
                                        CAST(
                                            COALESCE(ss.qunt_sale, 0)
                                            AS REAL
                                        ) *
                                        sv.material_cost
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS sales_cost,

                        COUNT(
                            CASE
                                WHEN c.id IS NOT NULL
                                THEN ss.id
                            END
                        ) AS unknown_sale_cost_count

                    FROM services s

                    INNER JOIN service_values sv
                        ON sv.id = s.id

                    LEFT JOIN stock_sale ss
                        ON ss.service_id = s.id

                    LEFT JOIN cashier c
                        ON c.id = ss.sale_id
                        ${dateClause}

                    GROUP BY
                        s.id,
                        s.name

                    ORDER BY
                        s.name COLLATE NOCASE ASC
                `)
                .all(...dateParams);

            return {
                message: "Successful Request",
                data
            };
        }
    );

    /* ---------------------------------------------------------------------- */
    /* GET ALL SERVICES                                                       */
    /* GET /services                                                          */
    /* ---------------------------------------------------------------------- */

    fastify.get(
        "/services",
        {
            onRequest: [fastify.authenticate]
        },
        async () => {
            const records = sqlite
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
                    ORDER BY name COLLATE NOCASE ASC
                `)
                .all() as any[];

            const data = records.map((service: any) =>
                formatService(service)
            );

            return {
                message: "Successful Request",
                data
            };
        }
    );

    /* ---------------------------------------------------------------------- */
    /* SEARCH SERVICES                                                        */
    /*                                                                          */
    /* GET /service/name/:query                                               */
    /* GET /service/smcode/:query                                             */
    /* GET /service/barcode/:query                                            */
    /* ---------------------------------------------------------------------- */

    const serviceSearchRoutes = [
        {
            url: "/service/name/:query",
            column: "name"
        },
        {
            url: "/service/smcode/:query",
            column: "sm_code"
        },
        {
            url: "/service/barcode/:query",
            column: "bar_code"
        }
    ] as const;

    for (const route of serviceSearchRoutes) {
        fastify.get(
            route.url,
            {
                onRequest: [fastify.authenticate]
            },
            async (request, reply) => {
                const { query } = request.params as {
                    query: string;
                };

                const normalizedQuery = query?.trim();

                if (!normalizedQuery) {
                    return reply.code(400).send({
                        message: "Informe um termo para pesquisar serviços.",
                        data: []
                    });
                }

                /*
                 * O nome da coluna vem exclusivamente da lista
                 * fixa acima. O conteúdo pesquisado é passado
                 * como parâmetro SQL.
                 *
                 * A busca parcial permite localizar registros
                 * mesmo quando o usuário informa apenas parte
                 * do nome ou código.
                 */
                const records = sqlite
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
                        WHERE COALESCE(${route.column}, '')
                            LIKE ? COLLATE NOCASE
                        ORDER BY name COLLATE NOCASE ASC
                    `)
                    .all(`%${normalizedQuery}%`) as any[];

                const data = records.map((service: any) =>
                    formatService(service)
                );

                return {
                    message: "Successful Request",
                    data
                };
            }
        );
    }

    /* ---------------------------------------------------------------------- */
    /* GET SERVICE BY ID                                                      */
    /* GET /service/:id                                                       */
    /* ---------------------------------------------------------------------- */

    fastify.get(
        "/service/:id",
        {
            onRequest: [fastify.authenticate]
        },
        async (request, reply) => {
            const id = Number(
                (request.params as { id: string }).id
            );

            if (!Number.isSafeInteger(id) || id <= 0) {
                return reply.code(400).send({
                    message: "Invalid service ID"
                });
            }

            const service = getServiceById.get(id) as
                | Record<string, unknown>
                | undefined;

            if (!service) {
                return reply.code(404).send({
                    message: "Service not found"
                });
            }

            return {
                message: "Successful Request",
                data: formatService(service)
            };
        }
    );
}

module.exports = services;