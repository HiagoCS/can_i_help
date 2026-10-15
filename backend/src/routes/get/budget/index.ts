import type { FastifyInstance } from "fastify";
import PDFDocument = require("pdfkit");

const { sqlite } = require("../../../db/index");

declare namespace PDFDocument {
    export type PDFDocument = InstanceType<typeof import("pdfkit")>;
}

type BudgetRow = {
    id: number;
    total_value: number;
    dt_budget: string;
    client_name: string | null;
    client_address: string | null;
    client_number: string | null;
    client_complement: string | null;
    client_neighborhood: string | null;
    client_city: string | null;
    client_state: string | null;
    client_zip_code: string | null;
    method_name: string | null;
    installment_count: number | null;
};

type ServiceMaterialRow = {
    product_id: number;
    name: string;
    description: string | null;
    quantity_per_service: number;
    unit_measure: string;
};

type BudgetItemRow = {
    id: number;
    product_id: number | null;
    service_id: number | null;
    name: string;
    description: string | null;
    quantity: number;
    unit_measure: string;
    unit_value: number;
    total_value: number;
    materials?: ServiceMaterialRow[];
};

type CompanyRow = {
    cnpj: string | null;
    legal_name: string;
    trade_name: string | null;
    address: string | null;
    number: string | null;
    complement: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    zip_code: string | null;
};

type PaymentRow = {
    method_name: string | null;
    installment_count: number | null;
    total_value: number;
};

type PdfOptions = {
    size?: "A4" | [number, number];
    margins?: {
        top?: number;
        bottom?: number;
        left?: number;
        right?: number;
    };
};

type BudgetTotals = {
    subtotal: number;
    discount: number;
    installmentSurcharge: number;
    total: number;
};

const COLORS = {
    black: "#111111",
    gray: "#666666",
    border: "#D9D9D9",
    header: "#F1F1F1",
    nested: "#FAFAFA",
};

const PAGE = {
    left: 45,
    right: 45,
    top: 45,
    bottom: 45
};

// Largura física de 58 mm para o comprovante térmico em PDF.
const COUPON_WIDTH = (58 * 72) / 25.4;
const COUPON_MARGIN = (3 * 72) / 25.4;
const COUPON_CONTENT_WIDTH = COUPON_WIDTH - COUPON_MARGIN * 2;
const MAX_COUPON_HEIGHT = 14_400;

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
});

function money(value: number | string | null | undefined): string {
    return (Number(value) || 0).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function currency(value: number | string | null | undefined): string {
    return currencyFormatter.format(Number(value) || 0);
}

function roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatQuantity(value: number): string {
    return Number(value || 0).toLocaleString("pt-BR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 4
    });
}

function normalizeText(value: string | null | undefined): string {
    return String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("pt-BR")
        .trim();
}

function formatDate(value: string): string {
    const date = new Date(String(value ?? "").replace(" ", "T"));
    if (Number.isNaN(date.getTime())) return String(value ?? "");

    const datePart = date.toLocaleDateString("pt-BR");
    const timePart = date.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
    });

    return `${datePart} ${timePart}`;
}

/**
 * Calcula os totais do documento interno. Como o banco não armazena
 * desconto e acréscimo históricos em campos separados, o acréscimo é
 * inferido somente para pagamento identificado como crédito parcelado.
 */
function calculateBudgetTotals(budget: BudgetRow, items: BudgetItemRow[]): BudgetTotals {
    const subtotal = roundMoney(items.reduce(
        (total, item) => total + (Number(item.total_value) || 0),
        0
    ));
    const total = roundMoney(Number(budget.total_value) || 0);
    const isCreditPayment = normalizeText(budget.method_name).includes("credito");
    const hasInstallments = Number(budget.installment_count) > 0;
    const installmentSurcharge = isCreditPayment && hasInstallments
        ? Math.max(0, roundMoney(total - subtotal))
        : 0;
    const totalBeforeSurcharge = roundMoney(total - installmentSurcharge);
    const discount = Math.max(0, roundMoney(subtotal - totalBeforeSurcharge));

    return { subtotal, discount, installmentSurcharge, total };
}

