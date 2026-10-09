import { useEffect, useMemo, useState } from "react";

import { getProductReports } from "@/data/api/products";
import { getServiceReports } from "@/data/api/services";
import { getClientReports } from "@/data/api/clients";

import OnlineUsers from "@/components/folders/settings/online_users";

import "./style.scss";

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

function useReportData(fetchData, fallbackMessage) {
    const [state, setState] = useState({
        rows: [],
        loading: true,
        error: ""
    });

    useEffect(() => {
        const controller = new AbortController();

        setState({
            rows: [],
            loading: true,
            error: ""
        });

        fetchData(controller.signal)
            .then((data) => {
                if (controller.signal.aborted) return;

                setState({
                    rows: Array.isArray(data) ? data : [],
                    loading: false,
                    error: ""
                });
            })
            .catch((reason) => {
                if (controller.signal.aborted) return;

                setState({
                    rows: [],
                    loading: false,
                    error:
                        reason instanceof Error
                            ? reason.message
                            : fallbackMessage
                });
            });

        return () => controller.abort();
    }, [fetchData, fallbackMessage]);

    return state;
}

/**
 * Cria um setor de rosca usando os ângulos inicial e final.
 * O viewBox 0 0 100 100 torna o gráfico escalável.
 */
function donutSlicePath(startAngle, endAngle) {
    const outerRadius = 47;
    const innerRadius = 29;
    const sweep = endAngle - startAngle;

    function point(angle, radius) {
        const radians = ((angle - 90) * Math.PI) / 180;

        return {
            x: 50 + radius * Math.cos(radians),
            y: 50 + radius * Math.sin(radians)
        };
    }

    // Desenha uma rosca completa quando há apenas um setor.
    if (sweep >= 359.999) {
        const outerStart = point(startAngle, outerRadius);
        const outerMiddle = point(startAngle + 180, outerRadius);
        const innerStart = point(startAngle, innerRadius);
        const innerMiddle = point(startAngle + 180, innerRadius);

        return [
            `M ${outerStart.x} ${outerStart.y}`,
            `A ${outerRadius} ${outerRadius} 0 1 1 ${outerMiddle.x} ${outerMiddle.y}`,
            `A ${outerRadius} ${outerRadius} 0 1 1 ${outerStart.x} ${outerStart.y}`,
            "Z",
            `M ${innerStart.x} ${innerStart.y}`,
            `A ${innerRadius} ${innerRadius} 0 1 0 ${innerMiddle.x} ${innerMiddle.y}`,
            `A ${innerRadius} ${innerRadius} 0 1 0 ${innerStart.x} ${innerStart.y}`,
            "Z"
        ].join(" ");
    }

    const outerStart = point(startAngle, outerRadius);
    const outerEnd = point(endAngle, outerRadius);
    const innerEnd = point(endAngle, innerRadius);
    const innerStart = point(startAngle, innerRadius);
    const largeArc = sweep > 180 ? 1 : 0;

    return [
        `M ${outerStart.x} ${outerStart.y}`,
        `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
        `L ${innerEnd.x} ${innerEnd.y}`,
        `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
        "Z"
    ].join(" ");
}

function PieChart({
    data,
    centerLabel = "Total",
    formatValue = compactMoney
}) {
    const [activeIndex, setActiveIndex] = useState(null);

    const slices = useMemo(
        () =>
            (Array.isArray(data) ? data : [])
                .map((item, index) => ({
                    ...item,
                    value: Math.max(0, Number(item.value) || 0),
                    color: item.color || pieColors[index % pieColors.length]
                }))
                .filter((item) => item.value > 0),
        [data]
    );

    const total = useMemo(
        () => slices.reduce((sum, item) => sum + item.value, 0),
        [slices]
    );

    const activeSlice =
        activeIndex !== null ? slices[activeIndex] ?? null : null;

    let currentAngle = 0;

    const paths = slices.map((item, index) => {
        const startAngle = currentAngle;

        currentAngle += total
            ? (item.value / total) * 360
            : 0;

        return {
            ...item,
            index,
            startAngle,
            endAngle: currentAngle
        };
    });

    return (
        <div
            className="home-totals-card__chart"
            role="group"
            aria-label={`Gráfico de ${centerLabel.toLowerCase()}`}
        >
            <svg
                className="home-totals-card__pie"
                viewBox="0 0 100 100"
                role="img"
                aria-label={`${centerLabel}: ${formatValue(total)}. Passe o mouse ou navegue pelos setores para ver os valores.`}
                onMouseLeave={() => setActiveIndex(null)}
            >
                <circle
                    cx="50"
                    cy="50"
                    r="47"
                    fill="#e3e8eb"
                />

                {paths.map((slice) => {
                    const isActive = activeIndex === slice.index;

                    return (
                        <path
                            key={`${slice.label}-${slice.index}`}
                            className={
                                "home-totals-card__pie-slice" +
                                (isActive ? " is-active" : "")
                            }
                            d={donutSlicePath(
                                slice.startAngle,
                                slice.endAngle
                            )}
                            fill={slice.color}
                            fillRule="evenodd"
                            stroke="#fff"
                            strokeWidth="0.8"
                            transform={
                                isActive
                                    ? "translate(50 50) scale(1.06) translate(-50 -50)"
                                    : undefined
                            }
                            tabIndex="0"
                            role="button"
                            aria-label={`${slice.label}: ${formatValue(slice.value)}`}
                            aria-pressed={isActive}
                            onMouseEnter={() =>
                                setActiveIndex(slice.index)
                            }
                            onFocus={() => setActiveIndex(slice.index)}
                            onBlur={() => setActiveIndex(null)}
                            onKeyDown={(event) => {
                                if (
                                    event.key === "Enter" ||
                                    event.key === " "
                                ) {
                                    event.preventDefault();
                                    setActiveIndex((current) =>
                                        current === slice.index
                                            ? null
                                            : slice.index
                                    );
                                }

                                if (event.key === "Escape") {
                                    setActiveIndex(null);
                                    event.currentTarget.blur();
                                }
                            }}
                        >
                            <title>
                                {slice.label}: {formatValue(slice.value)}
                            </title>
                        </path>
                    );
                })}

                <circle
                    cx="50"
                    cy="50"
                    r="27"
                    fill="#fff"
                    pointerEvents="none"
                />
            </svg>

            <div className="home-totals-card__chart-center" aria-live="polite">
                <span title={activeSlice?.label ?? centerLabel}>
                    {activeSlice?.label ?? centerLabel}
                </span>

                <strong>
                    {formatValue(activeSlice?.value ?? total)}
                </strong>
            </div>
        </div>
    );
}

