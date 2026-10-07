const { sqlite } = require("../../index");

async function rolesUserSeed() {
    const insert = sqlite.prepare(`INSERT OR REPLACE INTO roles_user(id, role_id, user_id) VALUES (?, ?, ?)`);
    const rolesUser = [
        //EMPLOYEE
        [
            1,
            2,
            1
        ],
         //BOSS
        [
            2,
            3,
            2
        ],
        //DEVELOPER
        [
            3,
            1,
            3
        ]
    ];

    rolesUser.map((data) => {
        insert.run(...data);
    });
}

module.exports = { rolesUserSeed };