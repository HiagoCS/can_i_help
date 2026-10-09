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
import SettingsPage from "@/components/folders/settings";
import { getCurrentUser } from "@/data/api/auth";
import "@/styles/main.scss";
import "@/styles/root.scss";

function App() {
    const [user, setUser] = useState(null);
    const [isCheckingSession, setIsCheckingSession] = useState(true);

    useEffect(() => {
        let isMounted = true;

        getCurrentUser().then((currentUser) => {
            if (isMounted) {
                setUser(currentUser);
                setIsCheckingSession(false);
            }
        });

        return () => {
            isMounted = false;
        };
    }, []);

    const handleLoginSuccess = (authenticatedUser) => {
        setUser(authenticatedUser);
        setIsCheckingSession(false);
    };

    const loginPage = (
        <LoginPage onLoginSuccess={handleLoginSuccess} />
    );
    const sessionLoading = (
        <main className="system-loading" aria-busy="true" aria-live="polite">
            Carregando...
        </main>
    );

    return (
        <Router>
            <Routes>
                <Route
                    path="/login"
                    element={
                        isCheckingSession
                            ? sessionLoading
                            : user
                                ? <Navigate to="/" replace />
                                : loginPage
                    }
                />

                <Route
                    path="/"
                    element={
                        isCheckingSession
                            ? sessionLoading
                            : user
                                ? <SystemLayout user={user} onUserUpdate={setUser} />
                                : <Navigate to="/login" replace />
                    }
                >
                    <Route index element={<HomePage />} />

                    <Route
                        path="caixa"
                        element={<CashierPage />}
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
