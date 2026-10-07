import Fastify = require("fastify");
import cors = require("@fastify/cors");
import "dotenv/config";
import path = require("node:path");
import fastifyStatic = require("@fastify/static");
import cookie = require("@fastify/cookie");

const getRoute = require("./routes/get/index");
const postRoute = require("./routes/post/index");
const deleteRoute = require("./routes/delete/index");
const putRoute = require("./routes/put/index");

const port = Number(
    process.env.PORT || process.env.FASTIFY_API_PORT || 3000
);

const server = Fastify({
    logger: true
});

server.register(cookie);

server.register(require("@fastify/jwt"), {
    secret: process.env.JWT_SECRET!,
    cookie: {
        cookieName: "token",
        signed: false
    }
});

server.register(cors, {
    origin: true
});

server.decorate(
    "authenticate",
    async function (
        request: any,
        reply: Fastify.FastifyReply
    ) {
        try {
            await request.jwtVerify();
        } catch {
            return reply.code(401).send({
                message: "Unauthorized"
            });
        }
    }
);

server.register(getRoute, {
    prefix: "/api"
});

server.register(postRoute, {
    prefix: "/api"
});
server.register(deleteRoute, {
    prefix: "/api"
});

server.register(putRoute, {
    prefix: "/api"
});

server.register(fastifyStatic, {
    root: path.join(process.cwd(), "storage"),
    prefix: "/storage/"
});

server.listen({
    port,
    host: process.env.FASTIFY_API_HOST || "0.0.0.0"
});