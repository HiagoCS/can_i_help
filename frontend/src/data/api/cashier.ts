interface AppImportMeta extends ImportMeta {
    env: {
        DEV: boolean;
        VITE_API_URL?: string;
    };
}

interface ApiResponse<T> {
    message?: string;
    data?: T;
}

export interface CashierProduct {
    id: number;
    sm_code: string;
    bar_code: string;
    name: string;
    description: string;
    value: string | number;
    amount: string | number;
    unit_measure: string;
    status: number | boolean;
}

export interface CashierPaymentMethod {
    id: number;
    name: string;
    status: number | boolean;
}

export interface CashierInstallment {
    id: number;
    in_installments: number;
    percentage: number;
}

export type ProductSearchField = "name" | "smCode" | "barCode";

const appEnv = (import.meta as AppImportMeta).env;

function getApiUrl(path: string) {
    const apiBaseUrl = appEnv.DEV
        ? ""
        : (appEnv.VITE_API_URL ?? "").replace(/\/+$/, "");

    return apiBaseUrl + path;
}

async function getData<T>(path: string, signal?: AbortSignal): Promise<T> {
    let response: Response;

    try {
        response = await fetch(getApiUrl(path), {
            credentials: "include",
            signal
        });
    } catch (error) {
        if (signal?.aborted) {
            throw error;
        }

        throw new Error(
            "Não foi possível conectar ao servidor. Verifique a conexão e tente novamente."
        );
    }

    const result = await response.json().catch(() => null) as ApiResponse<T> | null;

    if (!response.ok) {
        if (response.status === 401) {
            throw new Error("Sua sessão expirou. Entre novamente no sistema.");
        }

        throw new Error(
            result?.message ?? "Não foi possível carregar os dados do Caixa."
        );
    }

    if (result?.data === undefined || result?.data === null) {
        throw new Error("O servidor retornou uma resposta inválida.");
    }

    return result.data;
}

export function getCashierPaymentMethods() {
    return getData<CashierPaymentMethod[]>("/api/payment-methods");
}

export function getCashierInstallments() {
    return getData<CashierInstallment[]>("/api/installments");
}

export async function searchCashierProducts(
    field: ProductSearchField,
    query: string,
    signal?: AbortSignal
): Promise<CashierProduct[]> {
    const endpoint = field === "smCode"
        ? "smcode"
        : field === "barCode"
            ? "barcode"
            : "name";
    const encodedQuery = encodeURIComponent(query.trim());
    let response: Response;

    try {
        response = await fetch(
            getApiUrl("/api/product/" + endpoint + "/" + encodedQuery),
            {
                credentials: "include",
                signal
            }
        );
    } catch (error) {
        if (signal?.aborted) {
            throw error;
        }

        throw new Error(
            "Não foi possível pesquisar produtos. Verifique a conexão e tente novamente."
        );
    }

    if (response.status === 404) {
        return [];
    }

    const result = await response.json().catch(() => null) as ApiResponse<CashierProduct[]> | null;

    if (!response.ok) {
        if (response.status === 401) {
            throw new Error("Sua sessão expirou. Entre novamente no sistema.");
        }

        throw new Error(
            result?.message ?? "Não foi possível pesquisar produtos."
        );
    }

    if (!Array.isArray(result?.data)) {
        return [];
    }

    return result.data;
}

export interface CashierSale {
    id: number;
    total_value: string | number;
    dt_sale: string;
    client_name: string | null;
}

export function getCashierSales() {
    return getData<CashierSale[]>("/api/cashier");
}

export interface CashierSaleItemInput {
    productId: number;
    quantity: number;
    unitPrice: number;
}

export interface CashierSaleRequest {
    clientName?: string | null;
    clientTaxId?: string | null;
    clientId?: number | null;
    paymentMethodId: number;
    installmentId?: number | null;
    items: CashierSaleItemInput[];
}


export interface CashierSaleSnapshotItem {
    productId: number;
    smCode: string;
    barCode: string;
    name: string;
    description: string;
    unitMeasure: string;
    ncm: string | null;
    cst: string | null;
    csosn: string | null;
    icms: number;
    quantity: number;
    unitPrice: number;
    originalUnitPrice: number;
    total: number;
}

export interface CashierCompletedSale {
    id: number;
    dt_sale: string;
    total_value: number;
    product_subtotal: number;
    sold_subtotal: number;
    discount_total: number;
    installment_surcharge: number;
    client_name: string | null;
    client_tax_id: string | null;
    customer: {
        name: string | null;
        cpf: string | null;
        cnpj: string | null;
        ie: string | null;
        address: string | null;
        number: string | null;
        complement: string | null;
        neighborhood: string | null;
        city: string | null;
        city_ibge: string | null;
        state: string | null;
        zip_code: string | null;
    } | null;
    payment_method_name: string;
    installment_count: number | null;
    fiscal_data_complete: boolean;
    danfe_available: false;
    company: {
        cnpj: string;
        legal_name: string;
        trade_name: string | null;
        state_registration: string;
        municipal_registration: string | null;
        tax_regime: string;
        address: string;
        number: string;
        complement: string | null;
        neighborhood: string;
        city: string;
        city_ibge: string;
        state: string;
        zip_code: string;
    } | null;
    items: CashierSaleSnapshotItem[];
}
export async function createCashierSale(payload: CashierSaleRequest): Promise<CashierCompletedSale> {
    let response: Response;

    try {
        response = await fetch(getApiUrl("/api/cashier"), {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
    } catch {
        throw new Error("Não foi possível conectar ao servidor. A venda não foi registrada.");
    }

    const result = await response.json().catch(() => null) as ApiResponse<CashierCompletedSale> | null;
    if (!response.ok) {
        if (response.status === 401) {
            throw new Error("Sua sessão expirou. Entre novamente no sistema.");
        }
        throw new Error(result?.message ?? "Não foi possível registrar a venda.");
    }

    if (!result?.data) {
        throw new Error("O servidor não retornou os dados da venda registrada.");
    }

    return result.data;
}

export interface CashierClient {
    id: number;
    name: string;
    cpf: string | null;
    cnpj: string | null;
}

export function getCashierClients(search = "", signal?: AbortSignal) {
    return getData<CashierClient[]>("/api/clients?search=" + encodeURIComponent(search.trim()), signal);
}
export interface CashierClientCreateInput {
    name: string;
    cpf?: string | null;
}

export async function createCashierClient(
    payload: CashierClientCreateInput
): Promise<CashierClient> {
    let response: Response;

    try {
        response = await fetch(getApiUrl("/api/clients"), {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
    } catch {
        throw new Error("Não foi possível conectar ao servidor para cadastrar o cliente.");
    }

    const result = await response.json().catch(() => null) as ApiResponse<CashierClient> | null;
    if (!response.ok) {
        if (response.status === 401) {
            throw new Error("Sua sessão expirou. Entre novamente no sistema.");
        }
        throw new Error(result?.message ?? "Não foi possível cadastrar o cliente.");
    }
    if (!result?.data) {
        throw new Error("O servidor não retornou os dados do cliente cadastrado.");
    }

    return result.data;
}
