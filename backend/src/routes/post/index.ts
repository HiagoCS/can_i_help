import type { FastifyInstance } from "fastify";
const users = require("./user/index");
async function post(fastify: FastifyInstance) {
    await users(fastify);
    fastify.post("/", async () => {
        return {
            message: "EightCS API funcionando! POST"
        };
    });
}

module.exports = (post);