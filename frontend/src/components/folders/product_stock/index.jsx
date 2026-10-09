
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ColumnFilter from "@/components/column_filter";
import {
    adjustProductStock,
    getProductMovements,
    getProducts,
    getProductStock
} from "@/data/api/products";
import "./style.scss";

const money = (value) =>
    new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL"
    }).format(Number(value) || 0);

const qty = (value, unit) =>
    Number(value || 0).toLocaleString("pt-BR") + " " + (unit || "UN");

const stockColumns = [
    { key: "name", label: "Produto" },
    { key: "value", label: "Valor (R$)" },
    { key: "amount", label: "Quantidade total" },
    { key: "entry", label: "Última entrada" },
    { key: "sale", label: "Última venda" },
    { key: "exit", label: "Última saída" }
];

const initialStockColumnVisibility = Object.fromEntries(
    stockColumns.map((column) => [column.key, true])
);

const stockPageSize = 7;

function dateLabel(value, time = false) {
    if (!value) return "—";

    const date = new Date(String(value).replace(" ", "T"));

    if (Number.isNaN(date.getTime())) return value;

    return new Intl.DateTimeFormat(
        "pt-BR",
        time
            ? {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit"
            }
            : {
                day: "2-digit",
                month: "2-digit",
                year: "numeric"
            }
    ).format(date);
}

function typeLabel(item) {
    if (item.movement_type === "sale") return "Venda";

    if (
        item.movement_type === "stock_add" ||
        item.movement_type === "create"
    ) {
        return "Entrada";
    }

    if (item.movement_type === "stock_remove") return "Saída";

    if (item.movement_type === "deactivate") return "Desativação";

    return "Edição";
}

function typeClass(item) {
    if (item.movement_type === "sale") return "is-sale";

    if (
        item.movement_type === "stock_add" ||
        item.movement_type === "create"
    ) {
        return "is-entry";
    }

    if (item.movement_type === "stock_remove") return "is-exit";

    return "is-edit";
}

/*
 * Calcula o percentual de lucro utilizando os valores cadastrados
 * no produto, sem considerar quantidade vendida ou movimentações.
 *
 * Lucro (%) = (valor - custo) / custo * 100
 */
function productProfit(product) {
    if (
        !product ||
        product.cost == null ||
        product.value == null
    ) {
        return null;
    }

    const cost = Number(product.cost);
    const value = Number(product.value);

    if (
        !Number.isFinite(cost) ||
        !Number.isFinite(value) ||
        cost <= 0
    ) {
        return null;
    }

    return ((value - cost) / cost) * 100;
}

