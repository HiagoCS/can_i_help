import { getBudgetPdf } from "@/data/api/budget";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
});

function escapeMarkup(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function parseMoney(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

function formatBudgetDate(value) {
    const date = new Date(String(value ?? "").replace(" ", "T"));

    if (Number.isNaN(date.getTime())) {
        return String(value ?? "");
    }

    return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    }).format(date);
}

function getCompanyAddress(company) {
    return [
        company.address,
        company.number,
        company.complement,
        company.neighborhood,
        company.city,
        company.state,
        company.zip_code
    ]
        .filter(Boolean)
        .join(", ");
}

function getCustomerAddress(customer) {
    return [
        customer.address,
        customer.number,
        customer.complement,
        customer.neighborhood,
        customer.city,
        customer.state,
        customer.zip_code
    ]
        .filter(Boolean)
        .join(", ");
}

/**
 * Abre o PDF oficial gerado pelo backend.
 *
 * O frontend não recria o documento: ele busca o arquivo da rota
 * GET /api/budget/:budgetId/pdf e exibe o PDF retornado pelo servidor.
 *
 * Dessa forma, o layout, os dados e a formatação são os mesmos
 * utilizados pelo PDF do backend.
 *
 * A aba é aberta antes da requisição para evitar bloqueadores
 * de pop-up.
 */
export async function printBudgetPdf(budget) {
    const budgetId = Number(
        typeof budget === "object" && budget !== null
            ? budget.id
            : budget
    );

    if (!Number.isSafeInteger(budgetId) || budgetId <= 0) {
        window.alert(
            "Não foi possível gerar o PDF: identificador de orçamento inválido."
        );
        return;
    }

    const printWindow = window.open("", "_blank");

    if (!printWindow) {
        window.alert(
            "Permita a abertura de pop-ups para abrir o PDF do orçamento."
        );
        return;
    }

    printWindow.document.title = "Gerando PDF do orçamento...";
    printWindow.document.body.textContent =
        "Carregando o PDF gerado pelo servidor. Aguarde...";

    try {
        const file = await getBudgetPdf(budgetId, {
            paymentMethodName: budget?.payment_method_name ?? null,
            installmentCount: budget?.installment_count ?? null
        });

        if (!file?.blob || file.blob.size === 0) {
            throw new Error(
                "O servidor não retornou um PDF válido."
            );
        }

        if (
            file.contentType &&
            !file.contentType.toLowerCase().includes("application/pdf")
        ) {
            throw new Error(
                "O servidor retornou um documento que não é PDF."
            );
        }

        const objectUrl = URL.createObjectURL(file.blob);

        printWindow.location.replace(objectUrl);

        /*
         * Mantém o documento disponível por tempo suficiente para
         * o visualizador do navegador carregar o PDF.
         */
        window.setTimeout(() => {
            URL.revokeObjectURL(objectUrl);
        }, 60_000);
    } catch (error) {
        printWindow.close();

        window.alert(
            error instanceof Error
                ? error.message
                : "Não foi possível carregar o PDF do orçamento."
        );
    }
}

/**
 * Gera um cupom de orçamento para impressora térmica de 80 mm.
 *
 * Esta função é independente do PDF A4 do backend.
 * Ela gera um comprovante gerencial, sem validade fiscal.
 */
