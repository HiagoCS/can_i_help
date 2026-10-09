import { useEffect, useMemo, useState } from "react";
import { adjustProductStock, createProduct, deleteProduct, getProducts, updateProduct } from "@/data/api/products";
import { getCriticalSettings } from "@/data/api/settings";
import ColumnFilter from "@/components/column_filter";
import "./style.scss";

const blank = { sm_code: "", bar_code: "", name: "", description: "", value: "0", cost: "0", amount: "0", unit_measure: "UN", ncm: "", cst: "0", csosn: "0", icms: "0" };
const toForm = (product) => product ? {
    sm_code: product.sm_code ?? "", bar_code: product.bar_code ?? "", name: product.name ?? "",
    description: product.description ?? "", value: String(product.value ?? "0"),
    cost: String(product.cost ?? "0"), amount: String(product.amount ?? "0"), unit_measure: product.unit_measure ?? "UN", ncm: product.ncm ?? "", cst: String(product.cst ?? "0"), csosn: String(product.csosn ?? "0"), icms: String(product.icms ?? "0")
} : { ...blank };
const money = (value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) || 0);
const overviewColumns = [
    { key: "bar_code", label: "Código de Barras" }, { key: "sm_code", label: "Código Reduzido" },
    { key: "name", label: "Produto" }, { key: "description", label: "Descrição" },
    { key: "amount", label: "Quantidade" }, { key: "cost", label: "Custo (R$)" }, { key: "value", label: "Valor (R$)" }
];
const initialColumnVisibility = Object.fromEntries(overviewColumns.map((column) => [column.key, true]));
const overviewPageSize = 7;

