const { sqlite } = require("../../index");

async function companySeed() {

    const insert = sqlite.prepare(`
        INSERT OR REPLACE INTO company(
            id,
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
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const company = [
        [
            1,
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