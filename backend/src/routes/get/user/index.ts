import type { FastifyInstance } from "fastify";
const { sqlite } = require("../../../db/index");

async function users(fastify: FastifyInstance) {

    fastify.get("/users",
        {
            onRequest: [fastify.authenticate]
        },
        async () => {

            const users = sqlite
                .prepare(`
                    SELECT id, email, avatar
                    FROM users
                `)
                .all();

            const getRoles = sqlite.prepare(`
                SELECT
                    r.id,
                    r.name,
                    r.level
                FROM roles_user ru
                INNER JOIN roles r
                    ON r.id = ru.role_id
                WHERE ru.user_id = ?
            `);

            const data = users.map((user: any) => {

                const roles = getRoles.all(user.id);

                return {
                    ...user,
                    roles
                };

            });

            return {
                message: "Successful Request",
                data
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

            const roles = sqlite
                .prepare(`
                    SELECT
                        r.id,
                        r.name,
                        r.level
                    FROM roles_user ru
                    INNER JOIN roles r
                        ON r.id = ru.role_id
                    WHERE ru.user_id = ?
                `)
                .all(id);

            return {
                message: "Successful Request",
                data: {
                    ...user,
                    roles
                }
            };
        }
    );

    fastify.get("/user/:id",
        {
            onRequest: [
                fastify.authenticate,
                fastify.authorize(3)
            ]
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

            const roles = sqlite
                .prepare(`
                    SELECT
                        r.id,
                        r.name,
                        r.level
                    FROM roles_user ru
                    INNER JOIN roles r
                        ON r.id = ru.role_id
                    WHERE ru.user_id = ?
                `)
                .all(id);

            return {
                message: "Successful Request",
                data: {
                    ...user,
                    roles
                }
            };
        }
    );
}

module.exports = users;