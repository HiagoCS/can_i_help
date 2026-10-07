import type { FastifyInstance } from "fastify";
const users = require("./user/index");
const roles = require("./roles/index");
async function put(fastify: FastifyInstance) {
    await users(fastify);
    await roles(fastify);
    fastify.put("/", async () => {
        return {
            message: "EightCS API funcionando! PUT"
        };
    });
}

module.exports = (put);