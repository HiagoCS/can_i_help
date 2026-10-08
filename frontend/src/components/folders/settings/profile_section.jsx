import { useEffect, useState } from "react";

import { getAvatarUrl } from "@/data/api/auth";
import { updateMyProfile, uploadProfileAvatar } from "@/data/api/settings";
import { SettingsActions, SettingsFeedback, SettingsField, SettingsSectionHeading } from "./common";

function isActive(status) {
    return status !== false && status !== 0;
}

export default function ProfileSection({ user, onUserUpdate }) {
    const [email, setEmail] = useState(user?.email ?? "");
    const [password, setPassword] = useState("");
    const [passwordConfirm, setPasswordConfirm] = useState("");
    const [avatarFile, setAvatarFile] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    useEffect(() => setEmail(user?.email ?? ""), [user?.email]);

    async function handleSubmit(event) {
        event.preventDefault();
        if (isSaving) return;
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
            if (avatarFile) avatar = (await uploadProfileAvatar(avatarFile)).avatar;

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
            setError(reason instanceof Error ? reason.message : "Não foi possível salvar o perfil.");
        } finally {
            setIsSaving(false);
        }
    }

    function handleAvatarChange(event) {
        const file = event.target.files?.[0] ?? null;
        if (file && !["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
            setError("Selecione uma imagem PNG, JPEG ou WebP.");
            event.target.value = "";
            return;
        }
        if (file && file.size > 2 * 1024 * 1024) {
            setError("A imagem deve ter no máximo 2 MB.");
            event.target.value = "";
            return;
        }
        setError("");
        setAvatarFile(file);
    }

    const avatarUrl = getAvatarUrl(user?.avatar);

    return (
        <form className="settings-form" onSubmit={handleSubmit}>
            <SettingsSectionHeading
                title="Usuário / Perfil"
                description="Atualize os dados da sua conta autenticada."
            />
            <SettingsFeedback error={error} success={success} />

            <div className="settings-profile">
                <div className="settings-profile__avatar-wrap">
                    <div className="settings-profile__avatar">
                        {avatarUrl && !avatarFile
                            ? <img src={avatarUrl} alt="" />
                            : <span>{(email || "U").slice(0, 1).toUpperCase()}</span>}
                    </div>
                    <SettingsField label="Avatar">
                        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleAvatarChange} />
                    </SettingsField>
                </div>

                <div className="settings-form__grid">
                    <SettingsField label="E-mail" required>
                        <input type="email" autoComplete="email" required maxLength={180} value={email} onChange={(event) => setEmail(event.target.value)} />
                    </SettingsField>
                    <SettingsField label="Status da conta">
                        <span className={["settings-status", isActive(user?.status) ? "is-active" : "is-inactive"].join(" ")}>
                            {isActive(user?.status) ? "Ativa" : "Inativa"}
                        </span>
                    </SettingsField>
                    <SettingsField label="Nova senha">
                        <input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Deixe vazia para manter" />
                    </SettingsField>
                    <SettingsField label="Confirmar nova senha">
                        <input type="password" autoComplete="new-password" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} placeholder="Repita a nova senha" />
                    </SettingsField>
                </div>
            </div>

            <div className="settings-role-summary">
                <strong>Permissões controladas pelo sistema</strong>
                {(user?.roles ?? []).length ? (
                    <ul>
                        {user.roles.map((role) => <li key={role.id}>{role.name} · level {role.level}</li>)}
                    </ul>
                ) : <p>Nenhuma role atribuída.</p>}
            </div>

            <SettingsActions>
                <button className="settings__button settings__button--save" type="submit" disabled={isSaving}>
                    {isSaving ? "Salvando..." : "Salvar perfil"}
                </button>
            </SettingsActions>
        </form>
    );
}
