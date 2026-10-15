import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
    getBudgetInstallments,
    getBudgetPaymentMethods,
    getBudgetById,
    createBudget,
    getBudgetClients,
    searchBudgetItems
} from "@/data/api/budget";

import BudgetModal from "./budget_modal";
import BudgetClientModal from "./client_modal";
import BudgetFinalizationModal from "./finalization_modal";
import { printBudgetPdf, drawBudgetCoupon } from "./budget_documents";
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

const budgetColumns = [
    {
        key: "smCode",
        label: "Código reduzido",
        tableLabel: "Cód. Reduzido"
    },
    {
        key: "barCode",
        label: "Código de barras",
        tableLabel: "Cód. Barras"
    },
    {
        key: "name",
        label: "Produto / Serviço",
        tableLabel: "Produto / Serviço"
    },
    {
        key: "description",
        label: "Descrição",
        tableLabel: "Descrição"
    },
    {
        key: "unitPrice",
        label: "Preço (R$)",
        tableLabel: "R$"
    },
    {
        key: "quantity",
        label: "Quantidade (unidade)",
        tableLabel: "Qtd."
    },
    {
        key: "stock",
        label: "Estoque (unidade)",
        tableLabel: "Estoque"
    }
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

const budgetIcons = {
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

function BudgetIcon({ name, className = "" }) {
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
            {budgetIcons[name]}
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
    if (!record || typeof record !== "object") {
        return false;
    }

    if (
        record.status === undefined ||
        record.status === null ||
        record.status === ""
    ) {
        return true;
    }

    return record.status === true || Number(record.status) === 1;
}

function getErrorMessage(error, fallback) {
    return error instanceof Error ? error.message : fallback;
}

function getBudgetItemKey(item) {
    return `${item.itemType || "product"}:${item.id}`;
}

function getBudgetPaymentType(methodName) {
    const name = normalizeText(methodName);

    if (name.includes("dinheiro")) return "cash";
    if (name.includes("debito")) return "debit";
    if (name.includes("credito")) return "credit";

    return "other";
}

/**
 * Pesquisa de produtos e serviços.
 */
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

    const query = String(value ?? "").trim();

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

        const timeoutId = window.setTimeout(async () => {
            try {
                const results = await searchBudgetItems(
                    field,
                    query,
                    controller.signal
                );

                if (controller.signal.aborted) return;

                const items = Array.isArray(results) ? results : [];

                const normalizedSuggestions = items
                    .filter(isActiveRecord)
                    .map((item) => {
                        const itemType =
                            item.itemType === "service"
                                ? "service"
                                : "product";

                        return {
                            ...item,
                            itemType,
                            value: item.value ?? item.cost ?? 0,
                            amount:
                                itemType === "service"
                                    ? null
                                    : item.amount,
                            unit_measure: item.unit_measure || "UN"
                        };
                    });

                setSuggestions(normalizedSuggestions);
                setSearchError("");
                setIsSearching(false);
            } catch (error) {
                if (controller.signal.aborted) return;

                setSuggestions([]);
                setSearchError(
                    getErrorMessage(
                        error,
                        "Não foi possível pesquisar produtos e serviços."
                    )
                );
                setIsSearching(false);
            }
        }, 300);

        return () => {
            window.clearTimeout(timeoutId);
            controller.abort();
        };
    }, [field, query]);

    const visibleSuggestions = inStockOnly
        ? suggestions.filter(
            (item) =>
                item.itemType === "service" ||
                parseNumber(item.amount) > 0
        )
        : suggestions;

    return (
        <div className={"budget-search budget-search--" + field}>
            <label className="budget-search__field">
                <span className="visually-hidden">{label}</span>
                <BudgetIcon name="search" />

                <input
                    type="search"
                    autoComplete="off"
                    value={value}
                    placeholder={placeholder}
                    onChange={(event) => onChange(event.target.value)}
                />
            </label>

            {query && (
                <div
                    className="budget-search__results"
                    aria-live="polite"
                    aria-busy={isSearching}
                >
                    {isSearching && (
                        <p className="budget-search__message">
                            Buscando produtos e serviços...
                        </p>
                    )}

                    {!isSearching && searchError && (
                        <p
                            className="budget-search__message budget-search__message--error"
                            role="alert"
                        >
                            {searchError}
                        </p>
                    )}

                    {!isSearching &&
                        !searchError &&
                        visibleSuggestions.length === 0 && (
                            <p className="budget-search__message">
                                {suggestions.length > 0 && inStockOnly
                                    ? "Nenhum produto com estoque disponível."
                                    : "Nenhum produto ou serviço encontrado."}
                            </p>
                        )}

                    {!isSearching &&
                        !searchError &&
                        visibleSuggestions.length > 0 && (
                            <ul className="budget-search__list">
                                {visibleSuggestions.map((item) => (
                                    <li key={getBudgetItemKey(item)}>
                                        <button
                                            className="budget-search__result"
                                            type="button"
                                            onClick={() => {
                                                onSelect(item);
                                                onChange("");
                                            }}
                                        >
                                            <span className="budget-search__result-name">
                                                {item.name}
                                            </span>

                                            <span className="budget-search__result-meta">
                                                {item.itemType === "service"
                                                    ? "Serviço"
                                                    : "Produto"}
                                                {" · "}
                                                {item.sm_code ||
                                                    item.bar_code ||
                                                    "Sem código"}
                                                {" · "}
                                                {currencyFormatter.format(
                                                    parseNumber(item.value)
                                                )}
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

/**
 * Pesquisa de clientes.
 */
function ClientSearchField({
    value,
    selectedClientId,
    onChange,
    onSelect,
    onCreateClient
}) {
    const [suggestions, setSuggestions] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [searchError, setSearchError] = useState("");

    const query = String(value ?? "").trim();

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
            getBudgetClients(query, controller.signal)
                .then((clients) => {
                    if (controller.signal.aborted) return;

                    setSuggestions(
                        Array.isArray(clients) ? clients : []
                    );
                    setIsSearching(false);
                })
                .catch((error) => {
                    if (controller.signal.aborted) return;

                    setSuggestions([]);
                    setSearchError(
                        getErrorMessage(
                            error,
                            "Não foi possível pesquisar clientes."
                        )
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
        <div className="budget-client-search">
            <label className="budget-client-search__field">
                <span className="visually-hidden">
                    Cliente (opcional)
                </span>

                <input
                    type="search"
                    autoComplete="off"
                    placeholder="Cliente (opcional)"
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                />
            </label>

            {query && selectedClientId === null && (
                <div
                    className="budget-search__results"
                    aria-live="polite"
                    aria-busy={isSearching}
                >
                    {isSearching && (
                        <p className="budget-search__message">
                            Buscando clientes...
                        </p>
                    )}

                    {!isSearching && searchError && (
                        <p
                            className="budget-search__message budget-search__message--error"
                            role="alert"
                        >
                            {searchError}
                        </p>
                    )}

                    {!isSearching &&
                        !searchError &&
                        suggestions.length === 0 && (
                            <div className="budget-client-search__empty">
                                <p className="budget-search__message">
                                    Nenhum cliente encontrado.
                                </p>

                                <button
                                    className="budget-client-search__create"
                                    type="button"
                                    onClick={() => onCreateClient(query)}
                                >
                                    Cadastrar cliente
                                </button>
                            </div>
                        )}

                    {!isSearching &&
                        !searchError &&
                        suggestions.length > 0 && (
                            <ul className="budget-search__list">
                                {suggestions.map((client) => {
                                    const taxId = client.cpf || client.cnpj;

                                    return (
                                        <li key={client.id}>
                                            <button
                                                className="budget-search__result"
                                                type="button"
                                                onClick={() => onSelect(client)}
                                            >
                                                <span className="budget-search__result-name">
                                                    {client.name}
                                                </span>

                                                <span className="budget-search__result-meta">
                                                    {taxId
                                                        ? (client.cpf
                                                            ? "CPF: "
                                                            : "CNPJ: ") + taxId
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

export default function BudgetPage() {
    const location = useLocation();
    const navigate = useNavigate();

    const [paymentMethods, setPaymentMethods] = useState([]);
    const [installments, setInstallments] = useState([]);
    const [selectedItems, setSelectedItems] = useState([]);
    const [searches, setSearches] = useState(initialSearches);
    const [inStockOnly, setInStockOnly] = useState(false);
    const [columnVisibility, setColumnVisibility] = useState(initialColumnVisibility);
    const [isColumnMenuOpen, setIsColumnMenuOpen] = useState(false);

    const columnFilterRef = useRef(null);
    const budgetSubmissionStartedRef = useRef(false);

    const [isLoadingPayment, setIsLoadingPayment] = useState(true);
    const [paymentError, setPaymentError] = useState("");
    const [editingPriceId, setEditingPriceId] = useState(null);
    const [priceDraft, setPriceDraft] = useState("");
    const [clientName, setClientName] = useState("");
    const [clientId, setClientId] = useState(null);
    const [isClientModalOpen, setIsClientModalOpen] = useState(false);
    const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
    const [paymentMethodId, setPaymentMethodId] = useState("");
    const [installmentId, setInstallmentId] = useState("");
    const [feedback, setFeedback] = useState(null);
    const [isSavingBudget, setIsSavingBudget] = useState(false);
    const [isCheckingClient, setIsCheckingClient] = useState(false);
    const [completedBudget, setCompletedBudget] = useState(null);
    const [finalizationStage, setFinalizationStage] = useState(null);

    useEffect(() => {
        let isMounted = true;

        Promise.allSettled([
            getBudgetPaymentMethods(),
            getBudgetInstallments()
        ]).then(([methodsResult, installmentsResult]) => {
            if (!isMounted) return;

            let nextPaymentError = "";

            if (methodsResult.status === "fulfilled") {
                const methods = Array.isArray(methodsResult.value)
                    ? methodsResult.value
                    : [];
                const activeMethods = methods.filter(isActiveRecord);
                const defaultMethod = activeMethods.find(
                    (method) => normalizeText(method.name).includes("credito")
                ) ?? activeMethods[0];

                setPaymentMethods(activeMethods);
                if (!location.state?.budgetDraft?.paymentMethodId) {
                    setPaymentMethodId(defaultMethod ? String(defaultMethod.id) : "");
                }
            } else {
                nextPaymentError = getErrorMessage(
                    methodsResult.reason,
                    "Não foi possível carregar as formas de pagamento."
                );
            }

            if (installmentsResult.status === "fulfilled") {
                const availableInstallments = Array.isArray(installmentsResult.value)
                    ? installmentsResult.value
                    : [];
                setInstallments(availableInstallments);

                const preferredInstallment = location.state?.budgetDraft?.installmentId;
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

        const draft = routeState.budgetDraft;
        if (draft) {
            setSelectedItems(Array.isArray(draft.selectedItems) ? draft.selectedItems : []);
            setSearches(draft.searches ?? initialSearches);
            setInStockOnly(Boolean(draft.inStockOnly));
            setColumnVisibility(draft.columnVisibility ?? initialColumnVisibility);
            setClientName(draft.clientName ?? "");
            setClientId(draft.clientId ?? null);
            setPaymentMethodId(draft.paymentMethodId ? String(draft.paymentMethodId) : "");
            setInstallmentId(draft.installmentId ? String(draft.installmentId) : "");
        }

        if (routeState.createdClient) {
            const client = routeState.createdClient;
            setClientId(client.id);
            setClientName(client.name);
        }

        navigate(location.pathname, { replace: true, state: null });
    }, [location.key, location.pathname, navigate]);

    useEffect(() => {
        if (!isColumnMenuOpen) return undefined;

        function handleOutsideClick(event) {
            if (!columnFilterRef.current?.contains(event.target)) {
                setIsColumnMenuOpen(false);
            }
        }

        function handleEscape(event) {
            if (event.key === "Escape") setIsColumnMenuOpen(false);
        }

        document.addEventListener("mousedown", handleOutsideClick);
        window.addEventListener("keydown", handleEscape);

        return () => {
            document.removeEventListener("mousedown", handleOutsideClick);
            window.removeEventListener("keydown", handleEscape);
        };
    }, [isColumnMenuOpen]);

    const budgetItemCount = useMemo(
        () => selectedItems.reduce((total, item) => total + item.quantity, 0),
        [selectedItems]
    );

    const itemsSubtotal = useMemo(
        () => selectedItems.reduce(
            (total, item) => total + item.quantity * item.unitPrice,
            0
        ),
        [selectedItems]
    );

    const selectedPaymentMethod = paymentMethods.find(
        (method) => String(method.id) === paymentMethodId
    );
    const budgetPaymentType = getBudgetPaymentType(selectedPaymentMethod?.name);
    const isCreditBudgetCondition = budgetPaymentType === "credit";
    const selectedInstallment = installments.find(
        (installment) => String(installment.id) === installmentId
    );
    const installmentSurcharge = isCreditBudgetCondition
        ? itemsSubtotal * (Number(selectedInstallment?.percentage) || 0)
        : 0;
    const totalValue = Math.round(
        (itemsSubtotal + installmentSurcharge + Number.EPSILON) * 100
    ) / 100;

    const visibleColumns = budgetColumns.filter((column) => columnVisibility[column.key]);
    const tableColumnCount = visibleColumns.length + 2;

    function toggleColumn(columnKey) {
        if (columnKey === "unitPrice") setEditingPriceId(null);
        setColumnVisibility((current) => ({
            ...current,
            [columnKey]: !current[columnKey]
        }));
    }

    function updateSearch(field, value) {
        setSearches((current) => ({ ...current, [field]: value }));
    }

    function clearSearches() {
        setSearches(initialSearches);
        setInStockOnly(false);
    }

    function addProductToBudget(item) {
        if (!item || item.id === undefined || item.id === null) {
            setFeedback({ kind: "error", message: "Não foi possível adicionar esse item ao orçamento." });
            return;
        }

        const itemKey = getBudgetItemKey(item);
        setSelectedItems((currentItems) => {
            const existing = currentItems.find(
                (entry) => getBudgetItemKey(entry.product) === itemKey
            );

            if (existing) {
                return currentItems.map((entry) =>
                    getBudgetItemKey(entry.product) === itemKey
                        ? { ...entry, quantity: entry.quantity + 1 }
                        : entry
                );
            }

            return [...currentItems, {
                product: item,
                quantity: 1,
                unitPrice: parseNumber(item.value)
            }];
        });
        setFeedback(null);
    }

    function changeBudgetQuantity(itemKey, change) {
        setSelectedItems((currentItems) => {
            const entry = currentItems.find(
                (item) => getBudgetItemKey(item.product) === itemKey
            );
            if (!entry) return currentItems;

            const nextQuantity = entry.quantity + change;
            if (nextQuantity <= 0) {
                return currentItems.filter(
                    (item) => getBudgetItemKey(item.product) !== itemKey
                );
            }

            return currentItems.map((item) =>
                getBudgetItemKey(item.product) === itemKey
                    ? { ...item, quantity: nextQuantity }
                    : item
            );
        });
        setFeedback(null);
    }

    function removeFromBudget(itemKey) {
        setSelectedItems((currentItems) => currentItems.filter(
            (item) => getBudgetItemKey(item.product) !== itemKey
        ));
        setFeedback({ kind: "notice", message: "Item removido deste orçamento." });
    }

    function beginPriceEdit(item) {
        setEditingPriceId(getBudgetItemKey(item.product));
        setPriceDraft(String(item.unitPrice.toFixed(2)));
        setFeedback(null);
    }

    function savePriceEdit() {
        const parsedPrice = Number(priceDraft.replace(",", "."));
        if (editingPriceId === null) return;

        if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
            setFeedback({ kind: "error", message: "Informe um preço válido para o item." });
            return;
        }

        setSelectedItems((currentItems) => currentItems.map((item) =>
            getBudgetItemKey(item.product) === editingPriceId
                ? { ...item, unitPrice: parsedPrice }
                : item
        ));
        setEditingPriceId(null);
        setFeedback({ kind: "notice", message: "Preço atualizado somente neste orçamento." });
    }

    function handleClientSearch() {
        setIsClientModalOpen(true);
        setFeedback(null);
    }

    function openClientRegistration(query = clientName) {
        const searchValue = String(query ?? "").trim();
        const digits = searchValue.replace(/\D/g, "");
        const isTaxIdSearch = [11, 14].includes(digits.length) && /^[\d\s./()-]+$/.test(searchValue);
        const budgetDraft = {
            selectedItems,
            searches,
            inStockOnly,
            columnVisibility,
            clientName,
            clientId,
            paymentMethodId,
            installmentId
        };

        navigate("/clientes/novo", {
            state: {
                budgetDraft,
                clientName: isTaxIdSearch ? "" : searchValue,
                clientTaxId: isTaxIdSearch ? digits : ""
            }
        });
    }

    function selectClient(client) {
        setClientId(client.id);
        setClientName(client.name);
        setIsClientModalOpen(false);
        setFeedback(null);
    }

    // Registra somente o orçamento. Não executa pagamento nem altera o estoque.
    async function submitBudget(clientOverride = null) {
        if (
            isSavingBudget ||
            budgetSubmissionStartedRef.current ||
            selectedItems.length === 0
        ) return;

        budgetSubmissionStartedRef.current = true;
        setIsSavingBudget(true);
        setFeedback(null);
        setFinalizationStage("submitting");

        try {
            const selectedClientId = clientOverride?.id ?? clientId ?? null;
            const savedBudget = await createBudget({
                clientId: selectedClientId,
                totalValue,
                items: selectedItems.map((entry) => {
                    const item = entry.product;
                    const isService = item.itemType === "service";
                    return {
                        ...(isService ? { serviceId: item.id } : { productId: item.id }),
                        quantity: entry.quantity,
                        unitPrice: entry.unitPrice,
                        unitMeasure: item.unit_measure || "UN"
                    };
                })
            });

            // O orçamento já foi persistido. Esta leitura adicional só enriquece
            // o cupom com os dados cadastrais; se falhar, o sucesso do POST é mantido.
            let savedDetails = null;
            if (savedBudget?.id) {
                try {
                    savedDetails = await getBudgetById(Number(savedBudget.id));
                } catch {
                    savedDetails = null;
                }
            }

            const completedItems = selectedItems.map((entry) => {
                const item = entry.product;
                return {
                    itemType: item.itemType === "service" ? "service" : "product",
                    sm_code: item.sm_code ?? "",
                    bar_code: item.bar_code ?? "",
                    name: item.name ?? "Item não identificado",
                    description: item.description ?? "",
                    quantity: entry.quantity,
                    unit_measure: item.unit_measure || "UN",
                    unit_price: entry.unitPrice,
                    total_value: Math.round((entry.quantity * entry.unitPrice + Number.EPSILON) * 100) / 100
                };
            });

            setCompletedBudget({
                ...(savedDetails ?? {}),
                id: savedBudget?.id ?? savedDetails?.id ?? null,
                total_value: savedBudget?.total_value ?? savedDetails?.total_value ?? totalValue,
                dt_budget: savedBudget?.dt_budget ?? savedDetails?.dt_budget ?? new Date().toISOString(),
                client_id: selectedClientId,
                client_name: (savedBudget?.client_name ?? savedDetails?.client_name ?? clientOverride?.name ?? clientName.trim()) || null,
                payment_method_name: selectedPaymentMethod?.name ?? null,
                installment_count: isCreditBudgetCondition
                    ? (selectedInstallment?.in_installments ?? null)
                    : null,
                product_subtotal: itemsSubtotal,
                sold_subtotal: itemsSubtotal,
                discount_total: 0,
                installment_surcharge: installmentSurcharge,
                customer: savedDetails?.customer ?? {
                    name: (clientOverride?.name ?? clientName.trim()) || null,
                    cpf: null,
                    cnpj: null,
                    address: null,
                    number: null,
                    complement: null,
                    neighborhood: null,
                    city: null,
                    state: null,
                    zip_code: null
                },
                company: savedDetails?.company ?? null,
                items: Array.isArray(savedDetails?.items) && savedDetails.items.length > 0
                    ? savedDetails.items
                    : completedItems
            });
            setFinalizationStage("success");

            setSelectedItems([]);
            setClientName("");
            setClientId(null);
            setEditingPriceId(null);
            setFeedback(null);
        } catch (error) {
            budgetSubmissionStartedRef.current = false;
            setFinalizationStage(null);
            setFeedback({
                kind: "error",
                message: getErrorMessage(error, "Não foi possível salvar o orçamento.")
            });
        } finally {
            setIsSavingBudget(false);
            budgetSubmissionStartedRef.current = false;
        }
    }

    async function handleSaveBudget() {
        if (budgetItemCount === 0 || isSavingBudget || isCheckingClient) return;
        setFeedback(null);

        if (clientName.trim() && clientId === null) {
            setIsCheckingClient(true);
            try {
                const matches = await getBudgetClients(clientName.trim());
                const query = normalizeText(clientName);
                const queryDigits = clientName.replace(/\D/g, "");
                const exactMatches = matches.filter((client) => {
                    const exactName = normalizeText(client.name) === query;
                    const exactTaxId = [client.cpf, client.cnpj]
                        .filter(Boolean)
                        .some((taxId) =>
                            String(taxId).replace(/\D/g, "") === queryDigits &&
                            [11, 14].includes(queryDigits.length)
                        );
                    return exactName || exactTaxId;
                });

                if (exactMatches.length === 1) {
                    selectClient(exactMatches[0]);
                    await submitBudget(exactMatches[0]);
                    return;
                }

                if (matches.length === 0) {
                    openClientRegistration(clientName);
                    return;
                }

                setFeedback({
                    kind: "error",
                    message: "Selecione um dos clientes encontrados na lista antes de salvar o orçamento."
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

        await submitBudget();
    }

    return (
        <main className="budget-page">
            <header className="budget-header">
                <h1
                    className="budget-header__brand"
                    onClick={() => {
                        window.location.href = "/";
                    }}
                >
                    POSSO AJUDAR?
                </h1>

                <span
                    className="budget-header__page-title"
                    style={{ paddingRight: "50px" }}
                >
                    Orçamento
                </span>
            </header>

            <div className="budget-content">
                <section
                    className="budget-toolbar"
                    aria-label="Busca de produtos e serviços"
                >
                    <div
                        className="budget-column-filter"
                        ref={columnFilterRef}
                    >
                        <button
                            className={
                                "budget-toolbar__icon-button " +
                                (isColumnMenuOpen ? "is-active" : "")
                            }
                            type="button"
                            aria-label="Configurar colunas da tabela"
                            aria-expanded={isColumnMenuOpen}
                            aria-controls="budget-column-filter-menu"
                            title="Configurar colunas da tabela"
                            onClick={() =>
                                setIsColumnMenuOpen((value) => !value)
                            }
                        >
                            <BudgetIcon name="filter" />
                        </button>

                        {isColumnMenuOpen && (
                            <div
                                className="budget-column-filter__menu"
                                id="budget-column-filter-menu"
                            >
                                <h2 className="budget-column-filter__title">
                                    Colunas da tabela
                                </h2>

                                <p className="budget-column-filter__hint">
                                    Ative ou oculte as informações exibidas no orçamento.
                                </p>

                                <div className="budget-column-filter__options">
                                    {budgetColumns.map((column) => {
                                        const isVisible =
                                            columnVisibility[column.key];

                                        return (
                                            <button
                                                className="budget-column-filter__toggle"
                                                type="button"
                                                key={column.key}
                                                aria-pressed={isVisible}
                                                onClick={() =>
                                                    toggleColumn(column.key)
                                                }
                                            >
                                                <span>{column.label}</span>

                                                <span
                                                    className="budget-column-filter__switch"
                                                    aria-hidden="true"
                                                >
                                                    <span />
                                                </span>

                                                <span className="budget-column-filter__state">
                                                    {isVisible
                                                        ? "Exibido"
                                                        : "Oculto"}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>

                                <div className="budget-column-filter__divider" />

                                <button
                                    className="budget-column-filter__toggle"
                                    type="button"
                                    aria-pressed={inStockOnly}
                                    onClick={() =>
                                        setInStockOnly((value) => !value)
                                    }
                                >
                                    <span>Somente produtos com estoque</span>

                                    <span
                                        className="budget-column-filter__switch"
                                        aria-hidden="true"
                                    >
                                        <span />
                                    </span>

                                    <span className="budget-column-filter__state">
                                        {inStockOnly ? "Ativo" : "Inativo"}
                                    </span>
                                </button>
                            </div>
                        )}
                    </div>

                    <button
                        className="budget-toolbar__icon-button"
                        type="button"
                        aria-label="Limpar pesquisas"
                        title="Limpar pesquisas"
                        onClick={clearSearches}
                    >
                        <BudgetIcon name="clear" />
                    </button>

                    <ProductSearchField
                        field="name"
                        label="Buscar produto ou serviço pelo nome"
                        placeholder="Produto ou serviço"
                        value={searches.name}
                        inStockOnly={inStockOnly}
                        onChange={(value) => updateSearch("name", value)}
                        onSelect={addProductToBudget}
                    />

                    <ProductSearchField
                        field="smCode"
                        label="Buscar produto ou serviço pelo código reduzido"
                        placeholder="Código Reduzido"
                        value={searches.smCode}
                        inStockOnly={inStockOnly}
                        onChange={(value) => updateSearch("smCode", value)}
                        onSelect={addProductToBudget}
                    />

                    <ProductSearchField
                        field="barCode"
                        label="Buscar produto ou serviço pelo código de barras"
                        placeholder="Código de Barras"
                        value={searches.barCode}
                        inStockOnly={inStockOnly}
                        onChange={(value) => updateSearch("barCode", value)}
                        onSelect={addProductToBudget}
                    />

                    <button
                        className="budget-toolbar__icon-button budget-toolbar__print"
                        type="button"
                        aria-label="Listar orçamentos registrados"
                        title="Orçamentos registrados"
                        onClick={() => setIsBudgetModalOpen(true)}
                    >
                        <BudgetIcon name="pdf" />
                    </button>
                </section>

                {paymentError && (
                    <p
                        className="budget-load-error budget-load-error--payment"
                        role="alert"
                    >
                        {paymentError}
                    </p>
                )}

                <section
                    className="budget-products-panel"
                    aria-label="Produtos e serviços selecionados para o orçamento"
                >
                    <div className="budget-products-scroll">
                        <table className="budget-table">
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
                                {selectedItems.length === 0 && (
                                    <tr>
                                        <td
                                            className="budget-table__message"
                                            colSpan={tableColumnCount}
                                        >
                                            Pesquise um produto ou serviço e selecione um resultado para adicioná-lo ao orçamento.
                                        </td>
                                    </tr>
                                )}

                                {selectedItems.map((budgetItem, index) => {
                                    const {
                                        product,
                                        quantity,
                                        unitPrice
                                    } = budgetItem;

                                    const itemKey = getBudgetItemKey(product);
                                    const isService =
                                        product.itemType === "service";

                                    return (
                                        <tr key={itemKey}>
                                            <td>{index + 1}</td>

                                            {visibleColumns.map((column) => (
                                                <td
                                                    key={column.key}
                                                    className={
                                                        column.key === "description"
                                                            ? "budget-table__description"
                                                            : ""
                                                    }
                                                >
                                                    {column.key === "smCode" &&
                                                        (product.sm_code || "—")}

                                                    {column.key === "barCode" &&
                                                        (product.bar_code || "—")}

                                                    {column.key === "name" && (
                                                        <>
                                                            <span>{product.name}</span>
                                                            <small>
                                                                {" "}
                                                                ({isService
                                                                    ? "Serviço"
                                                                    : "Produto"})
                                                            </small>
                                                        </>
                                                    )}

                                                    {column.key === "description" &&
                                                        (product.description || "—")}

                                                    {column.key === "quantity" && (
                                                        <output className="budget-table__quantity">
                                                            {quantity}{" "}
                                                            {product.unit_measure || "UN"}
                                                        </output>
                                                    )}

                                                    {column.key === "stock" &&
                                                        (isService
                                                            ? "Não aplicável"
                                                            : parseNumber(product.amount) +
                                                              " " +
                                                              (product.unit_measure || "UN"))}

                                                    {column.key === "unitPrice" &&
                                                        (editingPriceId === itemKey ? (
                                                            <div className="budget-price-editor">
                                                                <input
                                                                    autoFocus
                                                                    type="number"
                                                                    min="0"
                                                                    step="0.01"
                                                                    aria-label={
                                                                        "Novo preço para " +
                                                                        product.name
                                                                    }
                                                                    value={priceDraft}
                                                                    onChange={(event) =>
                                                                        setPriceDraft(
                                                                            event.target.value
                                                                        )
                                                                    }
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
                                                                    onClick={() =>
                                                                        setEditingPriceId(null)
                                                                    }
                                                                >
                                                                    ×
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            currencyFormatter.format(unitPrice)
                                                        ))}
                                                </td>
                                            ))}

                                            <td>
                                                <div className="budget-row-actions">
                                                    <button
                                                        className="budget-row-actions__button budget-row-actions__button--add"
                                                        type="button"
                                                        aria-label={
                                                            "Adicionar " +
                                                            product.name +
                                                            " ao orçamento"
                                                        }
                                                        title="Adicionar uma unidade"
                                                        onClick={() =>
                                                            changeBudgetQuantity(
                                                                itemKey,
                                                                1
                                                            )
                                                        }
                                                    >
                                                        <BudgetIcon name="plus" />
                                                    </button>

                                                    <button
                                                        className="budget-row-actions__button budget-row-actions__button--remove"
                                                        type="button"
                                                        aria-label={
                                                            "Remover uma unidade de " +
                                                            product.name
                                                        }
                                                        title="Remover uma unidade"
                                                        onClick={() =>
                                                            changeBudgetQuantity(
                                                                itemKey,
                                                                -1
                                                            )
                                                        }
                                                    >
                                                        <BudgetIcon name="minus" />
                                                    </button>

                                                    {columnVisibility.unitPrice && (
                                                        <button
                                                            className="budget-row-actions__button budget-row-actions__button--price"
                                                            type="button"
                                                            aria-label={
                                                                "Alterar preço de " +
                                                                product.name +
                                                                " neste orçamento"
                                                            }
                                                            title="Alterar preço neste orçamento"
                                                            onClick={() =>
                                                                beginPriceEdit(budgetItem)
                                                            }
                                                        >
                                                            R$
                                                        </button>
                                                    )}

                                                    <button
                                                        className="budget-row-actions__button budget-row-actions__button--block"
                                                        type="button"
                                                        aria-label={
                                                            "Remover " +
                                                            product.name +
                                                            " deste orçamento"
                                                        }
                                                        title="Remover do orçamento"
                                                        onClick={() =>
                                                            removeFromBudget(itemKey)
                                                        }
                                                    >
                                                        <BudgetIcon name="block" />
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

                <section
                    className="budget-checkout"
                    aria-label="Resumo do orçamento"
                >
                    <div className="budget-total">
                        <h2>TOTAL</h2>

                        <output>{currencyFormatter.format(totalValue)}</output>

                        {installmentSurcharge > 0 && (
                            <small className="budget-total__surcharge">
                                Inclui{" "}
                                {currencyFormatter.format(installmentSurcharge)}{" "}
                                de acréscimo estimado para crédito parcelado
                            </small>
                        )}

                        <span className="visually-hidden">
                            {budgetItemCount} unidade(s) no orçamento
                        </span>
                    </div>

                    <div className="budget-payment">
                        <ClientSearchField
                            value={clientName}
                            selectedClientId={clientId}
                            onChange={(value) => {
                                setClientName(value);
                                setClientId(null);
                            }}
                            onSelect={selectClient}
                            onCreateClient={openClientRegistration}
                        />

                        <label className="budget-payment__method">
                            <span className="visually-hidden">
                                Condição de pagamento usada para estimar o valor
                            </span>

                            <select
                                value={paymentMethodId}
                                disabled={isLoadingPayment || paymentMethods.length === 0}
                                onChange={(event) =>
                                    setPaymentMethodId(event.target.value)
                                }
                            >
                                {isLoadingPayment && (
                                    <option value="">
                                        Carregando condições de pagamento...
                                    </option>
                                )}

                                {!isLoadingPayment &&
                                    paymentMethods.length === 0 && (
                                        <option value="">
                                            Condição de pagamento indisponível
                                        </option>
                                    )}

                                {paymentMethods.map((method) => (
                                    <option
                                        key={method.id}
                                        value={method.id}
                                    >
                                        {method.name}
                                    </option>
                                ))}
                            </select>
                        </label>

                        {isCreditBudgetCondition && (
                            <label className="budget-payment__installment">
                                <span className="visually-hidden">
                                    Parcelamento previsto para o orçamento
                                </span>

                                <select
                                    value={installmentId}
                                    disabled={installments.length === 0}
                                    onChange={(event) =>
                                        setInstallmentId(event.target.value)
                                    }
                                >
                                    {installments.length === 0 && (
                                        <option value="">
                                            Parcelamento indisponível
                                        </option>
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

                    <div className="budget-checkout__actions">
                        <button
                            className="budget-checkout__button"
                            type="button"
                            disabled={
                                budgetItemCount === 0 ||
                                isSavingBudget ||
                                isCheckingClient
                            }
                            onClick={handleSaveBudget}
                        >
                            {isCheckingClient
                                ? "Verificando cliente..."
                                : isSavingBudget
                                    ? "Salvando orçamento..."
                                    : "Salvar orçamento"}
                        </button>

                        <button
                            className="budget-checkout__button"
                            type="button"
                            disabled={isSavingBudget}
                            onClick={handleClientSearch}
                        >
                            Buscar Clientes
                        </button>
                    </div>
                </section>

                {feedback && (
                    <p
                        className={
                            "budget-feedback budget-feedback--" +
                            feedback.kind
                        }
                        role={feedback.kind === "error" ? "alert" : "status"}
                    >
                        {feedback.message}
                    </p>
                )}
            </div>

            {isBudgetModalOpen && (
                <BudgetModal onClose={() => setIsBudgetModalOpen(false)} />
            )}

            {isClientModalOpen && (
                <BudgetClientModal
                    onClose={() => setIsClientModalOpen(false)}
                    onSelect={selectClient}
                />
            )}

            {finalizationStage && (
                <BudgetFinalizationModal
                    stage={finalizationStage}
                    clientName={completedBudget?.client_name ?? clientName}
                    taxId=""
                    onTaxIdChange={() => undefined}
                    errorMessage={feedback?.kind === "error" ? feedback.message : ""}
                    isSubmitting={isSavingBudget}
                    budget={completedBudget}
                    onAddTaxId={() => setFinalizationStage("tax-id")}
                    onContinueWithoutTaxId={() => setFinalizationStage("submitting")}
                    onSubmitTaxId={() => setFinalizationStage("submitting")}
                    onClose={() => {
                        if (isSavingBudget) return;
                        setFinalizationStage(null);
                        setCompletedBudget(null);
                    }}
                    onDownloadPdf={printBudgetPdf}
                    onDownloadCoupon={drawBudgetCoupon}
                />
            )}

        </main>
    );
}