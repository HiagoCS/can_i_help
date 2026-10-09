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

// ============================================================
// CLIENT
// ============================================================

export interface ClientRecord {
    id: number;
    name: string;
    cpf: string | null;
    cnpj: string | null;
}

// ============================================================
// CLIENT LIST SEARCH
// ============================================================

export interface ClientSearchParams {
    search?: string;
}

// ============================================================
// CLIENT PURCHASE ITEM
// ============================================================

export interface ClientPurchaseItem {
    id: number;
    type: "product" | "service" | "unknown";
    item_id: number | null;
    product_id: number | null;
    service_id: number | null;
    sm_code: string | null;
    bar_code: string | null;
    name: string;
    quantity: number;
    unit_measure: string;
    unit_value: number;
    total_value: number;
}

// ============================================================
// CLIENT PURCHASE
// ============================================================

export interface ClientPurchase {
    id: number;
    dt_sale: string;
    total_value: number;
    payment_method: string | null;
    items: ClientPurchaseItem[];
}

// ============================================================
// CLIENT PURCHASE REPORT
// ============================================================

export interface ClientReportRecord extends ClientRecord {
    purchase_count: number;
    items_bought_count: number;
    total_spent: number;
    purchases: ClientPurchase[];
}

// ============================================================
// CLIENT REPORT FILTERS
// ============================================================

export interface ClientReportRange {
    search?: string;
    from?: string;
    to?: string;
}

// ============================================================
// API CONFIGURATION
// ============================================================

const env = (import.meta as AppImportMeta).env;

function url(path: string) {
    return (
        (env.DEV
            ? ""
            : (env.VITE_API_URL ?? "").replace(/\/+$/, "")) + path
    );
}

// ============================================================
// REQUEST
// ============================================================

async function requestData<T>(
    path: string,
    options: RequestInit = {}
): Promise<T> {
    let response: Response;

    try {
        response = await fetch(url(path), {
            ...options,
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
                ...options.headers
            }
        });
    } catch {
        throw new Error(
            "Não foi possível conectar ao servidor."
        );
    }

    const result = await response
        .json()
        .catch(() => null) as ApiResponse<T> | null;

    if (!response.ok) {
        if (response.status === 401) {
            throw new Error(
                "Sua sessão expirou. Entre novamente no sistema."
            );
        }

        throw new Error(
            result?.message ??
            "Não foi possível concluir a operação."
        );
    }

    if (result?.data == null) {
        throw new Error(
            "O servidor retornou uma resposta inválida."
        );
    }

    return result.data;
}

// ============================================================
// LIST CLIENTS
// GET /api/clients
// GET /api/clients?search=Maria
// ============================================================

export function getClients(
    search = "",
    signal?: AbortSignal
) {
    const query = new URLSearchParams();

    if (search.trim()) {
        query.set("search", search.trim());
    }

    const suffix = query.toString();

    return requestData<ClientRecord[]>(
        "/api/clients" + (suffix ? "?" + suffix : ""),
        { signal }
    );
}

// ============================================================
// CLIENT PURCHASE REPORT
// GET /api/clients/reports
// ============================================================

export function getClientReports(
    range: ClientReportRange = {},
    signal?: AbortSignal
) {
    const query = new URLSearchParams();

    if (range.search?.trim()) {
        query.set("search", range.search.trim());
    }

    if (range.from) {
        query.set("from", range.from);
    }

    if (range.to) {
        query.set("to", range.to);
    }

    const suffix = query.toString();

    return requestData<ClientReportRecord[]>(
        "/api/clients/reports" + (suffix ? "?" + suffix : ""),
        { signal }
    );
}