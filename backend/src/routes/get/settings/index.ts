import type { FastifyInstance } from "fastify";
const { sqlite } = require("../../../db/index");

const activeConnections = new Map<number, Set<any>>();

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
}

module.exports = settings;
