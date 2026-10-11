import type { FastifyInstance } from "fastify";

const { createWriteStream } = require("node:fs");
const { mkdtemp, rm, stat } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { pipeline } = require("node:stream/promises");

const crypto = require("node:crypto");
const { Buffer } = require("node:buffer");
const { DatabaseSync } = require("node:sqlite");
const { sqlite } = require("../../../db/index");

const maximumCertificateSize = 8 * 1024 * 1024;
const maximumDatabaseSize = 512 * 1024 * 1024;
const taxRegimes = ["SIMPLES_NACIONAL", "REGIME_NORMAL"];

interface SystemConfigRoleInput {
    id?: number | null;
    name: string;
    level: number;
    status?: boolean | number;
}

interface SystemConfigRoleRecord {
    id: number;
    name: string;
    level: number;
    status: number;
}

interface SystemConfigUnitMeasureInput {
    unity: string;
    description?: string | null;
}

interface SystemConfigUnitMeasureRecord {
    id: number;
    unity: string;
    description: string | null;
}

function cleanText(value: unknown, maximumLength = 180) {
    return typeof value === "string"
        ? value.trim().slice(0, maximumLength)
        : "";
}

function certificateKey() {
    const secret =
        process.env.CERTIFICATE_ENCRYPTION_KEY ||
        process.env.JWT_SECRET;

    if (!secret) {
        throw new Error(
            "Configure CERTIFICATE_ENCRYPTION_KEY ou JWT_SECRET."
        );
    }

    return crypto
        .createHash("sha256")
        .update("posso-ajudar:fiscal-certificate:v1:" + secret)
        .digest();
}

function encryptCertificateValue(value: string) {
    const iv = crypto.randomBytes(12);

    const cipher = crypto.createCipheriv(
        "aes-256-gcm",
        certificateKey(),
        iv
    );

    const encrypted = Buffer.concat([
        cipher.update(value, "utf8"),
        cipher.final()
    ]);

    return [
        "v1",
        iv.toString("base64"),
        cipher.getAuthTag().toString("base64"),
        encrypted.toString("base64")
    ].join(":");
}

function parseValidityDate(value: string, endOfDay = false) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

    if (!match) return Number.NaN;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    const timestamp = Date.UTC(year, month - 1, day);
    const parsed = new Date(timestamp);

    if (
        parsed.getUTCFullYear() !== year ||
        parsed.getUTCMonth() !== month - 1 ||
        parsed.getUTCDate() !== day
    ) {
        return Number.NaN;
    }

    return endOfDay ? timestamp + 86_399_999 : timestamp;
}

function validDateRange(
    validFrom: unknown,
    validUntil: unknown
) {
    const start = cleanText(validFrom, 32);
    const end = cleanText(validUntil, 32);

    const startDate = parseValidityDate(start);
    const endDate = parseValidityDate(end, true);

    return Boolean(
        start &&
        end &&
        Number.isFinite(startDate) &&
        Number.isFinite(endDate) &&
        startDate <= endDate
    );
}

function isCurrentCertificate(
    status: number,
    validFrom: string | null,
    validUntil: string | null
) {
    const now = Date.now();

    const start = validFrom
        ? parseValidityDate(validFrom)
        : Number.NaN;

    const end = validUntil
        ? parseValidityDate(validUntil, true)
        : Number.NaN;

    return Boolean(
        status &&
        Number.isFinite(start) &&
        Number.isFinite(end) &&
        start <= now &&
        end >= now
    );
}

function getCertificateMetadata(companyId: number) {
    const certificate = sqlite.prepare(
        `SELECT
            status,
            valid_from,
            valid_until,
            certificate
         FROM fiscal_certificates
         WHERE company_id = ?
         ORDER BY id DESC
         LIMIT 1`
    ).get(companyId) as {
        status: number;
        valid_from: string | null;
        valid_until: string | null;
        certificate: string;
    } | undefined;

    if (!certificate) {
        return {
            exists: false,
            status: false,
            valid_from: null,
            valid_until: null,
            is_valid: false
        };
    }

    return {
        exists: Boolean(certificate.certificate),
        status: Boolean(certificate.status),
        valid_from: certificate.valid_from,
        valid_until: certificate.valid_until,
        is_valid: isCurrentCertificate(
            certificate.status,
            certificate.valid_from,
            certificate.valid_until
        )
    };
}

function getCurrentCompany() {
    return sqlite.prepare(
        "SELECT * FROM company ORDER BY id LIMIT 1"
    ).get() as Record<string, any> | undefined;
}

function getCurrentFiscalConfig(companyId: number) {
    return sqlite.prepare(
        `SELECT *
         FROM fiscal_config
         WHERE company_id = ?
         ORDER BY id
         LIMIT 1`
    ).get(companyId) as Record<string, any> | undefined;
}

function requiredString(
    body: Record<string, unknown>,
    key: string,
    label: string,
    maximumLength = 180
) {
    const value = cleanText(body[key], maximumLength);

    if (!value) {
        throw new Error("Informe " + label + ".");
    }

    return value;
}

function normalizeDigits(value: string) {
    return value.replace(/\D/g, "");
}

function transaction(callback: () => void) {
    sqlite.exec("BEGIN IMMEDIATE");

    try {
        callback();
        sqlite.exec("COMMIT");
    } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
    }
}

