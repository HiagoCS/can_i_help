import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
    getCashierInstallments,
    getCashierPaymentMethods,
    createCashierSale,
    getCashierClients,
    searchCashierItems,
    createCashierPixCode
} from "@/data/api/cashier";

import CashierSalesModal from "./sales_modal";
import CashierClientModal from "./client_modal";
import CashierFinalizationModal from "./finalization_modal";
import { drawCupon, printSalePdf } from "./sale_documents";
import "./style.scss";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
});

/**
 * Tempo máximo da sessão de pagamento no caixa.
 *
 * Este contador não revoga o QR Code estático no banco.
 * O valor é mantido no frontend e pode ser alterado conforme necessário.
 */
const PIX_QR_EXPIRATION_SECONDS = 15 * 60;

const initialSearches = {
    name: "",
    smCode: "",
    barCode: ""
};

const cashierColumns = [
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
        label: "Venda (unidade)",
        tableLabel: "Venda"
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

function getCashierItemKey(item) {
    return `${item.itemType || "product"}:${item.id}`;
}

function getPaymentType(methodName) {
    const name = normalizeText(methodName);

    if (name.includes("dinheiro")) return "cash";
    if (name.includes("pix")) return "pix";
    if (name.includes("debito")) return "debit";
    if (name.includes("credito")) return "credit";

    return "other";
}

function createTransactionId() {
    const uuid = globalThis.crypto?.randomUUID?.();

    if (uuid) {
        return uuid.replace(/-/g, "").slice(0, 25);
    }

    return (
        Date.now().toString(36) +
        Math.random().toString(36).slice(2, 20)
    ).slice(0, 25);
}

function getPixResponse(response) {
    const data =
        response?.data?.pix ??
        response?.pix ??
        response?.data ??
        response;

    if (data?.available === false) {
        return {
            available: false,
            message:
                data.message ||
                "Não existe uma chave PIX cadastrada nas configurações."
        };
    }

    const brCode = data?.brCode || data?.brcode;
    const qrCodeImage =
        data?.qrCodeImage ||
        data?.qrCode ||
        data?.image ||
        null;

    if (!brCode || !qrCodeImage) {
        throw new Error(
            "O backend não retornou o código PIX e a imagem do QR Code."
        );
    }

    return {
        ...data,
        available: true,
        brCode,
        qrCodeImage
    };
}

function formatTime(seconds) {
    const safeSeconds = Math.max(0, seconds);
    const minutes = Math.floor(safeSeconds / 60);
    const remainingSeconds = safeSeconds % 60;

    return `${String(minutes).padStart(2, "0")}:${String(
        remainingSeconds
    ).padStart(2, "0")}`;
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
                const results = await searchCashierItems(
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
                <div
                    className="cashier-search__results"
                    aria-live="polite"
                    aria-busy={isSearching}
                >
                    {isSearching && (
                        <p className="cashier-search__message">
                            Buscando produtos e serviços...
                        </p>
                    )}

                    {!isSearching && searchError && (
                        <p
                            className="cashier-search__message cashier-search__message--error"
                            role="alert"
                        >
                            {searchError}
                        </p>
                    )}

                    {!isSearching &&
                        !searchError &&
                        visibleSuggestions.length === 0 && (
                            <p className="cashier-search__message">
                                {suggestions.length > 0 && inStockOnly
                                    ? "Nenhum produto com estoque disponível."
                                    : "Nenhum produto ou serviço encontrado."}
                            </p>
                        )}

                    {!isSearching &&
                        !searchError &&
                        visibleSuggestions.length > 0 && (
                            <ul className="cashier-search__list">
                                {visibleSuggestions.map((item) => (
                                    <li key={getCashierItemKey(item)}>
                                        <button
                                            className="cashier-search__result"
                                            type="button"
                                            onClick={() => {
                                                onSelect(item);
                                                onChange("");
                                            }}
                                        >
                                            <span className="cashier-search__result-name">
                                                {item.name}
                                            </span>

                                            <span className="cashier-search__result-meta">
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
            getCashierClients(query, controller.signal)
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
        <div className="cashier-client-search">
            <label className="cashier-client-search__field">
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
                    className="cashier-search__results"
                    aria-live="polite"
                    aria-busy={isSearching}
                >
                    {isSearching && (
                        <p className="cashier-search__message">
                            Buscando clientes...
                        </p>
                    )}

                    {!isSearching && searchError && (
                        <p
                            className="cashier-search__message cashier-search__message--error"
                            role="alert"
                        >
                            {searchError}
                        </p>
                    )}

                    {!isSearching &&
                        !searchError &&
                        suggestions.length === 0 && (
                            <div className="cashier-client-search__empty">
                                <p className="cashier-search__message">
                                    Nenhum cliente encontrado.
                                </p>

                                <button
                                    className="cashier-client-search__create"
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
                                                <span className="cashier-search__result-name">
                                                    {client.name}
                                                </span>

                                                <span className="cashier-search__result-meta">
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

/**
 * Modal de pagamento.
 *
 * Para PIX com QR Code local, a confirmação é manual.
 * Para débito/crédito, a confirmação também é manual.
 * Sem chave PIX, exibe o aviso correspondente e não gera QR Code.
 */
function CashierPaymentModal({
    payment,
    onClose,
    onConfirm,
    isSaving
}) {
    const [copyMessage, setCopyMessage] = useState("");
    const [secondsRemaining, setSecondsRemaining] = useState(
        payment?.expiresAt
            ? Math.max(
                0,
                Math.ceil((payment.expiresAt - Date.now()) / 1000)
            )
            : 0
    );

    const isPix = payment?.type === "pix";
    const isPixQr = payment?.kind === "pix-qr";
    const isPixWithoutKey = payment?.kind === "pix-no-key";
    const isExpired = isPixQr && secondsRemaining <= 0;

    useEffect(() => {
        if (!payment?.expiresAt || !isPixQr) {
            setSecondsRemaining(0);
            return undefined;
        }

        function updateRemaining() {
            setSecondsRemaining(
                Math.max(
                    0,
                    Math.ceil((payment.expiresAt - Date.now()) / 1000)
                )
            );
        }

        updateRemaining();

        const intervalId = window.setInterval(updateRemaining, 1000);

        return () => window.clearInterval(intervalId);
    }, [payment?.expiresAt, isPixQr]);

    if (!payment) return null;

    async function copyPixCode() {
        if (!payment.pix?.brCode) return;

        try {
            await navigator.clipboard.writeText(payment.pix.brCode);
            setCopyMessage("Código PIX copiado.");
        } catch {
            setCopyMessage(
                "Não foi possível copiar automaticamente. Selecione o código e copie manualmente."
            );
        }
    }

    return (
        <div
            className="cashier-payment-modal"
            role="presentation"
            onMouseDown={(event) => {
                if (
                    event.target === event.currentTarget &&
                    !isSaving
                ) {
                    onClose();
                }
            }}
        >
            <section
                className="cashier-payment-modal__dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="cashier-payment-modal-title"
            >
                <div
                    className="cashier-payment-modal__icon"
                    aria-hidden="true"
                >
                    {isPix ? "▦" : "◷"}
                </div>

                <h2 id="cashier-payment-modal-title">
                    Aguardando confirmação do pagamento
                </h2>

                <p>
                    Forma de pagamento:{" "}
                    <strong>{payment.methodName}</strong>
                </p>

                <div className="cashier-payment-modal__amount">
                    <span>Valor total</span>
                    <strong>
                        {currencyFormatter.format(payment.amount)}
                    </strong>
                </div>

                {isPixQr && (
                    <>
                        <p className="cashier-payment-modal__hint">
                            Escaneie o QR Code com o aplicativo do banco ou
                            copie o código PIX.
                        </p>

                        {payment.pix?.qrCodeImage && (
                            <div className="cashier-payment-modal__qr">
                                <img
                                    src={payment.pix.qrCodeImage}
                                    alt="QR Code PIX da venda"
                                />
                            </div>
                        )}

                        <div className="cashier-payment-modal__pix">
                            <label htmlFor="cashier-pix-brcode">
                                PIX copia e cola
                            </label>

                            <textarea
                                id="cashier-pix-brcode"
                                readOnly
                                rows={4}
                                value={payment.pix.brCode}
                                onFocus={(event) =>
                                    event.target.select()
                                }
                            />

                            <button
                                type="button"
                                className="cashier-payment-modal__button cashier-payment-modal__button--secondary"
                                onClick={copyPixCode}
                            >
                                Copiar código PIX
                            </button>

                            {copyMessage && (
                                <p role="status">{copyMessage}</p>
                            )}
                        </div>

                        <div className="cashier-payment-modal__countdown">
                            <span>Tempo restante nesta tela</span>
                            <strong>{formatTime(secondsRemaining)}</strong>
                        </div>

                        <p className="cashier-payment-modal__notice">
                            O QR Code é estático: o prazo acima encerra esta
                            sessão no caixa, mas não revoga o código no banco.
                            Confirme o recebimento no extrato antes de registrar
                            a venda.
                        </p>
                    </>
                )}

                {isPixWithoutKey && (
                    <div
                        className="cashier-payment-modal__warning"
                        role="alert"
                    >
                        <strong>Chave PIX não configurada</strong>
                        <p>
                            Não existe uma chave PIX cadastrada nas
                            configurações. Nenhum QR Code foi gerado.
                            Cadastre a chave ou receba por outro meio e
                            confirme somente após verificar o recebimento.
                        </p>
                    </div>
                )}

                {!isPix && (
                    <p className="cashier-payment-modal__hint">
                        Verifique se a transação foi aprovada na maquininha
                        ou no sistema de pagamento antes de confirmar.
                    </p>
                )}

                {isExpired && (
                    <p
                        className="cashier-payment-modal__error"
                        role="alert"
                    >
                        O tempo desta sessão terminou. Esta tela não aceitará
                        a confirmação. O QR Code estático, entretanto, não foi
                        cancelado no banco.
                    </p>
                )}

                <div className="cashier-payment-modal__actions">
                    <button
                        type="button"
                        className="cashier-payment-modal__button cashier-payment-modal__button--secondary"
                        onClick={onClose}
                        disabled={isSaving}
                    >
                        Voltar ao caixa
                    </button>

                    <button
                        type="button"
                        className="cashier-payment-modal__button cashier-payment-modal__button--primary"
                        onClick={onConfirm}
                        disabled={isSaving || isExpired}
                    >
                        {isSaving
                            ? "Registrando venda..."
                            : "Confirmar recebimento e registrar venda"}
                    </button>
                </div>
            </section>
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
    const [columnVisibility, setColumnVisibility] = useState(
        initialColumnVisibility
    );
    const [isColumnMenuOpen, setIsColumnMenuOpen] = useState(false);

    const columnFilterRef = useRef(null);
    const paymentSubmissionStartedRef = useRef(false);

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
    const [isCreatingPixCode, setIsCreatingPixCode] = useState(false);
    const [isCheckingClient, setIsCheckingClient] = useState(false);
    const [resumeAfterRegistration, setResumeAfterRegistration] =
        useState(false);
    const [finalizationError, setFinalizationError] = useState("");
    const [taxIdDraft, setTaxIdDraft] = useState("");
    const [completedSale, setCompletedSale] = useState(null);
    const [pendingPayment, setPendingPayment] = useState(null);

    const closeSalesModal = useCallback(() => {
        setIsSalesModalOpen(false);
    }, []);

    useEffect(() => {
        let isMounted = true;

        Promise.allSettled([
            getCashierPaymentMethods(),
            getCashierInstallments()
        ]).then(([methodsResult, installmentsResult]) => {
            if (!isMounted) return;

            let nextPaymentError = "";

            if (methodsResult.status === "fulfilled") {
                const methods = Array.isArray(methodsResult.value)
                    ? methodsResult.value
                    : [];

                const activeMethods = methods.filter(isActiveRecord);

                const defaultMethod = activeMethods.find(
                    (method) =>
                        normalizeText(method.name).includes("credito")
                ) ?? activeMethods[0];

                setPaymentMethods(activeMethods);

                if (!location.state?.cashierDraft?.paymentMethodId) {
                    setPaymentMethodId(
                        defaultMethod ? String(defaultMethod.id) : ""
                    );
                }
            } else {
                nextPaymentError = getErrorMessage(
                    methodsResult.reason,
                    "Não foi possível carregar as formas de pagamento."
                );
            }

            if (installmentsResult.status === "fulfilled") {
                const availableInstallments =
                    Array.isArray(installmentsResult.value)
                        ? installmentsResult.value
                        : [];

                setInstallments(availableInstallments);

                const preferredInstallment =
                    location.state?.cashierDraft?.installmentId;

                const preferredInstallmentExists =
                    availableInstallments.some(
                        (installment) =>
                            String(installment.id) ===
                            String(preferredInstallment)
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
            setSelectedProducts(
                Array.isArray(draft.selectedProducts)
                    ? draft.selectedProducts
                    : []
            );

            setSearches(draft.searches ?? initialSearches);
            setInStockOnly(Boolean(draft.inStockOnly));
            setColumnVisibility(
                draft.columnVisibility ?? initialColumnVisibility
            );
            setClientName(draft.clientName ?? "");
            setClientId(draft.clientId ?? null);
            setClientTaxId(draft.clientTaxId ?? "");
            setPaymentMethodId(
                draft.paymentMethodId
                    ? String(draft.paymentMethodId)
                    : ""
            );
            setInstallmentId(
                draft.installmentId
                    ? String(draft.installmentId)
                    : ""
            );
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

        navigate(location.pathname, {
            replace: true,
            state: null
        });
    }, [location.key, location.pathname, navigate]);

    useEffect(() => {
        if (!isColumnMenuOpen) return undefined;

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
            (total, saleItem) =>
                total + saleItem.quantity * saleItem.unitPrice,
            0
        ),
        [selectedProducts]
    );

    const selectedPaymentMethod = paymentMethods.find(
        (method) => String(method.id) === paymentMethodId
    );

    const paymentType = getPaymentType(selectedPaymentMethod?.name);
    const isCreditPayment = paymentType === "credit";

    const selectedInstallment = installments.find(
        (installment) => String(installment.id) === installmentId
    );

    const installmentSurcharge = isCreditPayment
        ? productSubtotal * (Number(selectedInstallment?.percentage) || 0)
        : 0;

    const totalValue = Math.round(
        (productSubtotal + installmentSurcharge + Number.EPSILON) * 100
    ) / 100;

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

    function addProductToSale(item) {
        if (!item || item.id === undefined || item.id === null) {
            setFeedback({
                kind: "error",
                message: "Não foi possível adicionar esse item à venda."
            });
            return;
        }

        const itemKey = getCashierItemKey(item);

        setSelectedProducts((currentItems) => {
            const existingItem = currentItems.find(
                (saleItem) =>
                    getCashierItemKey(saleItem.product) === itemKey
            );

            if (existingItem) {
                return currentItems.map((saleItem) =>
                    getCashierItemKey(saleItem.product) === itemKey
                        ? {
                            ...saleItem,
                            quantity: saleItem.quantity + 1
                        }
                        : saleItem
                );
            }

            return [
                ...currentItems,
                {
                    product: item,
                    quantity: 1,
                    unitPrice: parseNumber(item.value)
                }
            ];
        });

        setFeedback(null);
    }

    function changeSaleQuantity(itemKey, change) {
        setSelectedProducts((currentItems) => {
            const saleItem = currentItems.find(
                (item) =>
                    getCashierItemKey(item.product) === itemKey
            );

            if (!saleItem) return currentItems;

            const nextQuantity = saleItem.quantity + change;

            if (nextQuantity <= 0) {
                return currentItems.filter(
                    (item) =>
                        getCashierItemKey(item.product) !== itemKey
                );
            }

            return currentItems.map((item) =>
                getCashierItemKey(item.product) === itemKey
                    ? { ...item, quantity: nextQuantity }
                    : item
            );
        });

        setFeedback(null);
    }

    function removeFromSale(itemKey) {
        setSelectedProducts((currentItems) =>
            currentItems.filter(
                (saleItem) =>
                    getCashierItemKey(saleItem.product) !== itemKey
            )
        );

        setFeedback({
            kind: "notice",
            message: "Item removido desta venda."
        });
    }

    function beginPriceEdit(saleItem) {
        setEditingPriceId(getCashierItemKey(saleItem.product));
        setPriceDraft(String(saleItem.unitPrice.toFixed(2)));
        setFeedback(null);
    }

    function savePriceEdit() {
        const parsedPrice = Number(priceDraft.replace(",", "."));

        if (editingPriceId === null) return;

        if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
            setFeedback({
                kind: "error",
                message: "Informe um preço válido para o item."
            });
            return;
        }

        setSelectedProducts((currentItems) =>
            currentItems.map((saleItem) =>
                getCashierItemKey(saleItem.product) === editingPriceId
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

    function openClientRegistration(
        query = clientName,
        resumeFinalization = false
    ) {
        const searchValue = String(query ?? "").trim();
        const digits = searchValue.replace(/\D/g, "");

        const isTaxIdSearch =
            [11, 14].includes(digits.length) &&
            /^[\d\s./()-]+$/.test(searchValue);

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

    /**
     * Salva a venda depois que o fluxo de pagamento permite continuar.
     */
    async function submitSale(
        taxIdOverride = null,
        clientOverride = null
    ) {
        if (
            isFinalizing ||
            paymentSubmissionStartedRef.current ||
            selectedProducts.length === 0 ||
            !paymentMethodId
        ) {
            return;
        }

        paymentSubmissionStartedRef.current = true;
        setIsFinalizing(true);
        setFinalizationError("");

        try {
            const saleClientName =
                clientOverride?.name ?? clientName;

            const saleClientId =
                clientOverride?.id ?? clientId;

            const sale = await createCashierSale({
                clientName:
                    String(saleClientName ?? "").trim() || null,
                clientId: saleClientId,
                clientTaxId: taxIdOverride || clientTaxId || null,
                paymentMethodId: Number(paymentMethodId),
                installmentId:
                    isCreditPayment && installmentId
                        ? Number(installmentId)
                        : null,

                items: selectedProducts.map((saleItem) => {
                    const item = saleItem.product;
                    const isService = item.itemType === "service";

                    return {
                        ...(isService
                            ? { serviceId: item.id }
                            : { productId: item.id }),
                        quantity: saleItem.quantity,
                        unitPrice: saleItem.unitPrice
                    };
                })
            });

            setCompletedSale(sale);
            setPendingPayment(null);
            setFinalizationStage("success");

            setSelectedProducts([]);
            setClientName("");
            setClientId(null);
            setClientTaxId("");
            setTaxIdDraft("");
            setFeedback(null);
        } catch (error) {
            paymentSubmissionStartedRef.current = false;

            const message = getErrorMessage(
                error,
                "Não foi possível registrar a venda."
            );

            setFinalizationError(message);
            setFeedback({
                kind: "error",
                message
            });
        } finally {
            setIsFinalizing(false);
        }
    }

    /**
     * Abre o fluxo adequado conforme a forma de pagamento.
     */
    async function proceedWithPayment(
        taxIdOverride = null,
        clientOverride = null
    ) {
        if (
            isFinalizing ||
            isCreatingPixCode ||
            selectedProducts.length === 0 ||
            !paymentMethodId
        ) {
            return;
        }

        const paymentDetails = {
            type: paymentType,
            methodName: selectedPaymentMethod?.name || "Não informado",
            amount: totalValue,
            taxIdOverride: taxIdOverride || clientTaxId || null,
            clientOverride
        };

        // Dinheiro: segue diretamente para o registro da venda.
        if (paymentType === "cash") {
            setPendingPayment(null);
            setFinalizationStage("submitting");

            void submitSale(
                paymentDetails.taxIdOverride,
                clientOverride
            );

            return;
        }

        // Cartão ou outra forma não-PIX: aguarda a confirmação manual.
        if (paymentType !== "pix") {
            setPendingPayment({
                ...paymentDetails,
                kind: "manual"
            });

            setFinalizationStage("awaiting-payment");
            return;
        }

        // PIX: o código e a imagem são gerados pelo backend com GPIX.
        setIsCreatingPixCode(true);
        setFeedback(null);

        try {
            const response = await createCashierPixCode({
                amountInCents: Math.round(totalValue * 100),
                expiresInSeconds: PIX_QR_EXPIRATION_SECONDS,
                transactionId: createTransactionId()
            });

            const pix = getPixResponse(response);

            if (!pix.available) {
                setPendingPayment({
                    ...paymentDetails,
                    kind: "pix-no-key",
                    pix: null
                });

                setFinalizationStage("awaiting-payment");
                return;
            }

            setPendingPayment({
                ...paymentDetails,
                kind: "pix-qr",
                pix,
                expiresAt:
                    Date.now() + PIX_QR_EXPIRATION_SECONDS * 1000
            });

            setFinalizationStage("awaiting-payment");
        } catch (error) {
            setFeedback({
                kind: "error",
                message: getErrorMessage(
                    error,
                    "Não foi possível gerar o QR Code PIX."
                )
            });
        } finally {
            setIsCreatingPixCode(false);
        }
    }

    function confirmManualPayment() {
        if (!pendingPayment || isFinalizing) return;

        const payment = pendingPayment;

        setFinalizationStage("submitting");

        void submitSale(
            payment.taxIdOverride,
            payment.clientOverride
        );
    }

    function closePendingPayment() {
        if (isFinalizing || isCreatingPixCode) return;

        setPendingPayment(null);
        setFinalizationStage(null);
        setFinalizationError("");
    }

    async function handleFinalizeSale() {
        if (
            saleItemCount === 0 ||
            !paymentMethodId ||
            isFinalizing ||
            isCreatingPixCode ||
            isCheckingClient ||
            finalizationStage !== null
        ) {
            return;
        }

        setFeedback(null);
        setFinalizationError("");
        setTaxIdDraft("");
        paymentSubmissionStartedRef.current = false;

        if (clientName.trim() && clientId === null) {
            setIsCheckingClient(true);

            try {
                const matches = await getCashierClients(
                    clientName.trim()
                );

                const query = normalizeText(clientName);
                const queryDigits = clientName.replace(/\D/g, "");

                const exactMatches = matches.filter((client) => {
                    const exactName =
                        normalizeText(client.name) === query;

                    const exactTaxId = [client.cpf, client.cnpj]
                        .filter(Boolean)
                        .some(
                            (taxId) =>
                                String(taxId).replace(/\D/g, "") ===
                                    queryDigits &&
                                [11, 14].includes(queryDigits.length)
                        );

                    return exactName || exactTaxId;
                });

                if (exactMatches.length === 1) {
                    const client = exactMatches[0];
                    const taxId = client.cpf || client.cnpj || "";

                    setClientId(client.id);
                    setClientName(client.name);
                    setClientTaxId(taxId);

                    if (taxId) {
                        await proceedWithPayment(taxId, client);
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
                    message:
                        "Selecione um dos clientes encontrados na lista antes de finalizar."
                });

                return;
            } catch (error) {
                setFeedback({
                    kind: "error",
                    message: getErrorMessage(
                        error,
                        "Não foi possível confirmar o cliente."
                    )
                });

                return;
            } finally {
                setIsCheckingClient(false);
            }
        }

        if (clientName.trim() && !clientTaxId.trim()) {
            setFinalizationStage("ask-tax-id");
            return;
        }

        await proceedWithPayment(clientTaxId || null);
    }

    useEffect(() => {
        if (!resumeAfterRegistration || isLoadingPayment) return;

        setResumeAfterRegistration(false);
        setFinalizationError("");
        setTaxIdDraft("");
        paymentSubmissionStartedRef.current = false;

        if (clientName.trim() && !clientTaxId.trim()) {
            setFinalizationStage("ask-tax-id");
            return;
        }

        void proceedWithPayment(clientTaxId || null);
    }, [resumeAfterRegistration, isLoadingPayment]);

    function handleTaxIdSubmit() {
        const normalizedTaxId = taxIdDraft.replace(/\D/g, "");

        if (
            normalizedTaxId.length !== 11 &&
            normalizedTaxId.length !== 14
        ) {
            setFinalizationError(
                "Informe um CPF com 11 dígitos ou CNPJ com 14 dígitos."
            );
            return;
        }

        setFinalizationError("");
        void proceedWithPayment(normalizedTaxId);
    }

    function closeFinalizationModal() {
        if (isFinalizing) return;

        setFinalizationStage(null);
        setFinalizationError("");
        setCompletedSale(null);
        setPendingPayment(null);
    }

    return (
        <main className="cashier-page">
            <header className="cashier-header">
                <h1
                    className="cashier-header__brand"
                    onClick={() => {
                        window.location.href = "/";
                    }}
                >
                    POSSO AJUDAR?
                </h1>

                <span
                    className="cashier-header__page-title"
                    style={{ paddingRight: "50px" }}
                >
                    Caixa
                </span>
            </header>

            <div className="cashier-content">
                <section
                    className="cashier-toolbar"
                    aria-label="Busca de produtos e serviços"
                >
                    <div
                        className="cashier-column-filter"
                        ref={columnFilterRef}
                    >
                        <button
                            className={
                                "cashier-toolbar__icon-button " +
                                (isColumnMenuOpen ? "is-active" : "")
                            }
                            type="button"
                            aria-label="Configurar colunas da tabela"
                            aria-expanded={isColumnMenuOpen}
                            aria-controls="cashier-column-filter-menu"
                            title="Configurar colunas da tabela"
                            onClick={() =>
                                setIsColumnMenuOpen((value) => !value)
                            }
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
                                        const isVisible =
                                            columnVisibility[column.key];

                                        return (
                                            <button
                                                className="cashier-column-filter__toggle"
                                                type="button"
                                                key={column.key}
                                                aria-pressed={isVisible}
                                                onClick={() =>
                                                    toggleColumn(column.key)
                                                }
                                            >
                                                <span>{column.label}</span>

                                                <span
                                                    className="cashier-column-filter__switch"
                                                    aria-hidden="true"
                                                >
                                                    <span />
                                                </span>

                                                <span className="cashier-column-filter__state">
                                                    {isVisible
                                                        ? "Exibido"
                                                        : "Oculto"}
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
                                    onClick={() =>
                                        setInStockOnly((value) => !value)
                                    }
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
                        label="Buscar produto ou serviço pelo nome"
                        placeholder="Produto ou serviço"
                        value={searches.name}
                        inStockOnly={inStockOnly}
                        onChange={(value) => updateSearch("name", value)}
                        onSelect={addProductToSale}
                    />

                    <ProductSearchField
                        field="smCode"
                        label="Buscar produto ou serviço pelo código reduzido"
                        placeholder="Código Reduzido"
                        value={searches.smCode}
                        inStockOnly={inStockOnly}
                        onChange={(value) => updateSearch("smCode", value)}
                        onSelect={addProductToSale}
                    />

                    <ProductSearchField
                        field="barCode"
                        label="Buscar produto ou serviço pelo código de barras"
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
                    <p
                        className="cashier-load-error cashier-load-error--payment"
                        role="alert"
                    >
                        {paymentError}
                    </p>
                )}

                <section
                    className="cashier-products-panel"
                    aria-label="Produtos e serviços selecionados para venda"
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
                                        <td
                                            className="cashier-table__message"
                                            colSpan={tableColumnCount}
                                        >
                                            Pesquise um produto ou serviço e selecione um resultado para adicioná-lo à venda.
                                        </td>
                                    </tr>
                                )}

                                {selectedProducts.map((saleItem, index) => {
                                    const {
                                        product,
                                        quantity,
                                        unitPrice
                                    } = saleItem;

                                    const itemKey = getCashierItemKey(product);
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
                                                            ? "cashier-table__description"
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
                                                        <output className="cashier-table__quantity">
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
                                                            <div className="cashier-price-editor">
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
                                                <div className="cashier-row-actions">
                                                    <button
                                                        className="cashier-row-actions__button cashier-row-actions__button--add"
                                                        type="button"
                                                        aria-label={
                                                            "Adicionar " +
                                                            product.name +
                                                            " à venda"
                                                        }
                                                        title="Adicionar uma unidade"
                                                        onClick={() =>
                                                            changeSaleQuantity(
                                                                itemKey,
                                                                1
                                                            )
                                                        }
                                                    >
                                                        <CashierIcon name="plus" />
                                                    </button>

                                                    <button
                                                        className="cashier-row-actions__button cashier-row-actions__button--remove"
                                                        type="button"
                                                        aria-label={
                                                            "Remover uma unidade de " +
                                                            product.name
                                                        }
                                                        title="Remover uma unidade"
                                                        onClick={() =>
                                                            changeSaleQuantity(
                                                                itemKey,
                                                                -1
                                                            )
                                                        }
                                                    >
                                                        <CashierIcon name="minus" />
                                                    </button>

                                                    {columnVisibility.unitPrice && (
                                                        <button
                                                            className="cashier-row-actions__button cashier-row-actions__button--price"
                                                            type="button"
                                                            aria-label={
                                                                "Alterar preço de " +
                                                                product.name +
                                                                " nesta venda"
                                                            }
                                                            title="Alterar preço nesta venda"
                                                            onClick={() =>
                                                                beginPriceEdit(saleItem)
                                                            }
                                                        >
                                                            R$
                                                        </button>
                                                    )}

                                                    <button
                                                        className="cashier-row-actions__button cashier-row-actions__button--block"
                                                        type="button"
                                                        aria-label={
                                                            "Remover " +
                                                            product.name +
                                                            " desta venda"
                                                        }
                                                        title="Remover da venda"
                                                        onClick={() =>
                                                            removeFromSale(itemKey)
                                                        }
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

                <section
                    className="cashier-checkout"
                    aria-label="Resumo da venda"
                >
                    <div className="cashier-total">
                        <h2>TOTAL</h2>

                        <output>{currencyFormatter.format(totalValue)}</output>

                        {installmentSurcharge > 0 && (
                            <small className="cashier-total__surcharge">
                                Inclui{" "}
                                {currencyFormatter.format(installmentSurcharge)}{" "}
                                de parcelamento
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
                            <span className="visually-hidden">
                                Forma de pagamento
                            </span>

                            <select
                                value={paymentMethodId}
                                disabled={
                                    isLoadingPayment ||
                                    paymentMethods.length === 0 ||
                                    finalizationStage !== null
                                }
                                onChange={(event) =>
                                    setPaymentMethodId(event.target.value)
                                }
                            >
                                {isLoadingPayment && (
                                    <option value="">
                                        Carregando formas de pagamento...
                                    </option>
                                )}

                                {!isLoadingPayment &&
                                    paymentMethods.length === 0 && (
                                        <option value="">
                                            Forma de pagamento indisponível
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

                        {isCreditPayment && (
                            <label className="cashier-payment__installment">
                                <span className="visually-hidden">
                                    Parcelas
                                </span>

                                <select
                                    value={installmentId}
                                    disabled={
                                        installments.length === 0 ||
                                        finalizationStage !== null
                                    }
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

                    <div className="cashier-checkout__actions">
                        <button
                            className="cashier-checkout__button"
                            type="button"
                            disabled={
                                saleItemCount === 0 ||
                                !paymentMethodId ||
                                isFinalizing ||
                                isCreatingPixCode ||
                                isCheckingClient ||
                                finalizationStage !== null
                            }
                            onClick={handleFinalizeSale}
                        >
                            {isCheckingClient
                                ? "Verificando cliente..."
                                : isCreatingPixCode
                                    ? "Gerando QR Code..."
                                    : isFinalizing
                                        ? "Finalizando..."
                                        : "Finalizar"}
                        </button>

                        <button
                            className="cashier-checkout__button"
                            type="button"
                            disabled={finalizationStage !== null}
                            onClick={handleClientSearch}
                        >
                            Buscar Clientes
                        </button>
                    </div>
                </section>

                {feedback && (
                    <p
                        className={
                            "cashier-feedback cashier-feedback--" +
                            feedback.kind
                        }
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

            {finalizationStage === "awaiting-payment" && pendingPayment && (
                <CashierPaymentModal
                    payment={pendingPayment}
                    onClose={closePendingPayment}
                    onConfirm={confirmManualPayment}
                    isSaving={isFinalizing}
                />
            )}

            {finalizationStage &&
                finalizationStage !== "awaiting-payment" && (
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
                        onContinueWithoutTaxId={() =>
                            void proceedWithPayment(null)
                        }
                        onSubmitTaxId={handleTaxIdSubmit}
                        onClose={closeFinalizationModal}
                        onDownloadPdf={printSalePdf}
                        onDownloadXml={drawCupon}
                    />
                )}

            <style>{`
                .cashier-payment-modal {
                    position: fixed;
                    inset: 0;
                    z-index: 10000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 20px;
                    background: rgba(0, 0, 0, 0.68);
                    overflow-y: auto;
                }

                .cashier-payment-modal__dialog {
                    width: min(100%, 500px);
                    max-height: calc(100vh - 40px);
                    overflow-y: auto;
                    padding: 28px;
                    border-radius: 14px;
                    background: #fff;
                    color: #222;
                    box-shadow: 0 18px 60px rgba(0, 0, 0, 0.28);
                    font-family: inherit;
                }

                .cashier-payment-modal__icon {
                    display: grid;
                    place-items: center;
                    width: 48px;
                    height: 48px;
                    margin-bottom: 18px;
                    border-radius: 50%;
                    background: #f0f0f0;
                    font-size: 25px;
                }

                .cashier-payment-modal__dialog h2 {
                    margin: 0 0 12px;
                    font-size: 1.35rem;
                    line-height: 1.35;
                }

                .cashier-payment-modal__dialog p {
                    line-height: 1.55;
                    overflow-wrap: anywhere;
                }

                .cashier-payment-modal__amount {
                    display: flex;
                    flex-direction: column;
                    gap: 5px;
                    margin: 20px 0;
                    padding: 16px;
                    border-radius: 10px;
                    background: #f5f5f5;
                }

                .cashier-payment-modal__amount span,
                .cashier-payment-modal__countdown span {
                    color: #666;
                    font-size: 0.9rem;
                }

                .cashier-payment-modal__amount strong {
                    font-size: 1.8rem;
                    overflow-wrap: anywhere;
                }

                .cashier-payment-modal__qr {
                    display: grid;
                    place-items: center;
                    margin: 16px auto;
                    padding: 12px;
                    border: 1px solid #eee;
                    border-radius: 12px;
                    background: #fff;
                }

                .cashier-payment-modal__qr img {
                    display: block;
                    width: min(100%, 260px);
                    height: auto;
                    aspect-ratio: 1;
                    object-fit: contain;
                }

                .cashier-payment-modal__pix {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    margin-bottom: 18px;
                }

                .cashier-payment-modal__pix label {
                    font-size: 0.9rem;
                    font-weight: 600;
                }

                .cashier-payment-modal__pix textarea {
                    width: 100%;
                    min-width: 0;
                    box-sizing: border-box;
                    padding: 12px;
                    border: 1px solid #ccc;
                    border-radius: 8px;
                    background: #fff;
                    color: #222;
                    font: inherit;
                    resize: vertical;
                    overflow-wrap: anywhere;
                }

                .cashier-payment-modal__hint {
                    margin: 4px 0 18px;
                    color: #666;
                    font-size: 0.9rem;
                }

                .cashier-payment-modal__warning {
                    margin: 16px 0;
                    padding: 14px;
                    border: 1px solid #e6c779;
                    border-radius: 8px;
                    background: #fff8e5;
                    color: #664d03;
                    font-size: 0.9rem;
                }

                .cashier-payment-modal__warning p {
                    margin-bottom: 0;
                }

                .cashier-payment-modal__notice {
                    color: #666;
                    font-size: 0.85rem;
                }

                .cashier-payment-modal__countdown {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 12px;
                    margin: 16px 0;
                    padding: 12px;
                    border-radius: 8px;
                    background: #f5f5f5;
                }

                .cashier-payment-modal__countdown strong {
                    font-size: 1.25rem;
                    font-variant-numeric: tabular-nums;
                }

                .cashier-payment-modal__error {
                    color: #b42318;
                    font-size: 0.9rem;
                }

                .cashier-payment-modal__actions {
                    display: flex;
                    flex-wrap: wrap;
                    justify-content: flex-end;
                    gap: 10px;
                    margin-top: 24px;
                }

                .cashier-payment-modal__button {
                    min-height: 44px;
                    padding: 11px 15px;
                    border: 1px solid transparent;
                    border-radius: 8px;
                    font: inherit;
                    font-weight: 600;
                    cursor: pointer;
                }

                .cashier-payment-modal__button:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }

                .cashier-payment-modal__button--secondary {
                    border-color: #ccc;
                    background: #fff;
                    color: #222;
                }

                .cashier-payment-modal__button--primary {
                    background: #222;
                    color: #fff;
                }

                @media (max-width: 520px) {
                    .cashier-payment-modal {
                        align-items: flex-start;
                        padding: 12px;
                    }

                    .cashier-payment-modal__dialog {
                        max-height: calc(100vh - 24px);
                        padding: 20px;
                    }

                    .cashier-payment-modal__actions {
                        flex-direction: column-reverse;
                    }

                    .cashier-payment-modal__button {
                        width: 100%;
                    }

                    .cashier-payment-modal__amount strong {
                        font-size: 1.5rem;
                    }
                }
            `}</style>
        </main>
    );
}