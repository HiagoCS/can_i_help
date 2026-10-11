import type { FastifyInstance } from "fastify";

const { createReadStream, constants: fsConstants } = require("node:fs");
const { access, mkdtemp, rm, stat } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");

const { sqlite, databasePath } = require("../../../db/index");
const { backup } = require("node:sqlite");

const activeConnections = new Map<number, Set<any>>();

function getActiveUsers() {
    const users = sqlite.prepare(
        "SELECT id, email FROM users WHERE status = 1 ORDER BY email COLLATE NOCASE"
    ).all() as Array<{ id: number; email: string }>;

    return users.map((user) => ({
        id: user.id,
        name: (user.email.split("@")[0] ?? "")
            .replace(/[._-]+/g, " ")
            .trim() || "Usuário",
        online: (activeConnections.get(user.id)?.size ?? 0) > 0
    }));
}

function sendPresence(socket: any, type = "presence") {
    if (socket.readyState !== 1) return;

    socket.send(
        JSON.stringify({
            type,
            users: getActiveUsers()
        })
    );
}

function broadcastPresence(exceptSocket?: any) {
    const message = JSON.stringify({
        type: "presence",
        users: getActiveUsers()
    });

    for (const sockets of activeConnections.values()) {
        for (const socket of sockets) {
            if (
                socket !== exceptSocket &&
                socket.readyState === 1
            ) {
                socket.send(message);
            }
        }
    }
}