function getBudget(budgetId: number): BudgetRow | undefined {
    return sqlite.prepare(`
        SELECT
            b.id,
            CAST(b.total_value AS REAL) AS total_value,
            b.dt_budget AS dt_budget,
            cl.name AS client_name,
            cl.address AS client_address,
            cl.number AS client_number,
            cl.complement AS client_complement,
            cl.neighborhood AS client_neighborhood,
            cl.city AS client_city,
            cl.state AS client_state,
            cl.zip_code AS client_zip_code,
            NULL AS method_name,
            NULL AS installment_count
        FROM budget b
        LEFT JOIN clients cl ON cl.id = b.client_id
        WHERE b.id = ?
        LIMIT 1
    `).get(budgetId) as BudgetRow | undefined;
}

/** Materiais vinculados aos serviços são mostrados apenas no PDF A4. */
function getServiceMaterials(serviceId: number): ServiceMaterialRow[] {
    const materials = sqlite.prepare(`
        SELECT
            p.id AS product_id,
            p.name,
            p.description,
            CAST(COALESCE(ss.qunt, 0) AS REAL) AS quantity_per_service,
            COALESCE(um.unity, 'UN') AS unit_measure
        FROM stock_service ss
        INNER JOIN products p ON p.id = ss.product_id
        LEFT JOIN un_measure um ON um.id = p.unit_id
        WHERE ss.service_id = ?
        ORDER BY p.name COLLATE NOCASE ASC
    `).all(serviceId) as ServiceMaterialRow[];

    return materials.map((material) => ({
        ...material,
        quantity_per_service: Number(material.quantity_per_service) || 0
    }));
}

function getBudgetItems(budgetId: number): BudgetItemRow[] {
    const items = sqlite.prepare(`
        SELECT
            sb.id,
            sb.product_id,
            sb.service_id,
            COALESCE(p.name, s.name, 'Item não identificado') AS name,
            COALESCE(p.description, s.description, '') AS description,
            sb.qunt_sale AS quantity,
            COALESCE(sb.unit_measure, 'UN') AS unit_measure,
            CAST(COALESCE(NULLIF(sb.value, ''), p.value, s.cost, 0) AS REAL) AS unit_value,
            CAST(COALESCE(NULLIF(sb.value, ''), p.value, s.cost, 0) AS REAL) * sb.qunt_sale AS total_value
        FROM stock_budget sb
        LEFT JOIN products p ON p.id = sb.product_id
        LEFT JOIN services s ON s.id = sb.service_id
        WHERE sb.budget_id = ?
        ORDER BY sb.id
    `).all(budgetId) as BudgetItemRow[];

    return items.map((item) => item.service_id !== null && item.service_id !== undefined
        ? { ...item, materials: getServiceMaterials(item.service_id) }
        : { ...item, materials: [] }
    );
}

function getCompany(): CompanyRow | undefined {
    return sqlite.prepare(`
        SELECT
            cnpj,
            legal_name,
            trade_name,
            address,
            number,
            complement,
            neighborhood,
            city,
            state,
            zip_code
        FROM company
        ORDER BY id
        LIMIT 1
    `).get() as CompanyRow | undefined;
}

function getBudgetConditions(budget: BudgetRow): PaymentRow[] {
    return [{
        method_name: budget.method_name,
        installment_count: budget.installment_count,
        total_value: Number(budget.total_value) || 0
    }];
}

function getCompanyAddress(company?: CompanyRow): string {
    if (!company) return "";
    return [
        company.address,
        company.number,
        company.complement,
        company.neighborhood,
        company.city,
        company.state,
        company.zip_code
    ].filter(Boolean).join(", ");
}

function getCustomerAddress(budget: BudgetRow): string {
    return [
        budget.client_address,
        budget.client_number,
        budget.client_complement,
        budget.client_neighborhood,
        budget.client_city,
        budget.client_state,
        budget.client_zip_code
    ].filter(Boolean).join(", ");
}

/** Gera um PDF em memória e envia os bytes ao cliente. */
function sendPdf(
    reply: any,
    fileName: string,
    build: (doc: PDFDocument.PDFDocument) => void,
    options: PdfOptions = {}
): Promise<void> {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            size: options.size ?? "A4",
            margins: {
                top: options.margins?.top ?? PAGE.top,
                bottom: options.margins?.bottom ?? PAGE.bottom,
                left: options.margins?.left ?? PAGE.left,
                right: options.margins?.right ?? PAGE.right
            },
            bufferPages: false,
            compress: true,
            info: {
                Title: fileName.replace(/\.pdf$/i, ""),
                Author: "Sistema POS"
            }
        });

        const chunks: Buffer[] = [];
        let settled = false;

        const fail = (error: Error) => {
            if (settled) return;
            settled = true;
            reject(error);
        };

        doc.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
        doc.on("error", (error: Error) => fail(error));
        doc.on("end", () => {
            if (settled) return;
            try {
                const pdf = Buffer.concat(chunks);
                if (pdf.length < 5 || pdf.subarray(0, 5).toString("ascii") !== "%PDF-") {
                    fail(new Error("O PDF gerado é inválido ou está vazio."));
                    return;
                }
                settled = true;
                reply
                    .header("Content-Type", "application/pdf")
                    .header("Content-Disposition", `inline; filename="${fileName}"`)
                    .header("Content-Length", String(pdf.length))
                    .send(pdf);
                resolve();
            } catch (error) {
                fail(error instanceof Error ? error : new Error("Erro ao enviar o PDF."));
            }
        });

        try {
            build(doc);
            doc.end();
        } catch (error) {
            doc.destroy(error instanceof Error ? error : new Error("Erro ao gerar PDF."));
        }
    });
}

