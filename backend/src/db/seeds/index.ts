const { userSeed } = require("./user");
const { rolesSeed } = require("./roles");
const { rolesUserSeed } = require("./roles_user");

const { companySeed } = require("./company");
const { fiscalConfigSeed } = require("./fiscalConfig");

const { productsSeed } = require("./products");
const { paymentMethodSeed } = require("./paymentMethod");
const { installmentsSeed } = require("./installments");
const { clientsSeed } = require("./clients");

const { cashierSeed } = require("./cashier");


async function index() {

    // Usuários e permissões
    await userSeed();
    await rolesSeed();
    await rolesUserSeed();

    // Configuração da empresa
    await companySeed();
    await fiscalConfigSeed();

    // Cadastros utilizados pelas vendas
    await productsSeed();
    await paymentMethodSeed();
    await installmentsSeed();
    await clientsSeed();

    // Vendas e produtos vendidos
    await cashierSeed();

    console.log("Seed executado com sucesso");

}

index();