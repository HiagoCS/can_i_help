import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
    getCashierInstallments,
    getCashierPaymentMethods,
    createCashierSale,
    getCashierClients,
    searchCashierProducts
} from "@/data/api/cashier";
import CashierSalesModal from "./sales_modal";
import CashierClientModal from "./client_modal";
import CashierFinalizationModal from "./finalization_modal";
import { downloadSaleXml, printSalePdf } from "./sale_documents";
import "./style.scss";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
});

const initialSearches = {
    name: "",
    smCode: "",
    barCode: ""
};

const cashierColumns = [
    { key: "smCode", label: "Código reduzido", tableLabel: "Cód. Reduzido" },
    { key: "barCode", label: "Código de barras", tableLabel: "Cód. Barras" },
    { key: "name", label: "Produto", tableLabel: "Produto" },
    { key: "description", label: "Descrição", tableLabel: "Descrição" },
    { key: "unitPrice", label: "Preço (R$)", tableLabel: "R$" },
    { key: "quantity", label: "Venda (unidade)", tableLabel: "Venda" },
    { key: "stock", label: "Estoque (unidade)", tableLabel: "Estoque" }
];

const initialColumnVisibility = {
    smCode: true,
    barCode: false,
    name: true,
    description: true,
    unitPrice: true,
    quantity: true,
    stock: true
};
const cashierIcons = {
    filter: <path d="M3 5h18l-7.2 8.1v5.5l-3.6 1.8v-7.3L3 5Z" />,
    clear: (
        <>
            <circle cx="12" cy="12" r="9" />
            <path d="m8.5 8.5 7 7m0-7-7 7" />
        </>
    ),
    search: (
        <>
            <circle cx="10.8" cy="10.8" r="7" />
            <path d="m16 16 5 5" />
        </>
    ),
    pdf: (
        <>
            <path d="M6 2.8h8l4 4V21H6V2.8Z" />
            <path d="M14 2.8v4h4M8 14h8M8 17h5" />
            <path d="M8 10.5h1.2a1.3 1.3 0 0 1 0 2.6H8v-2.6Zm5 0v2.6h1a1.3 1.3 0 0 0 0-2.6h-1Z" />
        </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    minus: <path d="M5 12h14" />,
    block: (
        <>
            <circle cx="12" cy="12" r="9" />
            <path d="m6 6 12 12" />
        </>
    )
};

function CashierIcon({ name, className = "" }) {
    return (
        <svg
            className={className}
            viewBox="0 0 24 24"
            fill={name === "filter" ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
        >
            {cashierIcons[name]}
        </svg>
    );
}

function parseNumber(value) {
    const normalizedValue = String(value ?? "").trim().replace(",", ".");
    const number = Number(normalizedValue);

    return Number.isFinite(number) ? number : 0;
}

function normalizeText(value) {
    return String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("pt-BR")
        .trim();
}

function isActiveRecord(record) {
    return record.status === true || Number(record.status) === 1;
}

function getErrorMessage(error, fallback) {
    return error instanceof Error ? error.message : fallback;
}

function ProductSearchField({
    field,
    label,
    placeholder,
    value,
    inStockOnly,
    onChange,
    onSelect
}) {
    const [suggestions, setSuggestions] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [searchError, setSearchError] = useState("");
    const query = value.trim();

    useEffect(() => {
        if (!query) {
            setSuggestions([]);
            setIsSearching(false);
            setSearchError("");
            return undefined;
        }

        const controller = new AbortController();
        setSuggestions([]);
        setIsSearching(true);
        setSearchError("");

        const timeoutId = window.setTimeout(() => {
            searchCashierProducts(field, query, controller.signal)
                .then((products) => {
                    if (controller.signal.aborted) {
                        return;
                    }

                    setSuggestions(products.filter(isActiveRecord));
                    setIsSearching(false);
                })
                .catch((error) => {
                    if (controller.signal.aborted) {
                        return;
                    }

                    setSuggestions([]);
                    setSearchError(
                        getErrorMessage(
                            error,
                            "Não foi possível pesquisar produtos."
                        )
                    );
                    setIsSearching(false);
                });
        }, 300);

        return () => {
            window.clearTimeout(timeoutId);
            controller.abort();
        };
    }, [field, query]);

    const visibleSuggestions = inStockOnly
        ? suggestions.filter((product) => parseNumber(product.amount) > 0)
        : suggestions;

    return (
        <div className={"cashier-search cashier-search--" + field}>
            <label className="cashier-search__field">
                <span className="visually-hidden">{label}</span>
                <CashierIcon name="search" />
                <input
                    type="search"
                    autoComplete="off"
                    value={value}
                    placeholder={placeholder}
                    onChange={(event) => onChange(event.target.value)}
                />
            </label>

            {query && (
                <div className="cashier-search__results" aria-live="polite">
                    {isSearching && (
                        <p className="cashier-search__message">
                            Buscando produtos...
                        </p>
                    )}

                    {!isSearching && searchError && (
                        <p className="cashier-search__message cashier-search__message--error" role="alert">
                            {searchError}
                        </p>
                    )}

                    {!isSearching && !searchError && visibleSuggestions.length === 0 && (
                        <p className="cashier-search__message">
                            {suggestions.length > 0 && inStockOnly
                                ? "Nenhum resultado com estoque disponível."
                                : "Nenhum produto encontrado."}
                        </p>
                    )}

                    {!isSearching && !searchError && visibleSuggestions.length > 0 && (
                        <ul className="cashier-search__list">
                            {visibleSuggestions.map((product) => (
                                <li key={product.id}>
                                    <button
                                        className="cashier-search__result"
                                        type="button"
                                        onClick={() => {
                                            onSelect(product);
                                            onChange("");
                                        }}
                                    >
                                        <span className="cashier-search__result-name">
                                            {product.name}
                                        </span>
                                        <span className="cashier-search__result-meta">
                                            {product.sm_code || product.bar_code || "Sem código"}
                                            {" · "}
                                            {currencyFormatter.format(parseNumber(product.value))}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}

function ClientSearchField({ value, selectedClientId, onChange, onSelect, onCreateClient }) {
    const [suggestions, setSuggestions] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [searchError, setSearchError] = useState("");
    const query = value.trim();

    useEffect(() => {
        if (!query || selectedClientId !== null) {
            setSuggestions([]);
            setIsSearching(false);
            setSearchError("");
            return undefined;
        }

        const controller = new AbortController();
        setSuggestions([]);
        setIsSearching(true);
        setSearchError("");

        const timeoutId = window.setTimeout(() => {
            getCashierClients(query, controller.signal)
                .then((clients) => {
                    if (controller.signal.aborted) return;
                    setSuggestions(clients);
                    setIsSearching(false);
                })
                .catch((error) => {
                    if (controller.signal.aborted) return;
                    setSuggestions([]);
                    setSearchError(
                        getErrorMessage(error, "Nao foi possivel pesquisar clientes.")
                    );
                    setIsSearching(false);
                });
        }, 300);

        return () => {
            window.clearTimeout(timeoutId);
            controller.abort();
        };
    }, [query, selectedClientId]);

    return (
        <div className="cashier-client-search">
            <label className="cashier-client-search__field">
                <span className="visually-hidden">Cliente (opcional)</span>
                <input
                    type="search"
                    autoComplete="off"
                    placeholder="Cliente (opcional)"
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                />
            </label>

            {query && selectedClientId === null && (
                <div className="cashier-search__results" aria-live="polite" aria-busy={isSearching}>
                    {isSearching && (
                        <p className="cashier-search__message">Buscando clientes...</p>
                    )}
                    {!isSearching && searchError && (
                        <p className="cashier-search__message cashier-search__message--error" role="alert">
                            {searchError}
                        </p>
                    )}
                    {!isSearching && !searchError && suggestions.length === 0 && (
                        <div className="cashier-client-search__empty">
                            <p className="cashier-search__message">Nenhum cliente encontrado.</p>
                            <button
                                className="cashier-client-search__create"
                                type="button"
                                onClick={() => onCreateClient(query)}
                            >
                                Cadastrar cliente
                            </button>
                        </div>
                    )}
                    {!isSearching && !searchError && suggestions.length > 0 && (
                        <ul className="cashier-search__list">
                            {suggestions.map((client) => {
                                const taxId = client.cpf || client.cnpj;
                                return (
                                    <li key={client.id}>
                                        <button
                                            className="cashier-search__result"
                                            type="button"
                                            onClick={() => onSelect(client)}
                                        >
                                            <span className="cashier-search__result-name">{client.name}</span>
                                            <span className="cashier-search__result-meta">
                                                {taxId
                                                    ? (client.cpf ? "CPF: " : "CNPJ: ") + taxId
                                                    : "Sem CPF/CNPJ"}
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}
export default function CashierPage() {
    const location = useLocation();
    const navigate = useNavigate();
    const [paymentMethods, setPaymentMethods] = useState([]);
    const [installments, setInstallments] = useState([]);
    const [selectedProducts, setSelectedProducts] = useState([]);
    const [searches, setSearches] = useState(initialSearches);
    const [inStockOnly, setInStockOnly] = useState(false);
    const [columnVisibility, setColumnVisibility] = useState(initialColumnVisibility);
    const [isColumnMenuOpen, setIsColumnMenuOpen] = useState(false);
    const columnFilterRef = useRef(null);
    const [isLoadingPayment, setIsLoadingPayment] = useState(true);
    const [paymentError, setPaymentError] = useState("");
    const [isSalesModalOpen, setIsSalesModalOpen] = useState(false);
    const [editingPriceId, setEditingPriceId] = useState(null);
    const [priceDraft, setPriceDraft] = useState("");
    const [clientName, setClientName] = useState("");
    const [clientId, setClientId] = useState(null);
    const [clientTaxId, setClientTaxId] = useState("");
    const [isClientModalOpen, setIsClientModalOpen] = useState(false);
    const [paymentMethodId, setPaymentMethodId] = useState("");
    const [installmentId, setInstallmentId] = useState("");
    const [feedback, setFeedback] = useState(null);
    const [finalizationStage, setFinalizationStage] = useState(null);
    const [isFinalizing, setIsFinalizing] = useState(false);
    const [isCheckingClient, setIsCheckingClient] = useState(false);
    const [resumeAfterRegistration, setResumeAfterRegistration] = useState(false);
    const [finalizationError, setFinalizationError] = useState("");
    const [taxIdDraft, setTaxIdDraft] = useState("");
    const [completedSale, setCompletedSale] = useState(null);

    const closeSalesModal = useCallback(() => {
        setIsSalesModalOpen(false);
    }, []);

    useEffect(() => {
        let isMounted = true;

        Promise.allSettled([
            getCashierPaymentMethods(),
            getCashierInstallments()
        ]).then(([methodsResult, installmentsResult]) => {
            if (!isMounted) {
                return;
            }

            let nextPaymentError = "";

            if (methodsResult.status === "fulfilled") {
                const activeMethods = methodsResult.value.filter(isActiveRecord);
                const defaultMethod = activeMethods.find(
                    (method) => normalizeText(method.name).includes("credito")
                ) ?? activeMethods[0];

                setPaymentMethods(activeMethods);
                if (!location.state?.cashierDraft?.paymentMethodId) {
                    setPaymentMethodId(defaultMethod ? String(defaultMethod.id) : "");
                }
            } else {
                nextPaymentError = getErrorMessage(
                    methodsResult.reason,
                    "Não foi possível carregar as formas de pagamento."
                );
            }

            if (installmentsResult.status === "fulfilled") {
                const availableInstallments = installmentsResult.value;
                setInstallments(availableInstallments);
                const preferredInstallment = location.state?.cashierDraft?.installmentId;
                const preferredInstallmentExists = availableInstallments.some(
                    (installment) => String(installment.id) === String(preferredInstallment)
                );
                setInstallmentId(
                    preferredInstallmentExists
                        ? String(preferredInstallment)
                        : availableInstallments[0]
                            ? String(availableInstallments[0].id)
                            : ""
                );
            } else if (!nextPaymentError) {
                nextPaymentError = getErrorMessage(
                    installmentsResult.reason,
                    "Não foi possível carregar os parcelamentos."
                );
            }

            setPaymentError(nextPaymentError);
            setIsLoadingPayment(false);
        });

        return () => {
            isMounted = false;
        };
    }, []);

    useEffect(() => {
        const routeState = location.state;
        if (!routeState) return;

        const draft = routeState.cashierDraft;
        if (draft) {
            setSelectedProducts(Array.isArray(draft.selectedProducts) ? draft.selectedProducts : []);
            setSearches(draft.searches ?? initialSearches);
            setInStockOnly(Boolean(draft.inStockOnly));
            setColumnVisibility(draft.columnVisibility ?? initialColumnVisibility);
            setClientName(draft.clientName ?? "");
            setClientId(draft.clientId ?? null);
            setClientTaxId(draft.clientTaxId ?? "");
            setPaymentMethodId(draft.paymentMethodId ? String(draft.paymentMethodId) : "");
            setInstallmentId(draft.installmentId ? String(draft.installmentId) : "");
        }

        if (routeState.createdClient) {
            const client = routeState.createdClient;
            setClientId(client.id);
            setClientName(client.name);
            setClientTaxId(client.cpf || client.cnpj || "");
        }

        if (routeState.resumeFinalization) {
            setResumeAfterRegistration(true);
        }

        navigate(location.pathname, { replace: true, state: null });
    }, [location.key, location.pathname, navigate]);
    useEffect(() => {
        if (!isColumnMenuOpen) {
            return undefined;
        }

        function handleOutsideClick(event) {
            if (!columnFilterRef.current?.contains(event.target)) {
                setIsColumnMenuOpen(false);
            }
        }

        function handleEscape(event) {
            if (event.key === "Escape") {
                setIsColumnMenuOpen(false);
            }
        }

        document.addEventListener("mousedown", handleOutsideClick);
        window.addEventListener("keydown", handleEscape);

        return () => {
            document.removeEventListener("mousedown", handleOutsideClick);
            window.removeEventListener("keydown", handleEscape);
        };
    }, [isColumnMenuOpen]);
    const saleItemCount = useMemo(
        () => selectedProducts.reduce(
            (total, saleItem) => total + saleItem.quantity,
            0
        ),
        [selectedProducts]
    );

    const productSubtotal = useMemo(
        () => selectedProducts.reduce(
            (total, saleItem) => total + saleItem.quantity * saleItem.unitPrice,
            0
        ),
        [selectedProducts]
    );

    const selectedPaymentMethod = paymentMethods.find(
        (method) => String(method.id) === paymentMethodId
    );
    const isCreditPayment = normalizeText(selectedPaymentMethod?.name)
        .includes("credito");
    const selectedInstallment = installments.find(
        (installment) => String(installment.id) === installmentId
    );
    const installmentSurcharge = isCreditPayment
        ? productSubtotal * (Number(selectedInstallment?.percentage) || 0)
        : 0;
    const totalValue = Math.round((productSubtotal + installmentSurcharge + Number.EPSILON) * 100) / 100;

    const visibleColumns = cashierColumns.filter(
        (column) => columnVisibility[column.key]
    );
    const tableColumnCount = visibleColumns.length + 2;
    function toggleColumn(columnKey) {
        if (columnKey === "unitPrice") {
            setEditingPriceId(null);
        }

        setColumnVisibility((currentVisibility) => ({
            ...currentVisibility,
            [columnKey]: !currentVisibility[columnKey]
        }));
    }
    function updateSearch(field, value) {
        setSearches((currentSearches) => ({
            ...currentSearches,
            [field]: value
        }));
    }

    function clearSearches() {
        setSearches(initialSearches);
        setInStockOnly(false);
    }

    function addProductToSale(product) {
        setSelectedProducts((currentProducts) => {
            const existingItem = currentProducts.find(
                (saleItem) => saleItem.product.id === product.id
            );

            if (existingItem) {
                return currentProducts.map((saleItem) =>
                    saleItem.product.id === product.id
                        ? { ...saleItem, quantity: saleItem.quantity + 1 }
                        : saleItem
                );
            }

            return [
                ...currentProducts,
                {
                    product,
                    quantity: 1,
                    unitPrice: parseNumber(product.value)
                }
            ];
        });
        setFeedback(null);
    }

    function changeSaleQuantity(productId, change) {
        setSelectedProducts((currentProducts) => {
            const saleItem = currentProducts.find(
                (item) => item.product.id === productId
            );

            if (!saleItem) {
                return currentProducts;
            }

            const nextQuantity = saleItem.quantity + change;

            if (nextQuantity <= 0) {
                return currentProducts.filter(
                    (item) => item.product.id !== productId
                );
            }

            return currentProducts.map((item) =>
                item.product.id === productId
                    ? { ...item, quantity: nextQuantity }
                    : item
            );
        });
        setFeedback(null);
    }

    function removeFromSale(productId) {
        setSelectedProducts((currentProducts) =>
            currentProducts.filter(
                (saleItem) => saleItem.product.id !== productId
            )
        );
        setFeedback({
            kind: "notice",
            message: "Produto removido desta venda."
        });
    }

    function beginPriceEdit(saleItem) {
        setEditingPriceId(saleItem.product.id);
        setPriceDraft(String(saleItem.unitPrice.toFixed(2)));
        setFeedback(null);
    }

    function savePriceEdit() {
        const parsedPrice = Number(priceDraft.replace(",", "."));

        if (editingPriceId === null) {
            return;
        }

        if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
            setFeedback({
                kind: "error",
                message: "Informe um preço válido para o produto."
            });
            return;
        }

        setSelectedProducts((currentProducts) =>
            currentProducts.map((saleItem) =>
                saleItem.product.id === editingPriceId
                    ? { ...saleItem, unitPrice: parsedPrice }
                    : saleItem
            )
        );
        setEditingPriceId(null);
        setFeedback({
            kind: "notice",
            message: "Preço atualizado somente nesta venda."
        });
    }

    function handleClientSearch() {
        setIsClientModalOpen(true);
        setFeedback(null);
    }

    function openClientRegistration(query = clientName, resumeFinalization = false) {
        const searchValue = String(query ?? "").trim();
        const digits = searchValue.replace(/\D/g, "");
        const isTaxIdSearch = [11, 14].includes(digits.length) && /^[\d\s./()-]+$/.test(searchValue);
        const cashierDraft = {
            selectedProducts,
            searches,
            inStockOnly,
            columnVisibility,
            clientName,
            clientId,
            clientTaxId,
            paymentMethodId,
            installmentId
        };

        navigate("/clientes/novo", {
            state: {
                cashierDraft,
                clientName: isTaxIdSearch ? "" : searchValue,
                clientTaxId: isTaxIdSearch ? digits : "",
                resumeFinalization
            }
        });
    }

    function selectClient(client) {
        setClientId(client.id);
        setClientName(client.name);
        setClientTaxId(client.cpf || client.cnpj || "");
        setIsClientModalOpen(false);
        setFeedback(null);
    }

    async function submitSale(taxIdOverride = null, clientOverride = null) {
        if (isFinalizing || selectedProducts.length === 0 || !paymentMethodId) return;

        setIsFinalizing(true);
        setFinalizationError("");

        try {
            const saleClientName = clientOverride?.name ?? clientName;
            const saleClientId = clientOverride?.id ?? clientId;
            const sale = await createCashierSale({
                clientName: String(saleClientName ?? "").trim() || null,
                clientId: saleClientId,
                clientTaxId: taxIdOverride || null,
                paymentMethodId: Number(paymentMethodId),
                installmentId: isCreditPayment && installmentId ? Number(installmentId) : null,
                items: selectedProducts.map((saleItem) => ({
                    productId: saleItem.product.id,
                    quantity: saleItem.quantity,
                    unitPrice: saleItem.unitPrice
                }))
            });

            setCompletedSale(sale);
            setFinalizationStage("success");
            setSelectedProducts([]);
            setClientName("");
            setClientId(null);
            setClientTaxId("");
            setTaxIdDraft("");
            setFeedback(null);
        } catch (error) {
            setFinalizationError(
                error instanceof Error ? error.message : "Não foi possível registrar a venda."
            );
        } finally {
            setIsFinalizing(false);
        }
    }

    async function handleFinalizeSale() {
        if (saleItemCount === 0 || !paymentMethodId || isFinalizing || isCheckingClient) return;

        setFeedback(null);
        setFinalizationError("");
        setTaxIdDraft("");

        if (clientName.trim() && clientId === null) {
            setIsCheckingClient(true);

            try {
                const matches = await getCashierClients(clientName.trim());
                const query = normalizeText(clientName);
                const queryDigits = clientName.replace(/\D/g, "");
                const exactMatches = matches.filter((client) => {
                    const exactName = normalizeText(client.name) === query;
                    const exactTaxId = [client.cpf, client.cnpj]
                        .filter(Boolean)
                        .some((taxId) => String(taxId).replace(/\D/g, "") === queryDigits && [11, 14].includes(queryDigits.length));
                    return exactName || exactTaxId;
                });

                if (exactMatches.length === 1) {
                    const client = exactMatches[0];
                    const taxId = client.cpf || client.cnpj || "";
                    setClientId(client.id);
                    setClientName(client.name);
                    setClientTaxId(taxId);

                    if (taxId) {
                        setFinalizationStage("submitting");
                        void submitSale(null, client);
                    } else {
                        setFinalizationStage("ask-tax-id");
                    }
                    return;
                }

                if (matches.length === 0) {
                    openClientRegistration(clientName, true);
                    return;
                }

                setFeedback({
                    kind: "error",
                    message: "Selecione um dos clientes encontrados na lista antes de finalizar."
                });
                return;
            } catch (error) {
                setFeedback({
                    kind: "error",
                    message: getErrorMessage(error, "Não foi possível confirmar o cliente.")
                });
                return;
            } finally {
                setIsCheckingClient(false);
            }
        }

        const hasKnownTaxId = Boolean(clientTaxId.trim());
        setFinalizationStage(clientName.trim() && !hasKnownTaxId ? "ask-tax-id" : "submitting");

        if (!clientName.trim() || hasKnownTaxId) void submitSale(null);
    }

    useEffect(() => {
        if (!resumeAfterRegistration || isLoadingPayment) return;

        setResumeAfterRegistration(false);
        setFinalizationError("");
        setTaxIdDraft("");

        if (clientName.trim() && !clientTaxId.trim()) {
            setFinalizationStage("ask-tax-id");
            return;
        }

        setFinalizationStage("submitting");
        void submitSale(null);
    }, [resumeAfterRegistration, isLoadingPayment]);
    function handleTaxIdSubmit() {
        const normalizedTaxId = taxIdDraft.replace(/\D/g, "");
        if (normalizedTaxId.length !== 11 && normalizedTaxId.length !== 14) {
            setFinalizationError("Informe um CPF com 11 dígitos ou CNPJ com 14 dígitos.");
            return;
        }
        void submitSale(normalizedTaxId);
    }

    function closeFinalizationModal() {
        if (isFinalizing) return;
        setFinalizationStage(null);
        setFinalizationError("");
        setCompletedSale(null);
    }

return (
        <main className="cashier-page">
            <header className="cashier-header">
                <h1 className="cashier-header__brand">POSSO AJUDAR?</h1>
                <span className="cashier-header__page-title">Caixa</span>
            </header>

            <div className="cashier-content">
                <section className="cashier-toolbar" aria-label="Busca de produtos">
                    <div className="cashier-column-filter" ref={columnFilterRef}>
                        <button
                            className={"cashier-toolbar__icon-button " + (isColumnMenuOpen ? "is-active" : "")}
                            type="button"
                            aria-label="Configurar colunas da tabela"
                            aria-expanded={isColumnMenuOpen}
                            aria-controls="cashier-column-filter-menu"
                            title="Configurar colunas da tabela"
                            onClick={() => setIsColumnMenuOpen((isOpen) => !isOpen)}
                        >
                            <CashierIcon name="filter" />
                        </button>

                        {isColumnMenuOpen && (
                            <div
                                className="cashier-column-filter__menu"
                                id="cashier-column-filter-menu"
                            >
                                <h2 className="cashier-column-filter__title">
                                    Colunas da tabela
                                </h2>
                                <p className="cashier-column-filter__hint">
                                    Ative ou oculte as informações exibidas no Caixa.
                                </p>

                                <div className="cashier-column-filter__options">
                                    {cashierColumns.map((column) => {
                                        const isVisible = columnVisibility[column.key];

                                        return (
                                            <button
                                                className="cashier-column-filter__toggle"
                                                type="button"
                                                key={column.key}
                                                aria-pressed={isVisible}
                                                onClick={() => toggleColumn(column.key)}
                                            >
                                                <span>{column.label}</span>
                                                <span
                                                    className="cashier-column-filter__switch"
                                                    aria-hidden="true"
                                                >
                                                    <span />
                                                </span>
                                                <span className="cashier-column-filter__state">
                                                    {isVisible ? "Exibido" : "Oculto"}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>

                                <div className="cashier-column-filter__divider" />

                                <button
                                    className="cashier-column-filter__toggle"
                                    type="button"
                                    aria-pressed={inStockOnly}
                                    onClick={() => setInStockOnly((currentValue) => !currentValue)}
                                >
                                    <span>Somente produtos com estoque</span>
                                    <span
                                        className="cashier-column-filter__switch"
                                        aria-hidden="true"
                                    >
                                        <span />
                                    </span>
                                    <span className="cashier-column-filter__state">
                                        {inStockOnly ? "Ativo" : "Inativo"}
                                    </span>
                                </button>
                            </div>
                        )}
                    </div>

                    <button
                        className="cashier-toolbar__icon-button"
                        type="button"
                        aria-label="Limpar pesquisas"
                        title="Limpar pesquisas"
                        onClick={clearSearches}
                    >
                        <CashierIcon name="clear" />
                    </button>

                    <ProductSearchField
                        field="name"
                        label="Buscar produto pelo nome"
                        placeholder="Produto"
                        value={searches.name}
                        inStockOnly={inStockOnly}
                        onChange={(value) => updateSearch("name", value)}
                        onSelect={addProductToSale}
                    />

                    <ProductSearchField
                        field="smCode"
                        label="Buscar pelo código reduzido"
                        placeholder="Código Reduzido"
                        value={searches.smCode}
                        inStockOnly={inStockOnly}
                        onChange={(value) => updateSearch("smCode", value)}
                        onSelect={addProductToSale}
                    />

                    <ProductSearchField
                        field="barCode"
                        label="Buscar pelo código de barras"
                        placeholder="Código de Barras"
                        value={searches.barCode}
                        inStockOnly={inStockOnly}
                        onChange={(value) => updateSearch("barCode", value)}
                        onSelect={addProductToSale}
                    />

                    <button
                        className="cashier-toolbar__icon-button cashier-toolbar__print"
                        type="button"
                        aria-label="Listar vendas e notas fiscais"
                        title="Notas fiscais e vendas"
                        onClick={() => setIsSalesModalOpen(true)}
                    >
                        <CashierIcon name="pdf" />
                    </button>
                </section>

                {paymentError && (
                    <p className="cashier-load-error cashier-load-error--payment" role="alert">
                        {paymentError}
                    </p>
                )}

                <section
                    className="cashier-products-panel"
                    aria-label="Produtos selecionados para venda"
                >
                    <div className="cashier-products-scroll">
                        <table className="cashier-table">
                            <thead>
                                <tr>
                                    <th scope="col">#</th>
                                    {visibleColumns.map((column) => (
                                        <th key={column.key} scope="col">
                                            {column.tableLabel}
                                        </th>
                                    ))}
                                    <th scope="col">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {selectedProducts.length === 0 && (
                                    <tr>
                                        <td className="cashier-table__message" colSpan={tableColumnCount}>
                                            Pesquise um produto e selecione um resultado para adicioná-lo à venda.
                                        </td>
                                    </tr>
                                )}

                                {selectedProducts.map((saleItem, index) => {
                                    const { product, quantity, unitPrice } = saleItem;

                                    return (
                                        <tr key={product.id}>
                                            <td>{index + 1}</td>
                                            {visibleColumns.map((column) => (
                                                <td
                                                    key={column.key}
                                                    className={column.key === "description" ? "cashier-table__description" : ""}
                                                >
                                                    {column.key === "smCode" && (product.sm_code || "—")}
                                                    {column.key === "barCode" && (product.bar_code || "—")}
                                                    {column.key === "name" && product.name}
                                                    {column.key === "description" && (product.description || "—")}
                                                    {column.key === "quantity" && (
                                                        <output className="cashier-table__quantity">
                                                            {quantity} {product.unit_measure || "UN"}
                                                        </output>
                                                    )}
                                                    {column.key === "stock" && (parseNumber(product.amount) + " " + (product.unit_measure || "UN"))}
                                                    {column.key === "unitPrice" && (
                                                        editingPriceId === product.id ? (
                                                            <div className="cashier-price-editor">
                                                                <input
                                                                    autoFocus
                                                                    type="number"
                                                                    min="0"
                                                                    step="0.01"
                                                                    aria-label={"Novo preço para " + product.name}
                                                                    value={priceDraft}
                                                                    onChange={(event) => setPriceDraft(event.target.value)}
                                                                />
                                                                <button
                                                                    type="button"
                                                                    aria-label="Salvar preço"
                                                                    onClick={savePriceEdit}
                                                                >
                                                                    ✓
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    aria-label="Cancelar alteração de preço"
                                                                    onClick={() => setEditingPriceId(null)}
                                                                >
                                                                    ×
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            currencyFormatter.format(unitPrice)
                                                        )
                                                    )}
                                                </td>
                                            ))}
                                            <td>
                                                <div className="cashier-row-actions">
                                                    <button
                                                        className="cashier-row-actions__button cashier-row-actions__button--add"
                                                        type="button"
                                                        aria-label={"Adicionar " + product.name + " à venda"}
                                                        title="Adicionar uma unidade"
                                                        onClick={() => changeSaleQuantity(product.id, 1)}
                                                    >
                                                        <CashierIcon name="plus" />
                                                    </button>
                                                    <button
                                                        className="cashier-row-actions__button cashier-row-actions__button--remove"
                                                        type="button"
                                                        aria-label={"Remover uma unidade de " + product.name}
                                                        title="Remover uma unidade"
                                                        disabled={quantity === 0}
                                                        onClick={() => changeSaleQuantity(product.id, -1)}
                                                    >
                                                        <CashierIcon name="minus" />
                                                    </button>
                                                    {columnVisibility.unitPrice && (
                                                        <button
                                                            className="cashier-row-actions__button cashier-row-actions__button--price"
                                                            type="button"
                                                            aria-label={"Alterar preço de " + product.name + " nesta venda"}
                                                            title="Alterar preço nesta venda"
                                                            onClick={() => beginPriceEdit(saleItem)}
                                                        >
                                                            R$
                                                        </button>
                                                    )}
                                                    <button
                                                        className="cashier-row-actions__button cashier-row-actions__button--block"
                                                        type="button"
                                                        aria-label={"Remover " + product.name + " desta venda"}
                                                        title="Remover da venda"
                                                        onClick={() => removeFromSale(product.id)}
                                                    >
                                                        <CashierIcon name="block" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </section>

                <section className="cashier-checkout" aria-label="Resumo da venda">
                    <div className="cashier-total">
                        <h2>TOTAL</h2>
                        <output>{currencyFormatter.format(totalValue)}</output>
                        {installmentSurcharge > 0 && (
                            <small className="cashier-total__surcharge">
                                Inclui {currencyFormatter.format(installmentSurcharge)} de parcelamento
                            </small>
                        )}
                        <span className="visually-hidden">
                            {saleItemCount} unidade(s) na venda
                        </span>
                    </div>

                    <div className="cashier-payment">
                        <ClientSearchField
                            value={clientName}
                            selectedClientId={clientId}
                            onChange={(value) => {
                                setClientName(value);
                                setClientId(null);
                                setClientTaxId("");
                            }}
                            onSelect={selectClient}
                            onCreateClient={openClientRegistration}
                        />

                        <label className="cashier-payment__method">
                            <span className="visually-hidden">Forma de pagamento</span>
                            <select
                                value={paymentMethodId}
                                disabled={isLoadingPayment || paymentMethods.length === 0}
                                onChange={(event) => setPaymentMethodId(event.target.value)}
                            >
                                {isLoadingPayment && (
                                    <option value="">Carregando formas de pagamento...</option>
                                )}
                                {!isLoadingPayment && paymentMethods.length === 0 && (
                                    <option value="">Forma de pagamento indisponível</option>
                                )}
                                {paymentMethods.map((method) => (
                                    <option key={method.id} value={method.id}>
                                        {method.name}
                                    </option>
                                ))}
                            </select>
                        </label>

                        {isCreditPayment && (
                            <label className="cashier-payment__installment">
                                <span className="visually-hidden">Parcelas</span>
                                <select
                                    value={installmentId}
                                    disabled={installments.length === 0}
                                    onChange={(event) => setInstallmentId(event.target.value)}
                                >
                                    {installments.length === 0 && (
                                        <option value="">Parcelamento indisponível</option>
                                    )}
                                    {installments.map((installment) => (
                                        <option
                                            key={installment.id}
                                            value={installment.id}
                                        >
                                            {installment.in_installments}x
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}
                    </div>

                    <div className="cashier-checkout__actions">
                        <button
                            className="cashier-checkout__button"
                            type="button"
                            disabled={saleItemCount === 0 || !paymentMethodId || isFinalizing || isCheckingClient}
                            onClick={handleFinalizeSale}
                        >
                            {isCheckingClient ? "Verificando cliente..." : isFinalizing ? "Finalizando..." : "Finalizar"}
                        </button>
                        <button
                            className="cashier-checkout__button"
                            type="button"
                            onClick={handleClientSearch}
                        >
                            Buscar Clientes
                        </button>
                    </div>
                </section>

                {feedback && (
                    <p
                        className={"cashier-feedback cashier-feedback--" + feedback.kind}
                        role={feedback.kind === "error" ? "alert" : "status"}
                    >
                        {feedback.message}
                    </p>
                )}
            </div>
            {isSalesModalOpen && (
                <CashierSalesModal onClose={closeSalesModal} />
            )}
            {isClientModalOpen && (
                <CashierClientModal
                    onClose={() => setIsClientModalOpen(false)}
                    onSelect={selectClient}
                />
            )}
            {finalizationStage && (
                <CashierFinalizationModal
                    stage={finalizationStage}
                    clientName={clientName}
                    taxId={taxIdDraft}
                    onTaxIdChange={setTaxIdDraft}
                    errorMessage={finalizationError}
                    isSubmitting={isFinalizing}
                    sale={completedSale}
                    onAddTaxId={() => {
                        setFinalizationError("");
                        setFinalizationStage("tax-id");
                    }}
                    onContinueWithoutTaxId={() => void submitSale(null)}
                    onSubmitTaxId={handleTaxIdSubmit}
                    onClose={closeFinalizationModal}
                    onDownloadPdf={printSalePdf}
                    onDownloadXml={downloadSaleXml}
                />
            )}
        </main>
    );
}