function drawBudgetHeader(
    doc: PDFDocument.PDFDocument,
    budget: BudgetRow,
    company?: CompanyRow
) {
    const companyName = company?.trade_name || company?.legal_name || "Documento de orçamento";
    const pageWidth = doc.page.width - PAGE.left - PAGE.right;

    doc.fillColor(COLORS.black).font("Helvetica-Bold").fontSize(15)
        .text(companyName, PAGE.left, PAGE.top, { width: pageWidth });

    let y = doc.y + 3;
    const companyAddress = getCompanyAddress(company);
    if (companyAddress) {
        doc.fillColor(COLORS.gray).font("Helvetica").fontSize(9)
            .text(companyAddress, PAGE.left, y, { width: pageWidth });
        y = doc.y + 8;
    }

    if(budget.client_name && budget.client_name != ""){doc.fillColor(COLORS.black).font("Helvetica-Bold").fontSize(10)
        .text("Cliente: ", PAGE.left, y, { continued: true });
    doc.font("Helvetica").text(budget.client_name || "Consumidor");
    y = doc.y + 2;}

    const customerAddress = getCustomerAddress(budget);
    if (customerAddress) {
        doc.fillColor(COLORS.gray).font("Helvetica").fontSize(9)
            .text(`Endereço: ${customerAddress}`, PAGE.left, y, { width: pageWidth });
        y = doc.y + 2;
    }

    doc.fillColor(COLORS.gray).font("Helvetica").fontSize(9)
        .text(`Orçamento nº ${budget.id}  |  Data: ${formatDate(budget.dt_budget)}`, PAGE.left, y, { width: pageWidth });
    doc.fillColor(COLORS.black);
    doc.y += 12;
}

