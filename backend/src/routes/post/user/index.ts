
import type { FastifyInstance } from "fastify";

const bcrypt = require("bcrypt");
const { sqlite } = require("../../../db/index");

/*
 * Controla transações utilizando a API DatabaseSync do node:sqlite.
 * Caso alguma operação falhe, as alterações são revertidas.
 */
function withSqliteTransaction<T>(callback: () => T): T {
    let transactionStarted = false;

    try {
        sqlite.exec("BEGIN IMMEDIATE");
        transactionStarted = true;

        const result = callback();

        sqlite.exec("COMMIT");
        transactionStarted = false;

        return result;
    } catch (error) {
        if (transactionStarted) {
            try {
                sqlite.exec("ROLLBACK");
            } catch (rollbackError) {
                console.error(
                    "Erro ao desfazer a transação SQLite:",
                    rollbackError
                );
            }
        }

        throw error;
    }
}

function getHighestRoleLevel(userId: number) {
    const result = sqlite.prepare(
        "SELECT COALESCE(MAX(r.level), 0) AS level FROM roles_user ru INNER JOIN roles r ON r.id = ru.role_id WHERE ru.user_id = ?"
    ).get(userId) as { level: number };

    return Number(result?.level) || 0;
}

async function users(fastify: FastifyInstance) {
    fastify.post(
        "/login",
        async (request, reply) => {
            const jwt = (fastify as any).jwt;

            const { email, password } = request.body as {
                email: string;
                password: string;
            };

            const user = sqlite
                .prepare(`
                    SELECT *
                    FROM users
                    WHERE email = ?
                `)
                .get(email);

            if (!user) {
                return reply.code(401).send({
                    message: "Invalid email or password"
                });
            }

            if (!user.status) {
                return reply.code(403).send({
                    message: "Esta conta está inativa. Procure um administrador."
                });
            }

            const passwordValid = await bcrypt.compare(
                password,
                user.password
            );

            if (!passwordValid) {
                return reply.code(401).send({
                    message: "Invalid email or password"
                });
            }

            const token = jwt.sign({
                id: user.id,
                email: user.email
            });

            reply.setCookie("token", token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "lax",
                path: "/"
            });

            return {
                message: "Successful Request",
                data: {
                    user: {
                        id: user.id,
                        email: user.email,
                        avatar: user.avatar
                    }
                }
            };
        }
    );

    /*
     * Cadastro inicial do proprietário do sistema.
     * Essa rota é pública para permitir a primeira configuração.
     */

    fastify.post(
        "/auth/register",
        async (request, reply) => {
            try {
                let email = "";
                let password = "";
                let avatar: string | null = null;

                let avatarError: {
                    statusCode: number;
                    message: string;
                } | null = null;

                const maxAvatarSize = 5 * 1024 * 1024;

                const allowedImageTypes = [
                    "image/jpeg",
                    "image/png",
                    "image/webp",
                    "image/gif"
                ];

                for await (const part of request.parts()) {
                    if (part.type === "file") {
                        if (part.fieldname !== "avatar") {
                            for await (const _chunk of part.file) {
                                // Consome arquivos não utilizados.
                            }

                            continue;
                        }

                        if (!allowedImageTypes.includes(part.mimetype)) {
                            for await (const _chunk of part.file) {
                                // Consome o arquivo inválido.
                            }

                            avatarError = {
                                statusCode: 400,
                                message:
                                    "O avatar precisa ser uma imagem PNG, JPEG, WEBP ou GIF."
                            };

                            continue;
                        }

                        const chunks: Buffer[] = [];
                        let fileSize = 0;

                        for await (const chunk of part.file) {
                            const buffer = Buffer.from(chunk);

                            fileSize += buffer.length;

                            if (fileSize <= maxAvatarSize) {
                                chunks.push(buffer);
                            }
                        }

                        if (
                            part.file.truncated ||
                            fileSize > maxAvatarSize
                        ) {
                            avatarError = {
                                statusCode: 413,
                                message:
                                    "O avatar não pode ultrapassar 5 MB."
                            };

                            continue;
                        }

                        avatar =
                            `data:${part.mimetype};base64,` +
                            Buffer.concat(chunks).toString("base64");
                    } else {
                        if (part.fieldname === "email") {
                            email = String(part.value).trim();
                        }

                        if (part.fieldname === "password") {
                            password = String(part.value);
                        }
                    }
                }

                if (avatarError) {
                    return reply.code(avatarError.statusCode).send({
                        message: avatarError.message
                    });
                }

                if (!email || !password) {
                    return reply.code(400).send({
                        message: "E-mail e senha são obrigatórios."
                    });
                }

                if (
                    email.length > 254 ||
                    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
                ) {
                    return reply.code(400).send({
                        message: "Informe um endereço de e-mail válido."
                    });
                }

                if (password.length < 8) {
                    return reply.code(400).send({
                        message: "A senha deve ter pelo menos 8 caracteres."
                    });
                }

                const passwordHash = await bcrypt.hash(password, 10);

                type OwnerRole = {
                    id: number;
                    name: string;
                    level: number;
                };

                type RegistrationResult =
                    | { status: "configured" }
                    | { status: "email_exists" }
                    | { status: "owner_role_invalid" }
                    | {
                        status: "created";
                        user: {
                            id: number;
                            email: string;
                            avatar: string | null;
                            roles: OwnerRole[];
                        };
                    };

                /*
                 * Verifica se o sistema já possui um administrador.
                 * Se não possuir, garante que a role Proprietário exista
                 * antes de criar o usuário e associá-lo a ela.
                 */
                const registration = withSqliteTransaction(
                    (): RegistrationResult => {
                        const administrator = sqlite.prepare(`
                        SELECT 1 AS found
                        FROM users AS u
                        INNER JOIN roles_user AS ru
                            ON ru.user_id = u.id
                        INNER JOIN roles AS r
                            ON r.id = ru.role_id
                        WHERE r.level >= 3
                          AND LOWER(TRIM(r.name)) <> 'developer'
                        LIMIT 1
                    `).get();

                        if (administrator) {
                            return {
                                status: "configured"
                            };
                        }

                        const existingUser = sqlite.prepare(`
                        SELECT id
                        FROM users
                        WHERE LOWER(email) = LOWER(?)
                        LIMIT 1
                    `).get(email);

                        if (existingUser) {
                            return {
                                status: "email_exists"
                            };
                        }

                        /*
                         * Procura a role pelo nome, independentemente do nível.
                         * Isso evita tentar inserir um nome que já é UNIQUE.
                         */
                        const existingOwnerRole = sqlite.prepare(`
                        SELECT id, name, level, status
                        FROM roles
                        WHERE LOWER(TRIM(name)) = LOWER(?)
                        LIMIT 1
                    `).get("Proprietário") as {
                            id: number;
                            name: string;
                            level: number;
                            status: number | boolean;
                        } | undefined;

                        let ownerRole: OwnerRole;

                        if (existingOwnerRole) {
                            /*
                             * Não altera automaticamente uma role existente
                             * de nível incorreto, pois outros usuários podem
                             * estar associados a ela.
                             */
                            if (
                                Number(existingOwnerRole.level) !== 3 ||
                                !existingOwnerRole.status
                            ) {
                                return {
                                    status: "owner_role_invalid"
                                };
                            }

                            ownerRole = {
                                id: existingOwnerRole.id,
                                name: existingOwnerRole.name,
                                level: Number(existingOwnerRole.level)
                            };
                        } else {
                            /*
                             * Cria a role Proprietário quando ela ainda
                             * não existe. O SQLite gera o ID automaticamente.
                             */
                            const roleResult = sqlite.prepare(`
                            INSERT INTO roles
                                (name, level, status)
                            VALUES (?, ?, ?)
                        `).run(
                                "Proprietário",
                                3,
                                1
                            );

                            ownerRole = {
                                id: Number(roleResult.lastInsertRowid),
                                name: "Proprietário",
                                level: 3
                            };
                        }

                        const userResult = sqlite.prepare(`
                        INSERT INTO users
                            (email, password, avatar, status)
                        VALUES (?, ?, ?, 1)
                    `).run(
                            email,
                            passwordHash,
                            avatar
                        );

                        const userId = Number(
                            userResult.lastInsertRowid
                        );

                        sqlite.prepare(`
                        INSERT INTO roles_user
                            (role_id, user_id)
                        VALUES (?, ?)
                    `).run(
                            ownerRole.id,
                            userId
                        );

                        return {
                            status: "created",
                            user: {
                                id: userId,
                                email,
                                avatar,
                                roles: [ownerRole]
                            }
                        };
                    }
                );

                if (registration.status === "configured") {
                    return reply.code(403).send({
                        message:
                            "O cadastro inicial já foi concluído."
                    });
                }

                if (registration.status === "email_exists") {
                    return reply.code(409).send({
                        message:
                            "Este e-mail já está cadastrado."
                    });
                }

                if (registration.status === "owner_role_invalid") {
                    request.log.error(
                        "A role Proprietário existe, mas está inativa ou não possui nível 3."
                    );

                    return reply.code(409).send({
                        message:
                            "A role Proprietário já existe, mas precisa estar ativa e configurada com nível 3."
                    });
                }

                return reply.code(201).send({
                    message:
                        "Usuário proprietário cadastrado com sucesso.",
                    data: registration.user
                });
            } catch (error) {
                const errorCode =
                    typeof error === "object" &&
                        error !== null &&
                        "code" in error
                        ? String(error.code)
                        : "";

                if (errorCode === "FST_REQ_FILE_TOO_LARGE") {
                    return reply.code(413).send({
                        message:
                            "O avatar não pode ultrapassar 5 MB."
                    });
                }

                request.log.error(error);

                return reply.code(500).send({
                    message:
                        "Não foi possível concluir o cadastro."
                });
            }
        }
    );


    fastify.post(
        "/user/new",
        {
            onRequest: [
                fastify.authenticate,
                fastify.authorize(2)
            ]
        },
        async (request, reply) => {
            const {
                email,
                password,
                avatar,
                roles
            } = request.body as {
                email: string;
                password: string;
                avatar?: string;
                roles: number[];
            };

            const callerLevel = getHighestRoleLevel(
                request.user.id
            );

            if (
                !Array.isArray(roles) ||
                roles.some((roleId) => !Number.isInteger(roleId)) ||
                new Set(roles).size !== roles.length
            ) {
                return reply.code(400).send({
                    message: "Lista de roles inválida."
                });
            }

            const roleLookup = sqlite.prepare(
                "SELECT id, level FROM roles WHERE id = ?"
            );

            const requestedRoles = roles.map(
                (roleId) => roleLookup.get(roleId) as {
                    id: number;
                    level: number;
                } | undefined
            );

            if (requestedRoles.some((role) => !role)) {
                return reply.code(400).send({
                    message: "Uma ou mais roles não existem."
                });
            }

            if (
                callerLevel < 3 &&
                requestedRoles.some(
                    (role) => Number(role?.level) > callerLevel
                )
            ) {
                return reply.code(403).send({
                    message: "Seu nível não permite conceder uma role superior."
                });
            }

            const existingUser = sqlite
                .prepare(`
                    SELECT id
                    FROM users
                    WHERE email = ?
                `)
                .get(email);

            if (existingUser) {
                return reply.code(409).send({
                    message: "Email already registered"
                });
            }

            const passwordHash = await bcrypt.hash(
                password,
                10
            );

            const result = sqlite
                .prepare(`
                    INSERT INTO users
                    (email, password, avatar, status)
                    VALUES (?, ?, ?, 1)
                `)
                .run(
                    email,
                    passwordHash,
                    avatar ?? null
                );

            const userId = Number(
                result.lastInsertRowid
            );

            // Verifica e associa as roles ao usuário criado.
            if (roles?.length) {
                const getRole = sqlite.prepare(`
                    SELECT id
                    FROM roles
                    WHERE id = ?
                `);

                const insertRole = sqlite.prepare(`
                    INSERT INTO roles_user
                    (role_id, user_id)
                    VALUES (?, ?)
                `);

                for (const roleId of roles) {
                    const role = getRole.get(roleId);

                    if (!role) {
                        return reply.code(400).send({
                            message: `Role ${roleId} not found`
                        });
                    }

                    insertRole.run(
                        roleId,
                        userId
                    );
                }
            }

            const user = sqlite
                .prepare(`
                    SELECT id, email, avatar
                    FROM users
                    WHERE id = ?
                `)
                .get(userId);

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
                .all(userId);

            return reply.code(201).send({
                message: "User created successfully",
                data: {
                    ...user,
                    roles: userRoles
                }
            });
        }
    );

    fastify.post(
        "/logout",
        {
            onRequest: [fastify.authenticate]
        },
        async (request, reply) => {
            reply.clearCookie("token", {
                path: "/"
            });

            return {
                message: "Logout successful"
            };
        }
    );
}

module.exports = users;
