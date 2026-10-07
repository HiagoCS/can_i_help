const { defineConfig } = require("drizzle-kit");

module.exports = defineConfig({
    schema: "./src/db/schema.ts",
    out: "./src/db/migrations",
    dialect: "sqlite",
    dbCredentials: {
        url: "./database.sqlite"
    }
});