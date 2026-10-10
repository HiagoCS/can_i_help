import type { FastifyInstance } from "fastify";

const { sqlite } = require("../../../db/index");
const { recordProductMovement } = require("../../../db/product_stock");

interface RequestedSaleItem {
    productId?: number;
    serviceId?: number;
    quantity: number;
    unitPrice: number;
}

interface RequestedSaleBody {
    clientId?: number | null;
    clientName?: string | null;
    clientTaxId?: string | null;
    paymentMethodId?: number;
    installmentId?: number | null;
    items?: RequestedSaleItem[];
}

interface InventoryMovement {
    quantity: number;
    movementValue: string;
}

interface InventoryDeduction {
    quantity: number;
    movements: InventoryMovement[];
}

interface InventoryProduct {
    id: number;
    name: string;
    amount: string | number;
    value: string | number;
    cost: string | number;
    status: number | boolean;
    [key: string]: any;
}

function ensureSaleCustomerColumns() {
    const columns = new Set(
        sqlite
            .prepare("PRAGMA table_info(cashier)")
            .all()
            .map((column: any) => column.name)
    );

    if (!columns.has("customer_name")) {
        sqlite.exec(
            "ALTER TABLE cashier ADD COLUMN customer_name TEXT"
        );
    }

    if (!columns.has("customer_tax_id")) {
        sqlite.exec(
            "ALTER TABLE cashier ADD COLUMN customer_tax_id TEXT"
        );
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
        if (/^(\d)\1{10}$/.test(value)) {
            return false;
        }

        const digits = value.split("").map(Number);

        const first =
            (
                digits
                    .slice(0, 9)
                    .reduce(
                        (sum, digit, index) =>
                            sum + digit * (10 - index),
                        0
                    ) * 10
            ) % 11 % 10;

        const second =
            (
                digits
                    .slice(0, 10)
                    .reduce(
                        (sum, digit, index) =>
                            sum + digit * (11 - index),
                        0
                    ) * 10
            ) % 11 % 10;

        return first === digits[9] && second === digits[10];
    }

    if (value.length === 14) {
        if (/^(\d)\1{13}$/.test(value)) {
            return false;
        }

        const digits = value.split("").map(Number);

        const calculate = (length: number) => {
            const weights =
                length === 12
                    ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
                    : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

            const remainder =
                digits
                    .slice(0, length)
                    .reduce(
                        (sum, digit, index) =>
                            sum + digit * (weights[index] ?? 0),
                        0
                    ) % 11;

            return remainder < 2 ? 0 : 11 - remainder;
        };

        return (
            calculate(12) === Number(digits[12]) &&
            calculate(13) === Number(digits[13])
        );
    }

    return false;
}

function money(value: unknown) {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : 0;
}

function isActiveRecord(record: any) {
    return Boolean(
        record &&
        (
            record.status === true ||
            Number(record.status) === 1
        )
    );
}

function addInventoryDeduction(
    deductions: Map<number, InventoryDeduction>,
    productId: number,
    quantity: number,
    movementValue: string
) {
    const existing = deductions.get(productId);

    if (existing) {
        existing.quantity += quantity;

        existing.movements.push({
            quantity,
            movementValue
        });

        return;
    }

    deductions.set(productId, {
        quantity,
        movements: [
            {
                quantity,
                movementValue
            }
        ]
    });
}

function getOptionalId(value: unknown): number | null {
    if (
        value === undefined ||
        value === null ||
        value === ""
    ) {
        return null;
    }

    return Number(value);
}

