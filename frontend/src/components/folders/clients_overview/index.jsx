import { useEffect, useMemo, useState } from "react";
import {
    getClients,
    getClientReports
} from "@/data/api/clients";
import ColumnFilter from "@/components/column_filter";
import "./style.scss";

const overviewColumns = [
    { key: "id", label: "Código" },
    { key: "name", label: "Cliente" },
    { key: "cpf", label: "CPF" },
    { key: "cnpj", label: "CNPJ" }
];

const initialColumnVisibility = Object.fromEntries(
    overviewColumns.map((column) => [column.key, true])
);

const overviewPageSize = 8;

const money = (value) =>
    new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL"
    }).format(Number(value) || 0);

const qty = (value) =>
    Number(value || 0).toLocaleString("pt-BR", {
        maximumFractionDigits: 2
    });

function normalizeText(value) {
    return String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("pt-BR")
        .trim();
}

function normalizeDocument(value) {
    return String(value ?? "").replace(/\D/g, "");
}

function formatDate(value) {
    if (!value) return "—";

    const text = String(value);
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);

    if (match) {
        return `${match[3]}/${match[2]}/${match[1]}`;
    }

    const parsed = new Date(text);

    return Number.isNaN(parsed.getTime())
        ? text
        : parsed.toLocaleDateString("pt-BR");
}

function formatDateTime(value) {
    if (!value) return "Data não informada";

    const text = String(value);
    const match = text.match(
        /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/
    );

    if (match) {
        return `${match[3]}/${match[2]}/${match[1]} às ${match[4]}:${match[5]}`;
    }

    const parsed = new Date(text);

    return Number.isNaN(parsed.getTime())
        ? text
        : parsed.toLocaleString("pt-BR");
}

function getDocument(client) {
    if (client?.cpf) return client.cpf;
    if (client?.cnpj) return client.cnpj;
    return "Não informado";
}

function getItemType(type) {
    if (type === "product") return "Produto";
    if (type === "service") return "Serviço";
    return "Não identificado";
}

function getClientTotals(client) {
    const purchases = Array.isArray(client?.purchases)
        ? client.purchases
        : [];

    return {
        purchaseCount: Number(client?.purchase_count) || 0,
        itemsBought: Number(client?.items_bought_count) || 0,
        totalSpent: Number(client?.total_spent) || 0,
        averageTicket: purchases.length
            ? (Number(client?.total_spent) || 0) / purchases.length
            : 0
    };
}

