import type { FastifyInstance } from "fastify";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { Buffer } = require("node:buffer");
const { sqlite } = require("../../db/index");

const activeConnections = new Map<number, Set<any>>();
const maximumCertificateSize = 8 * 1024 * 1024;
const maximumAvatarSize = 2 * 1024 * 1024;
const taxRegimes = ["SIMPLES_NACIONAL", "REGIME_NORMAL"];
const operationDefault = "Venda de Mercadoria";

function cleanText(value: unknown, maximumLength = 180) {
    return typeof value === "string" ? value.trim().slice(0, maximumLength) : "";
}

function getUserLevel(userId: number) {
    const rows = sqlite.prepare(
        "SELECT r.level FROM roles_user ru INNER JOIN roles r ON r.id = ru.role_id WHERE ru.user_id = ?"
    ).all(userId) as Array<{ level: number }>;

    return rows.reduce((highest, role) => Math.max(highest, Number(role.level) || 0), 0);
}

function getActiveUsers() {
    const users = sqlite.prepare(
        "SELECT id, email FROM users WHERE status = 1 ORDER BY email COLLATE NOCASE"
    ).all() as Array<{ id: number; email: string }>;

    return users.map((user) => ({
        id: user.id,
        name: (user.email.split("@")[0] ?? "").replace(/[._-]+/g, " ").trim() || "Usuário",
        online: (activeConnections.get(user.id)?.size ?? 0) > 0
    }));
}

function sendPresence(socket: any, type = "presence") {
    if (socket.readyState !== 1) return;
    socket.send(JSON.stringify({ type, users: getActiveUsers() }));
}

function broadcastPresence(exceptSocket?: any) {
    const message = JSON.stringify({ type: "presence", users: getActiveUsers() });

    for (const sockets of activeConnections.values()) {
        for (const socket of sockets) {
            if (socket !== exceptSocket && socket.readyState === 1) socket.send(message);
        }
    }
}

