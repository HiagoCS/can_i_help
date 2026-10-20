import { getCashierSalePdf } from "@/data/api/cashier";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
});

const appEnv = import.meta.env;

function getApiUrl(path) {
    const configuredBase = String(appEnv.VITE_API_URL ?? "").replace(/\/+$/, "");
    const base = appEnv.DEV ? "" : configuredBase;
    return `${base}${path}`;
}

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

function formatSaleDate(value) {
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

function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Normaliza os formatos possíveis da empresa sem depender de um objeto
 * aninhado específico. A tabela company usa nomes snake_case.
 */
function normalizeCompany(value) {
    if (!isObject(value)) return {};

    const source = isObject(value.company)
        ? value.company
        : isObject(value.data?.company)
            ? value.data.company
            : isObject(value.data)
                ? value.data
                : value;

    return {
        ...source,
        cnpj: source.cnpj ?? source.CNPJ ?? null,
        legal_name: source.legal_name ?? source.legalName ?? source.name ?? null,
        trade_name: source.trade_name ?? source.tradeName ?? null,
        address: source.address ?? source.street ?? null,
        number: source.number ?? null,
        complement: source.complement ?? null,
        neighborhood: source.neighborhood ?? null,
        city: source.city ?? null,
        state: source.state ?? null,
        zip_code: source.zip_code ?? source.zipCode ?? null
    };
}

function hasCompanyData(company) {
    return Boolean(
        company.trade_name ||
        company.legal_name ||
        company.cnpj ||
        company.address ||
        company.city
    );
}

/**
 * Usa primeiro os dados recebidos junto à venda. Se estiverem ausentes,
 * consulta as configurações críticas, cuja resposta inclui data.company.
 */
async function getSaleCompany(sale) {
    const attachedCompany = normalizeCompany(sale?.company);

    if (hasCompanyData(attachedCompany)) {
        return attachedCompany;
    }

    try {
        const response = await fetch(getApiUrl("/api/settings/critical"), {
            method: "GET",
            credentials: "include",
            headers: { Accept: "application/json" }
        });

        if (!response.ok) return attachedCompany;

        const result = await response.json().catch(() => null);
        const fetchedCompany = normalizeCompany(result?.data?.company);

        return hasCompanyData(fetchedCompany)
            ? fetchedCompany
            : attachedCompany;
    } catch {
        // A impressão continua usando os dados já disponíveis na venda.
        return attachedCompany;
    }
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
        .filter((value) => value !== null && value !== undefined && String(value).trim())
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
        .filter((value) => value !== null && value !== undefined && String(value).trim())
        .join(", ");
}

/**
 * Abre o PDF interno gerado pelo backend.
 * A aba é aberta antes da requisição para evitar bloqueadores de pop-up.
 */
export async function printSalePdf(sale) {
    const saleId = Number(
        typeof sale === "object" && sale !== null
            ? sale.id
            : sale
    );

    if (!Number.isSafeInteger(saleId) || saleId <= 0) {
        window.alert("Não foi possível gerar o PDF: identificador de venda inválido.");
        return;
    }

    const printWindow = window.open("", "_blank");

    if (!printWindow) {
        window.alert("Permita a abertura de pop-ups para abrir o PDF da venda.");
        return;
    }

    printWindow.document.title = "Gerando PDF da venda...";
    printWindow.document.body.textContent = "Carregando o PDF gerado pelo servidor. Aguarde...";

    try {
        const file = await getCashierSalePdf(saleId);

        if (!file?.blob || file.blob.size === 0) {
            throw new Error("O servidor não retornou um PDF válido.");
        }

        if (
            file.contentType &&
            !file.contentType.toLowerCase().includes("application/pdf")
        ) {
            throw new Error("O servidor retornou um documento que não é PDF.");
        }

        const objectUrl = URL.createObjectURL(file.blob);
        printWindow.location.replace(objectUrl);

        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
        printWindow.close();
        window.alert(
            error instanceof Error
                ? error.message
                : "Não foi possível carregar o PDF da venda."
        );
    }
}

/** Gera um comprovante gerencial para impressora térmica de 80 mm. */
export async function drawCupon(sale) {
    if (!sale || !sale.id) {
        window.alert("Não foi possível gerar o cupom: venda inválida.");
        return;
    }

    const printWindow = window.open("", "_blank");

    if (!printWindow) {
        window.alert("Permita a abertura de pop-ups para imprimir o cupom.");
        return;
    }

    printWindow.document.title = "Preparando cupom...";
    printWindow.document.body.textContent = "Carregando os dados da empresa...";

    const company = await getSaleCompany(sale);
    const customer = isObject(sale.customer) ? sale.customer : {};
    const saleItems = Array.isArray(sale.items) ? sale.items : [];

    const companyName =
        company.trade_name ||
        company.legal_name ||
        "Empresa não configurada";

    const customerName =
        sale.client_name ||
        customer.name ||
        "Consumidor não identificado";

    const companyAddress = getCompanyAddress(company);
    const customerAddress = getCustomerAddress(customer);
    const customerDocument = sale.client_tax_id || customer.cpf || customer.cnpj;

    const items = saleItems.map((item) => {
        const quantity = parseMoney(item.quantity);
        const unitPrice = parseMoney(item.unitPrice ?? item.unit_price);
        const total = parseMoney(item.total ?? quantity * unitPrice);
        const itemName = item.name || "Item";
        const description = item.description || "";
        const unit = item.unitMeasure || item.unit_measure || "UN";
        const itemType = item.itemType === "service"
            ? "Serviço"
            : item.itemType === "product"
                ? "Produto"
                : "";

        return `
            <div class="item">
                <div class="item-name">
                    ${escapeMarkup(itemName)}
                    ${itemType ? `<span>(${itemType})</span>` : ""}
                </div>
                ${description ? `<div class="item-description">${escapeMarkup(description)}</div>` : ""}
                <div class="item-details">
                    <span>${quantity.toLocaleString("pt-BR")} ${escapeMarkup(unit)} × ${currencyFormatter.format(unitPrice)}</span>
                    <strong>${currencyFormatter.format(total)}</strong>
                </div>
            </div>
        `;
    }).join("");

    const surcharge = parseMoney(sale.installment_surcharge);
    const discount = parseMoney(sale.discount_total);

    const installmentLine = surcharge > 0
        ? `<div class="summary-line"><span>Acréscimo parcelamento</span><span>${currencyFormatter.format(surcharge)}</span></div>`
        : "";

    const discountLine = discount > 0
        ? `<div class="summary-line"><span>Desconto</span><span>-${currencyFormatter.format(discount)}</span></div>`
        : "";

    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
        <html lang="pt-BR">
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Cupom da venda ${Number(sale.id)}</title>
            <style>
                @page { size: 80mm auto; margin: 3mm; }
                * { box-sizing: border-box; }
                html, body { width: 100%; margin: 0; padding: 0; }
                body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; line-height: 1.4; color: #000; background: #fff; }
                .coupon { width: 100%; max-width: 74mm; margin: 0 auto; overflow-wrap: anywhere; }
                .center { text-align: center; }
                .company-name { margin: 0 0 5px; font-size: 16px; font-weight: 700; text-transform: uppercase; }
                .company-info { margin-bottom: 8px; font-size: 10px; }
                .separator { margin: 8px 0; border: 0; border-top: 1px dashed #000; }
                .title { margin: 7px 0; font-size: 13px; font-weight: 700; text-align: center; text-transform: uppercase; }
                .sale-info { font-size: 10px; }
                .sale-info div { margin: 2px 0; }
                .section-title { margin: 8px 0 5px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
                .item { padding: 7px 0; border-bottom: 1px dashed #999; page-break-inside: avoid; }
                .item-name { font-weight: 700; }
                .item-name span { font-size: 10px; font-weight: 400; }
                .item-description { margin-top: 2px; font-size: 10px; }
                .item-details { display: flex; justify-content: space-between; align-items: flex-start; gap: 5px; margin-top: 4px; }
                .item-details strong { white-space: nowrap; }
                .summary { margin-top: 8px; }
                .summary-line { display: flex; justify-content: space-between; gap: 8px; margin: 4px 0; }
                .summary-line span:last-child { text-align: right; white-space: nowrap; }
                .total { margin-top: 8px; padding-top: 7px; border-top: 1px solid #000; font-size: 16px; font-weight: 700; }
                .payment { margin-top: 10px; }
                .footer { margin-top: 13px; text-align: center; font-size: 10px; }
                @media screen { body { padding: 8px; } .coupon { max-width: 74mm; } }
            </style>
        </head>
        <body>
            <main class="coupon">
                <header class="center">
                    <h1 class="company-name">${escapeMarkup(companyName)}</h1>
                    <div class="company-info">
                        ${company.cnpj ? `<div>CNPJ: ${escapeMarkup(company.cnpj)}</div>` : ""}
                        ${companyAddress ? `<div>${escapeMarkup(companyAddress)}</div>` : ""}
                    </div>
                </header>
                <hr class="separator">
                <h2 class="title">Comprovante de venda</h2>
                <section class="sale-info">
                    <div><strong>Venda:</strong> #${Number(sale.id)}</div>
                    <div><strong>Data:</strong> ${escapeMarkup(formatSaleDate(sale.dt_sale))}</div>
                    <div><strong>Cliente:</strong> ${escapeMarkup(customerName)}</div>
                    ${customerDocument ? `<div><strong>CPF/CNPJ:</strong> ${escapeMarkup(customerDocument)}</div>` : ""}
                    ${customerAddress ? `<div><strong>Endereço:</strong> ${escapeMarkup(customerAddress)}</div>` : ""}
                </section>
                <hr class="separator">
                <section>
                    <h3 class="section-title">Itens da venda</h3>
                    ${items || "<p>Nenhum item encontrado.</p>"}
                </section>
                <section class="summary">
                    <div class="summary-line">
                        <span>Subtotal</span>
                        <span>${currencyFormatter.format(parseMoney(sale.sold_subtotal ?? sale.product_subtotal))}</span>
                    </div>
                    ${discountLine}
                    ${installmentLine}
                    <div class="summary-line total">
                        <span>TOTAL</span>
                        <span>${currencyFormatter.format(parseMoney(sale.total_value))}</span>
                    </div>
                </section>
                <section class="payment">
                    <div><strong>Pagamento:</strong> ${escapeMarkup(sale.payment_method_name || "Não informado")}</div>
                    ${sale.installment_count ? `<div><strong>Parcelas:</strong> ${Number(sale.installment_count)}x</div>` : ""}
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
