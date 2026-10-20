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
// Nome físico da tabela: roles_user
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
// BUDGET
// ============================================================

const budgetTable = sqliteTable("budget", {
    id: integer("id").primaryKey(),

    totalValue: real("total_value")
        .notNull(),

    clientId: integer("client_id")
        .references(() => clientsTable.id),

    dtBudget: text("dt_budget")
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
// STOCK SALE / SALE ITEMS
// ============================================================

const stockBudgetTable = sqliteTable("stock_budget", {
    id: integer("id").primaryKey(),

    value: text("value"),

    budgetId: integer("budget_id")
        .notNull()
        .references(() => budgetTable.id),

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
// EXPORT
// ============================================================

module.exports = {
    userTable,
    rolesTable,
    rolesUserTable,

    companyTable,

    unitMeasureTable,
    productsTable,
    updateStockTable,

    paymentMethodTable,
    installmentsTable,

    clientsTable,

    cashierTable,
    budgetTable,
    servicesTable,
    stockServiceTable,
    stockSaleTable,
    stockBudgetTable
};