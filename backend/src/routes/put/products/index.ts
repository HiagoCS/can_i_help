import type { FastifyInstance } from "fastify";

const { sqlite } = require("../../../db/index");
const { recordProductMovement } = require("../../../db/product_stock");

async function products(fastify: FastifyInstance) {

    fastify.put("/product/:id",
        {
            onRequest: [
                fastify.authenticate,
                fastify.authorize(3)
            ]
        },
        async (request, reply) => {

            const { id } = request.params as {
                id: string;
            };

            const {
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
            } = request.body as {
                sm_code?: string | null;
                bar_code?: string | null;
                name?: string;
                description?: string | null;
                value?: number | string | null;
                cost?: number | string | null;
                amount?: number | string | null;
                ncm?: string | null;
                cst?: string | number | null;
                csosn?: string | number | null;
                icms?: number | string | null;
                status?: number | null;
            };


            // CHECK PRODUCT
            const product = sqlite
                .prepare(`
                    SELECT * FROM products
                    WHERE id = ?
                `)
                .get(id);

            if (!product) {
                return reply.code(404).send({
                    message: "Product not found"
                });
            }



            const fiscalConfig = sqlite.prepare("SELECT tax_regime, ncm_default FROM fiscal_config ORDER BY id LIMIT 1").get() as { tax_regime?: string; ncm_default?: string } | undefined;
            const companyConfig = sqlite.prepare("SELECT tax_regime FROM company ORDER BY id LIMIT 1").get() as { tax_regime?: string } | undefined;
            const isNormalRegime = (fiscalConfig?.tax_regime ?? companyConfig?.tax_regime) === "REGIME_NORMAL";
            const defaultNcm = fiscalConfig?.ncm_default || null;
            const finalNcm = (typeof ncm === "string" ? ncm.trim() : "") || (ncm === undefined ? product.ncm : null) || defaultNcm;
            let finalCst = "0";
            let finalCsosn = "0";
            let finalIcms = 0;

            if (isNormalRegime) {
                finalCst = String(cst === undefined ? product.cst : cst ?? "").trim();
                finalCsosn = String(csosn === undefined ? product.csosn : csosn ?? "").trim();
                finalIcms = Number(icms === undefined ? product.icms : icms);
                if (!finalCst || !finalCsosn || !Number.isFinite(finalIcms) || finalIcms < 0) {
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
            let convertedValue: string | null = null;

            if (value !== undefined) {

                if (value === null) {

                    convertedValue = null;

                } else {

                    const numericValue = Number(value);

                    if (
                        Number.isNaN(numericValue) ||
                        !Number.isFinite(numericValue)
                    ) {
                        return reply.code(400).send({
                            message: "Value must be a valid number"
                        });
                    }

                    convertedValue = String(
                        Number.parseFloat(String(numericValue))
                    );
                }
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
            let convertedCost: string | null = null;

            if (cost !== undefined) {

                if (cost === null) {

                    convertedCost = null;

                } else {

                    const numericCost = Number(cost);

                    if (
                        Number.isNaN(numericCost) ||
                        !Number.isFinite(numericCost)
                    ) {
                        return reply.code(400).send({
                            message: "Cost must be a valid number"
                        });
                    }

                    convertedCost = String(
                        Number.parseFloat(String(numericCost))
                    );
                }
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
            let convertedAmount: string | null = null;

            if (amount !== undefined) {

                if (amount === null) {

                    convertedAmount = null;

                } else {

                    const numericAmount = Number(amount);

                    if (
                        Number.isNaN(numericAmount) ||
                        !Number.isFinite(numericAmount) ||
                        numericAmount < 0
                    ) {
                        return reply.code(400).send({
                            message: "Amount must be a valid number"
                        });
                    }

                    convertedAmount = String(
                        Math.trunc(numericAmount)
                    );
                }
            }


            /*
             * CHECK SM CODE
             */
            if (sm_code !== undefined) {

                if (sm_code === null || !sm_code.trim()) {

                    return reply.code(400).send({
                        message: "SM code cannot be null or empty"
                    });
                }

                const existingSmCode = sqlite
                    .prepare(`
                        SELECT * FROM products
                        WHERE sm_code = ?
                        AND id != ?
                    `)
                    .get(
                        sm_code.trim().toUpperCase(),
                        id
                    );

                if (existingSmCode) {

                    return reply.code(409).send({
                        message: "SM code already registered"
                    });
                }
            }


            /*
             * CHECK BAR CODE
             */
            if (bar_code !== undefined) {

                if (bar_code === null || !bar_code.trim()) {

                    return reply.code(400).send({
                        message: "Bar code cannot be null or empty"
                    });
                }

                const existingBarCode = sqlite
                    .prepare(`
                        SELECT * FROM products
                        WHERE bar_code = ?
                        AND id != ?
                    `)
                    .get(
                        bar_code.trim(),
                        id
                    );

                if (existingBarCode) {

                    return reply.code(409).send({
                        message: "Bar code already registered"
                    });
                }
            }


            /*
             * NAME
             */
            if (
                name !== undefined &&
                !name.trim()
            ) {

                return reply.code(400).send({
                    message: "Name cannot be empty"
                });
            }


            const oldAmount = Number(product.amount) || 0;
            const nextAmount = amount === undefined || amount === null ? oldAmount : Math.max(0, Math.trunc(Number(amount)));
            const amountDifference=nextAmount-oldAmount;
            sqlite.exec("BEGIN IMMEDIATE");
            try {
            if(amountDifference>0)recordProductMovement(product,"stock_add",amountDifference,0);
            if(amountDifference<0)recordProductMovement(product,"stock_remove",0,Math.abs(amountDifference));
            /*
             * UPDATE PRODUCT
             */
            sqlite
                .prepare(`
                    UPDATE products
                    SET
                        sm_code = COALESCE(?, sm_code),
                        bar_code = COALESCE(?, bar_code),
                        name = COALESCE(?, name),
                        description = COALESCE(?, description),
                        value = COALESCE(?, value),
                        cost = COALESCE(?, cost),
                        amount = COALESCE(?, amount),
                        ncm = ?,
                        cst = ?,
                        csosn = ?,
                        icms = ?,
                        status = COALESCE(?, status)
                    WHERE id = ?
                `)
                .run(
                    sm_code !== undefined
                        ? sm_code.trim().toUpperCase()
                        : null,

                    bar_code !== undefined
                        ? bar_code.trim()
                        : null,

                    name !== undefined
                        ? name.trim()
                        : null,

                    description !== undefined
                        ? description
                        : null,

                    convertedValue,

                    convertedCost,

                    convertedAmount,
                    finalNcm,

                    finalCst,

                    finalCsosn,

                    finalIcms,

                    status !== undefined
                        ? status
                        : null,

                    id
                );


            if(status!==undefined||sm_code!==undefined||bar_code!==undefined||name!==undefined||description!==undefined||value!==undefined||cost!==undefined||ncm!==undefined||cst!==undefined||csosn!==undefined||icms!==undefined){const snapshot=sqlite.prepare("SELECT * FROM products WHERE id = ?").get(id);recordProductMovement(snapshot,status===0?"deactivate":"edit",0,0);}
            sqlite.exec("COMMIT");
            } catch (error) {
                sqlite.exec("ROLLBACK");
                request.log.error(error);
                return reply.code(409).send({ message: "Não foi possível atualizar o produto." });
            }

            // GET UPDATED PRODUCT
            const updatedProduct = sqlite
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
                .get(id);


            return {
                message: "Product updated successfully",
                data: updatedProduct
            };
        }
    );
}

module.exports = products;