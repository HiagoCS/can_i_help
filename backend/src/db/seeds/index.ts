const { userSeed } = require("./user");
const { rolesSeed } = require("./roles");
const { rolesUserSeed } = require("./roles_user");
const { productsSeed } = require("./products");
const { paymentMethodSeed } = require("./paymentMethod");
const { installmentsSeed } = require("./installments");

async function index() {

    await userSeed();
    await rolesSeed();
    await rolesUserSeed();

    await productsSeed();
    await paymentMethodSeed();
    await installmentsSeed();

    console.log("Seed executado com sucesso");

}

index();