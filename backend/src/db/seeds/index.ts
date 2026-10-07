const { userSeed } = require("./user");
const { rolesSeed } = require("./roles");
const { rolesUserSeed } = require("./roles_user");
const { productsSeed } = require("./products");
const { paymentMethodSeed } = require("./paymentMethod");

async function index() {

    await userSeed();
    await rolesSeed();
    await rolesUserSeed();

    await productsSeed();
    await paymentMethodSeed();

    console.log("Seed executado com sucesso");

}

index();