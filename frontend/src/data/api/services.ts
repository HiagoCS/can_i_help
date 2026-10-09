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

export interface ServiceProduct {
    product_id: number;
    sm_code: string;
    bar_code: string;
    name: string;
    description: string | null;
    value: string | number | null;
    cost: string | number | null;
    amount: string | number | null;
    unit_measure: string;
    qunt: number;
}

export interface ServiceRecord {
    id: number;
    sm_code: string;
    bar_code: string;
    name: string;
    description: string | null;
    cost: string | number | null;
    value: string | number;
    status: number | boolean;
    products: ServiceProduct[];
}

export interface ServicePayload {
    sm_code?: string;
    bar_code?: string;
    name: string;
    description: string | null;
    cost: string | number;
    status?: number | boolean;
    products?: {
        product_id: number;
        qunt: number;
    }[];
}

export interface ServiceReportRow {
    id: number;
    name: string;
    units_sold: number;
    revenue: string | number | null;
    sales_cost: string | number | null;
    unknown_sale_cost_count?: number;
}

export interface ServiceReportRange {
    from?: string;
    to?: string;
}

const env = (import.meta as AppImportMeta).env;

function url(path: string) {
    return (
        (env.DEV
            ? ""
            : (env.VITE_API_URL ?? "").replace(/\/+$/, "")) + path
    );
}

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
        throw new Error("Não foi possível conectar ao servidor.");
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
            result?.message ?? "Não foi possível concluir a operação."
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
// LIST SERVICES
// GET /api/services
// ============================================================

export function getServices(signal?: AbortSignal) {
    return requestData<ServiceRecord[]>("/api/services", {
        signal
    });
}

// ============================================================
// SEARCH SERVICES
// GET /api/services/search/:query
// ============================================================

export function searchServices(
    query: string,
    signal?: AbortSignal
) {
    return requestData<ServiceRecord[]>(
        "/api/services/search/" + encodeURIComponent(query),
        { signal }
    );
}

// ============================================================
// GET SERVICE BY ID
// GET /api/service/:id
// ============================================================

export function getService(
    id: number,
    signal?: AbortSignal
) {
    return requestData<ServiceRecord>(
        "/api/service/" + id,
        { signal }
    );
}

// ============================================================
// GET SERVICE BY SM CODE
// ============================================================

export function getServiceBySmCode(
    smCode: string,
    signal?: AbortSignal
) {
    return requestData<ServiceRecord[]>(
        "/api/service/smcode/" + encodeURIComponent(smCode),
        { signal }
    );
}

// ============================================================
// GET SERVICE BY BAR CODE
// ============================================================

export function getServiceByBarCode(
    barCode: string,
    signal?: AbortSignal
) {
    return requestData<ServiceRecord[]>(
        "/api/service/barcode/" + encodeURIComponent(barCode),
        { signal }
    );
}

// ============================================================
// GET SERVICE BY NAME
// ============================================================

export function getServiceByName(
    name: string,
    signal?: AbortSignal
) {
    return requestData<ServiceRecord[]>(
        "/api/service/name/" + encodeURIComponent(name),
        { signal }
    );
}

// ============================================================
// CREATE SERVICE
// POST /api/service/new
// ============================================================

export function createService(data: ServicePayload) {
    return requestData<ServiceRecord>(
        "/api/service/new",
        {
            method: "POST",
            body: JSON.stringify(data)
        }
    );
}

// ============================================================
// UPDATE SERVICE
// PUT /api/service/:id
// ============================================================

export function updateService(
    id: number,
    data: Partial<ServicePayload>
) {
    return requestData<ServiceRecord>(
        "/api/service/" + id,
        {
            method: "PUT",
            body: JSON.stringify(data)
        }
    );
}

// ============================================================
// DELETE SERVICE
// DELETE /api/service/:id
// ============================================================

export function deleteService(id: number) {
    return requestData<ServiceRecord>(
        "/api/service/" + id,
        {
            method: "DELETE"
        }
    );
}

// ============================================================
// SERVICE REPORTS
// GET /api/services/reports?from=YYYY-MM-DD&to=YYYY-MM-DD
// ============================================================

export function getServiceReports(
    range: ServiceReportRange = {},
    signal?: AbortSignal
) {
    const query = new URLSearchParams();

    if (range.from) {
        query.set("from", range.from);
    }

    if (range.to) {
        query.set("to", range.to);
    }

    const suffix = query.toString();

    return requestData<ServiceReportRow[]>(
        "/api/services/reports" + (suffix ? "?" + suffix : ""),
        { signal }
    );
}