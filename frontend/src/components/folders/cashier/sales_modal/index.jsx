import { useEffect, useState } from "react";

import { getCashierSales } from "@/data/api/cashier";
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
        : "Não foi possível carregar as vendas.";
}

export default function CashierSalesModal({ onClose }) {
    const [sales, setSales] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState("");

    useEffect(() => {
        let isMounted = true;

        function handleKeyDown(event) {
            if (event.key === "Escape") {
                onClose();
            }
        }

        window.addEventListener("keydown", handleKeyDown);

        getCashierSales()
            .then((result) => {
                if (isMounted) {
                    setSales(result);
                }
            })
            .catch((error) => {
                if (isMounted) {
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
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [onClose]);

    function closeOnBackdrop(event) {
        if (event.target === event.currentTarget) {
            onClose();
        }
    }

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
                aria-busy={isLoading}
            >
                <header className="cashier-sales-modal__header">
                    <h2 id="cashier-sales-title">Notas Fiscais</h2>
                    <button
                        className="cashier-sales-modal__close"
                        autoFocus
                        type="button"
                        aria-label="Fechar notas fiscais"
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

                    {!isLoading && !errorMessage && sales.length === 0 && (
                        <p className="cashier-sales-modal__message">
                            Nenhuma venda foi registrada.
                        </p>
                    )}

                    {!isLoading && !errorMessage && sales.map((sale) => (
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
                                {currencyFormatter.format(Number(sale.total_value) || 0)}
                            </strong>

                            <div className="cashier-sales-modal__actions">
                                <button
                                    className="cashier-sales-modal__action cashier-sales-modal__action--pdf"
                                    type="button"
                                    disabled
                                    title="Download de PDF ainda não disponível."
                                >
                                    Baixar PDF
                                </button>
                                <button
                                    className="cashier-sales-modal__action cashier-sales-modal__action--xml"
                                    type="button"
                                    disabled
                                    title="Impressão de XML ainda não disponível."
                                >
                                    Imprimir XML
                                </button>
                                <button
                                    className="cashier-sales-modal__action cashier-sales-modal__action--delete"
                                    type="button"
                                    disabled
                                    title="Exclusão de venda ainda não disponível."
                                >
                                    Excluir
                                </button>
                            </div>
                        </article>
                    ))}
                </div>
            </section>
        </div>
    );
}


