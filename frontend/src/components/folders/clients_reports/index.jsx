import { useEffect, useMemo, useState } from "react";
import { getClientReports } from "@/data/api/clients";
import "./style.scss";

const chartColor = "#31df55";

const pieColors = [
    "#31df55",
    "#f0443d",
    "#ff990f",
    "#51a8f0",
    "#9b7bea",
    "#16b6a6",
    "#f06d8d",
    "#8b989f",
    "#d99116",
    "#5875d9"
];

const money = (value) =>
    new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL"
    }).format(Number(value) || 0);

const compactMoney = (value) =>
    new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
        notation: "compact",
        maximumFractionDigits: 1
    }).format(Number(value) || 0);

const qty = (value) =>
    Number(value || 0).toLocaleString("pt-BR", {
        maximumFractionDigits: 2
    });

const dateValue = (date) =>
    [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
    ].join("-");

const formatDate = (value) => {
    if (!value) return "—";

    const normalized = String(value).includes("T")
        ? String(value)
        : String(value).replace(" ", "T");

    const parsed = new Date(normalized);

    return Number.isNaN(parsed.getTime())
        ? String(value)
        : parsed.toLocaleDateString("pt-BR");
};

const formatDateTime = (value) => {
    if (!value) return "Data não informada";

    const normalized = String(value).includes("T")
        ? String(value)
        : String(value).replace(" ", "T");

    const parsed = new Date(normalized);

    return Number.isNaN(parsed.getTime())
        ? String(value)
        : parsed.toLocaleString("pt-BR");
};

const clientDocument = (client) => {
    if (client.cpf) return `CPF: ${client.cpf}`;
    if (client.cnpj) return `CNPJ: ${client.cnpj}`;
    return "Documento não informado";
};

function sumRows(rows) {
    return rows.reduce(
        (total, row) => ({
            totalSpent:
                total.totalSpent + (Number(row.total_spent) || 0),
            purchases:
                total.purchases + (Number(row.purchase_count) || 0),
            itemsBought:
                total.itemsBought +
                (Number(row.items_bought_count) || 0),
            clients: total.clients + 1
        }),
        {
            totalSpent: 0,
            purchases: 0,
            itemsBought: 0,
            clients: 0
        }
    );
}

/* -------------------------------------------------------------------------- */
/* PIE CHART INTERATIVO                                                       */
/* -------------------------------------------------------------------------- */

const PIE_CENTER = 120;
const PIE_OUTER_RADIUS = 100;
const PIE_INNER_RADIUS = 58;

function polarPoint(angle, radius) {
    const radians = (angle * Math.PI) / 180;

    return {
        x: PIE_CENTER + Math.cos(radians) * radius,
        y: PIE_CENTER + Math.sin(radians) * radius
    };
}

function createDonutSlicePath(startAngle, endAngle) {
    const sweep = endAngle - startAngle;

    if (sweep <= 0) {
        return "";
    }

    // Um único segmento pode representar 100% do gráfico.
    // Dois arcos são usados porque um arco SVG não desenha
    // um círculo completo quando início e fim coincidem.
    if (sweep >= 359.999) {
        return [
            `M ${PIE_CENTER} ${PIE_CENTER - PIE_OUTER_RADIUS}`,
            `A ${PIE_OUTER_RADIUS} ${PIE_OUTER_RADIUS} 0 1 1 ${PIE_CENTER} ${PIE_CENTER + PIE_OUTER_RADIUS}`,
            `A ${PIE_OUTER_RADIUS} ${PIE_OUTER_RADIUS} 0 1 1 ${PIE_CENTER} ${PIE_CENTER - PIE_OUTER_RADIUS}`,
            `L ${PIE_CENTER} ${PIE_CENTER - PIE_INNER_RADIUS}`,
            `A ${PIE_INNER_RADIUS} ${PIE_INNER_RADIUS} 0 1 0 ${PIE_CENTER} ${PIE_CENTER + PIE_INNER_RADIUS}`,
            `A ${PIE_INNER_RADIUS} ${PIE_INNER_RADIUS} 0 1 0 ${PIE_CENTER} ${PIE_CENTER - PIE_INNER_RADIUS}`,
            "Z"
        ].join(" ");
    }

    const startOuter = polarPoint(
        startAngle,
        PIE_OUTER_RADIUS
    );

    const endOuter = polarPoint(
        endAngle,
        PIE_OUTER_RADIUS
    );

    const startInner = polarPoint(
        startAngle,
        PIE_INNER_RADIUS
    );

    const endInner = polarPoint(
        endAngle,
        PIE_INNER_RADIUS
    );

    const largeArc = sweep > 180 ? 1 : 0;

    return [
        `M ${startOuter.x} ${startOuter.y}`,
        `A ${PIE_OUTER_RADIUS} ${PIE_OUTER_RADIUS} 0 ${largeArc} 1 ${endOuter.x} ${endOuter.y}`,
        `L ${endInner.x} ${endInner.y}`,
        `A ${PIE_INNER_RADIUS} ${PIE_INNER_RADIUS} 0 ${largeArc} 0 ${startInner.x} ${startInner.y}`,
        "Z"
    ].join(" ");
}

