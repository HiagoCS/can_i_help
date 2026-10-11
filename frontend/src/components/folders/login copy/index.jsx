
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import "./style.scss";
import { registerUser } from "@/data/api/auth";

export default function RegisterPage({ onRegisterSuccess }) {
    const navigate = useNavigate();
    const avatarInputRef = useRef(null);

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [avatar, setAvatar] = useState(null);
    const [avatarPreview, setAvatarPreview] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    function handleAvatarChange(event) {
        const file = event.target.files?.[0];

        if (!file) return;

        if (!file.type.startsWith("image/")) {
            setErrorMessage("Selecione um arquivo de imagem válido.");
            event.target.value = "";
            return;
        }

        setErrorMessage("");
        setAvatar(file);

        const reader = new FileReader();

        reader.onload = () => {
            setAvatarPreview(
                typeof reader.result === "string" ? reader.result : ""
            );
        };

        reader.onerror = () => {
            setErrorMessage("Não foi possível carregar a imagem.");
        };

        reader.readAsDataURL(file);
    }

    async function handleSubmit(event) {
        event.preventDefault();
        setErrorMessage("");

        if (!event.currentTarget.reportValidity()) return;

        setIsSubmitting(true);

        try {
            const user = await registerUser({
                email: email.trim(),
                password,
                avatar
            });

            if (onRegisterSuccess) {
                onRegisterSuccess(user);
            }

            navigate("/login", { replace: true });
        } catch (error) {
            setErrorMessage(
                error instanceof Error
                    ? error.message
                    : "Não foi possível criar a conta. Tente novamente."
            );
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <main className="register-page">
            <section
                className="register-card"
                aria-labelledby="register-title"
            >
                <header className="register-card__header">
                    <h1 className="register-card__title" id="register-title">
                        POSSO AJUDAR?
                    </h1>
                </header>

                <form
                    className="register-form"
                    onSubmit={handleSubmit}
                    aria-busy={isSubmitting}
                >
                    <div className="register-form__avatar">
                        <button
                            className="register-form__avatar-button"
                            type="button"
                            onClick={() => avatarInputRef.current?.click()}
                            aria-label="Selecionar imagem do avatar"
                            disabled={isSubmitting}
                        >
                            {avatarPreview ? (
                                <img
                                    className="register-form__avatar-image"
                                    src={avatarPreview}
                                    alt="Pré-visualização do avatar"
                                />
                            ) : (
                                <span
                                    className="register-form__avatar-placeholder"
                                    aria-hidden="true"
                                >
                                    +
                                </span>
                            )}
                        </button>

                        <input
                            ref={avatarInputRef}
                            className="register-form__avatar-input"
                            type="file"
                            name="avatar"
                            accept="image/*"
                            onChange={handleAvatarChange}
                            tabIndex={-1}
                            aria-label="Arquivo do avatar"
                        />
                    </div>

                    <label
                        className="visually-hidden"
                        htmlFor="register-email"
                    >
                        E-mail
                    </label>
                    <input
                        className="register-form__field"
                        id="register-email"
                        name="email"
                        type="email"
                        placeholder="E-mail"
                        autoComplete="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        required
                    />

                    <label
                        className="visually-hidden"
                        htmlFor="register-password"
                    >
                        Senha
                    </label>
                    <input
                        className="register-form__field"
                        id="register-password"
                        name="password"
                        type="password"
                        placeholder="Senha"
                        autoComplete="new-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        required
                    />

                    {errorMessage && (
                        <p
                            className="register-message register-message--error"
                            role="alert"
                        >
                            {errorMessage}
                        </p>
                    )}

                    <div className="register-form__actions">
                        <button
                            className="register-form__submit"
                            type="submit"
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? "Cadastrando..." : "Cadastrar"}
                        </button>

                        <button
                            className="register-form__login"
                            type="button"
                            onClick={() => navigate("/login")}
                            disabled={isSubmitting}
                        >
                            Já tenho conta
                        </button>
                    </div>
                </form>
            </section>
        </main>
    );
}
