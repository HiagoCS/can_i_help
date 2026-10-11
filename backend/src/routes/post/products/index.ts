
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
        .filter(
            (word) =>
                word.length > 0 &&
                !ignoredWords.has(word) &&
                !/^\d+$/.test(word)
        )
        .map((word) => word[0])
        .join("");

    const numbers = words
        .filter((word) => /^\d+$/.test(word))
        .join("");

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

/**
 * Garante uma unidade de medida válida para a chave estrangeira products.unit_id.
 *
 * A unidade UN é preferida. Se ela ainda não existir, será criada.
 * O ID nunca é presumido: sempre é obtido do banco.
 *
 * Deve ser chamada dentro da transação de cadastro.
 */
function getOrCreateDefaultUnitMeasure(): {
    id: number;
    unity: string;
} {
    const existingUnit = sqlite.prepare(`
        SELECT id, unity
        FROM un_measure
        WHERE UPPER(TRIM(unity)) IN ('UN', 'UNIDADE')
        ORDER BY
            CASE
                WHEN UPPER(TRIM(unity)) = 'UN' THEN 0
                ELSE 1
            END
        LIMIT 1
    `).get() as {
        id: number;
        unity: string;
    } | undefined;

    if (existingUnit) {
        return {
            id: Number(existingUnit.id),
            unity: existingUnit.unity
        };
    }

    const result = sqlite.prepare(`
        INSERT INTO un_measure (unity, description)
        VALUES (?, ?)
    `).run("UN", "Unidade");

    return {
        id: Number(result.lastInsertRowid),
        unity: "UN"
    };
}

