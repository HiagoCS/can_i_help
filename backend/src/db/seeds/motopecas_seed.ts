const { sqlite } = require("../index");

/**
 * Seed unificado de demonstração para desenvolvimento.
 *
 * Ordem:
 * 1. Confere usuário administrativo.
 * 2. Prepara unidade, formas de pagamento e parcelamentos.
 * 3. Cria/atualiza empresa e configuração fiscal.
 * 4. Cria/atualiza 20 produtos.
 * 5. Cria/atualiza 5 clientes.
 * 6. Executa 5 retiradas, 5 entradas e 5 edições de produto.
 * 7. Cria 20 vendas: 10 de produtos, 8 somente de serviços e 2 mistas.
 * 8. Baixa estoque apenas para os produtos vendidos; serviços não possuem estoque.
 *
 * ATENÇÃO:
 * - Execute somente em banco de desenvolvimento/teste.
 * - O CNPJ da empresa permanece como placeholder inválido do seed antigo.
 *   Substitua-o pelos dados reais da empresa e use o certificado correspondente
 *   antes de tentar transmitir NF-e à SEFAZ.
 * - Os CPFs/CNPJs de clientes são sintéticos e calculados com dígitos
 *   verificadores coerentes; não representam confirmação de cadastro real.
 * - Preços de custo e quantidades são dados ilustrativos.
 * - O seed recria vendas com IDs de 1 a 20; use somente em banco de demonstração.
 */

const DEMO_SALE_FIRST_ID = 1;
const DEMO_SALE_LAST_ID = 20;
const DEMO_NOTE_PREFIX = "DEMO_SEED:";

function roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

function digits(value: unknown): string {
    return String(value ?? "").replace(/\D/g, "");
}

function cpfDigit(base: string): number {
    const sum = base
        .split("")
        .reduce((total, digit, index) => {
            return total + Number(digit) * (base.length + 1 - index);
        }, 0);

    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
}

function makeCpf(base: string): string {
    const normalized = digits(base).slice(0, 9).padStart(9, "0");
    const first = cpfDigit(normalized);
    const second = cpfDigit(normalized + String(first));
    return normalized + String(first) + String(second);
}

function cnpjDigit(base: string): number {
    const weights = base.length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

    const sum = base
        .split("")
        .reduce((total, digit, index) => {
            return total + Number(digit) * weights[index]!;
        }, 0);

    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
}

function makeCnpj(base: string): string {
    const normalized = digits(base).slice(0, 12).padStart(12, "0");
    const first = cnpjDigit(normalized);
    const second = cnpjDigit(normalized + String(first));
    return normalized + String(first) + String(second);
}

function makeGtin13(sequence: number): string {
    const base = `789${String(sequence).padStart(9, "0")}`;
    const sum = base
        .split("")
        .reduce((total, digit, index) => {
            return total + Number(digit) * (index % 2 === 0 ? 1 : 3);
        }, 0);

    const checkDigit = (10 - (sum % 10)) % 10;
    return `${base}${checkDigit}`;
}

function getUnitId(): number {
    let unit = sqlite.prepare(
        "SELECT id FROM un_measure WHERE unity = ? LIMIT 1"
    ).get("UN") as { id: number } | undefined;

    if (!unit) {
        const result = sqlite.prepare(
            "INSERT INTO un_measure (unity, description) VALUES (?, ?)"
        ).run("UN", "Unidade");

        const insertedId = Number(result.lastInsertRowid ?? 0);
        if (!insertedId) {
            throw new Error("Não foi possível obter o ID da unidade de medida.");
        }

        unit = { id: insertedId };
    }

    if (unit === undefined || unit.id === undefined || Number.isNaN(Number(unit.id))) {
        throw new Error("Registro de unidade de medida inválido.");
    }

    return Number(unit.id);
}

function ensurePaymentMethod(name: string): number {
    sqlite.prepare(`
        INSERT INTO payment_method (name, status)
        VALUES (?, 1)
        ON CONFLICT(name) DO UPDATE SET status = 1
    `).run(name);

    const row = sqlite.prepare(
        "SELECT id FROM payment_method WHERE name = ? LIMIT 1"
    ).get(name) as { id: number } | undefined;

    if (!row || row.id === undefined) {
        throw new Error(`Não foi possível preparar a forma de pagamento: ${name}.`);
    }

    return Number(row.id);
}

