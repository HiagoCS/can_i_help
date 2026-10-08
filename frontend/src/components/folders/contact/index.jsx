import "./style.scss";

import EmailIcon from "@/assets/icons/email-1-svgrepo-com.svg?react";
import PhoneIcon from "@/assets/icons/phone-call-svgrepo-com.svg?react";
import PinIcon from "@/assets/icons/location-pin-svgrepo-com.svg?react";

import contacts from "@/data/contacts/index.json";
import { contactIcons } from "@/data/contacts/functions.jsx";

import { useInfos } from "@/data/hooks/useInfos";

export default function ContactPage() {
    const {
        data: infos,
        isLoading,
        error
    } = useInfos();

    if (isLoading) {
        return null;
    }

    if (error) {
        console.error(error.message);
        return null;
    }

    if (!infos) {
        console.warn(
            "Nenhuma informação de cliente encontrada!"
        );

        return null;
    }

    const companyName =
        infos.company && infos.company !== ""
            ? infos.company
            : infos.name;

    const phone =
        infos.phone?.replace(/\D/g, "") || "";

    const whatsapp =
        infos.whatsapp?.replace(/\D/g, "") || "";

    const whatsappNumber =
        phone.length === 11
            ? phone
            : whatsapp;

    return (
        <section className="app contact">

            <div className="contact-layout">

                {/* =====================================================
                    PAINEL ESQUERDO
                ===================================================== */}

                <aside className="contact-sidebar">

                    <div className="contact-sidebar-content">

                        <span className="contact-label">
                            ENTRE EM CONTATO
                        </span>

                        <h1>
                            {companyName}
                        </h1>

                        <p className="contact-description">
                            {infos.footer}
                        </p>

                        <div className="contact-divider"></div>

                        <div className="contact-social">

                            <span className="contact-social-label">
                                ENCONTRE-ME
                            </span>

                            <div className="social-links">

                                {contacts.map(
                                    ({ id, icon, url }) => {

                                        const Icon =
                                            contactIcons[icon];

                                        if (!Icon) {
                                            return null;
                                        }

                                        return (
                                            <a
                                                key={id}
                                                href={url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                aria-label={icon}
                                            >
                                                <Icon />
                                            </a>
                                        );
                                    }
                                )}

                            </div>

                        </div>

                    </div>

                    <div className="contact-sidebar-footer">
                        <span>
                            Vamos conversar sobre o seu projeto?
                        </span>
                    </div>

                </aside>

                {/* =====================================================
                    ÁREA DE CONTATOS
                ===================================================== */}

                <main className="contact-main">

                    <div className="contact-main-header">

                        <span className="contact-label">
                            FALE COMIGO
                        </span>

                        <h2>
                            Estou à disposição
                            <br />
                            para atender você.
                        </h2>

                    </div>

                    <div className="contact-list">

                        {/* E-MAIL */}

                        <a
                            className="contact-card"
                            href={`mailto:${infos.email}`}
                        >

                            <div className="contact-card-icon">
                                <EmailIcon />
                            </div>

                            <div className="contact-card-content">

                                <span>
                                    E-mail
                                </span>

                                <p>
                                    {infos.email}
                                </p>

                            </div>

                            <span className="contact-card-arrow">
                                →
                            </span>

                        </a>

                        {/* TELEFONE */}

                        <a
                            className="contact-card"
                            href={
                                whatsappNumber
                                    ? `https://wa.me/55${whatsappNumber}`
                                    : "#"
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                        >

                            <div className="contact-card-icon">
                                <PhoneIcon />
                            </div>

                            <div className="contact-card-content">

                                <span>
                                    Telefone
                                </span>

                                <p>
                                    {infos.phone}
                                </p>

                            </div>

                            <span className="contact-card-arrow">
                                →
                            </span>

                        </a>

                        {/* LOCALIZAÇÃO */}

                        <div className="contact-card">

                            <div className="contact-card-icon">
                                <PinIcon />
                            </div>

                            <div className="contact-card-content">

                                <span>
                                    Localização
                                </span>

                                <p>
                                    {infos.location}
                                </p>

                            </div>

                        </div>

                    </div>

                    <div className="contact-main-footer">

                        <span>
                            Atendimento
                        </span>

                        <p>
                            Entre em contato para conhecer melhor
                            nossos serviços e soluções.
                        </p>

                    </div>

                </main>

            </div>

        </section>
    );
}