function drawBudgetItems(
    doc: PDFDocument.PDFDocument,
    items: BudgetItemRow[],
    title: "Lista de Produtos" | "Lista de Serviços"
) {
    if (!items.length) return;

    const x = PAGE.left;
    const width = doc.page.width - PAGE.left - PAGE.right;
    const paddingX = 6;
    const paddingY = 7;
    const headerHeight = 35;
    const minimumRowHeight = 30;
    const columns = [
        { title: "#", width: 28, align: "left" as const },
        { title: `${items.some(item => item.product_id)?'Produto':'Serviço'}`, width: 169, align: "left" as const },
        { title: "Descrição", width: 239, align: "left" as const },
        { title: "Un.", width: 42, align: "center" as const },
        { title: "Qtde", width: 70, align: "right" as const },
        { title: "V. Unit.", width: 77, align: "right" as const },
        { title: "V. Total", width: 78, align: "right" as const }
    ];
    const originalTotal = columns.reduce((sum, column) => sum + column.width, 0);
    columns.forEach((column) => { column.width = (column.width / originalTotal) * width; });

    function drawCell(
        text: string,
        columnX: number,
        rowY: number,
        columnWidth: number,
        rowHeight: number,
        options: { bold?: boolean; align?: "left" | "right" | "center"; background?: string; fontSize?: number } = {}
    ) {
        if (options.background) {
            doc.rect(columnX, rowY, columnWidth, rowHeight).fill(options.background);
        }
        doc.rect(columnX, rowY, columnWidth, rowHeight)
            .lineWidth(0.6).strokeColor(COLORS.border).stroke();
        doc.fillColor(COLORS.black)
            .font(options.bold ? "Helvetica-Bold" : "Helvetica")
            .fontSize(options.fontSize ?? 9)
            .text(text, columnX + paddingX, rowY + paddingY, {
                width: Math.max(1, columnWidth - paddingX * 2),
                height: Math.max(1, rowHeight - paddingY * 2),
                align: options.align ?? "left",
                ellipsis: true,
                lineBreak: true
            });
    }

    function drawHeader(y: number) {
        let columnX = x;
        columns.forEach((column) => {
            drawCell(column.title, columnX, y, column.width, headerHeight, {
                bold: true,
                align: column.align,
                background: COLORS.header,
                fontSize: 9
            });
            columnX += column.width;
        });
    }

    function ensureTableSpace(y: number, rowHeight: number): number {
        if (y + rowHeight <= doc.page.height - PAGE.bottom) return y;
        doc.addPage();
        drawHeader(PAGE.top);
        return PAGE.top + headerHeight;
    }

    function drawNestedMaterialList(item: BudgetItemRow, startY: number): number {
        const materials = item.materials ?? [];
        if (item.service_id == null || materials.length === 0) return startY;
        let y = startY;
        const titleHeight = 24;
        y = ensureTableSpace(y, titleHeight);
        doc.rect(x, y, width, titleHeight).fillAndStroke(COLORS.nested, COLORS.border);
        doc.fillColor(COLORS.black).font("Helvetica-Bold").fontSize(8)
            .text("Produtos vinculados ao serviço", x + paddingX + 8, y + 7, {
                width: width - paddingX * 2 - 16,
                height: titleHeight - 10,
                ellipsis: true
            });
        y += titleHeight;

        materials.forEach((material) => {
            const perService = Number(material.quantity_per_service) || 0;
            const totalQuantity = perService * (Number(item.quantity) || 0);
            const unit = material.unit_measure || "UN";
            const text = `- ${material.name || "Produto não identificado"}: ${formatQuantity(perService)} ${unit} por serviço (total: ${formatQuantity(totalQuantity)} ${unit})`;
            doc.font("Helvetica").fontSize(8);
            const textHeight = doc.heightOfString(text, { width: width - paddingX * 2 - 20 });
            const rowHeight = Math.max(23, textHeight + paddingY);
            y = ensureTableSpace(y, rowHeight);
            doc.rect(x, y, width, rowHeight).fillAndStroke(COLORS.nested, COLORS.border);
            doc.fillColor(COLORS.gray).font("Helvetica").fontSize(8)
                .text(text, x + paddingX + 12, y + 5, {
                    width: width - paddingX * 2 - 20,
                    height: rowHeight - 7
                });
            y += rowHeight;
        });
        return y;
    }

    let y = doc.y + 4;
    if (y + 20 + headerHeight + minimumRowHeight > doc.page.height - PAGE.bottom) {
        doc.addPage();
        y = PAGE.top;
    }
    doc.fillColor(COLORS.black).font("Helvetica-Bold").fontSize(11).text(title, x, y);
    y = doc.y + 8;
    if (y + headerHeight + minimumRowHeight > doc.page.height - PAGE.bottom) {
        doc.addPage();
        y = PAGE.top;
    }
    drawHeader(y);
    y += headerHeight;

    items.forEach((item, index) => {
        const name = item.name || "Item não identificado";
        const description = item.description || "";
        doc.font("Helvetica").fontSize(9);
        const nameHeight = doc.heightOfString(name, { width: columns[1]!.width - paddingX * 2 });
        const descriptionHeight = doc.heightOfString(description, { width: columns[2]!.width - paddingX * 2 });
        const rowHeight = Math.max(minimumRowHeight, Math.max(nameHeight, descriptionHeight) + paddingY * 2);
        y = ensureTableSpace(y, rowHeight);
        const values = [
            String(index + 1), name, description, item.unit_measure || "UN",
            formatQuantity(Number(item.quantity) || 0), money(item.unit_value), money(item.total_value)
        ];
        let columnX = x;
        columns.forEach((column, columnIndex) => {
            drawCell(values[columnIndex] ?? "", columnX, y, column.width, rowHeight, {
                align: column.align,
                fontSize: 9
            });
            columnX += column.width;
        });
        y += rowHeight;
        y = drawNestedMaterialList(item, y);
    });
    doc.y = y + 12;
}

