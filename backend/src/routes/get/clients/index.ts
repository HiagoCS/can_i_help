import type { FastifyInstance } from "fastify";

const { sqlite } = require("../../../db/index");

async function clients(fastify: FastifyInstance) {
    fastify.get(
        "/clients",
        { onRequest: [fastify.authenticate] },
        async (request) => {
            const query = String((request.query as { search?: string })?.search ?? "").trim();
            const search = "%" + query + "%";
            const queryDigits = query.replace(/\D/g, "");
            const digitsSearch = "%" + queryDigits + "%";
            const data = sqlite.prepare(
                "SELECT id, name, cpf, cnpj " +
                "FROM clients " +
                "WHERE ? = '' OR name LIKE ? OR cpf LIKE ? OR cnpj LIKE ? " +
                "OR (? <> '' AND REPLACE(REPLACE(REPLACE(REPLACE(cpf, '.', ''), '-', ''), '/', ''), ' ', '') LIKE ?) " +
                "OR (? <> '' AND REPLACE(REPLACE(REPLACE(REPLACE(cnpj, '.', ''), '-', ''), '/', ''), ' ', '') LIKE ?) " +
                "ORDER BY name COLLATE NOCASE LIMIT 200"
            ).all(query, search, search, search, queryDigits, digitsSearch, queryDigits, digitsSearch);

            return { message: "Successful Request", data };
        }
    );
}

module.exports = clients;
