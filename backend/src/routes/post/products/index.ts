import type { FastifyInstance } from "fastify";

const { sqlite } = require("../../../db/index");
const { recordProductMovement } = require("../../../db/product_stock");


/**
 * Gera um EAN-13 válido.
 *
 * O código gerado possui 13 dígitos e
 * contém um dígito verificador válido.
 *
 * Observação:
 * isso gera um código com formato EAN-13,
 * mas não um GTIN oficialmente registrado pela GS1.
 */
function generateBarCode(): string {

    let barCode: string;

    do {

        // Prefixo 789 utilizado no padrão brasileiro
        const prefix = "789";

        // Gera 9 dígitos aleatórios
        let random = "";

        for (let i = 0; i < 9; i++) {
            random += Math.floor(Math.random() * 10);
        }

        const base = prefix + random;

        // Calcula o dígito verificador
        let sum = 0;

        for (let i = 0; i < 12; i++) {

            const digit = Number(base[i]);

            if (i % 2 === 0) {
                sum += digit;
            } else {
                sum += digit * 3;
            }
        }

        const checkDigit = (10 - (sum % 10)) % 10;

        barCode = base + checkDigit;

        // Garante que não exista no banco
        const existing = sqlite
            .prepare(`
                SELECT id
                FROM products
                WHERE bar_code = ?
            `)
            .get(barCode);

        if (!existing) {
            return barCode;
        }

    } while (true);
}


/**
 * Gera o SM Code utilizando as iniciais
 * das palavras do nome do produto.
 */
function generateSmCode(name: string): string {

    const words = name
        .trim()
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .split(/\s+/);

    // Palavras que não participam das iniciais
    const ignoredWords = new Set([
        "DE",
        "DA",
        "DO",
        "DAS",
        "DOS",
        "E"
    ]);

    const initials = words
        .filter((word) => {
            return (
                word.length > 0 &&
                !ignoredWords.has(word) &&
                !/^\d+$/.test(word)
            );
        })
        .map((word) => word[0])
        .join("");

    // Procura números presentes no nome
    const numbers = words
        .filter((word) => /^\d+$/.test(word))
        .join("");

    const prefix = initials || "PRD";

    // Se o nome possui número, utiliza o número
    // diretamente no SM Code.
    if (numbers) {

        const smCode = `${prefix}${numbers}`;

        const existing = sqlite
            .prepare(`
                SELECT id
                FROM products
                WHERE sm_code = ?
            `)
            .get(smCode);

        if (!existing) {
            return smCode;
        }
    }

    // Sem número no nome:
    // MF001, MF002, MF003...
    let counter = 1;

    while (true) {

        const suffix = String(counter).padStart(3, "0");

        const smCode = `${prefix}${suffix}`;

        const existing = sqlite
            .prepare(`
                SELECT id
                FROM products
                WHERE sm_code = ?
            `)
            .get(smCode);

        if (!existing) {
            return smCode;
        }

        counter++;
    }
}


