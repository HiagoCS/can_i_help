const {userSeed} = require("./user")
function index(){
    userSeed();
    console.log("Seed executado com sucesso");
}
index();