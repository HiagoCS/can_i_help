import type { FastifyInstance } from "fastify";

const { sqlite } = require("../../../db/index");

function normalizeDigits(value: string): string {
    return value.replace(/\D/g, "");
}

function isValidDate(value?: string): boolean {
    if (!value) {
        return true;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }

    const date = new Date(`${value}T00:00:00.000Z`);

    return (
        !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === value
    );
}

async function clients(fastify: FastifyInstance) {
    // ============================================================
    // GET CLIENTS REPORTS
    // GET /clients/reports?search=&from=YYYY-MM-DD&to=YYYY-MM-DD
    // Retorna clientes, vendas e itens comprados.
    // ============================================================
    fastify.get(
        "/clients/reports",
        { onRequest: [fastify.authenticate] },
        async (request, reply) => {
            const { search: searchQuery, from, to } = (request.query ?? {}) as {
                search?: string;
                from?: string;
                to?: string;
            };

            const query = String(searchQuery ?? "").trim();
            const search = `%${query}%`;
            const queryDigits = normalizeDigits(query);
            const digitsSearch = `%${queryDigits}%`;

            if (
                !isValidDate(from) ||
                !isValidDate(to) ||
                (from && to && from > to)
            ) {
                return reply.code(400).send({
                    message: "Informe um período válido para o relatório."
                });
            }

            // O filtro de data fica no LEFT JOIN para manter clientes sem vendas.
            const dateFilters: string[] = [];
            const dateParams: string[] = [];

            if (from) {
                dateFilters.push("date(c.dt_sale) >= date(?)");
                dateParams.push(from);
            }

            if (to) {
                dateFilters.push("date(c.dt_sale) <= date(?)");
                dateParams.push(to);
            }

            const dateClause = dateFilters.length
                ? " AND " + dateFilters.join(" AND ")
                : "";

            const searchParams = [
                query,
                search,
                search,
                search,
                queryDigits,
                digitsSearch,
                queryDigits,
                digitsSearch
            ];

            const rows = sqlite
                .prepare(`
                    SELECT
                        cl.id AS client_id,
                        cl.name AS client_name,
                        cl.cpf,
                        cl.cnpj,
                        cl.address AS client_address,
                        cl.number AS client_number,
                        cl.complement AS client_complement,
                        cl.neighborhood AS client_neighborhood,
                        cl.city AS client_city,
                        cl.state AS client_state,
                        cl.zip_code AS client_zip_code,

                        c.id AS sale_id,
                        c.dt_sale,
                        c.total_value AS sale_total,
                        pm.name AS payment_method,

                        ss.id AS sale_item_id,
                        ss.product_id,
                        ss.service_id,
                        ss.qunt_sale AS quantity,
                        ss.unit_measure,

                        COALESCE(p.name, s.name) AS item_name,
                        COALESCE(p.sm_code, s.sm_code) AS item_sm_code,
                        COALESCE(p.bar_code, s.bar_code) AS item_bar_code,

                        CASE
                            WHEN ss.product_id IS NOT NULL THEN 'product'
                            WHEN ss.service_id IS NOT NULL THEN 'service'
                            ELSE 'unknown'
                        END AS item_type,

                        COALESCE(
                            CAST(ss.value AS REAL),
                            CASE
                                WHEN ss.product_id IS NOT NULL THEN
                                    CAST(COALESCE(p.value, '0') AS REAL)
                                WHEN ss.service_id IS NOT NULL THEN
                                    CAST(COALESCE(s.cost, '0') AS REAL) +
                                    COALESCE(
                                        (
                                            SELECT SUM(
                                                CAST(COALESCE(p2.value, '0') AS REAL) *
                                                CAST(COALESCE(ssv.qunt, 0) AS REAL)
                                            )
                                            FROM stock_service ssv
                                            INNER JOIN products p2
                                                ON p2.id = ssv.product_id
                                            WHERE ssv.service_id = s.id
                                        ),
                                        0
                                    )
                                ELSE 0
                            END
                        ) AS item_unit_value

                    FROM clients cl
                    LEFT JOIN cashier c
                        ON c.client_id = cl.id
                        ${dateClause}
                    LEFT JOIN payment_method pm
                        ON pm.id = c.method_id
                    LEFT JOIN stock_sale ss
                        ON ss.sale_id = c.id
                    LEFT JOIN products p
                        ON p.id = ss.product_id
                    LEFT JOIN services s
                        ON s.id = ss.service_id

                    WHERE (
                        ? = ''
                        OR cl.name LIKE ?
                        OR cl.cpf LIKE ?
                        OR cl.cnpj LIKE ?
                        OR (
                            ? <> ''
                            AND REPLACE(REPLACE(REPLACE(REPLACE(cl.cpf, '.', ''), '-', ''), '/', ''), ' ', '') LIKE ?
                        )
                        OR (
                            ? <> ''
                            AND REPLACE(REPLACE(REPLACE(REPLACE(cl.cnpj, '.', ''), '-', ''), '/', ''), ' ', '') LIKE ?
                        )
                    )

                    ORDER BY
                        cl.name COLLATE NOCASE ASC,
                        c.dt_sale DESC,
                        c.id DESC,
                        ss.id ASC
                `)
                .all(...dateParams, ...searchParams) as any[];

            // Agrupa clientes -> vendas -> itens.
            const clientsMap = new Map<number, any>();

            for (const row of rows) {
                const clientId = Number(row.client_id);
                let client = clientsMap.get(clientId);

                if (!client) {
                    client = {
                        id: clientId,
                        name: row.client_name,
                        cpf: row.cpf,
                        cnpj: row.cnpj,
                        address: row.client_address ?? null,
                        number: row.client_number ?? null,
                        complement: row.client_complement ?? null,
                        neighborhood: row.client_neighborhood ?? null,
                        city: row.client_city ?? null,
                        state: row.client_state ?? null,
                        zip_code: row.client_zip_code ?? null,
                        purchase_count: 0,
                        items_bought_count: 0,
                        total_spent: 0,
                        purchases: [],
                        _sales: new Map<number, any>()
                    };

                    clientsMap.set(clientId, client);
                }

                if (row.sale_id == null) {
                    continue;
                }

                const saleId = Number(row.sale_id);
                let purchase = client._sales.get(saleId);

                if (!purchase) {
                    purchase = {
                        id: saleId,
                        dt_sale: row.dt_sale,
                        total_value: Number(row.sale_total) || 0,
                        payment_method: row.payment_method ?? null,
                        items: []
                    };

                    client._sales.set(saleId, purchase);
                    client.purchases.push(purchase);
                    client.purchase_count += 1;
                    client.total_spent += purchase.total_value;
                }

                if (row.sale_item_id == null) {
                    continue;
                }

                const quantity = Number(row.quantity) || 0;
                const unitValue = Number(row.item_unit_value) || 0;

                purchase.items.push({
                    id: Number(row.sale_item_id),
                    type: row.item_type,
                    item_id: row.product_id != null
                        ? Number(row.product_id)
                        : row.service_id != null
                            ? Number(row.service_id)
                            : null,
                    product_id: row.product_id != null
                        ? Number(row.product_id)
                        : null,
                    service_id: row.service_id != null
                        ? Number(row.service_id)
                        : null,
                    sm_code: row.item_sm_code ?? null,
                    bar_code: row.item_bar_code ?? null,
                    name: row.item_name ?? "Item não identificado",
                    quantity,
                    unit_measure: row.unit_measure ?? "UN",
                    unit_value: Number(unitValue.toFixed(2)),
                    total_value: Number((unitValue * quantity).toFixed(2))
                });

                client.items_bought_count += quantity;
            }

            const data = Array.from(clientsMap.values()).map((client) => {
                const { _sales, ...clientData } = client;

                return {
                    ...clientData,
                    total_spent: Number(client.total_spent.toFixed(2)),
                    purchases: client.purchases
                };
            });

            return {
                message: "Successful Request",
                data
            };
        }
    );

    // ============================================================
    // GET CLIENT BY ID
    // GET /clients/:clientId
    // Retorna dados cadastrais para edição. Omitidos apenas IE e IBGE.
    // ============================================================
    fastify.get(
        "/clients/:clientId",
        { onRequest: [fastify.authenticate] },
        async (request, reply) => {
            const { clientId: clientIdParam } = request.params as {
                clientId: string;
            };

            const clientId = Number(clientIdParam);

            if (!Number.isSafeInteger(clientId) || clientId <= 0) {
                return reply.code(400).send({
                    message: "O identificador do cliente é inválido."
                });
            }

            const client = sqlite
                .prepare(`
                    SELECT
                        id,
                        name,
                        cpf,
                        cnpj,
                        address,
                        number,
                        complement,
                        neighborhood,
                        city,
                        state,
                        zip_code
                    FROM clients
                    WHERE id = ?
                    LIMIT 1
                `)
                .get(clientId);

            if (!client) {
                return reply.code(404).send({
                    message: "Cliente não encontrado."
                });
            }

            return {
                message: "Successful Request",
                data: client
            };
        }
    );

    // ============================================================
    // GET CLIENTS
    // GET /clients?search=
    // Listagem resumida para a tela de clientes.
    // ============================================================
    fastify.get(
        "/clients",
        { onRequest: [fastify.authenticate] },
        async (request) => {
            const query = String(
                (request.query as { search?: string })?.search ?? ""
            ).trim();

            const search = `%${query}%`;
            const queryDigits = normalizeDigits(query);
            const digitsSearch = `%${queryDigits}%`;

            const data = sqlite
                .prepare(`
                    SELECT
                        id,
                        name,
                        cpf,
                        cnpj,
                        address,
                        number,
                        complement,
                        neighborhood,
                        city,
                        state,
                        zip_code
                    FROM clients
                    WHERE
                        ? = ''
                        OR name LIKE ?
                        OR cpf LIKE ?
                        OR cnpj LIKE ?
                        OR (
                            ? <> ''
                            AND REPLACE(REPLACE(REPLACE(REPLACE(cpf, '.', ''), '-', ''), '/', ''), ' ', '') LIKE ?
                        )
                        OR (
                            ? <> ''
                            AND REPLACE(REPLACE(REPLACE(REPLACE(cnpj, '.', ''), '-', ''), '/', ''), ' ', '') LIKE ?
                        )
                    ORDER BY name COLLATE NOCASE
                    LIMIT 200
                `)
                .all(
                    query,
                    search,
                    search,
                    search,
                    queryDigits,
                    digitsSearch,
                    queryDigits,
                    digitsSearch
                );

            return {
                message: "Successful Request",
                data
            };
        }
    );
}

module.exports = clients;
