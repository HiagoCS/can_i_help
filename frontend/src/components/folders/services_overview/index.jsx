import { useEffect, useMemo, useState } from "react";
import PaperPen from "@/assets/icons/paper-pen-svgrepo-com.svg";
import {
    createService,
    deleteService,
    getServices,
    updateService
} from "@/data/api/services";
import { getProducts } from "@/data/api/products";
import ColumnFilter from "@/components/column_filter";
import "./style.scss";

const blank = {
    sm_code: "",
    bar_code: "",
    name: "",
    description: "",
    cost: "0",
    status: 1,
    products: []
};

const toForm = (service) => ({
    sm_code: service?.sm_code ?? "",
    bar_code: service?.bar_code ?? "",
    name: service?.name ?? "",
    description: service?.description ?? "",
    cost: String(service?.cost ?? "0"),
    status: service?.status ?? 1,
    products: Array.isArray(service?.products)
        ? service.products.map((product) => ({
            product_id: Number(product.product_id),
            qunt: Number(product.qunt)
        }))
        : []
});

const money = (value) =>
    new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL"
    }).format(Number(value) || 0);

const overviewColumns = [
    { key: "bar_code", label: "Código de Barras" },
    { key: "sm_code", label: "Código Reduzido" },
    { key: "name", label: "Serviço" },
    { key: "description", label: "Descrição" },
    { key: "products", label: "Produtos vinculados" },
    { key: "cost", label: "Valor Base (R$)" },
    { key: "value", label: "Valor Calculado (R$)" }
];

const initialColumnVisibility = Object.fromEntries(
    overviewColumns.map((column) => [column.key, true])
);

const overviewPageSize = 7;

function normalizeText(value) {
    return String(value ?? "").toLocaleLowerCase("pt-BR");
}

function getServiceValue(service, catalogProducts = []) {
    const baseValue = Number(service?.cost) || 0;

    const linkedProducts = Array.isArray(service?.products)
        ? service.products
        : [];

    return baseValue + linkedProducts.reduce((total, linked) => {
        const product = catalogProducts.find(
            (item) => Number(item.id) === Number(linked.product_id)
        ) ?? linked;

        return total +
            (Number(product.value) || 0) *
            (Number(linked.qunt) || 0);
    }, 0);
}

function getServiceProduct(service, linked, catalogProducts) {
    const catalogProduct = catalogProducts.find(
        (product) => Number(product.id) === Number(linked.product_id)
    );

    return {
        ...(linked ?? {}),
        ...(catalogProduct ?? {}),
        product_id: Number(linked.product_id),
        qunt: Number(linked.qunt) || 0
    };
}

