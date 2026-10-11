const { sqlite } = require("../../index");

async function rolesUserSeed() {
    const insert = sqlite.prepare(`INSERT OR REPLACE INTO roles_user(id, role_id, user_id) VALUES (?, ?, ?)`);
    const rolesUser = [
        //DEVELOPER
        [
            1,
            1,
            1
        ]
    ];

    rolesUser.map((data) => {
        insert.run(...data);
    });
}

module.exports = { rolesUserSeed };