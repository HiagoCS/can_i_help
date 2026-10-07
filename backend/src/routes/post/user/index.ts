import type { FastifyInstance } from "fastify";

const { sqlite } = require("../../../db/index");
const bcrypt = require("bcrypt");

async function users(fastify: FastifyInstance) {

    fastify.post("/login", 
        async (request, reply) => {
        const jwt = (fastify as any).jwt;

        const { email, password } = request.body as {
            email: string;
            password: string;
        };

        const user = sqlite
            .prepare(`SELECT * FROM users WHERE email = ?`)
            .get(email);

        if (!user) {
            return reply.code(401).send({
                message: "Invalid email or password"
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
    });
    fastify.post("/user/new",
        {
            onRequest: [fastify.authenticate]
        },
        async (request, reply) => {

            const { email, password, avatar } = request.body as {
                email: string;
                password: string;
                avatar?: string;
            };

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

            const passwordHash = await bcrypt.hash(password, 10);

            const result = sqlite
                .prepare(`
                    INSERT INTO users (email, password, avatar)
                    VALUES (?, ?, ?)
                `)
                .run(
                    email,
                    passwordHash,
                    avatar ?? null
                );

            const user = sqlite
                .prepare(`
                    SELECT id, email, avatar
                    FROM users
                    WHERE id = ?
                `)
                .get(result.lastInsertRowid);

            return reply.code(201).send({
                message: "User created successfully",
                data: user
            });
        }
    );
    fastify.post("/logout",
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