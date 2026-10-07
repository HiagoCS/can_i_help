import type { FastifyInstance } from "fastify";
const users = require("./user/index");
const products = require("./products/index");

async function get(fastify: FastifyInstance) {
     await users(fastify);
     await products(fastify);
    fastify.get("/", async () => {
        return {
            message: "EightCS API funcionando! GET"
        };
    });
}

module.exports = (get);