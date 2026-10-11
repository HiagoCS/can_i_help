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
// USER ROLES
// Nome físico da tabela: user_roles
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
// Dados gerais da empresa
// CNPJ e endereço preservados
// ============================================================

const companyTable = sqliteTable("company", {
    id: integer("id").primaryKey(),

    bossUserId: integer("boss_user_id")
        .unique()
        .references(() => userTable.id),

    cnpj: text("cnpj")
        .unique(),

    legalName: text("legal_name"),

    tradeName: text("trade_name"),

    address: text("address"),

    number: text("number"),

    complement: text("complement"),

    neighborhood: text("neighborhood"),

    city: text("city"),

    cityIbge: text("city_ibge"),

    state: text("state"),
    pixKey: text("pix_key"),

    zipCode: text("zip_code")
});

// ============================================================
// FISCAL CONFIG
// Mantida para a funcionalidade de NF-e.
// Não faz parte da seed operacional.
// ============================================================

const fiscalConfigTable = sqliteTable("fiscal_config", {
    id: integer("id").primaryKey(),

    companyId: integer("company_id")
        .notNull()
        .references(() => companyTable.id),

    taxRegime: text("tax_regime")
        .notNull(),

    cfopDefault: text("cfop_default")
        .notNull(),

    ncmDefault: text("ncm_default")
        .notNull(),

    natOpDefault: text("nat_op_default")
        .notNull()
        .default("Venda de Mercadoria"),

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

    certificate: text("certificate")
        .notNull(),

    password: text("password")
        .notNull(),

    validFrom: text("valid_from"),

    validUntil: text("valid_until"),

    status: integer("status", { mode: "boolean" })
        .notNull()
        .default(false)
});

// ============================================================
// UNITS OF MEASURE
// ============================================================

const unitMeasureTable = sqliteTable("un_measure", {
    id: integer("id").primaryKey(),

    unity: text("unity")
        .unique()
        .notNull(),

    description: text("description")
});

// ============================================================
// PRODUCTS
// Campos fiscais removidos do cadastro operacional.
// ============================================================

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
        .default(1)
        .references(() => unitMeasureTable.id),

    status: integer("status", { mode: "boolean" })
        .notNull()
});

// ============================================================
// STOCK MOVEMENTS
// Histórico de movimentação com snapshots operacionais.
// ============================================================

const updateStockTable = sqliteTable("update_stock", {
    id: integer("id").primaryKey(),

    productId: integer("product_id")
        .notNull(),

    movementType: text("movement_type")
        .notNull(),

    quntRemove: integer("qunt_remove")
        .notNull()
        .default(0),

    quntAdd: integer("qunt_add")
        .notNull()
        .default(0),

    dtUpdate: text("dt_update")
        .notNull(),

    referenceId: integer("reference_id"),

    movementValue: text("movement_value"),

    unitMeasure: text("unit_measure")
        .default("UN"),

    notes: text("notes"),

    smCode: text("sm_code")
        .notNull(),

    barCode: text("bar_code")
        .notNull(),

    name: text("name")
        .notNull(),

    description: text("description"),

    value: text("value"),

    cost: text("cost"),

    amount: text("amount"),

    status: integer("status", { mode: "boolean" })
        .notNull()
});

// ============================================================
// PAYMENT METHODS
// ============================================================

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
// Dados cadastrais e forma de pagamento preferencial.
// ============================================================

const clientsTable = sqliteTable("clients", {
    id: integer("id").primaryKey(),

    name: text("name")
        .notNull(),

    cpf: text("cpf")
        .unique(),

    cnpj: text("cnpj")
        .unique(),

    address: text("address"),

    number: text("number"),

    complement: text("complement"),

    neighborhood: text("neighborhood"),

    city: text("city"),

    cityIbge: text("city_ibge"),

    state: text("state"),

    zipCode: text("zip_code"),

    methodId: integer("method_id")
        .references(() => paymentMethodTable.id)
});

// ============================================================
// CASHIER / SALES
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
// A coluna cost mantém o nome usado pelo sistema atual.
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

// ============================================================
// STOCK SERVICE
// ============================================================

const stockServiceTable = sqliteTable("stock_service", {
    id: integer("id").primaryKey(),

    serviceId: integer("service_id")
        .notNull()
        .references(() => servicesTable.id),

    productId: integer("product_id")
        .notNull()
        .references(() => productsTable.id),

    qunt: integer("qunt")
        .notNull()
});

