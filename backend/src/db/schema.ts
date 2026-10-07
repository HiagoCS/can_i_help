const {integer, real, text, sqliteTable} = require("drizzle-orm/sqlite-core");
//USER TABLE
const userTable = sqliteTable("users", {
    id: integer("id").primaryKey(),
    email: text("email").unique().notNull(),
    password: text("password").notNull(),
    avatar: text("avatar"),
    status: integer("status",{mode:"boolean"}).notNull()
});
//ROLES TABLE
const rolesTable = sqliteTable("roles", {
    id: integer("id").primaryKey(),
    name: text("name").unique().notNull(),
    level: integer("level").notNull(),
    status: integer("status",{mode:"boolean"}).notNull()
});
//ROLES TO USER TABLE
const rolesUserTable = sqliteTable("roles_user", {
    id: integer("id").primaryKey(),
    roleId: integer("role_id").notNull().references(() => rolesTable.id),
    userId: integer("user_id").notNull().references(() => userTable.id)
});
//PRODUCTS TABLE
const productsTable = sqliteTable("products", {
    id: integer("id").primaryKey(),
    smCode: text("sm_code").unique().notNull(),
    barCode: text("bar_code").unique().notNull(),
    name: text("name").notNull(),
    description: text("description"),
    value: text("value").default("0.00"),
    cost: text("cost").default("0.00"),
    amount: text("amount").default("0"),
    status: integer("status",{mode:"boolean"}).notNull()
});
//PAYMENT METHODS TABLE
const paymentMethodTable = sqliteTable("payment_method", {
    id: integer("id").primaryKey(),
    name: text("name").unique().notNull(),
    status: integer("status",{mode:"boolean"}).notNull()
});
//INSTALLMENTS
const installmentsTable = sqliteTable("installments", {
    id: integer("id").primaryKey(),
    inInstallments: integer("in_installments").notNull(),
    percentage: real("percentage").notNull()
});
//CLIENTS
const clientsTable = sqliteTable("clients", {
    id: integer("id").primaryKey(),
    name: text("name").notNull(),
    cpf: text("cpf").unique(),
    methodId: integer("method_id").notNull().references(() => paymentMethodTable.id)
});
module.exports = { userTable, rolesTable, rolesUserTable, productsTable, paymentMethodTable, installmentsTable, clientsTable }