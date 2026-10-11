import { useEffect, useState } from "react";

import { removeCertificate, saveCertificate, setCertificateActive } from "@/data/api/settings";
import { SettingsActions, SettingsFeedback, SettingsField, SettingsSectionHeading } from "./common";

function toDateInput(value) {
    return value ? String(value).slice(0, 10) : "";
}

function readFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Não foi possível ler o certificado."));
        reader.onload = () => {
            const value = String(reader.result ?? "");
            const separator = value.indexOf(",");
            if (separator < 0) {
                reject(new Error("Arquivo de certificado inválido."));
                return;
            }
            resolve(value.slice(separator + 1));
        };
        reader.readAsDataURL(file);
    });
}

const emptyCertificate = {
    exists: false,
    status: false,
    valid_from: null,
    valid_until: null,
    is_valid: false
};

export default function CertificateSection({ certificateData, onSaved }) {
    const [certificate, setCertificate] = useState(emptyCertificate);
    const [file, setFile] = useState(null);
    const [password, setPassword] = useState("");
    const [validFrom, setValidFrom] = useState("");
    const [validUntil, setValidUntil] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    useEffect(() => {
        const next = certificateData ?? emptyCertificate;
        setCertificate(next);
        setValidFrom(toDateInput(next.valid_from));
        setValidUntil(toDateInput(next.valid_until));
    }, [certificateData]);

    async function handleSubmit(event) {
        event.preventDefault();
        if (isSaving) return;
        if (!file) {
            setError("Selecione um arquivo PFX ou P12.");
            setSuccess("");
            return;
        }
        if (!password) {
            setError("Informe a senha do certificado.");
            setSuccess("");
            return;
        }

        setIsSaving(true);
        setError("");
        setSuccess("");

        try {
            const saved = await saveCertificate({
                certificate: file,
                password,
                valid_from: validFrom,
                valid_until: validUntil
            });
            setCertificate(saved);
            onSaved?.(saved);
            setFile(null);
            setPassword("");
            setSuccess("Certificado salvo com a senha protegida.");
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Não foi possível salvar o certificado.");
        } finally {
            setIsSaving(false);
        }
    }

    async function toggleStatus() {
        if (isSaving) return;
        setIsSaving(true);
        setError("");
        setSuccess("");
        try {
            const saved = await setCertificateActive(!certificate.status);
            setCertificate(saved);
            onSaved?.(saved);
            setSuccess(saved.status ? "Certificado ativado." : "Certificado inativado.");
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Não foi possível alterar o status do certificado.");
        } finally {
            setIsSaving(false);
        }
    }

    async function handleRemove() {
        if (isSaving || !window.confirm("Remover o certificado e a senha armazenados?")) return;
        setIsSaving(true);
        setError("");
        setSuccess("");
        try {
            await removeCertificate();
            setCertificate(emptyCertificate);
            onSaved?.(emptyCertificate);
            setFile(null);
            setPassword("");
            setValidFrom("");
            setValidUntil("");
            setSuccess("Certificado removido.");
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Não foi possível remover o certificado.");
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <section className="settings-form">
            <SettingsSectionHeading
                title="Certificado Digital"
                description="Cadastre, substitua ou remova o arquivo PFX/P12. A senha nunca é exibida após salvar."
            />
            <SettingsFeedback error={error} success={success} />

            <div className={[
                "settings-certificate",
                certificate.is_valid ? "is-valid" : "is-unavailable"
            ].join(" ")}>
                <strong>
                    {certificate.is_valid
                        ? "Ativo dentro do período de validade informado"
                        : certificate.exists
                            ? "Cadastrado, inativo ou fora da validade"
                            : "Nenhum certificado cadastrado"}
                </strong>
                <span>Validade inicial: {toDateInput(certificate.valid_from) || "—"}</span>
                <span>Validade final: {toDateInput(certificate.valid_until) || "—"}</span>
            </div>

            <div className="settings-info-card settings-info-card--fiscal">
                {certificate.is_valid ? (
                    <p>O arquivo está ativo conforme o período informado. Assinatura, envio e autorização pela SEFAZ ainda não estão implementados; nenhuma NF-e será considerada autorizada nesta etapa.</p>
                ) : (
                    <p>Sem certificado válido, o sistema pode registrar vendas e gerar PDF de controle interno. XML para processamento não significa emissão fiscal. DANFE só deve ser disponibilizada após autorização da SEFAZ.</p>
                )}
            </div>

            <form className="settings-certificate__form" onSubmit={handleSubmit}>
                <h3>{certificate.exists ? "Substituir certificado" : "Cadastrar certificado"}</h3>
                <div className="settings-form__grid">
                    <SettingsField label="Arquivo PFX ou P12" required>
                        <input type="file" accept=".pfx,.p12,application/x-pkcs12" onChange={(event) => setFile(event.target.files?.[0] ?? null)} required />
                    </SettingsField>
                    <SettingsField label="Senha do certificado" required>
                        <input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
                    </SettingsField>
                    <SettingsField label="Validade inicial" required>
                        <input type="date" value={validFrom} onChange={(event) => setValidFrom(event.target.value)} required />
                    </SettingsField>
                    <SettingsField label="Validade final" required>
                        <input type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} required />
                    </SettingsField>
                </div>
                <SettingsActions>
                    <button className="settings__button settings__button--save" type="submit" disabled={isSaving}>
                        {isSaving ? "Salvando..." : certificate.exists ? "Substituir certificado" : "Salvar certificado"}
                    </button>
                    {certificate.exists && (
                        <>
                            <button className="settings__button settings__button--primary" type="button" onClick={toggleStatus} disabled={isSaving}>
                                {certificate.status ? "Inativar" : "Ativar"}
                            </button>
                            <button className="settings__button settings__button--danger" type="button" onClick={handleRemove} disabled={isSaving}>
                                Remover certificado
                            </button>
                        </>
                    )}
                </SettingsActions>
            </form>
        </section>
    );
}
