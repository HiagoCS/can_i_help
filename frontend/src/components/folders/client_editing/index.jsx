import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import "./style.scss";

const API_BASE_URL = import.meta.env.DEV
    ? ""
    : (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

const INITIAL_FORM = {
    name: "",
    cpf: "",
    cnpj: "",
    ie: "",
    address: "",
    number: "",
    complement: "",
    neighborhood: "",
    city: "",
    city_ibge: "",
    state: "",
    zip_code: ""
};

function getApiUrl(path) {
    return `${API_BASE_URL}${path}`;
}

function onlyDigits(value) {
    return String(value ?? "").replace(/\D/g, "");
}

function formatCpf(value) {
    return onlyDigits(value)
        .slice(0, 11)
        .replace(/^(\d{3})(\d)/, "$1.$2")
        .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
        .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

function formatCnpj(value) {
    return onlyDigits(value)
        .slice(0, 14)
        .replace(/^(\d{2})(\d)/, "$1.$2")
        .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
        .replace(/\.(\d{3})(\d)/, ".$1/$2")
        .replace(/(\d{4})(\d)/, "$1-$2");
}

function formatZipCode(value) {
    return onlyDigits(value)
        .slice(0, 8)
        .replace(/^(\d{5})(\d)/, "$1-$2");
}

function normalizeClient(client) {
    return {
        name: String(client.name ?? ""),
        cpf: onlyDigits(client.cpf),
        cnpj: onlyDigits(client.cnpj),
        ie: String(client.ie ?? ""),
        address: String(client.address ?? ""),
        number: String(client.number ?? ""),
        complement: String(client.complement ?? ""),
        neighborhood: String(client.neighborhood ?? ""),
        city: String(client.city ?? ""),
        city_ibge: onlyDigits(client.city_ibge).slice(0, 7),
        state: String(client.state ?? "").toUpperCase().slice(0, 2),
        zip_code: onlyDigits(client.zip_code).slice(0, 8)
    };
}

function getErrorMessage(error) {
    return error instanceof Error
        ? error.message
        : "Não foi possível concluir a operação.";
}

async function requestClient(path, method = "GET", payload, signal) {
    let response;

    try {
        response = await fetch(getApiUrl(path), {
            method,
            credentials: "include",
            headers: {
                Accept: "application/json",
                ...(payload ? { "Content-Type": "application/json" } : {})
            },
            ...(payload ? { body: JSON.stringify(payload) } : {}),
            ...(signal ? { signal } : {})
        });
    } catch (error) {
        if (signal?.aborted) {
            throw error;
        }

        throw new Error(
            "Não foi possível conectar ao servidor. Verifique a conexão e tente novamente."
        );
    }

    const result = await response
        .json()
        .catch(() => null);

    if (!response.ok) {
        if (response.status === 401) {
            throw new Error(
                "Sua sessão expirou. Entre novamente no sistema."
            );
        }

        if (response.status === 403) {
            throw new Error(
                "Você não tem permissão para editar este cliente."
            );
        }

        if (response.status === 404) {
            throw new Error(
                result?.message ?? "Cliente não encontrado."
            );
        }

        throw new Error(
            result?.message ?? "Não foi possível concluir a operação."
        );
    }

    return result;
}

export default function ClientEditingPage() {
    const { clientId } = useParams();
    const navigate = useNavigate();

    const [form, setForm] = useState({ ...INITIAL_FORM });
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [successMessage, setSuccessMessage] = useState("");

    useEffect(() => {
        let isMounted = true;
        const controller = new AbortController();

        async function loadClient() {
            const id = Number(clientId);

            if (!Number.isSafeInteger(id) || id <= 0) {
                setErrorMessage("O identificador do cliente é inválido.");
                setIsLoading(false);
                return;
            }

            try {
                const result = await requestClient(
                    `/api/clients/${id}`,
                    "GET",
                    undefined,
                    controller.signal
                );

                if (!isMounted) {
                    return;
                }

                const client = result?.data ?? result;

                if (
                    !client ||
                    typeof client !== "object" ||
                    Array.isArray(client)
                ) {
                    throw new Error(
                        "O servidor não retornou os dados do cliente."
                    );
                }

                setForm(normalizeClient(client));
            } catch (error) {
                if (isMounted && !controller.signal.aborted) {
                    setErrorMessage(getErrorMessage(error));
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        }

        loadClient();

        return () => {
            isMounted = false;
            controller.abort();
        };
    }, [clientId]);

    function updateField(field, value) {
        setForm((current) => ({
            ...current,
            [field]: value
        }));

        setErrorMessage("");
        setSuccessMessage("");
    }

    function handleCpfChange(value) {
        updateField("cpf", onlyDigits(value).slice(0, 11));
    }

    function handleCnpjChange(value) {
        updateField("cnpj", onlyDigits(value).slice(0, 14));
    }

    function handleZipCodeChange(value) {
        updateField("zip_code", onlyDigits(value).slice(0, 8));
    }

    function handleCityIbgeChange(value) {
        updateField("city_ibge", onlyDigits(value).slice(0, 7));
    }

    function handleStateChange(value) {
        updateField("state", value.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 2));
    }

    function validateForm() {
        if (!form.name.trim()) {
            return "Informe o nome do cliente.";
        }

        if (form.cpf && form.cpf.length !== 11) {
            return "O CPF deve conter 11 dígitos.";
        }

        if (form.cnpj && form.cnpj.length !== 14) {
            return "O CNPJ deve conter 14 dígitos.";
        }

        if (form.zip_code && form.zip_code.length !== 8) {
            return "O CEP deve conter 8 dígitos.";
        }

        if (form.city_ibge && form.city_ibge.length !== 7) {
            return "O código IBGE do município deve conter 7 dígitos.";
        }

        if (form.state && form.state.length !== 2) {
            return "Informe a sigla do estado com 2 letras.";
        }

        return "";
    }

    async function handleSubmit(event) {
        event.preventDefault();

        if (isSaving || isLoading) {
            return;
        }

        const id = Number(clientId);

        if (!Number.isSafeInteger(id) || id <= 0) {
            setErrorMessage("O identificador do cliente é inválido.");
            return;
        }

        const validationError = validateForm();

        if (validationError) {
            setErrorMessage(validationError);
            setSuccessMessage("");
            return;
        }

        setErrorMessage("");
        setSuccessMessage("");
        setIsSaving(true);

        // Somente os campos editáveis são enviados.
        // method_id / methodId não é incluído neste payload.
        const payload = {
            name: form.name.trim(),
            cpf: form.cpf || null,
            cnpj: form.cnpj || null,
            ie: form.ie.trim() || null,
            address: form.address.trim() || null,
            number: form.number.trim() || null,
            complement: form.complement.trim() || null,
            neighborhood: form.neighborhood.trim() || null,
            city: form.city.trim() || null,
            city_ibge: form.city_ibge || null,
            state: form.state || null,
            zip_code: form.zip_code || null
        };

        try {
            await requestClient(
                `/api/clients/${id}`,
                "PUT",
                payload
            );

            setSuccessMessage("Cliente atualizado com sucesso.");

            // Permite que a mensagem seja percebida antes de navegar.
            window.setTimeout(() => {
                navigate("/clientes/visao-geral", {
                    state: {
                        updatedClientId: id
                    }
                });
            }, 500);
        } catch (error) {
            setErrorMessage(getErrorMessage(error));
        } finally {
            setIsSaving(false);
        }
    }

    function handleCancel() {
        if (isSaving) {
            return;
        }

        navigate("/clientes");
    }

    return (
        <main className="client-editing">
            <header className="client-editing__header">
                <h1>POSSO AJUDAR?</h1>
                <span>Editar cliente</span>
            </header>

            <div className="client-editing__content">
                <form
                    className="client-editing__card"
                    onSubmit={handleSubmit}
                    aria-busy={isLoading || isSaving}
                >
                    <div className="client-editing__card-heading">
                        <h2>Dados do cliente</h2>
                        <p>
                            Atualize as informações cadastrais e o endereço
                            fiscal do cliente.
                        </p>
                        <span className="client-editing__client-id">
                            Código do cliente: #{clientId}
                        </span>
                    </div>

                    {isLoading ? (
                        <div className="client-editing__status">
                            Carregando dados do cliente...
                        </div>
                    ) : (
                        <>
                            <section className="client-editing__section">
                                <h3>Identificação</h3>

                                <div className="client-editing__fields">
                                    <label className="client-editing__field client-editing__field--full">
                                        <span>Nome / Razão social *</span>
                                        <input
                                            autoFocus
                                            autoComplete="name"
                                            required
                                            maxLength={160}
                                            value={form.name}
                                            onChange={(event) =>
                                                updateField(
                                                    "name",
                                                    event.target.value
                                                )
                                            }
                                        />
                                    </label>

                                    <label className="client-editing__field">
                                        <span>CPF</span>
                                        <input
                                            inputMode="numeric"
                                            autoComplete="off"
                                            placeholder="000.000.000-00"
                                            maxLength={14}
                                            value={formatCpf(form.cpf)}
                                            onChange={(event) =>
                                                handleCpfChange(
                                                    event.target.value
                                                )
                                            }
                                        />
                                    </label>

                                    <label className="client-editing__field">
                                        <span>CNPJ</span>
                                        <input
                                            inputMode="numeric"
                                            autoComplete="off"
                                            placeholder="00.000.000/0000-00"
                                            maxLength={18}
                                            value={formatCnpj(form.cnpj)}
                                            onChange={(event) =>
                                                handleCnpjChange(
                                                    event.target.value
                                                )
                                            }
                                        />
                                    </label>

                                    <label className="client-editing__field">
                                        <span>Inscrição Estadual (IE)</span>
                                        <input
                                            autoComplete="off"
                                            maxLength={30}
                                            value={form.ie}
                                            onChange={(event) =>
                                                updateField(
                                                    "ie",
                                                    event.target.value
                                                )
                                            }
                                        />
                                    </label>
                                </div>
                            </section>

                            <section className="client-editing__section">
                                <h3>Endereço fiscal</h3>

                                <div className="client-editing__fields">
                                    <label className="client-editing__field client-editing__field--wide">
                                        <span>Logradouro</span>
                                        <input
                                            autoComplete="address-line1"
                                            maxLength={180}
                                            value={form.address}
                                            onChange={(event) =>
                                                updateField(
                                                    "address",
                                                    event.target.value
                                                )
                                            }
                                        />
                                    </label>

                                    <label className="client-editing__field">
                                        <span>Número</span>
                                        <input
                                            autoComplete="off"
                                            maxLength={20}
                                            value={form.number}
                                            onChange={(event) =>
                                                updateField(
                                                    "number",
                                                    event.target.value
                                                )
                                            }
                                        />
                                    </label>

                                    <label className="client-editing__field">
                                        <span>Complemento</span>
                                        <input
                                            autoComplete="address-line2"
                                            maxLength={100}
                                            value={form.complement}
                                            onChange={(event) =>
                                                updateField(
                                                    "complement",
                                                    event.target.value
                                                )
                                            }
                                        />
                                    </label>

                                    <label className="client-editing__field">
                                        <span>Bairro</span>
                                        <input
                                            autoComplete="address-level3"
                                            maxLength={100}
                                            value={form.neighborhood}
                                            onChange={(event) =>
                                                updateField(
                                                    "neighborhood",
                                                    event.target.value
                                                )
                                            }
                                        />
                                    </label>

                                    <label className="client-editing__field">
                                        <span>Cidade</span>
                                        <input
                                            autoComplete="address-level2"
                                            maxLength={100}
                                            value={form.city}
                                            onChange={(event) =>
                                                updateField(
                                                    "city",
                                                    event.target.value
                                                )
                                            }
                                        />
                                    </label>

                                    <label className="client-editing__field">
                                        <span>Código IBGE do município</span>
                                        <input
                                            inputMode="numeric"
                                            autoComplete="off"
                                            placeholder="0000000"
                                            maxLength={7}
                                            value={form.city_ibge}
                                            onChange={(event) =>
                                                handleCityIbgeChange(
                                                    event.target.value
                                                )
                                            }
                                        />
                                    </label>

                                    <label className="client-editing__field">
                                        <span>Estado (UF)</span>
                                        <input
                                            autoComplete="address-level1"
                                            placeholder="SP"
                                            maxLength={2}
                                            value={form.state}
                                            onChange={(event) =>
                                                handleStateChange(
                                                    event.target.value
                                                )
                                            }
                                        />
                                    </label>

                                    <label className="client-editing__field">
                                        <span>CEP</span>
                                        <input
                                            inputMode="numeric"
                                            autoComplete="postal-code"
                                            placeholder="00000-000"
                                            maxLength={9}
                                            value={formatZipCode(form.zip_code)}
                                            onChange={(event) =>
                                                handleZipCodeChange(
                                                    event.target.value
                                                )
                                            }
                                        />
                                    </label>
                                </div>
                            </section>

                            {errorMessage && (
                                <p
                                    className="client-editing__feedback client-editing__feedback--error"
                                    role="alert"
                                >
                                    {errorMessage}
                                </p>
                            )}

                            {successMessage && (
                                <p
                                    className="client-editing__feedback client-editing__feedback--success"
                                    role="status"
                                >
                                    {successMessage}
                                </p>
                            )}

                            <p className="client-editing__hint">
                                Os campos de endereço são opcionais. O método
                                de pagamento preferencial não é alterado nesta
                                tela.
                            </p>

                            <footer className="client-editing__actions">
                                <button
                                    className="client-editing__button client-editing__button--cancel"
                                    type="button"
                                    disabled={isSaving}
                                    onClick={handleCancel}
                                >
                                    Cancelar
                                </button>

                                <button
                                    className="client-editing__button client-editing__button--save"
                                    type="submit"
                                    disabled={isSaving}
                                >
                                    {isSaving
                                        ? "Salvando..."
                                        : "Salvar alterações"}
                                </button>
                            </footer>
                        </>
                    )}
                </form>
            </div>
        </main>
    );
}