function exportPdf(product, movements) {
    const popup = window.open("", "_blank");

    if (!popup) {
        window.alert(
            "Permita a abertura de pop-ups para exportar o PDF."
        );
        return;
    }

    const esc = (value) =>
        String(value ?? "—")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");

    const lines = [...movements]
        .reverse()
        .map((item, index) => {
            const sale = item.movement_type === "sale";

            const entry =
                item.movement_type === "stock_add" ||
                item.movement_type === "create";

            const amount = entry
                ? Number(item.qunt_add)
                : -Number(item.qunt_remove);

            const unit =
                Number(sale ? item.movement_value : item.cost) || 0;

            const total =
                unit * Math.abs(amount) * (sale ? 1 : -1);

            return (
                "<tr><td>" +
                (index + 1) +
                "</td><td>" +
                esc(dateLabel(item.dt_update, true)) +
                "</td><td>" +
                esc(typeLabel(item)) +
                "</td><td>" +
                esc(item.reference_id) +
                "</td><td>" +
                amount +
                " " +
                esc(item.unit_measure) +
                "</td><td>" +
                unit.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2
                }) +
                "</td><td>" +
                total.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2
                }) +
                "</td><td>" +
                esc(item.notes) +
                "</td></tr>"
            );
        })
        .join("");

    const quantityTotal = movements.reduce(
        (sum, item) =>
            sum +
            Number(item.qunt_add || 0) -
            Number(item.qunt_remove || 0),
        0
    );

    const valueTotal = movements.reduce((sum, item) => {
        const sale = item.movement_type === "sale";

        const quantity = sale
            ? Number(item.qunt_remove || 0)
            : Number(item.qunt_add || item.qunt_remove || 0);

        return (
            sum +
            quantity *
            (Number(sale ? item.movement_value : item.cost) || 0) *
            (sale ? 1 : -1)
        );
    }, 0);

    const html =
        "<!doctype html><html lang=\"pt-BR\"><head><meta charset=\"utf-8\"><title>Movimentações do produto</title><style>" +
        "@page{size:A4 landscape;margin:12mm}" +
        "*{box-sizing:border-box}" +
        "body{font:10pt Arial,sans-serif;color:#17202a}" +
        "h1{font-size:18pt;margin:0 0 4mm}" +
        ".meta{color:#52616b;line-height:1.5;margin-bottom:8mm}" +
        "table{width:100%;border-collapse:collapse;font-size:9pt}" +
        "th,td{padding:2.4mm 2mm;border:1px solid #d6d6d6;text-align:left}" +
        "th{background:#f1f1f1}" +
        ".total{font-weight:700;background:#f8f8f8}" +
        "footer{margin-top:6mm;color:#637282;font-size:8pt}" +
        "</style></head><body><h1>Movimentações do produto</h1>" +
        "<div class=\"meta\"><strong>" +
        esc(product.name) +
        "</strong><br>Unidade: " +
        esc(product.unit_measure || "UN") +
        " · Período: Todos os períodos<br>Gerado em: " +
        esc(dateLabel(new Date().toISOString(), true)) +
        " · Registros listados: " +
        movements.length +
        "</div><table><thead><tr><th>#</th><th>Data / Hora</th><th>Tipo</th><th>Ref. ID</th><th>Quantidade</th><th>Valor Unit.</th><th>Total</th><th>Observações</th></tr></thead><tbody>" +
        lines +
        "<tr class=\"total\"><td colspan=\"4\">TOTAL LÍQUIDO</td><td>" +
        quantityTotal +
        " " +
        esc(product.unit_measure || "UN") +
        "</td><td>—</td><td>" +
        valueTotal.toLocaleString("pt-BR", {
            minimumFractionDigits: 2
        }) +
        "</td><td>—</td></tr></tbody></table>" +
        "<footer>Entradas e saídas são calculadas pelo custo; vendas pelo valor praticado.</footer>" +
        "<script>window.addEventListener(\"load\",()=>setTimeout(()=>window.print(),200));</script>" +
        "</body></html>";

    popup.document.open();
    popup.document.write(html);
    popup.document.close();
}

