import type { FastifyInstance } from "fastify";
const bcrypt = require("bcrypt");

const { sqlite } = require("../../../db/index");

async function users(fastify: FastifyInstance) {
    fastify.put("/user/:id",
        {
            onRequest: [fastify.authenticate]
        },
        async (request, reply) => {

            const { id } = request.params as {
                id: string;
            };

            const {
                email,
                password,
                avatar,
                roles
            } = request.body as {
                email?: string;
                password?: string;
                avatar?: string;
                roles?: number[];
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

            // Verifica se o novo email já pertence a outro usuário

            if (email) {

                const existingUser = sqlite
                    .prepare(`
                        SELECT id
                        FROM users
                        WHERE email = ?
                        AND id != ?
                    `)
                    .get(email, id);

                if (existingUser) {
                    return reply.code(409).send({
                        message: "Email already registered"
                    });
                }
            }

            let passwordHash: string | undefined;

            if (password) {
                passwordHash = await bcrypt.hash(
                    password,
                    10
                );
            }

            // Atualiza os dados do usuário

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

            // Atualiza as roles somente se roles foi enviado

            if (roles !== undefined) {

                const getRole = sqlite.prepare(`
                    SELECT id
                    FROM roles
                    WHERE id = ?
                `);

                // Verifica todas as roles antes de alterar

                for (const roleId of roles) {

                    const role = getRole.get(roleId);

                    if (!role) {
                        return reply.code(400).send({
                            message: `Role ${roleId} not found`
                        });
                    }
                }

                // Remove as roles atuais

                sqlite
                    .prepare(`
                        DELETE FROM roles_user
                        WHERE user_id = ?
                    `)
                    .run(id);

                // Adiciona as novas roles

                const insertRole = sqlite.prepare(`
                    INSERT INTO roles_user
                    (role_id, user_id)
                    VALUES (?, ?)
                `);

                for (const roleId of roles) {

                    insertRole.run(
                        roleId,
                        id
                    );
                }
            }

            const updatedUser = sqlite
                .prepare(`
                    SELECT id, email, avatar
                    FROM users
                    WHERE id = ?
                `)
                .get(id);

            const userRoles = sqlite
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
                message: "User updated successfully",
                data: {
                    ...updatedUser,
                    roles: userRoles
                }
            };
        }
    );
    fastify.put("/me",
        {
            onRequest: [fastify.authenticate]
        },
        async (request, reply) => {

            const { id } = request.user;

            const {
                email,
                password,
                avatar
            } = request.body as {
                email?: string;
                password?: string;
                avatar?: string;
            };

            // Verifica se o usuário existe

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

            // Verifica se o novo email já pertence
            // a outro usuário

            if (email) {

                const existingUser = sqlite
                    .prepare(`
                    SELECT id
                    FROM users
                    WHERE email = ?
                    AND id != ?
                `)
                    .get(email, id);

                if (existingUser) {
                    return reply.code(409).send({
                        message: "Email already registered"
                    });
                }
            }

            let passwordHash: string | undefined;

            if (password) {
                passwordHash = await bcrypt.hash(
                    password,
                    10
                );
            }

            // Atualiza somente os dados permitidos
            // pelo próprio usuário

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

            // Busca o usuário atualizado

            const updatedUser = sqlite
                .prepare(`
                SELECT
                    id,
                    email,
                    avatar
                FROM users
                WHERE id = ?
            `)
                .get(id);

            // Busca as roles do usuário

            const userRoles = sqlite
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
                message: "User updated successfully",
                data: {
                    ...updatedUser,
                    roles: userRoles
                }
            };
        }
    );
}

module.exports = users;