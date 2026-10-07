import Fastify = require("fastify");
import cors = require("@fastify/cors");
import 'dotenv/config';
import path = require("node:path");
import fastifyStatic = require("@fastify/static");
const getRoute = require("./routes/get/index");
const port = Number(process.env.PORT || process.env.FASTIFY_API_PORT || 3000);

const server = Fastify({
    logger: true
});
server.register(cors, {origin:true})
server.register(getRoute, {prefix:"/api"});
server.register(fastifyStatic, {
    root: path.join(process.cwd(), "storage"),
    prefix: "/storage/",
});

server.listen({
    port: port,
    host: process.env.FASTIFY_API_HOST || "0.0.0.0"
});