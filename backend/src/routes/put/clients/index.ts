import type { FastifyInstance } from "fastify";

const { sqlite } = require("../../../db/index");
type ClientEditableFields = {
    name: string;
    cpf: string | null;
    cnpj: string | null;
    ie: string | null;
    address: string | null;
    number: string | null;
    complement: string | null;
    neighborhood: string | null;
    city: string | null;
    city_ibge: string | null;
    state: string | null;
    zip_code: string | null;
};

function normalizeDigits(value: string): string {
    return value.replace(/\D/g, "");
}

function normalizeOptionalText(value: unknown): string | null {
    if (value === null || value === undefined) {
        return null;
    }

    if (typeof value !== "string") {
        throw new Error("Os campos de texto devem conter valores válidos.");
    }

    const normalized = value.trim();

    return normalized || null;
}

function normalizeClientPayload(
    body: Record<string, unknown>
): ClientEditableFields {
    const name = normalizeOptionalText(body.name);

    if (!name) {
        throw new Error("Informe o nome ou a razão social do cliente.");
    }

    if (name.length > 160) {
        throw new Error("O nome do cliente deve ter no máximo 160 caracteres.");
    }

    const rawCpf = normalizeOptionalText(body.cpf);
    const rawCnpj = normalizeOptionalText(body.cnpj);

    const cpf = rawCpf ? normalizeDigits(rawCpf) : null;
    const cnpj = rawCnpj ? normalizeDigits(rawCnpj) : null;

    if (cpf && cpf.length !== 11) {
        throw new Error("O CPF deve conter 11 dígitos.");
    }

    if (cnpj && cnpj.length !== 14) {
        throw new Error("O CNPJ deve conter 14 dígitos.");
    }

    const ie = normalizeOptionalText(body.ie);
    const address = normalizeOptionalText(body.address);
    const number = normalizeOptionalText(body.number);
    const complement = normalizeOptionalText(body.complement);
    const neighborhood = normalizeOptionalText(body.neighborhood);
    const city = normalizeOptionalText(body.city);

    const rawCityIbge = normalizeOptionalText(body.city_ibge);
    const cityIbge = rawCityIbge
        ? normalizeDigits(rawCityIbge)
        : null;

    const rawState = normalizeOptionalText(body.state);
    const state = rawState
        ? rawState.toUpperCase()
        : null;

    const rawZipCode = normalizeOptionalText(body.zip_code);
    const zipCode = rawZipCode
        ? normalizeDigits(rawZipCode)
        : null;

    const fields: Array<[string, string | null, number]> = [
        ["Inscrição Estadual", ie, 30],
        ["Endereço", address, 180],
        ["Número", number, 20],
        ["Complemento", complement, 100],
        ["Bairro", neighborhood, 100],
        ["Cidade", city, 100],
        ["Estado", state, 2]
    ];

    for (const [label, value, maxLength] of fields) {
        if (value && value.length > maxLength) {
            throw new Error(
                `${label} deve ter no máximo ${maxLength} caracteres.`
            );
        }
    }

    if (cityIbge && !/^\d{7}$/.test(cityIbge)) {
        throw new Error(
            "O código IBGE do município deve conter 7 dígitos."
        );
    }

    if (state && !/^[A-Z]{2}$/.test(state)) {
        throw new Error(
            "Informe uma sigla de estado válida com 2 letras."
        );
    }

    if (zipCode && !/^\d{8}$/.test(zipCode)) {
        throw new Error("O CEP deve conter 8 dígitos.");
    }

    return {
        name,
        cpf,
        cnpj,
        ie,
        address,
        number,
        complement,
        neighborhood,
        city,
        city_ibge: cityIbge,
        state,
        zip_code: zipCode
    };
}
async function clients(fastify: FastifyInstance) {

    // ============================================================
    // UPDATE CLIENT
    // PUT /clients/:clientId
    //
    // Atualiza todos os campos editáveis.
    // method_id não é alterado.
    // ============================================================

    fastify.put(
        "/clients/:clientId",
        {
            onRequest: [
                fastify.authenticate,
                fastify.authorize(3)
            ]
        },
        async (request, reply) => {
            const { clientId: clientIdParam } = request.params as {
                clientId: string;
            };

            const clientId = Number(clientIdParam);

            if (
                !Number.isSafeInteger(clientId) ||
                clientId <= 0
            ) {
                return reply.code(400).send({
                    message: "O identificador do cliente é inválido."
                });
            }

            const currentClient = sqlite
                .prepare(`
                    SELECT id
                    FROM clients
                    WHERE id = ?
                    LIMIT 1
                `)
                .get(clientId);

            if (!currentClient) {
                return reply.code(404).send({
                    message: "Cliente não encontrado."
                });
            }

            if (
                request.body === null ||
                typeof request.body !== "object" ||
                Array.isArray(request.body)
            ) {
                return reply.code(400).send({
                    message: "Informe os dados válidos do cliente."
                });
            }

            let payload: ClientEditableFields;

            try {
                payload = normalizeClientPayload(
                    request.body as Record<string, unknown>
                );
            } catch (error) {
                return reply.code(400).send({
                    message: error instanceof Error
                        ? error.message
                        : "Os dados enviados são inválidos."
                });
            }

            // ----------------------------------------------------
            // VALIDAR CPF ÚNICO
            // ----------------------------------------------------

            if (payload.cpf) {
                const existingCpf = sqlite
                    .prepare(`
                        SELECT id
                        FROM clients
                        WHERE id <> ?
                          AND cpf IS NOT NULL
                          AND REPLACE(
                              REPLACE(
                                  REPLACE(
                                      REPLACE(cpf, '.', ''),
                                      '-',
                                      ''
                                  ),
                                  '/',
                                  ''
                              ),
                              ' ',
                              ''
                          ) = ?
                        LIMIT 1
                    `)
                    .get(clientId, payload.cpf);

                if (existingCpf) {
                    return reply.code(409).send({
                        message: "Este CPF já está cadastrado em outro cliente."
                    });
                }
            }

            // ----------------------------------------------------
            // VALIDAR CNPJ ÚNICO
            // ----------------------------------------------------

            if (payload.cnpj) {
                const existingCnpj = sqlite
                    .prepare(`
                        SELECT id
                        FROM clients
                        WHERE id <> ?
                          AND cnpj IS NOT NULL
                          AND REPLACE(
                              REPLACE(
                                  REPLACE(
                                      REPLACE(cnpj, '.', ''),
                                      '-',
                                      ''
                                  ),
                                  '/',
                                  ''
                              ),
                              ' ',
                              ''
                          ) = ?
                        LIMIT 1
                    `)
                    .get(clientId, payload.cnpj);

                if (existingCnpj) {
                    return reply.code(409).send({
                        message: "Este CNPJ já está cadastrado em outro cliente."
                    });
                }
            }

            // ----------------------------------------------------
            // ATUALIZAR CAMPOS EDITÁVEIS
            // ----------------------------------------------------
            //
            // method_id fica fora do UPDATE intencionalmente.

            try {
                sqlite
                    .prepare(`
                        UPDATE clients
                        SET
                            name = ?,
                            cpf = ?,
                            cnpj = ?,
                            ie = ?,
                            address = ?,
                            number = ?,
                            complement = ?,
                            neighborhood = ?,
                            city = ?,
                            city_ibge = ?,
                            state = ?,
                            zip_code = ?
                        WHERE id = ?
                    `)
                    .run(
                        payload.name,
                        payload.cpf,
                        payload.cnpj,
                        payload.ie,
                        payload.address,
                        payload.number,
                        payload.complement,
                        payload.neighborhood,
                        payload.city,
                        payload.city_ibge,
                        payload.state,
                        payload.zip_code,
                        clientId
                    );
            } catch (error) {
                request.log.error(
                    error,
                    `Falha ao atualizar o cliente ${clientId}.`
                );

                return reply.code(409).send({
                    message:
                        "Não foi possível atualizar o cliente. " +
                        "Verifique se CPF ou CNPJ já estão cadastrados."
                });
            }

            const updatedClient = sqlite
                .prepare(`
                    SELECT
                        id,
                        name,
                        cpf,
                        cnpj,
                        ie,
                        address,
                        number,
                        complement,
                        neighborhood,
                        city,
                        city_ibge,
                        state,
                        zip_code
                    FROM clients
                    WHERE id = ?
                    LIMIT 1
                `)
                .get(clientId);

            return {
                message: "Cliente atualizado com sucesso.",
                data: updatedClient
            };
        }
    );

}

module.exports = clients;