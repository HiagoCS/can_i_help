import type { FastifyInstance } from "fastify";
const users = require("./user/index");
const roles = require("./roles/index");
async function post(fastify: FastifyInstance) {
    await users(fastify);
    await roles(fastify);
    fastify.post("/", async () => {
        return {
            message: "EightCS API funcionando! POST"
        };
    });
}

module.exports = (post);