export default function ClientsOverviewPage() {
    const [clients, setClients] = useState([]);
    const [reports, setReports] = useState([]);

    const [selectedId, setSelectedId] = useState(null);

    const [search, setSearch] = useState({
        name: "",
        document: ""
    });

    const [page, setPage] = useState(0);
    const [columnVisibility, setColumnVisibility] = useState(
        initialColumnVisibility
    );

    const [loading, setLoading] = useState(true);
    const [reportsLoading, setReportsLoading] = useState(true);

    const [error, setError] = useState("");
    const [reportsError, setReportsError] = useState("");

    useEffect(() => {
        const controller = new AbortController();

        getClients("", controller.signal)
            .then((data) => {
                const sorted = [...data].sort((a, b) =>
                    String(a.name ?? "").localeCompare(
                        String(b.name ?? ""),
                        "pt-BR"
                    )
                );

                setClients(sorted);

                if (sorted.length) {
                    setSelectedId(sorted[0].id);
                }
            })
            .catch((reason) => {
                if (!controller.signal.aborted) {
                    setError(
                        reason instanceof Error
                            ? reason.message
                            : "Não foi possível carregar os clientes."
                    );
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            });

        getClientReports({}, controller.signal)
            .then((data) => {
                setReports(Array.isArray(data) ? data : []);
            })
            .catch((reason) => {
                if (!controller.signal.aborted) {
                    setReportsError(
                        reason instanceof Error
                            ? reason.message
                            : "Não foi possível carregar o histórico de compras."
                    );
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setReportsLoading(false);
                }
            });

        return () => controller.abort();
    }, []);

    const reportById = useMemo(
        () => new Map(reports.map((report) => [Number(report.id), report])),
        [reports]
    );

    const filtered = useMemo(() => {
        const nameQuery = normalizeText(search.name);
        const documentQuery = normalizeDocument(search.document);

        return clients.filter((client) => {
            const matchesName =
                !nameQuery ||
                normalizeText(client.name).includes(nameQuery);

            const document = `${client.cpf ?? ""} ${client.cnpj ?? ""}`;
            const normalizedDocument = normalizeDocument(document);

            const matchesDocument =
                !documentQuery ||
                normalizedDocument.includes(documentQuery);

            return matchesName && matchesDocument;
        });
    }, [clients, search]);

    const pageCount = Math.max(
        1,
        Math.ceil(filtered.length / overviewPageSize)
    );

    const pageClients = filtered.slice(
        page * overviewPageSize,
        (page + 1) * overviewPageSize
    );

    const visibleColumns = overviewColumns.filter(
        (column) => columnVisibility[column.key]
    );

    const selected = clients.find(
        (client) => Number(client.id) === Number(selectedId)
    ) ?? null;

    const selectedReport = selected
        ? reportById.get(Number(selected.id)) ?? null
        : null;

    const selectedTotals = getClientTotals(selectedReport);
    const purchases = Array.isArray(selectedReport?.purchases)
        ? [...selectedReport.purchases].sort(
            (a, b) =>
                new Date(b.dt_sale).getTime() -
                new Date(a.dt_sale).getTime()
        )
        : [];

    useEffect(() => {
        if (page >= pageCount) {
            setPage(pageCount - 1);
        }
    }, [page, pageCount]);

    useEffect(() => {
        if (
            selectedId !== null &&
            !filtered.some(
                (client) => Number(client.id) === Number(selectedId)
            )
        ) {
            setSelectedId(null);
        }
    }, [filtered, selectedId]);

    function select(client) {
        setSelectedId((current) =>
            Number(current) === Number(client.id)
                ? null
                : client.id
        );
    }

    function toggleColumn(key) {
        setColumnVisibility((current) => ({
            ...current,
            [key]: !current[key]
        }));
    }

    function clearSearch() {
        setSearch({
            name: "",
            document: ""
        });
        setPage(0);
        setSelectedId(null);
        setError("");
    }

    return (
        <main className="clients-overview">
            <header className="clients-overview__header">
                <h1>POSSO AJUDAR?</h1>
                <span>Clientes - Geral</span>
            </header>

            <div className="clients-overview__content">
                <section
                    className="clients-overview__toolbar"
                    aria-label="Pesquisar clientes"
                >
                    <label className="clients-overview__search">
                        <span aria-hidden="true">⌕</span>
                        <input
                            aria-label="Nome do cliente"
                            placeholder="Nome do cliente"
                            value={search.name}
                            onChange={(event) => {
                                setPage(0);
                                setSearch((current) => ({
                                    ...current,
                                    name: event.target.value
                                }));
                            }}
                        />
                    </label>

                    <label className="clients-overview__search">
                        <span aria-hidden="true">⌕</span>
                        <input
                            aria-label="CPF ou CNPJ"
                            placeholder="CPF ou CNPJ"
                            inputMode="numeric"
                            value={search.document}
                            onChange={(event) => {
                                setPage(0);
                                setSearch((current) => ({
                                    ...current,
                                    document: event.target.value
                                }));
                            }}
                        />
                    </label>

                    <ColumnFilter
                        options={overviewColumns}
                        visibility={columnVisibility}
                        onToggle={toggleColumn}
                    />

                    <button
                        className="clients-overview__clear-button"
                        type="button"
                        onClick={clearSearch}
                    >
                        Limpar filtros
                    </button>
                </section>

                {error && (
                    <p
                        className="clients-overview__error"
                        role="alert"
                    >
                        {error}
                    </p>
                )}

                <section
                    className="clients-overview__table-panel"
                    aria-label="Lista de clientes"
                >
                    <div className="clients-overview__table-scroll">
                        <table className="clients-overview__table">
                            <thead>
                                <tr>
                                    <th>#</th>

                                    {visibleColumns.map((column) => (
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
                                            colSpan={visibleColumns.length + 1}
                                            className="clients-overview__empty"
                                        >
                                            Carregando clientes...
                                        </td>
                                    </tr>
                                ) : filtered.length === 0 ? (
                                    <tr>
                                        <td
                                            colSpan={visibleColumns.length + 1}
                                            className="clients-overview__empty"
                                        >
                                            Nenhum cliente encontrado.
                                        </td>
                                    </tr>
                                ) : (
                                    pageClients.map((client, index) => (
                                        <tr
                                            key={client.id}
                                            tabIndex="0"
                                            aria-selected={
                                                Number(selectedId) ===
                                                Number(client.id)
                                            }
                                            className={[
                                                "clients-overview__row",
                                                Number(selectedId) ===
                                                    Number(client.id)
                                                    ? "is-selected"
                                                    : ""
                                            ]
                                                .filter(Boolean)
                                                .join(" ")}
                                            onClick={() => select(client)}
                                            onKeyDown={(event) => {
                                                if (
                                                    event.key === "Enter" ||
                                                    event.key === " "
                                                ) {
                                                    event.preventDefault();
                                                    select(client);
                                                }
                                            }}
                                        >
                                            <td>
                                                {page * overviewPageSize +
                                                    index +
                                                    1}
                                            </td>

                                            {columnVisibility.id && (
                                                <td>{client.id}</td>
                                            )}

                                            {columnVisibility.name && (
                                                <td title={client.name}>
                                                    {client.name || "—"}
                                                </td>
                                            )}

                                            {columnVisibility.cpf && (
                                                <td title={client.cpf ?? ""}>
                                                    {client.cpf || "—"}
                                                </td>
                                            )}

                                            {columnVisibility.cnpj && (
                                                <td title={client.cnpj ?? ""}>
                                                    {client.cnpj || "—"}
                                                </td>
                                            )}
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div
                        className="clients-overview__pagination"
                        aria-label="Paginação dos clientes"
                    >
                        <span>
                            {filtered.length
                                ? `Página ${page + 1} de ${pageCount} · ${filtered.length} clientes`
                                : "0 clientes"}
                        </span>

                        <div>
                            <button
                                type="button"
                                aria-label="Página anterior"
                                disabled={page === 0 || loading}
                                onClick={() =>
                                    setPage((current) =>
                                        Math.max(0, current - 1)
                                    )
                                }
                            >
                                &lt;
                            </button>

                            <button
                                type="button"
                                aria-label="Próxima página"
                                disabled={page >= pageCount - 1 || loading}
                                onClick={() =>
                                    setPage((current) =>
                                        Math.min(pageCount - 1, current + 1)
                                    )
                                }
                            >
                                &gt;
                            </button>
                        </div>
                    </div>
                </section>

                <section className="clients-overview__details">
                    <section className="clients-overview__card clients-overview__card--identity">
                        {selected ? (
                            <>
                                <div className="clients-overview__client-title">
                                    <strong>{selected.name}</strong>
                                    <span>#{selected.id}</span>
                                </div>

                                <div className="clients-overview__document">
                                    <span>CPF</span>
                                    <strong>{selected.cpf || "Não informado"}</strong>
                                </div>

                                <div className="clients-overview__document">
                                    <span>CNPJ</span>
                                    <strong>
                                        {selected.cnpj || "Não informado"}
                                    </strong>
                                </div>

                                <div className="clients-overview__personal-footer" style={{ display: "flex", gap: "0.5rem", justifyContent: "space-between", alignItems: "center" }}>
                                    <div className="clients-overview__client-note">
                                        Cadastro de cliente
                                    </div>
                                    <div className="clients-overview__client-edit"
                                        onClick={() => {
                                            window.location.href = `/clientes/editar/${selected.id}`;
                                        }}
                                    >
                                        Editar
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="clients-overview__card-empty">
                                <strong>Nenhum cliente selecionado</strong>
                                <span>
                                    Selecione uma linha da tabela para
                                    visualizar os dados do cliente.
                                </span>
                            </div>
                        )}
                    </section>

                    <section className="clients-overview__card clients-overview__card--summary">
                        <h2>Resumo de compras</h2>

                        {!selected ? (
                            <p className="clients-overview__empty-details">
                                Selecione um cliente para consultar os totais.
                            </p>
                        ) : reportsLoading ? (
                            <p className="clients-overview__empty-details">
                                Carregando resumo...
                            </p>
                        ) : selectedReport ? (
                            <div className="clients-overview__summary-grid">
                                <div>
                                    <span>Compras</span>
                                    <strong>
                                        {qty(selectedTotals.purchaseCount)}
                                    </strong>
                                </div>

                                <div>
                                    <span>Itens comprados</span>
                                    <strong>
                                        {qty(selectedTotals.itemsBought)}
                                    </strong>
                                </div>

                                <div>
                                    <span>Total gasto</span>
                                    <strong>
                                        {money(selectedTotals.totalSpent)}
                                    </strong>
                                </div>

                                <div>
                                    <span>Ticket médio</span>
                                    <strong>
                                        {money(selectedTotals.averageTicket)}
                                    </strong>
                                </div>
                            </div>
                        ) : (
                            <p className="clients-overview__empty-details">
                                {reportsError ||
                                    "Não há histórico de compras disponível para este cliente."}
                            </p>
                        )}
                    </section>

                    <section className="clients-overview__card clients-overview__card--history">
                        <div className="clients-overview__history-heading">
                            <h2>Histórico de compras</h2>

                            {selectedReport && (
                                <span>
                                    {purchases.length}{" "}
                                    {purchases.length === 1
                                        ? "compra"
                                        : "compras"}
                                </span>
                            )}
                        </div>

                        {!selected ? (
                            <p className="clients-overview__empty-details">
                                Selecione um cliente para visualizar as compras.
                            </p>
                        ) : reportsLoading ? (
                            <p className="clients-overview__empty-details">
                                Carregando histórico...
                            </p>
                        ) : !selectedReport ? (
                            <p className="clients-overview__empty-details">
                                {reportsError ||
                                    "Não há compras registradas para este cliente."}
                            </p>
                        ) : purchases.length === 0 ? (
                            <p className="clients-overview__empty-details">
                                Este cliente não possui compras registradas.
                            </p>
                        ) : (
                            <div className="clients-overview__purchase-list">
                                {purchases.map((purchase) => (
                                    <article
                                        className="clients-overview__purchase"
                                        key={purchase.id}
                                    >
                                        <div className="clients-overview__purchase-heading">
                                            <div>
                                                <strong>
                                                    Compra #{purchase.id}
                                                </strong>
                                                <span>
                                                    {formatDateTime(
                                                        purchase.dt_sale
                                                    )}
                                                </span>
                                            </div>

                                            <strong className="clients-overview__purchase-total">
                                                {money(purchase.total_value)}
                                            </strong>
                                        </div>

                                        <div className="clients-overview__payment">
                                            Pagamento:{" "}
                                            {purchase.payment_method ||
                                                "Não informado"}
                                        </div>

                                        {Array.isArray(purchase.items) &&
                                            purchase.items.length > 0 ? (
                                            <div className="clients-overview__purchase-items">
                                                {purchase.items.map((item) => (
                                                    <div
                                                        className="clients-overview__purchase-item"
                                                        key={item.id}
                                                    >
                                                        <div>
                                                            <strong>
                                                                {item.name}
                                                            </strong>
                                                            <small>
                                                                {getItemType(
                                                                    item.type
                                                                )}{" "}
                                                                ·{" "}
                                                                {qty(item.quantity)}{" "}
                                                                {item.unit_measure ||
                                                                    "un."}
                                                            </small>
                                                        </div>

                                                        <div>
                                                            <span>
                                                                {money(
                                                                    item.unit_value
                                                                )}{" "}
                                                                / un.
                                                            </span>
                                                            <strong>
                                                                {money(
                                                                    item.total_value
                                                                )}
                                                            </strong>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="clients-overview__no-items">
                                                Nenhum item detalhado nesta compra.
                                            </p>
                                        )}
                                    </article>
                                ))}
                            </div>
                        )}
                    </section>
                </section>
            </div>
        </main>
    );
}