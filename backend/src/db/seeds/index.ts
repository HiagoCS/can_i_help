const { userSeed } = require("./user");
const { rolesSeed } = require("./roles");
const { rolesUserSeed } = require("./roles_user");

async function index() {

    await userSeed();

    await rolesSeed();

    await rolesUserSeed();

    console.log("Seed executado com sucesso");

}

index();