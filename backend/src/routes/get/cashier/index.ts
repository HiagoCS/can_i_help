import type { FastifyInstance } from "fastify";

const { sqlite } = require("../../../db/index");

async function cashierSales(fastify: FastifyInstance) {
    fastify.get(
        "/cashier",
        {
            onRequest: [fastify.authenticate]
        },
        async () => {
            const sales = sqlite
                .prepare(
                    "SELECT cashier.id, cashier.total_value, cashier.dt_sale, " +
                    "COALESCE(cashier.customer_name, clients.name) AS client_name, " +
                    "cashier.customer_tax_id AS client_tax_id " +
                    "FROM cashier " +
                    "LEFT JOIN clients ON clients.id = cashier.client_id " +
                    "ORDER BY cashier.id DESC"
                )
                .all();

            return {
                message: "Successful Request",
                data: sales
            };
        }
    );
}

module.exports = cashierSales;
