import type { FastifyInstance } from "fastify";
const users = require("./user/index");
const roles = require("./roles/index");
const products = require("./products/index");
const paymentMethods = require("./payment_methods/index");
const installments = require("./installments/index");
const cashierSales = require("./cashier/index");
const clients = require("./clients/index");
async function get(fastify: FastifyInstance) {
    await users(fastify);
    await roles(fastify);
    await products(fastify);
    await paymentMethods(fastify);
    await installments(fastify);
    await cashierSales(fastify);
    await clients(fastify);
    fastify.get("/", async () => {
        return {
            message: "EightCS API funcionando! GET"
        };
    });
}

module.exports = (get);