function ensureInstallment(count: number, percentage: number): number {
    const existing = sqlite.prepare(`
        SELECT id
        FROM installments
        WHERE in_installments = ?
        ORDER BY id
        LIMIT 1
    `).get(count) as { id: number } | undefined;

    if (existing && existing.id !== undefined) {
        sqlite.prepare(
            "UPDATE installments SET percentage = ? WHERE id = ?"
        ).run(percentage, existing.id);
        return Number(existing.id);
    }

    const result = sqlite.prepare(`
        INSERT INTO installments (in_installments, percentage)
        VALUES (?, ?)
    `).run(count, percentage);

    const insertedId = Number(result.lastInsertRowid ?? 0);
    if (!insertedId) {
        throw new Error(`Não foi possível preparar o parcelamento de ${count} vezes.`);
    }

    return insertedId;
}

function requirePaymentMethodId(
    paymentMethodIds: Record<string, number>,
    name: string
): number {
    const value = paymentMethodIds[name];

    if (value === undefined) {
        throw new Error(`Forma de pagamento não cadastrada: ${name}.`);
    }

    return value;
}

function cleanupPreviousDemoSales() {
    const saleRange = "sale_id BETWEEN ? AND ?";
    const args = [DEMO_SALE_FIRST_ID, DEMO_SALE_LAST_ID];

    // Apaga os documentos fiscais dependentes das vendas que este seed recria.
    const invoiceIds = `
        SELECT id FROM fiscal_invoices
        WHERE ${saleRange}
    `;

    sqlite.prepare(`
        DELETE FROM danfes
        WHERE fiscal_invoice_id IN (${invoiceIds})
    `).run(...args);

    sqlite.prepare(`
        DELETE FROM internal_documents
        WHERE sale_id BETWEEN ? AND ?
           OR fiscal_invoice_id IN (${invoiceIds})
    `).run(...args, ...args);

    sqlite.prepare(`
        DELETE FROM sefaz_responses
        WHERE fiscal_invoice_id IN (${invoiceIds})
    `).run(...args);

    sqlite.prepare(`
        DELETE FROM fiscal_invoice_items
        WHERE fiscal_invoice_id IN (${invoiceIds})
    `).run(...args);

    sqlite.prepare(`
        DELETE FROM fiscal_invoice_totals
        WHERE fiscal_invoice_id IN (${invoiceIds})
    `).run(...args);

    sqlite.prepare(`
        DELETE FROM fiscal_invoices
        WHERE ${saleRange}
    `).run(...args);

    sqlite.prepare(`
        DELETE FROM stock_sale
        WHERE sale_id BETWEEN ? AND ?
    `).run(...args);

    sqlite.prepare(`
        DELETE FROM cashier
        WHERE id BETWEEN ? AND ?
    `).run(...args);

    // Remove apenas os registros de movimentação criados por esta seed.
    sqlite.prepare(
        "DELETE FROM update_stock WHERE notes LIKE ?"
    ).run(`${DEMO_NOTE_PREFIX}%`);
}

function upsertCompany(bossUserId: number) {
    sqlite.prepare(`
        INSERT INTO company (
            id, boss_user_id, cnpj, legal_name, trade_name,
            state_registration, municipal_registration, tax_regime,
            address, number, complement, neighborhood, city,
            city_ibge, state, zip_code
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            boss_user_id = excluded.boss_user_id,
            cnpj = excluded.cnpj,
            legal_name = excluded.legal_name,
            trade_name = excluded.trade_name,
            state_registration = excluded.state_registration,
            municipal_registration = excluded.municipal_registration,
            tax_regime = excluded.tax_regime,
            address = excluded.address,
            number = excluded.number,
            complement = excluded.complement,
            neighborhood = excluded.neighborhood,
            city = excluded.city,
            city_ibge = excluded.city_ibge,
            state = excluded.state,
            zip_code = excluded.zip_code
    `).run(
        1,
        bossUserId,
        "00.000.000/0001-00", // Placeholder inválido: substituir antes de emitir NF-e.
        "EMPRESA TESTE MOTOPECAS LTDA",
        "GlauGrau Motopeças",
        "000000000000",
        null,
        "SIMPLES_NACIONAL",
        "Avenida Padre Anchieta",
        "1000",
        null,
        "Centro",
        "Peruíbe",
        "3537606",
        "SP",
        "11750-000"
    );
}

function upsertFiscalConfig() {
    sqlite.prepare(`
        INSERT INTO fiscal_config (
            id, company_id, tax_regime, cfop_default, ncm_default,
            nat_op_default, ibs, cbs
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            company_id = excluded.company_id,
            tax_regime = excluded.tax_regime,
            cfop_default = excluded.cfop_default,
            ncm_default = excluded.ncm_default,
            nat_op_default = excluded.nat_op_default,
            ibs = excluded.ibs,
            cbs = excluded.cbs
    `).run(
        1,
        1,
        "SIMPLES_NACIONAL",
        "5102",
        "87141000",
        "Venda de Mercadoria",
        0,
        0
    );
}

