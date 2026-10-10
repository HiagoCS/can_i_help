import type { FastifyInstance } from "fastify";

const crypto = require("node:crypto");
const { Buffer } = require("node:buffer");
const { sqlite } = require("../../../db/index");

const maximumCertificateSize = 8 * 1024 * 1024;
const taxRegimes = ["SIMPLES_NACIONAL", "REGIME_NORMAL"];

function cleanText(value: unknown, maximumLength = 180) {
    return typeof value === "string" ? value.trim().slice(0, maximumLength) : "";
}

function certificateKey() {
    const secret = process.env.CERTIFICATE_ENCRYPTION_KEY || process.env.JWT_SECRET;
    if (!secret) throw new Error("Configure CERTIFICATE_ENCRYPTION_KEY ou JWT_SECRET.");
    return crypto.createHash("sha256").update("posso-ajudar:fiscal-certificate:v1:" + secret).digest();
}

function encryptCertificateValue(value: string) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", certificateKey(), iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(":");
}

function parseValidityDate(value: string, endOfDay = false) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return Number.NaN;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const timestamp = Date.UTC(year, month - 1, day);
    const parsed = new Date(timestamp);
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
        return Number.NaN;
    }

    return endOfDay ? timestamp + 86_399_999 : timestamp;
}

function validDateRange(validFrom: unknown, validUntil: unknown) {
    const start = cleanText(validFrom, 32);
    const end = cleanText(validUntil, 32);
    const startDate = parseValidityDate(start);
    const endDate = parseValidityDate(end, true);
    return Boolean(start && end && Number.isFinite(startDate) && Number.isFinite(endDate) && startDate <= endDate);
}

function isCurrentCertificate(status: number, validFrom: string | null, validUntil: string | null) {
    const now = Date.now();
    const start = validFrom ? parseValidityDate(validFrom) : Number.NaN;
    const end = validUntil ? parseValidityDate(validUntil, true) : Number.NaN;
    return Boolean(status && Number.isFinite(start) && Number.isFinite(end) && start <= now && end >= now);
}

function getCertificateMetadata(companyId: number) {
    const certificate = sqlite.prepare(
        "SELECT status, valid_from, valid_until, certificate FROM fiscal_certificates WHERE company_id = ? ORDER BY id DESC LIMIT 1"
    ).get(companyId) as { status: number; valid_from: string | null; valid_until: string | null; certificate: string } | undefined;

    if (!certificate) {
        return { exists: false, status: false, valid_from: null, valid_until: null, is_valid: false };
    }

    return {
        exists: Boolean(certificate.certificate),
        status: Boolean(certificate.status),
        valid_from: certificate.valid_from,
        valid_until: certificate.valid_until,
        is_valid: isCurrentCertificate(certificate.status, certificate.valid_from, certificate.valid_until)
    };
}

function getCurrentCompany() {
    return sqlite.prepare("SELECT * FROM company ORDER BY id LIMIT 1").get() as Record<string, any> | undefined;
}

function getCurrentFiscalConfig(companyId: number) {
    return sqlite.prepare(
        "SELECT * FROM fiscal_config WHERE company_id = ? ORDER BY id LIMIT 1"
    ).get(companyId) as Record<string, any> | undefined;
}