function drawBudgetTotals(doc: PDFDocument.PDFDocument, budget: BudgetRow, items: BudgetItemRow[]) {
    const totals = calculateBudgetTotals(budget, items);
    const totalsWidth = 280;
    const labelWidth = 202;
    const valueWidth = totalsWidth - labelWidth;
    const x = doc.page.width - PAGE.right - totalsWidth;



    const rows: Array<{ label: string; value: string; bold: boolean }> = [
        { label: `${`Total ${items.some(item => item.product_id)?"Produtos":""} ${items.some(item => item.product_id && item.service_id)?"/":""} ${items.some(item => item.service_id)?"Serviços":""}`}`, value: money(totals.subtotal), bold: false }
    ];
    if (totals.discount > 0) rows.push({ label: "Descontos", value: money(totals.discount), bold: false });
    if (totals.installmentSurcharge > 0) {
        rows.push({
            label: budget.installment_count ? `Acréscimo estimado do crédito (${budget.installment_count}x)` : "Acréscimo estimado do crédito",
            value: money(totals.installmentSurcharge),
            bold: false
        });
    }
    rows.push({ label: "Valor Total", value: money(totals.total), bold: true });

    const rowHeight = 31;
    let y = doc.y;
    if (y + rows.length * rowHeight > doc.page.height - PAGE.bottom) {
        doc.addPage();
        y = PAGE.top;
    }
    rows.forEach((row) => {
        doc.rect(x, y, labelWidth, rowHeight).lineWidth(0.6).strokeColor(COLORS.border).stroke();
        doc.rect(x + labelWidth, y, valueWidth, rowHeight).lineWidth(0.6).strokeColor(COLORS.border).stroke();
        doc.fillColor(COLORS.black).font(row.bold ? "Helvetica-Bold" : "Helvetica").fontSize(9)
            .text(row.label, x + 7, y + 9, { width: labelWidth - 14, height: rowHeight - 12, ellipsis: true });
        doc.text(row.value, x + labelWidth + 5, y + 9, {
            width: valueWidth - 12,
            align: "right",
            height: rowHeight - 12
        });
        y += rowHeight;
    });
    doc.y = y + 20;
}

function drawPayments(doc: PDFDocument.PDFDocument, payments: PaymentRow[]) {
    const x = PAGE.left;
    const width = doc.page.width - PAGE.left - PAGE.right;
    const columns = [
        { title: "Condição", width: width * 0.46 },
        payments.some(item => item.installment_count)?{ title: "Parcelas previstas", width: width * 0.110 } : { title: "", width: width * 0.110 },
        { title: "Valor", width: width * 0.435 }
    ];
    const headerHeight = 35;
    const rowHeight = 32;
    const padding = 8;
    let y = doc.y;
    const footerY = doc.page.height - PAGE.bottom - 112;
    if (y < footerY) y = footerY;
    if (y + 24 + headerHeight + rowHeight > doc.page.height - PAGE.bottom) {
        doc.addPage();
        y = PAGE.top;
    }

    doc.fillColor(COLORS.black).font("Helvetica-Bold").fontSize(10).text("Condição estimada", x, y);
    y = doc.y + 10;
    let columnX = x;
    columns.forEach((column, index) => {
        doc.rect(columnX, y, column.width, headerHeight).fillAndStroke(COLORS.header, COLORS.border);
        doc.fillColor(COLORS.black).font("Helvetica-Bold").fontSize(9)
            .text(column.title, columnX + padding, y + 10, {
                width: column.width - padding * 2,
                align: index === 2 ? "right" : "left"
            });
        columnX += column.width;
    });
    y += headerHeight;

    const rows = payments.length ? payments : [{ method_name: "Não informado", installment_count: null, total_value: 0 }];
    rows.forEach((payment) => {
        const values = [
            payment.method_name || "Não informada",
            payment.installment_count ? `${payment.installment_count}x (estimativa)` : "",
            money(payment.total_value)
        ];
        let rowX = x;
        columns.forEach((column, index) => {
            doc.rect(rowX, y, column.width, rowHeight).lineWidth(0.6).strokeColor(COLORS.border).stroke();
            doc.fillColor(COLORS.black).font("Helvetica").fontSize(9)
                .text(values[index] ?? "", rowX + padding, y + 9, {
                    width: column.width - padding * 2,
                    height: rowHeight - 12,
                    align: index === 2 ? "right" : "left",
                    ellipsis: true
                });
            rowX += column.width;
        });
        y += rowHeight;
    });
    doc.y = y + 20;
}

function drawBudgetPdf(
    doc: PDFDocument.PDFDocument,
    budget: BudgetRow,
    items: BudgetItemRow[],
    company: CompanyRow | undefined,
    payments: PaymentRow[]
) {
    drawBudgetHeader(doc, budget, company);
    const products = items.filter((item) => item.product_id !== null && item.product_id !== undefined);
    const services = items.filter((item) => item.service_id !== null && item.service_id !== undefined);
    if (products.length) drawBudgetItems(doc, products, "Lista de Produtos");
    if (services.length) drawBudgetItems(doc, services, "Lista de Serviços");
    drawBudgetTotals(doc, budget, items);
    drawPayments(doc, payments);
}