type ProductSeed = {
    id: number;
    code: string;
    name: string;
    description: string;
    value: number;
    cost: number;
    amount: number;
    ncm: string;
    csosn: string;
};

const productData: ProductSeed[] = [
    { id: 1, code: "SM001", name: "Pastilha de Freio Dianteira", description: "Pastilha dianteira para motocicletas Honda CG 160.", value: 45.90, cost: 28.00, amount: 25, ncm: "87141000", csosn: "400" },
    { id: 2, code: "SM002", name: "Kit Relação CG 160", description: "Kit com corrente, coroa e pinhão para Honda CG 160.", value: 139.90, cost: 92.00, amount: 20, ncm: "87141000", csosn: "400" },
    { id: 3, code: "SM003", name: "Vela de Ignição NGK", description: "Vela de ignição para motores de motocicletas.", value: 24.90, cost: 15.50, amount: 40, ncm: "85111000", csosn: "400" },
    { id: 4, code: "SM004", name: "Filtro de Óleo", description: "Filtro de óleo compatível com motocicletas Honda.", value: 32.90, cost: 19.00, amount: 30, ncm: "84212300", csosn: "400" },
    { id: 5, code: "SM005", name: "Filtro de Ar CG 160", description: "Filtro de ar para Honda CG 160 Titan, Fan e Start.", value: 38.90, cost: 23.00, amount: 18, ncm: "84213100", csosn: "400" },
    { id: 6, code: "SM006", name: "Manete de Freio Dianteiro", description: "Manete dianteiro de reposição para motocicletas Honda.", value: 29.90, cost: 17.00, amount: 22, ncm: "87141000", csosn: "400" },
    { id: 7, code: "SM007", name: "Cabo de Embreagem", description: "Cabo de embreagem para Honda CG 160.", value: 21.90, cost: 12.50, amount: 15, ncm: "87141000", csosn: "400" },
    { id: 8, code: "SM008", name: "Lâmpada de Farol LED", description: "Lâmpada LED para farol de motocicleta.", value: 59.90, cost: 36.00, amount: 10, ncm: "85395200", csosn: "400" },
    { id: 9, code: "SM009", name: "Retrovisor Esportivo", description: "Par de retrovisores universais para motocicletas.", value: 79.90, cost: 48.00, amount: 12, ncm: "70091000", csosn: "400" },
    { id: 10, code: "SM010", name: "Câmara de Ar Aro 18", description: "Câmara de ar para pneu de motocicleta aro 18.", value: 34.90, cost: 21.00, amount: 20, ncm: "40139000", csosn: "400" },
    { id: 11, code: "SM011", name: "Disco de Freio Dianteiro", description: "Disco de freio de reposição para motocicleta.", value: 89.90, cost: 54.00, amount: 16, ncm: "87141000", csosn: "400" },
    { id: 12, code: "SM012", name: "Corrente de Transmissão", description: "Corrente de transmissão para motocicletas de baixa cilindrada.", value: 69.90, cost: 42.00, amount: 18, ncm: "73151100", csosn: "400" },
    { id: 13, code: "SM013", name: "Coroa Traseira", description: "Coroa de transmissão para motocicletas Honda.", value: 49.90, cost: 29.00, amount: 20, ncm: "87141000", csosn: "400" },
    { id: 14, code: "SM014", name: "Pinhão de Transmissão", description: "Pinhão de transmissão para motocicletas Honda.", value: 22.90, cost: 13.00, amount: 20, ncm: "87141000", csosn: "400" },
    { id: 15, code: "SM015", name: "Pastilha de Freio Traseira", description: "Pastilha traseira para motocicletas compatíveis.", value: 39.90, cost: 24.00, amount: 15, ncm: "87141000", csosn: "400" },
    { id: 16, code: "SM016", name: "Kit de Reparo de Carburador", description: "Kit de juntas e reparos para carburador.", value: 31.50, cost: 18.00, amount: 12, ncm: "87141000", csosn: "400" },
    { id: 17, code: "SM017", name: "Bateria 12V para Moto", description: "Bateria 12V para motocicletas compatíveis.", value: 189.90, cost: 132.00, amount: 8, ncm: "85071090", csosn: "400" },
    { id: 18, code: "SM018", name: "Buzina 12V", description: "Buzina elétrica 12V para motocicletas.", value: 27.90, cost: 16.00, amount: 14, ncm: "85123000", csosn: "400" },
    { id: 19, code: "SM019", name: "Indicador de Direção LED", description: "Par de indicadores de direção LED para motocicleta.", value: 44.90, cost: 25.00, amount: 15, ncm: "85122019", csosn: "400" },
    { id: 20, code: "SM020", name: "Capacete de Segurança", description: "Capacete para motociclista; referência ilustrativa de catálogo.", value: 219.90, cost: 155.00, amount: 10, ncm: "65061000", csosn: "400" }
];

