import { useCallback, useEffect, useRef, useState } from "react";
import {
    getRoles,
    getSystemConfig,
    saveSystemConfig,
    downloadSystemDatabase,
    importSystemDatabase
} from "@/data/api/settings";
import { SettingsSectionHeading } from "./common";

export default function SystemSection() {
    const [pixKey, setPixKey] = useState("");
    const [roles, setRoles] = useState([]);
    const [selectedRoleIds, setSelectedRoleIds] = useState([]);
    const [roleName, setRoleName] = useState("");
    const [roleLevel, setRoleLevel] = useState("1");

    const [unitMeasure, setUnitMeasure] = useState({
        unity: "",
        description: ""
    });

    const [loading, setLoading] = useState(true);
    const [savingPix, setSavingPix] = useState(false);
    const [savingRoles, setSavingRoles] = useState(false);
    const [savingUnit, setSavingUnit] = useState(false);

    const [databaseFile, setDatabaseFile] = useState(null);
    const [downloadingDatabase, setDownloadingDatabase] = useState(false);
    const [importingDatabase, setImportingDatabase] = useState(false);

    const databaseInputRef = useRef(null);

    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const loadSettings = useCallback(async () => {
        setLoading(true);
        setError("");

        try {
            const [configResult, rolesResult] = await Promise.all([
                getSystemConfig(),
                getRoles()
            ]);

            const config = Array.isArray(configResult)
                ? configResult[0]
                : configResult;

            setPixKey(String(config?.pixKey ?? config?.pix_key ?? ""));

            setUnitMeasure({
                unity: config?.unit_measure?.unity ?? "",
                description: config?.unit_measure?.description ?? ""
            });

            setRoles((rolesResult || []).filter(
                (role) =>
                    role.status === undefined ||
                    role.status === true ||
                    role.status === 1
            ));
        } catch (reason) {
            setError(
                reason instanceof Error
                    ? reason.message
                    : "Não foi possível carregar as configurações."
            );
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadSettings();
    }, [loadSettings]);

    function showSuccess(message) {
        setError("");
        setSuccess(message);
    }

    async function savePixKey(event) {
        event.preventDefault();
        setSavingPix(true);
        setError("");
        setSuccess("");

        try {
            await saveSystemConfig({ pixKey: pixKey.trim() });
            showSuccess("Chave PIX salva com sucesso.");
        } catch (reason) {
            setError(
                reason instanceof Error
                    ? reason.message
                    : "Não foi possível salvar a chave PIX."
            );
        } finally {
            setSavingPix(false);
        }
    }

    function toggleRole(id) {
        setSelectedRoleIds((current) =>
            current.includes(id)
                ? current.filter((selectedId) => selectedId !== id)
                : [...current, id]
        );
    }

    async function addRole(event) {
        event.preventDefault();

        const name = roleName.trim();
        const level = Number(roleLevel);

        if (!name) {
            setError("Informe o nome do perfil.");
            return;
        }

        if (!Number.isSafeInteger(level) || level < 0) {
            setError("O nível deve ser um número inteiro não negativo.");
            return;
        }

        if (
            roles.some(
                (role) => role.name.trim().toLowerCase() === name.toLowerCase()
            )
        ) {
            setError("Já existe um perfil com esse nome.");
            return;
        }

        setSavingRoles(true);
        setError("");
        setSuccess("");

        try {
            await saveSystemConfig({
                roles: [
                    {
                        name,
                        level,
                        status: 1
                    }
                ]
            });

            setRoleName("");
            setRoleLevel("1");
            setSelectedRoleIds([]);

            await loadSettings();
            showSuccess("Perfil adicionado com sucesso.");
        } catch (reason) {
            setError(
                reason instanceof Error
                    ? reason.message
                    : "Não foi possível adicionar o perfil."
            );
        } finally {
            setSavingRoles(false);
        }
    }

    async function disableSelectedRoles() {
        const selectedRoles = roles.filter((role) =>
            selectedRoleIds.includes(role.id)
        );

        if (!selectedRoles.length) return;

        const confirmed = window.confirm(
            `Deseja desativar ${selectedRoles.length} perfil(is) selecionado(s)?`
        );

        if (!confirmed) return;

        setSavingRoles(true);
        setError("");
        setSuccess("");

        try {
            await saveSystemConfig({
                roles: selectedRoles.map((role) => ({
                    id: role.id,
                    name: role.name,
                    level: role.level,
                    status: 0
                }))
            });

            setRoles((current) =>
                current.filter(
                    (role) => !selectedRoleIds.includes(role.id)
                )
            );

            setSelectedRoleIds([]);
            showSuccess("Perfis selecionados desativados com sucesso.");
        } catch (reason) {
            setError(
                reason instanceof Error
                    ? reason.message
                    : "Não foi possível desativar os perfis."
            );
        } finally {
            setSavingRoles(false);
        }
    }

    async function saveUnitMeasure(event) {
        event.preventDefault();

        const unity = unitMeasure.unity.trim();
        const description = unitMeasure.description?.trim() ?? "";

        if (!unity) {
            setError("Informe a nomenclatura da unidade de medida.");
            return;
        }

        setSavingUnit(true);
        setError("");
        setSuccess("");

        try {
            await saveSystemConfig({
                unit_measure: {
                    unity,
                    description
                }
            });

            setUnitMeasure({ unity, description });
            showSuccess("Unidade de medida salva com sucesso.");
        } catch (reason) {
            setError(
                reason instanceof Error
                    ? reason.message
                    : "Não foi possível salvar a unidade de medida."
            );
        } finally {
            setSavingUnit(false);
        }
    }

    /* ---------------------------------------------------------------------- */
    /* BACKUP DO BANCO DE DADOS                                               */
    /* ---------------------------------------------------------------------- */

    async function exportDatabase() {
        setDownloadingDatabase(true);
        setError("");
        setSuccess("");

        try {
            await downloadSystemDatabase();

            showSuccess(
                "O download do backup do banco de dados foi iniciado."
            );
        } catch (reason) {
            setError(
                reason instanceof Error
                    ? reason.message
                    : "Não foi possível baixar o banco de dados."
            );
        } finally {
            setDownloadingDatabase(false);
        }
    }

    function handleDatabaseFileChange(event) {
        const file = event.target.files?.[0] ?? null;

        setError("");
        setSuccess("");

        if (!file) {
            setDatabaseFile(null);
            return;
        }

        if (file.size === 0) {
            setDatabaseFile(null);
            event.target.value = "";
            setError("O arquivo selecionado está vazio.");
            return;
        }

        const maxSize = 512 * 1024 * 1024;

        if (file.size > maxSize) {
            setDatabaseFile(null);
            event.target.value = "";
            setError("O arquivo deve ter no máximo 512 MB.");
            return;
        }

        setDatabaseFile(file);
    }

    async function importDatabase(event) {
        event.preventDefault();

        if (!databaseFile) {
            setError("Selecione um arquivo SQLite para importar.");
            return;
        }

        const confirmed = window.confirm(
            "ATENÇÃO: a importação substituirá os dados atuais do sistema " +
            "pelos dados do arquivo selecionado. Essa operação pode afetar " +
            "usuários, configurações, produtos e vendas.\n\n" +
            "Recomendamos baixar um backup antes de continuar.\n\n" +
            "Deseja realmente importar este banco de dados?"
        );

        if (!confirmed) return;

        setImportingDatabase(true);
        setError("");
        setSuccess("");

        try {
            const result = await importSystemDatabase(databaseFile);

            setDatabaseFile(null);

            if (databaseInputRef.current) {
                databaseInputRef.current.value = "";
            }

            showSuccess(
                `Banco importado com sucesso. ` +
                `${result.tablesImported} tabela(s) processada(s). ` +
                "Recarregue a aplicação para atualizar os dados exibidos."
            );
        } catch (reason) {
            setError(
                reason instanceof Error
                    ? reason.message
                    : "Não foi possível importar o banco de dados."
            );
        } finally {
            setImportingDatabase(false);
        }
    }

    const databaseOperationInProgress =
        downloadingDatabase || importingDatabase;

    return (
        <section className="settings-form system-section">
            <style>{`
                .system-section {
                    width: 100%;
                    min-width: 0;
                    display: flex;
                    flex-direction: column;
                    gap: 22px;
                }

                .system-section *,
                .system-section *::before,
                .system-section *::after {
                    box-sizing: border-box;
                }

                .system-section__card {
                    width: 100%;
                    min-width: 0;
                    padding: 22px;
                    border: 1px solid var(--settings-border, #dedede);
                    border-radius: 12px;
                    background: var(--settings-card-bg, #fff);
                }

                .system-section__card h3 {
                    margin: 0 0 8px;
                    font-size: 1.05rem;
                    line-height: 1.4;
                }

                .system-section__description {
                    margin: 0 0 20px;
                    color: var(--settings-muted, #687078);
                    font-size: 0.9rem;
                    line-height: 1.5;
                }

                .system-section__form {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    min-width: 0;
                }

                .system-section__label {
                    font-size: 0.9rem;
                    font-weight: 600;
                }

                .system-section__input,
                .system-section__textarea {
                    width: 100%;
                    min-width: 0;
                    padding: 12px 14px;
                    border: 1px solid var(--settings-border, #cfd4d8);
                    border-radius: 8px;
                    background: var(--settings-input-bg, #fff);
                    color: var(--settings-text, #20252a);
                    font: inherit;
                    font-size: 0.95rem;
                    outline: none;
                    transition: border-color 0.2s, box-shadow 0.2s;
                }

                .system-section__input:focus,
                .system-section__textarea:focus {
                    border-color: var(--settings-accent, #3478f6);
                    box-shadow: 0 0 0 3px rgba(52, 120, 246, 0.12);
                }

                .system-section__textarea {
                    min-height: 100px;
                    resize: vertical;
                }

                .system-section__actions {
                    display: flex;
                    flex-wrap: wrap;
                    align-items: center;
                    gap: 10px;
                    margin-top: 8px;
                }

                .system-section__button {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 42px;
                    padding: 10px 16px;
                    border: 1px solid transparent;
                    border-radius: 8px;
                    background: var(--settings-accent, #3478f6);
                    color: #fff;
                    font: inherit;
                    font-size: 0.9rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: opacity 0.2s, background 0.2s;
                }

                .system-section__button:hover:not(:disabled) {
                    opacity: 0.88;
                }

                .system-section__button:disabled {
                    opacity: 0.45;
                    cursor: not-allowed;
                }

                .system-section__button--secondary {
                    border-color: var(--settings-border, #cfd4d8);
                    background: transparent;
                    color: var(--settings-text, #20252a);
                }

                .system-section__button--danger {
                    background: #c93434;
                }

                .system-section__roles {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    margin: 0;
                    padding: 0;
                    list-style: none;
                }

                .system-section__role {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    min-width: 0;
                    padding: 13px 14px;
                    border: 1px solid var(--settings-border, #dedede);
                    border-radius: 8px;
                    cursor: pointer;
                }

                .system-section__role input {
                    flex: 0 0 auto;
                    width: 18px;
                    height: 18px;
                    margin: 0;
                    accent-color: var(--settings-accent, #3478f6);
                }

                .system-section__role-info {
                    display: flex;
                    flex: 1;
                    flex-wrap: wrap;
                    align-items: center;
                    justify-content: space-between;
                    gap: 6px 12px;
                    min-width: 0;
                }

                .system-section__role-name {
                    overflow-wrap: anywhere;
                    font-weight: 600;
                }

                .system-section__role-level {
                    color: var(--settings-muted, #687078);
                    font-size: 0.82rem;
                }

                .system-section__add-role {
                    display: grid;
                    grid-template-columns: minmax(0, 1fr) 110px;
                    gap: 12px;
                    margin-top: 22px;
                }

                .system-section__add-role .system-section__form:first-child {
                    grid-column: 1 / -1;
                }

                .system-section__add-role .system-section__actions {
                    grid-column: 1 / -1;
                }

                .system-section__notice {
                    margin: 0 0 14px;
                    padding: 11px 13px;
                    border-radius: 8px;
                    font-size: 0.9rem;
                    line-height: 1.5;
                    overflow-wrap: anywhere;
                }

                .system-section__notice--error {
                    border: 1px solid #efb6b6;
                    background: #fff0f0;
                    color: #9b2424;
                }

                .system-section__notice--success {
                    border: 1px solid #a9dfb4;
                    background: #effaf1;
                    color: #206b31;
                }

                .system-section__empty {
                    padding: 16px;
                    border: 1px dashed var(--settings-border, #cfd4d8);
                    border-radius: 8px;
                    color: var(--settings-muted, #687078);
                    font-size: 0.9rem;
                    text-align: center;
                }

                .system-section__hint {
                    margin: 10px 0 0;
                    color: var(--settings-muted, #687078);
                    font-size: 0.8rem;
                    line-height: 1.5;
                }

                .system-section__database-file {
                    display: block;
                    width: 100%;
                    min-width: 0;
                    padding: 12px;
                    border: 1px dashed var(--settings-border, #cfd4d8);
                    border-radius: 8px;
                    background: var(--settings-input-bg, #fff);
                    color: var(--settings-text, #20252a);
                    font: inherit;
                    font-size: 0.9rem;
                }

                .system-section__database-file::file-selector-button {
                    margin-right: 12px;
                    padding: 8px 12px;
                    border: 1px solid var(--settings-border, #cfd4d8);
                    border-radius: 6px;
                    background: transparent;
                    color: inherit;
                    font: inherit;
                    cursor: pointer;
                }

                .system-section__database-info {
                    display: flex;
                    flex-direction: column;
                    gap: 5px;
                    min-width: 0;
                    margin-top: 12px;
                    padding: 12px;
                    border-radius: 8px;
                    background: var(--settings-input-bg, #f7f7f7);
                    overflow-wrap: anywhere;
                }

                .system-section__database-info strong {
                    font-size: 0.9rem;
                }

                .system-section__database-info span {
                    color: var(--settings-muted, #687078);
                    font-size: 0.82rem;
                    line-height: 1.5;
                }

                .system-section__database-warning {
                    margin: 14px 0 0;
                    padding: 12px;
                    border: 1px solid #e6c779;
                    border-radius: 8px;
                    background: #fff8e5;
                    color: #664d03;
                    font-size: 0.85rem;
                    line-height: 1.5;
                }

                @media (max-width: 600px) {
                    .system-section {
                        gap: 14px;
                    }

                    .system-section__card {
                        padding: 16px;
                    }

                    .system-section__add-role {
                        grid-template-columns: minmax(0, 1fr);
                    }

                    .system-section__add-role .system-section__form:first-child,
                    .system-section__add-role .system-section__actions {
                        grid-column: auto;
                    }

                    .system-section__actions {
                        display: grid;
                        grid-template-columns: repeat(2, minmax(0, 1fr));
                    }

                    .system-section__button {
                        width: 100%;
                        padding-inline: 10px;
                    }
                }

                @media (max-width: 360px) {
                    .system-section__card {
                        padding: 12px;
                    }

                    .system-section__actions {
                        grid-template-columns: minmax(0, 1fr);
                    }

                    .system-section__role {
                        padding: 11px;
                    }
                }
            `}</style>

            <SettingsSectionHeading
                title="Funcionamento do sistema"
                description="Gerencie a chave PIX, os perfis de acesso e a unidade de medida."
            />

            {error && (
                <p
                    className="system-section__notice system-section__notice--error"
                    role="alert"
                >
                    {error}
                </p>
            )}

            {success && (
                <p
                    className="system-section__notice system-section__notice--success"
                    role="status"
                >
                    {success}
                </p>
            )}

            {loading ? (
                <div className="system-section__card" role="status">
                    Carregando configurações...
                </div>
            ) : (
                <>
                    {/* CHAVE PIX */}
                    <section className="system-section__card">
                        <h3>Chave PIX</h3>

                        <p className="system-section__description">
                            Configure a chave PIX utilizada para receber
                            pagamentos. Esta opção é salva separadamente.
                        </p>

                        <form
                            className="system-section__form"
                            onSubmit={savePixKey}
                        >
                            <label
                                className="system-section__label"
                                htmlFor="system-pix-key"
                            >
                                Chave PIX
                            </label>

                            <input
                                id="system-pix-key"
                                className="system-section__input"
                                type="text"
                                autoComplete="off"
                                placeholder="Ex.: email@empresa.com"
                                value={pixKey}
                                onChange={(event) =>
                                    setPixKey(event.target.value)
                                }
                            />

                            <div className="system-section__actions">
                                <button
                                    className="system-section__button"
                                    type="submit"
                                    disabled={savingPix}
                                >
                                    {savingPix
                                        ? "Salvando..."
                                        : "Salvar chave PIX"}
                                </button>
                            </div>
                        </form>
                    </section>

                    {/* PERFIS DE ACESSO */}
                    <section className="system-section__card">
                        <h3>Perfis de acesso</h3>

                        <p className="system-section__description">
                            Selecione os perfis para desativá-los ou cadastre
                            um novo perfil com seu respectivo nível de acesso.
                        </p>

                        {roles.length > 0 ? (
                            <ul className="system-section__roles">
                                {roles.map((role) => (
                                    <li key={role.id}>
                                        <label className="system-section__role">
                                            <input
                                                type="checkbox"
                                                checked={selectedRoleIds.includes(
                                                    role.id
                                                )}
                                                onChange={() =>
                                                    toggleRole(role.id)
                                                }
                                                disabled={savingRoles}
                                            />

                                            <span className="system-section__role-info">
                                                <span className="system-section__role-name">
                                                    {role.name}
                                                </span>

                                                <span className="system-section__role-level">
                                                    Nível {role.level}
                                                </span>
                                            </span>
                                        </label>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="system-section__empty">
                                Nenhum perfil ativo encontrado.
                            </p>
                        )}

                        <div className="system-section__actions">
                            <button
                                className="system-section__button system-section__button--danger"
                                type="button"
                                disabled={
                                    selectedRoleIds.length === 0 || savingRoles
                                }
                                onClick={disableSelectedRoles}
                            >
                                {savingRoles
                                    ? "Processando..."
                                    : `Excluir selecionados (${selectedRoleIds.length})`}
                            </button>
                        </div>

                        <p className="system-section__hint">
                            A exclusão nesta tela desativa o perfil, alterando
                            seu status para inativo. Não remove o registro do
                            banco de dados.
                        </p>

                        <form
                            className="system-section__add-role"
                            onSubmit={addRole}
                        >
                            <div className="system-section__form">
                                <label
                                    className="system-section__label"
                                    htmlFor="system-role-name"
                                >
                                    Nome do novo perfil
                                </label>

                                <input
                                    id="system-role-name"
                                    className="system-section__input"
                                    type="text"
                                    placeholder="Ex.: Estoquista"
                                    value={roleName}
                                    onChange={(event) =>
                                        setRoleName(event.target.value)
                                    }
                                    maxLength={100}
                                    required
                                    disabled={savingRoles}
                                />
                            </div>

                            <div className="system-section__form">
                                <label
                                    className="system-section__label"
                                    htmlFor="system-role-level"
                                >
                                    Nível
                                </label>

                                <input
                                    id="system-role-level"
                                    className="system-section__input"
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={roleLevel}
                                    onChange={(event) =>
                                        setRoleLevel(event.target.value)
                                    }
                                    required
                                    disabled={savingRoles}
                                />
                            </div>

                            <div className="system-section__actions">
                                <button
                                    className="system-section__button"
                                    type="submit"
                                    disabled={
                                        savingRoles || !roleName.trim()
                                    }
                                >
                                    {savingRoles
                                        ? "Salvando..."
                                        : "Adicionar perfil"}
                                </button>
                            </div>
                        </form>
                    </section>

                    {/* UNIDADE DE MEDIDA */}
                    <section className="system-section__card">
                        <h3>Unidade de medida</h3>

                        <p className="system-section__description">
                            Defina a unidade padrão utilizada nos produtos,
                            como UN, KG, L ou M.
                        </p>

                        <form
                            className="system-section__form"
                            onSubmit={saveUnitMeasure}
                        >
                            <label
                                className="system-section__label"
                                htmlFor="system-unit-name"
                            >
                                Nomenclatura da unidade
                            </label>

                            <input
                                id="system-unit-name"
                                className="system-section__input"
                                type="text"
                                placeholder="Ex.: kg"
                                value={unitMeasure.unity}
                                onChange={(event) =>
                                    setUnitMeasure((current) => ({
                                        ...current,
                                        unity: event.target.value
                                    }))
                                }
                                maxLength={20}
                                required
                                disabled={savingUnit}
                            />

                            <label
                                className="system-section__label"
                                htmlFor="system-unit-description"
                            >
                                Descrição
                            </label>

                            <textarea
                                id="system-unit-description"
                                className="system-section__textarea"
                                placeholder="Ex.: Quilogramas"
                                value={unitMeasure.description ?? ""}
                                onChange={(event) =>
                                    setUnitMeasure((current) => ({
                                        ...current,
                                        description: event.target.value
                                    }))
                                }
                                maxLength={500}
                                disabled={savingUnit}
                            />

                            <div className="system-section__actions">
                                <button
                                    className="system-section__button"
                                    type="submit"
                                    disabled={
                                        savingUnit ||
                                        !unitMeasure.unity.trim()
                                    }
                                >
                                    {savingUnit
                                        ? "Salvando..."
                                        : "Salvar unidade"}
                                </button>
                            </div>
                        </form>
                    </section>
                </>
            )}

            {/* BACKUP E RESTAURAÇÃO DO BANCO DE DADOS */}
            <section className="system-section__card">
                <h3>Banco de dados</h3>

                <p className="system-section__description">
                    Exporte uma cópia do banco de dados SQLite ou importe
                    um arquivo de backup para restaurar os dados do sistema.
                </p>

                {/* EXPORTAR */}
                <div className="system-section__form">
                    <h4>Exportar banco de dados</h4>

                    <p className="system-section__hint">
                        Baixa um snapshot do banco de dados atual para o seu
                        computador. Guarde o arquivo em um local seguro.
                    </p>

                    <div className="system-section__actions">
                        <button
                            className="system-section__button system-section__button--secondary"
                            type="button"
                            onClick={exportDatabase}
                            disabled={
                                databaseOperationInProgress || loading
                            }
                        >
                            {downloadingDatabase
                                ? "Preparando download..."
                                : "Exportar banco de dados"}
                        </button>
                    </div>
                </div>

                <div
                    style={{
                        borderTop: "1px solid var(--settings-border, #dedede)",
                        margin: "22px 0"
                    }}
                />

                {/* IMPORTAR */}
                <form
                    className="system-section__form"
                    onSubmit={importDatabase}
                >
                    <h4>Importar banco de dados</h4>

                    <p className="system-section__hint">
                        Selecione um backup SQLite salvo anteriormente.
                        O arquivo será validado pelo backend antes da
                        substituição do banco atual.
                    </p>

                    <label
                        className="system-section__label"
                        htmlFor="system-database-file"
                    >
                        Arquivo SQLite
                    </label>

                    <input
                        ref={databaseInputRef}
                        id="system-database-file"
                        className="system-section__database-file"
                        type="file"
                        accept=".sqlite,.sqlite3,.db,application/vnd.sqlite3"
                        onChange={handleDatabaseFileChange}
                        disabled={databaseOperationInProgress}
                    />

                    {databaseFile && (
                        <div className="system-section__database-info">
                            <strong>{databaseFile.name}</strong>

                            <span>
                                Tamanho:{" "}
                                {(
                                    databaseFile.size /
                                    (1024 * 1024)
                                ).toLocaleString("pt-BR", {
                                    maximumFractionDigits: 2
                                })}{" "}
                                MB
                            </span>
                        </div>
                    )}

                    <p className="system-section__hint">
                        Limite de tamanho: 512 MB. O arquivo precisa ser
                        compatível com o esquema de banco de dados desta
                        versão do sistema.
                    </p>

                    <div className="system-section__database-warning">
                        <strong>Atenção:</strong> importar um backup
                        substituirá os dados atuais. Faça uma exportação
                        antes de continuar e não feche a página enquanto
                        a importação estiver sendo processada.
                    </div>

                    <div className="system-section__actions">
                        <button
                            className="system-section__button system-section__button--danger"
                            type="submit"
                            disabled={
                                !databaseFile ||
                                databaseOperationInProgress ||
                                loading
                            }
                        >
                            {importingDatabase
                                ? "Importando banco..."
                                : "Importar banco de dados"}
                        </button>

                        <button
                            className="system-section__button system-section__button--secondary"
                            type="button"
                            disabled={
                                !databaseFile ||
                                databaseOperationInProgress
                            }
                            onClick={() => {
                                setDatabaseFile(null);

                                if (databaseInputRef.current) {
                                    databaseInputRef.current.value = "";
                                }

                                setError("");
                                setSuccess("");
                            }}
                        >
                            Limpar arquivo
                        </button>
                    </div>
                </form>
            </section>
        </section>
    );
}