// ============================================================
// STOCK SALE / SALE ITEMS
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
// Mantida para emissão e controle de NF-e.
// ============================================================

const fiscalInvoiceTable = sqliteTable("fiscal_invoices", {
    id: integer("id").primaryKey(),

    saleId: integer("sale_id")
        .notNull()
        .references(() => cashierTable.id),

    number: integer("number")
        .notNull(),

    natOp: text("nat_op")
        .notNull()
        .default("Venda de Mercadoria"),

    tpNf: integer("tp_nf")
        .notNull()
        .default(1),

    finNfe: integer("fin_nfe")
        .notNull()
        .default(1),

    indFinal: integer("ind_final")
        .notNull()
        .default(1),

    indPres: integer("ind_pres")
        .notNull()
        .default(1),

    indIntermed: integer("ind_intermed")
        .notNull()
        .default(0),

    idDest: integer("id_dest")
        .notNull(),

    methodId: integer("method_id")
        .notNull()
        .references(() => paymentMethodTable.id),

    installmentId: integer("installment_id")
        .references(() => installmentsTable.id),

    xml: text("xml"),

    xmlSigned: text("xml_signed"),

    xmlAuthorized: text("xml_authorized"),

    accessKey: text("access_key"),

    status: text("status")
        .notNull()
        .default("pending"),

    createdAt: text("created_at")
        .notNull(),

    authorizedAt: text("authorized_at")
});

// ============================================================
// FISCAL INVOICE ITEMS
// Dados tributários específicos da emissão fiscal.
// ============================================================

const fiscalInvoiceItemsTable = sqliteTable("fiscal_invoice_items", {
    id: integer("id").primaryKey(),

    fiscalInvoiceId: integer("fiscal_invoice_id")
        .notNull()
        .references(() => fiscalInvoiceTable.id),

    productId: integer("product_id")
        .notNull()
        .references(() => productsTable.id),

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

    quantity: integer("quantity")
        .notNull(),

    originalUnitValue: text("original_unit_value")
        .notNull(),

    unitValue: text("unit_value")
        .notNull(),

    discount: text("discount")
        .notNull()
        .default("0.00"),

    totalValue: text("total_value")
        .notNull(),

    cst: text("cst")
        .notNull()
        .default("0"),

    csosn: text("csosn")
        .notNull()
        .default("0"),

    icms: real("icms")
        .notNull()
        .default(0),

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

    vProd: text("v_prod")
        .notNull(),

    vDesc: text("v_desc")
        .notNull()
        .default("0.00"),

    vFrete: text("v_frete")
        .notNull()
        .default("0.00"),

    vSeg: text("v_seg")
        .notNull()
        .default("0.00"),

    vOutro: text("v_outro")
        .notNull()
        .default("0.00"),

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

    vNf: text("v_nf")
        .notNull()
});

// ============================================================
// SEFAZ RESPONSES
// ============================================================

const sefazResponseTable = sqliteTable("sefaz_responses", {
    id: integer("id").primaryKey(),

    fiscalInvoiceId: integer("fiscal_invoice_id")
        .notNull()
        .references(() => fiscalInvoiceTable.id),

    statusCode: text("status_code"),

    status: text("status"),

    message: text("message"),

    protocol: text("protocol"),

    receipt: text("receipt"),

    rawResponse: text("raw_response"),

    receivedAt: text("received_at")
        .notNull()
});

// ============================================================
// INTERNAL DOCUMENTS
// PDFs internos associados às vendas.
// ============================================================

const internalDocumentTable = sqliteTable("internal_documents", {
    id: integer("id").primaryKey(),

    saleId: integer("sale_id")
        .notNull()
        .references(() => cashierTable.id),

    fiscalInvoiceId: integer("fiscal_invoice_id")
        .references(() => fiscalInvoiceTable.id),

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

    paymentMethodTable,
    installmentsTable,

    clientsTable,

    cashierTable,
    servicesTable,
    stockServiceTable,
    stockSaleTable,

    fiscalInvoiceTable,
    fiscalInvoiceItemsTable,
    fiscalInvoiceTotalsTable,

    sefazResponseTable,

    internalDocumentTable,
    danfeTable
};