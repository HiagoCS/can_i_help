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
        .replace(/'/g, "&apos;");
}

function formatSaleDate(value) {
    const date = new Date(String(value ?? "").replace(" ", "T"));
    if (Number.isNaN(date.getTime())) return String(value ?? "");
    return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit"
    }).format(date);
}

function downloadFile(filename, contents, type) {
    const blob = new Blob([contents], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function printSalePdf(sale) {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
        window.alert("Permita a abertura de pop-ups para gerar o PDF da venda.");
        return;
    }

    const company = sale.company ?? {};
    const customer = sale.customer ?? {};
    const items = (sale.items ?? []).map((item, index) => `
        <tr>
            <td>${index + 1}</td>
            <td>${escapeMarkup(item.name)}</td>
            <td>${escapeMarkup(item.description || "—")}</td>
            <td>${escapeMarkup(item.unitMeasure || item.unit_measure || "UN")}</td>
            <td>${Number(item.quantity).toLocaleString("pt-BR", { minimumFractionDigits: 4 })}</td>
            <td>${currencyFormatter.format(Number(item.unitPrice) || 0)}</td>
            <td>${currencyFormatter.format(Number(item.total) || 0)}</td>
        </tr>
    `).join("");
    const companyName = company.trade_name || company.legal_name || "Empresa não configurada";
    const customerName = sale.client_name || "Consumidor não identificado";
    const companyAddress = [company.address, company.number, company.complement, company.neighborhood, company.city, company.state, company.zip_code].filter(Boolean).join(", ");
    const customerAddress = [customer.address, customer.number, customer.complement, customer.neighborhood, customer.city, customer.state, customer.zip_code].filter(Boolean).join(", ");
    const taxIdLine = sale.client_tax_id
        ? `<div>CPF/CNPJ: ${escapeMarkup(sale.client_tax_id)}</div>`
        : "";
    const surcharge = Number(sale.installment_surcharge) || 0;
    const installmentLine = surcharge > 0
        ? `<tr><th>Acréscimo do parcelamento</th><td>${currencyFormatter.format(surcharge)}</td></tr>`
        : "";

    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
        <html lang="pt-BR"><head><meta charset="utf-8"><title>Comprovante de venda ${Number(sale.id)}</title>
        <style>
            @page { size: A4; margin: 14mm; }
            * { box-sizing: border-box; }
            body { margin: 0; color: #17202a; font: 10pt Arial, sans-serif; }
            h1 { margin: 0 0 3mm; font-size: 16pt; }
            .notice { margin: 0 0 8mm; padding: 3mm; border: 1px solid #a33; color: #8c2020; font-weight: 700; text-align: center; }
            .meta { margin-bottom: 6mm; line-height: 1.55; }
            table { width: 100%; border-collapse: collapse; }
            th, td { padding: 2.3mm 1.5mm; border: 1px solid #d5d5d5; text-align: left; vertical-align: top; }
            th { background: #f1f1f1; }
            .items { margin-top: 5mm; font-size: 8.5pt; }
            .items th:nth-child(n+4), .items td:nth-child(n+4) { text-align: right; white-space: nowrap; }
            .summary { width: min(75mm, 100%); margin: 6mm 0 0 auto; }
            .summary th { width: 72%; font-weight: 400; }
            .summary .total th, .summary .total td { font-weight: 700; }
            .payment { margin-top: 22mm; }
            footer { margin-top: 7mm; color: #637282; font-size: 8pt; }
            @media screen { body { max-width: 190mm; margin: 14mm auto; } }
        </style></head><body>
        <div class="notice">COMPROVANTE DE VENDA — DOCUMENTO GERENCIAL SEM VALIDADE FISCAL</div>
        <h1>${escapeMarkup(companyName)}</h1>
        <div class="meta">
            <div>CNPJ: ${escapeMarkup(company.cnpj || "Não informado")}</div>
            <div>Inscrição estadual: ${escapeMarkup(company.state_registration || "Não informada")}</div>
            ${companyAddress ? `<div>${escapeMarkup(companyAddress)}</div>` : ""}
            <div><strong>Destinatário:</strong> ${escapeMarkup(customerName)}</div>
            ${taxIdLine}
            ${customerAddress ? `<div>Endereço: ${escapeMarkup(customerAddress)}</div>` : ""}
            <div>Venda #${Number(sale.id)} · Emitida em: ${escapeMarkup(formatSaleDate(sale.dt_sale))}</div>
        </div>
        <table class="items"><thead><tr><th>#</th><th>Produto / Serviço</th><th>Descrição</th><th>Un.</th><th>Qtde</th><th>V. Unit.</th><th>V. Total</th></tr></thead><tbody>${items}</tbody></table>
        <table class="summary"><tbody>
            <tr><th>Total Produtos/Serviços</th><td>${currencyFormatter.format(Number(sale.product_subtotal) || 0)}</td></tr>
            <tr><th>Descontos</th><td>${currencyFormatter.format(Number(sale.discount_total) || 0)}</td></tr>
            ${installmentLine}
            <tr class="total"><th>Valor total</th><td>${currencyFormatter.format(Number(sale.total_value) || 0)}</td></tr>
        </tbody></table>
        <div class="payment"><strong>Pagamentos</strong><table><thead><tr><th>Método</th><th>Parcelas</th><th>Valor</th></tr></thead>
        <tbody><tr><td>${escapeMarkup(sale.payment_method_name || "Não informado")}</td><td>${sale.installment_count ? "x" + Number(sale.installment_count) : "—"}</td><td>${currencyFormatter.format(Number(sale.total_value) || 0)}</td></tr></tbody></table></div>
        <footer>Gerado por sistema POS · Venda sem autorização da SEFAZ.</footer>
        <script>window.addEventListener("load", () => setTimeout(() => window.print(), 250));</script>
        </body></html>`);
    printWindow.document.close();
}

export function downloadSaleXml(sale) {
    const company = sale.company ?? {};
    const customer = sale.customer ?? {};
    const items = (sale.items ?? []).map((item, index) => `
        <Item numero="${index + 1}">
            <Codigo>${escapeMarkup(item.smCode)}</Codigo>
            <CodigoBarras>${escapeMarkup(item.barCode)}</CodigoBarras>
            <NCM>${escapeMarkup(item.ncm)}</NCM>
            <CST>${escapeMarkup(item.cst)}</CST>
            <CSOSN>${escapeMarkup(item.csosn)}</CSOSN>
            <ICMS>${Number(item.icms) || 0}</ICMS>
            <Produto>${escapeMarkup(item.name)}</Produto>
            <Descricao>${escapeMarkup(item.description || "")}</Descricao>
            <Unidade>${escapeMarkup(item.unitMeasure || item.unit_measure || "UN")}</Unidade>
            <Quantidade>${Number(item.quantity)}</Quantidade>
            <ValorUnitario>${Number(item.unitPrice).toFixed(2)}</ValorUnitario>
            <ValorTotal>${Number(item.total).toFixed(2)}</ValorTotal>
        </Item>`).join("");
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ComprovanteVendaPOS validadeFiscal="false" autorizacaoSefaz="false">
    <Aviso>Documento gerencial. Não é NF-e nem possui validade fiscal.</Aviso>
    <Venda>
        <Numero>${Number(sale.id)}</Numero>
        <EmitidaEm>${escapeMarkup(sale.dt_sale)}</EmitidaEm>
        <Emitente>
            <NomeFantasia>${escapeMarkup(company.trade_name || "")}</NomeFantasia>
            <RazaoSocial>${escapeMarkup(company.legal_name || "")}</RazaoSocial>
            <CNPJ>${escapeMarkup(company.cnpj || "")}</CNPJ>
            <InscricaoEstadual>${escapeMarkup(company.state_registration || "")}</InscricaoEstadual>
            <InscricaoMunicipal>${escapeMarkup(company.municipal_registration || "")}</InscricaoMunicipal>
            <RegimeTributario>${escapeMarkup(company.tax_regime || "")}</RegimeTributario>
            <CodigoMunicipio>${escapeMarkup(company.city_ibge || "")}</CodigoMunicipio>
            <Endereco>${escapeMarkup([company.address, company.number, company.complement, company.neighborhood, company.city, company.state, company.zip_code].filter(Boolean).join(", "))}</Endereco>
        </Emitente>
        <Destinatario>
            <Nome>${escapeMarkup(sale.client_name || "Consumidor não identificado")}</Nome>
            <CPF>${escapeMarkup(customer.cpf || "")}</CPF>
            <CNPJ>${escapeMarkup(customer.cnpj || "")}</CNPJ>
            <InscricaoEstadual>${escapeMarkup(customer.ie || "")}</InscricaoEstadual>
            <CodigoMunicipio>${escapeMarkup(customer.city_ibge || "")}</CodigoMunicipio>
            <Endereco>${escapeMarkup([customer.address, customer.number, customer.complement, customer.neighborhood, customer.city, customer.state, customer.zip_code].filter(Boolean).join(", "))}</Endereco>
        </Destinatario>
        <Itens>${items}
        </Itens>
        <Pagamento metodo="${escapeMarkup(sale.payment_method_name || "")}" parcelas="${Number(sale.installment_count) || 1}" />
        <Totais>
            <Produtos>${Number(sale.product_subtotal).toFixed(2)}</Produtos>
            <SubtotalComDesconto>${Number(sale.sold_subtotal).toFixed(2)}</SubtotalComDesconto>
            <Descontos>${Number(sale.discount_total).toFixed(2)}</Descontos>
            <AcrescimoParcelamento>${Number(sale.installment_surcharge).toFixed(2)}</AcrescimoParcelamento>
            <Total>${Number(sale.total_value).toFixed(2)}</Total>
        </Totais>
    </Venda>
</ComprovanteVendaPOS>`;

    downloadFile(`comprovante-venda-${Number(sale.id)}.xml`, xml, "application/xml;charset=utf-8");
}