function PieChart({ rows, small = false }) {
    const [hoveredIndex, setHoveredIndex] = useState(null);

    const values = useMemo(
        () =>
            rows.map((row, index) => ({
                id: row.id ?? index,
                name: String(
                    row.name ??
                    row.client_name ??
                    "Cliente sem nome"
                ),
                value: Math.max(
                    0,
                    Number(row.total_spent) || 0
                ),
                color: pieColors[index % pieColors.length]
            })),
        [rows]
    );

    const total = values.reduce(
        (sum, item) => sum + item.value,
        0
    );

    let currentAngle = -90;

    const segments = values.map((item, index) => {
        const sweep = total > 0
            ? (item.value / total) * 360
            : 0;

        const startAngle = currentAngle;
        const endAngle = currentAngle + sweep;

        currentAngle = endAngle;

        return {
            ...item,
            index,
            percentage: total > 0
                ? (item.value / total) * 100
                : 0,
            path: createDonutSlicePath(
                startAngle,
                endAngle
            )
        };
    });

    const hoveredItem =
        hoveredIndex === null
            ? null
            : segments[hoveredIndex] ?? null;

    function clearHover() {
        setHoveredIndex(null);
    }

    return (
        <div
            className={
                "clients-reports__pie" +
                (small
                    ? " clients-reports__pie--small"
                    : "")
            }
            role="group"
            aria-label={
                "Gráfico circular de gastos dos clientes. Total: " +
                money(total)
            }
            onMouseLeave={clearHover}
        >
            <svg
                className="clients-reports__pie-chart"
                viewBox="0 0 240 240"
                role="img"
                aria-label="Distribuição percentual dos gastos por cliente"
            >
                <title>
                    Distribuição dos gastos por cliente
                </title>

                {total > 0 ? (
                    segments.map((item) => {
                        if (!item.path) {
                            return null;
                        }

                        const isHovered =
                            hoveredIndex === item.index;

                        return (
                            <path
                                key={item.id}
                                d={item.path}
                                fill={item.color}
                                className={
                                    "clients-reports__pie-slice" +
                                    (isHovered
                                        ? " is-hovered"
                                        : "")
                                }
                                stroke="#ffffff"
                                strokeWidth={isHovered ? 4 : 1.5}
                                tabIndex={0}
                                role="img"
                                aria-label={
                                    `${item.name}: ${money(item.value)}, ` +
                                    `${item.percentage.toLocaleString(
                                        "pt-BR",
                                        {
                                            maximumFractionDigits: 1
                                        }
                                    )}% do total`
                                }
                                onMouseEnter={() =>
                                    setHoveredIndex(item.index)
                                }
                                onFocus={() =>
                                    setHoveredIndex(item.index)
                                }
                                onBlur={clearHover}
                            >
                                <title>
                                    {item.name}
                                    {" — "}
                                    {money(item.value)}
                                    {" — "}
                                    {item.percentage.toLocaleString(
                                        "pt-BR",
                                        {
                                            maximumFractionDigits: 1
                                        }
                                    )}
                                    % do total
                                </title>
                            </path>
                        );
                    })
                ) : (
                    <circle
                        cx={PIE_CENTER}
                        cy={PIE_CENTER}
                        r={PIE_OUTER_RADIUS}
                        fill="#d9dfe2"
                    />
                )}

                <circle
                    className="clients-reports__pie-hole"
                    cx={PIE_CENTER}
                    cy={PIE_CENTER}
                    r={PIE_INNER_RADIUS - 1}
                    fill="#ffffff"
                    pointerEvents="none"
                />
            </svg>

            <div
                className={
                    "clients-reports__pie-center" +
                    (hoveredItem
                        ? " is-hovered"
                        : "")
                }
                aria-live="polite"
                aria-atomic="true"
                title={
                    hoveredItem
                        ? `${hoveredItem.name}: ${money(hoveredItem.value)}`
                        : `Total: ${money(total)}`
                }
            >
                {hoveredItem ? (
                    <>
                        <strong className="clients-reports__pie-name">
                            {hoveredItem.name}
                        </strong>

                        <span className="clients-reports__pie-value">
                            {money(hoveredItem.value)}
                        </span>

                        <small className="clients-reports__pie-percentage">
                            {hoveredItem.percentage.toLocaleString(
                                "pt-BR",
                                {
                                    maximumFractionDigits: 1
                                }
                            )}
                            % do total
                        </small>
                    </>
                ) : (
                    <span className="clients-reports__pie-total">
                        {total ? money(total) : "Sem dados"}
                    </span>
                )}
            </div>
        </div>
    );
}

