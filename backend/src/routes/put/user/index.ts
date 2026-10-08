import type { FastifyInstance } from "fastify";
const bcrypt = require("bcrypt");

const { sqlite } = require("../../../db/index");

function getHighestRoleLevel(userId: number) {
    const result = sqlite.prepare(
        "SELECT COALESCE(MAX(r.level), 0) AS level FROM roles_user ru INNER JOIN roles r ON r.id = ru.role_id WHERE ru.user_id = ?"
    ).get(userId) as { level: number };

    return Number(result?.level) || 0;
}

async function users(fastify: FastifyInstance) {
    fastify.put("/user/:id",
        {
            onRequest: [fastify.authenticate, fastify.authorize(2)]
        },
        async (request, reply) => {

            const { id } = request.params as {
                id: string;
            };

            const {
                email,
                password,
                avatar,
                status,
                roles
            } = request.body as {
                email?: string;
                password?: string;
                avatar?: string;
                status?: boolean | number;
                roles?: number[];
            };


            const targetId = Number(id);
            const callerLevel = getHighestRoleLevel(request.user.id);
            if (roles !== undefined && targetId === request.user.id) {
                return reply.code(403).send({ message: "Não é permitido alterar as próprias permissões por esta tela." });
            }
            const validStatuses: Array<boolean | number> = [true, false, 0, 1];
            if (status !== undefined && !validStatuses.some((value) => value === status)) {
                return reply.code(400).send({ message: "Status inválido." });
            }
            if (status !== undefined && !Boolean(status) && targetId === request.user.id) {
                return reply.code(403).send({ message: "Não é permitido desativar a própria conta." });
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
            const targetLevel = getHighestRoleLevel(targetId);
            if (callerLevel < 3 && targetLevel > callerLevel) {
                return reply.code(403).send({ message: "Seu nível não permite alterar um usuário com acesso superior." });
            }
            if (roles !== undefined) {
                if (!Array.isArray(roles) || roles.some((roleId) => !Number.isInteger(roleId)) || new Set(roles).size !== roles.length) {
                    return reply.code(400).send({ message: "Lista de roles inválida." });
                }

                const roleLookup = sqlite.prepare("SELECT id, level FROM roles WHERE id = ?");
                const requestedRoles = roles.map((roleId) => roleLookup.get(roleId) as { id: number; level: number } | undefined);
                if (requestedRoles.some((role) => !role)) {
                    return reply.code(400).send({ message: "Uma ou mais roles não existem." });
                }
                if (callerLevel < 3 && requestedRoles.some((role) => Number(role?.level) > callerLevel)) {
                    return reply.code(403).send({ message: "Seu nível não permite conceder uma role superior." });
                }
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
            const statusValue = status === undefined ? null : Number(Boolean(status));

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
                        avatar = COALESCE(?, avatar),
                        status = COALESCE(?, status)
                    WHERE id = ?
                `)
                .run(
                    email ?? null,
                    passwordHash ?? null,
                    avatar ?? null,
                    statusValue,
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
                    SELECT id, email, avatar, status
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