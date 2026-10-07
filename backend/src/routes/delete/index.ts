import type { FastifyInstance } from "fastify";
const users = require("./user/index");
async function deleteRoute(fastify: FastifyInstance) {
    await users(fastify);
    fastify.delete("/", async () => {
        return {
            message: "EightCS API funcionando! DELETE"
        };
    });
}

module.exports = (deleteRoute);