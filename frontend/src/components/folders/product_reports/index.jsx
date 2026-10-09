import { useEffect, useMemo, useState } from "react";
import { getProductReports } from "@/data/api/products";
import "./style.scss";

const series = [
    { key: "units_sold", label: "Ganhos", color: "#31df55" },
    { key: "units_purchased", label: "Custos", color: "#f0443d" },
    { key: "units_lost", label: "Perdas", color: "#ff990f" }
];

const money = (value) =>
    new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL"
    }).format(Number(value) || 0);

const qty = (value) =>
    Number(value || 0).toLocaleString("pt-BR", {
        maximumFractionDigits: 2
    });

const percentage = (value) =>
    new Intl.NumberFormat("pt-BR", {
        maximumFractionDigits: 1
    }).format(value);

const dateValue = (date) =>
    [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
    ].join("-");

const sumRows = (rows) =>
    rows.reduce(
        (total, row) => ({
            revenue: total.revenue + Number(row.revenue || 0),
            entryCost: total.entryCost + Number(row.entry_cost || 0),
            salesCost: total.salesCost + Number(row.sales_cost || 0),
            lossCost: total.lossCost + Number(row.loss_cost || 0),
            purchased: total.purchased + Number(row.units_purchased || 0),
            sold: total.sold + Number(row.units_sold || 0),
            lost: total.lost + Number(row.units_lost || 0),
            unknown:
                total.unknown +
                Number(row.unknown_sale_cost_count || 0) +
                Number(row.unknown_loss_cost_count || 0)
        }),
        {
            revenue: 0,
            entryCost: 0,
            salesCost: 0,
            lossCost: 0,
            purchased: 0,
            sold: 0,
            lost: 0,
            unknown: 0
        }
    );

/* -------------------------------------------------------------------------- */
/* GEOMETRIA DAS FATIAS DO GRÁFICO                                            */
/* -------------------------------------------------------------------------- */

function polarPoint(radius, angle) {
    const radians = ((angle - 90) * Math.PI) / 180;

    return {
        x: 120 + radius * Math.cos(radians),
        y: 120 + radius * Math.sin(radians)
    };
}

function pieSlicePath(startAngle, endAngle) {
    const outerRadius = 100;
    const innerRadius = 58;
    const angle = endAngle - startAngle;

    if (angle <= 0) return "";

    const outerStart = polarPoint(outerRadius, startAngle);
    const innerStart = polarPoint(innerRadius, startAngle);

    // Trata uma fatia de 100%, pois um único arco SVG não desenha 360°.
    if (angle >= 359.999) {
        const middleAngle = startAngle + 180;

        const outerMiddle = polarPoint(outerRadius, middleAngle);
        const innerMiddle = polarPoint(innerRadius, middleAngle);
        const outerEnd = polarPoint(outerRadius, endAngle);
        const innerEnd = polarPoint(innerRadius, endAngle);

        return [
            `M ${outerStart.x} ${outerStart.y}`,
            `A ${outerRadius} ${outerRadius} 0 1 1 ${outerMiddle.x} ${outerMiddle.y}`,
            `A ${outerRadius} ${outerRadius} 0 1 1 ${outerEnd.x} ${outerEnd.y}`,
            `L ${innerEnd.x} ${innerEnd.y}`,
            `A ${innerRadius} ${innerRadius} 0 1 0 ${innerMiddle.x} ${innerMiddle.y}`,
            `A ${innerRadius} ${innerRadius} 0 1 0 ${innerStart.x} ${innerStart.y}`,
            "Z"
        ].join(" ");
    }

    const outerEnd = polarPoint(outerRadius, endAngle);
    const innerEnd = polarPoint(innerRadius, endAngle);
    const largeArc = angle > 180 ? 1 : 0;

    return [
        `M ${outerStart.x} ${outerStart.y}`,
        `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
        `L ${innerEnd.x} ${innerEnd.y}`,
        `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
        "Z"
    ].join(" ");
}

/* -------------------------------------------------------------------------- */
/* GRÁFICO DE PIZZA INTERATIVO                                                */
/* -------------------------------------------------------------------------- */

