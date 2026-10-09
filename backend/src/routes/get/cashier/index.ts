import type { FastifyInstance } from "fastify";
import PDFDocument = require("pdfkit");
import fs = require("node:fs");

const { sqlite } = require("../../../db/index");

declare namespace PDFDocument {
    export type PDFDocument = InstanceType<typeof import("pdfkit")>;
}

type SaleRow = {
    id: number;
    total_value: number;
    dt_sale: string;
    client_name: string | null;
    client_tax_id: string | null;
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

type SaleItemRow = {
    id: number;
    product_id: number | null;
    service_id: number | null;
    name: string;
    description: string | null;
    quantity: number;
    unit_measure: string;
    unit_value: number;
    total_value: number;
    ncm: string | null;
    sm_code: string | null;
    bar_code: string | null;
    materials?: ServiceMaterialRow[];
};

type CompanyRow = {
    cnpj: string;
    legal_name: string;
    trade_name: string | null;
    state_registration: string;
    address: string;
    number: string;
    complement: string | null;
    neighborhood: string;
    city: string;
    state: string;
    zip_code: string;
};

type InvoiceRow = {
    id: number;
    sale_id: number;
    number: number;
    status: string;
    access_key: string | null;
    xml_authorized: string | null;
    authorized_at: string | null;
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

type SaleTotals = {
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
    white: "#FFFFFF"
};

const PAGE = {
    left: 45,
    right: 45,
    top: 45,
    bottom: 45
};

// Largura física do cupom térmico: 58 mm.
const COUPON_WIDTH = (58 * 72) / 25.4;

// Margens equivalentes ao modelo visual do JavaScript: 3 mm.
const COUPON_MARGIN = (3 * 72) / 25.4;

const COUPON_CONTENT_WIDTH =
    COUPON_WIDTH - COUPON_MARGIN * 2;

const MAX_COUPON_HEIGHT = 14_400;

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
});

function money(
    value: number | string | null | undefined
): string {
    return (Number(value) || 0).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function currency(
    value: number | string | null | undefined
): string {
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

function normalizeText(
    value: string | null | undefined
): string {
    return String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("pt-BR")
        .trim();
}

function formatDate(value: string): string {
    const date = new Date(value.replace(" ", "T"));

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    const datePart = date.toLocaleDateString("pt-BR");

    const timePart = date.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
    });

    return `${datePart} ${timePart}`;
}

/**
 * Calcula o resumo financeiro utilizado nos PDFs.
 *
 * O acréscimo é inferido da diferença entre o total registrado
 * e o subtotal dos itens, mas somente é exibido como acréscimo
 * de crédito quando o pagamento é identificado como crédito
 * parcelado.
 *
 * O banco apresentado não possui um campo histórico separado
 * para o acréscimo e o desconto. Por isso, não é possível
 * recuperar com certeza todos os componentes de preço antigos.
 */
function calculateSaleTotals(
    sale: SaleRow,
    items: SaleItemRow[]
): SaleTotals {
    const subtotal = roundMoney(
        items.reduce(
            (total, item) =>
                total + (Number(item.total_value) || 0),
            0
        )
    );

    const total = roundMoney(
        Number(sale.total_value) || 0
    );

    const isCreditPayment =
        normalizeText(sale.method_name).includes("credito");

    const hasInstallments =
        Number(sale.installment_count) > 0;

    const installmentSurcharge =
        isCreditPayment && hasInstallments
            ? Math.max(0, roundMoney(total - subtotal))
            : 0;

    const totalBeforeSurcharge = roundMoney(
        total - installmentSurcharge
    );

    const discount = Math.max(
        0,
        roundMoney(subtotal - totalBeforeSurcharge)
    );

    return {
        subtotal,
        discount,
        installmentSurcharge,
        total
    };
}

function getSale(
    saleId: number
): SaleRow | undefined {
    return sqlite.prepare(`
        SELECT
            c.id,
            c.total_value,
            c.dt_sale,

            COALESCE(
                c.customer_name,
                cl.name
            ) AS client_name,

            COALESCE(
                c.customer_tax_id,
                cl.cpf,
                cl.cnpj
            ) AS client_tax_id,

            cl.address AS client_address,
            cl.number AS client_number,
            cl.complement AS client_complement,
            cl.neighborhood AS client_neighborhood,
            cl.city AS client_city,
            cl.state AS client_state,
            cl.zip_code AS client_zip_code,

            pm.name AS method_name,
            ins.in_installments AS installment_count

        FROM cashier c

        LEFT JOIN clients cl
            ON cl.id = c.client_id

        LEFT JOIN payment_method pm
            ON pm.id = c.method_id

        LEFT JOIN installments ins
            ON ins.id = c.installment_id

        WHERE c.id = ?
    `).get(saleId) as SaleRow | undefined;
}

/**
 * Obtém os produtos que compõem um serviço.
 *
 * Os materiais são utilizados no PDF A4, mas não são impressos
 * individualmente no cupom térmico.
 */
