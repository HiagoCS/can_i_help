import type { FastifyInstance } from "fastify";

const { sqlite } = require("../../../db/index");

async function roles(fastify: FastifyInstance) {
    fastify.put("/role/:id",
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

            const {
                name,
                level
            } = request.body as {
                name?: string;
                level?: number;
            };

            // Verifica se a role existe

            const role = sqlite
                .prepare(`
                    SELECT id, name, level
                    FROM roles
                    WHERE id = ?
                `)
                .get(id);

            if (!role) {
                return reply.code(404).send({
                    message: "Role not found"
                });
            }

            // Verifica se o novo nome já pertence
            // a outra role

            if (name) {

                const existingRole = sqlite
                    .prepare(`
                        SELECT id
                        FROM roles
                        WHERE name = ?
                        AND id != ?
                    `)
                    .get(name, id);

                if (existingRole) {
                    return reply.code(409).send({
                        message: "Role name already registered"
                    });
                }
            }

            // Atualiza a role

            sqlite
                .prepare(`
                    UPDATE roles
                    SET
                        name = COALESCE(?, name),
                        level = COALESCE(?, level)
                    WHERE id = ?
                `)
                .run(
                    name ?? null,
                    level ?? null,
                    id
                );

            // Busca a role atualizada

            const updatedRole = sqlite
                .prepare(`
                    SELECT
                        id,
                        name,
                        level
                    FROM roles
                    WHERE id = ?
                `)
                .get(id);

            return {
                message: "Role updated successfully",
                data: updatedRole
            };
        }
    );
}

module.exports = roles;