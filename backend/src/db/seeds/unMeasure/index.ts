const { sqlite } = require("../../index");

async function unMeasureSeed() {
    const insert = sqlite.prepare(`INSERT OR REPLACE INTO un_measure(id, unity, description) VALUES (?, ?, ?)`);
    const method = [
            [
                1,
                "UN",
                "Unidade"
            ]
        ];
    
        method.map((data) => {
            insert.run(...data);
        });
}
module.exports = { unMeasureSeed };