function publicProduct(product: any) {
    if (!product) return product;

    const {
        id,
        sm_code,
        bar_code,
        name,
        description,
        value,
        cost,
        amount,
        status
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

/**
 * Recupera os campos operacionais e a unidade relacionada.
 * O JOIN garante que o histórico receba a unidade real do produto.
 */
function getProductForInternalUse(id: number | string) {
    return sqlite.prepare(`
        SELECT
            p.id,
            p.sm_code,
            p.bar_code,
            p.name,
            p.description,
            p.value,
            p.cost,
            p.amount,
            p.unit_id,
            p.status,
            um.unity AS unit_measure
        FROM products p
        INNER JOIN un_measure um
            ON um.id = p.unit_id
        WHERE p.id = ?
    `).get(id);
}

async function products(fastify: FastifyInstance) {
    fastify.post(
        "/product/new",
        {
            onRequest: [
                fastify.authenticate,
                fastify.authorize(3)
            ]
        },
        async (request, reply) => {
            const body = (request.body ?? {}) as {
                sm_code?: string | null;
                bar_code?: string | null;
                name?: string;
                cost?: number | string | null;
                value?: number | string | null;
                amount?: number | string | null;
            };

            const name = String(body.name ?? "").trim();

            if (!name) {
                return reply.code(400).send({
                    message: "Informe o nome do produto."
                });
            }

            const valueResult = parseOptionalNumber(
                body.value,
                "Value",
                0
            );

            if (valueResult.error) {
                return reply.code(400).send({
                    message: valueResult.error
                });
            }

            const costResult = parseOptionalNumber(
                body.cost,
                "Cost",
                0
            );

            if (costResult.error) {
                return reply.code(400).send({
                    message: costResult.error
                });
            }

            const amountResult = parseOptionalNumber(
                body.amount,
                "Amount",
                0
            );

            if (amountResult.error) {
                return reply.code(400).send({
                    message: amountResult.error
                });
            }

            if (
                Number(valueResult.value) < 0 ||
                Number(costResult.value) < 0 ||
                Number(amountResult.value) < 0
            ) {
                return reply.code(400).send({
                    message: "Custo, valor e quantidade não podem ser negativos."
                });
            }

            const finalValue = String(valueResult.value);
            const finalCost = String(costResult.value);

            // O estoque inicial é registrado como uma movimentação.
            const initialAmount = Math.trunc(
                amountResult.value ?? 0
            );

            const finalAmount = String(initialAmount);

            const suppliedSmCode = body.sm_code;

            let finalSmCode =
                suppliedSmCode == null
                    ? generateSmCode(name)
                    : suppliedSmCode.trim().toUpperCase();

            if (!finalSmCode) {
                finalSmCode = generateSmCode(name);
            }

            const suppliedBarCode = body.bar_code;

            let finalBarCode =
                suppliedBarCode == null
                    ? generateBarCode()
                    : suppliedBarCode.trim();

            if (!finalBarCode) {
                finalBarCode = generateBarCode();
            }

            const existingSmCode = sqlite.prepare(
                "SELECT id FROM products WHERE sm_code = ?"
            ).get(finalSmCode);

            if (existingSmCode) {
                return reply.code(409).send({
                    message: "O código reduzido já está cadastrado."
                });
            }

            const existingBarCode = sqlite.prepare(
                "SELECT id FROM products WHERE bar_code = ?"
            ).get(finalBarCode);

            if (existingBarCode) {
                return reply.code(409).send({
                    message: "O código de barras já está cadastrado."
                });
            }

            let transactionStarted = false;

            try {
                sqlite.exec("BEGIN IMMEDIATE");
                transactionStarted = true;

                /*
                 * Corrige a chave estrangeira:
                 * não presumimos que exista un_measure.id = 1.
                 * Recuperamos ou criamos uma unidade válida e utilizamos
                 * explicitamente seu ID em products.unit_id.
                 */
                const unitMeasure = getOrCreateDefaultUnitMeasure();

                /*
                 * O produto começa com estoque zero para que a movimentação
                 * inicial registre a quantidade correta, sem duplicá-la
                 * no histórico de estoque.
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
                        unit_id,
                        status
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    finalSmCode,
                    finalBarCode,
                    name,
                    null,
                    finalValue,
                    finalCost,
                    "0",
                    unitMeasure.id,
                    1
                );

                const productId = Number(
                    result.lastInsertRowid
                );

                const productBeforeMovement =
                    getProductForInternalUse(productId);

                if (!productBeforeMovement) {
                    throw new Error(
                        "O produto foi inserido, mas não pôde ser recuperado."
                    );
                }

                /*
                 * Registra a entrada inicial no histórico.
                 * Como o estoque atual está zerado neste momento,
                 * a quantidade adicionada e o saldo registrado ficam corretos.
                 */
                recordProductMovement(
                    productBeforeMovement,
                    "create",
                    initialAmount,
                    0,
                    {
                        notes: "Estoque inicial do cadastro.",
                        unitMeasure: unitMeasure.unity
                    }
                );

                // Atualiza o estoque atual após registrar a entrada.
                sqlite.prepare(`
                    UPDATE products
                    SET amount = ?
                    WHERE id = ?
                `).run(
                    finalAmount,
                    productId
                );

                const product = getProductForInternalUse(productId);

                if (!product) {
                    throw new Error(
                        "O produto cadastrado não pôde ser recuperado."
                    );
                }

                sqlite.exec("COMMIT");
                transactionStarted = false;

                return reply.code(201).send({
                    message: "Produto cadastrado com sucesso.",
                    data: publicProduct(product)
                });
            } catch (error: any) {
                if (transactionStarted) {
                    try {
                        sqlite.exec("ROLLBACK");
                    } catch (rollbackError) {
                        request.log.error(
                            { err: rollbackError },
                            "Erro ao desfazer o cadastro do produto."
                        );
                    }
                }

                const message = String(error?.message ?? "");

                if (message.includes("UNIQUE constraint failed")) {
                    return reply.code(409).send({
                        message: "O código reduzido ou o código de barras já está cadastrado."
                    });
                }

                if (message.includes("FOREIGN KEY constraint failed")) {
                    request.log.error(
                        { err: error },
                        "Falha de chave estrangeira ao cadastrar produto."
                    );

                    return reply.code(409).send({
                        message: "Não foi possível cadastrar o produto porque uma unidade de medida relacionada não existe."
                    });
                }

                request.log.error(
                    { err: error },
                    "Erro ao cadastrar produto"
                );

                return reply.code(500).send({
                    message: "Não foi possível cadastrar o produto."
                });
            }
        }
    );

    fastify.post(
        "/product/:id/stock-movement",
        {
            onRequest: [
                fastify.authenticate,
                fastify.authorize(3)
            ]
        },
        async (request, reply) => {
            const { id: rawId } = request.params as {
                id: string;
            };

            const id = Number(rawId);

            const body = (request.body ?? {}) as {
                direction?: string;
                quantity?: string | number;
                notes?: string | null;
            };

            const quantity = Number(body.quantity);
            const direction = String(body.direction ?? "");

            if (!Number.isSafeInteger(id) || id <= 0) {
                return reply.code(400).send({
                    message: "Identificador do produto inválido."
                });
            }

            if (
                !Number.isInteger(quantity) ||
                quantity <= 0 ||
                !["add", "remove"].includes(direction)
            ) {
                return reply.code(400).send({
                    message: "Informe uma direção válida e uma quantidade inteira maior que zero."
                });
            }

            const product = getProductForInternalUse(id) as any;

            if (!product) {
                return reply.code(404).send({
                    message: "Produto não encontrado."
                });
            }

            const amount = Number(product.amount) || 0;
            const adding = direction === "add";

            if (!adding && quantity > amount) {
                return reply.code(409).send({
                    message: "A quantidade em estoque não pode ficar negativa."
                });
            }

            let transactionStarted = false;

            try {
                sqlite.exec("BEGIN IMMEDIATE");
                transactionStarted = true;

                recordProductMovement(
                    product,
                    adding ? "stock_add" : "stock_remove",
                    adding ? quantity : 0,
                    adding ? 0 : quantity,
                    {
                        notes: String(body.notes ?? "").trim() || null,
                        unitMeasure: product.unit_measure
                    }
                );

                const nextAmount = amount + (
                    adding ? quantity : -quantity
                );

                sqlite.prepare(`
                    UPDATE products
                    SET amount = ?
                    WHERE id = ?
                `).run(
                    String(nextAmount),
                    id
                );

                sqlite.exec("COMMIT");
                transactionStarted = false;

                return {
                    message: "Estoque atualizado.",
                    data: publicProduct(
                        getProductForInternalUse(id)
                    )
                };
            } catch (error: any) {
                if (transactionStarted) {
                    try {
                        sqlite.exec("ROLLBACK");
                    } catch {
                        // A transação pode já ter sido encerrada.
                    }
                }

                request.log.error(
                    { err: error },
                    "Erro ao movimentar estoque"
                );

                return reply.code(500).send({
                    message: "Não foi possível registrar a movimentação de estoque."
                });
            }
        }
    );
}

module.exports = products;
