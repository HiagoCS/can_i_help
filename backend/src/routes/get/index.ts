import type { FastifyInstance } from "fastify";

async function get(fastify: FastifyInstance) {
    fastify.get("/", async () => {
        return {
            message: "EightCS API funcionando!"
        };
    });
}

module.exports = (get);