function upsertProducts(unitId: number) {
    const insert = sqlite.prepare(`
        INSERT INTO products (
            id, sm_code, bar_code, name, description, value, cost,
            amount, unit_id, ncm, cst, csosn, icms, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(id) DO UPDATE SET
            sm_code = excluded.sm_code,
            bar_code = excluded.bar_code,
            name = excluded.name,
            description = excluded.description,
            value = excluded.value,
            cost = excluded.cost,
            amount = excluded.amount,
            unit_id = excluded.unit_id,
            ncm = excluded.ncm,
            cst = excluded.cst,
            csosn = excluded.csosn,
            icms = excluded.icms,
            status = excluded.status
    `);

    for (const product of productData) {
        // GTIN-13 gerado para demonstração; não representa cadastro comercial real.
        const barcode = makeGtin13(product.id);

        insert.run(
            product.id,
            product.code,
            barcode,
            product.name,
            product.description,
            product.value.toFixed(2),
            product.cost.toFixed(2),
            String(product.amount),
            unitId,
            product.ncm,
            "0", // Origem nacional usada como dado de demonstração.
            product.csosn,
            0,
        );
    }
}

type ServiceSeed = {
    id: number;
    code: string;
    name: string;
    description: string;
    price: number;
};

const serviceData: ServiceSeed[] = [
    { id: 1, code: "SRV001", name: "Troca de óleo", description: "Serviço de troca de óleo do motor da motocicleta.", price: 65.00 },
    { id: 2, code: "SRV002", name: "Regulagem de freios", description: "Inspeção e regulagem dos freios dianteiro e traseiro.", price: 35.00 },
    { id: 3, code: "SRV003", name: "Regulagem de embreagem", description: "Ajuste da folga e funcionamento da embreagem.", price: 30.00 },
    { id: 4, code: "SRV004", name: "Troca de pastilha de freio", description: "Mão de obra para substituição das pastilhas de freio.", price: 55.00 },
    { id: 5, code: "SRV005", name: "Instalação de bateria", description: "Remoção da bateria antiga e instalação de bateria compatível.", price: 45.00 },
    { id: 6, code: "SRV006", name: "Revisão elétrica básica", description: "Verificação básica de iluminação, buzina e conexões elétricas.", price: 80.00 },
    { id: 7, code: "SRV007", name: "Instalação de lâmpada", description: "Mão de obra para substituição da lâmpada do farol.", price: 25.00 },
    { id: 8, code: "SRV008", name: "Ajuste de corrente", description: "Ajuste de tensão e alinhamento da corrente de transmissão.", price: 30.00 },
    { id: 9, code: "SRV009", name: "Diagnóstico mecânico", description: "Inspeção inicial para identificação de falhas mecânicas.", price: 90.00 },
    { id: 10, code: "SRV010", name: "Revisão preventiva", description: "Verificação preventiva dos principais componentes da motocicleta.", price: 150.00 }
];

function upsertServices() {
    const insert = sqlite.prepare(`
        INSERT INTO services (
            id, sm_code, bar_code, name, description, cost, status
        ) VALUES (?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(id) DO UPDATE SET
            sm_code = excluded.sm_code,
            bar_code = excluded.bar_code,
            name = excluded.name,
            description = excluded.description,
            cost = excluded.cost,
            status = excluded.status
    `);

    for (const service of serviceData) {
        // Código de barras sintético para uso exclusivo em demonstração.
        insert.run(
            service.id,
            service.code,
            makeGtin13(100 + service.id),
            service.name,
            service.description,
            service.price.toFixed(2)
        );
    }
}