function requiredString(body: Record<string, unknown>, key: string, label: string, maximumLength = 180) {
    const value = cleanText(body[key], maximumLength);
    if (!value) throw new Error("Informe " + label + ".");
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

async function settings(fastify: FastifyInstance) {
    const critical = [fastify.authenticate, fastify.authorize(3)];

    fastify.put("/settings/company", { onRequest: critical }, async (request: any, reply: any) => {
        const body = (request.body ?? {}) as Record<string, unknown>;
        let values: Record<string, any>;

        try {
            const regime = cleanText(body.tax_regime, 40);
            if (!taxRegimes.includes(regime)) throw new Error("Selecione um regime tributário válido.");

            const bossUserId = Number(body.boss_user_id);
            if (!Number.isInteger(bossUserId) || bossUserId < 1) throw new Error("Selecione um usuário-chefe existente.");

            const boss = sqlite.prepare("SELECT id FROM users WHERE id = ?").get(bossUserId);
            if (!boss) throw new Error("O usuário-chefe precisa existir no sistema.");

            const cnpj = requiredString(body, "cnpj", "o CNPJ", 24);
            if (normalizeDigits(cnpj).length !== 14) throw new Error("Informe um CNPJ com 14 dígitos.");
            const zipCode = requiredString(body, "zip_code", "o CEP", 12);
            if (normalizeDigits(zipCode).length !== 8) throw new Error("Informe um CEP com 8 dígitos.");
            const state = requiredString(body, "state", "o estado", 2).toUpperCase();
            if (state.length !== 2) throw new Error("Informe a sigla do estado com 2 letras.");

            values = {
                cnpj,
                legal_name: requiredString(body, "legal_name", "a razão social"),
                trade_name: cleanText(body.trade_name, 180) || null,
                state_registration: requiredString(body, "state_registration", "a inscrição estadual"),
                municipal_registration: cleanText(body.municipal_registration, 80) || null,
                tax_regime: regime,
                address: requiredString(body, "address", "o endereço"),
                number: requiredString(body, "number", "o número", 32),
                complement: cleanText(body.complement, 180) || null,
                neighborhood: requiredString(body, "neighborhood", "o bairro"),
                city: requiredString(body, "city", "a cidade"),
                city_ibge: requiredString(body, "city_ibge", "o código IBGE", 12),
                state,
                zip_code: zipCode,
                boss_user_id: bossUserId
            };
        } catch (error) {
            return reply.code(400).send({ message: error instanceof Error ? error.message : "Dados da empresa inválidos." });
        }

        const current = getCurrentCompany();
        const companyId = Number(current?.id ?? 1);
        const otherBoss = sqlite.prepare(
            "SELECT id FROM company WHERE boss_user_id = ? AND id <> ?"
        ).get(values.boss_user_id, companyId);

        if (otherBoss) return reply.code(409).send({ message: "Este usuário já é chefe de outra empresa." });

        try {
            transaction(() => {
                sqlite.prepare(
                    "INSERT INTO company (id, boss_user_id, cnpj, legal_name, trade_name, state_registration, municipal_registration, tax_regime, address, number, complement, neighborhood, city, city_ibge, state, zip_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET boss_user_id = excluded.boss_user_id, cnpj = excluded.cnpj, legal_name = excluded.legal_name, trade_name = excluded.trade_name, state_registration = excluded.state_registration, municipal_registration = excluded.municipal_registration, tax_regime = excluded.tax_regime, address = excluded.address, number = excluded.number, complement = excluded.complement, neighborhood = excluded.neighborhood, city = excluded.city, city_ibge = excluded.city_ibge, state = excluded.state, zip_code = excluded.zip_code"
                ).run(companyId, values.boss_user_id, values.cnpj, values.legal_name, values.trade_name, values.state_registration, values.municipal_registration, values.tax_regime, values.address, values.number, values.complement, values.neighborhood, values.city, values.city_ibge, values.state, values.zip_code);

                const config = getCurrentFiscalConfig(companyId);
                if (config) {
                    sqlite.prepare("UPDATE fiscal_config SET tax_regime = ? WHERE id = ?").run(values.tax_regime, config.id);
                }
            });
        } catch (error) {
            request.log.error(error);
            return reply.code(409).send({ message: "Não foi possível salvar a empresa. Verifique se o CNPJ já está cadastrado." });
        }

        return { message: "Dados da empresa salvos.", data: getCurrentCompany() };
    });

    fastify.put("/settings/fiscal", { onRequest: critical }, async (request: any, reply: any) => {
        const body = (request.body ?? {}) as Record<string, unknown>;
        const company = getCurrentCompany();
        if (!company) return reply.code(409).send({ message: "Cadastre os dados da empresa antes da configuração fiscal." });

        const regime = cleanText(body.tax_regime, 40);
        const cfop = cleanText(body.cfop_default, 12);
        const ncm = cleanText(body.ncm_default, 12);
        const natOp = cleanText(body.nat_op_default, 120);
        const ibs = Number(body.ibs);
        const cbs = Number(body.cbs);

        if (!taxRegimes.includes(regime)) return reply.code(400).send({ message: "Selecione um regime tributário válido." });
        if (!/^\d{4}$/.test(cfop)) return reply.code(400).send({ message: "Informe o CFOP padrão com 4 dígitos." });
        if (!/^\d{8}$/.test(ncm)) return reply.code(400).send({ message: "Informe o NCM padrão com 8 dígitos." });
        if (!natOp) return reply.code(400).send({ message: "Informe a natureza da operação." });
        if (!Number.isFinite(ibs) || ibs < 0 || ibs > 100 || !Number.isFinite(cbs) || cbs < 0 || cbs > 100) {
            return reply.code(400).send({ message: "IBS e CBS devem estar entre 0 e 100." });
        }

        try {
            transaction(() => {
                sqlite.prepare("UPDATE company SET tax_regime = ? WHERE id = ?").run(regime, company.id);
                const config = getCurrentFiscalConfig(Number(company.id));
                if (config) {
                    sqlite.prepare("UPDATE fiscal_config SET tax_regime = ?, cfop_default = ?, ncm_default = ?, nat_op_default = ?, ibs = ?, cbs = ? WHERE id = ?")
                        .run(regime, cfop, ncm, natOp, ibs, cbs, config.id);
                } else {
                    sqlite.prepare("INSERT INTO fiscal_config (company_id, tax_regime, cfop_default, ncm_default, nat_op_default, ibs, cbs) VALUES (?, ?, ?, ?, ?, ?, ?)")
                        .run(company.id, regime, cfop, ncm, natOp, ibs, cbs);
                }
            });
        } catch (error) {
            request.log.error(error);
            return reply.code(500).send({ message: "Não foi possível salvar as configurações fiscais." });
        }

        return { message: "Configuração fiscal salva.", data: getCurrentFiscalConfig(Number(company.id)) };
    });

    fastify.put("/settings/certificate",
        {
            onRequest: critical,
        },
        async (request: any, reply: any) => {
            const { mkdir, unlink, readFile, readdir } = require("node:fs/promises");
            const { createWriteStream } = require("node:fs");
            const path = require("node:path");
            const { randomUUID } = require("node:crypto");
            const { pipeline } = require("node:stream/promises");

            let certificatePath: string | null = null;

            try {
                const company = getCurrentCompany();

                if (!company) {
                    return reply.code(409).send({
                        message: "Cadastre a empresa antes do certificado digital.",
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
                        fields: 10,
                    },
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
                                message: "Selecione um certificado PFX ou P12 válido.",
                            });
                        }

                        await mkdir(storageDirectory, { recursive: true });

                        certificatePath = path.join(
                            storageDirectory,
                            `${randomUUID()}${extension}`
                        );

                        await pipeline(
                            part.file,
                            createWriteStream(certificatePath, { flags: "wx" })
                        );

                        if (part.file.truncated) {
                            await unlink(certificatePath).catch(() => { });
                            certificatePath = null;

                            return reply.code(413).send({
                                message: "O certificado deve ter no máximo 8 MB.",
                            });
                        }

                        certificateReceived = true;
                    } else {
                        const value =
                            typeof part.value === "string" ? part.value : "";

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
                        message: "Envie o arquivo no campo 'certificate'.",
                    });
                }

                if (!password) {
                    return reply.code(400).send({
                        message: "Informe a senha do certificado.",
                    });
                }

                if (!validDateRange(validFrom, validUntil)) {
                    return reply.code(400).send({
                        message: "Informe um período de validade válido.",
                    });
                }

                const certificateBytes = await readFile(certificatePath);

                if (
                    !certificateBytes.length ||
                    certificateBytes.length > maximumCertificateSize
                ) {
                    return reply.code(413).send({
                        message: "O certificado deve ter no máximo 8 MB.",
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

                const current = sqlite
                    .prepare(`
                    SELECT id
                    FROM fiscal_certificates
                    WHERE company_id = ?
                    ORDER BY id DESC
                    LIMIT 1
                `)
                    .get(company.id) as { id: number } | undefined;

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

                // Mantém somente o certificado recém-salvo na pasta.
                const files = await readdir(storageDirectory);

                for (const filename of files) {
                    const filePath = path.join(storageDirectory, filename);

                    if (
                        filePath !== certificatePath &&
                        [".pfx", ".p12"].includes(
                            path.extname(filename).toLowerCase()
                        )
                    ) {
                        await unlink(filePath);
                    }
                }

                const metadata = getCertificateMetadata(Number(company.id));

                return reply.send({
                    message: "Certificado enviado e salvo. A senha permanece protegida.",
                    data: {
                        ...metadata,
                        certificate_path: relativeCertificatePath,
                    },
                });
            } catch (error: any) {
                request.log.error(error);

                if (certificatePath) {
                    await unlink(certificatePath).catch(() => { });
                }

                if (
                    error?.code === "FST_REQ_FILE_TOO_LARGE" ||
                    error?.code === "FST_FILES_LIMIT"
                ) {
                    return reply.code(413).send({
                        message: "O certificado deve ter no máximo 8 MB.",
                    });
                }

                return reply.code(500).send({
                    message: "Não foi possível enviar e salvar o certificado.",
                });
            }
        }
    );

    fastify.put("/settings/certificate/status", { onRequest: critical }, async (request: any, reply: any) => {
        const company = getCurrentCompany();
        const active = Boolean((request.body as { active?: boolean } | undefined)?.active);
        if (!company) return reply.code(404).send({ message: "Empresa não cadastrada." });

        const certificate = sqlite.prepare(
            "SELECT id, certificate, valid_from, valid_until FROM fiscal_certificates WHERE company_id = ? ORDER BY id DESC LIMIT 1"
        ).get(company.id) as { id: number; certificate: string; valid_from: string | null; valid_until: string | null } | undefined;
        if (!certificate || !certificate.certificate) return reply.code(404).send({ message: "Nenhum certificado cadastrado." });
        if (active && !isCurrentCertificate(1, certificate.valid_from, certificate.valid_until)) {
            return reply.code(400).send({ message: "O certificado está fora do período de validade informado." });
        }

        sqlite.prepare("UPDATE fiscal_certificates SET status = ? WHERE id = ?").run(active ? 1 : 0, certificate.id);
        return { message: active ? "Certificado ativado." : "Certificado inativado.", data: getCertificateMetadata(Number(company.id)) };
    });
}

module.exports = settings;
