const {
    integer,
    real,
    text,
    sqliteTable
} = require("drizzle-orm/sqlite-core");


// ============================================================
// USERS
// ============================================================

const userTable = sqliteTable("users", {

    id: integer("id").primaryKey(),

    email: text("email")
        .unique()
        .notNull(),

    password: text("password").notNull(),

    avatar: text("avatar"),

    status: integer("status", { mode: "boolean" })
        .notNull()

});


// ============================================================
// ROLES
// ============================================================

const rolesTable = sqliteTable("roles", {

    id: integer("id").primaryKey(),

    name: text("name")
        .unique()
        .notNull(),

    level: integer("level").notNull(),

    status: integer("status", { mode: "boolean" })
        .notNull()

});


// ============================================================
// ROLES TO USER
// ============================================================

const rolesUserTable = sqliteTable("roles_user", {

    id: integer("id").primaryKey(),

    roleId: integer("role_id")
        .notNull()
        .references(() => rolesTable.id),

    userId: integer("user_id")
        .notNull()
        .references(() => userTable.id)

});


// ============================================================
// COMPANY
// ============================================================

const companyTable = sqliteTable("company", {

    id: integer("id").primaryKey(),

    bossUserId: integer("boss_user_id")
        .unique()
        .references(() => userTable.id),
    cnpj: text("cnpj")
        .notNull()
        .unique(),

    legalName: text("legal_name")
        .notNull(),

    tradeName: text("trade_name"),

    stateRegistration: text("state_registration")
        .notNull(),

    municipalRegistration: text("municipal_registration"),

    taxRegime: text("tax_regime")
        .notNull(),

    address: text("address")
        .notNull(),

    number: text("number")
        .notNull(),

    complement: text("complement"),

    neighborhood: text("neighborhood")
        .notNull(),

    city: text("city")
        .notNull(),

    cityIbge: text("city_ibge")
        .notNull(),

    state: text("state")
        .notNull(),

    zipCode: text("zip_code")
        .notNull()

});


// ============================================================
// FISCAL CONFIG
// ============================================================

const fiscalConfigTable = sqliteTable("fiscal_config", {

    id: integer("id").primaryKey(),

    companyId: integer("company_id")
        .notNull()
        .references(() => companyTable.id),

    // Regra tributária da empresa
    taxRegime: text("tax_regime")
        .notNull(),

    // Operação padrão
    cfopDefault: text("cfop_default")
        .notNull(),

    // NCM utilizado quando o produto não possuir NCM
    ncmDefault: text("ncm_default")
        .notNull(),

    // Natureza padrão para novas operações fiscais.
    natOpDefault: text("nat_op_default")
        .notNull()
        .default("Venda de Mercadoria"),
    // Novo Regime Tributário
    // Padrão = 0
    ibs: real("ibs")
        .notNull()
        .default(0),

    cbs: real("cbs")
        .notNull()
        .default(0)

});


// ============================================================
// FISCAL CERTIFICATES
// ============================================================

const fiscalCertificateTable = sqliteTable("fiscal_certificates", {

    id: integer("id").primaryKey(),

    companyId: integer("company_id")
        .notNull()
        .references(() => companyTable.id),

    // Caminho/identificação do certificado digital
    certificate: text("certificate")
        .notNull(),

    // Senha do certificado.
    // Na implementação real, deve ser armazenada de forma segura.
    password: text("password")
        .notNull(),

    validFrom: text("valid_from"),

    validUntil: text("valid_until"),

    status: integer("status", { mode: "boolean" })
        .notNull()
        .default(false)

});


// ============================================================
// PRODUCTS
// ============================================================
const unitMeasureTable = sqliteTable("un_measure", {

    id: integer("id").primaryKey(),

    unity: text("unity")
    .unique()
    .notNull(),

    description: text("description"),

});

