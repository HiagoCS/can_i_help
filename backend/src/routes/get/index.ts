import type { FastifyInstance } from "fastify";
const users = require("./user/index");
const roles = require("./roles/index");
const products = require("./products/index");

async function get(fastify: FastifyInstance) {
     await users(fastify);
     await roles(fastify);
     await products(fastify);
    fastify.get("/", async () => {
        return {
            message: "EightCS API funcionando! GET"
        };
    });
}

module.exports = (get);