/** Comprovante térmico de orçamento com largura equivalente a 58 mm. */
function drawBudgetCouponPdf(
    doc: PDFDocument.PDFDocument,
    budget: BudgetRow,
    items: BudgetItemRow[],
    company?: CompanyRow
) {
    const x = COUPON_MARGIN;
    const width = COUPON_CONTENT_WIDTH;
    let y = COUPON_MARGIN;

    function drawText(
        value: string,
        options: { font?: "Helvetica" | "Helvetica-Bold"; size?: number; align?: "left" | "center" | "right"; gap?: number } = {}
    ) {
        const font = options.font ?? "Helvetica";
        const size = options.size ?? 8;
        const gap = options.gap ?? 2;
        const align = options.align ?? "left";
        doc.font(font).fontSize(size);
        const height = doc.heightOfString(value, { width, align, lineGap: 0 });
        doc.text(value, x, y, { width, align, lineGap: 0 });
        y += height + gap;
    }

    function drawSeparator() {
        doc.save().moveTo(x, y).lineTo(x + width, y).lineWidth(0.5)
            .strokeColor("#999999").dash(2, { space: 2 }).stroke().undash().restore();
        y += 8;
    }

    function drawSummaryLine(
        label: string,
        value: string,
        options: { bold?: boolean; size?: number; gap?: number } = {}
    ) {
        const font = options.bold ? "Helvetica-Bold" : "Helvetica";
        const size = options.size ?? 8;
        const gap = options.gap ?? 4;
        doc.font(font).fontSize(size);
        const valueWidth = doc.widthOfString(value);
        const availableLabelWidth = Math.max(1, width - valueWidth - 5);
        const labelHeight = doc.heightOfString(label, { width: availableLabelWidth });
        const rowHeight = Math.max(labelHeight, doc.currentLineHeight());
        doc.font(font).fontSize(size).text(label, x, y, { width: availableLabelWidth, lineGap: 0 });
        doc.font(font).fontSize(size).text(value, x + width - valueWidth, y, {
            width: valueWidth,
            align: "right",
            lineBreak: false
        });
        y += rowHeight + gap;
    }

    function drawBudgetCouponPdfItem(item: BudgetItemRow, index: number) {
        const itemName = item.name || "Item não identificado";
        const description = item.description || "";
        const quantity = Number(item.quantity) || 0;
        const unitPrice = Number(item.unit_value) || 0;
        const total = Number(item.total_value) || 0;
        const unit = item.unit_measure || "UN";
        const itemType = item.service_id != null ? "Serviço" : "Produto";
        drawText(`${index + 1}. ${itemName} (${itemType})`, {
            font: "Helvetica-Bold",
            size: 8,
            gap: 2
        });
        if (description.trim()) drawText(description.trim(), { size: 7.5, gap: 3 });
        drawSummaryLine(`${formatQuantity(quantity)} ${unit} × ${currency(unitPrice)}`, currency(total), {
            size: 7.5,
            gap: 5
        });
        drawSeparator();
    }

    const companyName = company?.trade_name || company?.legal_name || "Empresa não configurada";
    drawText(companyName.toLocaleUpperCase("pt-BR"), {
        font: "Helvetica-Bold",
        size: 10,
        align: "center",
        gap: 3
    });
    if (company?.trade_name && company?.legal_name && company.trade_name !== company.legal_name) {
        drawText(company.legal_name, { size: 7.5, align: "center" });
    }
    const companyAddress = getCompanyAddress(company);
    if (companyAddress) drawText(companyAddress, { size: 7.5, align: "center" });
    drawSeparator();
    drawText("ORÇAMENTO COMERCIAL", {
        font: "Helvetica-Bold",
        size: 10,
        align: "center",
        gap: 2
    });

    drawText(`Orçamento nº ${budget.id}`, { size: 8 });
    drawText(`Data: ${formatDate(budget.dt_budget)}`, { size: 8 });
    if(budget.client_name && budget.client_name != ""){drawText(`Cliente: ${budget.client_name || "Consumidor não identificado"}`, { size: 8 });}
    const customerAddress = getCustomerAddress(budget);
    if (customerAddress) drawText(`Endereço: ${customerAddress}`, { size: 7.5 });
    drawSeparator();
    drawText("ITENS DO ORÇAMENTO", { font: "Helvetica-Bold", size: 8.5, gap: 5 });
    items.forEach((item, index) => drawBudgetCouponPdfItem(item, index));
    if (!items.length) {
        drawText("Nenhum item encontrado.", { size: 8 });
        drawSeparator();
    }

    const totals = calculateBudgetTotals(budget, items);
    drawSummaryLine("Subtotal", currency(totals.subtotal));
    if (totals.discount > 0) drawSummaryLine("Desconto", `-${currency(totals.discount)}`);
    if (totals.installmentSurcharge > 0) {
        const label = budget.installment_count
            ? `Acréscimo estimado crédito (${budget.installment_count}x)`
            : "Acréscimo estimado crédito";
        drawSummaryLine(label, currency(totals.installmentSurcharge), { size: 7.5 });
    }
    y += 3;
    drawSeparator();
    drawSummaryLine("TOTAL", currency(totals.total), { bold: true, size: 11, gap: 5 });
    drawSeparator();

    drawText("CONDIÇÃO ESTIMADA", { font: "Helvetica-Bold", size: 8.5, gap: 4 });
    drawText(`Condição: ${budget.method_name || "Não informada"}`, { size: 8 });
    if (Number(budget.installment_count) > 0) {
        drawText(`Parcelamento previsto: ${budget.installment_count}x`, { size: 8 });
    }
    y += 5;
    drawText("Obrigado pela preferência!", { font: "Helvetica-Bold", size: 8.5, align: "center", gap: 4 });
    drawText("eight.cs development", { size: 7.5, align: "center", gap: 3 });
    drawText("Documento para controle interno.", { size: 7, align: "center" });
    doc.y = y + COUPON_MARGIN;
}

