import type { FastifyInstance } from "fastify";

const { sqlite } = require("../../../db/index");
const { recordProductMovement } = require("../../../db/product_stock");

/**
 * Gera um EAN-13 estruturalmente válido para uso interno.
 * O código não representa um GTIN oficialmente registrado pela GS1.
 */
function generateBarCode(): string {
    while (true) {
        const prefix = "789";
        let random = "";

        for (let i = 0; i < 9; i++) {
            random += Math.floor(Math.random() * 10);
        }

        const base = prefix + random;
        let sum = 0;

        for (let i = 0; i < 12; i++) {
            const digit = Number(base[i]);
            sum += i % 2 === 0 ? digit : digit * 3;
        }

        const checkDigit = (10 - (sum % 10)) % 10;
        const barCode = base + checkDigit;

        const existing = sqlite.prepare(
            "SELECT id FROM products WHERE bar_code = ?"
        ).get(barCode);

        if (!existing) return barCode;
    }
}

/** Gera o código interno a partir das iniciais do nome do produto. */
function generateSmCode(name: string): string {
    const words = name
        .trim()
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .split(/\s+/);

    const ignoredWords = new Set(["DE", "DA", "DO", "DAS", "DOS", "E"]);
    const initials = words
        .filter((word) => word.length > 0 && !ignoredWords.has(word) && !/^\d+$/.test(word))
        .map((word) => word[0])
        .join("");
    const numbers = words.filter((word) => /^\d+$/.test(word)).join("");
    const prefix = initials || "PRD";

    if (numbers) {
        const candidate = `${prefix}${numbers}`;
        const existing = sqlite.prepare(
            "SELECT id FROM products WHERE sm_code = ?"
        ).get(candidate);
        if (!existing) return candidate;
    }

    let counter = 1;
    while (true) {
        const candidate = `${prefix}${String(counter).padStart(3, "0")}`;
        const existing = sqlite.prepare(
            "SELECT id FROM products WHERE sm_code = ?"
        ).get(candidate);
        if (!existing) return candidate;
        counter++;
    }
}

function parseOptionalNumber(
    value: unknown,
    fieldName: string,
    defaultValue: number
): { value?: number; error?: string } {
    if (value === undefined || value === null || value === "") {
        return { value: defaultValue };
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return { error: `${fieldName} must be a valid number` };
    }

    return { value: parsed };
}

function publicProduct(product: any) {
    if (!product) return product;

    // Retorna somente os campos necessários ao controle interno.
    const {
        id,
        sm_code,
        bar_code,
        name,
        description,
        value,
        cost,
        amount,
        status,
        ..._ignored
    } = product;

    return {
        id,
        sm_code,
        bar_code,
        name,
        description,
        value,
        cost,
        amount,
        status
    };
}

function getProductForInternalUse(id: number | string) {
    return sqlite.prepare(`
        SELECT
            id,
            sm_code,
            bar_code,
            name,
            description,
            value,
            cost,
            amount,
            status
        FROM products
        WHERE id = ?
    `).get(id);
}

