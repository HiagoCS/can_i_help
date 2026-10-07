import type { FastifyInstance } from "fastify";
const users = require("./user/index");
async function put(fastify: FastifyInstance) {
    await users(fastify);
    fastify.put("/", async () => {
        return {
            message: "EightCS API funcionando! PUT"
        };
    });
}

module.exports = (put);