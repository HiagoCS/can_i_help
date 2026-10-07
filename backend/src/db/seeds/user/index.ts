const { sqlite } = require("../../index");
const bcrypt = require("bcrypt");

async function userSeed() {
    const insert = sqlite.prepare(`INSERT OR REPLACE INTO users(id, email, password, avatar) VALUES (?, ?, ?, ?)`);
    const users = [
        [
            1,
            "user1@example.com",
            await bcrypt.hash("password1", 10),
            "avatar1.jpg"
        ],
        [
            2,
            "user2@example.com",
            await bcrypt.hash("password2", 10),
            "avatar2.jpg"
        ]
    ];

    users.map((data) => {
        insert.run(...data);
    });
}

module.exports = { userSeed };