export default function ServicesOverviewPage() {
    const [services, setServices] = useState([]);
    const [catalogProducts, setCatalogProducts] = useState([]);

    const [selectedId, setSelectedId] = useState(null);
    const [form, setForm] = useState({ ...blank });
    const [mode, setMode] = useState("view");

    const [search, setSearch] = useState({
        name: "",
        smCode: "",
        barCode: ""
    });

    const [page, setPage] = useState(0);
    const [columnVisibility, setColumnVisibility] = useState(
        initialColumnVisibility
    );

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [actionModal, setActionModal] = useState(false);
    const [modalError, setModalError] = useState("");

    const [productToAdd, setProductToAdd] = useState("");
    const [productQuantity, setProductQuantity] = useState("1");

    useEffect(() => {
        const controller = new AbortController();

        Promise.all([
            getServices(controller.signal),
            getProducts(controller.signal)
        ])
            .then(([serviceData, productData]) => {
                const sortedServices = [...serviceData].sort(
                    (a, b) => a.name.localeCompare(b.name, "pt-BR")
                );

                const sortedProducts = [...productData].sort(
                    (a, b) => a.name.localeCompare(b.name, "pt-BR")
                );

                setServices(sortedServices);
                setCatalogProducts(sortedProducts);

                if (sortedServices[0]) {
                    setSelectedId(sortedServices[0].id);
                    setForm(toForm(sortedServices[0]));
                }
            })
            .catch((reason) => {
                if (!controller.signal.aborted) {
                    setError(
                        reason instanceof Error
                            ? reason.message
                            : "Falha ao carregar serviços."
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

    const selected = services.find(
        (item) => item.id === selectedId
    ) ?? null;

    const filtered = useMemo(() => {
        return services.filter((item) =>
            (
                !search.name.trim() ||
                normalizeText(item.name).includes(
                    normalizeText(search.name.trim())
                )
            ) &&
            (
                !search.smCode.trim() ||
                normalizeText(item.sm_code).includes(
                    normalizeText(search.smCode.trim())
                )
            ) &&
            (
                !search.barCode.trim() ||
                normalizeText(item.bar_code).includes(
                    normalizeText(search.barCode.trim())
                )
            )
        );
    }, [services, search]);

    const pageCount = Math.max(
        1,
        Math.ceil(filtered.length / overviewPageSize)
    );

    const pageServices = filtered.slice(
        page * overviewPageSize,
        (page + 1) * overviewPageSize
    );

    const visibleColumns = overviewColumns.filter(
        (column) => columnVisibility[column.key]
    );

    const formProducts = form.products.map((linked) =>
        getServiceProduct(linked && {}, linked, catalogProducts)
    );

    const formValue = getServiceValue({
        cost: form.cost,
        products: form.products
    }, catalogProducts);

    useEffect(() => {
        if (page >= pageCount) {
            setPage(pageCount - 1);
        }
    }, [page, pageCount]);

    useEffect(() => {
        if (
            selectedId &&
            !filtered.some((item) => item.id === selectedId) &&
            mode === "view"
        ) {
            setSelectedId(null);
            setForm({ ...blank });
        }
    }, [filtered, mode, selectedId]);

    function select(item) {
        if (selectedId === item.id) {
            setSelectedId(null);
            setForm({ ...blank });
            setMode("view");
            setError("");
            return;
        }

        setSelectedId(item.id);
        setForm(toForm(item));
        setMode("view");
        setError("");
    }

    function toggleColumn(key) {
        setColumnVisibility((current) => ({
            ...current,
            [key]: !current[key]
        }));
    }

    function clearSelectionOutsideTable(event) {
        if (!selectedId || mode !== "view" || actionModal) return;

        const target = event.target;

        if (!(target instanceof Element)) return;

        if (
            target.closest(".services-overview__table-panel") ||
            target.closest(".services-overview__toolbar") ||
            target.closest(".services-overview__modal")
        ) {
            return;
        }

        if (
            target.closest(".services-overview__details") &&
            target.closest("button, input, textarea, select")
        ) {
            return;
        }

        setSelectedId(null);
        setForm({ ...blank });
        setError("");
    }

    function startNew() {
        setSelectedId(null);
        setForm({ ...blank });
        setMode("new");
        setProductToAdd("");
        setProductQuantity("1");
        setError("");
    }

    function startCopy() {
        if (!selected) return;

        setForm({
            ...toForm(selected),
            sm_code: "",
            bar_code: "",
            status: 1
        });

        setMode("copy");
        setProductToAdd("");
        setProductQuantity("1");
        setError("");
    }

    function field(name, value) {
        setForm((current) => ({
            ...current,
            [name]: value
        }));
    }

    function cancelForm() {
        setMode("view");
        setForm(toForm(selected));
        setProductToAdd("");
        setProductQuantity("1");
        setError("");
    }

    function addProduct() {
        const productId = Number(productToAdd);
        const quantity = Number(productQuantity);

        if (!Number.isInteger(productId) || productId <= 0) {
            setError("Selecione um produto para adicionar.");
            return;
        }

        if (!Number.isInteger(quantity) || quantity <= 0) {
            setError("Informe uma quantidade inteira maior que zero.");
            return;
        }

        if (
            form.products.some(
                (item) => Number(item.product_id) === productId
            )
        ) {
            setError(
                "Esse produto já está na composição. Altere a quantidade na lista."
            );
            return;
        }

        setForm((current) => ({
            ...current,
            products: [
                ...current.products,
                {
                    product_id: productId,
                    qunt: quantity
                }
            ]
        }));

        setProductToAdd("");
        setProductQuantity("1");
        setError("");
    }

    function changeProductQuantity(productId, quantityValue) {
        const quantity = Number(quantityValue);

        if (!Number.isInteger(quantity) || quantity <= 0) return;

        setForm((current) => ({
            ...current,
            products: current.products.map((item) =>
                Number(item.product_id) === Number(productId)
                    ? { ...item, qunt: quantity }
                    : item
            )
        }));
    }

    function removeProduct(productId) {
        setForm((current) => ({
            ...current,
            products: current.products.filter(
                (item) => Number(item.product_id) !== Number(productId)
            )
        }));
    }

    async function save(event) {
        event.preventDefault();

        if (saving) return;

        if (!form.name.trim()) {
            setError("Informe o nome do serviço.");
            return;
        }

        const numericCost = Number(form.cost);

        if (!Number.isFinite(numericCost) || numericCost < 0) {
            setError("Informe um valor base válido e não negativo.");
            return;
        }

        setSaving(true);
        setError("");

        const data = {
            ...(form.sm_code.trim()
                ? { sm_code: form.sm_code.trim() }
                : {}),
            ...(form.bar_code.trim()
                ? { bar_code: form.bar_code.trim() }
                : {}),
            name: form.name.trim(),
            description: form.description.trim() || null,
            cost: numericCost.toFixed(2),
            status: form.status,
            products: form.products.map((item) => ({
                product_id: Number(item.product_id),
                qunt: Number(item.qunt)
            }))
        };

        try {
            const saved =
                mode === "edit" && selected
                    ? await updateService(selected.id, data)
                    : await createService(data);

            setServices((current) => {
                const exists = current.some(
                    (item) => item.id === saved.id
                );

                const next = exists
                    ? current.map((item) =>
                        item.id === saved.id
                            ? {
                                ...item,
                                ...saved,
                                products: saved.products ?? data.products
                            }
                            : item
                    )
                    : [
                        ...current,
                        {
                            ...saved,
                            products: saved.products ?? data.products
                        }
                    ];

                return next.sort(
                    (a, b) => a.name.localeCompare(b.name, "pt-BR")
                );
            });

            setSelectedId(saved.id);
            setForm(
                toForm({
                    ...saved,
                    products: saved.products ?? data.products
                })
            );

            setMode("view");
            setProductToAdd("");
            setProductQuantity("1");
        } catch (reason) {
            setError(
                reason instanceof Error
                    ? reason.message
                    : "Não foi possível salvar o serviço."
            );
        } finally {
            setSaving(false);
        }
    }

    async function act(action) {
        if (!selected || saving) return;

        setSaving(true);
        setModalError("");

        try {
            if (action === "delete") {
                await deleteService(selected.id);

                const rest = services.filter(
                    (item) => item.id !== selected.id
                );

                setServices(rest);
                setSelectedId(rest[0]?.id ?? null);
                setForm(toForm(rest[0]));
                setMode("view");
            } else {
                const status = action === "activate" ? 1 : 0;

                const updated = await updateService(selected.id, {
                    status
                });

                const normalized = {
                    ...selected,
                    ...updated,
                    products: updated.products ?? selected.products ?? []
                };

                setServices((current) =>
                    current.map((item) =>
                        item.id === normalized.id ? normalized : item
                    )
                );

                setForm(toForm(normalized));
            }

            setActionModal(false);
        } catch (reason) {
            setModalError(
                reason instanceof Error
                    ? reason.message
                    : "Falha ao executar a ação."
            );
        } finally {
            setSaving(false);
        }
    }

    const editing = mode !== "view";

    return (
        <main
            className="services-overview"
            onMouseDown={clearSelectionOutsideTable}
        >
            <header className="services-overview__header">
                <h1 onClick={() =>{window.location.href="/"}} >POSSO AJUDAR?</h1>
                <span>Serviços - Geral</span>
            </header>

            <div className="services-overview__content">
                <section
                    className="services-overview__toolbar"
                    aria-label="Pesquisar serviços"
                >
                    {[
                        ["name", "Serviço"],
                        ["smCode", "Código Reduzido"],
                        ["barCode", "Código de Barras"]
                    ].map(([key, label]) => (
                        <label
                            className="services-overview__search"
                            key={key}
                        >
                            <span aria-hidden="true">⌕</span>
                            <input
                                aria-label={label}
                                placeholder={label}
                                value={search[key]}
                                onChange={(event) => {
                                    setPage(0);
                                    setSearch((current) => ({
                                        ...current,
                                        [key]: event.target.value
                                    }));
                                }}
                            />
                        </label>
                    ))}

                    <ColumnFilter
                        options={overviewColumns}
                        visibility={columnVisibility}
                        onToggle={toggleColumn}
                    />

                    <button
                        className="services-overview__new-button"
                        type="button"
                        onClick={startNew}
                    >
                        Novo Serviço
                    </button>
                </section>

                {error && (
                    <p
                        className="services-overview__error"
                        role="alert"
                    >
                        {error}
                    </p>
                )}

                <section
                    className="services-overview__table-panel"
                    aria-label="Lista de serviços"
                >
                    <div className="services-overview__table-scroll">
                        <table className="services-overview__table">
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
                                            className="services-overview__empty"
                                        >
                                            Carregando serviços...
                                        </td>
                                    </tr>
                                ) : filtered.length === 0 ? (
                                    <tr>
                                        <td
                                            colSpan={visibleColumns.length + 1}
                                            className="services-overview__empty"
                                        >
                                            Nenhum serviço encontrado.
                                        </td>
                                    </tr>
                                ) : (
                                    pageServices.map((item, index) => (
                                        <tr
                                            key={item.id}
                                            tabIndex="0"
                                            aria-selected={
                                                selectedId === item.id
                                            }
                                            className={[
                                                "services-overview__row",
                                                selectedId === item.id
                                                    ? "is-selected"
                                                    : "",
                                                !item.status
                                                    ? "is-inactive"
                                                    : ""
                                            ].filter(Boolean).join(" ")}
                                            onClick={() => select(item)}
                                            onKeyDown={(event) => {
                                                if (
                                                    event.key === "Enter" ||
                                                    event.key === " "
                                                ) {
                                                    event.preventDefault();
                                                    select(item);
                                                }
                                            }}
                                        >
                                            <td>
                                                {page * overviewPageSize +
                                                    index +
                                                    1}
                                            </td>

                                            {columnVisibility.bar_code && (
                                                <td title={item.bar_code ?? ""}>
                                                    {item.bar_code || "—"}
                                                </td>
                                            )}

                                            {columnVisibility.sm_code && (
                                                <td title={item.sm_code ?? ""}>
                                                    {item.sm_code || "—"}
                                                </td>
                                            )}

                                            {columnVisibility.name && (
                                                <td title={item.name}>
                                                    {item.name}
                                                    {!item.status && (
                                                        <small> · Inativo</small>
                                                    )}
                                                </td>
                                            )}

                                            {columnVisibility.description && (
                                                <td
                                                    title={
                                                        item.description ?? ""
                                                    }
                                                >
                                                    {item.description || "—"}
                                                </td>
                                            )}

                                            {columnVisibility.products && (
                                                <td>
                                                    {item.products?.length ?? 0}
                                                </td>
                                            )}

                                            {columnVisibility.cost && (
                                                <td>{money(item.cost)}</td>
                                            )}

                                            {columnVisibility.value && (
                                                <td>
                                                    {money(
                                                        getServiceValue(
                                                            item,
                                                            catalogProducts
                                                        )
                                                    )}
                                                </td>
                                            )}
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div
                        className="services-overview__pagination"
                        aria-label="Paginação dos serviços"
                    >
                        <span>
                            {filtered.length
                                ? `Página ${page + 1} de ${pageCount} · ${filtered.length} serviços`
                                : "0 serviços"}
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
                                disabled={
                                    page >= pageCount - 1 || loading
                                }
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

                <form
                    className="services-overview__details"
                    onSubmit={save}
                >
                    <section className="services-overview__card services-overview__card--fields">
                        {editing ? (
                            <>
                                <label className="services-overview__field">
                                    <span>Nome do Serviço *</span>
                                    <input
                                        autoFocus
                                        required
                                        value={form.name}
                                        onChange={(event) =>
                                            field("name", event.target.value)
                                        }
                                    />
                                </label>

                                <div className="services-overview__field-row">
                                    <label className="services-overview__field">
                                        <span>Código Reduzido</span>
                                        <input
                                            placeholder="Gerado automaticamente"
                                            value={form.sm_code}
                                            onChange={(event) =>
                                                field(
                                                    "sm_code",
                                                    event.target.value
                                                )
                                            }
                                        />
                                    </label>

                                    <label className="services-overview__field">
                                        <span>Código de Barras</span>
                                        <input
                                            placeholder="Gerado automaticamente"
                                            value={form.bar_code}
                                            onChange={(event) =>
                                                field(
                                                    "bar_code",
                                                    event.target.value
                                                )
                                            }
                                        />
                                    </label>
                                </div>

                                <label className="services-overview__field">
                                    <span>Valor Base do Serviço (R$) *</span>
                                    <input
                                        required
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={form.cost}
                                        onChange={(event) =>
                                            field("cost", event.target.value)
                                        }
                                    />
                                </label>

                                <div className="services-overview__calculated-value">
                                    <span>Valor calculado do serviço</span>
                                    <strong>{money(formValue)}</strong>
                                    <small>
                                        Valor base + valor dos produtos
                                        utilizados.
                                    </small>
                                </div>
                            </>
                        ) : selected ? (
                            <>
                                <div className="services-overview__service-title">
                                    <strong>{selected.name}</strong>
                                    <span>#{selected.id}</span>
                                </div>

                                <div className="services-overview__service-meta">
                                    <b>{selected.sm_code || "Sem código"}</b>
                                    <span>
                                        {selected.bar_code || "Sem código de barras"}
                                    </span>
                                </div>

                                <div className="services-overview__service-prices">
                                    <span>
                                        Valor base
                                        <b>{money(selected.cost)}</b>
                                    </span>

                                    <span>
                                        Valor calculado
                                        <b>
                                            {money(
                                                getServiceValue(
                                                    selected,
                                                    catalogProducts
                                                )
                                            )}
                                        </b>
                                    </span>
                                </div>

                                <span
                                    className={
                                        "services-overview__status " +
                                        (selected.status
                                            ? "is-active"
                                            : "is-inactive")
                                    }
                                >
                                    {selected.status
                                        ? "Ativo no Caixa"
                                        : "Desativado no Caixa"}
                                </span>
                            </>
                        ) : (
                            <div className="services-overview__card-empty">
                                <strong>Nenhum serviço selecionado</strong>
                                <span>
                                    Escolha um serviço ou cadastre um novo.
                                </span>
                            </div>
                        )}
                    </section>

                    <section className="services-overview__card services-overview__card--composition">
                        {editing ? (
                            <>
                                <h2>Composição do Serviço</h2>

                                <div className="services-overview__product-picker">
                                    <label className="services-overview__field">
                                        <span>Produto</span>
                                        <select
                                            value={productToAdd}
                                            onChange={(event) =>
                                                setProductToAdd(
                                                    event.target.value
                                                )
                                            }
                                        >
                                            <option value="">
                                                Selecione um produto
                                            </option>

                                            {catalogProducts
                                                .filter((product) =>
                                                    product.status
                                                )
                                                .map((product) => (
                                                    <option
                                                        key={product.id}
                                                        value={product.id}
                                                        disabled={form.products.some(
                                                            (item) =>
                                                                Number(item.product_id) ===
                                                                Number(product.id)
                                                        )}
                                                    >
                                                        {product.name} —{" "}
                                                        {money(product.value)}
                                                    </option>
                                                ))}
                                        </select>
                                    </label>

                                    <label className="services-overview__field">
                                        <span>Quantidade</span>
                                        <input
                                            type="number"
                                            min="1"
                                            step="1"
                                            value={productQuantity}
                                            onChange={(event) =>
                                                setProductQuantity(
                                                    event.target.value
                                                )
                                            }
                                        />
                                    </label>

                                    <button
                                        type="button"
                                        className="services-overview__add-product"
                                        onClick={addProduct}
                                    >
                                        Adicionar
                                    </button>
                                </div>

                                <div className="services-overview__composition-list">
                                    {formProducts.length === 0 ? (
                                        <p className="services-overview__composition-empty">
                                            Nenhum produto vinculado. O serviço
                                            pode ser cadastrado sem produtos.
                                        </p>
                                    ) : (
                                        formProducts.map((product) => (
                                            <div
                                                className="services-overview__composition-item"
                                                key={product.product_id}
                                            >
                                                <div>
                                                    <strong>
                                                        {product.name ??
                                                            `Produto #${product.product_id}`}
                                                    </strong>

                                                    <small>
                                                        {money(product.value)}{" "}
                                                        × {product.qunt} ={" "}
                                                        {money(
                                                            Number(product.value) *
                                                            product.qunt
                                                        )}
                                                    </small>
                                                </div>

                                                <label>
                                                    <span>Qtd.</span>
                                                    <input
                                                        aria-label={
                                                            "Quantidade de " +
                                                            (product.name ??
                                                                "produto")
                                                        }
                                                        type="number"
                                                        min="1"
                                                        step="1"
                                                        value={product.qunt}
                                                        onChange={(event) =>
                                                            changeProductQuantity(
                                                                product.product_id,
                                                                event.target.value
                                                            )
                                                        }
                                                    />
                                                </label>

                                                <button
                                                    type="button"
                                                    aria-label={
                                                        "Remover " +
                                                        (product.name ??
                                                            "produto")
                                                    }
                                                    onClick={() =>
                                                        removeProduct(
                                                            product.product_id
                                                        )
                                                    }
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </>
                        ) : selected ? (
                            <>
                                <h2>Produtos do Serviço</h2>

                                <div className="services-overview__composition-list">
                                    {selected.products?.length ? (
                                        selected.products.map((linked) => {
                                            const product =
                                                getServiceProduct(
                                                    selected,
                                                    linked,
                                                    catalogProducts
                                                );

                                            return (
                                                <div
                                                    className="services-overview__composition-item"
                                                    key={product.product_id}
                                                >
                                                    <div>
                                                        <strong>
                                                            {product.name ??
                                                                `Produto #${product.product_id}`}
                                                        </strong>
                                                        <small>
                                                            {money(product.value)}{" "}
                                                            × {product.qunt} ={" "}
                                                            {money(
                                                                Number(product.value) *
                                                                product.qunt
                                                            )}
                                                        </small>
                                                    </div>

                                                    <span className="services-overview__quantity">
                                                        Qtd. {product.qunt}
                                                    </span>
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <p className="services-overview__composition-empty">
                                            Este serviço não possui produtos
                                            vinculados.
                                        </p>
                                    )}
                                </div>
                            </>
                        ) : (
                            <div className="services-overview__card-empty">
                                <strong>Composição do Serviço</strong>
                                <span>
                                    Selecione um serviço para visualizar os
                                    produtos utilizados.
                                </span>
                            </div>
                        )}
                    </section>

                    <section className="services-overview__card services-overview__card--description">
                        <label className="services-overview__description-field">
                            <span>Descrição do Serviço:</span>

                            {editing ? (
                                <textarea
                                    value={form.description}
                                    onChange={(event) =>
                                        field(
                                            "description",
                                            event.target.value
                                        )
                                    }
                                />
                            ) : (
                                <p>
                                    {selected?.description ||
                                        "Sem descrição cadastrada."}
                                </p>
                            )}
                        </label>
                    </section>

                    <section
                        className="services-overview__card services-overview__card--actions"
                        aria-label="Ações do serviço"
                    >
                        {editing ? (
                            <div className="services-overview__action-list">
                                <button
                                    className="services-overview__action services-overview__action--cancel"
                                    type="button"
                                    aria-label="Cancelar"
                                    onClick={cancelForm}
                                >
                                    ↶
                                </button>

                                <button
                                    className="services-overview__action services-overview__action--copy"
                                    type="button"
                                    aria-label="Copiar serviço"
                                    disabled={!selected}
                                    onClick={startCopy}
                                >
                                    <img src={PaperPen} alt="Copiar produto" />
                                </button>

                                <button
                                    className="services-overview__action services-overview__action--save"
                                    type="submit"
                                    aria-label="Salvar"
                                    disabled={saving}
                                >
                                    {saving ? "…" : "✓"}
                                </button>

                                <button
                                    className="services-overview__action services-overview__action--remove"
                                    type="button"
                                    aria-label="Novo serviço"
                                    onClick={startNew}
                                >
                                    ⊕
                                </button>
                            </div>
                        ) : selected ? (
                            <div className="services-overview__action-list">
                                <button
                                    className="services-overview__action services-overview__action--copy"
                                    type="button"
                                    aria-label="Copiar serviço"
                                    onClick={startCopy}
                                >
                                    <img src={PaperPen} alt="Copiar serviço" />
                                </button>

                                <button
                                    className="services-overview__action services-overview__action--edit"
                                    type="button"
                                    aria-label="Editar serviço"
                                    onClick={() => {
                                        setForm(toForm(selected));
                                        setMode("edit");
                                        setError("");
                                    }}
                                >
                                    ✎
                                </button>

                                <button
                                    className="services-overview__action services-overview__action--remove"
                                    type="button"
                                    aria-label="Desativar ou excluir serviço"
                                    onClick={() => {
                                        setModalError("");
                                        setActionModal(true);
                                    }}
                                >
                                    ⊘
                                </button>
                            </div>
                        ) : (
                            <div className="services-overview__action-list">
                                <button
                                    className="services-overview__action services-overview__action--copy"
                                    type="button"
                                    aria-label="Copiar serviço"
                                    disabled
                                >
                                    <img src={PaperPen} alt="Copiar produto" />
                                </button>

                                <button
                                    className="services-overview__action services-overview__action--edit"
                                    type="button"
                                    aria-label="Editar serviço"
                                    disabled
                                >
                                    ✎
                                </button>

                                <button
                                    className="services-overview__action services-overview__action--remove"
                                    type="button"
                                    aria-label="Desativar ou excluir serviço"
                                    disabled
                                >
                                    ⊘
                                </button>
                            </div>
                        )}
                    </section>
                </form>

                {actionModal && selected && (
                    <div
                        className="services-overview__modal-backdrop"
                        onMouseDown={(event) => {
                            if (
                                event.target === event.currentTarget &&
                                !saving
                            ) {
                                setActionModal(false);
                            }
                        }}
                    >
                        <section
                            className="services-overview__modal"
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="service-action-title"
                        >
                            <button
                                className="services-overview__modal-close"
                                type="button"
                                aria-label="Fechar"
                                onClick={() => setActionModal(false)}
                            >
                                ×
                            </button>

                            <h2 id="service-action-title">Serviço</h2>

                            <p>
                                Deseja{" "}
                                {selected.status
                                    ? "desativar"
                                    : "reativar"}{" "}
                                <strong>{selected.name}</strong> para
                                controlar sua exibição no Caixa ou excluir o
                                cadastro?
                            </p>

                            {modalError && (
                                <p
                                    className="services-overview__error"
                                    role="alert"
                                >
                                    {modalError}
                                </p>
                            )}

                            <div className="services-overview__modal-actions">
                                <button
                                    className="services-overview__modal-button services-overview__modal-button--deactivate"
                                    type="button"
                                    disabled={saving}
                                    onClick={() =>
                                        act(
                                            selected.status
                                                ? "deactivate"
                                                : "activate"
                                        )
                                    }
                                >
                                    {selected.status
                                        ? "Desativar"
                                        : "Reativar"}
                                </button>

                                <button
                                    className="services-overview__modal-button services-overview__modal-button--delete"
                                    type="button"
                                    disabled={saving}
                                    onClick={() => act("delete")}
                                >
                                    Excluir
                                </button>

                                <button
                                    className="services-overview__modal-button services-overview__modal-button--cancel"
                                    type="button"
                                    disabled={saving}
                                    onClick={() => setActionModal(false)}
                                >
                                    Cancelar
                                </button>
                            </div>
                        </section>
                    </div>
                )}
            </div>
        </main>
    );
}