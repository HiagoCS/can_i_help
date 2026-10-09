import type { FastifyInstance } from "fastify";

const { sqlite } = require("../../../db/index");

/**
 * Gera um código de barras EAN-13 válido.
 * O formato não garante registro oficial na GS1.
 */
function generateBarCode(): string {
    while (true) {
        const base = "789" +
            Array.from(
                { length: 9 },
                () => Math.floor(Math.random() * 10)
            ).join("");

        let sum = 0;

        for (let i = 0; i < 12; i++) {
            const digit = Number(base[i]);
            sum += digit * (i % 2 === 0 ? 1 : 3);
        }

        const checkDigit = (10 - (sum % 10)) % 10;
        const barCode = base + checkDigit;

        const existing = sqlite
            .prepare(`
                SELECT id
                FROM services
                WHERE bar_code = ?
            `)
            .get(barCode);

        if (!existing) {
            return barCode;
        }
    }
}

/**
 * Gera o SM Code pelas iniciais do nome do serviço.
 */
function generateSmCode(name: string): string {
    const words = name
        .trim()
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .split(/\s+/);

    const ignoredWords = new Set([
        "DE", "DA", "DO", "DAS", "DOS", "E"
    ]);

    const initials = words
        .filter((word) =>
            word.length > 0 &&
            !ignoredWords.has(word) &&
            !/^\d+$/.test(word)
        )
        .map((word) => word[0])
        .join("");

    const numbers = words
        .filter((word) => /^\d+$/.test(word))
        .join("");

    const prefix = initials || "SRV";

    if (numbers) {
        const smCode = `${prefix}${numbers}`;

        if (!sqlite.prepare(`
            SELECT id FROM services WHERE sm_code = ?
        `).get(smCode)) {
            return smCode;
        }
    }

    let counter = 1;

    while (true) {
        const smCode = `${prefix}${String(counter).padStart(3, "0")}`;

        if (!sqlite.prepare(`
            SELECT id FROM services WHERE sm_code = ?
        `).get(smCode)) {
            return smCode;
        }

        counter++;
    }
}

