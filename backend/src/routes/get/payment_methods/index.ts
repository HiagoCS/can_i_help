import type { FastifyInstance } from "fastify";

const { sqlite } = require("../../../db/index");

async function paymentMethods(fastify: FastifyInstance) {

    fastify.get("/payment-methods",
        {
            onRequest: [fastify.authenticate]
        },
        async () => {

            const paymentMethods = sqlite
                .prepare(`
                    SELECT
                        id,
                        name,
                        status
                    FROM payment_method
                    ORDER BY id ASC
                `)
                .all();

            return {
                message: "Successful Request",
                data: paymentMethods
            };
        }
    );
}

module.exports = paymentMethods;