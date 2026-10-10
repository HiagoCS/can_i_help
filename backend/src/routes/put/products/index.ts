import type { FastifyInstance } from "fastify";

const { sqlite } = require("../../../db/index");
const { recordProductMovement } = require("../../../db/product_stock");

type ProductOperationalRow = {
    id: number;
    sm_code: string;
    bar_code: string;
    name: string;
    description: string | null;
    value: string | number | null;
    cost: string | number | null;
    amount: string | number | null;
    status: number | boolean;
    unit_measure?: string | null;
    [key: string]: any;
};

function toFiniteNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

async function products(fastify: FastifyInstance) {
    fastify.put(
        "/product/:id",
        {
            onRequest: [
                fastify.authenticate,
                fastify.authorize(3)
            ]
        },
        async (request, reply) => {
            const { id: rawId } = request.params as { id: string };
            const productId = Number(rawId);

            if (!Number.isSafeInteger(productId) || productId <= 0) {
                return reply.code(400).send({
                    message: "Identificador do produto inválido."
                });
            }

            const body = request.body;
            if (!body || typeof body !== "object" || Array.isArray(body)) {
                return reply.code(400).send({
                    message: "Informe os dados válidos do produto."
                });
            }

            const {
                sm_code,
                bar_code,
                name,
                description,
                value,
                cost,
                amount,
                status
            } = body as {
                sm_code?: string | null;
                bar_code?: string | null;
                name?: string;
                description?: string | null;
                value?: number | string | null;
                cost?: number | string | null;
                amount?: number | string | null;
                status?: number | boolean | null;
            };

            // Busca somente os campos operacionais necessários à atualização.
            const product = sqlite.prepare(`
                SELECT
                    p.id,
                    p.sm_code,
                    p.bar_code,
                    p.name,
                    p.description,
                    p.value,
                    p.cost,
                    p.amount,
                    p.status,
                    um.unity AS unit_measure
                FROM products p
                LEFT JOIN un_measure um
                    ON um.id = p.unit_id
                WHERE p.id = ?
                LIMIT 1
            `).get(productId) as ProductOperationalRow | undefined;

            if (!product) {
                return reply.code(404).send({
                    message: "Produto não encontrado."
                });
            }

            let convertedValue: string | null = null;
            if (value !== undefined && value !== null) {
                const numericValue = toFiniteNumber(value);
                if (numericValue === null || numericValue < 0) {
                    return reply.code(400).send({
                        message: "O preço de venda deve ser um número válido maior ou igual a zero."
                    });
                }
                convertedValue = String(numericValue);
            }

            let convertedCost: string | null = null;
            if (cost !== undefined && cost !== null) {
                const numericCost = toFiniteNumber(cost);
                if (numericCost === null || numericCost < 0) {
                    return reply.code(400).send({
                        message: "O custo deve ser um número válido maior ou igual a zero."
                    });
                }
                convertedCost = String(numericCost);
            }

            let convertedAmount: string | null = null;
            if (amount !== undefined && amount !== null) {
                const numericAmount = toFiniteNumber(amount);
                if (numericAmount === null || numericAmount < 0) {
                    return reply.code(400).send({
                        message: "A quantidade em estoque deve ser um número válido maior ou igual a zero."
                    });
                }
                convertedAmount = String(Math.trunc(numericAmount));
            }

            let normalizedSmCode: string | null = null;
            if (sm_code !== undefined) {
                if (sm_code === null || !sm_code.trim()) {
                    return reply.code(400).send({
                        message: "O código interno não pode ficar vazio."
                    });
                }

                normalizedSmCode = sm_code.trim().toUpperCase();
                const existingSmCode = sqlite.prepare(`
                    SELECT id
                    FROM products
                    WHERE sm_code = ? AND id <> ?
                    LIMIT 1
                `).get(normalizedSmCode, productId);

                if (existingSmCode) {
                    return reply.code(409).send({
                        message: "Este código interno já está cadastrado."
                    });
                }
            }

            let normalizedBarCode: string | null = null;
            if (bar_code !== undefined) {
                if (bar_code === null || !bar_code.trim()) {
                    return reply.code(400).send({
                        message: "O código de barras não pode ficar vazio."
                    });
                }

                normalizedBarCode = bar_code.trim();
                const existingBarCode = sqlite.prepare(`
                    SELECT id
                    FROM products
                    WHERE bar_code = ? AND id <> ?
                    LIMIT 1
                `).get(normalizedBarCode, productId);

                if (existingBarCode) {
                    return reply.code(409).send({
                        message: "Este código de barras já está cadastrado."
                    });
                }
            }

            let normalizedName: string | null = null;
            if (name !== undefined) {
                if (typeof name !== "string" || !name.trim()) {
                    return reply.code(400).send({
                        message: "O nome do produto não pode ficar vazio."
                    });
                }
                normalizedName = name.trim();
            }

            let normalizedDescription: string | null = null;
            if (description !== undefined) {
                if (description !== null && typeof description !== "string") {
                    return reply.code(400).send({
                        message: "A descrição deve ser um texto válido."
                    });
                }
                normalizedDescription = description?.trim() || null;
            }

            let normalizedStatus: number | null = null;
            if (status !== undefined && status !== null) {
                if (![0, 1, false, true].includes(status)) {
                    return reply.code(400).send({
                        message: "O status do produto deve ser ativo ou inativo."
                    });
                }
                normalizedStatus = status === true ? 1 : status === false ? 0 : status;
            }

            const oldAmount = Number(product.amount) || 0;
            const nextAmount =
                amount === undefined || amount === null
                    ? oldAmount
                    : Math.max(0, Math.trunc(Number(amount)));
            const amountDifference = nextAmount - oldAmount;

            sqlite.exec("BEGIN IMMEDIATE");
            try {
                if (amountDifference > 0) {
                    recordProductMovement(
                        product,
                        "stock_add",
                        amountDifference,
                        0,
                        { unitMeasure: product.unit_measure || "UN" }
                    );
                } else if (amountDifference < 0) {
                    recordProductMovement(
                        product,
                        "stock_remove",
                        0,
                        Math.abs(amountDifference),
                        { unitMeasure: product.unit_measure || "UN" }
                    );
                }

                sqlite.prepare(`
                    UPDATE products
                    SET
                        sm_code = COALESCE(?, sm_code),
                        bar_code = COALESCE(?, bar_code),
                        name = COALESCE(?, name),
                        description = CASE
                            WHEN ? = 1 THEN ?
                            ELSE description
                        END,
                        value = COALESCE(?, value),
                        cost = COALESCE(?, cost),
                        amount = COALESCE(?, amount),
                        status = COALESCE(?, status)
                    WHERE id = ?
                `).run(
                    normalizedSmCode,
                    normalizedBarCode,
                    normalizedName,
                    description !== undefined ? 1 : 0,
                    normalizedDescription,
                    convertedValue,
                    convertedCost,
                    convertedAmount,
                    normalizedStatus,
                    productId
                );

                const shouldRecordEdit =
                    status !== undefined ||
                    sm_code !== undefined ||
                    bar_code !== undefined ||
                    name !== undefined ||
                    description !== undefined ||
                    value !== undefined ||
                    cost !== undefined;

                if (shouldRecordEdit) {
                    // Snapshot limitado a dados operacionais; não carrega campos fiscais legados.
                    const snapshot = sqlite.prepare(`
                        SELECT
                            p.id,
                            p.sm_code,
                            p.bar_code,
                            p.name,
                            p.description,
                            p.value,
                            p.cost,
                            p.amount,
                            p.status,
                            um.unity AS unit_measure
                        FROM products p
                        LEFT JOIN un_measure um
                            ON um.id = p.unit_id
                        WHERE p.id = ?
                    `).get(productId) as ProductOperationalRow;

                    const movementType = normalizedStatus === 0
                        ? "deactivate"
                        : "edit";

                    recordProductMovement(
                        snapshot,
                        movementType,
                        0,
                        0,
                        { unitMeasure: snapshot.unit_measure || "UN" }
                    );
                }

                sqlite.exec("COMMIT");
            } catch (error) {
                try {
                    sqlite.exec("ROLLBACK");
                } catch {
                    // A transação pode já ter sido encerrada.
                }

                request.log.error(
                    { err: error, productId },
                    "Não foi possível atualizar o produto."
                );

                return reply.code(409).send({
                    message: "Não foi possível atualizar o produto. Verifique os dados informados."
                });
            }

            const updatedProduct = sqlite.prepare(`
                SELECT
                    p.id,
                    p.sm_code,
                    p.bar_code,
                    p.name,
                    p.description,
                    p.value,
                    p.cost,
                    p.amount,
                    p.status,
                    um.unity AS unit_measure
                FROM products p
                LEFT JOIN un_measure um
                    ON um.id = p.unit_id
                WHERE p.id = ?
            `).get(productId);

            return {
                message: "Produto atualizado com sucesso.",
                data: updatedProduct
            };
        }
    );
}

module.exports = products;
