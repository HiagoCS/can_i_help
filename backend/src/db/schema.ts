const {integer, text, sqliteTable} = require("drizzle-orm/sqlite-core");
//USER TABLE
const userTable = sqliteTable("users", {
    id: integer("id").primaryKey(),
    email: text("email").unique().notNull(),
    password: text("password").notNull(),
    avatar: text("avatar")
});
module.exports = { userTable }