import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";

import { getCriticalSettings } from "@/data/api/settings";
import CertificateSection from "./certificate_section";
import CompanySection from "./company_section";
import FiscalSection from "./fiscal_section";
import OnlineUsers from "./online_users";
import ProfileSection from "./profile_section";
import SystemSection from "./system_section";
import UsersSection from "./users_section";
import "./style.scss";

function getLevel(user) {
    return (user?.roles ?? []).reduce(
        (level, role) => Math.max(level, Number(role.level) || 0),
        0
    );
}

export default function SettingsPage() {
    const { user, onUserUpdate } = useOutletContext();
    const userLevel = getLevel(user);
    const canManageUsers = userLevel >= 2;
    const isLevelThree = userLevel >= 3;

    const [activeSection, setActiveSection] = useState("profile");
    const [critical, setCritical] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!isLevelThree) {
            setCritical(null);
            setIsLoading(false);
            return undefined;
        }

        let isMounted = true;
        setIsLoading(true);
        setError("");

        getCriticalSettings()
            .then((data) => {
                if (isMounted) setCritical(data);
            })
            .catch((reason) => {
                if (isMounted) {
                    setError(reason instanceof Error ? reason.message : "Não foi possível carregar as configurações críticas.");
                }
            })
            .finally(() => {
                if (isMounted) setIsLoading(false);
            });

        return () => {
            isMounted = false;
        };
    }, [isLevelThree]);

    const sections = [
        { id: "profile", label: "Usuário / Perfil" },
        { id: "system", label: "Funcionamento do sistema" },
        ...(canManageUsers ? [
            { id: "users", label: "Controle de usuários" }
        ] : []),
        ...(isLevelThree ? [
            { id: "fiscal", label: "Configuração Fiscal", critical: true },
            { id: "company", label: "Empresa", critical: true },
            { id: "certificate", label: "Certificado Digital", critical: true }
        ] : [])
    ];

    function updateCompany(saved) {
        setCritical((current) => ({
            ...current,
            company: saved,
            fiscal: current?.fiscal
                ? { ...current.fiscal, tax_regime: saved.tax_regime }
                : current?.fiscal
        }));
    }

    function updateFiscal(saved) {
        setCritical((current) => ({
            ...current,
            fiscal: saved,
            company: current?.company
                ? { ...current.company, tax_regime: saved.tax_regime }
                : current?.company
        }));
    }

    function updateCertificate(saved) {
        setCritical((current) => ({ ...current, certificate: saved }));
    }

    return (
        <main className="settings-page">
            <header className="settings-page__header">
                <h1 onClick={() => { window.location.href = "/" }} >POSSO AJUDAR?</h1>
                <span>Perfil - Configurações</span>
            </header>

            <div className="settings-page__layout">
                <nav className="settings-nav" aria-label="Seções de configurações">
                    <h2>Configurações</h2>
                    {sections.map((section) => (
                        <button
                            key={section.id}
                            type="button"
                            className={[
                                "settings-nav__link",
                                section.critical ? "is-critical" : "",
                                activeSection === section.id ? "is-active" : ""
                            ].filter(Boolean).join(" ")}
                            aria-current={activeSection === section.id ? "page" : undefined}
                            onClick={() => {
                                setActiveSection(section.id);
                                setError("");
                            }}
                        >
                            <span>{section.label}</span>
                            {section.critical && <small>CRÍTICO</small>}
                        </button>
                    ))}
                </nav>

                <section className="settings-content" aria-label="Área de configuração">
                    <div className="settings-content__scroll">
                        {error && <p className="settings__message settings__message--error" role="alert">{error}</p>}
                        {isLoading && <p className="settings__loading">Carregando configurações...</p>}

                        {!isLoading && activeSection === "profile" && (
                            <ProfileSection user={user} onUserUpdate={onUserUpdate} />
                        )}
                        {!isLoading && activeSection === "system" && <SystemSection />}
                        {!isLoading && activeSection === "users" && canManageUsers && (
                            <UsersSection currentUserId={user?.id} currentLevel={userLevel} />
                        )}
                        {!isLoading && activeSection === "fiscal" && isLevelThree && (
                            <FiscalSection
                                fiscalData={critical?.fiscal}
                                hasCompany={Boolean(critical?.company)}
                                onSaved={updateFiscal}
                            />
                        )}
                        {!isLoading && activeSection === "company" && isLevelThree && (
                            <CompanySection
                                companyData={critical?.company}
                                users={critical?.users ?? []}
                                onSaved={updateCompany}
                            />
                        )}
                        {!isLoading && activeSection === "certificate" && isLevelThree && (
                            <CertificateSection
                                certificateData={critical?.certificate}
                                onSaved={updateCertificate}
                            />
                        )}
                    </div>
                </section>

                <OnlineUsers />
            </div>
        </main>
    );
}
