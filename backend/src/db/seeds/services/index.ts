const { sqlite } = require("../../index");

async function servicesSeed() {

    /*
     * Produtos disponíveis para associar aos serviços.
     */
    const products = sqlite.prepare(`
        SELECT
            id,
            sm_code,
            name,
            value
        FROM products
        WHERE status = 1
        ORDER BY id ASC
    `).all() as any[];

    if (products.length < 10) {
        throw new Error(
            "É necessário ter pelo menos 10 produtos ativos para executar servicesSeed."
        );
    }

    /*
     * Serviços de exemplo.
     *
     * productIndex corresponde à posição do produto
     * na lista retornada pela consulta acima.
     *
     * cost representa somente a mão de obra.
     * O valor final será calculado posteriormente.
     */
    const services = [
        {
            id: 1,
            smCode: "SV001",
            barCode: "7900000000001",
            name: "Troca de Pastilha de Freio",
            description: "Substituição das pastilhas de freio dianteiras.",
            cost: "35.00",
            status: 1,
            products: [
                { productIndex: 0, quantity: 1 }
            ]
        },
        {
            id: 2,
            smCode: "SV002",
            barCode: "7900000000002",
            name: "Troca de Kit Relação",
            description: "Substituição do conjunto de corrente, coroa e pinhão.",
            cost: "65.00",
            status: 1,
            products: [
                { productIndex: 1, quantity: 5 }
            ]
        },
        {
            id: 3,
            smCode: "SV003",
            barCode: "7900000000003",
            name: "Troca de Vela de Ignição",
            description: "Remoção e instalação de vela de ignição.",
            cost: "20.00",
            status: 1,
            products: [
                { productIndex: 2, quantity: 3 }
            ]
        },
        {
            id: 4,
            smCode: "SV004",
            barCode: "7900000000004",
            name: "Troca de Óleo e Filtro",
            description: "Substituição do óleo e do filtro de óleo da motocicleta.",
            cost: "30.00",
            status: 1,
            products: [
                { productIndex: 3, quantity: 1 }
            ]
        },
        {
            id: 5,
            smCode: "SV005",
            barCode: "7900000000005",
            name: "Revisão do Sistema de Freio",
            description: "Inspeção e manutenção básica do sistema de freio.",
            cost: "80.00",
            status: 1,
            products: [
                { productIndex: 0, quantity: 1 },
                { productIndex: 5, quantity: 2 }
            ]
        },
        {
            id: 6,
            smCode: "SV006",
            barCode: "7900000000006",
            name: "Revisão de Admissão de Ar",
            description: "Inspeção e substituição dos componentes de admissão de ar.",
            cost: "45.00",
            status: 1,
            products: [
                { productIndex: 4, quantity: 9 }
            ]
        },
        {
            id: 7,
            smCode: "SV007",
            barCode: "7900000000007",
            name: "Troca de Cabo de Embreagem",
            description: "Substituição e ajuste do cabo de embreagem.",
            cost: "40.00",
            status: 1,
            products: [
                { productIndex: 6, quantity: 1 }
            ]
        },
        {
            id: 8,
            smCode: "SV008",
            barCode: "7900000000008",
            name: "Diagnóstico Mecânico",
            description: "Avaliação técnica para identificação de falhas mecânicas.",
            cost: "90.00",
            status: 1,
            products: []
        },
        {
            id: 9,
            smCode: "SV009",
            barCode: "7900000000009",
            name: "Regulagem de Corrente",
            description: "Ajuste da tensão e alinhamento da corrente da motocicleta.",
            cost: "25.00",
            status: 1,
            products: []
        },
        {
            id: 10,
            smCode: "SV010",
            barCode: "7900000000010",
            name: "Mão de Obra Geral",
            description: "Serviço de mão de obra para pequenos reparos.",
            cost: "60.00",
            status: 1,
            products: []
        }
    ];

    /*
     * Preparação dos comandos SQL.
     */
    const deleteStockService = sqlite.prepare(`
        DELETE FROM stock_service
        WHERE service_id BETWEEN 1 AND 10
    `);

    const deleteServices = sqlite.prepare(`
        DELETE FROM services
        WHERE id BETWEEN 1 AND 10
    `);

    const insertService = sqlite.prepare(`
        INSERT OR REPLACE INTO services (
            id,
            sm_code,
            bar_code,
            name,
            description,
            cost,
            status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertStockService = sqlite.prepare(`
        INSERT INTO stock_service (
            service_id,
            product_id,
            qunt
        )
        VALUES (?, ?, ?)
    `);

    /*
     * Remove as associações antigas antes de recriar
     * os serviços de teste.
     */
    deleteStockService.run();
    deleteServices.run();

    /*
     * Insere os serviços e seus produtos associados.
     */
    for (const service of services) {

        insertService.run(
            service.id,
            service.smCode,
            service.barCode,
            service.name,
            service.description,
            service.cost,
            service.status
        );

        for (const item of service.products) {

            const product = products[item.productIndex];

            if (!product) {
                throw new Error(
                    `Produto no índice ${item.productIndex} não encontrado para o serviço "${service.name}".`
                );
            }

            const quantity = Number(item.quantity);

            if (
                !Number.isInteger(quantity) ||
                quantity <= 0
            ) {
                throw new Error(
                    `Quantidade inválida no serviço "${service.name}".`
                );
            }

            insertStockService.run(
                service.id,
                product.id,
                quantity
            );
        }
    }

    console.log(
        "Services seed executada com sucesso."
    );
}

module.exports = {
    servicesSeed
};