/* -------------------------------------------------------------------------- */
/* Importação do banco SQLite                                                  */
/* -------------------------------------------------------------------------- */

function quoteIdentifier(identifier: string) {
    return `"${identifier.replace(/"/g, '""')}"`;
}

function validateDatabaseFile(filePath: string) {
    const importedDatabase = new DatabaseSync(filePath);

    try {
        const integrityResults = importedDatabase
            .prepare("PRAGMA integrity_check")
            .all() as Array<Record<string, unknown>>;

        const isIntegrityValid =
            integrityResults.length === 1 &&
            integrityResults[0]?.integrity_check === "ok";

        if (!isIntegrityValid) {
            throw new Error(
                "O arquivo enviado não passou na verificação de integridade SQLite."
            );
        }

        const tables = importedDatabase.prepare(
            `SELECT name
             FROM sqlite_master
             WHERE type = 'table'
               AND name NOT LIKE 'sqlite_%'`
        ).all() as Array<{ name: string }>;

        const tableNames = new Set(
            tables.map((table) => table.name)
        );

        /*
         * Evita substituir o banco atual por um arquivo vazio ou
         * claramente incompatível com a estrutura essencial do sistema.
         */
        const requiredTables = [
            "users",
            "roles",
            "roles_user",
            "company"
        ];

        const missingTables = requiredTables.filter(
            (tableName) => !tableNames.has(tableName)
        );

        if (missingTables.length > 0) {
            throw new Error(
                "O arquivo não possui as tabelas essenciais: " +
                missingTables.join(", ") +
                "."
            );
        }

        return {
            tables: tables.length
        };
    } finally {
        importedDatabase.close();
    }
}

/**
 * Substitui os esquemas e os dados do banco atualmente aberto.
 *
 * O arquivo de origem é anexado como outro banco SQLite. Os objetos
 * atuais são removidos dentro de uma transação e recriados com os
 * esquemas e dados do arquivo importado.
 *
 * Isso evita apagar fisicamente um arquivo que ainda está aberto pela
 * conexão compartilhada com o restante do backend.
 */
