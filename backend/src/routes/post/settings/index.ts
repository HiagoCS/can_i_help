import type { FastifyInstance } from "fastify";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { Buffer } = require("node:buffer");
const { sqlite } = require("../../../db/index");
const maximumAvatarSize = 2 * 1024 * 1024;
function cleanText(value: unknown, maximumLength = 180) {
    return typeof value === "string" ? value.trim().slice(0, maximumLength) : "";
}

async function settings(fastify: FastifyInstance) {
    const authenticated = [fastify.authenticate];
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