/**
 * Mantém os cinco itens de maior valor no gráfico
 * e reúne o restante em um setor "Outros".
 */
function createTopSlices(rows, valueKey, othersLabel) {
    const ranked = [...rows]
        .map((row) => ({
            label: String(row.name || "Sem nome"),
            value: Math.max(0, Number(row[valueKey]) || 0)
        }))
        .filter((row) => row.value > 0)
        .sort((a, b) => b.value - a.value);

    const top = ranked.slice(0, 5).map((row, index) => ({
        ...row,
        color: pieColors[index % pieColors.length]
    }));

    const rest = ranked.slice(5).reduce(
        (sum, row) => sum + row.value,
        0
    );

    if (rest > 0) {
        top.push({
            label: othersLabel,
            value: rest,
            color: pieColors[5]
        });
    }

    return top;
}

function TotalsCard({
    className,
    title,
    loading,
    error,
    metrics,
    footnote,
    chartData,
    chartLabel
}) {
    return (
        <section className={`home-totals-card ${className}`}>
            <h2>{title}</h2>

            {loading ? (
                <p className="home-totals-card__message">
                    Carregando indicadores...
                </p>
            ) : error ? (
                <p
                    className="home-totals-card__message home-totals-card__message--error"
                    role="alert"
                    title={error}
                >
                    Não foi possível carregar os indicadores.
                </p>
            ) : (
                <>
                    <div className="home-totals-card__body">
                        <PieChart
                            data={chartData}
                            centerLabel={chartLabel}
                        />

                        <div className="home-totals-card__metrics">
                            {metrics.map((metric) => (
                                <div
                                    className="home-totals-card__metric"
                                    key={metric.label}
                                >
                                    <span>{metric.label}</span>

                                    <strong className={metric.tone ?? ""}>
                                        {metric.value}
                                    </strong>
                                </div>
                            ))}
                        </div>
                    </div>

                    {footnote && (
                        <small className="home-totals-card__footnote">
                            {footnote}
                        </small>
                    )}
                </>
            )}
        </section>
    );
}

function ProductTotalsCard() {
    const fetchData = useMemo(
        () => (signal) => getProductReports({}, signal),
        []
    );

    const { rows, loading, error } = useReportData(
        fetchData,
        "Não foi possível carregar os totais dos produtos."
    );

    const totals = useMemo(
        () =>
            rows.reduce(
                (total, row) => ({
                    revenue:
                        total.revenue + (Number(row.revenue) || 0),
                    entryCost:
                        total.entryCost + (Number(row.entry_cost) || 0),
                    lossCost:
                        total.lossCost + (Number(row.loss_cost) || 0),
                    purchased:
                        total.purchased +
                        (Number(row.units_purchased) || 0),
                    sold:
                        total.sold + (Number(row.units_sold) || 0),
                    lost:
                        total.lost + (Number(row.units_lost) || 0),
                    unknown:
                        total.unknown +
                        (Number(row.unknown_sale_cost_count) || 0) +
                        (Number(row.unknown_loss_cost_count) || 0)
                }),
                {
                    revenue: 0,
                    entryCost: 0,
                    lossCost: 0,
                    purchased: 0,
                    sold: 0,
                    lost: 0,
                    unknown: 0
                }
            ),
        [rows]
    );

    const net =
        totals.revenue - totals.entryCost - totals.lossCost;

    const chartData = [
        {
            label: "Ganhos",
            value: totals.revenue,
            color: "#31df55"
        },
        {
            label: "Custos de entrada",
            value: totals.entryCost,
            color: "#f06d8d"
        },
        {
            label: "Perdas",
            value: totals.lossCost,
            color: "#ffc94f"
        }
    ];

    return (
        <TotalsCard
            className="home-totals-card--products"
            title="Totais de todos os produtos"
            loading={loading}
            error={error}
            chartData={chartData}
            chartLabel="Composição"
            metrics={[
                {
                    label: "Ganhos",
                    value: money(totals.revenue),
                    tone: "is-gain"
                },
                {
                    label: "Custos de entrada",
                    value: money(totals.entryCost),
                    tone: "is-cost"
                },
                {
                    label: "Perdas",
                    value: money(totals.lossCost),
                    tone: "is-loss"
                },
                {
                    label: "Saldo líquido",
                    value: money(net),
                    tone: net >= 0 ? "is-gain" : "is-loss"
                }
            ]}
            footnote={
                totals.unknown > 0
                    ? `${qty(totals.unknown)} registro(s) sem custo histórico confiável.`
                    : `${qty(totals.purchased)} compradas · ${qty(totals.sold)} vendidas · ${qty(totals.lost)} perdidas.`
            }
        />
    );
}