async function products(fastify: FastifyInstance) {
    fastify.post(
        "/product/new",
        {
            onRequest: [fastify.authenticate, fastify.authorize(3)]
        },
        async (request, reply) => {
            const body = (request.body ?? {}) as {
                sm_code?: string | null;
                bar_code?: string | null;
                name?: string;
                description?: string | null;
                value?: number | string | null;
                cost?: number | string | null;
                amount?: number | string | null;
                status?: number | boolean | null;
            };

            const name = String(body.name ?? "").trim();
            if (!name) {
                return reply.code(400).send({ message: "Name is required" });
            }

            const valueResult = parseOptionalNumber(body.value, "Value", 0);
            if (valueResult.error) {
                return reply.code(400).send({ message: valueResult.error });
            }

            const costResult = parseOptionalNumber(body.cost, "Cost", 0);
            if (costResult.error) {
                return reply.code(400).send({ message: costResult.error });
            }

            const amountResult = parseOptionalNumber(body.amount, "Amount", 0);
            if (amountResult.error) {
                return reply.code(400).send({ message: amountResult.error });
            }

            const finalValue = String(valueResult.value);
            const finalCost = String(costResult.value);
            // Estoque é mantido em unidades inteiras, conforme o comportamento anterior.
            const finalAmount = String(Math.trunc(amountResult.value ?? 0));

            const suppliedSmCode = body.sm_code;
            let finalSmCode = suppliedSmCode == null
                ? generateSmCode(name)
                : suppliedSmCode.trim().toUpperCase();
            if (!finalSmCode) finalSmCode = generateSmCode(name);

            const suppliedBarCode = body.bar_code;
            let finalBarCode = suppliedBarCode == null
                ? generateBarCode()
                : suppliedBarCode.trim();
            if (!finalBarCode) finalBarCode = generateBarCode();

            const existingSmCode = sqlite.prepare(
                "SELECT id FROM products WHERE sm_code = ?"
            ).get(finalSmCode);
            if (existingSmCode) {
                return reply.code(409).send({ message: "SM code already registered" });
            }

            const existingBarCode = sqlite.prepare(
                "SELECT id FROM products WHERE bar_code = ?"
            ).get(finalBarCode);
            if (existingBarCode) {
                return reply.code(409).send({ message: "Bar code already registered" });
            }

            const rawStatus = body.status;
            const status = rawStatus == null
                ? 1
                : (rawStatus === true || Number(rawStatus) === 1 ? 1 : 0);

            try {
                /*
                 * Somente campos operacionais são gravados neste endpoint.
                 * Colunas legadas que possam existir no banco são omitidas.
                 */
                const result = sqlite.prepare(`
                    INSERT INTO products (
                        sm_code,
                        bar_code,
                        name,
                        description,
                        value,
                        cost,
                        amount,
                        status
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    finalSmCode,
                    finalBarCode,
                    name,
                    body.description?.trim() || null,
                    finalValue,
                    finalCost,
                    finalAmount,
                    status
                );

                const product = getProductForInternalUse(Number(result.lastInsertRowid));
                if (!product) {
                    throw new Error("O produto foi inserido, mas não pôde ser recuperado.");
                }

                recordProductMovement(product, "create", Number(finalAmount), 0);

                return reply.code(201).send({
                    message: "Product created successfully",
                    data: publicProduct(product)
                });
            } catch (error: any) {
                if (String(error?.message ?? "").includes("UNIQUE constraint failed")) {
                    return reply.code(409).send({
                        message: "SM code or bar code already registered"
                    });
                }
                request.log.error({ err: error }, "Erro ao cadastrar produto");
                return reply.code(500).send({
                    message: "Não foi possível cadastrar o produto."
                });
            }
        }
    );

    fastify.post(
        "/product/:id/stock-movement",
        { onRequest: [fastify.authenticate, fastify.authorize(3)] },
        async (request, reply) => {
            const { id: rawId } = request.params as { id: string };
            const id = Number(rawId);
            const body = (request.body ?? {}) as {
                direction?: string;
                quantity?: string | number;
                notes?: string | null;
            };
            const quantity = Number(body.quantity);
            const direction = String(body.direction ?? "");

            if (!Number.isSafeInteger(id) || id <= 0) {
                return reply.code(400).send({ message: "Identificador do produto inválido." });
            }

            if (!Number.isInteger(quantity) || quantity <= 0 || !["add", "remove"].includes(direction)) {
                return reply.code(400).send({
                    message: "Informe uma direção válida e uma quantidade inteira maior que zero."
                });
            }

            const product = getProductForInternalUse(id) as any;
            if (!product) {
                return reply.code(404).send({ message: "Produto não encontrado." });
            }

            const amount = Number(product.amount) || 0;
            const adding = direction === "add";
            if (!adding && quantity > amount) {
                return reply.code(409).send({
                    message: "A quantidade em estoque não pode ficar negativa."
                });
            }

            try {
                sqlite.exec("BEGIN IMMEDIATE");
                recordProductMovement(
                    product,
                    adding ? "stock_add" : "stock_remove",
                    adding ? quantity : 0,
                    adding ? 0 : quantity,
                    { notes: String(body.notes ?? "").trim() || null }
                );

                const nextAmount = amount + (adding ? quantity : -quantity);
                sqlite.prepare("UPDATE products SET amount = ? WHERE id = ?")
                    .run(String(nextAmount), id);
                sqlite.exec("COMMIT");

                return {
                    message: "Estoque atualizado.",
                    data: publicProduct(getProductForInternalUse(id))
                };
            } catch (error: any) {
                try {
                    sqlite.exec("ROLLBACK");
                } catch {
                    // A transação pode já ter sido encerrada.
                }
                request.log.error({ err: error }, "Erro ao movimentar estoque");
                return reply.code(500).send({
                    message: "Não foi possível registrar a movimentação de estoque."
                });
            }
        }
    );
}

module.exports = products;