async function products(fastify: FastifyInstance) {

    fastify.post("/product/new",
        {
            onRequest: [
                fastify.authenticate,
                fastify.authorize(3)
            ]
        },
        async (request, reply) => {

            const {
                sm_code,
                bar_code,
                name,
                description,
                value,
                cost,
                amount,
                unit_measure,
                ncm,
                cst,
                csosn,
                icms,
                status
            } = request.body as {
                sm_code?: string | null;
                bar_code?: string | null;
                name: string;
                description?: string | null;
                value?: number | string | null;
                cost?: number | string | null;
                amount?: number | string | null;
                unit_measure?: string | null;
                ncm?: string | null;
                cst?: string | number | null;
                csosn?: string | number | null;
                icms?: number | string | null;
                status?: number | null;
            };


            const finalUnitMeasure=String(unit_measure??"UN").trim().toUpperCase();
            if(!finalUnitMeasure||finalUnitMeasure.length>10)return reply.code(400).send({message:"Informe uma unidade de medida válida (até 10 caracteres)."});
            // REQUIRED FIELD
            if (!name || !name.trim()) {

                return reply.code(400).send({
                    message: "Name is required"
                });
            }



            const fiscalConfig = sqlite.prepare("SELECT tax_regime, ncm_default FROM fiscal_config ORDER BY id LIMIT 1").get() as { tax_regime?: string; ncm_default?: string } | undefined;
            const companyConfig = sqlite.prepare("SELECT tax_regime FROM company ORDER BY id LIMIT 1").get() as { tax_regime?: string } | undefined;
            const isNormalRegime = (fiscalConfig?.tax_regime ?? companyConfig?.tax_regime) === "REGIME_NORMAL";
            const finalNcm = (typeof ncm === "string" ? ncm.trim() : "") || fiscalConfig?.ncm_default || null;
            let finalCst = "0";
            let finalCsosn = "0";
            let finalIcms = 0;

            if (isNormalRegime) {
                finalCst = String(cst ?? "").trim();
                finalCsosn = String(csosn ?? "").trim();
                finalIcms = Number(icms);
                if (!finalCst || !finalCsosn || icms === undefined || icms === null || !Number.isFinite(finalIcms) || finalIcms < 0) {
                    return reply.code(400).send({ message: "No Regime Normal, CST, CSOSN e ICMS são obrigatórios." });
                }
            }
            /*
             * VALIDATE VALUE
             *
             * Aceita:
             * 45
             * 45.90
             * "45"
             * "45.90"
             *
             * Rejeita:
             * "string"
             */
            let finalValue = "0.00";

            if (value !== undefined && value !== null) {

                const numericValue = Number(value);

                if (
                    Number.isNaN(numericValue) ||
                    !Number.isFinite(numericValue)
                ) {

                    return reply.code(400).send({
                        message: "Value must be a valid number"
                    });
                }

                finalValue = String(
                    Number.parseFloat(String(numericValue))
                );
            }


            /*
             * VALIDATE COST
             *
             * Aceita:
             * 45
             * 45.90
             * "45"
             * "45.90"
             *
             * Rejeita:
             * "string"
             */
            let finalCost = "0.00";

            if (cost !== undefined && cost !== null) {

                const numericCost = Number(cost);

                if (
                    Number.isNaN(numericCost) ||
                    !Number.isFinite(numericCost)
                ) {

                    return reply.code(400).send({
                        message: "Cost must be a valid number"
                    });
                }

                finalCost = String(
                    Number.parseFloat(String(numericCost))
                );
            }


            /*
             * VALIDATE AMOUNT
             *
             * Aceita:
             * 15
             * 15.8
             * "15"
             * "15.8"
             *
             * Rejeita:
             * "string"
             *
             * Float é convertido para inteiro.
             */
            let finalAmount = "0";

            if (amount !== undefined && amount !== null) {

                const numericAmount = Number(amount);

                if (
                    Number.isNaN(numericAmount) ||
                    !Number.isFinite(numericAmount)
                ) {

                    return reply.code(400).send({
                        message: "Amount must be a valid number"
                    });
                }

                finalAmount = String(
                    Math.trunc(numericAmount)
                );
            }


            /*
             * SM CODE
             *
             * Se for null ou não informado,
             * gera automaticamente.
             */
            let finalSmCode: string;

            if (
                sm_code === null ||
                sm_code === undefined
            ) {

                finalSmCode = generateSmCode(name);

            } else {

                finalSmCode = sm_code
                    .trim()
                    .toUpperCase();

                if (!finalSmCode) {
                    finalSmCode = generateSmCode(name);
                }
            }


            /*
             * BAR CODE
             *
             * Se for null ou não informado,
             * gera automaticamente.
             */
            let finalBarCode: string;

            if (
                bar_code === null ||
                bar_code === undefined
            ) {

                finalBarCode = generateBarCode();

            } else {

                finalBarCode = bar_code.trim();

                if (!finalBarCode) {
                    finalBarCode = generateBarCode();
                }
            }


            // CHECK SM CODE
            const existingSmCode = sqlite
                .prepare(`
                    SELECT id
                    FROM products
                    WHERE sm_code = ?
                `)
                .get(finalSmCode);

            if (existingSmCode) {

                return reply.code(409).send({
                    message: "SM code already registered"
                });
            }


            // CHECK BAR CODE
            const existingBarCode = sqlite
                .prepare(`
                    SELECT id
                    FROM products
                    WHERE bar_code = ?
                `)
                .get(finalBarCode);

            if (existingBarCode) {

                return reply.code(409).send({
                    message: "Bar code already registered"
                });
            }


            // CREATE PRODUCT
            const result = sqlite
                .prepare(`
                    INSERT INTO products (
                        sm_code,
                        bar_code,
                        name,
                        description,
                        value,
                        cost,
                        amount,
                        unit_measure,
                        ncm,
                        cst,
                        csosn,
                        icms,
                        status
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `)
                .run(
                    finalSmCode,
                    finalBarCode,
                    name.trim(),
                    description ?? null,
                    finalValue,
                    finalCost,
                    finalAmount,
                    finalUnitMeasure,
                    finalNcm,
                    finalCst,
                    finalCsosn,
                    finalIcms,
                    status ?? 1
                );


            // GET CREATED PRODUCT
            const product = sqlite
                .prepare(`
                    SELECT * FROM products WHERE id = ?
                `)
                .get(result.lastInsertRowid);


            recordProductMovement(product, "create", Number(finalAmount), 0);
            return reply.code(201).send({
                message: "Product created successfully",
                data: product
            });
        }
    );
    fastify.post("/product/:id/stock-movement", { onRequest: [fastify.authenticate, fastify.authorize(3)] }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const body = (request.body ?? {}) as { direction?: string; quantity?: string | number; notes?: string | null };
        const quantity = Number(body.quantity);
        if (!Number.isInteger(quantity) || quantity <= 0 || !["add", "remove"].includes(String(body.direction))) return reply.code(400).send({ message: "Informe uma quantidade inteira maior que zero." });
        const product = sqlite.prepare("SELECT * FROM products WHERE id = ?").get(id);
        if (!product) return reply.code(404).send({ message: "Produto não encontrado." });
        const amount = Number(product.amount) || 0;
        const adding = body.direction === "add";
        if (!adding && quantity > amount) return reply.code(409).send({ message: "A quantidade em estoque não pode ficar negativa." });
        try {
            sqlite.exec("BEGIN IMMEDIATE");
            recordProductMovement(product, adding ? "stock_add" : "stock_remove", adding ? quantity : 0, adding ? 0 : quantity, {notes:String(body.notes??"").trim()||null});
            sqlite.prepare("UPDATE products SET amount = ? WHERE id = ?").run(String(amount + (adding ? quantity : -quantity)), id);
            sqlite.exec("COMMIT");
            return { message: "Estoque atualizado.", data: sqlite.prepare("SELECT * FROM products WHERE id = ?").get(id) };
        } catch (error) {
            sqlite.exec("ROLLBACK");
            request.log.error(error);
            return reply.code(500).send({ message: "Não foi possível registrar a movimentação de estoque." });
        }
    });
}


module.exports = products;