function removeConnection(userId: number, socket: any) {
    const sockets = activeConnections.get(userId);

    if (!sockets || !sockets.delete(socket)) return;

    if (sockets.size === 0) {
        activeConnections.delete(userId);
    }

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

    if (
        parsed.getUTCFullYear() !== year ||
        parsed.getUTCMonth() !== month - 1 ||
        parsed.getUTCDate() !== day
    ) {
        return Number.NaN;
    }

    return endOfDay
        ? timestamp + 86_399_999
        : timestamp;
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

function getCurrentRoles() {
    return sqlite.prepare(
        "SELECT * FROM roles WHERE name != ? ORDER BY id"
    ).all("developer") as Record<string, any>[];
}

function getCurrentUnitMeasure() {
    return sqlite.prepare(
        "SELECT * FROM un_measure WHERE id = ? ORDER BY id LIMIT 1"
    ).get(1) as Record<string, any> | undefined;
}

async function settings(fastify: FastifyInstance) {
    const authenticated = [fastify.authenticate];
    const critical = [
        fastify.authenticate,
        fastify.authorize(3)
    ];

    fastify.get(
        "/settings/presence",
        {
            websocket: true,
            onRequest: authenticated
        },
        (socket: any, request: any) => {
            const userId = Number(request.user?.id);

            const currentUser = sqlite.prepare(
                "SELECT status FROM users WHERE id = ?"
            ).get(userId) as {
                status: number;
            } | undefined;

            if (!currentUser || !currentUser.status) {
                socket.close(1008, "Conta inativa");
                return;
            }

            const sockets =
                activeConnections.get(userId) ?? new Set<any>();

            const wasOffline = sockets.size === 0;

            sockets.add(socket);
            activeConnections.set(userId, sockets);

            sendPresence(socket, "snapshot");

            if (wasOffline) {
                broadcastPresence(socket);
            }

            socket.on("close", () => {
                removeConnection(userId, socket);
            });

            socket.on("error", () => {
                removeConnection(userId, socket);
            });
        }
    );

    /*
     * Download do backup do banco de dados SQLite.
     *
     * A rota:
     * 1. Exige autenticação e nível 3 ou superior.
     * 2. Utiliza o caminho do banco realmente aberto pela aplicação.
     * 3. Cria um snapshot consistente em um diretório temporário.
     * 4. Envia o arquivo como download ao navegador.
     * 5. Remove o snapshot temporário depois do envio.
     *
     * Não recebe caminhos do cliente e não disponibiliza a raiz
     * do backend como diretório público.
     */
    fastify.get(
        "/settings/database/download",
        {
            onRequest: critical
        },
        async (_request, reply) => {
            let temporaryDirectory: string | null = null;

            try {
                if (
                    typeof databasePath !== "string" ||
                    !databasePath.trim() ||
                    databasePath === ":memory:"
                ) {
                    return reply.code(500).send({
                        message:
                            "O caminho do banco SQLite não está configurado para backup."
                    });
                }

                // Usa o caminho fornecido pelo módulo que abriu a conexão.
                const sourcePath = resolve(databasePath);

                // Confirma que o arquivo de origem existe e pode ser lido.
                await access(sourcePath, fsConstants.R_OK);

                const sourceStats = await stat(sourcePath);

                if (!sourceStats.isFile()) {
                    return reply.code(500).send({
                        message:
                            "O caminho configurado para o SQLite não é um arquivo válido."
                    });
                }

                // Cria um diretório temporário exclusivo para esta requisição.
                temporaryDirectory = await mkdtemp(
                    join(tmpdir(), "posso-ajudar-backup-")
                );

                const dateTag = new Date()
                    .toISOString()
                    .replace(/[:.]/g, "-");

                const filename =
                    `posso-ajudar-backup-${dateTag}.sqlite`;

                const snapshotPath = join(
                    temporaryDirectory,
                    filename
                );

                /*
                 * Faz backup pela API do SQLite para produzir um snapshot
                 * consistente, sem simplesmente copiar o arquivo ativo.
                 */
                await backup(sqlite, snapshotPath);

                const snapshotStats = await stat(snapshotPath);

                if (
                    !snapshotStats.isFile() ||
                    snapshotStats.size === 0
                ) {
                    throw new Error(
                        "O backup SQLite foi criado vazio ou inválido."
                    );
                }

                const stream = createReadStream(snapshotPath);

                let cleaned = false;

                const cleanup = () => {
                    if (cleaned || !temporaryDirectory) return;

                    cleaned = true;

                    const directoryToRemove = temporaryDirectory;
                    temporaryDirectory = null;

                    void rm(directoryToRemove, {
                        recursive: true,
                        force: true
                    }).catch((error: unknown) => {
                        fastify.log.warn(
                            {
                                err: error
                            },
                            "Não foi possível remover o diretório temporário do backup."
                        );
                    });
                };

                stream.once("close", cleanup);

                stream.once("error", (error: unknown) => {
                    fastify.log.error(
                        {
                            err: error
                        },
                        "Erro ao transmitir o backup SQLite."
                    );

                    cleanup();
                });

                return reply
                    .code(200)
                    .header(
                        "Content-Type",
                        "application/vnd.sqlite3"
                    )
                    .header(
                        "Content-Disposition",
                        `attachment; filename="${filename}"`
                    )
                    .header(
                        "Content-Length",
                        snapshotStats.size
                    )
                    .header(
                        "Cache-Control",
                        "no-store, no-cache, must-revalidate"
                    )
                    .header("Pragma", "no-cache")
                    .header("X-Content-Type-Options", "nosniff")
                    .send(stream);
            } catch (error) {
                if (temporaryDirectory) {
                    await rm(temporaryDirectory, {
                        recursive: true,
                        force: true
                    }).catch((cleanupError: unknown) => {
                        fastify.log.warn(
                            {
                                err: cleanupError
                            },
                            "Falha ao limpar o diretório temporário do backup."
                        );
                    });
                }

                fastify.log.error(
                    {
                        err: error
                    },
                    "Não foi possível gerar o backup SQLite."
                );

                return reply.code(500).send({
                    message:
                        "Não foi possível gerar o backup do banco de dados SQLite."
                });
            }
        }
    );

    fastify.get(
        "/settings/critical",
        {
            onRequest: critical
        },
        async () => {
            const company = getCurrentCompany();

            const fiscal = company
                ? getCurrentFiscalConfig(Number(company.id))
                : undefined;

            return {
                message: "Configurações críticas carregadas.",
                data: {
                    company: company ?? null,
                    fiscal: fiscal ?? null,
                    certificate: company
                        ? getCertificateMetadata(Number(company.id))
                        : {
                            exists: false,
                            status: false,
                            valid_from: null,
                            valid_until: null,
                            is_valid: false
                        },
                    users: sqlite.prepare(
                        `SELECT id, email, status
                         FROM users
                         ORDER BY email COLLATE NOCASE`
                    ).all()
                }
            };
        }
    );

    fastify.get(
        "/settings/system-config",
        {
            onRequest: critical
        },
        async () => {
            const pixKey = getCurrentCompany()?.["pix_key"];
            const roles = getCurrentRoles();
            const unitMeasure = getCurrentUnitMeasure();

            return {
                message: "Configurações do Sistema carregadas.",
                data: {
                    pix_key: pixKey ?? null,
                    roles: roles ?? null,
                    unit_measure: unitMeasure ?? null
                }
            };
        }
    );
}

module.exports = settings;