function makeClients(paymentMethodIds: Record<string, number>) {
    const clients = [
        {
            id: 1,
            name: "Cliente Teste CPF 1",
            cpf: makeCpf("846275193"),
            cnpj: null,
            ie: null,
            address: "Avenida Padre Anchieta",
            number: "100",
            complement: null,
            neighborhood: "Centro",
            city: "Peruíbe",
            city_ibge: "3537606",
            state: "SP",
            zip_code: "11750000",
            method_id: paymentMethodIds["Dinheiro"]
        },
        {
            id: 2,
            name: "Cliente Teste CPF 2",
            cpf: makeCpf("681543270"),
            cnpj: null,
            ie: null,
            address: "Rua das Acácias",
            number: "250",
            complement: "Casa 2",
            neighborhood: "Jardim Mar",
            city: "Peruíbe",
            city_ibge: "3537606",
            state: "SP",
            zip_code: "11751000",
            method_id: paymentMethodIds["PIX"]
        },
        {
            id: 3,
            name: "Empresa Cliente Teste 1 LTDA",
            cpf: null,
            cnpj: makeCnpj("417389520001"),
            ie: "ISENTO",
            address: "Rua das Flores",
            number: "200",
            complement: "Sala 1",
            neighborhood: "Centro",
            city: "Peruíbe",
            city_ibge: "3537606",
            state: "SP",
            zip_code: "11752000",
            method_id: paymentMethodIds["Cartão de Crédito"]
        },
        {
            id: 4,
            name: "Empresa Cliente Teste 2 LTDA",
            cpf: null,
            cnpj: makeCnpj("583104670001"),
            ie: "ISENTO",
            address: "Avenida São João",
            number: "350",
            complement: "Conjunto 4",
            neighborhood: "Centro",
            city: "Santos",
            city_ibge: "3548500",
            state: "SP",
            zip_code: "11000000",
            method_id: paymentMethodIds["Cartão de Débito"]
        },
        {
            id: 5,
            name: "Consumidor sem cadastro fiscal",
            cpf: null,
            cnpj: null,
            ie: null,
            address: null,
            number: null,
            complement: null,
            neighborhood: null,
            city: null,
            city_ibge: null,
            state: null,
            zip_code: null,
            method_id: paymentMethodIds["Dinheiro"]
        }
    ];

    const insert = sqlite.prepare(`
        INSERT INTO clients (
            id, name, cpf, cnpj, ie, address, number,
            complement, neighborhood, city, city_ibge,
            state, zip_code, method_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            cpf = excluded.cpf,
            cnpj = excluded.cnpj,
            ie = excluded.ie,
            address = excluded.address,
            number = excluded.number,
            complement = excluded.complement,
            neighborhood = excluded.neighborhood,
            city = excluded.city,
            city_ibge = excluded.city_ibge,
            state = excluded.state,
            zip_code = excluded.zip_code,
            method_id = excluded.method_id
    `);

    for (const client of clients) {
        insert.run(
            client.id,
            client.name,
            client.cpf,
            client.cnpj,
            client.ie,
            client.address,
            client.number,
            client.complement,
            client.neighborhood,
            client.city,
            client.city_ibge,
            client.state,
            client.zip_code,
            client.method_id
        );
    }

    return clients;
}

function getProduct(productId: number): any {
    const product = sqlite.prepare(`
        SELECT
            p.*,
            u.unity AS unit_measure
        FROM products p
        LEFT JOIN un_measure u ON u.id = p.unit_id
        WHERE p.id = ?
    `).get(productId);

    if (!product) {
        throw new Error(`Produto ${productId} não encontrado.`);
    }

    return product;
}

