import type { FastifyInstance } from "fastify";

const { sqlite } = require("../../../db/index");

function normalizeTaxId(value: unknown) {
    return String(value ?? "").replace(/\D/g, "");
}

function isValidCpf(value: string) {
    if (value.length !== 11 || /^(\d)\1{10}$/.test(value)) return false;

    const digits = value.split("").map(Number);
    const first = (digits.slice(0, 9).reduce((sum, digit, index) => sum + digit * (10 - index), 0) * 10) % 11 % 10;
    const second = (digits.slice(0, 10).reduce((sum, digit, index) => sum + digit * (11 - index), 0) * 10) % 11 % 10;

    return first === digits[9] && second === digits[10];
}

async function clients(fastify: FastifyInstance) {
    fastify.post(
        "/clients",
        { onRequest: [fastify.authenticate] },
        async (request, reply) => {
            const body = request.body as {
                name?: string;
                cpf?: string | null;
            };

            const name = String(body?.name ?? "").trim();
            const cpf = normalizeTaxId(body?.cpf) || null;

            if (!name) {
                return reply.code(400).send({ message: "Informe o nome do cliente." });
            }
            if (cpf && !isValidCpf(cpf)) {
                return reply.code(400).send({ message: "Informe um CPF válido ou deixe o campo vazio." });
            }

            if (cpf) {
                const duplicateCpf = sqlite.prepare(
                    "SELECT id FROM clients " +
                    "WHERE REPLACE(REPLACE(REPLACE(REPLACE(cpf, '.', ''), '-', ''), '/', ''), ' ', '') = ? " +
                    "OR REPLACE(REPLACE(REPLACE(REPLACE(cnpj, '.', ''), '-', ''), '/', ''), ' ', '') = ? " +
                    "LIMIT 1"
                ).get(cpf, cpf);

                if (duplicateCpf) {
                    return reply.code(409).send({ message: "Este CPF já está associado a outro cliente." });
                }
            }

            try {
                const result = sqlite.prepare(
                    "INSERT INTO clients (name, cpf) VALUES (?, ?)"
                ).run(name, cpf);

                const client = sqlite.prepare(
                    "SELECT id, name, cpf, cnpj FROM clients WHERE id = ?"
                ).get(Number(result.lastInsertRowid));

                return reply.code(201).send({
                    message: "Cliente cadastrado com sucesso.",
                    data: client
                });
            } catch (error: any) {
                if (String(error?.message ?? "").includes("UNIQUE constraint failed")) {
                    return reply.code(409).send({ message: "Este CPF já está associado a outro cliente." });
                }
                request.log.error(error);
                return reply.code(500).send({ message: "Não foi possível cadastrar o cliente." });
            }
        }
    );
}

module.exports = clients;