function ServiceTotalsCard() {
    const fetchData = useMemo(
        () => (signal) => getServiceReports({}, signal),
        []
    );

    const { rows, loading, error } = useReportData(
        fetchData,
        "Não foi possível carregar os totais dos serviços."
    );

    const totals = useMemo(
        () =>
            rows.reduce(
                (total, row) => ({
                    revenue:
                        total.revenue + (Number(row.revenue) || 0),
                    salesCost:
                        total.salesCost + (Number(row.sales_cost) || 0),
                    unitsSold:
                        total.unitsSold + (Number(row.units_sold) || 0),
                    unknown:
                        total.unknown +
                        (Number(row.unknown_sale_cost_count) || 0)
                }),
                {
                    revenue: 0,
                    salesCost: 0,
                    unitsSold: 0,
                    unknown: 0
                }
            ),
        [rows]
    );

    const net = totals.revenue - totals.salesCost;

    const chartData = useMemo(
        () => createTopSlices(rows, "revenue", "Outros serviços"),
        [rows]
    );

    return (
        <TotalsCard
            className="home-totals-card--services"
            title="Totais de todos os serviços"
            loading={loading}
            error={error}
            chartData={chartData}
            chartLabel="Receita"
            metrics={[
                {
                    label: "Receita",
                    value: money(totals.revenue),
                    tone: "is-gain"
                },
                {
                    label: "Custos",
                    value: money(totals.salesCost),
                    tone: "is-cost"
                },
                {
                    label: "Unidades vendidas",
                    value: qty(totals.unitsSold),
                    tone: "is-quantity"
                },
                {
                    label: "Resultado bruto",
                    value: money(net),
                    tone: net >= 0 ? "is-gain" : "is-loss"
                }
            ]}
            footnote={
                totals.unknown > 0
                    ? `${qty(totals.unknown)} registro(s) sem custo histórico confiável.`
                    : `${rows.length} serviço(s) no relatório.`
            }
        />
    );
}

function ClientTotalsCard() {
    const fetchData = useMemo(
        () => (signal) => getClientReports({}, signal),
        []
    );

    const { rows, loading, error } = useReportData(
        fetchData,
        "Não foi possível carregar os totais dos clientes."
    );

    const totals = useMemo(
        () =>
            rows.reduce(
                (total, row) => ({
                    totalSpent:
                        total.totalSpent +
                        (Number(row.total_spent) || 0),
                    purchases:
                        total.purchases +
                        (Number(row.purchase_count) || 0),
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
            ),
        [rows]
    );

    const averageTicket = totals.purchases
        ? totals.totalSpent / totals.purchases
        : 0;

    const chartData = useMemo(
        () => createTopSlices(rows, "total_spent", "Outros clientes"),
        [rows]
    );

    return (
        <TotalsCard
            className="home-totals-card--clients"
            title="Totais de todos os clientes"
            loading={loading}
            error={error}
            chartData={chartData}
            chartLabel="Gasto"
            metrics={[
                {
                    label: "Clientes",
                    value: qty(totals.clients),
                    tone: "is-quantity"
                },
                {
                    label: "Compras",
                    value: qty(totals.purchases),
                    tone: "is-quantity"
                },
                {
                    label: "Itens comprados",
                    value: qty(totals.itemsBought),
                    tone: "is-cost"
                },
                {
                    label: "Total gasto",
                    value: money(totals.totalSpent),
                    tone: "is-gain"
                }
            ]}
            footnote={`Ticket médio por compra: ${money(averageTicket)}.`}
        />
    );
}

export default function HomePage() {
    return (
        <main
            className="system-home-dashboard"
            aria-label="Início do sistema"
        >
            <div className="system-home-dashboard__totals">
                <ProductTotalsCard />
                <ServiceTotalsCard />
                <ClientTotalsCard />
            </div>

            <aside
                className="system-home-dashboard__online"
                aria-label="Usuários online"
            >
                <OnlineUsers />
            </aside>
        </main>
    );
}