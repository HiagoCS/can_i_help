import { useEffect, useState } from "react";

import { getCashierClients } from "@/data/api/cashier";
import "./style.scss";

function getErrorMessage(error) {
    return error instanceof Error ? error.message : "Não foi possível carregar os clientes.";
}

export default function CashierClientModal({ onClose, onSelect }) {
    const [query, setQuery] = useState("");
    const [clients, setClients] = useState([]);
    const [selectedId, setSelectedId] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState("");

    useEffect(() => {
        let isCurrent = true;
        setIsLoading(true);
        setErrorMessage("");
        const timeoutId = window.setTimeout(() => {
            getCashierClients(query)
                .then((result) => {
                    if (isCurrent) setClients(result);
                })
                .catch((error) => {
                    if (isCurrent) setErrorMessage(getErrorMessage(error));
                })
                .finally(() => {
                    if (isCurrent) setIsLoading(false);
                });
        }, query ? 250 : 0);

        return () => {
            isCurrent = false;
            window.clearTimeout(timeoutId);
        };
    }, [query]);

    useEffect(() => {
        function handleKeyDown(event) {
            if (event.key === "Escape") onClose();
        }
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);

    function closeOnBackdrop(event) {
        if (event.target === event.currentTarget) onClose();
    }

    const selectedClient = clients.find((client) => String(client.id) === selectedId);

    return (
        <div className="cashier-client-modal__backdrop" onMouseDown={closeOnBackdrop}>
            <section
                className="cashier-client-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="cashier-client-title"
                aria-busy={isLoading}
            >
                <header className="cashier-client-modal__header">
                    <h2 id="cashier-client-title">Escolha um cliente</h2>
                    <button type="button" aria-label="Fechar clientes" onClick={onClose}>×</button>
                </header>
                <label className="cashier-client-modal__search">
                    <span className="visually-hidden">Pesquisar cliente</span>
                    <input
                        autoFocus
                        type="search"
                        placeholder="Buscar por nome, CPF ou CNPJ"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                    />
                </label>
                <div className="cashier-client-modal__list">
                    {isLoading && <p>Carregando clientes...</p>}
                    {!isLoading && errorMessage && <p className="cashier-client-modal__error" role="alert">{errorMessage}</p>}
                    {!isLoading && !errorMessage && clients.length === 0 && <p>Nenhum cliente encontrado.</p>}
                    {!isLoading && !errorMessage && clients.map((client) => {
                        const taxId = client.cpf || client.cnpj;
                        return (
                            <label className={"cashier-client-modal__option " + (selectedId === String(client.id) ? "is-selected" : "")} key={client.id}>
                                <input
                                    type="radio"
                                    name="cashier-client"
                                    value={client.id}
                                    checked={selectedId === String(client.id)}
                                    onChange={() => setSelectedId(String(client.id))}
                                />
                                <span>
                                    <strong>{client.name}</strong>
                                    {taxId ? <small>({client.cpf ? "CPF" : "CNPJ"}: {taxId})</small> : <small>(sem CPF/CNPJ)</small>}
                                </span>
                            </label>
                        );
                    })}
                </div>
                <p className="cashier-client-modal__hint">
                    O cliente e os demais dados cadastrais são mantidos em Configurações.
                </p>
                <footer className="cashier-client-modal__actions">
                    <button type="button" onClick={onClose}>Cancelar</button>
                    <button
                        type="button"
                        disabled={!selectedClient}
                        onClick={() => selectedClient && onSelect(selectedClient)}
                    >
                        Confirmar seleção
                    </button>
                </footer>
            </section>
        </div>
    );
}
