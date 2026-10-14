const { userSeed } = require("./user");
const { rolesSeed } = require("./roles");
const { rolesUserSeed } = require("./roles_user");
const { paymentMethodSeed } = require("./paymentMethod");
const { unMeasureSeed } = require("./unMeasure");

async function index() {
    //Padrão Testes
    await userSeed();
    await rolesSeed();
    await rolesUserSeed();
    await paymentMethodSeed();
    await unMeasureSeed();
}

index();