function PieChart({ totals, small = false }) {
    const [hoveredIndex, setHoveredIndex] = useState(null);
    const [focusedIndex, setFocusedIndex] = useState(null);

    const values = [
        {
            name: "Ganhos",
            value: Math.max(0, Number(totals.revenue) || 0),
            color: "#31df55"
        },
        {
            name: "Custos de entrada",
            value: Math.max(0, Number(totals.entryCost) || 0),
            color: "#fa7196"
        },
        {
            name: "Perdas",
            value: Math.max(0, Number(totals.lossCost) || 0),
            color: "#ffc94f"
        }
    ];

    const total = values.reduce(
        (sum, item) => sum + item.value,
        0
    );

    let startAngle = 0;

    const slices = values
        .filter((item) => item.value > 0)
        .map((item) => {
            const angle = total
                ? (item.value / total) * 360
                : 0;

            const slice = {
                ...item,
                startAngle,
                endAngle: startAngle + angle,
                percentage: total
                    ? (item.value / total) * 100
                    : 0
            };

            startAngle += angle;

            return slice;
        });

    const activeIndex = focusedIndex ?? hoveredIndex;

    const activeSlice =
        activeIndex === null ? null : slices[activeIndex] ?? null;

    const className =
        "product-reports__pie" +
        (small ? " product-reports__pie--small" : "");

    return (
        <div
            className={className}
            role="group"
            aria-label="Gráfico de ganhos, custos de entrada e perdas"
        >
            <svg
                className="product-reports__pie-chart"
                viewBox="0 0 240 240"
                role="img"
                aria-label={
                    "Total dos indicadores: " + money(total)
                }
            >
                <circle
                    cx="120"
                    cy="120"
                    r="100"
                    fill="#d9dfe2"
                />

                {slices.map((slice, index) => (
                    <path
                        key={slice.name}
                        className={
                            "product-reports__pie-slice" +
                            (activeIndex === index ? " is-hovered" : "")
                        }
                        d={pieSlicePath(
                            slice.startAngle,
                            slice.endAngle
                        )}
                        fill={slice.color}
                        role="button"
                        tabIndex={0}
                        aria-label={
                            `${slice.name}: ${money(slice.value)}, ` +
                            `${percentage(slice.percentage)}%`
                        }
                        onMouseEnter={() => setHoveredIndex(index)}
                        onMouseLeave={() => setHoveredIndex(null)}
                        onFocus={() => setFocusedIndex(index)}
                        onBlur={() =>
                            setFocusedIndex((current) =>
                                current === index ? null : current
                            )
                        }
                        onClick={() => setFocusedIndex(index)}
                        onKeyDown={(event) => {
                            if (
                                event.key === "Enter" ||
                                event.key === " "
                            ) {
                                event.preventDefault();
                                setFocusedIndex(index);
                            }
                        }}
                    />
                ))}

                <circle
                    className="product-reports__pie-hole"
                    cx="120"
                    cy="120"
                    r="58"
                    fill="#fff"
                    pointerEvents="none"
                />
            </svg>

            <div
                className={
                    "product-reports__pie-center" +
                    (activeSlice ? " is-hovered" : "")
                }
            >
                {activeSlice ? (
                    <>
                        <span className="product-reports__pie-name">
                            {activeSlice.name}
                        </span>

                        <span className="product-reports__pie-value">
                            {money(activeSlice.value)}
                        </span>

                        <span className="product-reports__pie-percentage">
                            {percentage(activeSlice.percentage)}%
                        </span>
                    </>
                ) : (
                    <span className="product-reports__pie-total">
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
        .replace(/"/g, "&quot;");
}

function reportPdf(rows, range, title, popup) {
    const totals = sumRows(rows);

    const period =
        range.from && range.to
            ? new Date(range.from + "T00:00:00").toLocaleDateString("pt-BR") +
              " até " +
              new Date(range.to + "T00:00:00").toLocaleDateString("pt-BR")
            : "Todos os períodos";

    const body = rows
        .map(
            (row, index) =>
                "<tr><td>" +
                (index + 1) +
                "</td><td>" +
                safe(row.name) +
                "</td><td>" +
                safe(row.unit_measure || "UN") +
                "</td><td>" +
                qty(row.units_purchased) +
                "</td><td>" +
                qty(row.units_sold) +
                "</td><td>" +
                qty(row.units_lost) +
                "</td><td>" +
                money(row.entry_cost) +
                "</td><td>" +
                money(row.sales_cost) +
                "</td><td>" +
                money(row.loss_cost) +
                "</td><td>" +
                money(row.revenue) +
                "</td></tr>"
        )
        .join("");

    const html =
        "<!doctype html><html lang='pt-BR'><head><meta charset='utf-8'><title>" +
        safe(title) +
        "</title><style>" +
        "@page{size:A4 landscape;margin:12mm}" +
        "*{box-sizing:border-box}" +
        "body{font:10pt Arial;color:#18242b}" +
        "h1{font-size:18pt;margin:0 0 4mm}" +
        ".meta{color:#52616b;line-height:1.5;margin-bottom:6mm}" +
        ".totals{display:flex;gap:8mm;margin-bottom:5mm}" +
        ".totals b{display:block;margin-bottom:1mm}" +
        "table{width:100%;border-collapse:collapse;font-size:8pt}" +
        "th,td{padding:2mm 1.4mm;border:1px solid #d5dadd;text-align:right}" +
        "th{background:#f0f2f3}" +
        "td:nth-child(2),th:nth-child(2){text-align:left}" +
        ".total{font-weight:bold;background:#f5f6f7}" +
        ".note{margin-top:5mm;color:#5b6870;font-size:8pt}" +
        "</style></head><body><h1>" +
        safe(title) +
        "</h1><div class='meta'>Período: " +
        safe(period) +
        "<br>Gerado em: " +
        safe(new Date().toLocaleString("pt-BR")) +
        " · Produtos listados: " +
        rows.length +
        "</div><div class='totals'><span><b>Ganhos</b>" +
        money(totals.revenue) +
        "</span><span><b>Custos de entrada</b>" +
        money(totals.entryCost) +
        "</span><span><b>Perdas</b>" +
        money(totals.lossCost) +
        "</span><span><b>Saldo líquido</b>" +
        money(totals.revenue - totals.entryCost - totals.lossCost) +
        "</span></div><table><thead><tr><th>#</th><th>Produto</th><th>Unid.</th><th>Unid. Compradas</th><th>Unid. Vendidas</th><th>Unid. Perdidas</th><th>Custo Entradas</th><th>Custo Vendas</th><th>Custo Perdas</th><th>Ganhos</th></tr></thead><tbody>" +
        body +
        "<tr class='total'><td colspan='3'>TOTAL</td><td>" +
        qty(totals.purchased) +
        "</td><td>" +
        qty(totals.sold) +
        "</td><td>" +
        qty(totals.lost) +
        "</td><td>" +
        money(totals.entryCost) +
        "</td><td>" +
        money(totals.salesCost) +
        "</td><td>" +
        money(totals.lossCost) +
        "</td><td>" +
        money(totals.revenue) +
        "</td></tr></tbody></table><p class='note'>Custos de venda e perdas usam o custo gravado em cada movimentação. Vendas legadas sem esse dado não recebem uma margem estimada.</p><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),200));</script></body></html>";

    popup.document.open();
    popup.document.write(html);
    popup.document.close();
}

export default function ProductReportsPage() {
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

        getProductReports({}, controller.signal)
            .then(setRows)
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
        ...visible.flatMap((row) =>
            series.map((item) => Number(row[item.key]) || 0)
        )
    );

    const net =
        allTotals.revenue -
        allTotals.entryCost -
        allTotals.lossCost;

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
            const data = await getProductReports(range);

            reportPdf(
                ids ? data.filter((row) => ids.includes(row.id)) : data,
                range,
                title,
                popup
            );

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
            "Relatório de Produtos - Período selecionado"
        );
    }

    function exportSelected() {
        if (!selectedIds.length) return;

        exportPdf(
            {},
            selectedIds,
            selectedIds.length > 1
                ? "Relatório dos Produtos Selecionados"
                : "Relatório do Produto Selecionado"
        );
    }

    return (
        <main className="product-reports">
            <header className="product-reports__header">
                <h1>POSSO AJUDAR?</h1>
                <span>Relatório - Produtos</span>
            </header>

            <div className="product-reports__content">
                {error && (
                    <p className="product-reports__error" role="alert">
                        {error}
                    </p>
                )}

                <div className="product-reports__visuals">
                    <section className="product-reports__panel product-reports__bars">
                        <div className="product-reports__panel-title">
                            <h2>Comparativo de Produtos</h2>

                            <div className="product-reports__legend">
                                {series.map((item) => (
                                    <span key={item.key}>
                                        <i
                                            style={{
                                                background: item.color
                                            }}
                                        />
                                        {item.label}
                                    </span>
                                ))}
                            </div>
                        </div>

                        {loading ? (
                            <p className="product-reports__empty">
                                Carregando relatórios...
                            </p>
                        ) : !rows.length ? (
                            <p className="product-reports__empty">
                                Não há produtos para exibir.
                            </p>
                        ) : (
                            <>
                                <div className="product-reports__chart">
                                    <button
                                        type="button"
                                        aria-label="Produtos anteriores"
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
                                        aria-label="Ganhos, custos e perdas por produto"
                                    >
                                        {[0, 1, 2, 3, 4].map((tick) => {
                                            const value =
                                                (maxValue * tick) / 4;
                                            const y = 328 - tick * 68;

                                            return (
                                                <g key={tick}>
                                                    <line
                                                        x1="54"
                                                        y1={y}
                                                        x2="836"
                                                        y2={y}
                                                        stroke="#e5e8e9"
                                                    />
                                                    <text
                                                        x="48"
                                                        y={y + 4}
                                                        textAnchor="end"
                                                    >
                                                        {qty(value)}
                                                    </text>
                                                </g>
                                            );
                                        })}

                                        {visible.map((row, index) => {
                                            const x = 82 + index * 126;

                                            const values = series.map(
                                                (item) =>
                                                    Number(row[item.key]) || 0
                                            );

                                            return (
                                                <g
                                                    key={row.id}
                                                    role="button"
                                                    tabIndex="0"
                                                    aria-pressed={selectedSet.has(
                                                        row.id
                                                    )}
                                                    aria-label={
                                                        row.name +
                                                        " — " +
                                                        series
                                                            .map(
                                                                (
                                                                    item,
                                                                    index
                                                                ) =>
                                                                    item.label +
                                                                    " " +
                                                                    qty(
                                                                        values[
                                                                            index
                                                                        ]
                                                                    ) +
                                                                    " " +
                                                                    (row.unit_measure ||
                                                                        "UN")
                                                            )
                                                            .join(", ")
                                                    }
                                                    className={
                                                        "product-reports__bar-group" +
                                                        (selectedSet.has(row.id)
                                                            ? " is-selected"
                                                            : "")
                                                    }
                                                    onClick={() =>
                                                        toggle(row.id)
                                                    }
                                                    onKeyDown={(event) => {
                                                        if (
                                                            event.key ===
                                                                "Enter" ||
                                                            event.key === " "
                                                        ) {
                                                            event.preventDefault();
                                                            toggle(row.id);
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

                                                    {values.map(
                                                        (
                                                            value,
                                                            seriesIndex
                                                        ) => {
                                                            const height =
                                                                (value /
                                                                    maxValue) *
                                                                250;

                                                            return (
                                                                <rect
                                                                    key={
                                                                        series[
                                                                            seriesIndex
                                                                        ].key
                                                                    }
                                                                    className="product-reports__bar"
                                                                    x={
                                                                        x +
                                                                        seriesIndex *
                                                                            25
                                                                    }
                                                                    y={
                                                                        328 -
                                                                        height
                                                                    }
                                                                    width="20"
                                                                    height={
                                                                        height
                                                                    }
                                                                    rx="1"
                                                                    fill={
                                                                        series[
                                                                            seriesIndex
                                                                        ].color
                                                                    }
                                                                />
                                                            );
                                                        }
                                                    )}

                                                    <text
                                                        className="product-reports__bar-label"
                                                        x={x + 20}
                                                        y="355"
                                                        textAnchor="end"
                                                        transform={
                                                            "rotate(-18 " +
                                                            (x + 20) +
                                                            " 355)"
                                                        }
                                                    >
                                                        {row.name.length > 22
                                                            ? row.name.slice(
                                                                  0,
                                                                  21
                                                              ) + "…"
                                                            : row.name}
                                                    </text>
                                                </g>
                                            );
                                        })}
                                    </svg>

                                    <button
                                        type="button"
                                        aria-label="Próximos produtos"
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

                                <p className="product-reports__chart-page">
                                    Produtos {chartPage * 6 + 1}–
                                    {Math.min(
                                        chartPage * 6 + visible.length,
                                        rows.length
                                    )}{" "}
                                    de {rows.length}. As barras mostram unidades
                                    por produto. Clique para selecionar ou
                                    remover produtos da seleção.
                                </p>
                            </>
                        )}
                    </section>

                    <section className="product-reports__panel product-reports__selected">
                        <h2>
                            {selectedRows.length
                                ? selectedRows.length === 1
                                    ? selectedRows[0].name
                                    : `${selectedRows.length} produtos selecionados`
                                : "Produtos selecionados"}
                        </h2>

                        {selectedRows.length ? (
                            <>
                                <PieChart totals={selectedTotals} />

                                <div className="product-reports__metrics">
                                    {selectedRows.length === 1 ? (
                                        <>
                                            <p>
                                                <span>Custos</span>
                                                <b>
                                                    {qty(
                                                        selectedTotals.purchased
                                                    )}{" "}
                                                    {selectedRows[0]
                                                        .unit_measure || "UN"}
                                                </b>
                                                <strong>
                                                    {money(
                                                        selectedTotals.entryCost
                                                    )}
                                                </strong>
                                            </p>

                                            <p>
                                                <span>Perdas</span>
                                                <b>
                                                    {qty(selectedTotals.lost)}{" "}
                                                    {selectedRows[0]
                                                        .unit_measure || "UN"}
                                                </b>
                                                <strong>
                                                    {money(
                                                        selectedTotals.lossCost
                                                    )}
                                                </strong>
                                            </p>

                                            <p>
                                                <span>Ganhos</span>
                                                <b>
                                                    {qty(selectedTotals.sold)}{" "}
                                                    {selectedRows[0]
                                                        .unit_measure || "UN"}
                                                </b>
                                                <strong>
                                                    {money(
                                                        selectedTotals.revenue
                                                    )}
                                                </strong>
                                            </p>
                                        </>
                                    ) : (
                                        <>
                                            <p>
                                                <span>Custos totais</span>
                                                <strong>
                                                    {money(
                                                        selectedTotals.entryCost
                                                    )}
                                                </strong>
                                            </p>

                                            <p>
                                                <span>Perdas totais</span>
                                                <strong>
                                                    {money(
                                                        selectedTotals.lossCost
                                                    )}
                                                </strong>
                                            </p>

                                            <p>
                                                <span>Ganhos totais</span>
                                                <strong>
                                                    {money(
                                                        selectedTotals.revenue
                                                    )}
                                                </strong>
                                            </p>

                                            <small>
                                                As quantidades não são somadas
                                                porque os produtos podem usar
                                                unidades diferentes.
                                            </small>
                                        </>
                                    )}

                                    {selectedTotals.unknown > 0 && (
                                        <small>
                                            Vendas antigas sem custo histórico
                                            não entram no cálculo de custos de
                                            venda.
                                        </small>
                                    )}
                                </div>
                            </>
                        ) : (
                            <p className="product-reports__empty">
                                Clique em uma barra para ver os valores dos
                                produtos selecionados.
                            </p>
                        )}
                    </section>

                    <aside className="product-reports__panel product-reports__totals">
                        <h2>Totais de todos os produtos</h2>

                        <div className="product-reports__total-list">
                            <p>
                                <span>GANHOS</span>
                                <b>{money(allTotals.revenue)}</b>
                            </p>

                            <p>
                                <span>GASTOS</span>
                                <b>{money(allTotals.entryCost)}</b>
                            </p>

                            <p>
                                <span>PERDAS</span>
                                <b>{money(allTotals.lossCost)}</b>
                            </p>
                        </div>

                        <div className="product-reports__net">
                            <PieChart totals={allTotals} small />

                            <div>
                                <strong className="is-gain">
                                    {money(allTotals.revenue)}
                                </strong>

                                <span>−</span>

                                <strong className="is-cost">
                                    ({money(allTotals.entryCost)})
                                </strong>

                                <span>−</span>

                                <strong className="is-loss">
                                    {money(allTotals.lossCost)}
                                </strong>

                                <span>=</span>

                                <strong
                                    className={
                                        net >= 0 ? "is-gain" : "is-loss"
                                    }
                                >
                                    {money(net)}
                                </strong>

                                <small>Saldo líquido</small>
                            </div>
                        </div>

                        {allTotals.unknown > 0 && (
                            <small className="product-reports__notice">
                                {allTotals.unknown} venda(s) antiga(s) sem
                                custo histórico.
                            </small>
                        )}
                    </aside>
                </div>

                <section
                    className="product-reports__exports"
                    aria-label="Exportar relatórios PDF"
                >
                    <button
                        disabled={loading || exporting}
                        onClick={() =>
                            exportPdf(
                                {},
                                null,
                                "Relatório de Produtos - Todos os períodos"
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
                                "Relatório de Produtos - Mês Atual"
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
                            ? "▧ Exportar Produtos"
                            : "▧ Relatório Produto"}
                    </button>
                </section>
            </div>

            {dateModal && (
                <div
                    className="product-reports__backdrop"
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
                        className="product-reports__date-modal"
                        onSubmit={exportDates}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="reports-date-title"
                    >
                        <button
                            type="button"
                            className="product-reports__close"
                            aria-label="Fechar"
                            onClick={() => setDateModal(false)}
                        >
                            ×
                        </button>

                        <h2 id="reports-date-title">
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

                        <div className="product-reports__modal-actions">
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