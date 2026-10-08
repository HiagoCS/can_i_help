import { useState } from "react";
import { useNavigate } from "react-router-dom";

import "./style.scss";
import { loginUser } from "@/data/api/auth";

export default function LoginPage({ onLoginSuccess }) {
    const navigate = useNavigate();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const [recoveryMessage, setRecoveryMessage] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    async function handleSubmit(event) {
        event.preventDefault();
        setErrorMessage("");
        setRecoveryMessage("");

        if (!event.currentTarget.reportValidity()) {
            return;
        }

        setIsSubmitting(true);

        try {
            const user = await loginUser(email.trim(), password);
            onLoginSuccess(user);
            navigate("/", { replace: true });
        } catch (error) {
            setErrorMessage(
                error instanceof Error
                    ? error.message
                    : "Não foi possível entrar. Tente novamente."
            );
        } finally {
            setIsSubmitting(false);
        }
    }

    function handleRecoveryClick(event) {
        event.preventDefault();
        setRecoveryMessage(
            "A recuperação de senha ainda não está disponível. Entre em contato com o administrador do sistema."
        );
    }

    return (
        <main className="login-page">
            <section className="login-card" aria-labelledby="login-title">
                <header className="login-card__header">
                    <h1 className="login-card__title" id="login-title">
                        POSSO AJUDAR?
                    </h1>
                </header>

                <form
                    className="login-form"
                    onSubmit={handleSubmit}
                    aria-busy={isSubmitting}
                >
                    <label className="visually-hidden" htmlFor="login-email">
                        E-mail
                    </label>
                    <input
                        className="login-form__field"
                        id="login-email"
                        name="email"
                        type="email"
                        placeholder="E-mail"
                        autoComplete="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        required
                    />

                    <label className="visually-hidden" htmlFor="login-password">
                        Senha
                    </label>
                    <input
                        className="login-form__field"
                        id="login-password"
                        name="password"
                        type="password"
                        placeholder="Senha"
                        autoComplete="current-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        required
                    />

                    <div className="login-form__actions">
                        <button
                            className="login-form__submit"
                            type="submit"
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? "Entrando..." : "Entrar"}
                        </button>

                        <a
                            className="login-form__recovery"
                            href="#recovery-notice"
                            onClick={handleRecoveryClick}
                        >
                            Esqueceu a senha?
                        </a>
                    </div>

                    {errorMessage && (
                        <p className="login-message login-message--error" role="alert">
                            {errorMessage}
                        </p>
                    )}

                    {recoveryMessage && (
                        <p
                            className="login-message login-message--notice"
                            id="recovery-notice"
                            role="status"
                        >
                            {recoveryMessage}
                        </p>
                    )}
                </form>
            </section>
        </main>
    );
}