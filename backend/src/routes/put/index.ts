import type { FastifyInstance } from "fastify";
const users = require("./user/index");
const roles = require("./roles/index");
const products = require("./products/index");
const services = require("./services/index");
const clients = require("./clients/index");
const paymentMethods = require("./payment_methods/index");
const installments = require("./installments/index");
async function put(fastify: FastifyInstance) {
    await users(fastify);
    await roles(fastify);
    await products(fastify);
    await services(fastify);
    await clients(fastify);
    await paymentMethods(fastify);
    await installments(fastify);
    fastify.put("/", async () => {
        return {
            message: "EightCS API funcionando! PUT"
        };
    });
}

module.exports = (put);