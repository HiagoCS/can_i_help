const { sqlite } = require("../../index");

async function paymentMethodSeed() {
    const insert = sqlite.prepare(`INSERT OR REPLACE INTO payment_method(id, name, status) VALUES (?, ?, ?)`);
    const method = [
            [
                1,
                "Dinheiro",
                1
            ],
            [
                2,
                "PIX",
                1
            ],
            [
                3,
                "Cartão de Crédito",
                1
            ],
            [
                4,
                "Cartão de Débito",
                1
            ]
        ];
    
        method.map((data) => {
            insert.run(...data);
        });
}
module.exports = { paymentMethodSeed };