const { sqlite } = require("../../index");

async function installmentsSeed() {
    const insert = sqlite.prepare(`INSERT OR REPLACE INTO installments(id, in_installments, percentage) VALUES (?, ?, ?)`);
    const installments = [
            [
                1,
                1,
                0
            ],
            [
                2,
                5,
                10
            ],
            [
                3,
                10,
                20
            ],
            [
                4,
                12,
                30
            ]
        ];
    
        installments.map((data) => {
            insert.run(...data);
        });
}
module.exports = { installmentsSeed };