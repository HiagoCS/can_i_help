const { userSeed } = require("./user");
const { rolesSeed } = require("./roles");
const { rolesUserSeed } = require("./roles_user");
const { paymentMethodSeed } = require("./paymentMethod");

async function index() {
    //Padrão Testes
    await userSeed();
    await rolesSeed();
    await rolesUserSeed();
    await paymentMethodSeed();
}

index();