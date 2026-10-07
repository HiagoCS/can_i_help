import type { FastifyInstance } from "fastify";
const users = require("./user/index");
const roles = require("./roles/index");
async function deleteRoute(fastify: FastifyInstance) {
    await users(fastify);
    await roles(fastify);
    fastify.delete("/", async () => {
        return {
            message: "EightCS API funcionando! DELETE"
        };
    });
}

module.exports = (deleteRoute);