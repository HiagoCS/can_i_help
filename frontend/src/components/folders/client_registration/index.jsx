import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { createCashierClient } from "@/data/api/cashier";
import "./style.scss";

function formatCpf(value) {
    return String(value ?? "")
        .replace(/\D/g, "")
        .slice(0, 11)
        .replace(/^(\d{3})(\d)/, "$1.$2")
        .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
        .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

export default function ClientRegistrationPage() {
    const location = useLocation();
    const navigate = useNavigate();
    const routeState = location.state ?? {};
    const cashierDraft = routeState.cashierDraft ?? null;
    const initialCpf = String(routeState.clientTaxId ?? "").replace(/\D/g, "");
    const [name, setName] = useState(routeState.clientName ?? "");
    const [cpf, setCpf] = useState(initialCpf.length === 11 ? initialCpf : "");
    const [isSaving, setIsSaving] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");

    function returnToCashier(state = {}) {
        navigate("/caixa", {
            replace: true,
            state: {
                ...(cashierDraft ? { cashierDraft } : {}),
                ...state
            }
        });
    }

    async function handleSubmit(event) {
        event.preventDefault();
        if (isSaving) return;

        const cpfDigits = cpf.replace(/\D/g, "");
        if (cpfDigits && cpfDigits.length !== 11) {
            setErrorMessage("Informe um CPF com 11 dígitos ou deixe o campo vazio.");
            return;
        }

        setErrorMessage("");
        setIsSaving(true);

        try {
            const client = await createCashierClient({
                name: name.trim(),
                cpf: cpfDigits || null
            });

            returnToCashier({
                createdClient: client,
                resumeFinalization: Boolean(routeState.resumeFinalization)
            });
        } catch (error) {
            setErrorMessage(
                error instanceof Error
                    ? error.message
                    : "Não foi possível cadastrar o cliente."
            );
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <main className="client-registration">
            <header className="client-registration__header">
                <h1>POSSO AJUDAR?</h1>
                <span>Novo cliente</span>
            </header>

            <div className="client-registration__content">
                <form className="client-registration__card" onSubmit={handleSubmit}>
                    <div className="client-registration__card-heading">
                        <h2>Cadastro de cliente</h2>
                        <p>Informe os dados básicos para vincular o cliente à venda.</p>
                    </div>

                    <div className="client-registration__fields">
                        <label className="client-registration__field">
                            <span>Nome do cliente *</span>
                            <input
                                autoFocus
                                autoComplete="name"
                                required
                                maxLength={160}
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                            />
                        </label>

                        <label className="client-registration__field">
                            <span>CPF (opcional)</span>
                            <input
                                inputMode="numeric"
                                autoComplete="off"
                                placeholder="000.000.000-00"
                                value={formatCpf(cpf)}
                                onChange={(event) => setCpf(event.target.value.replace(/\D/g, "").slice(0, 11))}
                            />
                        </label>
                    </div>

                    {errorMessage && (
                        <p className="client-registration__error" role="alert">{errorMessage}</p>
                    )}

                    <p className="client-registration__hint">
                        Endereço e demais dados do cliente poderão ser preenchidos depois nas configurações do sistema.
                    </p>

                    <footer className="client-registration__actions">
                        <button
                            className="client-registration__button client-registration__button--cancel"
                            type="button"
                            disabled={isSaving}
                            onClick={() => returnToCashier()}
                        >
                            Voltar ao Caixa
                        </button>
                        <button
                            className="client-registration__button client-registration__button--save"
                            type="submit"
                            disabled={isSaving}
                        >
                            {isSaving ? "Salvando..." : "Salvar e voltar ao Caixa"}
                        </button>
                    </footer>
                </form>
            </div>
        </main>
    );
}