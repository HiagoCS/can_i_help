import { useEffect, useState } from "react";

import {
    getCashierSales,
    deleteCashierSale,
    openCashierSalePdf,
    openCashierFiscalCoupon,
    openCashierDanfe
} from "@/data/api/cashier";

import "./style.scss";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
});

function formatSaleDate(value) {
    const date = new Date(String(value ?? "").replace(" ", "T"));

    if (Number.isNaN(date.getTime())) {
        return value || "Data indisponível";
    }

    return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    }).format(date);
}

function getErrorMessage(error) {
    return error instanceof Error
        ? error.message
        : "Não foi possível concluir a operação.";
}

function isDanfeAvailable(sale) {
    return (
        sale.danfe_available === true &&
        sale.fiscal_invoice_status === "authorized"
    );
}

export default function CashierSalesModal({ onClose }) {
    const [sales, setSales] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState("");
    const [actionError, setActionError] = useState("");
    const [actionMessage, setActionMessage] = useState("");
    const [busyAction, setBusyAction] = useState("");
    const [pendingDeleteSale, setPendingDeleteSale] = useState(null);
    const [deleteError, setDeleteError] = useState("");

    /*
     * Carrega as vendas ao abrir o modal.
     */
    useEffect(() => {
        let isMounted = true;
        const controller = new AbortController();

        getCashierSales(controller.signal)
            .then((result) => {
                if (isMounted) {
                    setSales(result);
                }
            })
            .catch((error) => {
                if (isMounted && !controller.signal.aborted) {
                    setErrorMessage(getErrorMessage(error));
                }
            })
            .finally(() => {
                if (isMounted) {
                    setIsLoading(false);
                }
            });

        return () => {
            isMounted = false;
            controller.abort();
        };
    }, []);

    /*
     * ESC fecha primeiro a confirmação de exclusão.
     * A operação não pode ser interrompida visualmente enquanto
     * o backend estiver processando uma exclusão.
     */
    useEffect(() => {
        function handleKeyDown(event) {
            if (event.key !== "Escape") {
                return;
            }

            if (busyAction) {
                return;
            }

            if (pendingDeleteSale) {
                setPendingDeleteSale(null);
                setDeleteError("");
                return;
            }

            onClose();
        }

        window.addEventListener("keydown", handleKeyDown);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [busyAction, pendingDeleteSale, onClose]);

    function closeOnBackdrop(event) {
        if (event.target === event.currentTarget && !busyAction) {
            onClose();
        }
    }

    function openDeleteConfirmation(sale) {
        setActionError("");
        setActionMessage("");
        setDeleteError("");
        setPendingDeleteSale(sale);
    }

    function closeDeleteConfirmation() {
        if (busyAction) {
            return;
        }

        setPendingDeleteSale(null);
        setDeleteError("");
    }

    /*
     * Executa a exclusão somente após a confirmação.
     *
     * O backend é responsável por validar vínculos fiscais,
     * restaurar o estoque e excluir os registros em transação.
     */
    async function handleDeleteSale() {
        if (!pendingDeleteSale || busyAction) {
            return;
        }

        const sale = pendingDeleteSale;
        const actionKey = `delete-${sale.id}`;

        setActionError("");
        setActionMessage("");
        setDeleteError("");
        setBusyAction(actionKey);

        try {
            await deleteCashierSale(sale.id);

            // A lista é atualizada apenas após a confirmação do backend.
            setSales((currentSales) =>
                currentSales.filter(
                    (currentSale) => currentSale.id !== sale.id
                )
            );

            setPendingDeleteSale(null);
            setDeleteError("");

            setActionMessage(
                `Venda #${sale.id} excluída com sucesso.`
            );
        } catch (error) {
            const message = getErrorMessage(error);

            // Mantém a confirmação aberta para exibir o motivo
            // pelo qual a exclusão não pôde ser concluída.
            setDeleteError(message);
        } finally {
            setBusyAction("");
        }
    }

    async function handleDocumentAction(sale, documentType) {
        const actionKey = `${sale.id}-${documentType}`;

        setActionError("");
        setActionMessage("");
        setBusyAction(actionKey);

        try {
            if (documentType === "pdf") {
                await openCashierSalePdf(sale.id);
            } else if (documentType === "coupon") {
                await openCashierFiscalCoupon(sale.id);
            } else if (documentType === "danfe") {
                if (!isDanfeAvailable(sale)) {
                    throw new Error(
                        "A DANFE só pode ser aberta quando a NF-e estiver autorizada."
                    );
                }

                await openCashierDanfe(sale.id);
            }
        } catch (error) {
            setActionError(getErrorMessage(error));
        } finally {
            setBusyAction("");
        }
    }

    const isDeleting =
        Boolean(pendingDeleteSale) &&
        busyAction === `delete-${pendingDeleteSale?.id}`;

    return (
        <div
            className="cashier-sales-modal__backdrop"
            onMouseDown={closeOnBackdrop}
        >
            <section
                className="cashier-sales-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="cashier-sales-title"
                aria-busy={isLoading || Boolean(busyAction)}
            >
                <header className="cashier-sales-modal__header">
                    <h2 id="cashier-sales-title">Notas Fiscais</h2>

                    <button
                        className="cashier-sales-modal__close"
                        autoFocus
                        type="button"
                        aria-label="Fechar notas fiscais"
                        disabled={Boolean(busyAction)}
                        onClick={onClose}
                    >
                        ×
                    </button>
                </header>

                <div className="cashier-sales-modal__body">
                    {isLoading && (
                        <p className="cashier-sales-modal__message">
                            Carregando vendas...
                        </p>
                    )}

                    {!isLoading && errorMessage && (
                        <p
                            className="cashier-sales-modal__message cashier-sales-modal__message--error"
                            role="alert"
                        >
                            {errorMessage}
                        </p>
                    )}

                    {actionError && (
                        <p
                            className="cashier-sales-modal__message cashier-sales-modal__message--error"
                            role="alert"
                        >
                            {actionError}
                        </p>
                    )}

                    {actionMessage && (
                        <p
                            className="cashier-sales-modal__message"
                            role="status"
                        >
                            {actionMessage}
                        </p>
                    )}

                    {!isLoading && !errorMessage && sales.length === 0 && (
                        <p className="cashier-sales-modal__message">
                            Nenhuma venda foi registrada.
                        </p>
                    )}

                    {!isLoading &&
                        !errorMessage &&
                        sales.map((sale) => {
                            const danfeAvailable = isDanfeAvailable(sale);

                            return (
                                <article
                                    className="cashier-sales-modal__row"
                                    key={sale.id}
                                >
                                    <div className="cashier-sales-modal__identity">
                                        <strong>#{sale.id}</strong>

                                        <time dateTime={sale.dt_sale}>
                                            {formatSaleDate(sale.dt_sale)}
                                        </time>
                                    </div>

                                    <span className="cashier-sales-modal__client">
                                        {sale.client_name || "Consumidor final"}
                                    </span>

                                    <strong className="cashier-sales-modal__total">
                                        {currencyFormatter.format(
                                            Number(sale.total_value) || 0
                                        )}
                                    </strong>

                                    <div className="cashier-sales-modal__actions">
                                        <button
                                            className="cashier-sales-modal__action cashier-sales-modal__action--pdf"
                                            type="button"
                                            disabled={Boolean(busyAction)}
                                            onClick={() =>
                                                handleDocumentAction(
                                                    sale,
                                                    "pdf"
                                                )
                                            }
                                            title="Abrir o PDF da venda no padrão do sistema."
                                        >
                                            {busyAction === `${sale.id}-pdf`
                                                ? "Gerando..."
                                                : "PDF"}
                                        </button>

                                        <button
                                            className="cashier-sales-modal__action cashier-sales-modal__action--xml"
                                            type="button"
                                            disabled={Boolean(busyAction)}
                                            onClick={() =>
                                                handleDocumentAction(
                                                    sale,
                                                    "coupon"
                                                )
                                            }
                                            title="Abrir o cupom para impressão."
                                        >
                                            {busyAction === `${sale.id}-coupon`
                                                ? "Gerando..."
                                                : "Cupom Fiscal"}
                                        </button>

                                        <button
                                            className="cashier-sales-modal__action cashier-sales-modal__action--xml"
                                            type="button"
                                            disabled={
                                                !danfeAvailable ||
                                                Boolean(busyAction)
                                            }
                                            onClick={() =>
                                                handleDocumentAction(
                                                    sale,
                                                    "danfe"
                                                )
                                            }
                                            title={
                                                danfeAvailable
                                                    ? "Abrir a DANFE da NF-e autorizada."
                                                    : "Disponível somente quando a NF-e estiver autorizada e a DANFE disponível."
                                            }
                                        >
                                            {busyAction === `${sale.id}-danfe`
                                                ? "Carregando..."
                                                : "DANFE"}
                                        </button>

                                        <button
                                            className="cashier-sales-modal__action cashier-sales-modal__action--delete"
                                            type="button"
                                            disabled={Boolean(busyAction)}
                                            onClick={() =>
                                                openDeleteConfirmation(sale)
                                            }
                                            title="Excluir esta venda."
                                        >
                                            Excluir
                                        </button>
                                    </div>
                                </article>
                            );
                        })}
                </div>
            </section>

            {pendingDeleteSale && (
                <div
                    className="cashier-sales-modal__confirm-backdrop"
                    onMouseDown={(event) => {
                        if (
                            event.target === event.currentTarget &&
                            !busyAction
                        ) {
                            closeDeleteConfirmation();
                        }
                    }}
                    style={{
                        position: "fixed",
                        inset: 0,
                        zIndex: 10000,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "20px",
                        background: "rgba(0, 0, 0, 0.65)"
                    }}
                >
                    <section
                        className="cashier-sales-modal__confirm"
                        role="alertdialog"
                        aria-modal="true"
                        aria-labelledby="cashier-delete-title"
                        aria-describedby="cashier-delete-description"
                        aria-busy={isDeleting}
                        onMouseDown={(event) => event.stopPropagation()}
                        style={{
                            width: "100%",
                            maxWidth: "440px",
                            padding: "24px",
                            borderRadius: "12px",
                            background: "var(--modal-background, #fff)",
                            color: "var(--text-color, #222)",
                            boxShadow: "0 12px 40px rgba(0, 0, 0, 0.3)"
                        }}
                    >
                        <header>
                            <h2
                                id="cashier-delete-title"
                                style={{
                                    margin: "0 0 16px",
                                    fontSize: "1.25rem"
                                }}
                            >
                                Confirmar exclusão da venda
                            </h2>
                        </header>

                        <div>
                            <p id="cashier-delete-description">
                                Tem certeza de que deseja excluir a venda{" "}
                                <strong>#{pendingDeleteSale.id}</strong>, no
                                valor de{" "}
                                <strong>
                                    {currencyFormatter.format(
                                        Number(pendingDeleteSale.total_value) ||
                                            0
                                    )}
                                </strong>
                                ?
                            </p>

                            <p>
                                Esta operação remove a venda e seus itens
                                vinculados. Os estoques correspondentes serão
                                restaurados pelo backend quando houver
                                movimentações identificáveis.
                            </p>

                            <p>
                                Caso exista uma NF-e vinculada, a exclusão
                                poderá ser bloqueada para preservar o histórico
                                fiscal.
                            </p>

                            {deleteError && (
                                <p
                                    role="alert"
                                    style={{
                                        marginTop: "16px",
                                        padding: "12px",
                                        borderRadius: "6px",
                                        background: "#fde8e7",
                                        color: "#9c2420",
                                        overflowWrap: "anywhere"
                                    }}
                                >
                                    {deleteError}
                                </p>
                            )}
                        </div>

                        <footer
                            style={{
                                display: "flex",
                                justifyContent: "flex-end",
                                flexWrap: "wrap",
                                gap: "10px",
                                marginTop: "24px"
                            }}
                        >
                            <button
                                className="cashier-sales-modal__action"
                                type="button"
                                disabled={Boolean(busyAction)}
                                onClick={closeDeleteConfirmation}
                                autoFocus
                            >
                                Cancelar
                            </button>

                            <button
                                className="cashier-sales-modal__action cashier-sales-modal__action--delete"
                                type="button"
                                disabled={Boolean(busyAction)}
                                onClick={handleDeleteSale}
                            >
                                {isDeleting
                                    ? "Excluindo..."
                                    : "Confirmar exclusão"}
                            </button>
                        </footer>
                    </section>
                </div>
            )}
        </div>
    );
}