function replaceDatabaseContents(filePath: string) {
    let attached = false;
    let transactionStarted = false;

    try {
        const attachDatabase = sqlite.prepare(
            "ATTACH DATABASE ? AS imported_backup"
        );

        attachDatabase.run(filePath);
        attached = true;

        sqlite.exec("PRAGMA foreign_keys = OFF");
        sqlite.exec("BEGIN IMMEDIATE");
        transactionStarted = true;

        const existingViews = sqlite.prepare(
            `SELECT name
             FROM main.sqlite_master
             WHERE type = 'view'
               AND name NOT LIKE 'sqlite_%'`
        ).all() as Array<{ name: string }>;

        // Remove as views antigas antes de remover as tabelas.
        for (const view of existingViews) {
            sqlite.exec(
                `DROP VIEW IF EXISTS main.${quoteIdentifier(view.name)}`
            );
        }

        const existingTables = sqlite.prepare(
            `SELECT name
             FROM main.sqlite_master
             WHERE type = 'table'
               AND name NOT LIKE 'sqlite_%'`
        ).all() as Array<{ name: string }>;

        // Foreign keys estão temporariamente desativadas nesta conexão.
        for (const table of existingTables) {
            sqlite.exec(
                `DROP TABLE IF EXISTS main.${quoteIdentifier(table.name)}`
            );
        }

        const importedTables = sqlite.prepare(
            `SELECT name, sql
             FROM imported_backup.sqlite_master
             WHERE type = 'table'
               AND name NOT LIKE 'sqlite_%'
               AND sql IS NOT NULL
             ORDER BY name`
        ).all() as Array<{
            name: string;
            sql: string;
        }>;

        // Primeiro recria todas as tabelas para resolver as referências.
        for (const table of importedTables) {
            if (/^\s*CREATE\s+VIRTUAL\s+TABLE/i.test(table.sql)) {
                throw new Error(
                    `A tabela virtual "${table.name}" não é suportada pela importação.`
                );
            }

            sqlite.exec(table.sql);
        }

        /*
         * Copia os dados preservando IDs.
         * table_xinfo permite excluir colunas geradas e colunas ocultas
         * que não devem aparecer numa lista de INSERT.
         */
        for (const table of importedTables) {
            const quotedTable = quoteIdentifier(table.name);
            const escapedName = table.name.replace(/'/g, "''");

            const columns = sqlite.prepare(
                `PRAGMA imported_backup.table_xinfo('${escapedName}')`
            ).all() as Array<{
                name: string;
                hidden?: number;
            }>;

            const writableColumns = columns.filter(
                (column) => Number(column.hidden ?? 0) === 0
            );

            if (writableColumns.length === 0) {
                continue;
            }

            const columnList = writableColumns
                .map((column) => quoteIdentifier(column.name))
                .join(", ");

            sqlite.exec(
                `INSERT INTO main.${quotedTable} (${columnList})
                 SELECT ${columnList}
                 FROM imported_backup.${quotedTable}`
            );
        }

        /*
         * Os índices são criados após a cópia dos dados para facilitar
         * a importação e manter as restrições UNIQUE do banco original.
         */
        const importedIndexes = sqlite.prepare(
            `SELECT sql
             FROM imported_backup.sqlite_master
             WHERE type = 'index'
               AND sql IS NOT NULL
             ORDER BY name`
        ).all() as Array<{ sql: string }>;

        for (const index of importedIndexes) {
            sqlite.exec(index.sql);
        }

        /*
         * Recria views e triggers após a importação dos dados,
         * para não executar triggers de negócio durante a cópia.
         */
        const importedViews = sqlite.prepare(
            `SELECT sql
             FROM imported_backup.sqlite_master
             WHERE type = 'view'
               AND sql IS NOT NULL
             ORDER BY name`
        ).all() as Array<{ sql: string }>;

        for (const view of importedViews) {
            sqlite.exec(view.sql);
        }

        const importedTriggers = sqlite.prepare(
            `SELECT sql
             FROM imported_backup.sqlite_master
             WHERE type = 'trigger'
               AND sql IS NOT NULL
             ORDER BY name`
        ).all() as Array<{ sql: string }>;

        for (const trigger of importedTriggers) {
            sqlite.exec(trigger.sql);
        }

        /*
         * Verifica o resultado antes de confirmar a transação.
         * Qualquer erro causa rollback, preservando o banco anterior.
         */
        const integrity = sqlite.prepare(
            "PRAGMA main.integrity_check"
        ).all() as Array<Record<string, unknown>>;

        if (
            integrity.length !== 1 ||
            integrity[0]?.integrity_check !== "ok"
        ) {
            throw new Error(
                "A verificação de integridade do banco importado falhou."
            );
        }

        sqlite.exec("COMMIT");
        transactionStarted = false;

        return {
            tablesImported: importedTables.length
        };
    } catch (error) {
        if (transactionStarted) {
            try {
                sqlite.exec("ROLLBACK");
            } catch {
                // Preserva o erro original caso o rollback também falhe.
            }

            transactionStarted = false;
        }

        throw error;
    } finally {
        if (attached) {
            try {
                sqlite.exec("DETACH DATABASE imported_backup");
            } catch {
                // Evita mascarar o erro principal durante a limpeza.
            }
        }

        try {
            sqlite.exec("PRAGMA foreign_keys = ON");
        } catch {
            // A conexão poderá reportar o erro na próxima operação.
        }
    }
}

/* -------------------------------------------------------------------------- */
/* Rotas de configurações                                                      */
/* -------------------------------------------------------------------------- */

async function settings(fastify: FastifyInstance) {
    const critical = [
        fastify.authenticate,
        fastify.authorize(3)
    ];

    fastify.put(
        "/settings/company",
        { onRequest: critical },
        async (request: any, reply: any) => {
            const body = (request.body ?? {}) as Record<string, unknown>;
            let values: Record<string, any>;

            try {
                const regime = cleanText(body.tax_regime, 40);

                if (!taxRegimes.includes(regime)) {
                    throw new Error(
                        "Selecione um regime tributário válido."
                    );
                }

                const bossUserId = Number(body.boss_user_id);

                if (!Number.isInteger(bossUserId) || bossUserId < 1) {
                    throw new Error(
                        "Selecione um usuário-chefe existente."
                    );
                }

                const boss = sqlite.prepare(
                    "SELECT id FROM users WHERE id = ?"
                ).get(bossUserId);

                if (!boss) {
                    throw new Error(
                        "O usuário-chefe precisa existir no sistema."
                    );
                }

                const cnpj = requiredString(
                    body,
                    "cnpj",
                    "o CNPJ",
                    24
                );

                if (normalizeDigits(cnpj).length !== 14) {
                    throw new Error(
                        "Informe um CNPJ com 14 dígitos."
                    );
                }

                const zipCode = requiredString(
                    body,
                    "zip_code",
                    "o CEP",
                    12
                );

                if (normalizeDigits(zipCode).length !== 8) {
                    throw new Error(
                        "Informe um CEP com 8 dígitos."
                    );
                }

                const state = requiredString(
                    body,
                    "state",
                    "o estado",
                    2
                ).toUpperCase();

                if (state.length !== 2) {
                    throw new Error(
                        "Informe a sigla do estado com 2 letras."
                    );
                }

                values = {
                    cnpj,
                    legal_name: requiredString(
                        body,
                        "legal_name",
                        "a razão social"
                    ),
                    trade_name: cleanText(body.trade_name, 180) || null,
                    state_registration: requiredString(
                        body,
                        "state_registration",
                        "a inscrição estadual"
                    ),
                    municipal_registration:
                        cleanText(body.municipal_registration, 80) || null,
                    tax_regime: regime,
                    address: requiredString(body, "address", "o endereço"),
                    number: requiredString(body, "number", "o número", 32),
                    complement: cleanText(body.complement, 180) || null,
                    neighborhood: requiredString(
                        body,
                        "neighborhood",
                        "o bairro"
                    ),
                    city: requiredString(body, "city", "a cidade"),
                    city_ibge: requiredString(
                        body,
                        "city_ibge",
                        "o código IBGE",
                        12
                    ),
                    state,
                    zip_code: zipCode,
                    boss_user_id: bossUserId
                };
            } catch (error) {
                return reply.code(400).send({
                    message: error instanceof Error
                        ? error.message
                        : "Dados da empresa inválidos."
                });
            }

            const current = getCurrentCompany();
            const companyId = Number(current?.id ?? 1);

            const otherBoss = sqlite.prepare(
                `SELECT id
                 FROM company
                 WHERE boss_user_id = ?
                   AND id <> ?`
            ).get(values.boss_user_id, companyId);

            if (otherBoss) {
                return reply.code(409).send({
                    message:
                        "Este usuário já é chefe de outra empresa."
                });
            }

            try {
                transaction(() => {
                    sqlite.prepare(
                        `INSERT INTO company (
                            id, boss_user_id, cnpj, legal_name, trade_name,
                            state_registration, municipal_registration,
                            tax_regime, address, number, complement,
                            neighborhood, city, city_ibge, state, zip_code
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET
                            boss_user_id = excluded.boss_user_id,
                            cnpj = excluded.cnpj,
                            legal_name = excluded.legal_name,
                            trade_name = excluded.trade_name,
                            state_registration = excluded.state_registration,
                            municipal_registration = excluded.municipal_registration,
                            tax_regime = excluded.tax_regime,
                            address = excluded.address,
                            number = excluded.number,
                            complement = excluded.complement,
                            neighborhood = excluded.neighborhood,
                            city = excluded.city,
                            city_ibge = excluded.city_ibge,
                            state = excluded.state,
                            zip_code = excluded.zip_code`
                    ).run(
                        companyId,
                        values.boss_user_id,
                        values.cnpj,
                        values.legal_name,
                        values.trade_name,
                        values.state_registration,
                        values.municipal_registration,
                        values.tax_regime,
                        values.address,
                        values.number,
                        values.complement,
                        values.neighborhood,
                        values.city,
                        values.city_ibge,
                        values.state,
                        values.zip_code
                    );

                    const config = getCurrentFiscalConfig(companyId);

                    if (config) {
                        sqlite.prepare(
                            "UPDATE fiscal_config SET tax_regime = ? WHERE id = ?"
                        ).run(values.tax_regime, config.id);
                    }
                });
            } catch (error) {
                request.log.error(error);

                return reply.code(409).send({
                    message:
                        "Não foi possível salvar a empresa. Verifique se o CNPJ já está cadastrado."
                });
            }

            return {
                message: "Dados da empresa salvos.",
                data: getCurrentCompany()
            };
        }
    );

    /* ---------------------------------------------------------------------- */
    /* NOVA ROTA: IMPORTAÇÃO DO BANCO SQLITE                                  */
    /* ---------------------------------------------------------------------- */

    fastify.put(
        "/settings/database/import",
        {
            onRequest: critical
        },
        async (request: any, reply: any) => {
            let temporaryDirectory: string | null = null;

            try {
                if (typeof request.file !== "function") {
                    return reply.code(500).send({
                        message:
                            "O upload de arquivos não está habilitado. Registre o plugin @fastify/multipart."
                    });
                }

                if (
                    typeof request.isMultipart === "function" &&
                    !request.isMultipart()
                ) {
                    return reply.code(415).send({
                        message:
                            "Envie o banco SQLite utilizando multipart/form-data."
                    });
                }

                const upload = await request.file({
                    limits: {
                        fileSize: maximumDatabaseSize,
                        files: 1
                    }
                });

                if (!upload) {
                    return reply.code(400).send({
                        message:
                            "Envie o arquivo SQLite no campo database."
                    });
                }

                temporaryDirectory = await mkdtemp(
                    join(tmpdir(), "posso-ajudar-import-")
                );

                const temporaryFilePath = join(
                    temporaryDirectory,
                    "uploaded-database.sqlite"
                );

                await pipeline(
                    upload.file,
                    createWriteStream(temporaryFilePath, {
                        flags: "wx"
                    })
                );

                if (upload.file.truncated) {
                    return reply.code(413).send({
                        message:
                            "O banco enviado excede o limite de 512 MB."
                    });
                }

                const uploadedStats = await stat(temporaryFilePath);

                if (
                    !uploadedStats.isFile() ||
                    uploadedStats.size === 0
                ) {
                    return reply.code(400).send({
                        message:
                            "O arquivo enviado está vazio ou é inválido."
                    });
                }

                /*
                 * Valida o arquivo antes de modificar o banco ativo.
                 * Se a validação falhar, o banco atual é preservado.
                 */
                validateDatabaseFile(temporaryFilePath);

                const result = replaceDatabaseContents(
                    temporaryFilePath
                );

                request.log.info(
                    {
                        userId: request.user?.id,
                        tablesImported: result.tablesImported,
                        uploadedSize: uploadedStats.size
                    },
                    "Banco SQLite importado."
                );

                return reply.code(200).send({
                    message:
                        "Banco de dados importado com sucesso.",
                    data: {
                        imported: true,
                        tablesImported: result.tablesImported,
                        sizeBytes: uploadedStats.size
                    }
                });
            } catch (error: any) {
                request.log.error(
                    {
                        err: error,
                        userId: request.user?.id
                    },
                    "Falha ao importar o banco SQLite."
                );

                if (
                    error?.code === "FST_REQ_FILE_TOO_LARGE" ||
                    error?.code === "FST_FILES_LIMIT"
                ) {
                    return reply.code(413).send({
                        message:
                            "O banco enviado excede o limite de 512 MB."
                    });
                }

                if (
                    typeof error?.message === "string" &&
                    (
                        error.message.includes("integridade SQLite") ||
                        error.message.includes("tabelas essenciais") ||
                        error.message.includes("não é suportada pela importação")
                    )
                ) {
                    return reply.code(400).send({
                        message: error.message
                    });
                }

                return reply.code(500).send({
                    message:
                        "Não foi possível importar o banco de dados. O banco atual foi preservado se a importação não foi concluída."
                });
            } finally {
                if (temporaryDirectory) {
                    await rm(temporaryDirectory, {
                        recursive: true,
                        force: true
                    }).catch((error: unknown) => {
                        fastify.log.warn(
                            { err: error },
                            "Não foi possível remover o arquivo temporário da importação."
                        );
                    });
                }
            }
        }
    );

    /* ---------------------------------------------------------------------- */
    /* CONFIGURAÇÃO DO SISTEMA                                                */
    /* ---------------------------------------------------------------------- */

    interface SystemConfigRoleInput {
        id?: number | null;
        name: string;
        level: number;
        status?: boolean | number;
    }

    interface SystemConfigRoleRecord {
        id: number;
        name: string;
        level: number;
        status: number;
    }

    interface SystemConfigUnitMeasureInput {
        unity: string;
        description?: string | null;
    }

    interface SystemConfigUnitMeasureRecord {
        id: number;
        unity: string;
        description: string | null;
    }

    fastify.put(
        "/settings/system-config",
        { onRequest: critical },
        async (request: any, reply: any) => {
            const body = (request.body ?? {}) as Record<string, unknown>;

            const response: {
                message: string;
                data: Array<Record<string, unknown>>;
            } = {
                message: "Configurações do sistema salvas.",
                data: []
            };

            /* VALIDAÇÃO DO PIX */

            let pixKey: string | undefined;

            if (body.pixKey !== undefined) {
                if (typeof body.pixKey !== "string") {
                    return reply.code(400).send({
                        message: "A chave PIX deve ser um texto.",
                        data: []
                    });
                }

                pixKey = body.pixKey.trim() || undefined;
            }

            /* VALIDAÇÃO DOS PERFIS */

            let rolesInput:
                | Array<{
                    id?: number;
                    name: string;
                    level: number;
                    status: number;
                }>
                | undefined;

            if (body.roles !== undefined) {
                if (!Array.isArray(body.roles)) {
                    return reply.code(400).send({
                        message: "O campo roles deve ser um array.",
                        data: []
                    });
                }

                rolesInput = [];

                for (const item of body.roles as unknown[]) {
                    if (
                        !item ||
                        typeof item !== "object" ||
                        Array.isArray(item)
                    ) {
                        return reply.code(400).send({
                            message:
                                "Cada perfil deve ser um objeto válido.",
                            data: []
                        });
                    }

                    const role = item as Record<string, unknown>;

                    const name =
                        typeof role.name === "string"
                            ? role.name.trim()
                            : "";

                    if (!name) {
                        return reply.code(400).send({
                            message: "O nome do perfil é obrigatório.",
                            data: []
                        });
                    }

                    if (
                        typeof role.level !== "number" ||
                        !Number.isSafeInteger(role.level) ||
                        role.level < 0
                    ) {
                        return reply.code(400).send({
                            message:
                                `O nível do perfil "${name}" deve ser um inteiro não negativo.`,
                            data: []
                        });
                    }

                    let id: number | undefined;

                    if (role.id !== undefined && role.id !== null) {
                        if (
                            typeof role.id !== "number" ||
                            !Number.isSafeInteger(role.id) ||
                            role.id <= 0
                        ) {
                            return reply.code(400).send({
                                message:
                                    `O ID do perfil "${name}" é inválido.`,
                                data: []
                            });
                        }

                        id = role.id;
                    }

                    let status = 1;

                    if (role.status !== undefined) {
                        if (
                            role.status !== true &&
                            role.status !== false &&
                            role.status !== 0 &&
                            role.status !== 1
                        ) {
                            return reply.code(400).send({
                                message:
                                    `O status do perfil "${name}" deve ser true, false, 0 ou 1.`,
                                data: []
                            });
                        }

                        status =
                            role.status === true || role.status === 1
                                ? 1
                                : 0;
                    }

                    rolesInput.push({
                        ...(id !== undefined ? { id } : {}),
                        name,
                        level: role.level,
                        status
                    });
                }
            }

            /* VALIDAÇÃO DA UNIDADE DE MEDIDA */

            const unitMeasureKeys = [
                "unitMeasure",
                "unit_measure",
                "unMeasure",
                "un_measure"
            ];

            const unitMeasureKey = unitMeasureKeys.find((key) =>
                Object.prototype.hasOwnProperty.call(body, key)
            );

            let unitMeasureInput:
                | {
                    unity: string;
                    description?: string | null;
                }
                | undefined;

            if (unitMeasureKey !== undefined) {
                const rawUnitMeasure = body[unitMeasureKey];

                if (
                    !rawUnitMeasure ||
                    typeof rawUnitMeasure !== "object" ||
                    Array.isArray(rawUnitMeasure)
                ) {
                    return reply.code(400).send({
                        message:
                            "A unidade de medida deve ser um objeto com unity e description.",
                        data: []
                    });
                }

                const unitMeasure =
                    rawUnitMeasure as Record<string, unknown>;

                const unity =
                    typeof unitMeasure.unity === "string"
                        ? unitMeasure.unity.trim()
                        : "";

                if (!unity) {
                    return reply.code(400).send({
                        message:
                            "O campo unity da unidade de medida é obrigatório.",
                        data: []
                    });
                }

                if (
                    unitMeasure.description !== undefined &&
                    unitMeasure.description !== null &&
                    typeof unitMeasure.description !== "string"
                ) {
                    return reply.code(400).send({
                        message:
                            "A descrição da unidade de medida deve ser um texto ou null.",
                        data: []
                    });
                }

                unitMeasureInput = {
                    unity,
                    ...(unitMeasure.description !== undefined
                        ? {
                            description:
                                unitMeasure.description as string | null
                        }
                        : {})
                };
            }

            /* ATUALIZAÇÕES */

            sqlite.exec("SAVEPOINT update_system_config");

            try {
                /* PIX */

                if (pixKey !== undefined) {
                    const company = sqlite.prepare(`
                        SELECT id
                        FROM company
                        ORDER BY id
                        LIMIT 1
                    `).get() as { id: number } | undefined;

                    if (company) {
                        sqlite.prepare(`
                            UPDATE company
                            SET pix_key = ?
                            WHERE id = ?
                        `).run(pixKey, company.id);
                    } else {
                        sqlite.prepare(`
                            INSERT INTO company (pix_key)
                            VALUES (?)
                        `).run(pixKey);
                    }

                    response.data.push({
                        pix_key: pixKey
                    });
                }

                /* PERFIS */

                if (rolesInput !== undefined) {
                    const findRoleById = sqlite.prepare(`
                        SELECT id, name, level, status
                        FROM roles
                        WHERE id = ?
                          AND name != 'developer'
                    `);

                    const findRoleByName = sqlite.prepare(`
                        SELECT id, name, level, status
                        FROM roles
                        WHERE name = ?
                          AND name != 'developer'
                    `);

                    const insertRole = sqlite.prepare(`
                        INSERT INTO roles (name, level, status)
                        VALUES (?, ?, ?)
                    `);

                    const updateRole = sqlite.prepare(`
                        UPDATE roles
                        SET name = ?, level = ?, status = ?
                        WHERE id = ?
                    `);

                    const updatedRoles: SystemConfigRoleRecord[] = [];

                    for (const role of rolesInput) {
                        let existing:
                            | SystemConfigRoleRecord
                            | undefined;

                        if (role.id !== undefined) {
                            existing = findRoleById.get(role.id) as
                                | SystemConfigRoleRecord
                                | undefined;
                        }

                        if (!existing) {
                            existing = findRoleByName.get(role.name) as
                                | SystemConfigRoleRecord
                                | undefined;
                        }

                        if (existing) {
                            const duplicate = findRoleByName.get(
                                role.name
                            ) as SystemConfigRoleRecord | undefined;

                            if (
                                duplicate &&
                                duplicate.id !== existing.id
                            ) {
                                throw new Error(
                                    `Já existe outro perfil com o nome "${role.name}".`
                                );
                            }

                            updateRole.run(
                                role.name,
                                role.level,
                                role.status,
                                existing.id
                            );

                            updatedRoles.push({
                                id: existing.id,
                                name: role.name,
                                level: role.level,
                                status: role.status
                            });
                        } else {
                            const result = insertRole.run(
                                role.name,
                                role.level,
                                role.status
                            );

                            updatedRoles.push({
                                id: Number(result.lastInsertRowid),
                                name: role.name,
                                level: role.level,
                                status: role.status
                            });
                        }
                    }

                    response.data.push({
                        roles: updatedRoles.map((role) => ({
                            ...role,
                            status: Boolean(role.status)
                        }))
                    });
                }

                /* UNIDADE DE MEDIDA */

                if (unitMeasureInput !== undefined) {
                    const unitQuery = sqlite.prepare(`
                        SELECT id, unity, description
                        FROM un_measure
                        ORDER BY id
                    `);

                    const units = unitQuery.all() as
                        SystemConfigUnitMeasureRecord[];

                    let primary = units.find(
                        (unit) =>
                            unit.unity === unitMeasureInput.unity
                    );

                    if (!primary && units.length > 0) {
                        primary = units[0];
                    }

                    let unitId: number;
                    let description: string | null;

                    if (primary) {
                        unitId = primary.id;

                        description =
                            unitMeasureInput.description !== undefined
                                ? unitMeasureInput.description
                                : primary.description;

                        const updateProductUnit = sqlite.prepare(`
                            UPDATE products
                            SET unit_id = ?
                            WHERE unit_id = ?
                        `);

                        const deleteUnit = sqlite.prepare(`
                            DELETE FROM un_measure
                            WHERE id = ?
                        `);

                        for (const unit of units) {
                            if (unit.id === unitId) continue;

                            updateProductUnit.run(unitId, unit.id);
                            deleteUnit.run(unit.id);
                        }

                        sqlite.prepare(`
                            UPDATE un_measure
                            SET unity = ?, description = ?
                            WHERE id = ?
                        `).run(
                            unitMeasureInput.unity,
                            description,
                            unitId
                        );
                    } else {
                        description =
                            unitMeasureInput.description ?? null;

                        const result = sqlite.prepare(`
                            INSERT INTO un_measure (unity, description)
                            VALUES (?, ?)
                        `).run(
                            unitMeasureInput.unity,
                            description
                        );

                        unitId = Number(result.lastInsertRowid);
                    }

                    response.data.push({
                        unit_measure: {
                            id: unitId,
                            unity: unitMeasureInput.unity,
                            description
                        }
                    });
                }

                sqlite.exec("RELEASE SAVEPOINT update_system_config");

                return response;
            } catch (error) {
                sqlite.exec("ROLLBACK TO SAVEPOINT update_system_config");
                sqlite.exec("RELEASE SAVEPOINT update_system_config");

                throw error;
            }
        }
    );

    /* ---------------------------------------------------------------------- */
    /* CONFIGURAÇÃO FISCAL                                                    */
    /* ---------------------------------------------------------------------- */

    fastify.put(
        "/settings/fiscal",
        { onRequest: critical },
        async (request: any, reply: any) => {
            const body = (request.body ?? {}) as Record<string, unknown>;
            const company = getCurrentCompany();

            if (!company) {
                return reply.code(409).send({
                    message:
                        "Cadastre os dados da empresa antes da configuração fiscal."
                });
            }

            const regime = cleanText(body.tax_regime, 40);
            const cfop = cleanText(body.cfop_default, 12);
            const ncm = cleanText(body.ncm_default, 12);
            const natOp = cleanText(body.nat_op_default, 120);
            const ibs = Number(body.ibs);
            const cbs = Number(body.cbs);

            if (!taxRegimes.includes(regime)) {
                return reply.code(400).send({
                    message: "Selecione um regime tributário válido."
                });
            }

            if (!/^\d{4}$/.test(cfop)) {
                return reply.code(400).send({
                    message: "Informe o CFOP padrão com 4 dígitos."
                });
            }

            if (!/^\d{8}$/.test(ncm)) {
                return reply.code(400).send({
                    message: "Informe o NCM padrão com 8 dígitos."
                });
            }

            if (!natOp) {
                return reply.code(400).send({
                    message: "Informe a natureza da operação."
                });
            }

            if (
                !Number.isFinite(ibs) ||
                ibs < 0 ||
                ibs > 100 ||
                !Number.isFinite(cbs) ||
                cbs < 0 ||
                cbs > 100
            ) {
                return reply.code(400).send({
                    message:
                        "IBS e CBS devem estar entre 0 e 100."
                });
            }

            try {
                transaction(() => {
                    sqlite.prepare(
                        "UPDATE company SET tax_regime = ? WHERE id = ?"
                    ).run(regime, company.id);

                    const config = getCurrentFiscalConfig(
                        Number(company.id)
                    );

                    if (config) {
                        sqlite.prepare(`
                            UPDATE fiscal_config
                            SET tax_regime = ?,
                                cfop_default = ?,
                                ncm_default = ?,
                                nat_op_default = ?,
                                ibs = ?,
                                cbs = ?
                            WHERE id = ?
                        `).run(
                            regime,
                            cfop,
                            ncm,
                            natOp,
                            ibs,
                            cbs,
                            config.id
                        );
                    } else {
                        sqlite.prepare(`
                            INSERT INTO fiscal_config (
                                company_id,
                                tax_regime,
                                cfop_default,
                                ncm_default,
                                nat_op_default,
                                ibs,
                                cbs
                            )
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        `).run(
                            company.id,
                            regime,
                            cfop,
                            ncm,
                            natOp,
                            ibs,
                            cbs
                        );
                    }
                });
            } catch (error) {
                request.log.error(error);

                return reply.code(500).send({
                    message:
                        "Não foi possível salvar as configurações fiscais."
                });
            }

            return {
                message: "Configuração fiscal salva.",
                data: getCurrentFiscalConfig(Number(company.id))
            };
        }
    );

    /* ---------------------------------------------------------------------- */
    /* CERTIFICADO DIGITAL                                                    */
    /* ---------------------------------------------------------------------- */

    fastify.put(
        "/settings/certificate",
        {
            onRequest: critical
        },
        async (request: any, reply: any) => {
            const {
                mkdir,
                unlink,
                readFile,
                readdir
            } = require("node:fs/promises");

            const { createWriteStream } = require("node:fs");
            const path = require("node:path");
            const { randomUUID } = require("node:crypto");
            const { pipeline } = require("node:stream/promises");

            let certificatePath: string | null = null;

            try {
                const company = getCurrentCompany();

                if (!company) {
                    return reply.code(409).send({
                        message:
                            "Cadastre a empresa antes do certificado digital."
                    });
                }

                const storageDirectory = path.resolve(
                    process.cwd(),
                    "storage",
                    "certificate"
                );

                let password = "";
                let validFrom = "";
                let validUntil = "";
                let certificateReceived = false;

                const parts = request.parts({
                    limits: {
                        fileSize: maximumCertificateSize,
                        files: 1,
                        fields: 10
                    }
                });

                for await (const part of parts) {
                    if (part.type === "file") {
                        if (part.fieldname !== "certificate") {
                            part.file.resume();
                            continue;
                        }

                        const extension = path
                            .extname(part.filename || "")
                            .toLowerCase();

                        if (![".pfx", ".p12"].includes(extension)) {
                            part.file.resume();

                            return reply.code(400).send({
                                message:
                                    "Selecione um certificado PFX ou P12 válido."
                            });
                        }

                        await mkdir(storageDirectory, {
                            recursive: true
                        });

                        certificatePath = path.join(
                            storageDirectory,
                            `${randomUUID()}${extension}`
                        );

                        await pipeline(
                            part.file,
                            createWriteStream(certificatePath, {
                                flags: "wx"
                            })
                        );

                        if (part.file.truncated) {
                            await unlink(certificatePath).catch(() => {});
                            certificatePath = null;

                            return reply.code(413).send({
                                message:
                                    "O certificado deve ter no máximo 8 MB."
                            });
                        }

                        certificateReceived = true;
                    } else {
                        const value =
                            typeof part.value === "string"
                                ? part.value
                                : "";

                        if (part.fieldname === "password") {
                            password = value;
                        } else if (part.fieldname === "valid_from") {
                            validFrom = cleanText(value, 32);
                        } else if (part.fieldname === "valid_until") {
                            validUntil = cleanText(value, 32);
                        }
                    }
                }

                if (!certificateReceived || !certificatePath) {
                    return reply.code(400).send({
                        message:
                            "Envie o arquivo no campo 'certificate'."
                    });
                }

                if (!password) {
                    return reply.code(400).send({
                        message:
                            "Informe a senha do certificado."
                    });
                }

                if (!validDateRange(validFrom, validUntil)) {
                    return reply.code(400).send({
                        message:
                            "Informe um período de validade válido."
                    });
                }

                const certificateBytes = await readFile(certificatePath);

                if (
                    !certificateBytes.length ||
                    certificateBytes.length > maximumCertificateSize
                ) {
                    return reply.code(413).send({
                        message:
                            "O certificado deve ter no máximo 8 MB."
                    });
                }

                const certificateValue = encryptCertificateValue(
                    certificateBytes.toString("base64")
                );

                const passwordValue = encryptCertificateValue(password);

                const relativeCertificatePath = path
                    .relative(process.cwd(), certificatePath)
                    .split(path.sep)
                    .join("/");

                const current = sqlite.prepare(`
                    SELECT id
                    FROM fiscal_certificates
                    WHERE company_id = ?
                    ORDER BY id DESC
                    LIMIT 1
                `).get(company.id) as {
                    id: number;
                } | undefined;

                if (current) {
                    sqlite.prepare(`
                        UPDATE fiscal_certificates
                        SET certificate = ?,
                            password = ?,
                            valid_from = ?,
                            valid_until = ?,
                            status = 1
                        WHERE id = ?
                    `).run(
                        certificateValue,
                        passwordValue,
                        validFrom,
                        validUntil,
                        current.id
                    );
                } else {
                    sqlite.prepare(`
                        INSERT INTO fiscal_certificates (
                            company_id,
                            certificate,
                            password,
                            valid_from,
                            valid_until,
                            status
                        )
                        VALUES (?, ?, ?, ?, ?, 1)
                    `).run(
                        company.id,
                        certificateValue,
                        passwordValue,
                        validFrom,
                        validUntil
                    );
                }

                const files = await readdir(storageDirectory);

                for (const filename of files) {
                    const filePath = path.join(
                        storageDirectory,
                        filename
                    );

                    if (
                        filePath !== certificatePath &&
                        [".pfx", ".p12"].includes(
                            path.extname(filename).toLowerCase()
                        )
                    ) {
                        await unlink(filePath);
                    }
                }

                const metadata = getCertificateMetadata(
                    Number(company.id)
                );

                return reply.send({
                    message:
                        "Certificado enviado e salvo. A senha permanece protegida.",
                    data: {
                        ...metadata,
                        certificate_path: relativeCertificatePath
                    }
                });
            } catch (error: any) {
                request.log.error(error);

                if (certificatePath) {
                    await unlink(certificatePath).catch(() => {});
                }

                if (
                    error?.code === "FST_REQ_FILE_TOO_LARGE" ||
                    error?.code === "FST_FILES_LIMIT"
                ) {
                    return reply.code(413).send({
                        message:
                            "O certificado deve ter no máximo 8 MB."
                    });
                }

                return reply.code(500).send({
                    message:
                        "Não foi possível enviar e salvar o certificado."
                });
            }
        }
    );

    fastify.put(
        "/settings/certificate/status",
        { onRequest: critical },
        async (request: any, reply: any) => {
            const company = getCurrentCompany();

            const active = Boolean(
                (request.body as {
                    active?: boolean;
                } | undefined)?.active
            );

            if (!company) {
                return reply.code(404).send({
                    message: "Empresa não cadastrada."
                });
            }

            const certificate = sqlite.prepare(`
                SELECT
                    id,
                    certificate,
                    valid_from,
                    valid_until
                FROM fiscal_certificates
                WHERE company_id = ?
                ORDER BY id DESC
                LIMIT 1
            `).get(company.id) as {
                id: number;
                certificate: string;
                valid_from: string | null;
                valid_until: string | null;
            } | undefined;

            if (!certificate || !certificate.certificate) {
                return reply.code(404).send({
                    message: "Nenhum certificado cadastrado."
                });
            }

            if (
                active &&
                !isCurrentCertificate(
                    1,
                    certificate.valid_from,
                    certificate.valid_until
                )
            ) {
                return reply.code(400).send({
                    message:
                        "O certificado está fora do período de validade informado."
                });
            }

            sqlite.prepare(
                "UPDATE fiscal_certificates SET status = ? WHERE id = ?"
            ).run(active ? 1 : 0, certificate.id);

            return {
                message: active
                    ? "Certificado ativado."
                    : "Certificado inativado.",
                data: getCertificateMetadata(Number(company.id))
            };
        }
    );
}

module.exports = settings;