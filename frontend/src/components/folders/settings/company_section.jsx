import { useEffect, useState } from "react";

import { saveCompany } from "@/data/api/settings";
import { SettingsActions, SettingsFeedback, SettingsField, SettingsSectionHeading } from "./common";
import { regimeOptions } from "./constants";

const blankCompany = {
    cnpj: "",
    legal_name: "",
    trade_name: "",
    state_registration: "",
    municipal_registration: "",
    tax_regime: "SIMPLES_NACIONAL",
    address: "",
    number: "",
    complement: "",
    neighborhood: "",
    city: "",
    city_ibge: "",
    state: "",
    zip_code: "",
    boss_user_id: ""
};

export default function CompanySection({ companyData, users = [], onSaved }) {
    const [form, setForm] = useState(blankCompany);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    useEffect(() => {
        setForm({
            ...blankCompany,
            ...(companyData ?? {}),
            boss_user_id: companyData?.boss_user_id == null ? "" : String(companyData.boss_user_id)
        });
    }, [companyData]);

    function change(field, value) {
        setForm((current) => ({ ...current, [field]: value }));
    }

    async function handleSubmit(event) {
        event.preventDefault();
        if (isSaving) return;
        setIsSaving(true);
        setError("");
        setSuccess("");

        try {
            const saved = await saveCompany({
                ...form,
                boss_user_id: Number(form.boss_user_id)
            });
            setForm({
                ...blankCompany,
                ...saved,
                boss_user_id: saved.boss_user_id == null ? "" : String(saved.boss_user_id)
            });
            onSaved?.(saved);
            setSuccess("Dados da empresa salvos.");
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Não foi possível salvar os dados da empresa.");
        } finally {
            setIsSaving(false);
        }
    }

    const chief = users.find((item) => String(item.id) === String(form.boss_user_id));

    return (
        <form className="settings-form" onSubmit={handleSubmit}>
            <SettingsSectionHeading
                title="Empresa"
                description="Dados críticos usados nos documentos fiscais. Campos com * são obrigatórios."
            />
            <SettingsFeedback error={error} success={success} />

            <div className="settings-form__grid">
                <SettingsField label="CNPJ" required>
                    <input required autoComplete="off" value={form.cnpj} onChange={(event) => change("cnpj", event.target.value)} />
                </SettingsField>
                <SettingsField label="Razão social" required>
                    <input required maxLength={180} value={form.legal_name} onChange={(event) => change("legal_name", event.target.value)} />
                </SettingsField>
                <SettingsField label="Nome fantasia">
                    <input maxLength={180} value={form.trade_name ?? ""} onChange={(event) => change("trade_name", event.target.value)} />
                </SettingsField>
                <SettingsField label="Inscrição estadual" required>
                    <input required value={form.state_registration} onChange={(event) => change("state_registration", event.target.value)} />
                </SettingsField>
                <SettingsField label="Inscrição municipal">
                    <input value={form.municipal_registration ?? ""} onChange={(event) => change("municipal_registration", event.target.value)} />
                </SettingsField>
                <SettingsField label="Regime tributário" required>
                    <select required value={form.tax_regime} onChange={(event) => change("tax_regime", event.target.value)}>
                        {regimeOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                </SettingsField>
                <SettingsField label="Endereço" required>
                    <input required value={form.address} onChange={(event) => change("address", event.target.value)} />
                </SettingsField>
                <SettingsField label="Número" required>
                    <input required value={form.number} onChange={(event) => change("number", event.target.value)} />
                </SettingsField>
                <SettingsField label="Complemento">
                    <input value={form.complement ?? ""} onChange={(event) => change("complement", event.target.value)} />
                </SettingsField>
                <SettingsField label="Bairro" required>
                    <input required value={form.neighborhood} onChange={(event) => change("neighborhood", event.target.value)} />
                </SettingsField>
                <SettingsField label="Cidade" required>
                    <input required value={form.city} onChange={(event) => change("city", event.target.value)} />
                </SettingsField>
                <SettingsField label="Código IBGE da cidade" required>
                    <input inputMode="numeric" required maxLength={7} value={form.city_ibge} onChange={(event) => change("city_ibge", event.target.value.replace(/\D/g, "").slice(0, 7))} />
                </SettingsField>
                <SettingsField label="Estado (UF)" required>
                    <input required minLength={2} maxLength={2} value={form.state} onChange={(event) => change("state", event.target.value.toUpperCase())} />
                </SettingsField>
                <SettingsField label="CEP" required>
                    <input inputMode="numeric" required value={form.zip_code} onChange={(event) => change("zip_code", event.target.value)} />
                </SettingsField>
                <SettingsField label="Usuário-chefe da empresa" required className="settings__field--wide">
                    <select required value={form.boss_user_id} onChange={(event) => change("boss_user_id", event.target.value)}>
                        <option value="">Selecione um usuário existente</option>
                        {users.map((item) => (
                            <option key={item.id} value={item.id}>
                                {item.email}{!item.status ? " · inativo" : ""}
                            </option>
                        ))}
                    </select>
                </SettingsField>
            </div>

            <div className="settings-info-card">
                <strong>Usuário-chefe vinculado</strong>
                <p>{chief?.email ?? "Selecione um usuário existente."}</p>
                <span>Esse vínculo identifica o responsável da empresa e não altera as roles nem as permissões do usuário.</span>
            </div>

            <SettingsActions>
                <button className="settings__button settings__button--save" type="submit" disabled={isSaving}>
                    {isSaving ? "Salvando..." : "Salvar empresa"}
                </button>
            </SettingsActions>
        </form>
    );
}
