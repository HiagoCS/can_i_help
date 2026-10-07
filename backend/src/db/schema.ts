const {integer, text, sqliteTable} = require("drizzle-orm/sqlite-core");
//USER TABLE
const userTable = sqliteTable("users", {
    id: integer("id").primaryKey(),
    email: text("email").unique().notNull(),
    password: text("password").notNull(),
    avatar: text("avatar")
});
//ROLES TABLE
const rolesTable = sqliteTable("roles", {
    id: integer("id").primaryKey(),
    name: text("name").unique().notNull(),
    level: integer("level").notNull()
});
//ROLES TO USER TABLE
const rolesUserTable = sqliteTable("roles_user", {
    id: integer("id").primaryKey(),
    roleId: integer("role_id").notNull().references(() => rolesTable.id),
    userId: integer("user_id").notNull().references(() => userTable.id)
});
module.exports = { userTable, rolesTable, rolesUserTable }