import type { FastifyInstance } from "fastify";

const { sqlite } = require("../../../db/index");
const { recordProductMovement } = require("../../../db/product_stock");

function ensureSaleCustomerColumns() {
    const columns = new Set(
        sqlite.prepare("PRAGMA table_info(cashier)").all().map((column: any) => column.name)
    );

    if (!columns.has("customer_name")) {
        sqlite.exec("ALTER TABLE cashier ADD COLUMN customer_name TEXT");
    }

    if (!columns.has("customer_tax_id")) {
        sqlite.exec("ALTER TABLE cashier ADD COLUMN customer_tax_id TEXT");
    }
}

function roundMoney(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeTaxId(value: unknown) {
    return String(value ?? "").replace(/\D/g, "");
}

function isValidTaxId(value: string) {
    if (value.length === 11) {
        if (/^(\d)\1{10}$/.test(value)) return false;
        const digits = value.split("").map(Number);
        const first = (digits.slice(0, 9).reduce((sum, digit, index) => sum + digit * (10 - index), 0) * 10) % 11 % 10;
        const second = (digits.slice(0, 10).reduce((sum, digit, index) => sum + digit * (11 - index), 0) * 10) % 11 % 10;
        return first === digits[9] && second === digits[10];
    }

    if (value.length === 14) {
        if (/^(\d)\1{13}$/.test(value)) return false;
        const digits = value.split("").map(Number);
        const calculate = (length: number) => {
            const weights = length === 12
                ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
                : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
            const remainder = digits.slice(0, length).reduce((sum, digit, index) => sum + digit * (weights[index] ?? 0), 0) % 11;
            return remainder < 2 ? 0 : 11 - remainder;
        };
        return calculate(12) === Number(digits[12]) && calculate(13) === Number(digits[13]);
    }

    return false;
}

function money(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

async function cashier(fastify: FastifyInstance) {
    ensureSaleCustomerColumns();

    fastify.post(
        "/cashier",
        { onRequest: [fastify.authenticate] },
        async (request, reply) => {
            const body = request.body as {
                clientId?: number | null;
                clientName?: string | null;
                clientTaxId?: string | null;
                paymentMethodId?: number;
                installmentId?: number | null;
                items?: Array<{ productId: number; quantity: number; unitPrice: number }>;
            };

            const paymentMethodId = Number(body?.paymentMethodId);
            const requestedClientId = body?.clientId ? Number(body.clientId) : null;
            const clientNameInput = String(body?.clientName ?? "").trim();
            const submittedTaxId = normalizeTaxId(body?.clientTaxId);
            const installmentId = body?.installmentId ? Number(body.installmentId) : null;
            const requestedItems = body?.items;

            if (!Number.isInteger(paymentMethodId) || paymentMethodId <= 0) {
                return reply.code(400).send({ message: "Selecione uma forma de pagamento válida." });
            }

            if (!Array.isArray(requestedItems) || requestedItems.length === 0 || requestedItems.length > 100) {
                return reply.code(400).send({ message: "Adicione ao menos um produto à venda." });
            }

            if (submittedTaxId && !isValidTaxId(submittedTaxId)) {
                return reply.code(400).send({ message: "Informe um CPF ou CNPJ válido." });
            }

            const seenProducts = new Set<number>();
            for (const item of requestedItems) {
                const productId = Number(item?.productId);
                const quantity = Number(item?.quantity);
                const unitPrice = Number(item?.unitPrice);

                if (!Number.isInteger(productId) || productId <= 0 || seenProducts.has(productId)) {
                    return reply.code(400).send({ message: "A lista de produtos da venda é inválida." });
                }
                if (!Number.isInteger(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
                    return reply.code(400).send({ message: "Confira as quantidades e os preços dos produtos." });
                }
                seenProducts.add(productId);
            }

            const paymentMethod = sqlite.prepare(
                "SELECT id, name FROM payment_method WHERE id = ? AND status = 1"
            ).get(paymentMethodId);

            if (!paymentMethod) {
                return reply.code(400).send({ message: "A forma de pagamento selecionada está indisponível." });
            }

            let installment: any = null;
            if (installmentId !== null) {
                installment = sqlite.prepare(
                    "SELECT id, in_installments, percentage FROM installments WHERE id = ?"
                ).get(installmentId);
                if (!installment) {
                    return reply.code(400).send({ message: "Selecione um parcelamento válido." });
                }
            }

            let client: any = null;
            if (requestedClientId !== null) {
                if (!Number.isInteger(requestedClientId) || requestedClientId <= 0) {
                    return reply.code(400).send({ message: "O cliente selecionado é inválido." });
                }
                client = sqlite.prepare("SELECT * FROM clients WHERE id = ?").get(requestedClientId);
                if (!client) {
                    return reply.code(404).send({ message: "O cliente selecionado não foi encontrado." });
                }
            } else if (clientNameInput) {
                const matches = sqlite.prepare(
                    "SELECT * FROM clients WHERE lower(trim(name)) = lower(trim(?)) LIMIT 2"
                ).all(clientNameInput);
                if (matches.length === 1) client = matches[0];
            }

            if (client && submittedTaxId) {
                const existingTaxId = normalizeTaxId(client.cpf || client.cnpj);
                if (existingTaxId && existingTaxId !== submittedTaxId) {
                    return reply.code(409).send({
                        message: "O cliente selecionado já possui outro CPF/CNPJ cadastrado. Atualize o cadastro do cliente antes de vender."
                    });
                }
            }

            const normalizedItems: any[] = [];
            let hasCommitted = false;
            let productSubtotal = 0;
            let originalSubtotal = 0;

            try {
                sqlite.exec("BEGIN IMMEDIATE");

                for (const item of requestedItems) {
                    const productId = Number(item.productId);
                    const quantity = Number(item.quantity);
                    const unitPrice = roundMoney(Number(item.unitPrice));
                    const product = sqlite.prepare(
                        "SELECT id, sm_code, bar_code, name, description, value, cost, amount, unit_measure, ncm, cst, csosn, icms, status " +
                        "FROM products WHERE id = ?"
                    ).get(productId);

                    if (!product || !product.status) {
                        throw Object.assign(new Error("Um dos produtos não está mais disponível."), { statusCode: 409 });
                    }

                    const stock = money(product.amount);
                    if (stock < quantity) {
                        throw Object.assign(new Error("Estoque insuficiente para " + product.name + ". Disponível: " + stock + "."), { statusCode: 409 });
                    }

                    const originalUnitPrice = roundMoney(money(product.value));
                    const lineTotal = roundMoney(unitPrice * quantity);
                    productSubtotal += lineTotal;
                    originalSubtotal += roundMoney(originalUnitPrice * quantity);
                    normalizedItems.push({
                        productId,
                        smCode: product.sm_code,
                        barCode: product.bar_code,
                        name: product.name,
                        description: product.description || "",
                        cost: product.cost,
                        unitMeasure: product.unit_measure || "UN",
                        ncm: product.ncm,
                        cst: product.cst,
                        csosn: product.csosn,
                        icms: product.icms,
                        quantity,
                        unitPrice,
                        originalUnitPrice,
                        total: lineTotal
                    });
                }

                const percentage = installment ? Math.max(0, money(installment.percentage)) : 0;
                const surcharge = roundMoney(productSubtotal * percentage);
                const totalValue = roundMoney(productSubtotal + surcharge);
                const customerName = client?.name || clientNameInput || null;
                let customerTaxId = normalizeTaxId(client?.cpf || client?.cnpj) || null;

                if (client && submittedTaxId && !customerTaxId) {
                    const isCnpj = submittedTaxId.length === 14;
                    sqlite.prepare(
                        isCnpj
                            ? "UPDATE clients SET cnpj = ? WHERE id = ?"
                            : "UPDATE clients SET cpf = ? WHERE id = ?"
                    ).run(submittedTaxId, client.id);
                    customerTaxId = submittedTaxId;
                } else if (!client && submittedTaxId) {
                    customerTaxId = submittedTaxId;
                }

                const saleDate = new Date().toISOString();
                const insertSale = sqlite.prepare(
                    "INSERT INTO cashier (total_value, method_id, client_id, installment_id, dt_sale, customer_name, customer_tax_id) " +
                    "VALUES (?, ?, ?, ?, ?, ?, ?)"
                ).run(
                    totalValue,
                    paymentMethodId,
                    client?.id ?? null,
                    installment?.id ?? null,
                    saleDate,
                    customerName,
                    customerTaxId
                );
                const saleId = Number(insertSale.lastInsertRowid);
                const insertItem = sqlite.prepare(
                    "INSERT INTO stock_sale (value, sale_id, product_id, qunt_sale, unit_measure) VALUES (?, ?, ?, ?, ?)"
                );
                const updateStock = sqlite.prepare(
                    "UPDATE products SET amount = ? WHERE id = ?"
                );

                for (const item of normalizedItems) {
                    insertItem.run(item.unitPrice.toFixed(2), saleId, item.productId, item.quantity, item.unitMeasure);
                    const current = sqlite.prepare("SELECT * FROM products WHERE id = ?").get(item.productId);
                    recordProductMovement(current,"sale",0,item.quantity,{referenceId:saleId,movementValue:item.unitPrice.toFixed(2),dtUpdate:saleDate});
                    const nextStock = money(current.amount) - item.quantity;
                    updateStock.run(String(nextStock), item.productId);
                    item.stockAfterSale = nextStock;
                }

                const company = sqlite.prepare(
                    "SELECT cnpj, legal_name, trade_name, state_registration, municipal_registration, tax_regime, address, number, complement, neighborhood, city, city_ibge, state, zip_code " +
                    "FROM company ORDER BY id LIMIT 1"
                ).get() ?? null;
                const fiscalConfig = sqlite.prepare(
                    "SELECT id, cfop_default, ncm_default FROM fiscal_config ORDER BY id LIMIT 1"
                ).get() ?? null;
                const hasClientAddress = Boolean(
                    client?.address && client?.number && client?.neighborhood && client?.city && client?.city_ibge && client?.state && client?.zip_code
                );
                const fiscalDataComplete = Boolean(
                    client && hasClientAddress && customerTaxId && isValidTaxId(customerTaxId) && isValidTaxId(normalizeTaxId(company?.cnpj)) && company?.legal_name &&
                    company?.state_registration && company?.tax_regime && company?.address && company?.number && company?.neighborhood && company?.city && company?.city_ibge && company?.state && company?.zip_code && fiscalConfig?.cfop_default && fiscalConfig?.ncm_default &&
                    normalizedItems.every((item) => (item.ncm || fiscalConfig?.ncm_default) && item.cst !== null && item.csosn !== null)
                );

                sqlite.exec("COMMIT");
                hasCommitted = true;

                return reply.code(201).send({
                    message: "Venda registrada com sucesso.",
                    data: {
                        id: saleId,
                        dt_sale: saleDate,
                        total_value: totalValue,
                        product_subtotal: roundMoney(Math.max(originalSubtotal, productSubtotal)),
                        sold_subtotal: roundMoney(productSubtotal),
                        discount_total: roundMoney(Math.max(0, originalSubtotal - productSubtotal)),
                        installment_surcharge: surcharge,
                        client_name: customerName,
                        client_tax_id: customerTaxId,
                        customer: {
                            name: customerName,
                            cpf: client?.cpf ?? (customerTaxId?.length === 11 ? customerTaxId : null),
                            cnpj: client?.cnpj ?? (customerTaxId?.length === 14 ? customerTaxId : null),
                            ie: client?.ie ?? null,
                            address: client?.address ?? null,
                            number: client?.number ?? null,
                            complement: client?.complement ?? null,
                            neighborhood: client?.neighborhood ?? null,
                            city: client?.city ?? null,
                            state: client?.state ?? null,
                            zip_code: client?.zip_code ?? null
                        },
                        payment_method_name: paymentMethod.name,
                        installment_count: installment?.in_installments ?? null,
                        fiscal_data_complete: fiscalDataComplete,
                        danfe_available: false,
                        company,
                        items: normalizedItems
                    }
                });
            } catch (error: any) {
                if (!hasCommitted) {
                    try { sqlite.exec("ROLLBACK"); } catch { /* transaction already closed */ }
                }
                if (error?.statusCode) {
                    return reply.code(error.statusCode).send({ message: error.message });
                }
                if (String(error?.message ?? "").includes("UNIQUE constraint failed")) {
                    return reply.code(409).send({ message: "O CPF/CNPJ informado já está associado a outro cliente." });
                }
                request.log.error(error);
                return reply.code(500).send({
                    message: hasCommitted
                        ? "A venda foi registrada, mas não foi possível montar o comprovante. Consulte a lista de vendas antes de tentar novamente."
                        : "Não foi possível registrar a venda. Nenhuma alteração foi aplicada."
                });
            }
        }
    );
}

module.exports = cashier;
