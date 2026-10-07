import type { FastifyInstance } from "fastify";
const { sqlite } = require("../../../db/index");

async function users(fastify: FastifyInstance) {

    fastify.get("/users",
        {
            onRequest: [fastify.authenticate]
        },
        async () => {
            const users = sqlite
                .prepare(`SELECT * FROM users`)
                .all();

            return {
                message: "Successful Request",
                data: users
            };
        }
    );

    fastify.get("/me",
        {
            onRequest: [fastify.authenticate]
        },
        async (request) => {
            const { id } = request.user as {
                id: number;
                email: string;
            };

            const user = sqlite
                .prepare(`
                SELECT id, email, avatar
                FROM users
                WHERE id = ?
            `)
                .get(id);

            return {
                message: "Successful Request",
                data: user
            };
        }
    );
    fastify.get("/user/:id",
        {
            onRequest: [fastify.authenticate]
        },
        async (request, reply) => {

            const { id } = request.params as {
                id: string;
            };

            const user = sqlite
                .prepare(`
                    SELECT id, email, avatar
                    FROM users
                    WHERE id = ?
                `)
                .get(id);

            if (!user) {
                return reply.code(404).send({
                    message: "User not found"
                });
            }

            return {
                message: "Successful Request",
                data: user
            };
        }
    );
}

module.exports = users;