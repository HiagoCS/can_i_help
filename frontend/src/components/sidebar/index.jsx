import { useState } from "react";
import { NavLink } from "react-router-dom";

import { getAvatarUrl } from "@/data/api/auth";
import "./style.scss";

const menuSections = [
    {
        title: "Módulos",
        items: [
            { label: "Caixa", path: "/caixa", icon: "register" }
        ]
    },
    {
        title: "Produtos",
        items: [
            { label: "Visão Geral", path: "/produtos/visao-geral", icon: "eye" },
            { label: "Estoque", path: "/produtos/estoque", icon: "box" },
            { label: "Relatórios", path: "/produtos/relatorios", icon: "file" }
        ]
    },
    {
        title: "Serviços",
        items: [
            { label: "Visão Geral", path: "/servicos/visao-geral", icon: "eye" },
            { label: "Relatórios", path: "/servicos/relatorios", icon: "file" }
        ]
    },
    {
        title: "Clientes",
        items: [
            { label: "Vendas", path: "/clientes/vendas", icon: "file" },
            { label: "Visão Geral", path: "/clientes/visao-geral", icon: "eye" }
        ]
    }
];

const roleLabels = {
    boss: "CHEFE",
    employee: "FUNCIONÁRIO",
    developer: "DESENVOLVEDOR"
};

const menuIcons = {
    register: (
        <>
            <path d="M5 8h14l2 4v3H3v-3l2-4Z" />
            <path d="M7 8V4h10v4M7 12h.01M12 12h.01M17 12h.01M7 15v5h10v-5" />
        </>
    ),
    eye: (
        <>
            <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
            <circle cx="12" cy="12" r="2.5" />
        </>
    ),
    box: (
        <>
            <path d="m3 7 9-4 9 4v10l-9 4-9-4V7Z" />
            <path d="m3 7 9 4 9-4M12 11v10M7.5 5l9 4" />
        </>
    ),
    file: (
        <>
            <path d="M6 3h8l4 4v14H6V3Z" />
            <path d="M14 3v5h5M9 12h6M9 16h6" />
        </>
    )
};

function MenuIcon({ name }) {
    return (
        <svg
            className="sidebar__item-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            {menuIcons[name]}
        </svg>
    );
}

function getDisplayName(email = "") {
    const emailName = email
        .split("@")[0]
        .replace(/[._-]+/g, " ")
        .trim();

    return emailName
        ? emailName.toLocaleUpperCase("pt-BR")
        : "USUÁRIO";
}

function getInitials(name) {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join("");
}

function getRoleLabel(roles = []) {
    const primaryRole = [...roles].sort(
        (roleA, roleB) => roleB.level - roleA.level
    )[0];

    if (!primaryRole) {
        return "USUÁRIO";
    }

    const roleName = primaryRole.name.toLowerCase();

    return roleLabels[roleName] ?? primaryRole.name.toLocaleUpperCase("pt-BR");
}

export default function Sidebar({
    user,
    isCollapsed,
    isOpen,
    onToggle,
    onNavigate
}) {
    const [avatarFailed, setAvatarFailed] = useState(false);
    const displayName = getDisplayName(user?.email);
    const avatarUrl = getAvatarUrl(user?.avatar);
    const toggleLabel = isOpen
        ? "Fechar menu"
        : isCollapsed
            ? "Expandir menu"
            : "Recolher menu";

    return (
        <aside
            className={[
                "sidebar",
                isCollapsed ? "is-collapsed" : "",
                isOpen ? "is-open" : ""
            ].filter(Boolean).join(" ")}
            aria-label="Menu do sistema"
        >
            <div className="sidebar__profile">
                <div className="sidebar__profile-copy">
                    <strong className="sidebar__user-name">
                        {displayName}
                    </strong>
                    <span className="sidebar__user-role">
                        {getRoleLabel(user?.roles)}
                    </span>
                    <span className="sidebar__brand">
                        POSSO AJUDAR?
                    </span>
                </div>

                <NavLink
                    to="/configuracoes"
                    className="sidebar__avatar"
                    aria-label="Abrir configurações do usuário"
                    title="Configurações"
                    onClick={onNavigate}
                >
                    {avatarUrl && !avatarFailed ? (
                        <img
                            src={avatarUrl}
                            alt=""
                            onError={() => setAvatarFailed(true)}
                        />
                    ) : (
                        <span aria-hidden="true">
                            {getInitials(displayName)}
                        </span>
                    )}
                </NavLink>
            </div>

            <nav
                className="sidebar__navigation"
                id="system-menu-navigation"
                aria-label="Navegação principal"
            >
                {menuSections.map((section) => (
                    <section className="sidebar__section" key={section.title}>
                        <h2 className="sidebar__section-title">
                            {section.title}
                        </h2>

                        <ul className="sidebar__items">
                            {section.items.map((item) => (
                                <li className="sidebar__item" key={item.path}>
                                    <NavLink
                                        to={item.path}
                                        className={({ isActive }) => [
                                            "sidebar__link",
                                            isActive ? "is-active" : ""
                                        ].filter(Boolean).join(" ")}
                                        aria-label={section.title + ": " + item.label}
                                        title={section.title + ": " + item.label}
                                        onClick={onNavigate}
                                    >
                                        <span className="sidebar__link-label">
                                            {item.label}
                                        </span>
                                        <MenuIcon name={item.icon} />
                                    </NavLink>
                                </li>
                            ))}
                        </ul>
                    </section>
                ))}
            </nav>

            <footer className="sidebar__footer">
                <button
                    className="sidebar__toggle"
                    type="button"
                    aria-label={toggleLabel}
                    aria-controls="system-menu-navigation"
                    onClick={onToggle}
                >
                    <span className="sidebar__desktop-toggle" aria-hidden="true">
                        {isCollapsed ? "»" : "«"}
                    </span>
                    <span className="sidebar__mobile-toggle" aria-hidden="true">
                        ×
                    </span>
                </button>
            </footer>
        </aside>
    );
}