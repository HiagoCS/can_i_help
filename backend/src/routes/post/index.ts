import type { FastifyInstance } from "fastify";
const users = require("./user/index");
const roles = require("./roles/index");
const products = require("./products/index");
const paymentMethods = require("./payment_methods/index");
const installments = require("./installments/index");
async function post(fastify: FastifyInstance) {
    await users(fastify);
    await roles(fastify);
    await products(fastify);
    await paymentMethods(fastify);
    await installments(fastify);
    fastify.post("/", async () => {
        return {
            message: "EightCS API funcionando! POST"
        };
    });
}

module.exports = (post);