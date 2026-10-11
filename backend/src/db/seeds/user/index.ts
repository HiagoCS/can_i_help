const { sqlite } = require("../../index");
const bcrypt = require("bcrypt");

async function userSeed() {
    const insert = sqlite.prepare(`INSERT OR REPLACE INTO users(id, email, password, avatar, status) VALUES (?, ?, ?, ?, ?)`);
    const users = [
        [
            1,
            "hiago8cs@gmail.com",
            await bcrypt.hash("hiago@3307", 10),
            "https://avatars.githubusercontent.com/u/10318792?v=4",
            1
        ]
    ];

    users.map((data) => {
        insert.run(...data);
    });
}

module.exports = { userSeed };