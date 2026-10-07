import type { FastifyInstance } from "fastify";

const { sqlite } = require("../../../db/index");

async function users(fastify: FastifyInstance) {

    fastify.get("/roles",
        {
            onRequest: [
                fastify.authenticate,
                fastify.authorize(3)
            ]
        },
        async () => {

            const roles = sqlite
                .prepare(`
                    SELECT
                        id,
                        name,
                        level
                    FROM roles
                    ORDER BY level DESC, name ASC
                `)
                .all();

            return {
                message: "Successful Request",
                data: roles
            };
        }
    );
    fastify.get("/roles/me",
        {
            onRequest: [fastify.authenticate]
        },
        async (request) => {

            const { id } = request.user as {
                id: number;
                email: string;
            };

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
                    ORDER BY r.level DESC, r.name ASC
                `)
                .all(id);

            return {
                message: "Successful Request",
                data: roles
            };
        }
    );
    fastify.get("/roles/:user_id",
        {
            onRequest: [
                fastify.authenticate,
                fastify.authorize(3)
            ]
        },
        async (request) => {

            const { user_id } = request.params as {
                user_id: string;
            };

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
                    ORDER BY r.level DESC, r.name ASC
                `)
                .all(user_id);

            return {
                message: "Successful Request",
                data: roles
            };
        }
    );
}

module.exports = users;