import { useEffect, useState } from "react";

import { getCurrentUser } from "@/data/api/auth";
import {
    getBudgets,
    getBudgetById,
    deleteBudget
} from "@/data/api/budget";
import { printBudgetPdf, drawBudgetCoupon } from "../budget_documents";

import "./style.scss";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
});

function formatBudgetDate(value) {
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

function hasDeletePermission(user) {
    if (!Array.isArray(user?.roles)) return false;
    return user.roles.some((role) => Number(role.level) >= 3);
}

export default function BudgetModal({ onClose }) {
    const [budgets, setBudgets] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState("");
    const [actionError, setActionError] = useState("");
    const [actionMessage, setActionMessage] = useState("");
    const [busyAction, setBusyAction] = useState("");
    const [pendingDeleteBudget, setPendingDeleteBudget] = useState(null);
    const [deleteError, setDeleteError] = useState("");
    const [canDeleteBudgets, setCanDeleteBudgets] = useState(false);
    const [isCheckingPermission, setIsCheckingPermission] = useState(true);

    useEffect(() => {
        let isMounted = true;
        const controller = new AbortController();

        getBudgets(controller.signal)
            .then((result) => {
                if (isMounted) setBudgets(Array.isArray(result) ? result : []);
            })
            .catch((error) => {
                if (isMounted && !controller.signal.aborted) {
                    setErrorMessage(getErrorMessage(error));
                }
            })
            .finally(() => {
                if (isMounted) setIsLoading(false);
            });

        return () => {
            isMounted = false;
            controller.abort();
        };
    }, []);

    useEffect(() => {
        let isMounted = true;

        async function checkDeletePermission() {
            setIsCheckingPermission(true);
            try {
                const currentUser = await getCurrentUser();
                if (isMounted) setCanDeleteBudgets(hasDeletePermission(currentUser));
            } catch {
                if (isMounted) setCanDeleteBudgets(false);
            } finally {
                if (isMounted) setIsCheckingPermission(false);
            }
        }

        void checkDeletePermission();
        return () => { isMounted = false; };
    }, []);

    useEffect(() => {
        function handleKeyDown(event) {
            if (event.key !== "Escape" || busyAction) return;

            if (pendingDeleteBudget) {
                setPendingDeleteBudget(null);
                setDeleteError("");
                return;
            }

            onClose();
        }

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [busyAction, pendingDeleteBudget, onClose]);

    function closeOnBackdrop(event) {
        if (event.target === event.currentTarget && !busyAction) onClose();
    }

    function openDeleteConfirmation(budget) {
        if (isCheckingPermission || !canDeleteBudgets) {
            setActionError("A exclusão de orçamentos exige nível de acesso 3 ou superior.");
            return;
        }

        setActionError("");
        setActionMessage("");
        setDeleteError("");
        setPendingDeleteBudget(budget);
    }

    function closeDeleteConfirmation() {
        if (busyAction) return;
        setPendingDeleteBudget(null);
        setDeleteError("");
    }

    async function handleDeleteBudget() {
        if (!pendingDeleteBudget || busyAction) return;

        if (isCheckingPermission || !canDeleteBudgets) {
            setDeleteError("Você não tem permissão para excluir orçamentos. É necessário nível de acesso 3 ou superior.");
            return;
        }

        const budget = pendingDeleteBudget;
        setActionError("");
        setActionMessage("");
        setDeleteError("");
        setBusyAction(`delete-${budget.id}`);

        try {
            await deleteBudget(budget.id);
            setBudgets((currentBudgets) =>
                currentBudgets.filter((currentBudget) => currentBudget.id !== budget.id)
            );
            setPendingDeleteBudget(null);
            setDeleteError("");
            setActionMessage(`Orçamento #${budget.id} excluído com sucesso.`);
        } catch (error) {
            setDeleteError(getErrorMessage(error));
        } finally {
            setBusyAction("");
        }
    }

    async function handleDocumentAction(budget, documentType) {
        const actionKey = `${budget.id}-${documentType}`;
        setActionError("");
        setActionMessage("");
        setBusyAction(actionKey);

        let couponWindow = null;
        try {
            if (documentType === "pdf") {
                await printBudgetPdf(budget);
            } else if (documentType === "coupon") {
                couponWindow = window.open("", "_blank");
                if (!couponWindow) {
                    throw new Error("Permita a abertura de pop-ups para imprimir o cupom do orçamento.");
                }

                couponWindow.document.title = "Carregando orçamento...";
                couponWindow.document.body.textContent = "Carregando os itens do orçamento...";
                const detail = await getBudgetById(budget.id);
                drawBudgetCoupon(detail, couponWindow);
            }
        } catch (error) {
            if (couponWindow && !couponWindow.closed) couponWindow.close();
            setActionError(getErrorMessage(error));
        } finally {
            setBusyAction("");
        }
    }

    const isDeleting = Boolean(pendingDeleteBudget) &&
        busyAction === `delete-${pendingDeleteBudget?.id}`;

    return (
        <div className="budget-modal__backdrop" onMouseDown={closeOnBackdrop}>
            <section
                className="budget-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="budget-modal-title"
                aria-busy={isLoading || Boolean(busyAction) || isCheckingPermission}
            >
                <header className="budget-modal__header">
                    <h2 id="budget-modal-title">Orçamentos</h2>
                    <button
                        className="budget-modal__close"
                        autoFocus
                        type="button"
                        aria-label="Fechar orçamentos"
                        disabled={Boolean(busyAction)}
                        onClick={onClose}
                    >
                        ×
                    </button>
                </header>

                <div className="budget-modal__body">
                    {isLoading && (
                        <p className="budget-modal__message">Carregando orçamentos...</p>
                    )}

                    {!isLoading && errorMessage && (
                        <p className="budget-modal__message budget-modal__message--error" role="alert">
                            {errorMessage}
                        </p>
                    )}

                    {actionError && (
                        <p className="budget-modal__message budget-modal__message--error" role="alert">
                            {actionError}
                        </p>
                    )}

                    {actionMessage && (
                        <p className="budget-modal__message" role="status">{actionMessage}</p>
                    )}

                    {!isCheckingPermission && !canDeleteBudgets && (
                        <p className="budget-modal__message" role="status">
                            A exclusão de orçamentos está disponível apenas para usuários com nível de acesso 3 ou superior.
                        </p>
                    )}

                    {!isLoading && !errorMessage && budgets.length === 0 && (
                        <p className="budget-modal__message">Nenhum orçamento foi registrado.</p>
                    )}

                    {!isLoading && !errorMessage && budgets.map((budget) => (
                        <article className="budget-modal__row" key={budget.id}>
                            <div className="budget-modal__identity">
                                <strong>#{budget.id}</strong>
                                <time dateTime={budget.dt_budget}>
                                    {formatBudgetDate(budget.dt_budget)}
                                </time>
                            </div>

                            <span className="budget-modal__client">
                                {budget.client_name || "Cliente não informado"}
                            </span>

                            <strong className="budget-modal__total">
                                {currencyFormatter.format(Number(budget.total_value) || 0)}
                            </strong>

                            <div className="budget-modal__actions">
                                <button
                                    className="budget-modal__action budget-modal__action--pdf"
                                    type="button"
                                    disabled={Boolean(busyAction)}
                                    onClick={() => handleDocumentAction(budget, "pdf")}
                                    title="Abrir o PDF do orçamento no padrão do sistema."
                                >
                                    {busyAction === `${budget.id}-pdf` ? "Gerando..." : "PDF"}
                                </button>

                                <button
                                    className="budget-modal__action budget-modal__action--coupon"
                                    type="button"
                                    disabled={Boolean(busyAction)}
                                    onClick={() => handleDocumentAction(budget, "coupon")}
                                    title="Abrir o cupom do orçamento para impressão."
                                >
                                    {busyAction === `${budget.id}-coupon` ? "Gerando..." : "Cupom"}
                                </button>

                                <button
                                    className="budget-modal__action budget-modal__action--delete"
                                    type="button"
                                    disabled={Boolean(busyAction) || isCheckingPermission || !canDeleteBudgets}
                                    onClick={() => openDeleteConfirmation(budget)}
                                    title={canDeleteBudgets
                                        ? "Excluir este orçamento."
                                        : "A exclusão exige nível de acesso 3 ou superior."}
                                >
                                    Excluir
                                </button>
                            </div>
                        </article>
                    ))}
                </div>
            </section>

            {pendingDeleteBudget && (
                <div
                    className="budget-modal__confirm-backdrop"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget && !busyAction) {
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
                        className="budget-modal__confirm"
                        role="alertdialog"
                        aria-modal="true"
                        aria-labelledby="budget-delete-title"
                        aria-describedby="budget-delete-description"
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
                            <h2 id="budget-delete-title" style={{ margin: "0 0 16px", fontSize: "1.25rem" }}>
                                Confirmar exclusão do orçamento
                            </h2>
                        </header>

                        <div>
                            <p id="budget-delete-description">
                                Tem certeza de que deseja excluir o orçamento{" "}
                                <strong>#{pendingDeleteBudget.id}</strong>, no valor de{" "}
                                <strong>
                                    {currencyFormatter.format(Number(pendingDeleteBudget.total_value) || 0)}
                                </strong>?
                            </p>
                            <p>
                                Esta operação remove o orçamento e seus itens vinculados.
                                O estoque não será alterado, pois orçamentos não registram vendas.
                            </p>
                            {deleteError && (
                                <p role="alert" style={{
                                    marginTop: "16px",
                                    padding: "12px",
                                    borderRadius: "6px",
                                    background: "#fde8e7",
                                    color: "#9c2420",
                                    overflowWrap: "anywhere"
                                }}>
                                    {deleteError}
                                </p>
                            )}
                        </div>

                        <footer style={{
                            display: "flex",
                            justifyContent: "flex-end",
                            flexWrap: "wrap",
                            gap: "10px",
                            marginTop: "24px"
                        }}>
                            <button
                                className="budget-modal__action"
                                type="button"
                                disabled={Boolean(busyAction)}
                                onClick={closeDeleteConfirmation}
                                autoFocus
                            >
                                Cancelar
                            </button>
                            <button
                                className="budget-modal__action budget-modal__action--delete"
                                type="button"
                                disabled={Boolean(busyAction) || isCheckingPermission || !canDeleteBudgets}
                                onClick={handleDeleteBudget}
                            >
                                {isDeleting ? "Excluindo..." : "Confirmar exclusão"}
                            </button>
                        </footer>
                    </section>
                </div>
            )}
        </div>
    );
}
