const { sqlite } = require("../../index");

async function clientsSeed() {

    const insert = sqlite.prepare(`
        INSERT OR REPLACE INTO clients(
            id,
            name,
            cpf,
            cnpj,
            ie,
            address,
            number,
            complement,
            neighborhood,
            city,
            city_ibge,
            state,
            zip_code,
            method_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const clients = [

        // Cliente pessoa física
        [
            1,
            "Cliente Teste CPF",
            "00000000000",
            null,
            null,
            "Avenida Padre Anchieta",
            "1000",
            null,
            "Centro",
            "Peruíbe",
            "3537606",
            "SP",
            "11750-000",
            1
        ],

        // Cliente pessoa jurídica sem IE
        [
            2,
            "Empresa Cliente Teste LTDA",
            null,
            "00.000.000/0001-01",
            null,
            "Rua das Flores",
            "200",
            null,
            "Centro",
            "Peruíbe",
            "3537606",
            "SP",
            "11750-100",
            2
        ],

        // Cliente pessoa jurídica com IE
        [
            3,
            "Comercio Cliente Teste LTDA",
            null,
            "00.000.000/0001-02",
            "000.000.000.000",
            "Avenida São João",
            "350",
            "Sala 1",
            "Centro",
            "Santos",
            "3548500",
            "SP",
            "11000-000",
            3
        ]

    ];

    clients.map((data) => {
        insert.run(...data);
    });
}

module.exports = { clientsSeed };