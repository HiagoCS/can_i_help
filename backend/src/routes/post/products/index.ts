import type { FastifyInstance } from "fastify";

const { sqlite } = require("../../../db/index");


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
                status
            } = request.body as {
                sm_code?: string | null;
                bar_code?: string | null;
                name: string;
                description?: string | null;
                value?: number | string | null;
                cost?: number | string | null;
                amount?: number | string | null;
                status?: number | null;
            };


            // REQUIRED FIELD
            if (!name || !name.trim()) {

                return reply.code(400).send({
                    message: "Name is required"
                });
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
                        status
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `)
                .run(
                    finalSmCode,
                    finalBarCode,
                    name.trim(),
                    description ?? null,
                    finalValue,
                    finalCost,
                    finalAmount,
                    status ?? 1
                );


            // GET CREATED PRODUCT
            const product = sqlite
                .prepare(`
                    SELECT
                        id,
                        sm_code,
                        bar_code,
                        name,
                        description,
                        value,
                        cost,
                        amount,
                        status
                    FROM products
                    WHERE id = ?
                `)
                .get(result.lastInsertRowid);


            return reply.code(201).send({
                message: "Product created successfully",
                data: product
            });
        }
    );
}


module.exports = products;