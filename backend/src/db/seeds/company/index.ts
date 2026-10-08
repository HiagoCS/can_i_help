const { sqlite } = require("../../index");

async function companySeed() {
    const bossUser = sqlite.prepare("SELECT u.id FROM users u INNER JOIN roles_user ru ON ru.user_id = u.id INNER JOIN roles r ON r.id = ru.role_id WHERE r.name = 'boss' AND r.level >= 3 AND u.status = 1 ORDER BY u.id LIMIT 1").get();
    if (!bossUser) throw new Error("Crie um usuário administrativo com role boss antes da empresa.");

    const insert = sqlite.prepare(`
        INSERT OR REPLACE INTO company(
            id,
            boss_user_id,
            cnpj,
            legal_name,
            trade_name,
            state_registration,
            municipal_registration,
            tax_regime,
            address,
            number,
            complement,
            neighborhood,
            city,
            city_ibge,
            state,
            zip_code
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const company = [
        [
            1,
            bossUser.id,
            "00.000.000/0001-00",
            "EMPRESA TESTE MOTOPECAS LTDA",
            "GlauGrau Motopeças",
            "000000000000",
            null,
            "SIMPLES_NACIONAL",
            "Avenida Padre Anchieta",
            "1000",
            null,
            "Centro",
            "Peruíbe",
            "3537606",
            "SP",
            "11750-000"
        ]
    ];

    company.map((data) => {
        insert.run(...data);
    });
}

module.exports = { companySeed };