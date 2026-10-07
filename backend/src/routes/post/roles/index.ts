import type { FastifyInstance } from "fastify";

const { sqlite } = require("../../../db/index");

async function users(fastify: FastifyInstance) {
    fastify.post("/role/new",
        {
            onRequest: [
                fastify.authenticate,
                fastify.authorize(3)
            ]
        },
        async (request, reply) => {

            const {
                name,
                level
            } = request.body as {
                name: string;
                level: number;
            };

            // Verifica se a role já existe

            const existingRole = sqlite
                .prepare(`
                    SELECT id
                    FROM roles
                    WHERE name = ?
                `)
                .get(name);

            if (existingRole) {
                return reply.code(409).send({
                    message: "Role already registered"
                });
            }

            // Cria a role

            const result = sqlite
                .prepare(`
                    INSERT INTO roles
                    (name, level)
                    VALUES (?, ?)
                `)
                .run(
                    name,
                    level
                );

            const roleId = Number(
                result.lastInsertRowid
            );

            // Busca a role criada

            const role = sqlite
                .prepare(`
                    SELECT
                        id,
                        name,
                        level
                    FROM roles
                    WHERE id = ?
                `)
                .get(roleId);

            return reply.code(201).send({
                message: "Role created successfully",
                data: role
            });
        }
    );
}

module.exports = users;