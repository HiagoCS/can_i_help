
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { getAvatarUrl, logoutUser } from "@/data/api/auth";
import {
    updateMyProfile,
    uploadProfileAvatar
} from "@/data/api/settings";

import {
    SettingsActions,
    SettingsFeedback,
    SettingsField,
    SettingsSectionHeading
} from "./common";

function isActive(status) {
    return status !== false && status !== 0;
}

export default function ProfileSection({ user, onUserUpdate }) {
    const navigate = useNavigate();
    const avatarInputRef = useRef(null);

    const [email, setEmail] = useState(user?.email ?? "");
    const [password, setPassword] = useState("");
    const [passwordConfirm, setPasswordConfirm] = useState("");
    const [avatarFile, setAvatarFile] = useState(null);
    const [avatarPreview, setAvatarPreview] = useState("");

    const [isSaving, setIsSaving] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);

    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    useEffect(() => {
        setEmail(user?.email ?? "");
    }, [user?.email]);

    /*
     * Cria uma pré-visualização temporária da imagem selecionada
     * e libera a URL anterior quando a imagem mudar ou o componente
     * for desmontado.
     */
    useEffect(() => {
        if (!avatarFile) {
            setAvatarPreview("");
            return;
        }

        const previewUrl = URL.createObjectURL(avatarFile);

        setAvatarPreview(previewUrl);

        return () => {
            URL.revokeObjectURL(previewUrl);
        };
    }, [avatarFile]);

    async function handleSubmit(event) {
        event.preventDefault();

        if (isSaving || isLoggingOut) {
            return;
        }

        if (password && password !== passwordConfirm) {
            setError("A confirmação da senha não corresponde.");
            setSuccess("");
            return;
        }

        setIsSaving(true);
        setError("");
        setSuccess("");

        try {
            let avatar = user?.avatar ?? null;

            if (avatarFile) {
                avatar = (
                    await uploadProfileAvatar(avatarFile)
                ).avatar;
            }

            const updated = await updateMyProfile({
                email: email.trim(),
                ...(password ? { password } : {})
            });

            onUserUpdate?.({
                ...user,
                ...updated,
                email: updated?.email ?? email.trim(),
                avatar
            });

            setPassword("");
            setPasswordConfirm("");
            setAvatarFile(null);
            setSuccess("Perfil atualizado.");
        } catch (reason) {
            setError(
                reason instanceof Error
                    ? reason.message
                    : "Não foi possível salvar o perfil."
            );
        } finally {
            setIsSaving(false);
        }
    }

    function handleAvatarChange(event) {
        const input = event.currentTarget;
        const file = input.files?.[0] ?? null;

        // Permite selecionar novamente o mesmo arquivo.
        input.value = "";

        if (!file) {
            return;
        }

        if (
            !["image/png", "image/jpeg", "image/webp"].includes(file.type)
        ) {
            setError("Selecione uma imagem PNG, JPEG ou WebP.");
            setSuccess("");
            return;
        }

        if (file.size > 2 * 1024 * 1024) {
            setError("A imagem deve ter no máximo 2 MB.");
            setSuccess("");
            return;
        }

        setError("");
        setSuccess("");
        setAvatarFile(file);
    }

    async function handleLogout() {
        if (isSaving || isLoggingOut) {
            return;
        }

        setIsLoggingOut(true);
        setError("");
        setSuccess("");

        try {
            await logoutUser();

            // Limpa o usuário no estado global do App.
            onUserUpdate?.(null);

            // Retorna ao login sem manter a página protegida no histórico.
            navigate("/login", { replace: true });
        } catch (reason) {
            setError(
                reason instanceof Error
                    ? reason.message
                    : "Não foi possível sair da conta."
            );
        } finally {
            setIsLoggingOut(false);
        }
    }

    const avatarUrl = getAvatarUrl(user?.avatar);
    const displayedAvatar = avatarPreview || avatarUrl;
    const isBusy = isSaving || isLoggingOut;

    return (
        <form className="settings-form" onSubmit={handleSubmit}>
            <SettingsSectionHeading
                title="Usuário / Perfil"
                description="Atualize os dados da sua conta autenticada."
            />

            <SettingsFeedback
                error={error}
                success={success}
            />

            <div className="settings-profile">
                <div className="settings-profile__avatar-wrap">
                    <button
                        className="settings-profile__avatar"
                        type="button"
                        onClick={() => avatarInputRef.current?.click()}
                        disabled={isBusy}
                        aria-label="Alterar imagem do avatar"
                        title="Clique para alterar o avatar"
                        style={{
                            position: "relative",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            overflow: "hidden",
                            padding: 0,
                            borderRadius: "50%",
                            cursor: isBusy ? "wait" : "pointer"
                        }}
                    >
                        {displayedAvatar ? (
                            <img
                                src={displayedAvatar}
                                alt="Avatar do usuário"
                                style={{
                                    display: "block",
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "cover",
                                    borderRadius: "50%",
                                    pointerEvents: "none"
                                }}
                            />
                        ) : (
                            <span
                                style={{
                                    pointerEvents: "none"
                                }}
                            >
                                {(email || "U").slice(0, 1).toUpperCase()}
                            </span>
                        )}
                    </button>

                    <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={handleAvatarChange}
                        disabled={isBusy}
                        aria-label="Selecionar arquivo do avatar"
                        tabIndex={-1}
                        style={{
                            display: "none"
                        }}
                    />

                    <p
                        style={{
                            margin: "8px 0 0",
                            fontSize: "0.8rem",
                            textAlign: "center"
                        }}
                    >
                        Clique na imagem para alterar
                    </p>
                </div>

                <div className="settings-form__grid">
                    <SettingsField label="E-mail" required>
                        <input
                            type="email"
                            autoComplete="email"
                            required
                            maxLength={180}
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            disabled={isBusy}
                        />
                    </SettingsField>

                    <SettingsField label="Status da conta">
                        <span
                            className={[
                                "settings-status",
                                isActive(user?.status)
                                    ? "is-active"
                                    : "is-inactive"
                            ].join(" ")}
                        >
                            {isActive(user?.status) ? "Ativa" : "Inativa"}
                        </span>
                    </SettingsField>

                    <SettingsField label="Nova senha">
                        <input
                            type="password"
                            autoComplete="new-password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            placeholder="Deixe vazia para manter"
                            disabled={isBusy}
                        />
                    </SettingsField>

                    <SettingsField label="Confirmar nova senha">
                        <input
                            type="password"
                            autoComplete="new-password"
                            value={passwordConfirm}
                            onChange={(event) =>
                                setPasswordConfirm(event.target.value)
                            }
                            placeholder="Repita a nova senha"
                            disabled={isBusy}
                        />
                    </SettingsField>
                </div>
            </div>

            <div className="settings-role-summary">
                <strong>Permissões controladas pelo sistema</strong>

                {(user?.roles ?? []).length ? (
                    <ul>
                        {user.roles.map((role) => (
                            <li key={role.id}>
                                {role.name} · level {role.level}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p>Nenhuma role atribuída.</p>
                )}
            </div>

            <SettingsActions>
                <button
                    className="settings__button settings__button--save"
                    type="submit"
                    disabled={isBusy}
                >
                    {isSaving ? "Salvando..." : "Salvar perfil"}
                </button>

                <button
                    className="settings__button"
                    type="button"
                    onClick={handleLogout}
                    disabled={isBusy}
                    style={{
                        backgroundColor: "#c62828",
                        borderColor: "#b71c1c",
                        color: "#ffffff"
                    }}
                >
                    {isLoggingOut ? "Saindo..." : "Sair da conta"}
                </button>
            </SettingsActions>
        </form>
    );
}
