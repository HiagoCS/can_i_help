const { sqlite } = require("../../index");

async function rolesSeed() {
    const insert = sqlite.prepare(`INSERT OR REPLACE INTO roles(id, name, level) VALUES (?, ?, ?)`);
    const roles = [
            [
                1,
                "developer",
                3
            ],
            [
                2,
                "employee",
                1
            ],
            [
                3,
                "boss",
                3
            ]
        ];
    
        roles.map((data) => {
            insert.run(...data);
        });
}
module.exports = { rolesSeed };