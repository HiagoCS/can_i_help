const { sqlite } = require("../../index");

async function fiscalConfigSeed() {

    const insert = sqlite.prepare(`
        INSERT OR REPLACE INTO fiscal_config(
            id,
            company_id,
            tax_regime,
            cfop_default,
            ncm_default,
            ibs,
            cbs
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const fiscalConfig = [
        [
            1,
            1,
            "SIMPLES_NACIONAL",
            "5102",
            "87141000",
            0,
            0
        ]
    ];

    fiscalConfig.map((data) => {
        insert.run(...data);
    });
}

module.exports = { fiscalConfigSeed };