export default function ProductOverviewPage() {
    const [products, setProducts] = useState([]);
    const [taxRegime, setTaxRegime] = useState("SIMPLES_NACIONAL");
    const [defaultNcm, setDefaultNcm] = useState("");
    const [selectedId, setSelectedId] = useState(null);
    const [form, setForm] = useState({ ...blank });
    const [mode, setMode] = useState("view");
    const [search, setSearch] = useState({ name: "", smCode: "", barCode: "" });
    const [page, setPage] = useState(0);
    const [columnVisibility, setColumnVisibility] = useState(initialColumnVisibility);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [actionModal, setActionModal] = useState(false);
    const [modalError, setModalError] = useState("");

    useEffect(() => {
        const controller = new AbortController();
        Promise.all([getProducts(controller.signal), getCriticalSettings()]).then(([data, settings]) => {
            const sorted = [...data].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
            setProducts(sorted);
            setTaxRegime(settings?.fiscal?.tax_regime ?? settings?.company?.tax_regime ?? "SIMPLES_NACIONAL");
            setDefaultNcm(settings?.fiscal?.ncm_default ?? "");
            if (sorted[0]) { setSelectedId(sorted[0].id); setForm(toForm(sorted[0])); }
        }).catch((reason) => {
            if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Falha ao carregar produtos.");
        }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, []);

    const selected = products.find((item) => item.id === selectedId) ?? null;
    const filtered = useMemo(() => products.filter((item) =>
        (!search.name.trim() || item.name.toLocaleLowerCase("pt-BR").includes(search.name.trim().toLocaleLowerCase("pt-BR"))) &&
        (!search.smCode.trim() || item.sm_code.toLocaleLowerCase("pt-BR").includes(search.smCode.trim().toLocaleLowerCase("pt-BR"))) &&
        (!search.barCode.trim() || item.bar_code.toLocaleLowerCase("pt-BR").includes(search.barCode.trim().toLocaleLowerCase("pt-BR")))
    ), [products, search]);

    const pageCount = Math.max(1, Math.ceil(filtered.length / overviewPageSize));
    const pageProducts = filtered.slice(page * overviewPageSize, (page + 1) * overviewPageSize);
    const visibleColumns = overviewColumns.filter((column) => columnVisibility[column.key]);

    useEffect(() => {
        if (page >= pageCount) setPage(pageCount - 1);
    }, [page, pageCount]);

    useEffect(() => {
        if (selectedId && !filtered.some((item) => item.id === selectedId) && mode === "view") {
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
        setColumnVisibility((current) => ({ ...current, [key]: !current[key] }));
    }
    function clearSelectionOutsideTable(event) {
        if (!selectedId || mode !== "view" || actionModal) return;
        const target = event.target;
        if (target.closest(".product-overview__table-panel") || target.closest(".product-overview__toolbar") || target.closest(".product-overview__modal")) return;
        if (target.closest(".product-overview__details") && target.closest("button,input,textarea,select")) return;
        setSelectedId(null);
        setForm({ ...blank });
        setError("");
    }
    function startNew() { setSelectedId(null); setForm({ ...blank }); setMode("new"); setError(""); }
    function startCopy() {
        if (!selected) return;
        setForm({ ...toForm(selected), sm_code: "", bar_code: "", amount: "0" });
        setMode("copy"); setError("");
    }
    function field(name, value) { setForm((current) => ({ ...current, [name]: value })); }
    function cancelForm() { setMode("view"); setForm(toForm(selected)); setError(""); }

    async function save(event) {
        event.preventDefault();
        if (!form.name.trim() || saving) { setError("Informe o nome do produto."); return; }
        setSaving(true); setError("");
        const data = {
            sm_code: form.sm_code.trim(), bar_code: form.bar_code.trim(), name: form.name.trim(),
            description: form.description, value: form.value, cost: form.cost,
            unit_measure: form.unit_measure.trim().toUpperCase() || "",
            ncm: form.ncm.trim() || null,
            cst: taxRegime === "REGIME_NORMAL" ? form.cst.trim() : "0",
            csosn: taxRegime === "REGIME_NORMAL" ? form.csosn.trim() : "0",
            icms: taxRegime === "REGIME_NORMAL" ? Number(form.icms) : 0,
            ...(["new", "copy"].includes(mode) ? { amount: form.amount } : {})
        };
        try {
            const saved = mode === "edit" && selected ? await updateProduct(selected.id, data) : await createProduct(data);
            setProducts((current) => mode === "edit" ? current.map((item) => item.id === saved.id ? saved : item) : [saved, ...current]);
            setSelectedId(saved.id); setForm(toForm(saved)); setMode("view");
        } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível salvar."); }
        finally { setSaving(false); }
    }
    async function stock(direction) {
        if (!selected || saving) return;
        setSaving(true); setError("");
        try {
            const updated = await adjustProductStock(selected.id, direction);
            setProducts((current) => current.map((item) => item.id === updated.id ? updated : item));
            setForm(toForm(updated));
        } catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao alterar estoque."); }
        finally { setSaving(false); }
    }
    async function act(action) {
        if (!selected || saving) return;
        setSaving(true); setModalError("");
        try {
            if (action === "delete") {
                await deleteProduct(selected.id);
                const rest = products.filter((item) => item.id !== selected.id);
                setProducts(rest); setSelectedId(rest[0]?.id ?? null); setForm(toForm(rest[0])); setMode("view");
            } else {
                const status = action === "activate" ? 1 : 0;
                const updated = await updateProduct(selected.id, { status });
                setProducts((current) => current.map((item) => item.id === updated.id ? updated : item));
                setForm(toForm(updated));
            }
            setActionModal(false);
        } catch (reason) { setModalError(reason instanceof Error ? reason.message : "Falha ao executar a ação."); }
        finally { setSaving(false); }
    }

    const editing = mode !== "view";
    return <main className="product-overview" onMouseDown={clearSelectionOutsideTable}>
        <header className="product-overview__header"><h1>POSSO AJUDAR?</h1><span>Produtos - Geral</span></header>
        <div className="product-overview__content">
            <section className="product-overview__toolbar" aria-label="Pesquisar produtos">
                {[["name", "Produto"], ["smCode", "Código Reduzido"], ["barCode", "Código de Barras"]].map(([key, label]) =>
                    <label className="product-overview__search" key={key}>
                        <span aria-hidden="true">⌕</span>
                        <input aria-label={label} placeholder={label} value={search[key]} onChange={(event) => { setPage(0); setSearch((current) => ({ ...current, [key]: event.target.value })); }} />
                    </label>
                )}
                <ColumnFilter options={overviewColumns} visibility={columnVisibility} onToggle={toggleColumn} />
                <button className="product-overview__new-button" type="button" onClick={startNew}>Novo Produto</button>
            </section>
            {error && <p className="product-overview__error" role="alert">{error}</p>}
            <section className="product-overview__table-panel" aria-label="Lista de produtos">
                <div className="product-overview__table-scroll">
                    <table className="product-overview__table">
                        <thead><tr><th>#</th>{visibleColumns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
                        <tbody>
                            {loading ? <tr><td colSpan={visibleColumns.length + 1} className="product-overview__empty">Carregando produtos...</td></tr>
                                : filtered.length === 0 ? <tr><td colSpan={visibleColumns.length + 1} className="product-overview__empty">Nenhum produto encontrado.</td></tr>
                                    : pageProducts.map((item, index) => <tr key={item.id} tabIndex="0" aria-selected={selectedId === item.id}
                                        className={["product-overview__row", selectedId === item.id ? "is-selected" : "", !item.status ? "is-inactive" : ""].filter(Boolean).join(" ")}
                                        onClick={() => select(item)} onKeyDown={(event) => {
                                            if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(item); }
                                        }}>
                                        <td>{page * overviewPageSize + index + 1}</td>
                                        {columnVisibility.bar_code && <td title={item.bar_code}>{item.bar_code}</td>}
                                        {columnVisibility.sm_code && <td title={item.sm_code}>{item.sm_code}</td>}
                                        {columnVisibility.name && <td title={item.name}>{item.name}{!item.status && <small> · Inativo</small>}</td>}
                                        {columnVisibility.description && <td title={item.description ?? ""}>{item.description || "—"}</td>}
                                        {columnVisibility.amount && <td>{item.amount ?? 0} {item.unit_measure || ""}</td>}
                                        {columnVisibility.cost && <td>{money(item.cost)}</td>}
                                        {columnVisibility.value && <td>{money(item.value)}</td>}
                                    </tr>)}
                        </tbody>
                    </table>
                </div>
                <div className="product-overview__pagination" aria-label="Paginação dos produtos">
                    <span>{filtered.length ? "Página " + (page + 1) + " de " + pageCount + " · " + filtered.length + " produtos" : "0 produtos"}</span>
                    <div>
                        <button type="button" aria-label="Página anterior" disabled={page === 0 || loading} onClick={() => setPage((current) => Math.max(0, current - 1))}>&lt;</button>
                        <button type="button" aria-label="Próxima página" disabled={page >= pageCount - 1 || loading} onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}>&gt;</button>
                    </div>
                </div>
            </section>

            <form className="product-overview__details" onSubmit={save}>
                <section className="product-overview__card product-overview__card--fields">
                    {editing ? <>
                        <label className="product-overview__field"><span>Nome do Produto *</span><input autoFocus required value={form.name} onChange={(event) => field("name", event.target.value)} /></label>
                        <div className="product-overview__field-row">
                            <label className="product-overview__field"><span>Unidade de medida *</span><input required maxLength={10} value={form.unit_measure} onChange={(event) => field("unit_measure", event.target.value)} /></label>
                            <label className="product-overview__field"><span>Cód. Reduzido</span><input placeholder="Gerado automaticamente" value={form.sm_code} onChange={(event) => field("sm_code", event.target.value)} /></label>
                            <label className="product-overview__field"><span>Código de Barras</span><input placeholder="Gerado automaticamente" value={form.bar_code} onChange={(event) => field("bar_code", event.target.value)} /></label>
                        </div>
                        <div className="product-overview__field-row">
                            <label className="product-overview__field"><span>Custo (R$)</span><input type="number" min="0" step=".01" value={form.cost} onChange={(event) => field("cost", event.target.value)} /></label>
                            <label className="product-overview__field"><span>Valor (R$)</span><input type="number" min="0" step=".01" value={form.value} onChange={(event) => field("value", event.target.value)} /></label>
                            {["new", "copy"].includes(mode) && <label className="product-overview__field"><span>Quantidade inicial ({form.unit_measure || ""})</span><input type="number" min="0" step="1" value={form.amount} onChange={(event) => field("amount", event.target.value)} /></label>}
                        </div>
                        <div className="product-overview__field-row">
                            <label className="product-overview__field"><span>NCM do produto</span><input inputMode="numeric" maxLength={8} placeholder={defaultNcm ? "Padrão: " + defaultNcm : "NCM"} value={form.ncm} onChange={(event) => field("ncm", event.target.value.replace(/\D/g, "").slice(0, 8))} /></label>
                        </div>
                        {taxRegime === "REGIME_NORMAL" ? (
                            <div className="product-overview__field-row product-overview__field-row--tax">
                                <label className="product-overview__field"><span>CST *</span><input required value={form.cst} onChange={(event) => field("cst", event.target.value)} /></label>
                                <label className="product-overview__field"><span>CSOSN *</span><input required value={form.csosn} onChange={(event) => field("csosn", event.target.value)} /></label>
                                <label className="product-overview__field"><span>ICMS (%) *</span><input required type="number" min="0" step=".01" value={form.icms} onChange={(event) => field("icms", event.target.value)} /></label>
                            </div>
                        ) : (
                            <small className="product-overview__tax-note">CST, CSOSN e ICMS serão salvos como 0 para o regime atual.</small>
                        )}                    </> : selected ? <>
                        <div className="product-overview__product-title"><strong>{selected.name}</strong><span>#{selected.id}</span></div>
                        <div className="product-overview__product-meta"><b>{selected.sm_code}</b><span>{selected.bar_code}</span><span>{selected.amount ?? 0} {selected.unit_measure || ""}</span></div>
                        <div className="product-overview__product-prices"><span>Custo <b>{money(selected.cost)}</b></span><span>Valor <b>{money(selected.value)}</b></span></div>
                        <small className="product-overview__tax-note">NCM: {selected.ncm || defaultNcm || "—"}{taxRegime === "REGIME_NORMAL" ? " · CST " + selected.cst + " · CSOSN " + selected.csosn + " · ICMS " + selected.icms + "%" : ""}</small>
                        <span className={"product-overview__status " + (selected.status ? "is-active" : "is-inactive")}>{selected.status ? "Ativo no Caixa" : "Desativado no Caixa"}</span>
                    </> : <div className="product-overview__card-empty"><strong>Nenhum produto selecionado</strong><span>Escolha um produto ou cadastre um novo.</span></div>}
                </section>
                <section className="product-overview__card product-overview__card--description">
                    <label className="product-overview__description-field"><span>Descrição do Produto:</span>
                        {editing ? <textarea value={form.description} onChange={(event) => field("description", event.target.value)} /> : <p>{selected?.description || "Sem descrição cadastrada."}</p>}
                    </label>
                </section>
                <section className="product-overview__card product-overview__card--actions" aria-label="Ações do produto">
                    {editing ? <div className="product-overview__action-list">
                        <button className="product-overview__action product-overview__action--cancel" type="button" aria-label="Cancelar" onClick={cancelForm}>↶</button>
                        <button className="product-overview__action product-overview__action--copy" type="button" aria-label="Copiar produto" disabled={!selected} onClick={startCopy}>▢</button>
                        <button className="product-overview__action product-overview__action--save" type="submit" aria-label="Salvar" disabled={saving}>{saving ? "…" : "✓"}</button>
                        <button className="product-overview__action product-overview__action--remove" type="button" aria-label="Novo produto" onClick={startNew}>⊘</button>
                    </div> : selected ? <div className="product-overview__action-list">
                        <button className="product-overview__action product-overview__action--add" type="button" aria-label="Adicionar quantidade" disabled={saving} onClick={() => stock("add")}>+</button>
                        <button className="product-overview__action product-overview__action--subtract" type="button" aria-label="Diminuir quantidade" disabled={saving || Number(selected.amount) <= 0} onClick={() => stock("remove")}>−</button>
                        <button className="product-overview__action product-overview__action--copy" type="button" aria-label="Copiar produto" onClick={startCopy}>▢</button>
                        <button className="product-overview__action product-overview__action--edit" type="button" aria-label="Editar produto" onClick={() => { setForm(toForm(selected)); setMode("edit"); }}>✎</button>
                        <button className="product-overview__action product-overview__action--remove" type="button" aria-label="Desativar ou excluir" onClick={() => { setModalError(""); setActionModal(true); }}>⊘</button>
                    </div> : <div className="product-overview__action-list">
                        <button className="product-overview__action product-overview__action--add" type="button" aria-label="Página anterior" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>&lt;</button>
                        <button className="product-overview__action product-overview__action--add" type="button" aria-label="Próxima página" disabled={page >= pageCount - 1} onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}>&gt;</button>
                        <button className="product-overview__action product-overview__action--copy" type="button" aria-label="Copiar produto" disabled>▢</button>
                        <button className="product-overview__action product-overview__action--edit" type="button" aria-label="Editar produto" disabled>✎</button>
                        <button className="product-overview__action product-overview__action--remove" type="button" aria-label="Desativar ou excluir" disabled>⊘</button>
                    </div>}
                </section>
            </form>
            {actionModal && selected && <div className="product-overview__modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setActionModal(false); }}>
                <section className="product-overview__modal" role="dialog" aria-modal="true" aria-labelledby="product-action-title">
                    <button className="product-overview__modal-close" type="button" aria-label="Fechar" onClick={() => setActionModal(false)}>×</button>
                    <h2 id="product-action-title">Produto</h2><p>Deseja {selected.status ? "desativar" : "reativar"} <strong>{selected.name}</strong> para controlar sua exibição no Caixa ou excluir o cadastro?</p>
                    {modalError && <p className="product-overview__error" role="alert">{modalError}</p>}
                    <div className="product-overview__modal-actions">
                        <button className="product-overview__modal-button product-overview__modal-button--deactivate" type="button" onClick={() => act(selected.status ? "deactivate" : "activate")}>{selected.status ? "Desativar" : "Reativar"}</button>
                        <button className="product-overview__modal-button product-overview__modal-button--delete" type="button" onClick={() => act("delete")}>Excluir</button>
                        <button className="product-overview__modal-button product-overview__modal-button--cancel" type="button" onClick={() => setActionModal(false)}>Cancelar</button>
                    </div>
                </section>
            </div>}
        </div>
    </main>;
}