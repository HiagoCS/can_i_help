import type { FastifyInstance } from "fastify";
const { sqlite } = require("../../../db/index");
function getCurrentCompany() {
    return sqlite.prepare("SELECT * FROM company ORDER BY id LIMIT 1").get() as Record<string, any> | undefined;
}

async function settings(fastify: FastifyInstance) {
    const critical = [fastify.authenticate, fastify.authorize(3)];
    fastify.delete( "/settings/certificate",
        { onRequest: critical },
        async (_request: any, reply: any) => {
            const { unlink } = require("node:fs/promises");
            const path = require("node:path");

            const company = getCurrentCompany();

            if (!company) {
                return reply.code(404).send({
                    message: "Empresa não cadastrada.",
                });
            }

            try {
                const certificate = sqlite
                    .prepare(`
                    SELECT id, certificate
                    FROM fiscal_certificates
                    WHERE company_id = ?
                    ORDER BY id DESC
                    LIMIT 1
                `)
                    .get(company.id) as {
                        id: number;
                        certificate: string | null;
                    } | undefined;

                if (!certificate) {
                    return reply.code(204).send();
                }

                // Localiza o arquivo salvo pela rota PUT.
                const certificateDirectory = path.resolve(
                    process.cwd(),
                    "storage",
                    "certificate"
                );

                const certificatePath = path.resolve(
                    certificateDirectory,
                    `${certificate.id}`
                );

                // Remove os arquivos de certificado da empresa.
                // Como o caminho não está armazenado no banco,
                // identifica os arquivos pelo diretório e extensão.
                const { readdir } = require("node:fs/promises");
                const files = await readdir(certificateDirectory).catch(
                    () => [] as string[]
                );

                for (const filename of files) {
                    if (!/\.(pfx|p12)$/i.test(filename)) continue;

                    await unlink(path.join(certificateDirectory, filename))
                        .catch((error: any) => {
                            if (error.code !== "ENOENT") throw error;
                        });
                }

                sqlite.prepare(`
                UPDATE fiscal_certificates
                SET certificate = '',
                    password = '',
                    valid_from = NULL,
                    valid_until = NULL,
                    status = 0
                WHERE company_id = ?
            `).run(company.id);

                return reply.code(204).send();
            } catch (error: any) {
                _request.log?.error(error);

                return reply.code(500).send({
                    message: "Não foi possível remover o certificado.",
                });
            }
        }
    );
}

module.exports = settings;
