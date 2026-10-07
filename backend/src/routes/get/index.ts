import type { FastifyInstance } from "fastify";
const users = require("./user/index");

async function get(fastify: FastifyInstance) {
     await users(fastify);
    fastify.get("/", async () => {
        return {
            message: "EightCS API funcionando! GET"
        };
    });
}

module.exports = (get);