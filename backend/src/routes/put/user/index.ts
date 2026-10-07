import type { FastifyInstance } from "fastify";

const { sqlite } = require("../../../db/index");
const bcrypt = require("bcrypt");

async function users(fastify: FastifyInstance) {
     fastify.put("/user/:id",
        {
            onRequest: [fastify.authenticate]
        },
        async (request, reply) => {

            const { id } = request.params as {
                id: string;
            };

            const { email, password, avatar } = request.body as {
                email?: string;
                password?: string;
                avatar?: string;
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

            let passwordHash: string | undefined;

            if (password) {
                passwordHash = await bcrypt.hash(password, 10);
            }

            sqlite
                .prepare(`
                    UPDATE users
                    SET
                        email = COALESCE(?, email),
                        password = COALESCE(?, password),
                        avatar = COALESCE(?, avatar)
                    WHERE id = ?
                `)
                .run(
                    email ?? null,
                    passwordHash ?? null,
                    avatar ?? null,
                    id
                );

            const updatedUser = sqlite
                .prepare(`
                    SELECT id, email, avatar
                    FROM users
                    WHERE id = ?
                `)
                .get(id);

            return {
                message: "User updated successfully",
                data: updatedUser
            };
        }
    );
}
module.exports = users;