function recordStockMovement(
    product: any,
    movementType: string,
    quantityRemoved: number,
    quantityAdded: number,
    note: string,
    referenceId: number | null = null,
    movementValue: string | null = null
) {
    sqlite.prepare(`
        INSERT INTO update_stock (
            product_id, movement_type, qunt_remove, qunt_add,
            dt_update, reference_id, movement_value, unit_measure,
            notes, sm_code, bar_code, name, description, value,
            cost, amount, ncm, cst, csosn, icms, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        product.id,
        movementType,
        quantityRemoved,
        quantityAdded,
        new Date().toISOString(),
        referenceId,
        movementValue ?? String(product.value ?? "0.00"),
        product.unit_measure || "UN",
        `${DEMO_NOTE_PREFIX} ${note}`,
        product.sm_code,
        product.bar_code,
        product.name,
        product.description ?? null,
        String(product.value ?? "0.00"),
        String(product.cost ?? "0.00"),
        String(product.amount ?? "0"),
        product.ncm ?? null,
        String(product.cst ?? "0"),
        String(product.csosn ?? "0"),
        Number(product.icms ?? 0),
        product.status ? 1 : 0
    );
}

function applyInventoryDemonstrations() {
    const updateStock = sqlite.prepare(
        "UPDATE products SET amount = ? WHERE id = ?"
    );

    // 5 retiradas: produtos 1 a 5, retirando 2 unidades de cada.
    for (const productId of [1, 2, 3, 4, 5]) {
        const product = getProduct(productId);
        const current = Number(product.amount) || 0;
        const quantity = 2;

        if (current < quantity) {
            throw new Error(`Estoque insuficiente para a retirada do produto ${product.name}.`);
        }

        recordStockMovement(
            product,
            "remove",
            quantity,
            0,
            `Retirada de demonstração; saldo após operação=${current - quantity}`
        );

        updateStock.run(String(current - quantity), productId);
    }

    // 5 entradas: produtos 6 a 10, adicionando 5 unidades de cada.
    for (const productId of [6, 7, 8, 9, 10]) {
        const product = getProduct(productId);
        const current = Number(product.amount) || 0;
        const quantity = 5;

        recordStockMovement(
            product,
            "add",
            0,
            quantity,
            `Entrada de demonstração; saldo após operação=${current + quantity}`
        );

        updateStock.run(String(current + quantity), productId);
    }

    // 5 edições: produtos 11 a 15. Registra a ficha anterior e aplica alterações.
    const updateProduct = sqlite.prepare(`
        UPDATE products
        SET name = ?, description = ?, value = ?, cost = ?
        WHERE id = ?
    `);

    for (const productId of [11, 12, 13, 14, 15]) {
        const product = getProduct(productId);
        const oldValue = Number(product.value) || 0;
        const oldCost = Number(product.cost) || 0;
        const newValue = roundMoney(oldValue + 2.00);
        const newCost = roundMoney(oldCost + 1.00);
        const newName = `${product.name} (editado)`;
        const newDescription = `${product.description || ""} Características atualizadas pela seed de demonstração.`.trim();

        recordStockMovement(
            product,
            "update",
            0,
            0,
            `Edição de produto: preço ${oldValue.toFixed(2)} -> ${newValue.toFixed(2)}; custo ${oldCost.toFixed(2)} -> ${newCost.toFixed(2)}; nome e descrição atualizados.`
        );

        updateProduct.run(
            newName,
            newDescription,
            newValue.toFixed(2),
            newCost.toFixed(2),
            productId
        );
    }
}

type SaleItemSpec = {
    productId?: number;
    serviceId?: number;
    quantity: number;
    unitPrice?: number;
};

type SaleSpec = {
    id: number;
    clientId: number;
    paymentMethodId: number;
    installmentId: number | null;
    items: SaleItemSpec[];
};

function createDemoSales(
    paymentMethodIds: Record<string, number>,
    installmentIds: { five: number; ten: number }
) {
    const getRequiredNumber = (map: Record<string, number>, key: string): number => {
        const value = map[key];

        if (value === undefined) {
            throw new Error(`Método de pagamento ou parcela não encontrado: ${key}.`);
        }

        return value;
    };

    const cash = getRequiredNumber(paymentMethodIds, "Dinheiro");
    const pix = getRequiredNumber(paymentMethodIds, "PIX");
    const credit = getRequiredNumber(paymentMethodIds, "Cartão de Crédito");
    const debit = getRequiredNumber(paymentMethodIds, "Cartão de Débito");

    const sales: SaleSpec[] = [
        // 10 vendas somente de produtos.
        { id: 1, clientId: 1, paymentMethodId: cash, installmentId: null, items: [{ productId: 1, quantity: 2 }, { productId: 2, quantity: 1, unitPrice: 129.90 }] },
        { id: 2, clientId: 2, paymentMethodId: pix, installmentId: null, items: [{ productId: 3, quantity: 2 }, { productId: 4, quantity: 1, unitPrice: 30.00 }] },
        { id: 3, clientId: 3, paymentMethodId: credit, installmentId: installmentIds.five, items: [{ productId: 5, quantity: 1 }, { productId: 6, quantity: 2 }] },
        { id: 4, clientId: 4, paymentMethodId: debit, installmentId: null, items: [{ productId: 7, quantity: 2 }, { productId: 8, quantity: 1 }] },
        { id: 5, clientId: 5, paymentMethodId: cash, installmentId: null, items: [{ productId: 9, quantity: 1 }, { productId: 10, quantity: 3 }] },
        { id: 6, clientId: 1, paymentMethodId: credit, installmentId: installmentIds.ten, items: [{ productId: 11, quantity: 2 }, { productId: 12, quantity: 1 }] },
        { id: 7, clientId: 2, paymentMethodId: pix, installmentId: null, items: [{ productId: 13, quantity: 1 }, { productId: 14, quantity: 2 }] },
        { id: 8, clientId: 3, paymentMethodId: debit, installmentId: null, items: [{ productId: 15, quantity: 2 }, { productId: 16, quantity: 1 }] },
        { id: 9, clientId: 4, paymentMethodId: cash, installmentId: null, items: [{ productId: 17, quantity: 1 }, { productId: 18, quantity: 2 }] },
        { id: 10, clientId: 5, paymentMethodId: credit, installmentId: installmentIds.five, items: [{ productId: 19, quantity: 1 }, { productId: 20, quantity: 1 }] },

        // 8 vendas somente de serviços.
        { id: 11, clientId: 1, paymentMethodId: cash, installmentId: null, items: [{ serviceId: 1, quantity: 1 }] },
        { id: 12, clientId: 2, paymentMethodId: pix, installmentId: null, items: [{ serviceId: 2, quantity: 1 }] },
        { id: 13, clientId: 3, paymentMethodId: credit, installmentId: installmentIds.five, items: [{ serviceId: 3, quantity: 1 }] },
        { id: 14, clientId: 4, paymentMethodId: debit, installmentId: null, items: [{ serviceId: 4, quantity: 1 }] },
        { id: 15, clientId: 5, paymentMethodId: cash, installmentId: null, items: [{ serviceId: 5, quantity: 1 }] },
        { id: 16, clientId: 1, paymentMethodId: pix, installmentId: null, items: [{ serviceId: 6, quantity: 1 }] },
        { id: 17, clientId: 2, paymentMethodId: credit, installmentId: installmentIds.ten, items: [{ serviceId: 7, quantity: 1 }] },
        { id: 18, clientId: 3, paymentMethodId: debit, installmentId: null, items: [{ serviceId: 8, quantity: 1 }] },

        // 2 vendas mistas: um produto e um serviço no mesmo caixa.
        { id: 19, clientId: 4, paymentMethodId: cash, installmentId: null, items: [{ productId: 1, quantity: 1 }, { serviceId: 9, quantity: 1 }] },
        { id: 20, clientId: 5, paymentMethodId: credit, installmentId: installmentIds.five, items: [{ productId: 2, quantity: 1 }, { serviceId: 10, quantity: 1 }] }
    ];

    const insertSale = sqlite.prepare(`
        INSERT INTO cashier (
            id, total_value, method_id, client_id, installment_id,
            dt_sale, customer_name, customer_tax_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertItem = sqlite.prepare(`
        INSERT INTO stock_sale (
            value, sale_id, product_id, service_id, qunt_sale, unit_measure
        ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    const updateStock = sqlite.prepare(
        "UPDATE products SET amount = ? WHERE id = ?"
    );

    const getClient = sqlite.prepare(
        "SELECT id, name, cpf, cnpj FROM clients WHERE id = ?"
    );

    const getInstallment = sqlite.prepare(
        "SELECT percentage FROM installments WHERE id = ?"
    );

    const getService = sqlite.prepare(`
        SELECT id, sm_code, bar_code, name, description, cost, status
        FROM services
        WHERE id = ?
        LIMIT 1
    `);

    for (const sale of sales) {
        const client = getClient.get(sale.clientId) as {
            id: number;
            name: string;
            cpf: string | null;
            cnpj: string | null;
        } | undefined;

        if (!client) {
            throw new Error(
                `Cliente ${sale.clientId} não encontrado para a venda ${sale.id}.`
            );
        }

        const dt = new Date();
        dt.setDate(dt.getDate() - (DEMO_SALE_LAST_ID - sale.id));
        const saleDate = dt.toISOString();

        const saleLines: Array<{
            product: any | null;
            service: any | null;
            quantity: number;
            unitPrice: number;
            lineTotal: number;
            unitMeasure: string;
        }> = [];

        let subtotal = 0;

        for (const item of sale.items) {
            const hasProduct = item.productId !== undefined;
            const hasService = item.serviceId !== undefined;

            if (hasProduct === hasService) {
                throw new Error(
                    `Cada item da venda ${sale.id} deve conter exatamente um productId ou serviceId.`
                );
            }

            let product: any | null = null;
            let service: any | null = null;
            let defaultPrice = 0;
            let unitMeasure = "UN";

            if (hasProduct) {
                product = getProduct(Number(item.productId));
                const available = Number(product.amount) || 0;

                if (available < item.quantity) {
                    throw new Error(
                        `Estoque insuficiente para a venda ${sale.id}: ${product.name}.`
                    );
                }

                defaultPrice = Number(product.value);
                unitMeasure = product.unit_measure || "UN";
            } else {
                service = getService.get(Number(item.serviceId));

                if (!service || !service.status) {
                    throw new Error(
                        `Serviço ${item.serviceId} não encontrado ou inativo na venda ${sale.id}.`
                    );
                }

                defaultPrice = Number(service.cost);
                unitMeasure = "SV";
            }

            const unitPrice = roundMoney(
                item.unitPrice !== undefined
                    ? item.unitPrice
                    : defaultPrice
            );

            if (!Number.isFinite(unitPrice) || unitPrice < 0) {
                throw new Error(
                    `Preço inválido para um item da venda ${sale.id}.`
                );
            }

            const lineTotal = roundMoney(unitPrice * item.quantity);
            subtotal = roundMoney(subtotal + lineTotal);

            saleLines.push({
                product,
                service,
                quantity: item.quantity,
                unitPrice,
                lineTotal,
                unitMeasure
            });
        }

        let percentage = 0;

        if (sale.installmentId !== null) {
            const installment = getInstallment.get(sale.installmentId) as
                | { percentage: number }
                | undefined;

            if (!installment) {
                throw new Error(
                    `Parcelamento ${sale.installmentId} não encontrado.`
                );
            }

            percentage = Number(installment.percentage) || 0;
        }

        const totalValue = roundMoney(subtotal + subtotal * percentage);
        const customerTaxId = digits(client.cpf || client.cnpj) || null;

        insertSale.run(
            sale.id,
            totalValue,
            sale.paymentMethodId,
            sale.clientId,
            sale.installmentId,
            saleDate,
            client.name,
            customerTaxId
        );

        for (const line of saleLines) {
            insertItem.run(
                line.unitPrice.toFixed(2),
                sale.id,
                line.product?.id ?? null,
                line.service?.id ?? null,
                line.quantity,
                line.unitMeasure
            );

            // Serviço não reduz estoque; somente produtos geram movimentação.
            if (line.product) {
                const current = getProduct(line.product.id);
                const stockBefore = Number(current.amount) || 0;
                const stockAfter = stockBefore - line.quantity;

                recordStockMovement(
                    current,
                    "sale",
                    line.quantity,
                    0,
                    `Baixa pela venda ${sale.id}; saldo após operação=${stockAfter}`,
                    sale.id,
                    line.unitPrice.toFixed(2)
                );

                updateStock.run(String(stockAfter), line.product.id);
            }
        }
    }
}

function unifiedDemoSeed() {
    if (process.env.NODE_ENV === "production") {
        throw new Error(
            "Esta seed é destrutiva e só pode ser executada em desenvolvimento/teste."
        );
    }

    const bossUser = sqlite.prepare(`
        SELECT u.id
        FROM users u
        INNER JOIN roles_user ru ON ru.user_id = u.id
        INNER JOIN roles r ON r.id = ru.role_id
        WHERE r.name = 'boss'
          AND r.level >= 3
          AND u.status = 1
        ORDER BY u.id
        LIMIT 1
    `).get() as { id: number } | undefined;

    if (!bossUser) {
        throw new Error(
            "Crie um usuário ativo com a role boss (nível 3 ou superior) antes de executar a seed."
        );
    }

    // O objeto sqlite deste projeto expõe prepare()/exec(), mas não
    // necessariamente a API transaction() do better-sqlite3.
    // Controlamos a transação explicitamente para manter a seed atômica.
    sqlite.exec("BEGIN IMMEDIATE");

    try {
        cleanupPreviousDemoSales();

        const unitId = getUnitId();

        const paymentMethodIds: Record<string, number> = {
            "Dinheiro": ensurePaymentMethod("Dinheiro"),
            "PIX": ensurePaymentMethod("PIX"),
            "Cartão de Crédito": ensurePaymentMethod("Cartão de Crédito"),
            "Cartão de Débito": ensurePaymentMethod("Cartão de Débito")
        };

        // O campo percentage é uma fração: 0.05 = 5%, 0.10 = 10%.
        const installmentIds = {
            five: ensureInstallment(5, 0.05),
            ten: ensureInstallment(10, 0.10)
        };

        upsertCompany(Number(bossUser.id));
        upsertFiscalConfig();
        upsertProducts(unitId);
        upsertServices();
        makeClients(paymentMethodIds);
        applyInventoryDemonstrations();
        createDemoSales(paymentMethodIds, installmentIds);

        sqlite.exec("COMMIT");
    } catch (error) {
        try {
            sqlite.exec("ROLLBACK");
        } catch {
            // Preserva o erro original caso a transação já tenha sido encerrada.
        }

        throw error;
    }

    console.log(
        "Seed unificada concluída: empresa, configuração fiscal, 20 produtos, " +
        "10 serviços, 5 clientes, movimentos de estoque e 20 vendas " +
        "(10 de produtos, 8 de serviços e 2 mistas)."
    );
}

module.exports = { unifiedDemoSeed };
