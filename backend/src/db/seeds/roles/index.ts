const { sqlite } = require("../../index");

async function rolesSeed() {
    const insert = sqlite.prepare(`INSERT OR REPLACE INTO roles(id, name, level, status) VALUES (?, ?, ?, ?)`);
    const roles = [
            [
                1,
                "developer",
                3,
                1
            ],
            [
                2,
                "employee",
                1,
                1
            ],
            [
                3,
                "boss",
                3,
                1
            ]
        ];
    
        roles.map((data) => {
            insert.run(...data);
        });
}
module.exports = { rolesSeed };