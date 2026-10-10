import type { FastifyInstance } from "fastify";
const { sqlite } = require("../../../db/index");

async function settings(fastify: FastifyInstance) {
    const critical = [fastify.authenticate, fastify.authorize(3)];

}

module.exports = settings;
