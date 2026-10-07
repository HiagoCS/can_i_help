import type { FastifyInstance } from "fastify";

const { sqlite } = require("../../../db/index");
const bcrypt = require("bcrypt");

async function users(fastify: FastifyInstance) {
    fastify.delete("/user/:id",
        {
            onRequest: [fastify.authenticate]
        },
        async (request, reply) => {

            const { id } = request.params as {
                id: string;
            };

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