const productsTable = sqliteTable("products", {

    id: integer("id").primaryKey(),

    smCode: text("sm_code")
        .unique()
        .notNull(),

    barCode: text("bar_code")
        .unique()
        .notNull(),

    name: text("name")
        .notNull(),

    description: text("description"),

    value: text("value")
        .default("0.00"),

    cost: text("cost")
        .default("0.00"),

    amount: text("amount")
        .default("0"),

    unitId: integer("unit_id")
        .notNull()
        .default(1).references(() => unitMeasureTable.id),

    // ========================
    // DADOS FISCAIS DO PRODUTO
    // ========================

    ncm: text("ncm"),

    cst: text("cst")
        .notNull()
        .default("0"),

    csosn: text("csosn")
        .notNull()
        .default("0"),

    icms: real("icms")
        .notNull()
        .default(0),

    status: integer("status", { mode: "boolean" })
        .notNull()

});


// ============================================================
// PAYMENT METHODS
// ============================================================

const updateStockTable = sqliteTable("update_stock", {
    id: integer("id").primaryKey(),
    productId: integer("product_id").notNull(),
    movementType: text("movement_type").notNull(),
    quntRemove: integer("qunt_remove").notNull().default(0),
    quntAdd: integer("qunt_add").notNull().default(0),
    dtUpdate: text("dt_update").notNull(),
    referenceId: integer("reference_id"),
    movementValue: text("movement_value"),
    unitMeasure: text("unit_measure").notNull().default("UN"),
    notes: text("notes"),
    smCode: text("sm_code").notNull(),
    barCode: text("bar_code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    value: text("value"),
    cost: text("cost"),
    amount: text("amount"),
    ncm: text("ncm"),
    cst: text("cst").notNull(),
    csosn: text("csosn").notNull(),
    icms: real("icms").notNull(),
    status: integer("status", { mode: "boolean" }).notNull()
});
const paymentMethodTable = sqliteTable("payment_method", {

    id: integer("id").primaryKey(),

    name: text("name")
        .unique()
        .notNull(),

    status: integer("status", { mode: "boolean" })
        .notNull()

});


// ============================================================
// INSTALLMENTS
// ============================================================

const installmentsTable = sqliteTable("installments", {

    id: integer("id").primaryKey(),

    inInstallments: integer("in_installments")
        .notNull(),

    percentage: real("percentage")
        .notNull()

});


// ============================================================
// CLIENTS
// ============================================================

const clientsTable = sqliteTable("clients", {

    id: integer("id").primaryKey(),

    name: text("name")
        .notNull(),

    cpf: text("cpf")
        .unique(),

    cnpj: text("cnpj")
        .unique(),

    // Inscrição Estadual
    ie: text("ie"),

    // ========================
    // ENDEREÇO FISCAL
    // ========================

    address: text("address"),

    number: text("number"),

    complement: text("complement"),

    neighborhood: text("neighborhood"),

    city: text("city"),

    cityIbge: text("city_ibge"),

    state: text("state"),

    zipCode: text("zip_code"),

    // Forma de pagamento preferencial
    methodId: integer("method_id")
        .references(() => paymentMethodTable.id)

});


// ============================================================
// CASHIER
// ============================================================

const cashierTable = sqliteTable("cashier", {

    id: integer("id").primaryKey(),

    totalValue: real("total_value")
        .notNull(),

    methodId: integer("method_id")
        .notNull()
        .references(() => paymentMethodTable.id),

    clientId: integer("client_id")
        .references(() => clientsTable.id),

    installmentId: integer("installment_id")
        .references(() => installmentsTable.id),

    customerName: text("customer_name"),

    customerTaxId: text("customer_tax_id"),

    dtSale: text("dt_sale")
        .notNull()

});

// ============================================================
// SERVICES
// ============================================================

const servicesTable = sqliteTable("services", {

    id: integer("id").primaryKey(),

    smCode: text("sm_code")
        .unique()
        .notNull(),

    barCode: text("bar_code")
        .unique()
        .notNull(),

    name: text("name")
        .notNull(),

    description: text("description"),

    cost: text("cost")
        .default("0.00"),

    status: integer("status", { mode: "boolean" })
        .notNull()

});
const stockServiceTable = sqliteTable("stock_service", {

    id: integer("id").primaryKey(),

    serviceId: integer("service_id")
        .notNull()
        .references(() => servicesTable.id),

    productId: integer("product_id")
        .notNull()
        .references(() => productsTable.id),

    qunt: integer("qunt")
        .notNull(),

});

// ============================================================
// STOCK SALE
// ============================================================

const stockSaleTable = sqliteTable("stock_sale", {

    id: integer("id").primaryKey(),

    value: text("value"),

    saleId: integer("sale_id")
        .notNull()
        .references(() => cashierTable.id),

    productId: integer("product_id")
        .references(() => productsTable.id),

    serviceId: integer("service_id")
        .references(() => servicesTable.id),

    quntSale: integer("qunt_sale")
        .notNull(),

    unitMeasure: text("unit_measure")
        .notNull()
        .default("UN")

});

// ============================================================
// FISCAL INVOICES
// ============================================================

const fiscalInvoiceTable = sqliteTable("fiscal_invoices", {

    id: integer("id").primaryKey(),

    // Venda que originou a NF-e
    saleId: integer("sale_id")
        .notNull()
        .references(() => cashierTable.id),

    // Número sequencial da NF-e
    number: integer("number")
        .notNull(),

    // Natureza da operação
    // Padrão: Venda de Mercadoria
    // Pode ser alterada pelo usuário.
    natOp: text("nat_op")
        .notNull()
        .default("Venda de Mercadoria"),

    // ========================================================
    // DADOS DA OPERAÇÃO
    // ========================================================

    // 1 = saída
    tpNf: integer("tp_nf")
        .notNull()
        .default(1),

    // 1 = NF-e normal
    finNfe: integer("fin_nfe")
        .notNull()
        .default(1),

    // 1 = consumidor final
    indFinal: integer("ind_final")
        .notNull()
        .default(1),

    // 1 = operação presencial
    indPres: integer("ind_pres")
        .notNull()
        .default(1),

    // 0 = sem intermediador
    indIntermed: integer("ind_intermed")
        .notNull()
        .default(0),

    // 1 = interna
    // 2 = interestadual
    // 3 = exterior
    idDest: integer("id_dest")
        .notNull(),

    // ========================================================
    // PAGAMENTO
    // ========================================================

    methodId: integer("method_id")
        .notNull()
        .references(() => paymentMethodTable.id),

    installmentId: integer("installment_id")
        .references(() => installmentsTable.id),

    // ========================================================
    // XML
    // ========================================================

    // XML inicialmente gerado
    xml: text("xml"),

    // XML depois da assinatura digital
    xmlSigned: text("xml_signed"),

    // XML final autorizado
    xmlAuthorized: text("xml_authorized"),

    // Chave de acesso da NF-e
    accessKey: text("access_key"),

    // ========================================================
    // STATUS DA NF-e
    // ========================================================

    // pending
    // signed
    // processing
    // authorized
    // rejected
    // cancelled
    status: text("status")
        .notNull()
        .default("pending"),

    createdAt: text("created_at")
        .notNull(),

    authorizedAt: text("authorized_at")

});


// ============================================================
// FISCAL INVOICE ITEMS
// ============================================================

const fiscalInvoiceItemsTable = sqliteTable("fiscal_invoice_items", {

    id: integer("id").primaryKey(),

    fiscalInvoiceId: integer("fiscal_invoice_id")
        .notNull()
        .references(() => fiscalInvoiceTable.id),

    productId: integer("product_id")
        .notNull()
        .references(() => productsTable.id),

    // ========================================================
    // SNAPSHOT DO PRODUTO
    // ========================================================

    productName: text("product_name")
        .notNull(),

    unitMeasure: text("unit_measure")
        .notNull()
        .default("UN"),

    barCode: text("bar_code"),

    ncm: text("ncm")
        .notNull(),

    cfop: text("cfop")
        .notNull(),

    // ========================================================
    // VALORES DA VENDA
    // ========================================================

    quantity: integer("quantity")
        .notNull(),

    // Valor cadastrado em products.value
    originalUnitValue: text("original_unit_value")
        .notNull(),

    // stock_sale.value ?? products.value
    unitValue: text("unit_value")
        .notNull(),

    // Desconto por unidade
    discount: text("discount")
        .notNull()
        .default("0.00"),

    // unitValue * quantity
    totalValue: text("total_value")
        .notNull(),

    // ========================================================
    // TRIBUTAÇÃO
    // ========================================================

    cst: text("cst")
        .notNull()
        .default("0"),

    csosn: text("csosn")
        .notNull()
        .default("0"),

    icms: real("icms")
        .notNull()
        .default(0),

    // Novo Regime Tributário
    // Valores herdados/configurados no momento da emissão.
    ibs: real("ibs")
        .notNull()
        .default(0),

    cbs: real("cbs")
        .notNull()
        .default(0)

});


// ============================================================
// FISCAL INVOICE TOTALS
// ============================================================

const fiscalInvoiceTotalsTable = sqliteTable("fiscal_invoice_totals", {

    id: integer("id").primaryKey(),

    fiscalInvoiceId: integer("fiscal_invoice_id")
        .notNull()
        .references(() => fiscalInvoiceTable.id),

    // ========================================================
    // PRODUTOS
    // ========================================================

    vProd: text("v_prod")
        .notNull(),

    vDesc: text("v_desc")
        .notNull()
        .default("0.00"),

    // ========================================================
    // TRANSPORTE / OUTROS
    // ========================================================

    vFrete: text("v_frete")
        .notNull()
        .default("0.00"),

    vSeg: text("v_seg")
        .notNull()
        .default("0.00"),

    vOutro: text("v_outro")
        .notNull()
        .default("0.00"),

    // ========================================================
    // TRIBUTOS
    // ========================================================

    vIcms: text("v_icms")
        .notNull()
        .default("0.00"),

    vPis: text("v_pis")
        .notNull()
        .default("0.00"),

    vCofins: text("v_cofins")
        .notNull()
        .default("0.00"),

    vIpi: text("v_ipi")
        .notNull()
        .default("0.00"),

    vIbs: text("v_ibs")
        .notNull()
        .default("0.00"),

    vCbs: text("v_cbs")
        .notNull()
        .default("0.00"),

    // ========================================================
    // TOTAL DA NF-e
    // ========================================================

    vNf: text("v_nf")
        .notNull()

});


// ============================================================
// SEFAZ RESPONSE
// ============================================================

const sefazResponseTable = sqliteTable("sefaz_responses", {

    id: integer("id").primaryKey(),

    fiscalInvoiceId: integer("fiscal_invoice_id")
        .notNull()
        .references(() => fiscalInvoiceTable.id),

    // Código retornado pela SEFAZ
    statusCode: text("status_code"),

    // Status da comunicação
    status: text("status"),

    // Mensagem retornada
    message: text("message"),

    // Protocolo de autorização
    protocol: text("protocol"),

    // Recibo quando utilizado no processo
    receipt: text("receipt"),

    // XML/retorno bruto da SEFAZ
    rawResponse: text("raw_response"),

    receivedAt: text("received_at")
        .notNull()

});


// ============================================================
// INTERNAL DOCUMENT
// ============================================================

const internalDocumentTable = sqliteTable("internal_documents", {

    id: integer("id").primaryKey(),

    saleId: integer("sale_id")
        .notNull()
        .references(() => cashierTable.id),

    fiscalInvoiceId: integer("fiscal_invoice_id")
        .references(() => fiscalInvoiceTable.id),

    // Caminho do PDF de controle interno
    pdfPath: text("pdf_path")
        .notNull(),

    generatedAt: text("generated_at")
        .notNull()

});


// ============================================================
// DANFE
// ============================================================

const danfeTable = sqliteTable("danfes", {

    id: integer("id").primaryKey(),

    fiscalInvoiceId: integer("fiscal_invoice_id")
        .notNull()
        .references(() => fiscalInvoiceTable.id),

    // Caminho do PDF DANFE
    pdfPath: text("pdf_path")
        .notNull(),

    generatedAt: text("generated_at")
        .notNull()

});


// ============================================================
// EXPORT
// ============================================================

module.exports = {

    userTable,
    rolesTable,
    rolesUserTable,

    companyTable,
    fiscalConfigTable,
    fiscalCertificateTable,

    unitMeasureTable,
    productsTable,
    updateStockTable,

    servicesTable,
    stockServiceTable,

    paymentMethodTable,
    installmentsTable,

    clientsTable,

    cashierTable,
    stockSaleTable,

    fiscalInvoiceTable,
    fiscalInvoiceItemsTable,
    fiscalInvoiceTotalsTable,

    sefazResponseTable,

    internalDocumentTable,
    danfeTable

};