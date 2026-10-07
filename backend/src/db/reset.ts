const fs = require("node:fs");
const path = require("node:path");

const database = path.join(process.cwd(), "database.sqlite");
const migrations = path.join(process.cwd(), "drizzle");

if (fs.existsSync(database)) {
    fs.rmSync(database, { force: true });
    console.log("✓ Banco de dados removido");
}

if (fs.existsSync(migrations)) {
    fs.rmSync(migrations, {
        recursive: true,
        force: true
    });

    console.log("✓ Migrations removidas");
}

console.log("✓ Banco limpo");