function safe(value) {
    return String(value ?? "—")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function itemTypeLabel(type) {
    if (type === "product") return "Produto";
    if (type === "service") return "Serviço";
    return "Não identificado";
}

function reportPdf(rows, range, title, popup) {
    const totals = sumRows(rows);

    const period =
        range.from && range.to
            ? `${formatDate(range.from)} até ${formatDate(range.to)}`
            : "Todos os períodos";

    const summaryBody = rows
        .map(
            (client, index) =>
                "<tr><td>" +
                (index + 1) +
                "</td><td>" +
                safe(client.name) +
                "</td><td>" +
                safe(client.cpf || client.cnpj || "—") +
                "</td><td>" +
                qty(client.purchase_count) +
                "</td><td>" +
                qty(client.items_bought_count) +
                "</td><td>" +
                money(client.total_spent) +
                "</td></tr>"
        )
        .join("");

    const detailsBody = rows
        .map((client) => {
            const purchases = Array.isArray(client.purchases)
                ? client.purchases
                : [];

            const clientHeading =
                "<tr class='client-heading'><td colspan='7'>" +
                safe(client.name) +
                " — " +
                safe(clientDocument(client)) +
                "</td></tr>";

            if (!purchases.length) {
                return (
                    clientHeading +
                    "<tr><td colspan='7' class='no-purchases'>" +
                    "Nenhuma compra registrada no período." +
                    "</td></tr>"
                );
            }

            const purchaseRows = purchases
                .map((purchase) => {
                    const purchaseHeading =
                        "<tr class='purchase-heading'><td colspan='7'>" +
                        "<strong>Compra #" +
                        safe(purchase.id) +
                        "</strong> · " +
                        safe(formatDateTime(purchase.dt_sale)) +
                        " · Pagamento: " +
                        safe(purchase.payment_method || "Não informado") +
                        " · Total: " +
                        money(purchase.total_value) +
                        "</td></tr>";

                    const items = Array.isArray(purchase.items)
                        ? purchase.items
                        : [];

                    const itemsRows = items.length
                        ? items
                              .map(
                                  (item) =>
                                      "<tr><td>" +
                                      safe(itemTypeLabel(item.type)) +
                                      "</td><td>" +
                                      safe(item.name) +
                                      "</td><td>" +
                                      safe(item.sm_code || "—") +
                                      "</td><td>" +
                                      qty(item.quantity) +
                                      " " +
                                      safe(item.unit_measure || "un.") +
                                      "</td><td>" +
                                      money(item.unit_value) +
                                      "</td><td>" +
                                      money(item.total_value) +
                                      "</td><td>" +
                                      safe(item.bar_code || "—") +
                                      "</td></tr>"
                              )
                              .join("")
                        : "<tr><td colspan='7'>Nenhum item detalhado.</td></tr>";

                    return purchaseHeading + itemsRows;
                })
                .join("");

            return clientHeading + purchaseRows;
        })
        .join("");

    const html =
        "<!doctype html><html lang='pt-BR'><head><meta charset='utf-8'>" +
        "<title>" +
        safe(title) +
        "</title><style>" +
        "@page{size:A4 landscape;margin:12mm}" +
        "*{box-sizing:border-box}" +
        "body{font:10pt Arial;color:#18242b}" +
        "h1{font-size:18pt;margin:0 0 4mm}" +
        "h2{font-size:13pt;margin:8mm 0 3mm}" +
        ".meta{color:#52616b;line-height:1.6;margin-bottom:6mm}" +
        ".totals{display:flex;flex-wrap:wrap;gap:9mm;margin-bottom:5mm}" +
        ".totals b{display:block;margin-bottom:1mm}" +
        "table{width:100%;border-collapse:collapse;font-size:8.5pt;margin-bottom:5mm}" +
        "th,td{padding:2.2mm 1.5mm;border:1px solid #d5dadd;text-align:left;overflow-wrap:anywhere}" +
        "th{background:#f0f2f3}" +
        "td:nth-child(4),td:nth-child(5),td:nth-child(6){text-align:right}" +
        ".client-heading td{background:#e9eef1;font-size:10pt;font-weight:bold;padding:3mm}" +
        ".purchase-heading td{background:#f6f7f8;padding:2.5mm}" +
        ".no-purchases{text-align:center;color:#67737a}" +
        ".total{font-weight:bold;background:#f5f6f7}" +
        ".note{margin-top:5mm;color:#5b6870;font-size:8pt;line-height:1.5}" +
        ".section{page-break-inside:auto}" +
        "tr{page-break-inside:avoid}" +
        "</style></head><body><h1>" +
        safe(title) +
        "</h1><div class='meta'>Período: " +
        safe(period) +
        "<br>Gerado em: " +
        safe(new Date().toLocaleString("pt-BR")) +
        "<br>Clientes listados: " +
        rows.length +
        "</div><div class='totals'><span><b>Clientes</b>" +
        qty(totals.clients) +
        "</span><span><b>Compras</b>" +
        qty(totals.purchases) +
        "</span><span><b>Itens comprados</b>" +
        qty(totals.itemsBought) +
        "</span><span><b>Total gasto</b>" +
        money(totals.totalSpent) +
        "</span><span><b>Ticket médio</b>" +
        money(
            totals.purchases
                ? totals.totalSpent / totals.purchases
                : 0
        ) +
        "</span></div><h2>Resumo por cliente</h2>" +
        "<table><thead><tr><th>#</th><th>Cliente</th><th>CPF/CNPJ</th>" +
        "<th>Compras</th><th>Itens comprados</th><th>Total gasto</th></tr>" +
        "</thead><tbody>" +
        summaryBody +
        "<tr class='total'><td colspan='3'>TOTAL</td><td>" +
        qty(totals.purchases) +
        "</td><td>" +
        qty(totals.itemsBought) +
        "</td><td>" +
        money(totals.totalSpent) +
        "</td></tr></tbody></table>" +
        "<h2>Histórico detalhado de compras</h2>" +
        "<table><thead><tr><th>Tipo</th><th>Item</th><th>Código</th>" +
        "<th>Quantidade</th><th>Valor unitário</th><th>Total do item</th>" +
        "<th>Código de barras</th></tr></thead><tbody>" +
        detailsBody +
        "</tbody></table><p class='note'>" +
        "Os totais por compra correspondem aos valores retornados pela API. " +
        "Quando o valor unitário histórico de um item não estiver disponível, " +
        "o valor apresentado pode usar o preço atual do cadastro." +
        "</p><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),200));</script>" +
        "</body></html>";

    popup.document.open();
    popup.document.write(html);
    popup.document.close();
}

export default function ClientsReportsPage() {
    const [rows, setRows] = useState([]);
    const [selectedIds, setSelectedIds] = useState([]);
    const [chartPage, setChartPage] = useState(0);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState("");
    const [dateModal, setDateModal] = useState(false);
    const [dates, setDates] = useState({
        from: "",
        to: ""
    });

    useEffect(() => {
        const controller = new AbortController();

        getClientReports({}, controller.signal)
            .then((data) => {
                const sorted = [...data].sort(
                    (a, b) =>
                        (Number(b.total_spent) || 0) -
                            (Number(a.total_spent) || 0) ||
                        String(a.name).localeCompare(
                            String(b.name),
                            "pt-BR"
                        )
                );

                setRows(sorted);
            })
            .catch((reason) => {
                if (!controller.signal.aborted) {
                    setError(
                        reason instanceof Error
                            ? reason.message
                            : "Não foi possível carregar os relatórios."
                    );
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            });

        return () => controller.abort();
    }, []);

    const selectedSet = useMemo(
        () => new Set(selectedIds),
        [selectedIds]
    );

    const selectedRows = useMemo(
        () => rows.filter((row) => selectedSet.has(row.id)),
        [rows, selectedSet]
    );

    const allTotals = useMemo(() => sumRows(rows), [rows]);

    const selectedTotals = useMemo(
        () => sumRows(selectedRows),
        [selectedRows]
    );

    const pages = Math.max(1, Math.ceil(rows.length / 6));
    const visible = rows.slice(chartPage * 6, chartPage * 6 + 6);

    const maxValue = Math.max(
        1,
        ...visible.map((row) => Number(row.total_spent) || 0)
    );

    const averageTicket = allTotals.purchases
        ? allTotals.totalSpent / allTotals.purchases
        : 0;

    function toggle(id) {
        setSelectedIds((current) =>
            current.includes(id)
                ? current.filter((item) => item !== id)
                : [...current, id]
        );
    }

    function monthRange() {
        const today = new Date();

        return {
            from: dateValue(
                new Date(today.getFullYear(), today.getMonth(), 1)
            ),
            to: dateValue(today)
        };
    }

    async function exportPdf(range, ids, title) {
        const popup = window.open("", "_blank");

        if (!popup) {
            setError(
                "Permita a abertura de pop-ups para exportar o PDF."
            );
            return;
        }

        popup.document.write(
            "<p style='font:16px Arial;padding:2rem'>Preparando relatório...</p>"
        );

        setError("");
        setExporting(true);

        try {
            const data = await getClientReports(range);

            const reportRows = ids
                ? data.filter((client) => ids.includes(client.id))
                : data;

            reportPdf(reportRows, range, title, popup);
            setDateModal(false);
        } catch (reason) {
            popup.close();

            setError(
                reason instanceof Error
                    ? reason.message
                    : "Não foi possível gerar o relatório."
            );
        } finally {
            setExporting(false);
        }
    }

    function exportDates(event) {
        event.preventDefault();

        if (!dates.from || !dates.to) {
            setError("Informe a data inicial e a final.");
            return;
        }

        if (dates.from > dates.to) {
            setError(
                "A data inicial deve ser anterior ou igual à final."
            );
            return;
        }

        exportPdf(
            { ...dates },
            null,
            "Relatório de Clientes - Período selecionado"
        );
    }

    function exportSelected() {
        if (!selectedIds.length) return;

        exportPdf(
            {},
            selectedIds,
            selectedIds.length > 1
                ? "Relatório dos Clientes Selecionados"
                : "Relatório do Cliente Selecionado"
        );
    }

    return (
        <main className="clients-reports">
            <header className="clients-reports__header">
                <h1 onClick={() =>{window.location.href="/"}} >POSSO AJUDAR?</h1>
                <span>Relatório - Clientes</span>
            </header>

            <div className="clients-reports__content">
                {error && (
                    <p className="clients-reports__error" role="alert">
                        {error}
                    </p>
                )}

                <div className="clients-reports__visuals">
                    <section className="clients-reports__panel clients-reports__bars">
                        <div className="clients-reports__panel-title">
                            <h2>Comparativo de Gastos por Cliente</h2>

                            <div className="clients-reports__legend">
                                <span>
                                    <i style={{ background: chartColor }} />
                                    Total gasto
                                </span>
                            </div>
                        </div>

                        {loading ? (
                            <p className="clients-reports__empty">
                                Carregando relatórios...
                            </p>
                        ) : !rows.length ? (
                            <p className="clients-reports__empty">
                                Não há clientes para exibir.
                            </p>
                        ) : (
                            <>
                                <div className="clients-reports__chart">
                                    <button
                                        type="button"
                                        aria-label="Clientes anteriores"
                                        disabled={!chartPage}
                                        onClick={() =>
                                            setChartPage((value) =>
                                                Math.max(0, value - 1)
                                            )
                                        }
                                    >
                                        ‹
                                    </button>

                                    <svg
                                        viewBox="0 0 850 410"
                                        role="img"
                                        aria-label="Total gasto por cliente"
                                    >
                                        {[0, 1, 2, 3, 4].map((tick) => {
                                            const value =
                                                (maxValue * tick) / 4;
                                            const y = 328 - tick * 68;

                                            return (
                                                <g key={tick}>
                                                    <line
                                                        x1="66"
                                                        y1={y}
                                                        x2="836"
                                                        y2={y}
                                                        stroke="#e5e8e9"
                                                    />
                                                    <text
                                                        x="60"
                                                        y={y + 4}
                                                        textAnchor="end"
                                                    >
                                                        {compactMoney(value)}
                                                    </text>
                                                </g>
                                            );
                                        })}

                                        {visible.map((client, index) => {
                                            const x = 82 + index * 126;
                                            const value =
                                                Number(client.total_spent) || 0;
                                            const height =
                                                (value / maxValue) * 250;
                                            const selected =
                                                selectedSet.has(client.id);

                                            return (
                                                <g
                                                    key={client.id}
                                                    role="button"
                                                    tabIndex="0"
                                                    aria-pressed={selected}
                                                    aria-label={
                                                        client.name +
                                                        " — " +
                                                        money(value) +
                                                        " gastos"
                                                    }
                                                    className={
                                                        "clients-reports__bar-group" +
                                                        (selected
                                                            ? " is-selected"
                                                            : "")
                                                    }
                                                    onClick={() =>
                                                        toggle(client.id)
                                                    }
                                                    onKeyDown={(event) => {
                                                        if (
                                                            event.key ===
                                                                "Enter" ||
                                                            event.key === " "
                                                        ) {
                                                            event.preventDefault();
                                                            toggle(client.id);
                                                        }
                                                    }}
                                                >
                                                    <rect
                                                        x={x - 28}
                                                        y="35"
                                                        width="112"
                                                        height="300"
                                                        fill="transparent"
                                                    />

                                                    <rect
                                                        className="clients-reports__bar"
                                                        x={x + 15}
                                                        y={328 - height}
                                                        width="36"
                                                        height={height}
                                                        rx="2"
                                                        fill={chartColor}
                                                    />

                                                    <text
                                                        className="clients-reports__bar-label"
                                                        x={x + 34}
                                                        y={Math.max(
                                                            28,
                                                            320 - height
                                                        )}
                                                        textAnchor="middle"
                                                    >
                                                        {compactMoney(value)}
                                                    </text>

                                                    <text
                                                        className="clients-reports__bar-label"
                                                        x={x + 20}
                                                        y="355"
                                                        textAnchor="end"
                                                        transform={
                                                            "rotate(-18 " +
                                                            (x + 20) +
                                                            " 355)"
                                                        }
                                                    >
                                                        {client.name.length > 22
                                                            ? client.name.slice(
                                                                  0,
                                                                  21
                                                              ) + "…"
                                                            : client.name}
                                                    </text>
                                                </g>
                                            );
                                        })}
                                    </svg>

                                    <button
                                        type="button"
                                        aria-label="Próximos clientes"
                                        disabled={chartPage >= pages - 1}
                                        onClick={() =>
                                            setChartPage((value) =>
                                                Math.min(
                                                    pages - 1,
                                                    value + 1
                                                )
                                            )
                                        }
                                    >
                                        ›
                                    </button>
                                </div>

                                <p className="clients-reports__chart-page">
                                    Clientes {chartPage * 6 + 1}–
                                    {Math.min(
                                        chartPage * 6 + visible.length,
                                        rows.length
                                    )}{" "}
                                    de {rows.length}. As barras mostram o
                                    total gasto. Clique em uma barra para
                                    selecionar ou remover um cliente.
                                </p>
                            </>
                        )}
                    </section>

                    <section className="clients-reports__panel clients-reports__selected">
                        <h2>
                            {selectedRows.length
                                ? selectedRows.length === 1
                                    ? selectedRows[0].name
                                    : `${selectedRows.length} clientes selecionados`
                                : "Clientes selecionados"}
                        </h2>

                        {selectedRows.length ? (
                            <>
                                <PieChart rows={selectedRows} />

                                <div className="clients-reports__metrics">
                                    <p>
                                        <span>Compras realizadas</span>
                                        <strong>
                                            {qty(selectedTotals.purchases)}
                                        </strong>
                                    </p>

                                    <p>
                                        <span>Itens comprados</span>
                                        <strong>
                                            {qty(selectedTotals.itemsBought)}
                                        </strong>
                                    </p>

                                    <p>
                                        <span>Total gasto</span>
                                        <strong>
                                            {money(selectedTotals.totalSpent)}
                                        </strong>
                                    </p>

                                    <p>
                                        <span>Ticket médio</span>
                                        <strong>
                                            {money(
                                                selectedTotals.purchases
                                                    ? selectedTotals.totalSpent /
                                                          selectedTotals.purchases
                                                    : 0
                                            )}
                                        </strong>
                                    </p>

                                    {selectedRows.length > 1 && (
                                        <small>
                                            O gráfico circular mostra a
                                            participação de cada cliente no
                                            total gasto pelos clientes
                                            selecionados.
                                        </small>
                                    )}
                                </div>
                            </>
                        ) : (
                            <p className="clients-reports__empty">
                                Clique em uma barra para consultar os gastos
                                e as compras dos clientes selecionados.
                            </p>
                        )}
                    </section>

                    <aside className="clients-reports__panel clients-reports__totals">
                        <h2>Totais de todos os clientes</h2>

                        <div className="clients-reports__total-list">
                            <p>
                                <span>CLIENTES</span>
                                <b>{qty(allTotals.clients)}</b>
                            </p>

                            <p>
                                <span>COMPRAS</span>
                                <b>{qty(allTotals.purchases)}</b>
                            </p>

                            <p>
                                <span>ITENS COMPRADOS</span>
                                <b>{qty(allTotals.itemsBought)}</b>
                            </p>

                            <p>
                                <span>TOTAL GASTO</span>
                                <b>{money(allTotals.totalSpent)}</b>
                            </p>
                        </div>

                        <div className="clients-reports__net">
                            <PieChart rows={rows} small />

                            <div>
                                <strong className="is-gain">
                                    {money(allTotals.totalSpent)}
                                </strong>
                                <span>÷</span>
                                <strong className="is-average">
                                    {money(averageTicket)}
                                </strong>
                                <small>Ticket médio</small>
                            </div>
                        </div>
                    </aside>
                </div>

                <section
                    className="clients-reports__exports"
                    aria-label="Exportar relatórios PDF"
                >
                    <button
                        disabled={loading || exporting}
                        onClick={() =>
                            exportPdf(
                                {},
                                null,
                                "Relatório de Clientes - Todos os períodos"
                            )
                        }
                        type="button"
                    >
                        ▧ Exportar tudo
                    </button>

                    <button
                        disabled={loading || exporting}
                        onClick={() =>
                            exportPdf(
                                monthRange(),
                                null,
                                "Relatório de Clientes - Mês Atual"
                            )
                        }
                        type="button"
                    >
                        ▧ Exportar / Mês Atual
                    </button>

                    <button
                        disabled={loading || exporting}
                        onClick={() => {
                            setError("");
                            setDateModal(true);
                        }}
                        type="button"
                    >
                        ▧ Exportar / Data
                    </button>

                    <button
                        disabled={
                            !selectedIds.length || loading || exporting
                        }
                        onClick={exportSelected}
                        type="button"
                    >
                        {selectedIds.length > 1
                            ? "▧ Exportar Clientes"
                            : "▧ Relatório Cliente"}
                    </button>
                </section>
            </div>

            {dateModal && (
                <div
                    className="clients-reports__backdrop"
                    onMouseDown={(event) => {
                        if (
                            event.target === event.currentTarget &&
                            !exporting
                        ) {
                            setDateModal(false);
                        }
                    }}
                >
                    <form
                        className="clients-reports__date-modal"
                        onSubmit={exportDates}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="clients-reports-date-title"
                    >
                        <button
                            type="button"
                            className="clients-reports__close"
                            aria-label="Fechar"
                            disabled={exporting}
                            onClick={() => setDateModal(false)}
                        >
                            ×
                        </button>

                        <h2 id="clients-reports-date-title">
                            Período do relatório
                        </h2>

                        <label>
                            <span>De</span>
                            <input
                                type="date"
                                required
                                value={dates.from}
                                onChange={(event) =>
                                    setDates((current) => ({
                                        ...current,
                                        from: event.target.value
                                    }))
                                }
                            />
                        </label>

                        <label>
                            <span>Até</span>
                            <input
                                type="date"
                                required
                                value={dates.to}
                                onChange={(event) =>
                                    setDates((current) => ({
                                        ...current,
                                        to: event.target.value
                                    }))
                                }
                            />
                        </label>

                        <div className="clients-reports__modal-actions">
                            <button
                                type="button"
                                onClick={() => setDateModal(false)}
                                disabled={exporting}
                            >
                                Cancelar
                            </button>

                            <button type="submit" disabled={exporting}>
                                {exporting ? "Gerando..." : "Gerar PDF"}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </main>
    );
}