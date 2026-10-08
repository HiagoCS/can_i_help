import { useEffect, useState } from "react";

import { getPresenceSocketUrl } from "@/data/api/settings";
import "./style.scss";


export default function OnlineUsers() {
    const [users, setUsers] = useState([]);
    const [connectionState, setConnectionState] = useState("connecting");

    useEffect(() => {
        let socket = null;
        let reconnectTimer;
        let stableTimer;
        let attempts = 0;
        let isDisposed = false;

        function connect() {
            if (isDisposed) return;
            setConnectionState("connecting");

            try {
                socket = new WebSocket(getPresenceSocketUrl());
            } catch {
                scheduleReconnect();
                return;
            }

            socket.onopen = () => {
                if (isDisposed) return;
                setConnectionState("connected");
                stableTimer = window.setTimeout(() => {
                    attempts = 0;
                }, 15000);
            };

            socket.onmessage = (event) => {
                try {
                    const message = JSON.parse(String(event.data));
                    if (Array.isArray(message.users)) setUsers(message.users);
                } catch {
                    // Ignora mensagens fora do formato esperado.
                }
            };

            socket.onerror = () => socket?.close();

            socket.onclose = () => {
                if (stableTimer !== undefined) window.clearTimeout(stableTimer);
                if (!isDisposed) {
                    setConnectionState("offline");
                    scheduleReconnect();
                }
            };
        }

        function scheduleReconnect() {
            if (isDisposed || reconnectTimer !== undefined) return;
            const delay = Math.min(1000 * (2 ** attempts), 30000);
            attempts += 1;
            reconnectTimer = window.setTimeout(() => {
                reconnectTimer = undefined;
                connect();
            }, delay);
        }

        connect();

        return () => {
            isDisposed = true;
            if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
            if (stableTimer !== undefined) window.clearTimeout(stableTimer);
            socket?.close(1000, "Tela encerrada");
        };
    }, []);

    return (
        <aside className="settings-online" aria-labelledby="settings-online-title">
            <header className="settings-online__header">
                <h2 id="settings-online-title">Usuários online</h2>
                <span
                    className={[
                        "settings-online__connection",
                        connectionState === "connected" ? "is-connected" : ""
                    ].filter(Boolean).join(" ")}
                    aria-live="polite"
                >
                    {connectionState === "connected"
                        ? "Tempo real"
                        : connectionState === "connecting"
                            ? "Conectando..."
                            : "Reconectando..."}
                </span>
            </header>

            {users.length ? (
                <ul className="settings-online__list">
                    {users.map((user) => (
                        <li className="settings-online__user" key={user.id}>
                            <span className="settings-online__name">{user.name}</span>
                            <span className={[
                                "settings-online__status",
                                user.online ? "is-online" : "is-offline"
                            ].join(" ")}>
                                <span aria-hidden="true">●</span>
                                {user.online ? "ONLINE" : "offline"}
                            </span>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="settings-online__empty">
                    {connectionState === "connected"
                        ? "Nenhum usuário ativo para exibir."
                        : "A lista será carregada ao conectar."}
                </p>
            )}
        </aside>
    );
}