export function drawBudgetCoupon(budget, existingWindow = null) {
    if (!budget || !budget.id) {
        window.alert(
            "Não foi possível gerar o cupom: orçamento inválido."
        );
        return;
    }

    let printWindow = existingWindow;

    if (!printWindow) {
        printWindow = window.open("", "_blank");
    }

    if (!printWindow) {
        window.alert(
            "Permita a abertura de pop-ups para imprimir o cupom do orçamento."
        );
        return;
    }

    const company = budget.company ?? {};
    const customer = budget.customer ?? {};

    const budgetItems = Array.isArray(budget.items)
        ? budget.items
        : [];

    const companyName =
        company.trade_name ||
        company.legal_name ||
        "Empresa não configurada";

    const customerName =
        budget.client_name ||
        customer.name ||
        null;

    const companyAddress = getCompanyAddress(company);
    const customerAddress = getCustomerAddress(customer);

    const taxId =
        budget.client_tax_id ||
        customer.cpf ||
        customer.cnpj;

    const items = budgetItems.map((item) => {
        const quantity = parseMoney(item.quantity);

        const unitPrice = parseMoney(
            item.unitPrice ?? item.unit_price ?? item.unit_value
        );

        const total = parseMoney(
            item.total_value ?? item.totalValue ?? item.total ?? quantity * unitPrice
        );

        const itemName = item.name || "Item";
        const description = item.description || "";

        const unit =
            item.unitMeasure ||
            item.unit_measure ||
            "UN";

        const itemType =
            (item.itemType === "service" || item.item_type === "service")
                ? "Serviço"
                : (item.itemType === "product" || item.item_type === "product")
                    ? "Produto"
                    : "";

        return `
            <div class="item">
                <div class="item-name">
                    ${escapeMarkup(itemName)}
                    ${
                        itemType
                            ? `<span>(${itemType})</span>`
                            : ""
                    }
                </div>

                ${
                    description
                        ? `
                            <div class="item-description">
                                ${escapeMarkup(description)}
                            </div>
                        `
                        : ""
                }

                <div class="item-details">
                    <span>
                        ${quantity.toLocaleString("pt-BR")}
                        ${escapeMarkup(unit)}
                        × ${currencyFormatter.format(unitPrice)}
                    </span>

                    <strong>
                        ${currencyFormatter.format(total)}
                    </strong>
                </div>
            </div>
        `;
    }).join("");

    const surcharge = parseMoney(
        budget.installment_surcharge
    );

    const discount = parseMoney(
        budget.discount_total
    );

    const installmentLine = surcharge > 0
        ? `
            <div class="summary-line">
                <span>Acréscimo estimado de parcelamento</span>
                <span>
                    ${currencyFormatter.format(surcharge)}
                </span>
            </div>
        `
        : "";

    const discountLine = discount > 0
        ? `
            <div class="summary-line">
                <span>Desconto</span>
                <span>
                    -${currencyFormatter.format(discount)}
                </span>
            </div>
        `
        : "";

    printWindow.document.open();

    printWindow.document.write(`<!doctype html>
        <html lang="pt-BR">
        <head>
            <meta charset="utf-8">

            <meta
                name="viewport"
                content="width=device-width, initial-scale=1"
            >

            <title>Cupom do orçamento ${Number(budget.id)}</title>

            <style>
                @page {
                    size: 80mm auto;
                    margin: 3mm;
                }

                * {
                    box-sizing: border-box;
                }

                html,
                body {
                    width: 100%;
                    margin: 0;
                    padding: 0;
                }

                body {
                    font-family: Arial, Helvetica, sans-serif;
                    font-size: 11px;
                    line-height: 1.4;
                    color: #000;
                    background: #fff;
                }

                .coupon {
                    width: 100%;
                    max-width: 74mm;
                    margin: 0 auto;
                    overflow-wrap: anywhere;
                }

                .center {
                    text-align: center;
                }

                .company-name {
                    margin: 0 0 5px;
                    font-size: 16px;
                    font-weight: 700;
                    text-transform: uppercase;
                }

                .company-info {
                    margin-bottom: 8px;
                    font-size: 10px;
                }

                .separator {
                    margin: 8px 0;
                    border: 0;
                    border-top: 1px dashed #000;
                }

                .title {
                    margin: 7px 0;
                    font-size: 13px;
                    font-weight: 700;
                    text-align: center;
                    text-transform: uppercase;
                }

                .budget-info {
                    font-size: 10px;
                }

                .budget-info div {
                    margin: 2px 0;
                }

                .section-title {
                    margin: 8px 0 5px;
                    font-size: 11px;
                    font-weight: 700;
                    text-transform: uppercase;
                }

                .item {
                    padding: 7px 0;
                    border-bottom: 1px dashed #999;
                    page-break-inside: avoid;
                }

                .item-name {
                    font-weight: 700;
                }

                .item-name span {
                    font-size: 10px;
                    font-weight: 400;
                }

                .item-description {
                    margin-top: 2px;
                    font-size: 10px;
                }

                .item-details {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    gap: 5px;
                    margin-top: 4px;
                }

                .item-details strong {
                    white-space: nowrap;
                }

                .summary {
                    margin-top: 8px;
                }

                .summary-line {
                    display: flex;
                    justify-content: space-between;
                    gap: 8px;
                    margin: 4px 0;
                }

                .summary-line span:last-child {
                    text-align: right;
                    white-space: nowrap;
                }

                .total {
                    margin-top: 8px;
                    padding-top: 7px;
                    border-top: 1px solid #000;
                    font-size: 16px;
                    font-weight: 700;
                }

                .payment {
                    margin-top: 10px;
                }

                .footer {
                    margin-top: 13px;
                    text-align: center;
                    font-size: 10px;
                }

                @media screen {
                    body {
                        padding: 8px;
                    }

                    .coupon {
                        max-width: 74mm;
                    }
                }
            </style>
        </head>

        <body>
            <main class="coupon">
                <header class="center">
                    <h1 class="company-name">
                        ${escapeMarkup(companyName)}
                    </h1>

                    <div class="company-info">
                        ${
                            company.cnpj
                                ? `<div>CNPJ: ${escapeMarkup(company.cnpj)}</div>`
                                : ""
                        }

                        ${
                            company.state_registration
                                ? `<div>IE: ${escapeMarkup(company.state_registration)}</div>`
                                : ""
                        }

                        ${
                            companyAddress
                                ? `<div>${escapeMarkup(companyAddress)}</div>`
                                : ""
                        }

                        ${
                            company.phone
                                ? `<div>Telefone: ${escapeMarkup(company.phone)}</div>`
                                : ""
                        }
                    </div>
                </header>

                <hr class="separator">

                <h2 class="title">
                    Orçamento comercial
                </h2>

                <section class="budget-info">
                    <div>
                        <strong>Orçamento:</strong>
                        #${Number(budget.id)}
                    </div>

                    <div>
                        <strong>Data:</strong>
                        ${escapeMarkup(formatBudgetDate(budget.dt_budget))}
                    </div>

                    <div>
                        ${customerName?"<strong>Cliente:</strong>":""}
                        ${escapeMarkup(customerName)}
                    </div>

                    ${
                        taxId
                            ? `
                                <div>
                                    <strong>CPF/CNPJ:</strong>
                                    ${escapeMarkup(taxId)}
                                </div>
                            `
                            : ""
                    }

                    ${
                        customerAddress
                            ? `
                                <div>
                                    <strong>Endereço:</strong>
                                    ${escapeMarkup(customerAddress)}
                                </div>
                            `
                            : ""
                    }
                </section>

                <hr class="separator">

                <section>
                    <h3 class="section-title">
                        Itens do orçamento
                    </h3>

                    ${
                        items ||
                        "<p>Nenhum item encontrado.</p>"
                    }
                </section>

                <section class="summary">
                    <div class="summary-line">
                        <span>Subtotal dos itens</span>

                        <span>
                            ${currencyFormatter.format(
                                parseMoney(
                                    budget.sold_subtotal ??
                                    budget.product_subtotal ??
                                    budget.items?.reduce((sum, item) => {
                                        const q = parseMoney(item.quantity);
                                        const unit = parseMoney(item.unitPrice ?? item.unit_price ?? item.unit_value);
                                        return sum + parseMoney(item.total_value ?? item.totalValue ?? item.total ?? q * unit);
                                    }, 0)
                                )
                            )}
                        </span>
                    </div>

                    ${discountLine}
                    ${installmentLine}

                    <div class="summary-line total">
                        <span>TOTAL</span>

                        <span>
                            ${currencyFormatter.format(
                                parseMoney(budget.total_value)
                            )}
                        </span>
                    </div>
                </section>

                <section class="payment">
                    <div>
                        <strong>Condição estimada:</strong>
                        ${escapeMarkup(
                            budget.payment_method_name ||
                            "Não informada (estimativa)"
                        )}
                    </div>

                    ${
                        budget.installment_count
                            ? `
                                <div>
                                    <strong>Parcelamento previsto:</strong>
                                    ${Number(budget.installment_count)}x
                                </div>
                            `
                            : ""
                    }
                </section>

                <hr class="separator">

                <footer class="footer">
                    <div>Obrigado pela preferência!</div>
                    <div>eight.cs development.</div>
                </footer>
            </main>

            <script>
                window.addEventListener("load", () => {
                    setTimeout(() => window.print(), 300);
                });
            </script>
        </body>
        </html>`);

    printWindow.document.close();
}