function getServiceMaterials(
    serviceId: number
): ServiceMaterialRow[] {
    const materials = sqlite.prepare(`
        SELECT
            p.id AS product_id,
            p.name,
            p.description,

            CAST(
                COALESCE(ss.qunt, 0)
                AS REAL
            ) AS quantity_per_service,

            COALESCE(
                um.unity,
                'UN'
            ) AS unit_measure

        FROM stock_service ss

        INNER JOIN products p
            ON p.id = ss.product_id

        LEFT JOIN un_measure um
            ON um.id = p.unit_id

        WHERE ss.service_id = ?

        ORDER BY p.name COLLATE NOCASE ASC
    `).all(serviceId) as ServiceMaterialRow[];

    return materials.map((material) => ({
        ...material,
        quantity_per_service:
            Number(material.quantity_per_service) || 0
    }));
}

function getSaleItems(saleId: number): SaleItemRow[] {
    const items = sqlite.prepare(`
        SELECT
            ss.id,
            ss.product_id,
            ss.service_id,

            COALESCE(
                p.name,
                s.name,
                'Item não identificado'
            ) AS name,

            COALESCE(
                p.description,
                s.description,
                ''
            ) AS description,

            ss.qunt_sale AS quantity,

            COALESCE(
                ss.unit_measure,
                'UN'
            ) AS unit_measure,

            CAST(
                COALESCE(
                    ss.value,
                    p.value,
                    s.cost,
                    0
                ) AS REAL
            ) AS unit_value,

            CAST(
                COALESCE(
                    ss.value,
                    p.value,
                    s.cost,
                    0
                ) AS REAL
            ) * ss.qunt_sale AS total_value,

            p.ncm,

            COALESCE(
                p.sm_code,
                s.sm_code
            ) AS sm_code,

            COALESCE(
                p.bar_code,
                s.bar_code
            ) AS bar_code

        FROM stock_sale ss

        LEFT JOIN products p
            ON p.id = ss.product_id

        LEFT JOIN services s
            ON s.id = ss.service_id

        WHERE ss.sale_id = ?

        ORDER BY ss.id
    `).all(saleId) as SaleItemRow[];

    return items.map((item) => {
        if (
            item.service_id !== null &&
            item.service_id !== undefined
        ) {
            return {
                ...item,
                materials: getServiceMaterials(
                    item.service_id
                )
            };
        }

        return {
            ...item,
            materials: []
        };
    });
}

