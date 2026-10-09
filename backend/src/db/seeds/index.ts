const { userSeed } = require("./user");
const { rolesSeed } = require("./roles");
const { rolesUserSeed } = require("./roles_user");
const { unifiedDemoSeed } = require("./motopecas_seed");


async function index() {
    //Padrão Testes
    await userSeed();
    await rolesSeed();
    await rolesUserSeed();
    await unifiedDemoSeed();

    console.log("Seed executado com sucesso");

}

index();