async function cashier(fastify: FastifyInstance) {
    ensureSaleCustomerColumns();

    fastify.post(
        "/cashier",
        {
            onRequest: [fastify.authenticate]
        },
        async (request, reply) => {
            const body = (
                request.body ?? {}
            ) as RequestedSaleBody;

            const paymentMethodId = Number(
                body.paymentMethodId
            );

            const requestedClientId = getOptionalId(
                body.clientId
            );

            const clientNameInput = String(
                body.clientName ?? ""
            ).trim();

            const submittedTaxId = normalizeTaxId(
                body.clientTaxId
            );

            const installmentId = getOptionalId(
                body.installmentId
            );

            const requestedItems = body.items;

            /* ---------------------------------------------------------- */
            /* Validação da venda                                         */
            /* ---------------------------------------------------------- */

            if (
                !Number.isSafeInteger(paymentMethodId) ||
                paymentMethodId <= 0
            ) {
                return reply.code(400).send({
                    message:
                        "Selecione uma forma de pagamento válida."
                });
            }

            if (
                !Array.isArray(requestedItems) ||
                requestedItems.length === 0 ||
                requestedItems.length > 100
            ) {
                return reply.code(400).send({
                    message:
                        "Adicione ao menos um produto ou serviço à venda."
                });
            }

            if (
                submittedTaxId &&
                !isValidTaxId(submittedTaxId)
            ) {
                return reply.code(400).send({
                    message:
                        "Informe um CPF ou CNPJ válido."
                });
            }

            /*
             * Um item precisa ter productId OU serviceId.
             * Os dois campos não podem estar preenchidos simultaneamente.
             */
            const seenItems = new Set<string>();

            for (const item of requestedItems) {
                if (!item || typeof item !== "object") {
                    return reply.code(400).send({
                        message:
                            "A lista de produtos e serviços da venda é inválida."
                    });
                }

                const hasProductId =
                    item.productId !== undefined &&
                    item.productId !== null;

                const hasServiceId =
                    item.serviceId !== undefined &&
                    item.serviceId !== null;

                if (hasProductId === hasServiceId) {
                    return reply.code(400).send({
                        message:
                            "Cada item deve identificar um produto ou um serviço."
                    });
                }

                const itemType = hasServiceId
                    ? "service"
                    : "product";

                const itemId = Number(
                    hasServiceId
                        ? item.serviceId
                        : item.productId
                );

                const quantity = Number(item.quantity);
                const unitPrice = Number(item.unitPrice);

                if (
                    !Number.isSafeInteger(itemId) ||
                    itemId <= 0
                ) {
                    return reply.code(400).send({
                        message:
                            "A lista de produtos e serviços da venda é inválida."
                    });
                }

                const itemKey = `${itemType}:${itemId}`;

                if (seenItems.has(itemKey)) {
                    return reply.code(400).send({
                        message:
                            "A venda contém um produto ou serviço duplicado."
                    });
                }

                if (
                    !Number.isSafeInteger(quantity) ||
                    quantity <= 0 ||
                    !Number.isFinite(unitPrice) ||
                    unitPrice < 0
                ) {
                    return reply.code(400).send({
                        message:
                            "Confira as quantidades e os preços dos produtos e serviços."
                    });
                }

                seenItems.add(itemKey);
            }

            /* ---------------------------------------------------------- */
            /* Forma de pagamento                                         */
            /* ---------------------------------------------------------- */

            const paymentMethod = sqlite
                .prepare(`
                    SELECT id, name
                    FROM payment_method
                    WHERE id = ? AND status = 1
                `)
                .get(paymentMethodId);

            if (!paymentMethod) {
                return reply.code(400).send({
                    message:
                        "A forma de pagamento selecionada está indisponível."
                });
            }

            let installment: any = null;

            if (installmentId !== null) {
                if (
                    !Number.isSafeInteger(installmentId) ||
                    installmentId <= 0
                ) {
                    return reply.code(400).send({
                        message:
                            "Selecione um parcelamento válido."
                    });
                }

                installment = sqlite
                    .prepare(`
                        SELECT id, in_installments, percentage
                        FROM installments
                        WHERE id = ?
                    `)
                    .get(installmentId);

                if (!installment) {
                    return reply.code(400).send({
                        message:
                            "Selecione um parcelamento válido."
                    });
                }
            }

            /* ---------------------------------------------------------- */
            /* Cliente                                                     */
            /* ---------------------------------------------------------- */

            let client: any = null;

            if (requestedClientId !== null) {
                if (
                    !Number.isSafeInteger(requestedClientId) ||
                    requestedClientId <= 0
                ) {
                    return reply.code(400).send({
                        message:
                            "O cliente selecionado é inválido."
                    });
                }

                client = sqlite
                    .prepare(
                        "SELECT * FROM clients WHERE id = ?"
                    )
                    .get(requestedClientId);

                if (!client) {
                    return reply.code(404).send({
                        message:
                            "O cliente selecionado não foi encontrado."
                    });
                }
            } else if (clientNameInput) {
                const matches = sqlite
                    .prepare(`
                        SELECT *
                        FROM clients
                        WHERE lower(trim(name)) = lower(trim(?))
                        LIMIT 2
                    `)
                    .all(clientNameInput);

                if (matches.length === 1) {
                    client = matches[0];
                }
            }

            if (client && submittedTaxId) {
                const existingTaxId = normalizeTaxId(
                    client.cpf || client.cnpj
                );

                if (
                    existingTaxId &&
                    existingTaxId !== submittedTaxId
                ) {
                    return reply.code(409).send({
                        message:
                            "O cliente selecionado já possui outro CPF/CNPJ cadastrado. Atualize o cadastro do cliente antes de vender."
                    });
                }
            }

            /* ---------------------------------------------------------- */
            /* Preparação dos itens e estoque                             */
            /* ---------------------------------------------------------- */

            const normalizedItems: any[] = [];

            const inventoryDeductions =
                new Map<number, InventoryDeduction>();

            const inventoryProducts =
                new Map<number, InventoryProduct>();

            let hasCommitted = false;

            let productSubtotal = 0;
            let originalSubtotal = 0;

            try {
                sqlite.exec("BEGIN IMMEDIATE");

                /*
                 * CORREÇÃO:
                 * A unidade de medida é obtida através de un_measure,
                 * usando products.unit_id.
                 *
                 * A consulta não depende de uma coluna products.unit_measure.
                 */
                const getProduct = sqlite.prepare(`
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
                        p.ncm,
                        p.cst,
                        p.csosn,
                        p.icms,
                        p.status
                    FROM products p
                    LEFT JOIN un_measure um
                        ON um.id = p.unit_id
                    WHERE p.id = ?
                `);

                const getService = sqlite.prepare(`
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
                `);

                const getServiceProducts = sqlite.prepare(`
                    SELECT
                        p.id AS product_id,
                        p.sm_code,
                        p.bar_code,
                        p.name,
                        p.description,
                        p.value,
                        p.cost,
                        p.amount,
                        p.status,
                        um.unity AS unit_measure,
                        ss.qunt
                    FROM stock_service ss
                    INNER JOIN products p
                        ON p.id = ss.product_id
                    LEFT JOIN un_measure um
                        ON um.id = p.unit_id
                    WHERE ss.service_id = ?
                    ORDER BY p.name COLLATE NOCASE ASC
                `);

                for (const item of requestedItems) {
                    const hasServiceId =
                        item.serviceId !== undefined &&
                        item.serviceId !== null;

                    const itemId = Number(
                        hasServiceId
                            ? item.serviceId
                            : item.productId
                    );

                    const quantity = Number(item.quantity);

                    const unitPrice = roundMoney(
                        Number(item.unitPrice)
                    );

                    /* -------------------------------------------------- */
                    /* Serviço                                             */
                    /* -------------------------------------------------- */

                    if (hasServiceId) {
                        const service = getService.get(
                            itemId
                        ) as any;

                        if (
                            !service ||
                            !isActiveRecord(service)
                        ) {
                            throw Object.assign(
                                new Error(
                                    "Um dos serviços não está mais disponível."
                                ),
                                { statusCode: 409 }
                            );
                        }

                        const materials = getServiceProducts
                            .all(itemId) as any[];

                        const materialsValue = materials.reduce(
                            (total: number, material: any) => {
                                return (
                                    total +
                                    money(material.value) *
                                    money(material.qunt)
                                );
                            },
                            0
                        );

                        const originalUnitPrice = roundMoney(
                            money(service.cost) + materialsValue
                        );

                        const lineTotal = roundMoney(
                            unitPrice * quantity
                        );

                        const normalizedMaterials = materials.map(
                            (material: any) => {
                                const quantityPerService = money(
                                    material.qunt
                                );

                                if (
                                    !Number.isFinite(
                                        quantityPerService
                                    ) ||
                                    quantityPerService < 0
                                ) {
                                    throw Object.assign(
                                        new Error(
                                            `A quantidade de material do serviço "${service.name}" é inválida.`
                                        ),
                                        { statusCode: 409 }
                                    );
                                }

                                const requiredQuantity =
                                    quantityPerService * quantity;

                                const materialProductId = Number(
                                    material.product_id
                                );

                                if (
                                    !Number.isSafeInteger(
                                        materialProductId
                                    ) ||
                                    materialProductId <= 0
                                ) {
                                    throw Object.assign(
                                        new Error(
                                            `Um material do serviço "${service.name}" possui um produto inválido.`
                                        ),
                                        { statusCode: 409 }
                                    );
                                }

                                if (requiredQuantity > 0) {
                                    addInventoryDeduction(
                                        inventoryDeductions,
                                        materialProductId,
                                        requiredQuantity,
                                        money(
                                            material.value
                                        ).toFixed(2)
                                    );
                                }

                                return {
                                    productId: materialProductId,
                                    quantity: requiredQuantity,
                                    value: money(material.value)
                                };
                            }
                        );

                        productSubtotal += lineTotal;

                        originalSubtotal += roundMoney(
                            originalUnitPrice * quantity
                        );

                        normalizedItems.push({
                            itemType: "service",
                            serviceId: itemId,
                            productId: null,
                            smCode: service.sm_code ?? "",
                            barCode: service.bar_code ?? "",
                            name: service.name,
                            description: service.description || "",
                            cost: service.cost,
                            unitMeasure: "UN",
                            ncm: null,
                            cst: null,
                            csosn: null,
                            icms: 0,
                            quantity,
                            unitPrice,
                            originalUnitPrice,
                            total: lineTotal,
                            materials: normalizedMaterials
                        });

                        continue;
                    }

                    /* -------------------------------------------------- */
                    /* Produto                                            */
                    /* -------------------------------------------------- */

                    const product = getProduct.get(
                        itemId
                    ) as any;

                    if (
                        !product ||
                        !isActiveRecord(product)
                    ) {
                        throw Object.assign(
                            new Error(
                                "Um dos produtos não está mais disponível."
                            ),
                            { statusCode: 409 }
                        );
                    }

                    const originalUnitPrice = roundMoney(
                        money(product.value)
                    );

                    const lineTotal = roundMoney(
                        unitPrice * quantity
                    );

                    productSubtotal += lineTotal;

                    originalSubtotal += roundMoney(
                        originalUnitPrice * quantity
                    );

                    normalizedItems.push({
                        itemType: "product",
                        productId: itemId,
                        serviceId: null,
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
                        total: lineTotal,
                        materials: []
                    });

                    addInventoryDeduction(
                        inventoryDeductions,
                        itemId,
                        quantity,
                        unitPrice.toFixed(2)
                    );
                }

                /* ------------------------------------------------------ */
                /* Verificação de estoque                                 */
                /* ------------------------------------------------------ */

                const getInventoryProduct = sqlite.prepare(`
                    SELECT *
                    FROM products
                    WHERE id = ?
                `);

                for (
                    const [productId, deduction]
                    of inventoryDeductions
                ) {
                    const product = getInventoryProduct.get(
                        productId
                    ) as InventoryProduct | undefined;

                    if (
                        !product ||
                        !isActiveRecord(product)
                    ) {
                        throw Object.assign(
                            new Error(
                                "Um dos produtos necessários para a venda ou para a execução de um serviço não está mais disponível."
                            ),
                            { statusCode: 409 }
                        );
                    }

                    const availableStock = money(
                        product.amount
                    );

                    if (
                        availableStock + Number.EPSILON <
                        deduction.quantity
                    ) {
                        throw Object.assign(
                            new Error(
                                `Estoque insuficiente para ${product.name}. Necessário: ${deduction.quantity}. Disponível: ${availableStock}.`
                            ),
                            { statusCode: 409 }
                        );
                    }

                    inventoryProducts.set(
                        productId,
                        product
                    );
                }

                /* ------------------------------------------------------ */
                /* Cálculo dos totais                                     */
                /* ------------------------------------------------------ */

                const percentage = installment
                    ? Math.max(
                        0,
                        money(installment.percentage)
                    )
                    : 0;

                const surcharge = roundMoney(
                    productSubtotal * percentage
                );

                const totalValue = roundMoney(
                    productSubtotal + surcharge
                );

                const customerName =
                    client?.name || clientNameInput || null;

                let customerTaxId =
                    normalizeTaxId(
                        client?.cpf || client?.cnpj
                    ) || null;

                if (client && submittedTaxId && !customerTaxId) {
                    const isCnpj =
                        submittedTaxId.length === 14;

                    sqlite.prepare(
                        isCnpj
                            ? "UPDATE clients SET cnpj = ? WHERE id = ?"
                            : "UPDATE clients SET cpf = ? WHERE id = ?"
                    ).run(
                        submittedTaxId,
                        client.id
                    );

                    customerTaxId = submittedTaxId;
                } else if (!client && submittedTaxId) {
                    customerTaxId = submittedTaxId;
                }

                /* ------------------------------------------------------ */
                /* Inserção da venda                                      */
                /* ------------------------------------------------------ */

                const saleDate = new Date().toISOString();

                const insertSale = sqlite.prepare(`
                    INSERT INTO cashier (
                        total_value,
                        method_id,
                        client_id,
                        installment_id,
                        dt_sale,
                        customer_name,
                        customer_tax_id
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `).run(
                    totalValue,
                    paymentMethodId,
                    client?.id ?? null,
                    installment?.id ?? null,
                    saleDate,
                    customerName,
                    customerTaxId
                );

                const saleId = Number(
                    insertSale.lastInsertRowid
                );

                /*
                 * A tabela stock_sale permite que product_id ou
                 * service_id sejam nulos. Cada inserção preenche
                 * somente a coluna correspondente ao tipo do item.
                 */
                const insertProductSaleItem = sqlite.prepare(`
                    INSERT INTO stock_sale (
                        value,
                        sale_id,
                        product_id,
                        qunt_sale,
                        unit_measure
                    )
                    VALUES (?, ?, ?, ?, ?)
                `);

                const insertServiceSaleItem = sqlite.prepare(`
                    INSERT INTO stock_sale (
                        value,
                        sale_id,
                        service_id,
                        qunt_sale,
                        unit_measure
                    )
                    VALUES (?, ?, ?, ?, ?)
                `);

                for (const item of normalizedItems) {
                    if (item.itemType === "service") {
                        insertServiceSaleItem.run(
                            item.unitPrice.toFixed(2),
                            saleId,
                            item.serviceId,
                            item.quantity,
                            item.unitMeasure
                        );
                    } else {
                        insertProductSaleItem.run(
                            item.unitPrice.toFixed(2),
                            saleId,
                            item.productId,
                            item.quantity,
                            item.unitMeasure
                        );
                    }
                }

                /* ------------------------------------------------------ */
                /* Movimentação e atualização de estoque                  */
                /* ------------------------------------------------------ */

                const updateStock = sqlite.prepare(`
                    UPDATE products
                    SET amount = ?
                    WHERE id = ?
                `);

                for (
                    const [productId, deduction]
                    of inventoryDeductions
                ) {
                    const product = inventoryProducts.get(
                        productId
                    )!;

                    for (const movement of deduction.movements) {
                        recordProductMovement(
                            product,
                            "sale",
                            0,
                            movement.quantity,
                            {
                                referenceId: saleId,
                                movementValue:
                                    movement.movementValue,
                                dtUpdate: saleDate
                            }
                        );
                    }

                    const nextStock = roundMoney(
                        money(product.amount) -
                        deduction.quantity
                    );

                    updateStock.run(
                        String(nextStock),
                        productId
                    );

                    for (const item of normalizedItems) {
                        if (
                            item.itemType === "product" &&
                            item.productId === productId
                        ) {
                            item.stockAfterSale = nextStock;
                        }
                    }
                }

                /* ------------------------------------------------------ */
                /* Configurações fiscais                                  */
                /* ------------------------------------------------------ */

                const company = sqlite.prepare(`
                    SELECT
                        cnpj,
                        legal_name,
                        trade_name,
                        state_registration,
                        municipal_registration,
                        tax_regime,
                        address,
                        number,
                        complement,
                        neighborhood,
                        city,
                        city_ibge,
                        state,
                        zip_code
                    FROM company
                    ORDER BY id
                    LIMIT 1
                `).get() ?? null;

                const fiscalConfig = sqlite.prepare(`
                    SELECT
                        id,
                        cfop_default,
                        ncm_default
                    FROM fiscal_config
                    ORDER BY id
                    LIMIT 1
                `).get() ?? null;

                const hasClientAddress = Boolean(
                    client?.address &&
                    client?.number &&
                    client?.neighborhood &&
                    client?.city &&
                    client?.city_ibge &&
                    client?.state &&
                    client?.zip_code
                );

                const fiscalDataComplete = Boolean(
                    client &&
                    hasClientAddress &&
                    customerTaxId &&
                    isValidTaxId(customerTaxId) &&
                    isValidTaxId(
                        normalizeTaxId(company?.cnpj)
                    ) &&
                    company?.legal_name &&
                    company?.state_registration &&
                    company?.tax_regime &&
                    company?.address &&
                    company?.number &&
                    company?.neighborhood &&
                    company?.city &&
                    company?.city_ibge &&
                    company?.state &&
                    company?.zip_code &&
                    fiscalConfig?.cfop_default &&
                    fiscalConfig?.ncm_default &&
                    normalizedItems.every(
                        (item) =>
                            item.itemType === "product" &&
                            (
                                item.ncm ||
                                fiscalConfig?.ncm_default
                            ) &&
                            item.cst !== null &&
                            item.csosn !== null
                    )
                );

                /* ------------------------------------------------------ */
                /* Commit e resposta                                      */
                /* ------------------------------------------------------ */

                sqlite.exec("COMMIT");
                hasCommitted = true;

                const responseItems = normalizedItems.map(
                    (item) => {
                        const {
                            materials,
                            ...saleItem
                        } = item;

                        return saleItem;
                    }
                );

                return reply.code(201).send({
                    message: "Venda registrada com sucesso.",
                    data: {
                        id: saleId,
                        dt_sale: saleDate,
                        total_value: totalValue,
                        product_subtotal: roundMoney(
                            Math.max(
                                originalSubtotal,
                                productSubtotal
                            )
                        ),
                        sold_subtotal: roundMoney(
                            productSubtotal
                        ),
                        discount_total: roundMoney(
                            Math.max(
                                0,
                                originalSubtotal -
                                productSubtotal
                            )
                        ),
                        installment_surcharge: surcharge,
                        client_name: customerName,
                        client_tax_id: customerTaxId,
                        customer: {
                            name: customerName,
                            cpf:
                                client?.cpf ??
                                (
                                    customerTaxId?.length === 11
                                        ? customerTaxId
                                        : null
                                ),
                            cnpj:
                                client?.cnpj ??
                                (
                                    customerTaxId?.length === 14
                                        ? customerTaxId
                                        : null
                                ),
                            ie: client?.ie ?? null,
                            address: client?.address ?? null,
                            number: client?.number ?? null,
                            complement: client?.complement ?? null,
                            neighborhood:
                                client?.neighborhood ?? null,
                            city: client?.city ?? null,
                            city_ibge: client?.city_ibge ?? null,
                            state: client?.state ?? null,
                            zip_code: client?.zip_code ?? null
                        },
                        payment_method_name: paymentMethod.name,
                        installment_count:
                            installment?.in_installments ?? null,
                        fiscal_data_complete: fiscalDataComplete,
                        danfe_available: false,
                        company,
                        items: responseItems
                    }
                });
            } catch (error: any) {
                if (!hasCommitted) {
                    try {
                        sqlite.exec("ROLLBACK");
                    } catch {
                        // A transação pode já ter sido encerrada.
                    }
                }

                if (error?.statusCode) {
                    return reply
                        .code(error.statusCode)
                        .send({
                            message: error.message
                        });
                }

                if (
                    String(error?.message ?? "").includes(
                        "UNIQUE constraint failed"
                    )
                ) {
                    return reply.code(409).send({
                        message:
                            "O CPF/CNPJ informado já está associado a outro cliente."
                    });
                }

                // Registra o erro original para facilitar o diagnóstico.
                request.log.error(
                    { err: error },
                    "Erro ao registrar venda no caixa"
                );

                return reply.code(500).send({
                    message: hasCommitted
                        ? "A venda foi registrada, mas ocorreu um erro posterior. Consulte a lista de vendas antes de tentar novamente."
                        : "Não foi possível registrar a venda. Nenhuma alteração foi aplicada."
                });
            }
        }
    );

    fastify.post(
    "/cashier/certificate",
    {
        onRequest: [fastify.authenticate],
    },
    async (request, reply) => {
        const { sqlite } = require("../../../db/index");
        const { mkdir, unlink } = require("node:fs/promises");
        const { createWriteStream } = require("node:fs");
        const path = require("node:path");
        const { randomUUID } = require("node:crypto");
        const { pipeline } = require("node:stream/promises");

        let certificatePath: string | null = null;

        try {
            const data = await request.file({
                limits: {
                    fileSize: 10 * 1024 * 1024,
                    files: 1,
                },
            });

            if (!data || data.fieldname !== "certificate") {
                return reply.code(400).send({
                    error: "Envie o certificado no campo 'certificate'.",
                });
            }

            const extension = path.extname(data.filename).toLowerCase();

            if (![".pfx", ".p12"].includes(extension)) {
                return reply.code(400).send({
                    error: "Formato inválido. Envie um certificado .pfx ou .p12.",
                });
            }

            const fields = data.fields as Record<string, any>;
            const password = fields.password?.value;
            const companyId = Number(fields.companyId?.value);

            if (!password || typeof password !== "string") {
                return reply.code(400).send({
                    error: "A senha do certificado é obrigatória.",
                });
            }

            if (!Number.isInteger(companyId) || companyId <= 0) {
                return reply.code(400).send({
                    error: "Informe um companyId válido.",
                });
            }

            const company = sqlite
                .prepare("SELECT id FROM company WHERE id = ?")
                .get(companyId) as { id: number } | undefined;

            if (!company) {
                return reply.code(404).send({
                    error: "Empresa não encontrada.",
                });
            }

            const storageDirectory = path.resolve(
                process.cwd(),
                "storage",
                "certificate"
            );

            await mkdir(storageDirectory, { recursive: true });

            const filename = `${randomUUID()}${extension}`;

            certificatePath = path.join(storageDirectory, filename);

            await pipeline(
                data.file,
                createWriteStream(certificatePath, { flags: "wx" })
            );

            if (data.file.truncated) {
                await unlink(certificatePath).catch(() => {});
                return reply.code(413).send({
                    error: "O certificado excede o limite de 10 MB.",
                });
            }

            /*
             * A implementação abaixo considera que fiscalCertificateTable
             * possui os campos:
             * companyId, certificate, password, validFrom, validUntil e status.
             *
             * Ajuste os nomes caso sua tabela use nomes diferentes.
             */

            const certificateBuffer = await import("node:fs/promises").then(
                ({ readFile }) => readFile(certificatePath!)
            );

            /*
             * Para preencher as datas reais de validade, é necessário
             * analisar o conteúdo PKCS#12 e extrair o certificado X.509.
             * Não é seguro inferir as datas a partir do nome do arquivo.
             *
             * Substitua estes valores pela análise real do certificado
             * usando uma biblioteca compatível com PKCS#12.
             */
            const validFrom: string | null = null;
            const validUntil: string | null = null;

            const result = sqlite.prepare(`
                INSERT INTO fiscalCertificateTable (
                    companyId,
                    certificate,
                    password,
                    validFrom,
                    validUntil,
                    status
                )
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(
                companyId,
                `storage/certificate/${filename}`,
                password,
                validFrom,
                validUntil,
                "active"
            );

            return reply.code(201).send({
                message: "Certificado enviado e salvo com sucesso.",
                id: Number(result.lastInsertRowid),
                companyId,
                certificate: `storage/certificate/${filename}`,
                validFrom,
                validUntil,
                status: "active",
            });
        } catch (error: any) {
            if (certificatePath) {
                const { unlink } = await import("node:fs/promises");
                await unlink(certificatePath).catch(() => {});
            }

            request.log.error(error);

            if (error?.code === "FST_REQ_FILE_TOO_LARGE") {
                return reply.code(413).send({
                    error: "O certificado excede o limite de 10 MB.",
                });
            }

            return reply.code(500).send({
                error: "Não foi possível salvar o certificado.",
            });
        }
    }
);
}

module.exports = cashier;