function getCompany(): CompanyRow | undefined {
    return sqlite.prepare(`
        SELECT
            cnpj,
            legal_name,
            trade_name,
            state_registration,
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

function getInvoice(
    saleId: number
): InvoiceRow | undefined {
    return sqlite.prepare(`
        SELECT
            id,
            sale_id,
            number,
            status,
            access_key,
            xml_authorized,
            authorized_at

        FROM fiscal_invoices

        WHERE sale_id = ?

        ORDER BY id DESC

        LIMIT 1
    `).get(saleId) as InvoiceRow | undefined;
}

function getPayments(saleId: number): PaymentRow[] {
    const sale = getSale(saleId);

    if (!sale) {
        return [];
    }

    return [
        {
            method_name: sale.method_name,
            installment_count: sale.installment_count,
            total_value: Number(sale.total_value) || 0
        }
    ];
}

function getCompanyAddress(
    company?: CompanyRow
): string {
    if (!company) {
        return "";
    }

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

function getCustomerAddress(
    sale: SaleRow
): string {
    return [
        sale.client_address,
        sale.client_number,
        sale.client_complement,
        sale.client_neighborhood,
        sale.client_city,
        sale.client_state,
        sale.client_zip_code
    ]
        .filter(Boolean)
        .join(", ");
}

/**
 * Gera um PDF em memória e envia os bytes ao cliente.
 */
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

        function fail(error: Error) {
            if (settled) {
                return;
            }

            settled = true;
            reject(error);
        }

        doc.on("data", (chunk: Buffer) => {
            chunks.push(Buffer.from(chunk));
        });

        doc.on("error", (error: Error) => {
            fail(error);
        });

        doc.on("end", () => {
            if (settled) {
                return;
            }

            try {
                const pdf = Buffer.concat(chunks);

                if (
                    pdf.length < 5 ||
                    pdf.subarray(0, 5).toString("ascii") !== "%PDF-"
                ) {
                    fail(
                        new Error(
                            "O PDF gerado é inválido ou está vazio."
                        )
                    );
                    return;
                }

                settled = true;

                reply
                    .header("Content-Type", "application/pdf")
                    .header(
                        "Content-Disposition",
                        `inline; filename="${fileName}"`
                    )
                    .header("Content-Length", String(pdf.length))
                    .send(pdf);

                resolve();
            } catch (error) {
                fail(
                    error instanceof Error
                        ? error
                        : new Error("Erro ao enviar o PDF.")
                );
            }
        });

        try {
            build(doc);
            doc.end();
        } catch (error) {
            doc.destroy(
                error instanceof Error
                    ? error
                    : new Error("Erro ao gerar PDF.")
            );
        }
    });
}

/**
 * Cabeçalho do PDF A4.
 */
function drawSaleHeader(
    doc: PDFDocument.PDFDocument,
    sale: SaleRow,
    company?: CompanyRow
) {
    const companyName =
        company?.trade_name ||
        company?.legal_name ||
        "Documento de venda";

    doc
        .fillColor(COLORS.black)
        .font("Helvetica-Bold")
        .fontSize(15)
        .text(
            companyName,
            PAGE.left,
            PAGE.top,
            {
                width:
                    doc.page.width -
                    PAGE.left -
                    PAGE.right
            }
        );

    let y = doc.y + 3;

    if (company?.cnpj) {
        doc
            .font("Helvetica")
            .fontSize(9)
            .fillColor(COLORS.gray)
            .text(
                `CNPJ: ${company.cnpj}`,
                PAGE.left,
                y
            );

        y = doc.y + 10;
    }

    doc
        .fillColor(COLORS.black)
        .font("Helvetica-Bold")
        .fontSize(10)
        .text(
            "Destinatário:",
            PAGE.left,
            y,
            { continued: true }
        );

    doc
        .font("Helvetica")
        .text(
            ` ${sale.client_name || "Consumidor"}`
        );

    y = doc.y + 2;

    doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor(COLORS.gray)
        .text(
            `CPF/CNPJ: ${sale.client_tax_id || "Não informado"}`,
            PAGE.left,
            y
        );

    y = doc.y + 2;

    doc.text(
        `Emitida em: ${formatDate(sale.dt_sale)}`,
        PAGE.left,
        y
    );

    doc.fillColor(COLORS.black);
    doc.y += 12;
}

/**
 * Desenha a lista A4 de produtos ou serviços.
 * A sublista de materiais permanece apenas no documento A4.
 */
function drawSaleItems(
    doc: PDFDocument.PDFDocument,
    items: SaleItemRow[],
    title: "Lista de Produtos" | "Lista de Serviços"
) {
    if (items.length === 0) {
        return;
    }

    const x = PAGE.left;
    const width =
        doc.page.width - PAGE.left - PAGE.right;

    const columns = [
        { title: "#", width: 28, align: "left" as const },
        {
            title: "Produto / Serviço",
            width: 169,
            align: "left" as const
        },
        {
            title: "Descrição",
            width: 239,
            align: "left" as const
        },
        {
            title: "Un.",
            width: 42,
            align: "center" as const
        },
        {
            title: "Qtde",
            width: 70,
            align: "right" as const
        },
        {
            title: "V. Unit.",
            width: 77,
            align: "right" as const
        },
        {
            title: "V. Total",
            width: 78,
            align: "right" as const
        }
    ];

    const originalTotal = columns.reduce(
        (sum, column) => sum + column.width,
        0
    );

    columns.forEach((column) => {
        column.width =
            (column.width / originalTotal) * width;
    });

    const paddingX = 6;
    const paddingY = 7;
    const headerHeight = 35;
    const minimumRowHeight = 30;

    function drawCell(
        text: string,
        columnX: number,
        rowY: number,
        columnWidth: number,
        rowHeight: number,
        options: {
            bold?: boolean;
            align?: "left" | "right" | "center";
            background?: string;
            fontSize?: number;
        } = {}
    ) {
        if (options.background) {
            doc
                .rect(
                    columnX,
                    rowY,
                    columnWidth,
                    rowHeight
                )
                .fill(options.background);
        }

        doc
            .rect(
                columnX,
                rowY,
                columnWidth,
                rowHeight
            )
            .lineWidth(0.6)
            .strokeColor(COLORS.border)
            .stroke();

        doc
            .fillColor(COLORS.black)
            .font(
                options.bold
                    ? "Helvetica-Bold"
                    : "Helvetica"
            )
            .fontSize(options.fontSize ?? 9)
            .text(
                text,
                columnX + paddingX,
                rowY + paddingY,
                {
                    width: Math.max(
                        1,
                        columnWidth - paddingX * 2
                    ),
                    height: Math.max(
                        1,
                        rowHeight - paddingY * 2
                    ),
                    align: options.align ?? "left",
                    ellipsis: true,
                    lineBreak: true
                }
            );
    }

    function drawHeader(y: number) {
        let columnX = x;

        columns.forEach((column) => {
            drawCell(
                column.title,
                columnX,
                y,
                column.width,
                headerHeight,
                {
                    bold: true,
                    align: column.align,
                    background: COLORS.header,
                    fontSize: 9
                }
            );

            columnX += column.width;
        });
    }

    function ensureTableSpace(
        y: number,
        rowHeight: number
    ) {
        if (
            y + rowHeight <=
            doc.page.height - PAGE.bottom
        ) {
            return y;
        }

        doc.addPage();

        drawHeader(PAGE.top);

        return PAGE.top + headerHeight;
    }

    function drawNestedMaterialList(
        item: SaleItemRow,
        startY: number
    ): number {
        const materials = item.materials ?? [];

        if (
            item.service_id === null ||
            item.service_id === undefined ||
            materials.length === 0
        ) {
            return startY;
        }

        let y = startY;

        const titleHeight = 24;

        y = ensureTableSpace(y, titleHeight);

        doc
            .rect(x, y, width, titleHeight)
            .fillAndStroke(COLORS.nested, COLORS.border);

        doc
            .fillColor(COLORS.black)
            .font("Helvetica-Bold")
            .fontSize(8)
            .text(
                "Produtos vinculados ao serviço",
                x + paddingX + 8,
                y + 7,
                {
                    width: width - paddingX * 2 - 16,
                    height: titleHeight - 10,
                    ellipsis: true
                }
            );

        y += titleHeight;

        materials.forEach((material) => {
            const perService =
                Number(material.quantity_per_service) || 0;

            const totalQuantity =
                perService * (Number(item.quantity) || 0);

            const unit = material.unit_measure || "UN";

            const materialText =
                `- ${material.name || "Produto não identificado"}: ` +
                `${formatQuantity(perService)} ${unit} por serviço ` +
                `(total: ${formatQuantity(totalQuantity)} ${unit})`;

            doc
                .font("Helvetica")
                .fontSize(8);

            const textHeight = doc.heightOfString(
                materialText,
                {
                    width: width - paddingX * 2 - 20
                }
            );

            const rowHeight = Math.max(
                23,
                textHeight + paddingY
            );

            y = ensureTableSpace(y, rowHeight);

            doc
                .rect(x, y, width, rowHeight)
                .fillAndStroke(COLORS.nested, COLORS.border);

            doc
                .fillColor(COLORS.gray)
                .font("Helvetica")
                .fontSize(8)
                .text(
                    materialText,
                    x + paddingX + 12,
                    y + 5,
                    {
                        width: width - paddingX * 2 - 20,
                        height: rowHeight - 7
                    }
                );

            y += rowHeight;
        });

        return y;
    }

    let y = doc.y + 4;

    if (
        y + 20 + headerHeight + minimumRowHeight >
        doc.page.height - PAGE.bottom
    ) {
        doc.addPage();
        y = PAGE.top;
    }

    doc
        .fillColor(COLORS.black)
        .font("Helvetica-Bold")
        .fontSize(11)
        .text(title, x, y);

    y = doc.y + 8;

    if (
        y + headerHeight + minimumRowHeight >
        doc.page.height - PAGE.bottom
    ) {
        doc.addPage();
        y = PAGE.top;
    }

    drawHeader(y);
    y += headerHeight;

    items.forEach((item, index) => {
        const name =
            item.name || "Item não identificado";

        const description = item.description || "";

        doc
            .font("Helvetica")
            .fontSize(9);

        const nameHeight = doc.heightOfString(name, {
            width: columns[1]!.width - paddingX * 2
        });

        const descriptionHeight = doc.heightOfString(
            description,
            {
                width: columns[2]!.width - paddingX * 2
            }
        );

        const rowHeight = Math.max(
            minimumRowHeight,
            Math.max(nameHeight, descriptionHeight) +
                paddingY * 2
        );

        y = ensureTableSpace(y, rowHeight);

        const values = [
            String(index + 1),
            name,
            description,
            item.unit_measure || "UN",
            formatQuantity(Number(item.quantity) || 0),
            money(item.unit_value),
            money(item.total_value)
        ];

        let columnX = x;

        columns.forEach((column, columnIndex) => {
            drawCell(
                values[columnIndex] ?? "",
                columnX,
                y,
                column.width,
                rowHeight,
                {
                    align: column.align,
                    fontSize: 9
                }
            );

            columnX += column.width;
        });

        y += rowHeight;

        y = drawNestedMaterialList(item, y);
    });

    doc.y = y + 12;
}

/**
 * Resumo financeiro A4.
 */
function drawSaleTotals(
    doc: PDFDocument.PDFDocument,
    sale: SaleRow,
    items: SaleItemRow[]
) {
    const totals = calculateSaleTotals(sale, items);

    const totalsWidth = 280;
    const labelWidth = 202;
    const valueWidth = totalsWidth - labelWidth;
    const x =
        doc.page.width - PAGE.right - totalsWidth;

    const rows: Array<{
        label: string;
        value: string;
        bold: boolean;
    }> = [
        {
            label: "Total Produtos/Serviços",
            value: money(totals.subtotal),
            bold: false
        }
    ];

    if (totals.discount > 0) {
        rows.push({
            label: "Descontos",
            value: money(totals.discount),
            bold: false
        });
    }

    if (totals.installmentSurcharge > 0) {
        rows.push({
            label: sale.installment_count
                ? `Acréscimo do crédito (${sale.installment_count}x)`
                : "Acréscimo do crédito",
            value: money(totals.installmentSurcharge),
            bold: false
        });
    }

    rows.push({
        label: "Valor Total",
        value: money(totals.total),
        bold: true
    });

    const rowHeight = 31;
    let y = doc.y;

    if (
        y + rows.length * rowHeight >
        doc.page.height - PAGE.bottom
    ) {
        doc.addPage();
        y = PAGE.top;
    }

    rows.forEach((row) => {
        doc
            .rect(x, y, labelWidth, rowHeight)
            .lineWidth(0.6)
            .strokeColor(COLORS.border)
            .stroke();

        doc
            .rect(
                x + labelWidth,
                y,
                valueWidth,
                rowHeight
            )
            .lineWidth(0.6)
            .strokeColor(COLORS.border)
            .stroke();

        doc
            .fillColor(COLORS.black)
            .font(row.bold ? "Helvetica-Bold" : "Helvetica")
            .fontSize(9)
            .text(
                row.label,
                x + 7,
                y + 9,
                {
                    width: labelWidth - 14,
                    height: rowHeight - 12,
                    ellipsis: true
                }
            );

        doc.text(
            row.value,
            x + labelWidth + 5,
            y + 9,
            {
                width: valueWidth - 12,
                align: "right",
                height: rowHeight - 12
            }
        );

        y += rowHeight;
    });

    doc.y = y + 20;
}

/**
 * Tabela de pagamentos do PDF A4.
 */
function drawPayments(
    doc: PDFDocument.PDFDocument,
    payments: PaymentRow[]
) {
    const x = PAGE.left;

    const width =
        doc.page.width - PAGE.left - PAGE.right;

    const columns = [
        { title: "Método", width: width * 0.46 },
        { title: "Parcelas", width: width * 0.105 },
        { title: "Valor", width: width * 0.435 }
    ];

    const headerHeight = 35;
    const rowHeight = 32;
    const padding = 8;

    let y = doc.y;

    const footerY =
        doc.page.height - PAGE.bottom - 112;

    if (y < footerY) {
        y = footerY;
    }

    if (
        y + 24 + headerHeight + rowHeight >
        doc.page.height - PAGE.bottom
    ) {
        doc.addPage();
        y = PAGE.top;
    }

    doc
        .fillColor(COLORS.black)
        .font("Helvetica-Bold")
        .fontSize(10)
        .text("Pagamentos", x, y);

    y = doc.y + 10;

    let columnX = x;

    columns.forEach((column, index) => {
        doc
            .rect(
                columnX,
                y,
                column.width,
                headerHeight
            )
            .fillAndStroke(COLORS.header, COLORS.border);

        doc
            .fillColor(COLORS.black)
            .font("Helvetica-Bold")
            .fontSize(9)
            .text(
                column.title,
                columnX + padding,
                y + 10,
                {
                    width: column.width - padding * 2,
                    align: index === 2 ? "right" : "left"
                }
            );

        columnX += column.width;
    });

    y += headerHeight;

    const rows = payments.length
        ? payments
        : [
            {
                method_name: "Não informado",
                installment_count: null,
                total_value: 0
            }
        ];

    rows.forEach((payment) => {
        const values = [
            payment.method_name || "Não informado",
            payment.installment_count
                ? `${payment.installment_count}x`
                : "À vista",
            money(payment.total_value)
        ];

        let rowX = x;

        columns.forEach((column, index) => {
            doc
                .rect(
                    rowX,
                    y,
                    column.width,
                    rowHeight
                )
                .lineWidth(0.6)
                .strokeColor(COLORS.border)
                .stroke();

            doc
                .fillColor(COLORS.black)
                .font("Helvetica")
                .fontSize(9)
                .text(
                    values[index] ?? "",
                    rowX + padding,
                    y + 9,
                    {
                        width: column.width - padding * 2,
                        height: rowHeight - 12,
                        align: index === 2 ? "right" : "left",
                        ellipsis: true
                    }
                );

            rowX += column.width;
        });

        y += rowHeight;
    });

    doc.y = y + 20;
}

/**
 * PDF A4 da venda.
 * Mantém listas separadas e sublistas de materiais dos serviços.
 */
function drawSalePdf(
    doc: PDFDocument.PDFDocument,
    sale: SaleRow,
    items: SaleItemRow[],
    company: CompanyRow | undefined,
    payments: PaymentRow[]
) {
    drawSaleHeader(doc, sale, company);

    const products = items.filter(
        (item) =>
            item.product_id !== null &&
            item.product_id !== undefined
    );

    const services = items.filter(
        (item) =>
            item.service_id !== null &&
            item.service_id !== undefined
    );

    if (products.length > 0) {
        drawSaleItems(
            doc,
            products,
            "Lista de Produtos"
        );
    }

    if (services.length > 0) {
        drawSaleItems(
            doc,
            services,
            "Lista de Serviços"
        );
    }

    drawSaleTotals(doc, sale, items);
    drawPayments(doc, payments);

    doc
        .fillColor(COLORS.gray)
        .font("Helvetica")
        .fontSize(8)
        .text(
            "Gerado por sistema POS - exportado como PDF",
            PAGE.left,
            doc.y
        );
}

/**
 * Cupom térmico de 58 mm.
 *
 * Segue o layout do drawCupon() do frontend:
 * - empresa centralizada;
 * - separadores tracejados;
 * - identificação e dados da venda;
 * - itens com nome, descrição, quantidade, valor unitário e total;
 * - subtotal, descontos, acréscimo e total;
 * - forma de pagamento;
 * - agradecimento e identificação do sistema.
 *
 * Produtos acoplados aos serviços não são exibidos neste cupom.
 */
function drawCoupon(
    doc: PDFDocument.PDFDocument,
    sale: SaleRow,
    items: SaleItemRow[],
    company?: CompanyRow
) {
    const x = COUPON_MARGIN;
    const width = COUPON_CONTENT_WIDTH;

    let y = COUPON_MARGIN;

    function drawText(
        value: string,
        options: {
            font?: "Helvetica" | "Helvetica-Bold";
            size?: number;
            align?: "left" | "center" | "right";
            gap?: number;
        } = {}
    ) {
        const font = options.font ?? "Helvetica";
        const size = options.size ?? 8;
        const gap = options.gap ?? 2;
        const align = options.align ?? "left";

        doc
            .font(font)
            .fontSize(size);

        const height = doc.heightOfString(value, {
            width,
            align,
            lineGap: 0
        });

        doc.text(value, x, y, {
            width,
            align,
            lineGap: 0
        });

        y += height + gap;
    }

    function drawSeparator() {
        doc
            .save()
            .moveTo(x, y)
            .lineTo(x + width, y)
            .lineWidth(0.5)
            .strokeColor("#999999")
            .dash(2, { space: 2 })
            .stroke()
            .undash()
            .restore();

        y += 8;
    }

    /**
     * Desenha uma linha com descrição à esquerda e valor à direita.
     * Permite que a descrição quebre de linha sem ultrapassar
     * a largura disponível para o valor.
     */
    function drawSummaryLine(
        label: string,
        value: string,
        options: {
            bold?: boolean;
            size?: number;
            gap?: number;
        } = {}
    ) {
        const font = options.bold
            ? "Helvetica-Bold"
            : "Helvetica";

        const size = options.size ?? 8;
        const gap = options.gap ?? 4;

        doc
            .font(font)
            .fontSize(size);

        const valueWidth = doc.widthOfString(value);
        const availableLabelWidth = Math.max(
            1,
            width - valueWidth - 5
        );

        const labelHeight = doc.heightOfString(label, {
            width: availableLabelWidth
        });

        const rowHeight = Math.max(
            labelHeight,
            doc.currentLineHeight()
        );

        doc
            .font(font)
            .fontSize(size)
            .text(
                label,
                x,
                y,
                {
                    width: availableLabelWidth,
                    lineGap: 0
                }
            );

        doc
            .font(font)
            .fontSize(size)
            .text(
                value,
                x + width - valueWidth,
                y,
                {
                    width: valueWidth,
                    align: "right",
                    lineBreak: false
                }
            );

        y += rowHeight + gap;
    }

    /**
     * Desenha uma linha de item no mesmo padrão visual do JS.
     * Não inclui materiais associados ao serviço.
     */
    function drawCouponItem(
        item: SaleItemRow,
        index: number
    ) {
        const itemName =
            item.name || "Item não identificado";

        const description = item.description || "";

        const quantity = Number(item.quantity) || 0;

        const unitPrice = Number(item.unit_value) || 0;

        const total = Number(item.total_value) || 0;

        const unit = item.unit_measure || "UN";

        const itemType =
            item.service_id !== null &&
            item.service_id !== undefined
                ? "Serviço"
                : "Produto";

        // Nome em negrito e identificação do tipo.
        drawText(
            `${index + 1}. ${itemName} (${itemType})`,
            {
                font: "Helvetica-Bold",
                size: 8,
                gap: 2
            }
        );

        if (description.trim()) {
            drawText(description.trim(), {
                size: 7.5,
                gap: 3
            });
        }

        // Quantidade e valor unitário à esquerda; total à direita.
        drawSummaryLine(
            `${formatQuantity(quantity)} ${unit} × ${currency(unitPrice)}`,
            currency(total),
            {
                size: 7.5,
                gap: 5
            }
        );

        drawSeparator();
    }

    /* Cabeçalho da empresa */

    const companyName =
        company?.trade_name ||
        company?.legal_name ||
        "Empresa não configurada";

    drawText(companyName.toLocaleUpperCase("pt-BR"), {
        font: "Helvetica-Bold",
        size: 10,
        align: "center",
        gap: 3
    });

    if (
        company?.trade_name &&
        company?.legal_name &&
        company.trade_name !== company.legal_name
    ) {
        drawText(company.legal_name, {
            size: 7.5,
            align: "center"
        });
    }

    if (company?.cnpj) {
        drawText(`CNPJ: ${company.cnpj}`, {
            size: 7.5,
            align: "center"
        });
    }

    if (company?.state_registration) {
        drawText(`IE: ${company.state_registration}`, {
            size: 7.5,
            align: "center"
        });
    }

    const companyAddress = getCompanyAddress(company);

    if (companyAddress) {
        drawText(companyAddress, {
            size: 7.5,
            align: "center"
        });
    }

    drawSeparator();

    drawText("COMPROVANTE DE VENDA", {
        font: "Helvetica-Bold",
        size: 10,
        align: "center",
        gap: 6
    });

    /* Dados da venda */

    const customerName =
        sale.client_name || "Consumidor não identificado";

    const customerTaxId =
        sale.client_tax_id || "";

    const customerAddress = getCustomerAddress(sale);

    drawText(`#${sale.id}`, {
        size: 8
    });

    drawText(`Data: ${formatDate(sale.dt_sale)}`, {
        size: 8
    });

    drawText(`Cliente: ${customerName}`, {
        size: 8
    });

    if (customerTaxId) {
        drawText(`CPF/CNPJ: ${customerTaxId}`, {
            size: 7.5
        });
    }

    if (customerAddress) {
        drawText(`Endereço: ${customerAddress}`, {
            size: 7.5
        });
    }

    drawSeparator();

    /* Itens da venda, sem sublistas de materiais */

    drawText("ITENS DA VENDA", {
        font: "Helvetica-Bold",
        size: 8.5,
        gap: 5
    });

    items.forEach((item, index) => {
        drawCouponItem(item, index);
    });

    if (items.length === 0) {
        drawText("Nenhum item encontrado.", {
            size: 8
        });

        drawSeparator();
    }

    /* Resumo financeiro */

    const totals = calculateSaleTotals(sale, items);

    drawSummaryLine(
        "Subtotal",
        currency(totals.subtotal)
    );

    if (totals.discount > 0) {
        drawSummaryLine(
            "Desconto",
            `-${currency(totals.discount)}`
        );
    }

    if (totals.installmentSurcharge > 0) {
        const surchargeLabel =
            sale.installment_count
                ? `Acréscimo crédito (${sale.installment_count}x)`
                : "Acréscimo crédito";

        drawSummaryLine(
            surchargeLabel,
            currency(totals.installmentSurcharge),
            {
                size: 7.5
            }
        );
    }

    y += 3;
    drawSeparator();

    drawSummaryLine(
        "TOTAL",
        currency(totals.total),
        {
            bold: true,
            size: 11,
            gap: 5
        }
    );

    drawSeparator();

    /* Pagamento */

    drawText("PAGAMENTO", {
        font: "Helvetica-Bold",
        size: 8.5,
        gap: 4
    });

    drawText(
        `Método: ${sale.method_name || "Não informado"}`,
        {
            size: 8
        }
    );

    if (Number(sale.installment_count) > 0) {
        drawText(
            `Parcelas: ${sale.installment_count}x`,
            {
                size: 8
            }
        );
    }

    y += 5;

    drawText("Obrigado pela preferência!", {
        font: "Helvetica-Bold",
        size: 8.5,
        align: "center",
        gap: 4
    });

    drawText("eight.cs development.", {
        size: 7.5,
        align: "center"
    });

    doc.y = y + COUPON_MARGIN;
}