export default function ProductStockPage() {
    const { productId } = useParams();
    const navigate = useNavigate();

    const historyView = Boolean(productId);

    const [products, setProducts] = useState([]);
    const [availableProducts, setAvailableProducts] = useState([]);

    const [selectedId, setSelectedId] = useState(
        productId ? Number(productId) : null
    );

    const [movements, setMovements] = useState([]);
    const [movementId, setMovementId] = useState(null);

    const [summaryPage, setSummaryPage] = useState(0);

    const [columnVisibility, setColumnVisibility] = useState(
        initialStockColumnVisibility
    );

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const [direction, setDirection] = useState("");

    const [draft, setDraft] = useState({
        productId: "",
        quantity: "1",
        notes: ""
    });

    useEffect(() => {
        let active = true;

        Promise.all([getProductStock(), getProducts()])
            .then(([stock, all]) => {
                if (!active) return;

                setProducts(stock);

                setAvailableProducts(
                    all.filter((item) => item.status)
                );

                const id = productId
                    ? Number(productId)
                    : stock[0]?.id;

                if (id) setSelectedId(id);
            })
            .catch((reason) => {
                if (active) {
                    setError(
                        reason instanceof Error
                            ? reason.message
                            : "Não foi possível carregar o estoque."
                    );
                }
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => {
            active = false;
        };
    }, [productId]);

    const activeId = productId ? Number(productId) : selectedId;

    const selectedProduct =
        products.find((item) => item.id === activeId) || null;

    const summaryPageCount = Math.max(
        1,
        Math.ceil(products.length / stockPageSize)
    );

    const summaryProducts = products.slice(
        summaryPage * stockPageSize,
        (summaryPage + 1) * stockPageSize
    );

    const visibleStockColumns = stockColumns.filter(
        (column) => columnVisibility[column.key]
    );

    useEffect(() => {
        if (summaryPage >= summaryPageCount) {
            setSummaryPage(summaryPageCount - 1);
        }
    }, [summaryPage, summaryPageCount]);

    useEffect(() => {
        if (!activeId) {
            setMovements([]);
            setMovementId(null);
            return undefined;
        }

        const controller = new AbortController();

        getProductMovements(activeId, controller.signal)
            .then((rows) => {
                setMovements(rows);

                setMovementId((current) =>
                    rows.some((item) => item.id === current)
                        ? current
                        : rows[0]?.id ?? null
                );
            })
            .catch((reason) => {
                if (!controller.signal.aborted) {
                    setError(
                        reason instanceof Error
                            ? reason.message
                            : "Não foi possível carregar movimentações."
                    );
                }
            });

        return () => controller.abort();
    }, [activeId]);

    const selectedMovement =
        movements.find((item) => item.id === movementId) ||
        movements[0] ||
        null;

    const display = selectedMovement || selectedProduct;

    function toggleStockColumn(key) {
        setColumnVisibility((current) => ({
            ...current,
            [key]: !current[key]
        }));
    }

    function selectSummaryProduct(item) {
        if (selectedId === item.id) {
            setSelectedId(null);
            setMovementId(null);
            return;
        }

        setSelectedId(item.id);
        setMovementId(null);
    }

    function clearSummarySelection(event) {
        if (historyView || !selectedId || direction) return;

        const target = event.target;

        if (
            target.closest(".product-stock__summary-panel") ||
            target.closest(".product-stock__actions") ||
            target.closest(".product-stock__backdrop")
        ) {
            return;
        }

        setSelectedId(null);
        setMovementId(null);
    }

    /*
     * Resumo das vendas realizadas.
     * Esses valores são independentes do percentual de lucro.
     */
    const sales = movements.reduce(
        (sum, item) =>
            item.movement_type === "sale"
                ? {
                    quantity:
                        sum.quantity +
                        Number(item.qunt_remove || 0),
                    value:
                        sum.value +
                        Number(
                            item.movement_value ?? item.value ?? 0
                        ) *
                        Number(item.qunt_remove || 0)
                }
                : sum,
        {
            quantity: 0,
            value: 0
        }
    );

    /*
     * Percentual de lucro baseado nos dados cadastrados do produto.
     * Não utiliza a movimentação selecionada nem as vendas realizadas.
     */
    const selectedProfit = productProfit(selectedProduct);

    function openModal(action) {
        setDraft({
            productId: String(
                selectedProduct?.id ?? activeId ?? ""
            ),
            quantity: "1",
            notes: ""
        });

        setDirection(action);
        setError("");
    }

    async function refresh(id) {
        const [stock, rows] = await Promise.all([
            getProductStock(),
            getProductMovements(id)
        ]);

        setProducts(stock);
        setMovements(rows);
        setSelectedId(id);
        setMovementId(rows[0]?.id ?? null);
    }

    async function saveMovement(event) {
        event.preventDefault();

        if (saving) return;

        const id = Number(draft.productId);
        const amount = Number(draft.quantity);

        if (
            !Number.isInteger(id) ||
            id <= 0 ||
            !Number.isInteger(amount) ||
            amount <= 0
        ) {
            setError(
                "Selecione um produto e informe uma quantidade inteira maior que zero."
            );
            return;
        }

        setSaving(true);
        setError("");

        try {
            await adjustProductStock(
                id,
                direction,
                amount,
                draft.notes.trim()
            );

            await refresh(id);

            setDirection("");
        } catch (reason) {
            setError(
                reason instanceof Error
                    ? reason.message
                    : "Não foi possível registrar a movimentação."
            );
        } finally {
            setSaving(false);
        }
    }

    const title = historyView
        ? "Estoque - Detalhes"
        : "Produtos - Estoque";

    return (
        <main
            className="product-stock"
            onMouseDown={clearSummarySelection}
        >
            <header className="product-stock__header">
                <h1>POSSO AJUDAR?</h1>
                <span>{title}</span>
            </header>

            <div className="product-stock__content">
                {error && (
                    <p className="product-stock__error" role="alert">
                        {error}
                    </p>
                )}

                {historyView ? (
                    <section className="product-stock__history-panel">
                        <div className="product-stock__panel-heading">
                            <div>
                                <h2>
                                    {selectedProduct?.name ||
                                        selectedMovement?.name ||
                                        "Produto"}
                                </h2>

                                <span>
                                    Unidade:{" "}
                                    {selectedProduct?.unit_measure ||
                                        selectedMovement?.unit_measure ||
                                        "UN"}
                                </span>
                            </div>

                            <button
                                className="product-stock__button product-stock__button--neutral"
                                type="button"
                                onClick={() =>
                                    navigate("/produtos/estoque")
                                }
                            >
                                Voltar ao estoque
                            </button>
                        </div>

                        <div className="product-stock__table-scroll product-stock__history-scroll">
                            <table className="product-stock__table">
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th>Data / Hora</th>
                                        <th>Tipo</th>
                                        <th>Ref. ID</th>
                                        <th>Quantidade</th>
                                        <th>Valor Unit.</th>
                                        <th>Total</th>
                                        <th>Observações</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {loading ? (
                                        <tr>
                                            <td
                                                colSpan="8"
                                                className="product-stock__empty"
                                            >
                                                Carregando...
                                            </td>
                                        </tr>
                                    ) : movements.length === 0 ? (
                                        <tr>
                                            <td
                                                colSpan="8"
                                                className="product-stock__empty"
                                            >
                                                Este produto ainda não possui
                                                movimentações.
                                            </td>
                                        </tr>
                                    ) : (
                                        movements.map((item, index) => {
                                            const entry =
                                                item.movement_type ===
                                                "create" ||
                                                item.movement_type ===
                                                "stock_add";

                                            const sale =
                                                item.movement_type === "sale";

                                            const amount = entry
                                                ? Number(item.qunt_add)
                                                : -Number(item.qunt_remove);

                                            const unit =
                                                Number(
                                                    sale
                                                        ? item.movement_value
                                                        : item.cost
                                                ) || 0;

                                            const total =
                                                unit *
                                                Math.abs(amount) *
                                                (sale ? 1 : -1);

                                            return (
                                                <tr
                                                    key={item.id}
                                                    tabIndex="0"
                                                    aria-selected={
                                                        item.id ===
                                                        selectedMovement?.id
                                                    }
                                                    className={
                                                        "product-stock__movement-row " +
                                                        typeClass(item) +
                                                        (item.id ===
                                                            selectedMovement?.id
                                                            ? " is-selected"
                                                            : "")
                                                    }
                                                    onClick={() =>
                                                        setMovementId(item.id)
                                                    }
                                                    onKeyDown={(event) => {
                                                        if (
                                                            event.key ===
                                                            "Enter" ||
                                                            event.key === " "
                                                        ) {
                                                            event.preventDefault();
                                                            setMovementId(
                                                                item.id
                                                            );
                                                        }
                                                    }}
                                                >
                                                    <td>
                                                        {movements.length -
                                                            index}
                                                    </td>

                                                    <td>
                                                        {dateLabel(
                                                            item.dt_update,
                                                            true
                                                        )}
                                                    </td>

                                                    <td>{typeLabel(item)}</td>

                                                    <td>
                                                        {item.reference_id ??
                                                            "—"}
                                                    </td>

                                                    <td>
                                                        {amount > 0 ? "+" : ""}
                                                        {qty(
                                                            amount,
                                                            item.unit_measure
                                                        )}
                                                    </td>

                                                    <td>{money(unit)}</td>

                                                    <td
                                                        className={
                                                            total >= 0
                                                                ? "is-positive"
                                                                : "is-negative"
                                                        }
                                                    >
                                                        {money(total)}
                                                    </td>

                                                    <td>
                                                        {item.notes || "—"}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}

                                    {movements.length > 0 && (
                                        <tr className="product-stock__ledger-total">
                                            <td colSpan="4">
                                                TOTAL LÍQUIDO
                                            </td>

                                            <td>
                                                {qty(
                                                    movements.reduce(
                                                        (sum, item) =>
                                                            sum +
                                                            Number(
                                                                item.qunt_add ||
                                                                0
                                                            ) -
                                                            Number(
                                                                item.qunt_remove ||
                                                                0
                                                            ),
                                                        0
                                                    ),
                                                    selectedProduct?.unit_measure
                                                )}
                                            </td>

                                            <td>—</td>

                                            <td>
                                                {money(
                                                    movements.reduce(
                                                        (sum, item) => {
                                                            const sale =
                                                                item.movement_type ===
                                                                "sale";

                                                            const amount = sale
                                                                ? Number(
                                                                    item.qunt_remove ||
                                                                    0
                                                                )
                                                                : Number(
                                                                    item.qunt_add ||
                                                                    item.qunt_remove ||
                                                                    0
                                                                );

                                                            return (
                                                                sum +
                                                                amount *
                                                                (Number(
                                                                    sale
                                                                        ? item.movement_value
                                                                        : item.cost
                                                                ) || 0) *
                                                                (sale
                                                                    ? 1
                                                                    : -1)
                                                            );
                                                        },
                                                        0
                                                    )
                                                )}
                                            </td>

                                            <td>—</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </section>
                ) : (
                    <section className="product-stock__summary-panel">
                        <div className="product-stock__summary-heading">
                            <strong>
                                Últimas movimentações por produto
                            </strong>

                            <ColumnFilter
                                options={stockColumns}
                                visibility={columnVisibility}
                                onToggle={toggleStockColumn}
                            />
                        </div>

                        <div className="product-stock__table-scroll product-stock__summary-table-scroll">
                            <table className="product-stock__table">
                                <thead>
                                    <tr>
                                        <th>#</th>

                                        {visibleStockColumns.map((column) => (
                                            <th key={column.key}>
                                                {column.label}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>

                                <tbody>
                                    {loading ? (
                                        <tr>
                                            <td
                                                colSpan={
                                                    visibleStockColumns.length +
                                                    1
                                                }
                                                className="product-stock__empty"
                                            >
                                                Carregando estoque...
                                            </td>
                                        </tr>
                                    ) : products.length === 0 ? (
                                        <tr>
                                            <td
                                                colSpan={
                                                    visibleStockColumns.length +
                                                    1
                                                }
                                                className="product-stock__empty"
                                            >
                                                Ainda não há movimentações de
                                                estoque.
                                            </td>
                                        </tr>
                                    ) : (
                                        summaryProducts.map(
                                            (item, index) => (
                                                <tr
                                                    key={item.id}
                                                    tabIndex="0"
                                                    aria-selected={
                                                        item.id === activeId
                                                    }
                                                    className={
                                                        "product-stock__product-row" +
                                                        (item.id === activeId
                                                            ? " is-selected"
                                                            : "")
                                                    }
                                                    onClick={() =>
                                                        selectSummaryProduct(
                                                            item
                                                        )
                                                    }
                                                    onKeyDown={(event) => {
                                                        if (
                                                            event.key ===
                                                            "Enter" ||
                                                            event.key === " "
                                                        ) {
                                                            event.preventDefault();
                                                            selectSummaryProduct(
                                                                item
                                                            );
                                                        }
                                                    }}
                                                >
                                                    <td>
                                                        {summaryPage *
                                                            stockPageSize +
                                                            index +
                                                            1}
                                                    </td>

                                                    {columnVisibility.name && (
                                                        <td title={item.name}>
                                                            {item.name}
                                                        </td>
                                                    )}

                                                    {columnVisibility.value && (
                                                        <td className="is-positive">
                                                            {money(item.value)}
                                                        </td>
                                                    )}

                                                    {columnVisibility.amount && (
                                                        <td className="is-quantity">
                                                            {qty(
                                                                item.amount,
                                                                item.unit_measure
                                                            )}
                                                        </td>
                                                    )}

                                                    {columnVisibility.entry && (
                                                        <td>
                                                            {item.latest_entry ? (
                                                                <span className="is-entry">
                                                                    +
                                                                    {
                                                                        item
                                                                            .latest_entry
                                                                            .qunt_add
                                                                    }{" "}
                                                                    {
                                                                        item.unit_measure
                                                                    }{" "}
                                                                    ·{" "}
                                                                    {dateLabel(
                                                                        item
                                                                            .latest_entry
                                                                            .dt_update
                                                                    )}
                                                                </span>
                                                            ) : (
                                                                "—"
                                                            )}
                                                        </td>
                                                    )}

                                                    {columnVisibility.sale && (
                                                        <td>
                                                            {item.latest_sale ? (
                                                                <span className="is-sale">
                                                                    −
                                                                    {
                                                                        item
                                                                            .latest_sale
                                                                            .qunt_remove
                                                                    }{" "}
                                                                    {
                                                                        item.unit_measure
                                                                    }{" "}
                                                                    ·{" "}
                                                                    {dateLabel(
                                                                        item
                                                                            .latest_sale
                                                                            .dt_update
                                                                    )}
                                                                </span>
                                                            ) : (
                                                                "—"
                                                            )}
                                                        </td>
                                                    )}

                                                    {columnVisibility.exit && (
                                                        <td>
                                                            {item.latest_exit ? (
                                                                <span className="is-exit">
                                                                    −
                                                                    {
                                                                        item
                                                                            .latest_exit
                                                                            .qunt_remove
                                                                    }{" "}
                                                                    {
                                                                        item.unit_measure
                                                                    }{" "}
                                                                    ·{" "}
                                                                    {dateLabel(
                                                                        item
                                                                            .latest_exit
                                                                            .dt_update
                                                                    )}
                                                                </span>
                                                            ) : (
                                                                "—"
                                                            )}
                                                        </td>
                                                    )}
                                                </tr>
                                            )
                                        )
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div
                            className="product-stock__pagination"
                            aria-label="Paginação do estoque"
                        >
                            <span>
                                {products.length
                                    ? `Página ${summaryPage + 1} de ${summaryPageCount} · ${products.length} produtos`
                                    : "0 produtos"}
                            </span>

                            <div>
                                <button
                                    type="button"
                                    aria-label="Página anterior"
                                    disabled={summaryPage === 0 || loading}
                                    onClick={() =>
                                        setSummaryPage((page) =>
                                            Math.max(0, page - 1)
                                        )
                                    }
                                >
                                    &lt;
                                </button>

                                <button
                                    type="button"
                                    aria-label="Próxima página"
                                    disabled={
                                        summaryPage >=
                                        summaryPageCount - 1 ||
                                        loading
                                    }
                                    onClick={() =>
                                        setSummaryPage((page) =>
                                            Math.min(
                                                summaryPageCount - 1,
                                                page + 1
                                            )
                                        )
                                    }
                                >
                                    &gt;
                                </button>
                            </div>
                        </div>
                    </section>
                )}

                <div className="product-stock__details">
                    <section className="product-stock__card product-stock__product-card">
                        {display ? (
                            <>
                                <div className="product-stock__card-title">
                                    <strong>{display.name}</strong>
                                    <span>
                                        #{display.product_id ?? display.id}
                                    </span>
                                </div>

                                <div className="product-stock__numbers">
                                    <span className="is-cost">
                                        {display.cost == null
                                            ? "—"
                                            : money(display.cost)}
                                    </span>

                                    <b>−</b>

                                    <span className="is-value">
                                        {money(display.value)}
                                    </span>

                                    <b>−</b>

                                    <span className="is-quantity">
                                        {qty(
                                            selectedProduct?.amount ??
                                            display.amount,
                                            display.unit_measure
                                        )}
                                    </span>
                                </div>

                                <div className="product-stock__sales-total">
                                    <strong>Total de vendas:</strong>

                                    <span>
                                        {qty(
                                            sales.quantity,
                                            display.unit_measure
                                        )}
                                    </span>

                                    <b>×</b>

                                    <span className="is-value">
                                        {money(sales.value)}
                                    </span>
                                </div>
                            </>
                        ) : (
                            <div className="product-stock__empty-card">
                                <strong>Nenhum produto selecionado</strong>
                                <span>
                                    Escolha um produto na tabela.
                                </span>
                            </div>
                        )}
                    </section>

                    {/* CARD DE PERCENTUAL DE LUCRO */}

                    {selectedProduct ? (
                        <section className="product-stock__card product-stock__calculation">
                            <div className="product-stock__calculation-heading">
                                <strong>Percentual de Lucro</strong>
                                <span>{selectedProduct.name}</span>
                            </div>

                            {selectedProfit !== null ? (
                                <>
                                    <div className="product-stock__equation">
                                        <span className="is-value">
                                            {money(selectedProduct.value)}
                                        </span>

                                        <b>−</b>

                                        <span className="is-cost">
                                            {money(selectedProduct.cost)}
                                        </span>

                                        <b>=</b>

                                        <strong
                                            className={
                                                selectedProfit >= 0 ? "is-gain" : "is-loss"
                                            }
                                        >
                                            {money(
                                                Number(selectedProduct.value) -
                                                Number(selectedProduct.cost)
                                            )}
                                        </strong>
                                    </div>

                                    <div className="product-stock__equation">
                                        <strong
                                            className={
                                                selectedProfit >= 0 ? "is-gain" : "is-loss"
                                            }
                                        >
                                            {money(
                                                Number(selectedProduct.value) -
                                                Number(selectedProduct.cost)
                                            )}
                                        </strong>

                                        <b>÷</b>

                                        <span className="is-cost">
                                            {money(selectedProduct.cost)}
                                        </span>

                                        <b>=</b>

                                        <strong
                                            className={
                                                selectedProfit >= 0 ? "is-gain" : "is-loss"
                                            }
                                        >
                                            {selectedProfit.toLocaleString("pt-BR", {
                                                minimumFractionDigits: 2,
                                                maximumFractionDigits: 2
                                            })}
                                            %
                                        </strong>
                                    </div>
                                </>
                            ) : (
                                <p className="product-stock__hint">
                                    Não é possível calcular o percentual de lucro.
                                    Verifique se o custo e o valor de venda estão
                                    cadastrados e se o custo é maior que zero.
                                </p>
                            )}
                        </section>
                    ):<section className="product-stock__card product-stock__calculation"></section>}

                    <section
                        className="product-stock__card product-stock__actions"
                        aria-label="Ações de estoque"
                    >
                        {historyView ? (
                            <>
                                <button
                                    type="button"
                                    className="product-stock__action product-stock__action--neutral"
                                    onClick={() =>
                                        navigate("/produtos/estoque")
                                    }
                                    aria-label="Voltar ao estoque"
                                >
                                    ←
                                </button>

                                <button
                                    type="button"
                                    className="product-stock__action product-stock__action--blue"
                                    onClick={() => {
                                        const index = movements.findIndex(
                                            (item) =>
                                                item.id ===
                                                selectedMovement?.id
                                        );

                                        if (index > 0) {
                                            setMovementId(
                                                movements[index - 1].id
                                            );
                                        }
                                    }}
                                    aria-label="Movimentação anterior"
                                >
                                    ↑
                                </button>

                                <button
                                    type="button"
                                    className="product-stock__action product-stock__action--green"
                                    disabled={!movements.length}
                                    onClick={() =>
                                        exportPdf(
                                            selectedProduct || display,
                                            movements
                                        )
                                    }
                                    aria-label="Exportar PDF"
                                >
                                    PDF
                                </button>
                            </>
                        ) : selectedProduct ? (
                            <>
                                <button
                                    type="button"
                                    className="product-stock__action product-stock__action--blue"
                                    onClick={() => openModal("add")}
                                    aria-label="Adicionar nova entrada"
                                >
                                    ＋
                                </button>

                                <button
                                    type="button"
                                    className="product-stock__action product-stock__action--blue"
                                    onClick={() => openModal("remove")}
                                    aria-label="Adicionar nova saída"
                                >
                                    −
                                </button>

                                <button
                                    type="button"
                                    className="product-stock__action product-stock__action--neutral"
                                    onClick={() =>
                                        navigate(
                                            "/produtos/estoque/" +
                                            selectedProduct.id
                                        )
                                    }
                                    aria-label="Listar movimentações do produto"
                                >
                                    ▤
                                </button>

                                <button
                                    type="button"
                                    className="product-stock__action product-stock__action--blue"
                                    disabled={!movements.length}
                                    onClick={() =>
                                        exportPdf(
                                            selectedProduct,
                                            movements
                                        )
                                    }
                                    aria-label="Exportar PDF"
                                >
                                    PDF
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    className="product-stock__action product-stock__action--blue"
                                    aria-label="Página anterior"
                                    disabled={summaryPage === 0}
                                    onClick={() =>
                                        setSummaryPage((page) =>
                                            Math.max(0, page - 1)
                                        )
                                    }
                                >
                                    &lt;
                                </button>

                                <button
                                    type="button"
                                    className="product-stock__action product-stock__action--blue"
                                    aria-label="Próxima página"
                                    disabled={
                                        summaryPage >= summaryPageCount - 1
                                    }
                                    onClick={() =>
                                        setSummaryPage((page) =>
                                            Math.min(
                                                summaryPageCount - 1,
                                                page + 1
                                            )
                                        )
                                    }
                                >
                                    &gt;
                                </button>

                                <button
                                    type="button"
                                    className="product-stock__action product-stock__action--neutral"
                                    aria-label="Listar movimentações do produto"
                                    disabled
                                >
                                    ▤
                                </button>

                                <button
                                    type="button"
                                    className="product-stock__action product-stock__action--blue"
                                    aria-label="Exportar PDF"
                                    disabled
                                >
                                    PDF
                                </button>
                            </>
                        )}
                    </section>
                </div>
            </div>

            {direction && (
                <div
                    className="product-stock__backdrop"
                    onMouseDown={(event) => {
                        if (
                            event.target === event.currentTarget &&
                            !saving
                        ) {
                            setDirection("");
                        }
                    }}
                >
                    <form
                        className="product-stock__modal"
                        onSubmit={saveMovement}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="stock-modal-title"
                    >
                        <button
                            className="product-stock__modal-close"
                            type="button"
                            aria-label="Fechar"
                            onClick={() => setDirection("")}
                        >
                            ×
                        </button>

                        <h2 id="stock-modal-title">
                            {direction === "add"
                                ? "Nova entrada"
                                : "Nova saída"}
                        </h2>

                        <label>
                            <span>Produto</span>

                            <select
                                required
                                value={draft.productId}
                                onChange={(event) =>
                                    setDraft((current) => ({
                                        ...current,
                                        productId: event.target.value
                                    }))
                                }
                            >
                                <option value="">
                                    Selecione um produto
                                </option>

                                {availableProducts.map((item) => (
                                    <option value={item.id} key={item.id}>
                                        {item.name} · {item.amount}{" "}
                                        {item.unit_measure}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label>
                            <span>Quantidade</span>

                            <input
                                required
                                type="number"
                                min="1"
                                step="1"
                                value={draft.quantity}
                                onChange={(event) =>
                                    setDraft((current) => ({
                                        ...current,
                                        quantity: event.target.value
                                    }))
                                }
                            />
                        </label>

                        <label>
                            <span>Observações</span>

                            <textarea
                                maxLength={300}
                                value={draft.notes}
                                onChange={(event) =>
                                    setDraft((current) => ({
                                        ...current,
                                        notes: event.target.value
                                    }))
                                }
                            />
                        </label>

                        {error && (
                            <p
                                className="product-stock__error"
                                role="alert"
                            >
                                {error}
                            </p>
                        )}

                        <div className="product-stock__modal-actions">
                            <button
                                type="button"
                                className="product-stock__button product-stock__button--neutral"
                                disabled={saving}
                                onClick={() => setDirection("")}
                            >
                                Cancelar
                            </button>

                            <button
                                type="submit"
                                className="product-stock__button product-stock__button--blue"
                                disabled={saving}
                            >
                                {saving
                                    ? "Salvando..."
                                    : direction === "add"
                                        ? "Registrar entrada"
                                        : "Registrar saída"}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </main>
    );
}