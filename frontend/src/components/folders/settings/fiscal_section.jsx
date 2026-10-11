import { useEffect, useState } from "react";

import { saveFiscalSettings } from "@/data/api/settings";
import { SettingsActions, SettingsFeedback, SettingsField, SettingsSectionHeading } from "./common";
import { regimeOptions } from "./constants";

const operationOptions = [
    "Venda de Mercadoria",
    "Devolução de Mercadoria",
    "Transferência de Mercadoria",
    "Remessa de Mercadoria",
    "Outra"
];

const blankFiscal = {
    tax_regime: "SIMPLES_NACIONAL",
    cfop_default: "5102",
    ncm_default: "",
    nat_op_default: "Venda de Mercadoria",
    ibs: "0",
    cbs: "0"
};

export default function FiscalSection({ fiscalData, hasCompany, onSaved }) {
    const [form, setForm] = useState(blankFiscal);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    useEffect(() => {
        setForm({
            ...blankFiscal,
            ...(fiscalData ?? {}),
            ibs: String(fiscalData?.ibs ?? 0),
            cbs: String(fiscalData?.cbs ?? 0)
        });
    }, [fiscalData]);

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
            const saved = await saveFiscalSettings({
                ...form,
                ibs: Number(form.ibs),
                cbs: Number(form.cbs)
            });
            setForm({
                ...blankFiscal,
                ...saved,
                ibs: String(saved.ibs ?? 0),
                cbs: String(saved.cbs ?? 0)
            });
            onSaved?.(saved);
            setSuccess("Configuração fiscal salva.");
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Não foi possível salvar a configuração fiscal.");
        } finally {
            setIsSaving(false);
        }
    }

    const operation = operationOptions.includes(form.nat_op_default)
        ? form.nat_op_default
        : "Outra";

    return (
        <form className="settings-form" onSubmit={handleSubmit}>
            <SettingsSectionHeading
                title="Configuração Fiscal"
                description="Parâmetros padrão para novas operações fiscais."
            />
            <SettingsFeedback error={error} success={success} />

            {!hasCompany ? (
                <div className="settings-info-card">
                    <strong>Cadastre os dados da empresa antes de configurar os parâmetros fiscais.</strong>
                </div>
            ) : (
                <>
                    <div className="settings-form__grid">
                        <SettingsField label="Regime tributário" required>
                            <select required value={form.tax_regime} onChange={(event) => change("tax_regime", event.target.value)}>
                                {regimeOptions.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
                            </select>
                        </SettingsField>
                        <SettingsField label="CFOP padrão de revenda nacional" required>
                            <input inputMode="numeric" pattern="[0-9]{4}" maxLength={4} required value={form.cfop_default} onChange={(event) => change("cfop_default", event.target.value.replace(/\D/g, "").slice(0, 4))} />
                        </SettingsField>
                        <SettingsField label="NCM padrão para produto sem NCM próprio" required>
                            <input inputMode="numeric" pattern="[0-9]{8}" maxLength={8} required value={form.ncm_default} onChange={(event) => change("ncm_default", event.target.value.replace(/\D/g, "").slice(0, 8))} />
                        </SettingsField>
                        <SettingsField label="Natureza da operação" required>
                            <select required value={operation} onChange={(event) => change("nat_op_default", event.target.value === "Outra" ? "" : event.target.value)}>
                                {operationOptions.map((item) => <option value={item} key={item}>{item}</option>)}
                            </select>
                        </SettingsField>
                        {operation === "Outra" && (
                            <SettingsField label="Outra natureza da operação" required>
                                <input required maxLength={120} value={form.nat_op_default === "Outra" ? "" : form.nat_op_default} onChange={(event) => change("nat_op_default", event.target.value)} />
                            </SettingsField>
                        )}
                        <SettingsField label="IBS (%)">
                            <input type="number" min="0" max="100" step="0.01" value={form.ibs} onChange={(event) => change("ibs", event.target.value)} />
                        </SettingsField>
                        <SettingsField label="CBS (%)">
                            <input type="number" min="0" max="100" step="0.01" value={form.cbs} onChange={(event) => change("cbs", event.target.value)} />
                        </SettingsField>
                    </div>

                    <div className="settings-info-card settings-info-card--fiscal">
                        <strong>Tributação dos produtos</strong>
                        {form.tax_regime === "REGIME_NORMAL" ? (
                            <p>No Regime Normal, CST, CSOSN e ICMS são obrigatórios em cada produto. Informe esses campos na edição do produto.</p>
                        ) : (
                            <p>Fora do Regime Normal, o backend grava CST = 0, CSOSN = 0 e ICMS = 0 nos produtos.</p>
                        )}
                    </div>

                    <SettingsActions>
                        <button className="settings__button settings__button--save" type="submit" disabled={isSaving}>
                            {isSaving ? "Salvando..." : "Salvar configuração fiscal"}
                        </button>
                    </SettingsActions>
                </>
            )}
        </form>
    );
}
