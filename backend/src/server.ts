import "dotenv/config";
import path = require("node:path");

import Fastify = require("fastify");
import cors = require("@fastify/cors");
import fastifyStatic = require("@fastify/static");
import cookie = require("@fastify/cookie");
import websocket = require("@fastify/websocket");

const { sqlite } = require("./db/index");

const getRoute = require("./routes/get/index");
const postRoute = require("./routes/post/index");
const deleteRoute = require("./routes/delete/index");
const putRoute = require("./routes/put/index");
const settingsRoutes = require("./routes/settings/index");

const port = Number(process.env.PORT || process.env.FASTIFY_API_PORT || 3000);

const server = Fastify({
    logger: true,
    bodyLimit: 12 * 1024 * 1024
});

server.register(cookie);
server.register(websocket);
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
/*
 * AUTHENTICATE
 *
 * Verifica se o usuário possui um JWT válido.
 *
 * Se não possuir:
 * 401 Unauthorized
 */
server.decorate(
    "authenticate",
    async function (request: any, reply: Fastify.FastifyReply){
        try {
            await request.jwtVerify();
            const user = sqlite.prepare("SELECT status FROM users WHERE id = ?").get(request.user.id) as { status: number } | undefined;
            if (!user || !user.status) {
                return reply.code(403).send({ message: "Esta conta está inativa." });
            }
        } catch {
            return reply.code(401).send({
                message: "Unauthorized"
            });
        }
    }
);
/*
 * AUTHORIZE
 *
 * Verifica se o usuário possui
 * uma role com o level necessário.
 *
 * Exemplo:
 *
 * fastify.authorize(3)
 *
 * O usuário precisa possuir pelo menos
 * uma role com level >= 3.
 */

server.decorate(
    "authorize",
    (requiredLevel: number) => {
        return async function (request: any, reply: Fastify.FastifyReply) {
            const roles = sqlite
                .prepare(`
                    SELECT r.level
                    FROM roles_user ru
                    INNER JOIN roles r
                        ON r.id = ru.role_id
                    WHERE ru.user_id = ?
                `)
                .all(request.user.id);
            const highestLevel = roles.reduce(
                (highest: number, role: any) =>
                    Math.max(
                        highest,
                        role.level
                    ),
                0
            );
            if (highestLevel < requiredLevel) {
                return reply.code(403).send({
                    message: "Forbidden"
                });
            }
        };
    }
);

server.register(settingsRoutes, {
    prefix: "/api"
});
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
    root: path.join(
        process.cwd(),
        "storage"
    ),
    prefix: "/storage/"
});
server.listen({
    port,
    host:
        process.env.FASTIFY_API_HOST ||
        "0.0.0.0"
});