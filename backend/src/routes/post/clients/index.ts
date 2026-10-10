import type { FastifyInstance } from "fastify";

const { sqlite } = require("../../../db/index");

interface CreateClientBody {
    name?: string;
    address?: string | null;
}

function normalizeText(value: unknown, maxLength: number): string {
    return String(value ?? "")
        .replace(/[\u0000-\u001F\u007F]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxLength);
}

async function clients(fastify: FastifyInstance) {
    fastify.post(
        "/clients",
        { onRequest: [fastify.authenticate] },
        async (request, reply) => {
            const body = (request.body ?? {}) as CreateClientBody;

            const name = normalizeText(body.name, 150);
            // Endereço simplificado, usado somente para exibição nos documentos internos.
            const address = normalizeText(body.address, 250) || null;

            if (!name) {
                return reply.code(400).send({
                    message: "Informe o nome do cliente."
                });
            }

            try {
                const result = sqlite.prepare(
                    "INSERT INTO clients (name, address) VALUES (?, ?)"
                ).run(name, address);

                const client = sqlite.prepare(
                    "SELECT id, name, address FROM clients WHERE id = ?"
                ).get(Number(result.lastInsertRowid));

                return reply.code(201).send({
                    message: "Cliente cadastrado com sucesso.",
                    data: client
                });
            } catch (error: any) {
                if (String(error?.message ?? "").includes("UNIQUE constraint failed")) {
                    return reply.code(409).send({
                        message: "Não foi possível cadastrar o cliente porque um dos dados informados já está em uso."
                    });
                }

                request.log.error(
                    { err: error },
                    "Erro ao cadastrar cliente"
                );

                return reply.code(500).send({
                    message: "Não foi possível cadastrar o cliente."
                });
            }
        }
    );
}

module.exports = clients;