/**
 * Mede a altura do cupom para que todo o conteúdo caiba
 * numa única página PDF de largura 58 mm.
 */
function estimateCouponHeight(
    sale: SaleRow,
    items: SaleItemRow[],
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

    drawCoupon(
        measureDoc,
        sale,
        items,
        company
    );

    const measuredHeight =
        measureDoc.y + COUPON_MARGIN + 12;

    measureDoc.end();

    if (
        !Number.isFinite(measuredHeight) ||
        measuredHeight <= 0
    ) {
        throw new Error(
            "Não foi possível calcular o tamanho do cupom."
        );
    }

    if (measuredHeight > MAX_COUPON_HEIGHT) {
        throw new Error(
            "O cupom ultrapassa a altura máxima permitida para uma página PDF."
        );
    }

    return Math.max(
        180,
        Math.ceil(measuredHeight)
    );
}

async function cashierSales(
    fastify: FastifyInstance
) {
    /* ------------------------------------------------------------------ */
    /* GET /cashier                                                       */
    /* ------------------------------------------------------------------ */

    fastify.get(
        "/cashier",
        {
            onRequest: [fastify.authenticate]
        },
        async () => {
            const sales = sqlite.prepare(`
                SELECT
                    c.id,
                    c.total_value,
                    c.dt_sale,

                    COALESCE(
                        c.customer_name,
                        cl.name
                    ) AS client_name,

                    COALESCE(
                        c.customer_tax_id,
                        cl.cpf,
                        cl.cnpj
                    ) AS client_tax_id,

                    (
                        SELECT fi.status
                        FROM fiscal_invoices fi
                        WHERE fi.sale_id = c.id
                        ORDER BY fi.id DESC
                        LIMIT 1
                    ) AS fiscal_invoice_status,

                    CASE
                        WHEN EXISTS (
                            SELECT 1
                            FROM fiscal_invoices fi

                            INNER JOIN danfes d
                                ON d.fiscal_invoice_id = fi.id

                            WHERE fi.sale_id = c.id
                              AND LOWER(fi.status) = 'authorized'
                              AND fi.xml_authorized IS NOT NULL
                              AND TRIM(fi.xml_authorized) <> ''
                              AND d.pdf_path IS NOT NULL
                              AND TRIM(d.pdf_path) <> ''
                        )
                        THEN 1
                        ELSE 0
                    END AS danfe_available

                FROM cashier c

                LEFT JOIN clients cl
                    ON cl.id = c.client_id

                ORDER BY c.id DESC
            `).all() as Array<{
                id: number;
                total_value: number;
                dt_sale: string;
                client_name: string | null;
                client_tax_id: string | null;
                fiscal_invoice_status: string | null;
                danfe_available: number;
            }>;

            return {
                message: "Successful Request",
                data: sales.map((sale) => ({
                    ...sale,
                    danfe_available:
                        sale.danfe_available === 1
                }))
            };
        }
    );

    /* ------------------------------------------------------------------ */
    /* GET /cashier/:saleId/coupon                                        */
    /* Cupom térmico de 58 mm.                                            */
    /* ------------------------------------------------------------------ */

    fastify.get(
        "/cashier/:saleId/coupon",
        {
            onRequest: [fastify.authenticate]
        },
        async (request, reply) => {
            const { saleId: rawId } =
                request.params as {
                    saleId: string;
                };

            const saleId = Number(rawId);

            if (
                !Number.isSafeInteger(saleId) ||
                saleId <= 0
            ) {
                return reply.code(400).send({
                    message:
                        "Identificador da venda inválido."
                });
            }

            const sale = getSale(saleId);

            if (!sale) {
                return reply.code(404).send({
                    message: "Venda não encontrada."
                });
            }

            const items = getSaleItems(saleId);
            const company = getCompany();

            const couponHeight = estimateCouponHeight(
                sale,
                items,
                company
            );

            return sendPdf(
                reply,
                `cupom-venda-${saleId}.pdf`,
                (doc) => {
                    drawCoupon(
                        doc,
                        sale,
                        items,
                        company
                    );
                },
                {
                    size: [
                        COUPON_WIDTH,
                        couponHeight
                    ],
                    margins: {
                        top: COUPON_MARGIN,
                        bottom: COUPON_MARGIN,
                        left: COUPON_MARGIN,
                        right: COUPON_MARGIN
                    }
                }
            );
        }
    );

    /* ------------------------------------------------------------------ */
    /* GET /cashier/:saleId/pdf                                           */
    /* PDF A4 da venda.                                                   */
    /* ------------------------------------------------------------------ */

    fastify.get(
        "/cashier/:saleId/pdf",
        {
            onRequest: [fastify.authenticate]
        },
        async (request, reply) => {
            const { saleId: rawId } =
                request.params as {
                    saleId: string;
                };

            const saleId = Number(rawId);

            if (
                !Number.isSafeInteger(saleId) ||
                saleId <= 0
            ) {
                return reply.code(400).send({
                    message:
                        "Identificador da venda inválido."
                });
            }

            const sale = getSale(saleId);

            if (!sale) {
                return reply.code(404).send({
                    message: "Venda não encontrada."
                });
            }

            const items = getSaleItems(saleId);
            const company = getCompany();
            const payments = getPayments(saleId);

            return sendPdf(
                reply,
                `venda-${saleId}.pdf`,
                (doc) => {
                    drawSalePdf(
                        doc,
                        sale,
                        items,
                        company,
                        payments
                    );
                }
            );
        }
    );

    /* ------------------------------------------------------------------ */
    /* GET /cashier/:saleId/danfe/pdf                                     */
    /* ------------------------------------------------------------------ */

    fastify.get(
        "/cashier/:saleId/danfe/pdf",
        {
            onRequest: [fastify.authenticate]
        },
        async (request, reply) => {
            const { saleId: rawId } =
                request.params as {
                    saleId: string;
                };

            const saleId = Number(rawId);

            if (
                !Number.isSafeInteger(saleId) ||
                saleId <= 0
            ) {
                return reply.code(400).send({
                    message:
                        "Identificador da venda inválido."
                });
            }

            const sale = getSale(saleId);

            if (!sale) {
                return reply.code(404).send({
                    message: "Venda não encontrada."
                });
            }

            const invoice = getInvoice(saleId);

            if (!invoice) {
                return reply.code(404).send({
                    message:
                        "Esta venda não possui uma NF-e vinculada."
                });
            }

            if (
                invoice.status.toLowerCase() !== "authorized" ||
                !invoice.xml_authorized?.trim()
            ) {
                return reply.code(409).send({
                    message:
                        "A DANFE só pode ser disponibilizada após " +
                        "a autorização da NF-e pela SEFAZ.",
                    data: {
                        invoice_id: invoice.id,
                        status: invoice.status
                    }
                });
            }

            const existingDanfe = sqlite.prepare(`
                SELECT pdf_path
                FROM danfes
                WHERE fiscal_invoice_id = ?
                ORDER BY id DESC
                LIMIT 1
            `).get(invoice.id) as
                | { pdf_path: string }
                | undefined;

            if (
                existingDanfe?.pdf_path &&
                fs.existsSync(existingDanfe.pdf_path)
            ) {
                const file = fs.readFileSync(
                    existingDanfe.pdf_path
                );

                if (
                    file.length < 5 ||
                    file.subarray(0, 5).toString("ascii") !== "%PDF-"
                ) {
                    return reply.code(500).send({
                        message:
                            "O arquivo de DANFE encontrado não é um PDF válido."
                    });
                }

                return reply
                    .header(
                        "Content-Type",
                        "application/pdf"
                    )
                    .header(
                        "Content-Disposition",
                        `inline; filename="danfe-${invoice.number}.pdf"`
                    )
                    .header(
                        "Content-Length",
                        String(file.length)
                    )
                    .send(file);
            }

            return reply.code(501).send({
                message:
                    "A NF-e está autorizada, mas o renderizador do DANFE " +
                    "ainda não foi configurado.",
                data: {
                    invoice_id: invoice.id,
                    invoice_number: invoice.number,
                    access_key: invoice.access_key,
                    authorized_at: invoice.authorized_at
                }
            });
        }
    );
}

module.exports = cashierSales;
