const { sqlite } = require("../../index");

async function cashierSeed() {
    /*
     * Produtos disponíveis para as vendas.
     */
    const products = sqlite.prepare(`
        SELECT
            id,
            name,
            value
        FROM products
        WHERE status = 1
        ORDER BY id ASC
    `).all();

    if (products.length < 3) {
        throw new Error(
            "É necessário ter pelo menos 3 produtos ativos para executar cashierSeed."
        );
    }

    /*
     * Métodos de pagamento.
     */
    const paymentMethods = sqlite.prepare(`
        SELECT
            id,
            name
        FROM payment_method
        WHERE status = 1
    `).all();

    const getMethodId = (name: string): number => {
        const method = paymentMethods.find(
            (item: any) => item.name === name
        );

        if (!method) {
            throw new Error(
                `Método de pagamento "${name}" não encontrado.`
            );
        }

        return method.id;
    };

    const dinheiro = getMethodId("Dinheiro");
    const pix = getMethodId("PIX");
    const credito = getMethodId("Cartão de Crédito");
    const debito = getMethodId("Cartão de Débito");

    /*
     * Parcelamentos disponíveis.
     */
    const installments = sqlite.prepare(`
        SELECT
            id,
            in_installments,
            percentage
        FROM installments
        ORDER BY in_installments ASC
    `).all();

    const installment5x = installments.find(
        (item: any) => item.in_installments === 5
    );

    const installment10x = installments.find(
        (item: any) => item.in_installments === 10
    );

    if (!installment5x) {
        throw new Error(
            "Parcelamento de 5x não encontrado."
        );
    }

    if (!installment10x) {
        throw new Error(
            "Parcelamento de 10x não encontrado."
        );
    }

    /*
     * Clientes existentes.
     *
     * Cliente é opcional na venda, então a seed funciona
     * mesmo que ainda não existam clientes.
     */
    const clients = sqlite.prepare(`
        SELECT id
        FROM clients
        ORDER BY id ASC
    `).all();

    /*
     * Como essa é uma seed de teste, removemos as vendas
     * de IDs 1 a 10 antes de recriá-las.
     *
     * Primeiro removemos os itens relacionados.
     */
    sqlite.prepare(`
        DELETE FROM stock_sale
        WHERE sale_id BETWEEN 1 AND 10
    `).run();

    /*
     * Depois removemos as vendas.
     */
    sqlite.prepare(`
        DELETE FROM cashier
        WHERE id BETWEEN 1 AND 10
    `).run();

    /*
     * INSERT DA VENDA
     */
    const insertCashier = sqlite.prepare(`
        INSERT INTO cashier (
            id,
            total_value,
            method_id,
            client_id,
            installment_id,
            dt_sale
        )
        VALUES (?, ?, ?, ?, ?, ?)
    `);

    /*
     * INSERT DOS PRODUTOS DA VENDA
     */
    const insertStockSale = sqlite.prepare(`
        INSERT INTO stock_sale (
            id,
            sale_id,
            product_id,
            qunt_sale
        )
        VALUES (?, ?, ?, ?)
    `);

    /*
     * Dados das 10 vendas.
     *
     * productIndex:
     *   0 = primeiro produto encontrado
     *   1 = segundo produto
     *   2 = terceiro produto
     *
     * As vendas 3, 6 e 10 são no crédito.
     */
    const sales = [
        {
            id: 1,
            methodId: dinheiro,
            installmentId: null,
            items: [
                {
                    productIndex: 0,
                    quantity: 2
                },
                {
                    productIndex: 1,
                    quantity: 1
                }
            ]
        },

        {
            id: 2,
            methodId: pix,
            installmentId: null,
            items: [
                {
                    productIndex: 1,
                    quantity: 2
                },
                {
                    productIndex: 2,
                    quantity: 1
                }
            ]
        },

        {
            id: 3,
            methodId: credito,
            installmentId: installment5x.id,
            items: [
                {
                    productIndex: 0,
                    quantity: 1
                },
                {
                    productIndex: 2,
                    quantity: 2
                }
            ]
        },

        {
            id: 4,
            methodId: debito,
            installmentId: null,
            items: [
                {
                    productIndex: 2,
                    quantity: 3
                },
                {
                    productIndex: 1,
                    quantity: 1
                }
            ]
        },

        {
            id: 5,
            methodId: dinheiro,
            installmentId: null,
            items: [
                {
                    productIndex: 0,
                    quantity: 1
                },
                {
                    productIndex: 1,
                    quantity: 3
                }
            ]
        },

        {
            id: 6,
            methodId: credito,
            installmentId: installment10x.id,
            items: [
                {
                    productIndex: 1,
                    quantity: 2
                },
                {
                    productIndex: 2,
                    quantity: 2
                }
            ]
        },

        {
            id: 7,
            methodId: pix,
            installmentId: null,
            items: [
                {
                    productIndex: 0,
                    quantity: 2
                },
                {
                    productIndex: 2,
                    quantity: 1
                }
            ]
        },

        {
            id: 8,
            methodId: debito,
            installmentId: null,
            items: [
                {
                    productIndex: 1,
                    quantity: 1
                },
                {
                    productIndex: 2,
                    quantity: 3
                }
            ]
        },

        {
            id: 9,
            methodId: dinheiro,
            installmentId: null,
            items: [
                {
                    productIndex: 0,
                    quantity: 3
                },
                {
                    productIndex: 1,
                    quantity: 2
                }
            ]
        },

        {
            id: 10,
            methodId: credito,
            installmentId: installment5x.id,
            items: [
                {
                    productIndex: 0,
                    quantity: 2
                },
                {
                    productIndex: 1,
                    quantity: 1
                },
                {
                    productIndex: 2,
                    quantity: 1
                }
            ]
        }
    ];

    /*
     * ID dos registros da tabela stock_sale.
     */
    let stockSaleId = 1;

    /*
     * Cria cada venda.
     */
    for (const sale of sales) {
        let subtotal = 0;

        /*
         * Calcula o subtotal através dos produtos.
         */
        for (const item of sale.items) {
            const product = products[item.productIndex];

            if (!product) {
                throw new Error(
                    `Produto no índice ${item.productIndex} não encontrado.`
                );
            }

            const productValue = Number(product.value);

            if (
                !Number.isFinite(productValue) ||
                productValue < 0
            ) {
                throw new Error(
                    `Valor inválido para o produto "${product.name}".`
                );
            }

            subtotal += productValue * item.quantity;
        }

        /*
         * Percentual adicional do parcelamento.
         *
         * Exemplo:
         *
         * subtotal = 100
         * percentage = 0.10
         *
         * acréscimo = 10
         * total = 110
         */
        let percentage = 0;

        if (sale.installmentId !== null) {
            const installment = installments.find(
                (item: any) =>
                    item.id === sale.installmentId
            );

            if (!installment) {
                throw new Error(
                    `Parcelamento ID ${sale.installmentId} não encontrado.`
                );
            }

            percentage = Number(installment.percentage);

            if (
                !Number.isFinite(percentage) ||
                percentage < 0
            ) {
                throw new Error(
                    `Percentual inválido para o parcelamento ID ${sale.installmentId}.`
                );
            }
        }

        /*
         * Valor final da venda.
         *
         * subtotal + percentual do parcelamento
         */
        const totalValue =
            subtotal + (subtotal * percentage);

        /*
         * Cliente opcional.
         *
         * Caso existam clientes cadastrados,
         * distribuímos entre as 10 vendas.
         */
        let clientId: number | null = null;

        if (clients.length > 0) {
            clientId =
                clients[(sale.id - 1) % clients.length].id;
        }

        /*
         * Cria uma data diferente para cada venda.
         * As vendas ficam distribuídas pelos últimos 10 dias.
         */
        const saleDate = new Date();

        saleDate.setDate(
            saleDate.getDate() - (10 - sale.id)
        );

        const dtSale = saleDate.toISOString();

        /*
         * Insere a venda no cashier.
         */
        insertCashier.run(
            sale.id,
            Number(totalValue.toFixed(2)),
            sale.methodId,
            clientId,
            sale.installmentId,
            dtSale
        );

        /*
         * Insere os produtos relacionados
         * à venda em stock_sale.
         */
        for (const item of sale.items) {
            const product = products[item.productIndex];

            insertStockSale.run(
                stockSaleId++,
                sale.id,
                product.id,
                item.quantity
            );
        }
    }

    console.log(
        "Cashier seed executada com sucesso."
    );
}

module.exports = {
    cashierSeed
};