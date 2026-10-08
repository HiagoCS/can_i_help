const { sqlite } = require("../../index");

async function productsSeed() {

    const insert = sqlite.prepare(`
        INSERT OR REPLACE INTO products(
            id,
            sm_code,
            bar_code,
            name,
            description,
            value,
            cost,
            amount,
            ncm,
            cst,
            csosn,
            icms,
            status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const products = [

        [
            1,
            "SM001",
            "7891234567001",
            "Pastilha de Freio Dianteira",
            "Pastilha de freio dianteira para motocicletas Honda CG 160.",
            "45.90",
            "28.00",
            "25",
            "87141000",
            "0",
            "0",
            0,
            1
        ],

        [
            2,
            "SM002",
            "7891234567002",
            "Kit Relação CG 160",
            "Kit relação completo com corrente, coroa e pinhão para Honda CG 160.",
            "139.90",
            "92.00",
            "12",
            "87141000",
            "0",
            "0",
            0,
            1
        ],

        [
            3,
            "SM003",
            "7891234567003",
            "Vela de Ignição NGK",
            "Vela de ignição para motores de motocicletas de baixa cilindrada.",
            "24.90",
            "15.50",
            "40",
            "85111000",
            "0",
            "0",
            0,
            1
        ],

        [
            4,
            "SM004",
            "7891234567004",
            "Filtro de Óleo",
            "Filtro de óleo para motocicletas Honda.",
            "32.90",
            "19.00",
            "30",
            "84212300",
            "0",
            "0",
            0,
            1
        ],

        [
            5,
            "SM005",
            "7891234567005",
            "Filtro de Ar CG 160",
            "Filtro de ar para Honda CG 160 Titan, Fan e Start.",
            "38.90",
            "23.00",
            "18",
            "84213100",
            "0",
            "0",
            0,
            1
        ],

        [
            6,
            "SM006",
            "7891234567006",
            "Manete de Freio Dianteiro",
            "Manete de freio dianteiro em alumínio para motocicletas Honda.",
            "29.90",
            "17.00",
            "22",
            "87141000",
            "0",
            "0",
            0,
            1
        ],

        [
            7,
            "SM007",
            "7891234567007",
            "Cabo de Embreagem",
            "Cabo de embreagem para Honda CG 160.",
            "21.90",
            "12.50",
            "15",
            "87141000",
            "0",
            "0",
            0,
            1
        ],

        [
            8,
            "SM008",
            "7891234567008",
            "Lâmpada Farol LED",
            "Lâmpada LED para farol de motocicleta, alta luminosidade.",
            "59.90",
            "36.00",
            "10",
            "85395200",
            "0",
            "0",
            0,
            1
        ],

        [
            9,
            "SM009",
            "7891234567009",
            "Retrovisor Esportivo",
            "Par de retrovisores esportivos universais para motocicletas.",
            "79.90",
            "48.00",
            "8",
            "70091000",
            "0",
            "0",
            0,
            1
        ],

        [
            10,
            "SM010",
            "7891234567010",
            "Câmara de Ar Aro 18",
            "Câmara de ar para pneus de motocicletas com aro 18.",
            "34.90",
            "21.00",
            "20",
            "40139000",
            "0",
            "0",
            0,
            1
        ]

    ];

    products.map((data) => {
        insert.run(...data);
    });
}

module.exports = { productsSeed };