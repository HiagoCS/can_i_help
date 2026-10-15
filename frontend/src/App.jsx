
import { useEffect, useState } from "react";
import {
    BrowserRouter as Router,
    Navigate,
    Route,
    Routes
} from "react-router-dom";

import HomePage from "@/components/folders/home";
import SystemLayout from "@/components/layout";
import CashierPage from "@/components/folders/cashier";
import BudgetPage from "@/components/folders/budget";
import ProductOverviewPage from "@/components/folders/product_overview";
import ServicesOverviewPage from "@/components/folders/services_overview";
import ClientsOverviewPage from "@/components/folders/clients_overview";
import ProductStockPage from "@/components/folders/product_stock";
import ProductReportsPage from "@/components/folders/product_reports";
import ServicesReportsPage from "@/components/folders/services_reports";
import ClientsReportsPage from "@/components/folders/clients_reports";
import ClientRegistrationPage from "@/components/folders/client_registration";
import ClientEditingPage from "@/components/folders/client_editing";
import LoginPage from "@/components/folders/login";
import RegisterPage from "@/components/folders/register";
import SettingsPage from "@/components/folders/settings";

import {
    getCurrentUser
} from "@/data/api/auth";

import {
    getInitialSetupStatus
} from "@/data/api/settings";

import "@/styles/main.scss";
import "@/styles/root.scss";

function App() {
    const [user, setUser] = useState(null);

    const [isCheckingSession, setIsCheckingSession] = useState(true);
    const [isCheckingSetup, setIsCheckingSetup] = useState(true);

    const [setupStatus, setSetupStatus] = useState(null);
    const [initializationError, setInitializationError] = useState("");
    const [retryCount, setRetryCount] = useState(0);

    useEffect(() => {
        let isMounted = true;

        async function initializeApp() {
            setIsCheckingSession(true);
            setIsCheckingSetup(true);
            setInitializationError("");

            try {
                const [sessionResult, setupResult] = await Promise.allSettled([
                    getCurrentUser(),
                    getInitialSetupStatus()
                ]);

                if (!isMounted) {
                    return;
                }

                if (sessionResult.status === "fulfilled") {
                    setUser(sessionResult.value);
                } else {
                    setUser(null);
                }

                if (setupResult.status === "rejected") {
                    throw setupResult.reason;
                }

                const status = setupResult.value;

                if (
                    !status ||
                    typeof status.requiresInitialSetup !== "boolean"
                ) {
                    throw new Error(
                        "O servidor retornou um status de configuração inválido."
                    );
                }

                setSetupStatus(status);
            } catch (error) {
                if (!isMounted) {
                    return;
                }

                setInitializationError(
                    error instanceof Error
                        ? error.message
                        : "Não foi possível verificar a configuração inicial do sistema."
                );
            } finally {
                if (isMounted) {
                    setIsCheckingSession(false);
                    setIsCheckingSetup(false);
                }
            }
        }

        initializeApp();

        return () => {
            isMounted = false;
        };
    }, [retryCount]);

    const handleLoginSuccess = (authenticatedUser) => {
        setUser(authenticatedUser);
        setIsCheckingSession(false);
    };

    const handleRegisterSuccess = () => {
        setSetupStatus((currentStatus) => {
            if (!currentStatus) {
                return currentStatus;
            }

            return {
                ...currentStatus,
                hasAdministrator: true,
                requiresInitialSetup: false,
                status: "configured"
            };
        });
    };

    function handleRetryInitialization() {
        setSetupStatus(null);
        setInitializationError("");
        setRetryCount((currentCount) => currentCount + 1);
    }

    const isInitializing = isCheckingSession || isCheckingSetup;

    const sessionLoading = (
        <main
            className="system-loading"
            aria-busy="true"
            aria-live="polite"
        >
            Carregando...
        </main>
    );

    if (initializationError && !isInitializing) {
        return (
            <main
                className="system-loading"
                aria-live="polite"
            >
                <p role="alert">
                    Não foi possível verificar a configuração inicial do
                    sistema.
                </p>

                <p>
                    {initializationError}
                </p>

                <button
                    type="button"
                    onClick={handleRetryInitialization}
                >
                    Tentar novamente
                </button>
            </main>
        );
    }

    const loginPage = (
        <LoginPage onLoginSuccess={handleLoginSuccess} />
    );

    const registerPage = (
        <RegisterPage onRegisterSuccess={handleRegisterSuccess} />
    );

    return (
        <Router>
            <Routes>
                <Route
                    path="/register"
                    element={
                        isInitializing
                            ? sessionLoading
                            : user
                                ? <Navigate to="/" replace />
                                : setupStatus?.requiresInitialSetup
                                    ? registerPage
                                    : <Navigate to="/login" replace />
                    }
                />

                <Route
                    path="/login"
                    element={
                        isInitializing
                            ? sessionLoading
                            : user
                                ? <Navigate to="/" replace />
                                : setupStatus?.requiresInitialSetup
                                    ? <Navigate to="/register" replace />
                                    : loginPage
                    }
                />

                <Route
                    path="/"
                    element={
                        isInitializing
                            ? sessionLoading
                            : user
                                ? (
                                    <SystemLayout
                                        user={user}
                                        onUserUpdate={setUser}
                                    />
                                )
                                : <Navigate to="/login" replace />
                    }
                >
                    <Route index element={<HomePage />} />

                    <Route
                        path="caixa"
                        element={<CashierPage />}
                    />

                    <Route
                        path="caixa/orcamento"
                        element={<BudgetPage />}
                    />

                    <Route
                        path="produtos/visao-geral"
                        element={<ProductOverviewPage />}
                    />

                    <Route
                        path="produtos/estoque/:productId?"
                        element={<ProductStockPage />}
                    />

                    <Route
                        path="produtos/relatorios"
                        element={<ProductReportsPage />}
                    />

                    <Route
                        path="servicos/visao-geral"
                        element={<ServicesOverviewPage />}
                    />

                    <Route
                        path="servicos/relatorios"
                        element={<ServicesReportsPage />}
                    />

                    <Route
                        path="clientes/vendas"
                        element={<ClientsReportsPage />}
                    />

                    <Route
                        path="clientes/visao-geral"
                        element={<ClientsOverviewPage />}
                    />

                    <Route
                        path="clientes/novo"
                        element={<ClientRegistrationPage />}
                    />

                    <Route
                        path="clientes/editar/:clientId"
                        element={<ClientEditingPage />}
                    />

                    <Route
                        path="configuracoes"
                        element={<SettingsPage />}
                    />

                    <Route
                        path="*"
                        element={<HomePage />}
                    />
                </Route>

                <Route
                    path="*"
                    element={<Navigate to="/" replace />}
                />
            </Routes>
        </Router>
    );
}

export default App;
