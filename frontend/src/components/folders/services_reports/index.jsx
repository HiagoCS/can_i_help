import { useEffect, useMemo, useState } from "react";
import { getServiceReports } from "@/data/api/services";
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

function sumRows(rows) {
    return rows.reduce(
        (total, row) => {
            const revenue = Number(row.revenue) || 0;
            const salesCost = Number(row.sales_cost) || 0;

            return {
                revenue: total.revenue + revenue,
                salesCost: total.salesCost + salesCost,
                unitsSold: total.unitsSold + (Number(row.units_sold) || 0),
                unknown:
                    total.unknown +
                    (Number(row.unknown_sale_cost_count) || 0)
            };
        },
        {
            revenue: 0,
            salesCost: 0,
            unitsSold: 0,
            unknown: 0
        }
    );
}

function PieChart({ rows, small = false }) {
    const values = rows.map((row, index) => ({
        name: row.name,
        value: Math.max(0, Number(row.revenue) || 0),
        color: pieColors[index % pieColors.length]
    }));

    const total = values.reduce((sum, item) => sum + item.value, 0);
    let start = 0;

    const stops = values.map((item) => {
        const end = total
            ? start + (item.value / total) * 360
            : start;

        const stop = `${item.color} ${start}deg ${end}deg`;
        start = end;

        return stop;
    });

    return (
        <div
            className={
                "services-reports__pie" +
                (small ? " services-reports__pie--small" : "")
            }
            style={{
                background: total
                    ? `conic-gradient(${stops.join(",")})`
                    : "#d9dfe2"
            }}
            role="img"
            aria-label={
                "Receita total dos serviços: " + money(total)
            }
        >
            <span>{total ? money(total) : "Sem dados"}</span>
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
        .map((row, index) => {
            const revenue = Number(row.revenue) || 0;
            const cost = Number(row.sales_cost) || 0;
            const profit = revenue - cost;

            return (
                "<tr><td>" +
                (index + 1) +
                "</td><td>" +
                safe(row.name) +
                "</td><td>" +
                qty(row.units_sold) +
                "</td><td>" +
                money(cost) +
                "</td><td>" +
                money(revenue) +
                "</td><td>" +
                money(profit) +
                "</td></tr>"
            );
        })
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
        ".totals{display:flex;flex-wrap:wrap;gap:8mm;margin-bottom:5mm}" +
        ".totals b{display:block;margin-bottom:1mm}" +
        "table{width:100%;border-collapse:collapse;font-size:9pt}" +
        "th,td{padding:2.5mm 1.5mm;border:1px solid #d5dadd;text-align:right}" +
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
        " · Serviços listados: " +
        rows.length +
        "</div><div class='totals'><span><b>Unidades vendidas</b>" +
        qty(totals.unitsSold) +
        "</span><span><b>Receita</b>" +
        money(totals.revenue) +
        "</span><span><b>Custos de venda</b>" +
        money(totals.salesCost) +
        "</span><span><b>Resultado bruto</b>" +
        money(totals.revenue - totals.salesCost) +
        "</span></div><table><thead><tr><th>#</th><th>Serviço</th><th>Unidades vendidas</th><th>Custo de venda</th><th>Receita</th><th>Resultado bruto</th></tr></thead><tbody>" +
        body +
        "<tr class='total'><td colspan='2'>TOTAL</td><td>" +
        qty(totals.unitsSold) +
        "</td><td>" +
        money(totals.salesCost) +
        "</td><td>" +
        money(totals.revenue) +
        "</td><td>" +
        money(totals.revenue - totals.salesCost) +
        "</td></tr></tbody></table><p class='note'>O resultado bruto corresponde à receita menos os custos de venda retornados pela API. Registros sem custo histórico confiável devem ser identificados pelo backend.</p><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),200));</script></body></html>";

    popup.document.open();
    popup.document.write(html);
    popup.document.close();
}

export default function ServicesReportsPage() {
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

        getServiceReports({}, controller.signal)
            .then((data) => {
                const sorted = [...data].sort(
                    (a, b) =>
                        (Number(b.units_sold) || 0) -
                        (Number(a.units_sold) || 0)
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
        ...visible.map((row) => Number(row.units_sold) || 0)
    );

    const net = allTotals.revenue - allTotals.salesCost;

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
            const data = await getServiceReports(range);
            const reportRows = ids
                ? data.filter((row) => ids.includes(row.id))
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
            "Relatório de Serviços - Período selecionado"
        );
    }

    function exportSelected() {
        if (!selectedIds.length) return;

        exportPdf(
            {},
            selectedIds,
            selectedIds.length > 1
                ? "Relatório dos Serviços Selecionados"
                : "Relatório do Serviço Selecionado"
        );
    }

    return (
        <main className="services-reports">
            <header className="services-reports__header">
                <h1>POSSO AJUDAR?</h1>
                <span>Relatório - Serviços</span>
            </header>

            <div className="services-reports__content">
                {error && (
                    <p className="services-reports__error" role="alert">
                        {error}
                    </p>
                )}

                <div className="services-reports__visuals">
                    <section className="services-reports__panel services-reports__bars">
                        <div className="services-reports__panel-title">
                            <h2>Comparativo de Serviços</h2>

                            <div className="services-reports__legend">
                                <span>
                                    <i style={{ background: chartColor }} />
                                    Unidades vendidas
                                </span>
                            </div>
                        </div>

                        {loading ? (
                            <p className="services-reports__empty">
                                Carregando relatórios...
                            </p>
                        ) : !rows.length ? (
                            <p className="services-reports__empty">
                                Não há serviços para exibir.
                            </p>
                        ) : (
                            <>
                                <div className="services-reports__chart">
                                    <button
                                        type="button"
                                        aria-label="Serviços anteriores"
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
                                        aria-label="Unidades vendidas por serviço"
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
                                            const value =
                                                Number(row.units_sold) || 0;
                                            const height =
                                                (value / maxValue) * 250;
                                            const selected =
                                                selectedSet.has(row.id);

                                            return (
                                                <g
                                                    key={row.id}
                                                    role="button"
                                                    tabIndex="0"
                                                    aria-pressed={selected}
                                                    aria-label={
                                                        row.name +
                                                        " — " +
                                                        qty(value) +
                                                        " unidades vendidas"
                                                    }
                                                    className={
                                                        "services-reports__bar-group" +
                                                        (selected
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

                                                    <rect
                                                        className="services-reports__bar"
                                                        x={x + 15}
                                                        y={328 - height}
                                                        width="36"
                                                        height={height}
                                                        rx="2"
                                                        fill={chartColor}
                                                    />

                                                    <text
                                                        className="services-reports__bar-label"
                                                        x={x + 34}
                                                        y={Math.max(
                                                            28,
                                                            320 - height
                                                        )}
                                                        textAnchor="middle"
                                                    >
                                                        {qty(value)}
                                                    </text>

                                                    <text
                                                        className="services-reports__bar-label"
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
                                        aria-label="Próximos serviços"
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

                                <p className="services-reports__chart-page">
                                    Serviços {chartPage * 6 + 1}–
                                    {Math.min(
                                        chartPage * 6 + visible.length,
                                        rows.length
                                    )}{" "}
                                    de {rows.length}. As barras mostram as
                                    unidades vendidas. Clique em uma barra
                                    para selecionar ou remover um serviço.
                                </p>
                            </>
                        )}
                    </section>

                    <section className="services-reports__panel services-reports__selected">
                        <h2>
                            {selectedRows.length
                                ? selectedRows.length === 1
                                    ? selectedRows[0].name
                                    : `${selectedRows.length} serviços selecionados`
                                : "Serviços selecionados"}
                        </h2>

                        {selectedRows.length ? (
                            <>
                                <PieChart rows={selectedRows} />

                                <div className="services-reports__metrics">
                                    <p>
                                        <span>Unidades vendidas</span>
                                        <b>
                                            {qty(selectedTotals.unitsSold)}
                                        </b>
                                    </p>

                                    <p>
                                        <span>Custos de venda</span>
                                        <strong>
                                            {money(selectedTotals.salesCost)}
                                        </strong>
                                    </p>

                                    <p>
                                        <span>Receita</span>
                                        <strong>
                                            {money(selectedTotals.revenue)}
                                        </strong>
                                    </p>

                                    <p>
                                        <span>Resultado bruto</span>
                                        <strong
                                            className={
                                                selectedTotals.revenue -
                                                    selectedTotals.salesCost >=
                                                0
                                                    ? "is-gain"
                                                    : "is-loss"
                                            }
                                        >
                                            {money(
                                                selectedTotals.revenue -
                                                    selectedTotals.salesCost
                                            )}
                                        </strong>
                                    </p>

                                    {selectedRows.length > 1 && (
                                        <small>
                                            O gráfico circular mostra a
                                            participação de cada serviço na
                                            receita selecionada.
                                        </small>
                                    )}

                                    {selectedTotals.unknown > 0 && (
                                        <small>
                                            {selectedTotals.unknown} registro(s)
                                            sem custo histórico confiável.
                                        </small>
                                    )}
                                </div>
                            </>
                        ) : (
                            <p className="services-reports__empty">
                                Clique em uma barra para consultar os valores
                                dos serviços selecionados.
                            </p>
                        )}
                    </section>

                    <aside className="services-reports__panel services-reports__totals">
                        <h2>Totais de todos os serviços</h2>

                        <div className="services-reports__total-list">
                            <p>
                                <span>RECEITA</span>
                                <b>{money(allTotals.revenue)}</b>
                            </p>

                            <p>
                                <span>CUSTOS</span>
                                <b>{money(allTotals.salesCost)}</b>
                            </p>

                            <p>
                                <span>UNIDADES VENDIDAS</span>
                                <b>{qty(allTotals.unitsSold)}</b>
                            </p>
                        </div>

                        <div className="services-reports__net">
                            <PieChart rows={rows} small />

                            <div>
                                <strong className="is-gain">
                                    {money(allTotals.revenue)}
                                </strong>
                                <span>−</span>
                                <strong className="is-cost">
                                    ({money(allTotals.salesCost)})
                                </strong>
                                <span>=</span>
                                <strong
                                    className={
                                        net >= 0 ? "is-gain" : "is-loss"
                                    }
                                >
                                    {money(net)}
                                </strong>
                                <small>Resultado bruto</small>
                            </div>
                        </div>

                        {allTotals.unknown > 0 && (
                            <small className="services-reports__notice">
                                {allTotals.unknown} registro(s) sem custo
                                histórico confiável. Verifique os dados antes
                                de interpretar o resultado.
                            </small>
                        )}
                    </aside>
                </div>

                <section
                    className="services-reports__exports"
                    aria-label="Exportar relatórios PDF"
                >
                    <button
                        disabled={loading || exporting}
                        onClick={() =>
                            exportPdf(
                                {},
                                null,
                                "Relatório de Serviços - Todos os períodos"
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
                                "Relatório de Serviços - Mês Atual"
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
                            ? "▧ Exportar Serviços"
                            : "▧ Relatório Serviço"}
                    </button>
                </section>
            </div>

            {dateModal && (
                <div
                    className="services-reports__backdrop"
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
                        className="services-reports__date-modal"
                        onSubmit={exportDates}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="services-reports-date-title"
                    >
                        <button
                            type="button"
                            className="services-reports__close"
                            aria-label="Fechar"
                            onClick={() => setDateModal(false)}
                        >
                            ×
                        </button>

                        <h2 id="services-reports-date-title">
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

                        <div className="services-reports__modal-actions">
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