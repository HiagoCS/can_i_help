import type { FastifyInstance } from "fastify";

const { sqlite } = require("../../../db/index");

async function users(fastify: FastifyInstance) {

    fastify.delete("/user/:id",
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

            // Impede o usuário de excluir a própria conta

            if (Number(id) === request.user.id) {
                return reply.code(403).send({
                    message: "You cannot delete your own user"
                });
            }

            const user = sqlite
                .prepare(`
                    SELECT id
                    FROM users
                    WHERE id = ?
                `)
                .get(id);

            if (!user) {
                return reply.code(404).send({
                    message: "User not found"
                });
            }

            // Remove as relações do usuário com as roles

            sqlite
                .prepare(`
                    DELETE FROM roles_user
                    WHERE user_id = ?
                `)
                .run(id);

            // Remove o usuário

            sqlite
                .prepare(`
                    DELETE FROM users
                    WHERE id = ?
                `)
                .run(id);

            return {
                message: "User deleted successfully"
            };
        }
    );
}

module.exports = users;