async function services(fastify: FastifyInstance) {
    fastify.post(
        "/service/new",
        {
            onRequest: [
                fastify.authenticate,
                fastify.authorize(3)
            ]
        },
        async (request, reply) => {
            const {
                sm_code,
                bar_code,
                name,
                description,
                cost,
                products: serviceProducts,
                status
            } = request.body as {
                sm_code?: string | null;
                bar_code?: string | null;
                name?: string;
                description?: string | null;
                cost?: number | string | null;
                products?: {
                    product_id: number;
                    qunt: number;
                }[];
                status?: number | boolean;
            };

            // ========================
            // VALIDAR NOME
            // ========================

            if (!name?.trim()) {
                return reply.code(400).send({
                    message: "O nome do serviço é obrigatório."
                });
            }

            // ========================
            // VALIDAR CUSTO
            // ========================

            const numericCost =
                cost === undefined || cost === null
                    ? 0
                    : Number(cost);

            if (
                !Number.isFinite(numericCost) ||
                numericCost < 0
            ) {
                return reply.code(400).send({
                    message: "Informe um custo válido para o serviço."
                });
            }

            const finalCost = numericCost.toFixed(2);

            // ========================
            // VALIDAR PRODUTOS
            // ========================

            if (
                serviceProducts !== undefined &&
                !Array.isArray(serviceProducts)
            ) {
                return reply.code(400).send({
                    message: "O campo products deve ser um array."
                });
            }

            const finalProducts = serviceProducts ?? [];
            const seenProductIds = new Set<number>();

            for (const item of finalProducts) {
                const productId = Number(item.product_id);
                const quantity = Number(item.qunt);

                if (
                    !Number.isInteger(productId) ||
                    productId <= 0 ||
                    !Number.isInteger(quantity) ||
                    quantity <= 0
                ) {
                    return reply.code(400).send({
                        message:
                            "Cada produto deve possuir product_id válido e qunt inteira maior que zero."
                    });
                }

                if (seenProductIds.has(productId)) {
                    return reply.code(400).send({
                        message:
                            `O produto ${productId} foi informado mais de uma vez.`
                    });
                }

                seenProductIds.add(productId);

                const product = sqlite.prepare(`
                    SELECT id
                    FROM products
                    WHERE id = ? AND status = 1
                `).get(productId);

                if (!product) {
                    return reply.code(400).send({
                        message:
                            `O produto ${productId} não existe ou está inativo.`
                    });
                }
            }

            // ========================
            // GERAR CÓDIGOS
            // ========================

            let finalSmCode =
                String(sm_code ?? "").trim().toUpperCase();

            if (!finalSmCode) {
                finalSmCode = generateSmCode(name);
            }

            let finalBarCode = String(bar_code ?? "").trim();

            if (!finalBarCode) {
                finalBarCode = generateBarCode();
            }

            if (sqlite.prepare(`
                SELECT id FROM services WHERE sm_code = ?
            `).get(finalSmCode)) {
                return reply.code(409).send({
                    message: "O código SM já está cadastrado para outro serviço."
                });
            }

            if (sqlite.prepare(`
                SELECT id FROM services WHERE bar_code = ?
            `).get(finalBarCode)) {
                return reply.code(409).send({
                    message: "O código de barras já está cadastrado para outro serviço."
                });
            }

            // ========================
            // CRIAR SERVIÇO E VÍNCULOS
            // ========================

            try {
                sqlite.exec("BEGIN IMMEDIATE");

                const result = sqlite.prepare(`
                    INSERT INTO services (
                        sm_code,
                        bar_code,
                        name,
                        description,
                        cost,
                        status
                    )
                    VALUES (?, ?, ?, ?, ?, ?)
                `).run(
                    finalSmCode,
                    finalBarCode,
                    name.trim(),
                    description?.trim() || null,
                    finalCost,
                    status === undefined ? 1 : Number(Boolean(status))
                );

                const serviceId = Number(result.lastInsertRowid);

                const insertProduct = sqlite.prepare(`
                    INSERT INTO stock_service (
                        service_id,
                        product_id,
                        qunt
                    )
                    VALUES (?, ?, ?)
                `);

                for (const item of finalProducts) {
                    insertProduct.run(
                        serviceId,
                        Number(item.product_id),
                        Number(item.qunt)
                    );
                }

                sqlite.exec("COMMIT");

                // ========================
                // RETORNAR SERVIÇO COMPLETO
                // ========================

                const service = sqlite.prepare(`
                    SELECT
                        id,
                        sm_code,
                        bar_code,
                        name,
                        description,
                        cost,
                        status
                    FROM services
                    WHERE id = ?
                `).get(serviceId) as Record<string, any>;

                const linkedProducts = sqlite.prepare(`
                    SELECT
                        p.id,
                        p.sm_code,
                        p.bar_code,
                        p.name,
                        p.description,
                        p.value,
                        p.cost,
                        p.amount,
                        um.unity AS unit_measure,
                        ss.qunt
                    FROM stock_service ss
                    INNER JOIN products p
                        ON p.id = ss.product_id
                    LEFT JOIN un_measure um
                        ON um.id = p.unit_id
                    WHERE ss.service_id = ?
                    ORDER BY p.name COLLATE NOCASE ASC
                `).all(serviceId);

                // Calcula o valor do serviço:
                // custo do serviço + (quantidade × valor de cada produto).
                const productsValue = linkedProducts.reduce(
                    (total: number, product: any) =>
                        total +
                        Number(product.qunt) * Number(product.value ?? 0),
                    0
                );

                const serviceValue =
                    Number(service.cost ?? 0) + productsValue;

                return reply.code(201).send({
                    message: "Serviço criado com sucesso.",
                    data: {
                        ...service,
                        value: Number(serviceValue.toFixed(2)),
                        products: linkedProducts
                    }
                });
            } catch (error) {
                try {
                    sqlite.exec("ROLLBACK");
                } catch {
                    // A transação pode já ter sido encerrada.
                }

                request.log.error(error);

                return reply.code(500).send({
                    message: "Não foi possível cadastrar o serviço."
                });
            }
        }
    );
}

module.exports = services;