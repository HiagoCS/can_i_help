import type { FastifyInstance } from "fastify";
const { sqlite } = require("../../../db/index");

async function users(fastify: FastifyInstance) {
    fastify.delete("/role/:id",
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

            // Busca a menor role que continuará
            // existindo no sistema
            const lowestRole = sqlite
                .prepare(`
                    SELECT id, name, level
                    FROM roles
                    WHERE id != ?
                    ORDER BY level ASC, id ASC
                    LIMIT 1
                `)
                .get(id);

            // Não permite excluir a última role
            // do sistema
            if (!lowestRole) {
                return reply.code(400).send({
                    message: "Cannot delete the last role"
                });
            }

            // Busca todos os usuários que possuem
            // a role que será excluída
            const users = sqlite
                .prepare(`
                    SELECT user_id
                    FROM roles_user
                    WHERE role_id = ?
                `)
                .all(id);

            // Remove as relações com a role excluída
            sqlite
                .prepare(`
                    DELETE FROM roles_user
                    WHERE role_id = ?
                `)
                .run(id);

            // Adiciona a role de menor level
            // aos usuários afetados
            const insertRole = sqlite
                .prepare(`
                    INSERT INTO roles_user
                    (role_id, user_id)
                    VALUES (?, ?)
                `);

            users.forEach((user: { user_id: number }) => {

                insertRole.run(
                    lowestRole.id,
                    user.user_id
                );

            });

            // Remove a role do sistema
            sqlite
                .prepare(`
                    DELETE FROM roles
                    WHERE id = ?
                `)
                .run(id);

            return {
                message: "Role deleted successfully",
                data: {
                    deletedRole: role,
                    replacementRole: lowestRole,
                    affectedUsers: users.length
                }
            };
        }
    );
}

module.exports = users;