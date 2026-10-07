import type { FastifyInstance } from "fastify";

const { sqlite } = require("../../../db/index");

async function installments(fastify: FastifyInstance) {

    fastify.get("/installments",
        {
            onRequest: [fastify.authenticate]
        },
        async () => {

            const installments = sqlite
                .prepare(`
                    SELECT
                        id,
                        in_installments,
                        percentage
                    FROM installments
                    ORDER BY in_installments ASC
                `)
                .all();

            return {
                message: "Successful Request",
                data: installments
            };
        }
    );
}

module.exports = installments;