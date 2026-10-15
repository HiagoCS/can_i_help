import type { FastifyInstance } from "fastify";

const { sqlite } = require("../../../db/index");

type RequestedBudgetItem = {
    productId?: number;
    serviceId?: number;
    quantity: number;
    unitPrice: number;
    unitMeasure?: string;
};

type RequestedBudgetBody = {
    clientId?: number | null;
    totalValue?: number;
    items?: RequestedBudgetItem[];
};

function roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isActiveRecord(record: any): boolean {
    // Compatibilidade com registros antigos sem a coluna status no retorno.
    if (record?.status === undefined || record?.status === null || record?.status === "") {
        return Boolean(record);
    }

    return Boolean(record) && (
        record.status === true || Number(record.status) === 1
    );
}

function getOptionalId(value: unknown): number | null {
    if (value === undefined || value === null || value === "") {
        return null;
    }
    return Number(value);
}

async function budget(fastify: FastifyInstance) {
    fastify.post(
        "/budget",
        { onRequest: [fastify.authenticate] },
        async (request, reply) => {
            const body = (request.body ?? {}) as RequestedBudgetBody;
            const clientId = getOptionalId(body.clientId);
            const totalValue = Number(body.totalValue);
            const requestedItems = body.items;

            if (
                !Number.isFinite(totalValue) ||
                totalValue < 0
            ) {
                return reply.code(400).send({
                    message: "O valor total do orçamento é inválido."
                });
            }

            if (
                !Array.isArray(requestedItems) ||
                requestedItems.length === 0 ||
                requestedItems.length > 100
            ) {
                return reply.code(400).send({
                    message: "Adicione ao menos um produto ou serviço ao orçamento."
                });
            }

            if (
                clientId !== null &&
                (!Number.isSafeInteger(clientId) || clientId <= 0)
            ) {
                return reply.code(400).send({
                    message: "O cliente selecionado é inválido."
                });
            }

            const seenItems = new Set<string>();

            for (const item of requestedItems) {
                if (!item || typeof item !== "object") {
                    return reply.code(400).send({
                        message: "A lista de itens do orçamento é inválida."
                    });
                }

                const hasProductId = item.productId !== undefined && item.productId !== null;
                const hasServiceId = item.serviceId !== undefined && item.serviceId !== null;

                if (hasProductId === hasServiceId) {
                    return reply.code(400).send({
                        message: "Cada item deve identificar um produto ou um serviço."
                    });
                }

                const itemType = hasServiceId ? "service" : "product";
                const itemId = Number(hasServiceId ? item.serviceId : item.productId);
                const quantity = Number(item.quantity);
                const unitPrice = Number(item.unitPrice);

                if (!Number.isSafeInteger(itemId) || itemId <= 0) {
                    return reply.code(400).send({
                        message: "A referência de um produto ou serviço é inválida."
                    });
                }

                if (!Number.isSafeInteger(quantity) || quantity <= 0) {
                    return reply.code(400).send({
                        message: "As quantidades dos itens devem ser números inteiros positivos."
                    });
                }

                if (!Number.isFinite(unitPrice) || unitPrice < 0) {
                    return reply.code(400).send({
                        message: "Informe um preço válido para cada item do orçamento."
                    });
                }

                const itemKey = `${itemType}:${itemId}`;
                if (seenItems.has(itemKey)) {
                    return reply.code(400).send({
                        message: "O orçamento contém um produto ou serviço duplicado."
                    });
                }
                seenItems.add(itemKey);

                if (
                    item.unitMeasure !== undefined &&
                    (typeof item.unitMeasure !== "string" || item.unitMeasure.trim().length > 16)
                ) {
                    return reply.code(400).send({
                        message: "A unidade de medida de um item é inválida."
                    });
                }
            }

            let transactionOpen = false;

            try {
                sqlite.exec("BEGIN IMMEDIATE");
                transactionOpen = true;

                let client: any = null;
                if (clientId !== null) {
                    client = sqlite.prepare(`
                        SELECT id, name
                        FROM clients
                        WHERE id = ?
                        LIMIT 1
                    `).get(clientId);

                    if (!client) {
                        sqlite.exec("ROLLBACK");
                        transactionOpen = false;
                        return reply.code(404).send({
                            message: "O cliente selecionado não foi encontrado."
                        });
                    }
                }

                const getProduct = sqlite.prepare(`
                    SELECT
                        p.id,
                        p.sm_code,
                        p.bar_code,
                        p.name,
                        p.description,
                        p.status,
                        COALESCE(um.unity, 'UN') AS unit_measure
                    FROM products p
                    LEFT JOIN un_measure um ON um.id = p.unit_id
                    WHERE p.id = ?
                    LIMIT 1
                `);

                const getService = sqlite.prepare(`
                    SELECT id, sm_code, bar_code, name, description, status
                    FROM services
                    WHERE id = ?
                    LIMIT 1
                `);

                const insertBudget = sqlite.prepare(`
                    INSERT INTO budget (total_value, client_id, dt_budget)
                    VALUES (?, ?, ?)
                `);

                const insertBudgetItem = sqlite.prepare(`
                    INSERT INTO stock_budget (
                        value,
                        budget_id,
                        product_id,
                        service_id,
                        qunt_sale,
                        unit_measure
                    ) VALUES (?, ?, ?, ?, ?, ?)
                `);

                const normalizedItems: Array<{
                    itemType: "product" | "service";
                    productId: number | null;
                    serviceId: number | null;
                    smCode: string;
                    barCode: string;
                    name: string;
                    description: string;
                    quantity: number;
                    unitPrice: number;
                    unitMeasure: string;
                    totalValue: number;
                }> = [];

                for (const item of requestedItems) {
                    const isService = item.serviceId !== undefined && item.serviceId !== null;
                    const itemId = Number(isService ? item.serviceId : item.productId);
                    const quantity = Number(item.quantity);
                    const unitPrice = roundMoney(Number(item.unitPrice));
                    let record: any;

                    if (isService) {
                        record = getService.get(itemId);
                        if (!record || !isActiveRecord(record)) {
                            throw Object.assign(
                                new Error("Um dos serviços do orçamento não está mais disponível."),
                                { statusCode: 409 }
                            );
                        }
                    } else {
                        record = getProduct.get(itemId);
                        if (!record || !isActiveRecord(record)) {
                            throw Object.assign(
                                new Error("Um dos produtos do orçamento não está mais disponível."),
                                { statusCode: 409 }
                            );
                        }
                    }

                    const unitMeasure = String(
                        item.unitMeasure?.trim() || record.unit_measure || "UN"
                    ).slice(0, 16);

                    normalizedItems.push({
                        itemType: isService ? "service" : "product",
                        productId: isService ? null : itemId,
                        serviceId: isService ? itemId : null,
                        smCode: String(record.sm_code ?? ""),
                        barCode: String(record.bar_code ?? ""),
                        name: String(record.name ?? "Item sem nome"),
                        description: String(record.description ?? ""),
                        quantity,
                        unitPrice,
                        unitMeasure,
                        totalValue: roundMoney(unitPrice * quantity)
                    });
                }

                // O orçamento e seus itens são criados em uma única transação.
                // A consulta de produtos/serviços não faz nenhuma alteração no estoque.
                const budgetDate = new Date().toISOString();
                const budgetInsertResult = insertBudget.run(
                    roundMoney(totalValue),
                    clientId,
                    budgetDate
                );
                const budgetId = Number(budgetInsertResult.lastInsertRowid);

                for (let index = 0; index < requestedItems.length; index += 1) {
                    const item = requestedItems[index];
                    const normalized = normalizedItems[index];
                    if (item === undefined || normalized === undefined) {
                        throw new Error("Não foi possível processar os itens do orçamento.");
                    }
                    const isService = item.serviceId !== undefined && item.serviceId !== null;

                    insertBudgetItem.run(
                        normalized.unitPrice.toFixed(2),
                        budgetId,
                        isService ? null : Number(item.productId),
                        isService ? Number(item.serviceId) : null,
                        normalized.quantity,
                        normalized.unitMeasure
                    );
                }

                sqlite.exec("COMMIT");
                transactionOpen = false;

                return reply.code(201).send({
                    message: "Orçamento salvo com sucesso.",
                    data: {
                        id: budgetId,
                        total_value: roundMoney(totalValue),
                        dt_budget: budgetDate,
                        client_id: clientId,
                        client_name: client?.name ?? null,
                        items: normalizedItems.map((item) => ({
                            ...item,
                            totalValue: item.totalValue
                        }))
                    }
                });
            } catch (error: any) {
                if (transactionOpen) {
                    try {
                        sqlite.exec("ROLLBACK");
                    } catch {
                        // A transação pode já ter sido encerrada.
                    }
                }

                if (error?.statusCode) {
                    return reply.code(error.statusCode).send({ message: error.message });
                }

                request.log.error({ err: error }, "Erro ao salvar orçamento");
                return reply.code(500).send({
                    message: "Não foi possível salvar o orçamento. Nenhuma alteração foi aplicada.",
                    error: process.env.NODE_ENV === "production"
                        ? undefined
                        : error instanceof Error ? error.message : String(error)
                });
            }
        }
    );
}

module.exports = budget;
