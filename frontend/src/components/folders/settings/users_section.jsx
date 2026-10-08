import { useEffect, useMemo, useState } from "react";

import {
    createSettingsUser,
    getRoles,
    getSettingsUsers,
    updateSettingsUser
} from "@/data/api/settings";
import { SettingsActions, SettingsFeedback, SettingsField, SettingsSectionHeading } from "./common";

export default function UsersSection({ currentUserId, currentLevel }) {
    const [users, setUsers] = useState([]);
    const [roles, setRoles] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [selectedRoles, setSelectedRoles] = useState([]);
    const [isActive, setIsActive] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [newEmail, setNewEmail] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [newRoles, setNewRoles] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const selected = useMemo(
        () => users.find((item) => item.id === selectedId) ?? null,
        [users, selectedId]
    );
    const isSelf = selected?.id === currentUserId;

    useEffect(() => {
        let isMounted = true;
        Promise.all([getSettingsUsers(), getRoles()])
            .then(([userData, roleData]) => {
                if (!isMounted) return;
                const manageableUsers = (userData ?? []).filter((item) => {
                    const itemLevel = (item.roles ?? []).reduce(
                        (highest, role) => Math.max(highest, Number(role.level) || 0),
                        0
                    );
                    return Number(currentLevel) >= 3 || itemLevel <= Number(currentLevel);
                });
                setUsers(manageableUsers);
                setRoles((roleData ?? []).filter((role) => Number(role.level) <= Number(currentLevel)));
                setSelectedId(manageableUsers[0]?.id ?? null);
            })
            .catch((reason) => {
                if (isMounted) setError(reason instanceof Error ? reason.message : "Não foi possível carregar os usuários.");
            })
            .finally(() => {
                if (isMounted) setIsLoading(false);
            });

        return () => {
            isMounted = false;
        };
    }, [currentLevel]);

    useEffect(() => {
        if (!selected || isCreating) return;
        setSelectedRoles((selected.roles ?? []).map((role) => role.id));
        setIsActive(Boolean(selected.status));
    }, [selected, isCreating]);

    function beginCreate() {
        setIsCreating(true);
        setNewEmail("");
        setNewPassword("");
        setNewRoles([]);
        setError("");
        setSuccess("");
    }

    async function handleSubmit(event) {
        event.preventDefault();
        if (isSaving) return;
        if (!isCreating && isSelf) {
            setError("Use Usuário / Perfil para alterar sua própria conta.");
            return;
        }

        setIsSaving(true);
        setError("");
        setSuccess("");

        try {
            if (isCreating) {
                const created = await createSettingsUser({
                    email: newEmail.trim(),
                    password: newPassword,
                    roles: newRoles
                });
                const nextUser = { ...created, status: created.status ?? 1 };
                setUsers((current) => [nextUser, ...current]);
                setSelectedId(nextUser.id);
                setIsCreating(false);
                setSuccess("Usuário criado.");
            } else if (selected) {
                const updated = await updateSettingsUser(selected.id, {
                    status: isActive ? 1 : 0,
                    roles: selectedRoles
                });
                const nextUser = {
                    ...selected,
                    ...updated,
                    status: updated.status ?? (isActive ? 1 : 0),
                    roles: updated.roles ?? roles.filter((role) => selectedRoles.includes(role.id))
                };
                setUsers((current) => current.map((item) => item.id === selected.id ? nextUser : item));
                setSuccess("Acesso do usuário atualizado.");
            }
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Não foi possível salvar o usuário.");
        } finally {
            setIsSaving(false);
        }
    }

    if (isLoading) {
        return <p className="settings__loading">Carregando usuários...</p>;
    }

    return (
        <section className="settings-form">
            <div className="settings__heading-row">
                <SettingsSectionHeading
                    title="Controle de usuários"
                    description="O backend mantém a autorização por roles e impede alterações de acesso da própria conta."
                />
                <button className="settings__button settings__button--primary" type="button" onClick={beginCreate}>
                    + Novo usuário
                </button>
            </div>
            <SettingsFeedback error={error} success={success} />

            <div className="settings-users">
                <div className="settings-users__list" aria-label="Usuários cadastrados">
                    {users.map((item) => (
                        <button
                            className={[
                                "settings-users__item",
                                !isCreating && selectedId === item.id ? "is-selected" : ""
                            ].filter(Boolean).join(" ")}
                            type="button"
                            key={item.id}
                            onClick={() => {
                                setIsCreating(false);
                                setSelectedId(item.id);
                                setError("");
                                setSuccess("");
                            }}
                        >
                            <span>{item.email}</span>
                            <small>{item.status ? "Ativo" : "Inativo"}</small>
                        </button>
                    ))}
                </div>

                <form className="settings-users__editor" onSubmit={handleSubmit}>
                    {isCreating ? (
                        <>
                            <h3>Novo usuário</h3>
                            <div className="settings-form__grid">
                                <SettingsField label="E-mail" required>
                                    <input type="email" autoComplete="email" required value={newEmail} onChange={(event) => setNewEmail(event.target.value)} />
                                </SettingsField>
                                <SettingsField label="Senha inicial" required>
                                    <input type="password" autoComplete="new-password" required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
                                </SettingsField>
                            </div>
                            <div className="settings-checks">
                                <h4>Roles disponíveis</h4>
                                {roles.map((role) => (
                                    <label key={role.id}>
                                        <input
                                            type="checkbox"
                                            checked={newRoles.includes(role.id)}
                                            onChange={(event) => setNewRoles((current) => event.target.checked
                                                ? [...current, role.id]
                                                : current.filter((id) => id !== role.id))}
                                        />
                                        <span>{role.name} · level {role.level}</span>
                                    </label>
                                ))}
                            </div>
                        </>
                    ) : selected ? (
                        <>
                            <h3>{selected.email}</h3>
                            {isSelf && <p className="settings-users__notice">Use Usuário / Perfil para atualizar seus dados. Suas roles e seu status não podem ser modificados nesta tela.</p>}
                            <label className="settings-users__toggle">
                                <input type="checkbox" checked={isActive} disabled={isSelf} onChange={(event) => setIsActive(event.target.checked)} />
                                <span>Conta ativa</span>
                            </label>
                            <div className="settings-checks">
                                <h4>Roles disponíveis</h4>
                                {roles.map((role) => (
                                    <label key={role.id}>
                                        <input
                                            type="checkbox"
                                            checked={selectedRoles.includes(role.id)}
                                            disabled={isSelf}
                                            onChange={(event) => setSelectedRoles((current) => event.target.checked
                                                ? [...current, role.id]
                                                : current.filter((id) => id !== role.id))}
                                        />
                                        <span>{role.name} · level {role.level}</span>
                                    </label>
                                ))}
                            </div>
                        </>
                    ) : <p>Selecione um usuário para editar.</p>}

                    <SettingsActions>
                        {isCreating && (
                            <button className="settings__button settings__button--cancel" type="button" onClick={() => setIsCreating(false)}>
                                Cancelar
                            </button>
                        )}
                        <button className="settings__button settings__button--save" type="submit" disabled={isSaving || (!isCreating && (!selected || isSelf))}>
                            {isSaving ? "Salvando..." : isCreating ? "Criar usuário" : "Salvar acesso"}
                        </button>
                    </SettingsActions>
                </form>
            </div>
        </section>
    );
}
