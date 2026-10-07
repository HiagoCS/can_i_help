const { sqlite } = require("../../index");
const bcrypt = require("bcrypt");

async function userSeed() {
    const insert = sqlite.prepare(`INSERT OR REPLACE INTO users(id, email, password, avatar, status) VALUES (?, ?, ?, ?, ?)`);
    const users = [
        [
            1,
            "funcionario@example.com",
            await bcrypt.hash("password1", 10),
            "avatar1.jpg",
            1
        ],
        [
            2,
            "chefe@example.com",
            await bcrypt.hash("password2", 10),
            "avatar2.jpg",
            1
        ],
        [
            3,
            "desenvolvedor@example.com",
            await bcrypt.hash("password3", 10),
            "avatar3.jpg",
            1
        ]
    ];

    users.map((data) => {
        insert.run(...data);
    });
}

module.exports = { userSeed };