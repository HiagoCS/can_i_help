const { userSeed } = require("./user");
const { rolesSeed } = require("./roles");
const { rolesUserSeed } = require("./roles_user");
const { productsSeed } = require("./products");

async function index() {

    await userSeed();
    await rolesSeed();
    await rolesUserSeed();

    await productsSeed();

    console.log("Seed executado com sucesso");

}

index();