/** Mede a altura necessária para o comprovante térmico caber em uma página. */
function estimateBudgetCouponHeight(
    budget: BudgetRow,
    items: BudgetItemRow[],
    company?: CompanyRow
): number {
    const measureDoc = new PDFDocument({
        size: [COUPON_WIDTH, MAX_COUPON_HEIGHT],
        margins: {
            top: COUPON_MARGIN,
            bottom: COUPON_MARGIN,
            left: COUPON_MARGIN,
            right: COUPON_MARGIN
        },
        compress: true
    });
    measureDoc.on("data", () => undefined);
    measureDoc.on("error", () => undefined);
    drawBudgetCouponPdf(measureDoc, budget, items, company);
    const measuredHeight = measureDoc.y + COUPON_MARGIN + 12;
    measureDoc.end();

    if (!Number.isFinite(measuredHeight) || measuredHeight <= 0) {
        throw new Error("Não foi possível calcular o tamanho do comprovante.");
    }
    if (measuredHeight > MAX_COUPON_HEIGHT) {
        throw new Error("O comprovante ultrapassa a altura máxima permitida para uma página PDF.");
    }
    return Math.max(180, Math.ceil(measuredHeight));
}

async function budget(fastify: FastifyInstance) {
    fastify.get(
        "/budget",
        { onRequest: [fastify.authenticate] },
        async (request, reply) => {
            try {
                const budgets = sqlite.prepare(`
                    SELECT
                        b.id,
                        CAST(b.total_value AS REAL) AS total_value,
                        b.dt_budget,
                        b.client_id,
                        cl.name AS client_name,
                        (
                            SELECT COUNT(*)
                            FROM stock_budget sb
                            WHERE sb.budget_id = b.id
                        ) AS item_count
                    FROM budget b
                    LEFT JOIN clients cl ON cl.id = b.client_id
                    ORDER BY b.id DESC
                `).all() as Array<{
                    id: number;
                    total_value: number;
                    dt_budget: string;
                    client_id: number | null;
                    client_name: string | null;
                    item_count: number;
                }>;

                return reply.code(200).send({
                    message: "Orçamentos carregados com sucesso.",
                    data: budgets.map((budget) => ({
                        ...budget,
                        total_value: Number(budget.total_value) || 0,
                        item_count: Number(budget.item_count) || 0
                    }))
                });
            } catch (error) {
                request.log.error({ err: error }, "Erro ao listar orçamentos");
                return reply.code(500).send({
                    message: "Não foi possível carregar os orçamentos."
                });
            }
        }
    );

    fastify.get(
        "/budget/:budgetId/pdf",
        { onRequest: [fastify.authenticate] },
        async (request, reply) => {
            const { budgetId: rawId } = request.params as { budgetId: string };
            const budgetId = Number(rawId);
            if (!Number.isSafeInteger(budgetId) || budgetId <= 0) {
                return reply.code(400).send({ message: "Identificador do orçamento inválido." });
            }

            const budget = getBudget(budgetId);
            if (!budget) {
                return reply.code(404).send({ message: "Orçamento não encontrado." });
            }

            // A condição de pagamento é apenas estimativa e não é armazenada na
            // tabela budget. A tela de conclusão envia esses metadados opcionais
            // para que o documento recém-gerado reflita a estimativa mostrada.
            const query = request.query as {
                paymentMethodName?: string;
                installmentCount?: string | number;
            };
            if (typeof query.paymentMethodName === "string") {
                budget.method_name = query.paymentMethodName.slice(0, 80);
            }
            const installmentCount = Number(query.installmentCount);
            if (Number.isSafeInteger(installmentCount) && installmentCount > 0 && installmentCount <= 48) {
                budget.installment_count = installmentCount;
            }

            try {
                const items = getBudgetItems(budgetId);
                const company = getCompany();
                const paymentRows = getBudgetConditions(budget);

                return sendPdf(
                    reply,
                    `orcamento-${budgetId}.pdf`,
                    (doc) => drawBudgetPdf(doc, budget, items, company, paymentRows)
                );
            } catch (error) {
                request.log.error({ err: error, budgetId }, "Erro ao gerar PDF do orçamento");
                return reply.code(500).send({
                    message: "Não foi possível gerar o PDF do orçamento."
                });
            }
        }
    );

    fastify.get(
        "/budget/:budgetId",
        { onRequest: [fastify.authenticate] },
        async (request, reply) => {
            const { budgetId: rawId } = request.params as { budgetId: string };
            const budgetId = Number(rawId);
            if (!Number.isSafeInteger(budgetId) || budgetId <= 0) {
                return reply.code(400).send({ message: "ID do orçamento inválido." });
            }

            try {
                const detail = sqlite.prepare(`
                    SELECT
                        b.id,
                        CAST(b.total_value AS REAL) AS total_value,
                        b.dt_budget,
                        b.client_id,
                        cl.name AS client_name,
                        cl.cpf AS client_cpf,
                        cl.cnpj AS client_cnpj,
                        cl.address AS client_address,
                        cl.number AS client_number,
                        cl.complement AS client_complement,
                        cl.neighborhood AS client_neighborhood,
                        cl.city AS client_city,
                        cl.state AS client_state,
                        cl.zip_code AS client_zip_code
                    FROM budget b
                    LEFT JOIN clients cl ON cl.id = b.client_id
                    WHERE b.id = ?
                    LIMIT 1
                `).get(budgetId) as {
                    id: number;
                    total_value: number;
                    dt_budget: string;
                    client_id: number | null;
                    client_name: string | null;
                    client_cpf: string | null;
                    client_cnpj: string | null;
                    client_address: string | null;
                    client_number: string | null;
                    client_complement: string | null;
                    client_neighborhood: string | null;
                    client_city: string | null;
                    client_state: string | null;
                    client_zip_code: string | null;
                } | undefined;

                if (!detail) {
                    return reply.code(404).send({ message: "Orçamento não encontrado." });
                }

                const items = getBudgetItems(budgetId);
                return reply.code(200).send({
                    message: "Orçamento carregado com sucesso.",
                    data: {
                        ...detail,
                        total_value: Number(detail.total_value) || 0,
                        customer: detail.client_id === null ? null : {
                            name: detail.client_name,
                            cpf: detail.client_cpf,
                            cnpj: detail.client_cnpj,
                            address: detail.client_address,
                            number: detail.client_number,
                            complement: detail.client_complement,
                            neighborhood: detail.client_neighborhood,
                            city: detail.client_city,
                            state: detail.client_state,
                            zip_code: detail.client_zip_code
                        },
                        company: getCompany() ?? null,
                        items: items.map((item) => ({
                            ...item,
                            unit_value: Number(item.unit_value) || 0,
                            quantity: Number(item.quantity) || 0,
                            total_value: Number(item.total_value) || 0,
                            item_type: item.service_id != null ? "service" : item.product_id != null ? "product" : "unknown"
                        }))
                    }
                });
            } catch (error) {
                request.log.error({ err: error, budgetId }, "Erro ao carregar orçamento");
                return reply.code(500).send({
                    message: "Não foi possível carregar o orçamento."
                });
            }
        }
    );
}

module.exports = budget;