function removeConnection(userId: number, socket: any) {
    const sockets = activeConnections.get(userId);
    if (!sockets || !sockets.delete(socket)) return;
    if (sockets.size === 0) activeConnections.delete(userId);
    broadcastPresence();
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
    const authenticated = [fastify.authenticate];
    const critical = [fastify.authenticate, fastify.authorize(3)];

    fastify.get("/settings/presence", {
        websocket: true,
        onRequest: authenticated
    }, (socket: any, request: any) => {
        const userId = Number(request.user?.id);
        const currentUser = sqlite.prepare("SELECT status FROM users WHERE id = ?").get(userId) as { status: number } | undefined;

        if (!currentUser || !currentUser.status) {
            socket.close(1008, "Conta inativa");
            return;
        }

        const sockets = activeConnections.get(userId) ?? new Set<any>();
        const wasOffline = sockets.size === 0;
        sockets.add(socket);
        activeConnections.set(userId, sockets);

        sendPresence(socket, "snapshot");
        if (wasOffline) broadcastPresence(socket);

        socket.on("close", () => removeConnection(userId, socket));
        socket.on("error", () => removeConnection(userId, socket));
    });

    fastify.get("/settings/critical", { onRequest: critical }, async () => {
        const company = getCurrentCompany();
        const fiscal = company ? getCurrentFiscalConfig(Number(company.id)) : undefined;

        return {
            message: "Configurações críticas carregadas.",
            data: {
                company: company ?? null,
                fiscal: fiscal ?? null,
                certificate: company
                    ? getCertificateMetadata(Number(company.id))
                    : { exists: false, status: false, valid_from: null, valid_until: null, is_valid: false },
                users: sqlite.prepare(
                    "SELECT id, email, status FROM users ORDER BY email COLLATE NOCASE"
                ).all()
            }
        };
    });

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

    fastify.put("/settings/certificate", { onRequest: critical }, async (request: any, reply: any) => {
        const company = getCurrentCompany();
        if (!company) return reply.code(409).send({ message: "Cadastre a empresa antes do certificado digital." });

        const body = (request.body ?? {}) as Record<string, unknown>;
        const certificateData = cleanText(body.certificate_data, maximumCertificateSize * 2);
        const password = typeof body.password === "string" ? body.password : "";
        const validFrom = cleanText(body.valid_from, 32);
        const validUntil = cleanText(body.valid_until, 32);

        if (!certificateData || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(certificateData)) {
            return reply.code(400).send({ message: "Selecione um certificado PFX ou P12 válido." });
        }

        const certificateBytes = Buffer.from(certificateData, "base64");
        if (!certificateBytes.length || certificateBytes.length > maximumCertificateSize) {
            return reply.code(413).send({ message: "O certificado deve ter no máximo 8 MB." });
        }
        if (!password) return reply.code(400).send({ message: "Informe a senha do certificado." });
        if (!validDateRange(validFrom, validUntil)) return reply.code(400).send({ message: "Informe um período de validade válido." });

        try {
            const certificateValue = encryptCertificateValue(certificateBytes.toString("base64"));
            const passwordValue = encryptCertificateValue(password);
            const current = sqlite.prepare(
                "SELECT id FROM fiscal_certificates WHERE company_id = ? ORDER BY id DESC LIMIT 1"
            ).get(company.id) as { id: number } | undefined;

            if (current) {
                sqlite.prepare("UPDATE fiscal_certificates SET certificate = ?, password = ?, valid_from = ?, valid_until = ?, status = 1 WHERE id = ?")
                    .run(certificateValue, passwordValue, validFrom, validUntil, current.id);
            } else {
                sqlite.prepare("INSERT INTO fiscal_certificates (company_id, certificate, password, valid_from, valid_until, status) VALUES (?, ?, ?, ?, ?, 1)")
                    .run(company.id, certificateValue, passwordValue, validFrom, validUntil);
            }
        } catch (error) {
            request.log.error(error);
            return reply.code(500).send({ message: "Não foi possível proteger e salvar o certificado. Confira o segredo do servidor." });
        }

        return { message: "Certificado salvo. A senha permanece protegida.", data: getCertificateMetadata(Number(company.id)) };
    });

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

    fastify.delete("/settings/certificate", { onRequest: critical }, async (_request, reply) => {
        const company = getCurrentCompany();
        if (!company) return reply.code(404).send({ message: "Empresa não cadastrada." });

        sqlite.prepare("UPDATE fiscal_certificates SET certificate = '', password = '', valid_from = NULL, valid_until = NULL, status = 0 WHERE company_id = ?")
            .run(company.id);
        return reply.code(204).send();
    });

    fastify.post("/settings/avatar", { onRequest: authenticated }, async (request: any, reply: any) => {
        const body = (request.body ?? {}) as { data?: unknown; content_type?: unknown };
        const data = cleanText(body.data, maximumAvatarSize * 2);
        const contentType = cleanText(body.content_type, 40).toLowerCase();
        const extensions: Record<string, string> = {
            "image/png": "png",
            "image/jpeg": "jpg",
            "image/webp": "webp"
        };
        const extension = extensions[contentType];

        if (!extension || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)) {
            return reply.code(400).send({ message: "Envie uma imagem PNG, JPEG ou WebP." });
        }

        const image = Buffer.from(data, "base64");
        if (!image.length || image.length > maximumAvatarSize) return reply.code(413).send({ message: "A imagem deve ter no máximo 2 MB." });

        const fileName = crypto.randomUUID() + "." + extension;
        const relativePath = path.join("avatars", fileName);
        const storageDirectory = path.resolve(process.cwd(), "storage", "avatars");

        try {
            await fs.mkdir(storageDirectory, { recursive: true });
            await fs.writeFile(path.join(storageDirectory, fileName), image, { flag: "wx" });
            sqlite.prepare("UPDATE users SET avatar = ? WHERE id = ?").run(relativePath.replace(/\\/g, "/"), request.user.id);
        } catch (error) {
            request.log.error(error);
            return reply.code(500).send({ message: "Não foi possível salvar a imagem do perfil." });
        }

        return {
            message: "Imagem do perfil atualizada.",
            data: { avatar: relativePath.replace(/\\/g, "/") }
        };
    });
}

module.exports = settings;
