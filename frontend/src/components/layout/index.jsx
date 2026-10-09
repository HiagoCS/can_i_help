import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";

import Sidebar from "@/components/sidebar";
import "./style.scss";

export default function SystemLayout({ user, onUserUpdate }) {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    useEffect(() => {
        function handleKeyDown(event) {
            if (event.key === "Escape") {
                setIsSidebarOpen(false);
            }
        }

        window.addEventListener("keydown", handleKeyDown);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, []);

    function handleSidebarToggle() {
        if (window.matchMedia("(max-width: 760px)").matches) {
            setIsSidebarOpen(false);
            return;
        }

        setIsCollapsed((current) => !current);
    }

    return (
        <div className="system-layout">
            {isSidebarOpen && (
                <button
                    className="system-layout__backdrop"
                    type="button"
                    aria-label="Fechar menu"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            <Sidebar
                user={user}
                isCollapsed={isCollapsed}
                isOpen={isSidebarOpen}
                onToggle={handleSidebarToggle}
                onNavigate={() => setIsSidebarOpen(false)}
            />

            <div className="system-layout__main">
                <header className="system-layout__mobile-header">
                    <button
                        className="system-layout__mobile-menu"
                        type="button"
                        aria-label="Abrir menu"
                        aria-controls="system-menu-navigation"
                        onClick={() => setIsSidebarOpen(true)}
                    >
                        <span className="system-layout__hamburger" aria-hidden="true" />
                    </button>
                </header>

                <div className="system-layout__page">
                    <Outlet context={{ user, onUserUpdate }} />
                </div>
            </div>
        </div>
    );
}