interface AppImportMeta extends ImportMeta {
    env: {
        DEV: boolean;
        VITE_API_URL?: string;
    };
}

interface ApiResponse<T> {
    message?: string;
    data?: T;
    error?: string;
    statusCode?: number;
}

/* -------------------------------------------------------------------------- */
/* Tipos                                                                      */
/* -------------------------------------------------------------------------- */

export interface BudgetProduct {
    id: number;
    sm_code: string;
    bar_code: string;
    name: string;
    description?: string | null;
    value?: string | number | null;
    amount?: string | number | null;
    unit_measure?: string | null;
    status?: number | boolean;
}

export interface BudgetService {
    id: number;
    sm_code?: string | null;
    bar_code?: string | null;
    name: string;
    description?: string | null;
    value?: string | number | null;
    cost?: string | number | null;
    amount?: string | number | null;
    unit_measure?: string | null;
    status?: number | boolean;
}

export interface BudgetPaymentMethod {
    id: number;
    name: string;
    status: number | boolean;
}

export interface BudgetInstallment {
    id: number;
    in_installments: number;
    percentage: number | string;
}

export interface BudgetClient {
    id: number;
    name: string;
    cpf: string | null;
    cnpj: string | null;
}

export type BudgetSearchField = "name" | "smCode" | "barCode";

export type BudgetSearchItem =
    | (BudgetProduct & {
        itemType: "product";
        value: string | number;
        amount: string | number;
        unit_measure: string;
    })
    | (BudgetService & {
        itemType: "service";
        value: string | number;
        amount: number;
        unit_measure: string;
    });

export interface BudgetItemInput {
    productId?: number;
    serviceId?: number;
    quantity: number;
    unitPrice: number;
    unitMeasure?: string;
}

export interface BudgetCreateRequest {
    clientId?: number | null;
    totalValue: number;
    items: BudgetItemInput[];
}

export interface BudgetRecord {
    id: number;
    total_value: number | string;
    dt_budget: string;
    client_id: number | null;
    client_name?: string | null;
    item_count?: number;
}

export interface BudgetDocumentCustomer {
    name: string | null;
    cpf: string | null;
    cnpj: string | null;
    address: string | null;
    number: string | null;
    complement: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    zip_code: string | null;
}

export interface BudgetDocumentCompany {
    cnpj: string | null;
    legal_name: string;
    trade_name: string | null;
    address: string | null;
    number: string | null;
    complement: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    zip_code: string | null;
}

export interface BudgetDetail extends BudgetRecord {
    client_cpf?: string | null;
    client_cnpj?: string | null;
    customer?: BudgetDocumentCustomer | null;
    company?: BudgetDocumentCompany | null;
    items: Array<{
        id: number;
        budget_id: number;
        product_id: number | null;
        service_id: number | null;
        item_type: "product" | "service" | "unknown";
        sm_code: string | null;
        bar_code: string | null;
        name: string;
        description: string;
        value: number;
        unit_value: number;
        quantity: number;
        unit_measure: string;
        total_value: number;
    }>;
}

export interface BudgetCreateResult {
    id: number;
    total_value?: string | number;
    dt_budget?: string;
    client_id?: number | null;
    client_name?: string | null;
    items?: unknown[];
    [key: string]: unknown;
}

export interface BudgetDeleteResult {
    budgetId: number;
    totalValue: number;
    dtBudget: string;
    removedItems: number;
}

/* -------------------------------------------------------------------------- */
/* Configuração e URLs                                                        */
/* -------------------------------------------------------------------------- */

const appEnv = (import.meta as AppImportMeta).env;
const configuredApiBase = (appEnv.VITE_API_URL ?? "").trim().replace(/\/+$/, "");

/**
 * A API do projeto usa /api como prefixo. Se VITE_API_URL já terminar em /api,
 * removemos esse sufixo antes de anexar caminhos /api/... para evitar /api/api.
 * Em desenvolvimento, os caminhos relativos continuam passando pelo proxy do Vite.
 */
function getApiUrl(path: string): string {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;

    if (appEnv.DEV || !configuredApiBase) {
        return normalizedPath;
    }

    const base = configuredApiBase.replace(/\/api$/i, "");
    return `${base}${normalizedPath}`;
}

function getUnprefixedBudgetUrl(path: string): string | null {
    if (!path.startsWith("/api/budget")) return null;

    const unprefixedPath = path.slice("/api".length);

    // Em DEV, uma chamada relativa a /budget seria servida pelo Vite e não
    // pelo Fastify. Só tentamos a rota sem prefixo se houver URL explícita da API.
    if (appEnv.DEV) {
        if (!configuredApiBase) return null;
        const base = configuredApiBase.replace(/\/api$/i, "");
        return `${base}${unprefixedPath}`;
    }

    if (configuredApiBase) {
        const base = configuredApiBase.replace(/\/api$/i, "");
        return `${base}${unprefixedPath}`;
    }

    return unprefixedPath;
}

async function readJson<T>(response: Response): Promise<T | null> {
    return response.json().catch(() => null) as Promise<T | null>;
}

function isMissingRoute(response: Response, result: ApiResponse<unknown> | null): boolean {
    if (response.status !== 404) return false;

    const message = String(result?.message ?? "");
    return (
        /^Route\s+(GET|POST|DELETE):/i.test(message) ||
        /route\s+.+not found/i.test(message) ||
        /cannot\s+(GET|POST|DELETE)\s+/i.test(message)
    );
}

/**
 * Envia uma requisição de orçamento. Compatibiliza instalações onde as rotas
 * estão registradas sob /api/budget e instalações onde o plugin expõe /budget.
 * O fallback só ocorre quando o Fastify informa explicitamente que a rota não existe.
 */
async function fetchBudgetRoute(
    path: string,
    init: RequestInit
): Promise<Response> {
    const primaryUrl = getApiUrl(path);
    let response: Response;

    try {
        response = await fetch(primaryUrl, {
            ...init,
            credentials: "include"
        });
    } catch (error) {
        if (init.signal instanceof AbortSignal && init.signal.aborted) throw error;
        throw new Error("Não foi possível conectar ao servidor. Verifique a conexão e tente novamente.");
    }

    if (response.status !== 404) return response;

    const firstResult = await readJson<ApiResponse<unknown>>(response.clone());
    if (!isMissingRoute(response, firstResult)) return response;

    const fallbackUrl = getUnprefixedBudgetUrl(path);
    if (!fallbackUrl || fallbackUrl === primaryUrl) return response;

    try {
        const fallbackResponse = await fetch(fallbackUrl, {
            ...init,
            credentials: "include"
        });

        // Se o segundo caminho também não existir, devolvemos a resposta inicial,
        // que indica com precisão qual rota /api não foi encontrada.
        if (fallbackResponse.status === 404) {
            const fallbackResult = await readJson<ApiResponse<unknown>>(fallbackResponse.clone());
            if (isMissingRoute(fallbackResponse, fallbackResult)) return response;
        }

        return fallbackResponse;
    } catch (error) {
        if (init.signal instanceof AbortSignal && init.signal.aborted) throw error;
        return response;
    }
}

function getHttpErrorMessage(
    status: number,
    result: ApiResponse<unknown> | null,
    fallbackMessage: string
): string {
    if (status === 401) return "Sua sessão expirou. Entre novamente no sistema.";
    return result?.message ?? fallbackMessage;
}

async function getData<T>(
    path: string,
    fallbackMessage: string,
    signal?: AbortSignal,
    budgetRoute = false
): Promise<T> {
    let response: Response;

    const init: RequestInit = {
        method: "GET",
        headers: { Accept: "application/json" },
        ...(signal ? { signal } : {})
    };

    if (budgetRoute) {
        response = await fetchBudgetRoute(path, init);
    } else {
        try {
            response = await fetch(getApiUrl(path), {
                ...init,
                credentials: "include"
            });
        } catch (error) {
            if (signal?.aborted) throw error;
            throw new Error("Não foi possível conectar ao servidor. Verifique a conexão e tente novamente.");
        }
    }

    const result = await readJson<ApiResponse<T>>(response);
    if (!response.ok) {
        throw new Error(getHttpErrorMessage(response.status, result, fallbackMessage));
    }
    if (result?.data === undefined || result.data === null) {
        throw new Error("O servidor retornou uma resposta inválida.");
    }

    return result.data;
}

async function postData<T>(
    path: string,
    payload: unknown,
    fallbackMessage: string,
    budgetRoute = false
): Promise<T> {
    const init: RequestInit = {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
        },
        body: JSON.stringify(payload)
    };

    let response: Response;
    if (budgetRoute) {
        response = await fetchBudgetRoute(path, init);
    } else {
        try {
            response = await fetch(getApiUrl(path), {
                ...init,
                credentials: "include"
            });
        } catch {
            throw new Error("Não foi possível conectar ao servidor. Verifique a conexão e tente novamente.");
        }
    }

    const result = await readJson<ApiResponse<T>>(response);
    if (!response.ok) {
        throw new Error(getHttpErrorMessage(response.status, result, fallbackMessage));
    }
    if (result?.data === undefined || result.data === null) {
        throw new Error("O servidor não retornou os dados esperados.");
    }

    return result.data;
}

/* -------------------------------------------------------------------------- */
/* Formas de pagamento e parcelamento                                         */
/* Usadas somente para estimar o orçamento; não iniciam pagamentos.            */
/* -------------------------------------------------------------------------- */

export function getBudgetPaymentMethods(): Promise<BudgetPaymentMethod[]> {
    return getData<BudgetPaymentMethod[]>(
        "/api/payment-methods",
        "Não foi possível carregar as formas de pagamento."
    );
}

export function getBudgetInstallments(): Promise<BudgetInstallment[]> {
    return getData<BudgetInstallment[]>(
        "/api/installments",
        "Não foi possível carregar os parcelamentos."
    );
}

/* -------------------------------------------------------------------------- */
/* Pesquisa de produtos e serviços                                            */
/* -------------------------------------------------------------------------- */

function getSearchEndpoint(field: BudgetSearchField): string {
    return {
        name: "name",
        smCode: "smcode",
        barCode: "barcode"
    }[field];
}

export async function searchBudgetProducts(
    field: BudgetSearchField,
    query: string,
    signal?: AbortSignal
): Promise<BudgetProduct[]> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return [];

    const endpoint = getSearchEndpoint(field);
    const encodedQuery = encodeURIComponent(normalizedQuery);
    const path = `/api/product/${endpoint}/${encodedQuery}`;

    let response: Response;
    try {
        response = await fetch(getApiUrl(path), {
            method: "GET",
            credentials: "include",
            headers: { Accept: "application/json" },
            ...(signal ? { signal } : {})
        });
    } catch (error) {
        if (signal?.aborted) throw error;
        throw new Error("Não foi possível pesquisar produtos. Verifique a conexão e tente novamente.");
    }

    if (response.status === 404) return [];
    const result = await readJson<ApiResponse<BudgetProduct[]>>(response);
    if (!response.ok) {
        throw new Error(getHttpErrorMessage(response.status, result, "Não foi possível pesquisar produtos."));
    }

    return Array.isArray(result?.data) ? result.data : [];
}

export async function searchBudgetServices(
    field: BudgetSearchField,
    query: string,
    signal?: AbortSignal
): Promise<BudgetService[]> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return [];

    const endpoint = getSearchEndpoint(field);
    const encodedQuery = encodeURIComponent(normalizedQuery);
    const path = `/api/service/${endpoint}/${encodedQuery}`;

    let response: Response;
    try {
        response = await fetch(getApiUrl(path), {
            method: "GET",
            credentials: "include",
            headers: { Accept: "application/json" },
            ...(signal ? { signal } : {})
        });
    } catch (error) {
        if (signal?.aborted) throw error;
        throw new Error("Não foi possível pesquisar serviços. Verifique a conexão e tente novamente.");
    }

    if (response.status === 404) return [];
    const result = await readJson<ApiResponse<BudgetService[]>>(response);
    if (!response.ok) {
        throw new Error(getHttpErrorMessage(response.status, result, "Não foi possível pesquisar serviços."));
    }

    return Array.isArray(result?.data) ? result.data : [];
}

export async function searchBudgetItems(
    field: BudgetSearchField,
    query: string,
    signal?: AbortSignal
): Promise<BudgetSearchItem[]> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return [];

    const [productsResult, servicesResult] = await Promise.allSettled([
        searchBudgetProducts(field, normalizedQuery, signal),
        searchBudgetServices(field, normalizedQuery, signal)
    ]);

    if (productsResult.status === "rejected" && servicesResult.status === "rejected") {
        if (signal?.aborted) throw productsResult.reason;
        throw new Error("Não foi possível pesquisar produtos ou serviços.");
    }

    const products: BudgetSearchItem[] = productsResult.status === "fulfilled"
        ? productsResult.value.map((product) => ({
            ...product,
            description: product.description ?? "",
            value: product.value ?? 0,
            amount: product.amount ?? 0,
            unit_measure: product.unit_measure ?? "UN",
            itemType: "product" as const
        }))
        : [];

    const services: BudgetSearchItem[] = servicesResult.status === "fulfilled"
        ? servicesResult.value.map((service) => ({
            ...service,
            description: service.description ?? "",
            value: service.value ?? service.cost ?? 0,
            amount: 0,
            unit_measure: service.unit_measure ?? "UN",
            itemType: "service" as const
        }))
        : [];

    return [...products, ...services];
}

/* -------------------------------------------------------------------------- */
/* Clientes                                                                   */
/* -------------------------------------------------------------------------- */

export function getBudgetClients(
    search = "",
    signal?: AbortSignal
): Promise<BudgetClient[]> {
    const query = new URLSearchParams();
    if (search.trim()) query.set("search", search.trim());

    const suffix = query.toString();
    const path = "/api/clients" + (suffix ? `?${suffix}` : "");
    return getData<BudgetClient[]>(path, "Não foi possível carregar os clientes.", signal);
}

/* -------------------------------------------------------------------------- */
/* Orçamentos                                                                 */
/* -------------------------------------------------------------------------- */

export function getBudgets(signal?: AbortSignal): Promise<BudgetRecord[]> {
    return getData<BudgetRecord[]>(
        "/api/budget",
        "Não foi possível carregar os orçamentos. Verifique se a rota GET /budget está registrada no backend.",
        signal,
        true
    );
}

export function getBudgetById(
    budgetId: number,
    signal?: AbortSignal
): Promise<BudgetDetail> {
    if (!Number.isSafeInteger(Number(budgetId)) || Number(budgetId) <= 0) {
        return Promise.reject(new Error("Informe um identificador de orçamento válido."));
    }

    return getData<BudgetDetail>(
        `/api/budget/${Number(budgetId)}`,
        "Não foi possível carregar o orçamento. Verifique se a rota GET /budget/:budgetId está registrada no backend.",
        signal,
        true
    );
}

export function createBudget(payload: BudgetCreateRequest): Promise<BudgetCreateResult> {
    if (!payload || !Array.isArray(payload.items) || payload.items.length === 0) {
        return Promise.reject(new Error("Adicione pelo menos um produto ou serviço ao orçamento."));
    }

    if (!Number.isFinite(Number(payload.totalValue)) || Number(payload.totalValue) < 0) {
        return Promise.reject(new Error("O valor total do orçamento é inválido."));
    }

    const invalidItem = payload.items.some((item) => {
        const hasProduct = item?.productId !== undefined && item?.productId !== null;
        const hasService = item?.serviceId !== undefined && item?.serviceId !== null;
        return (
            hasProduct === hasService ||
            !Number.isSafeInteger(Number(hasProduct ? item.productId : item.serviceId)) ||
            Number(hasProduct ? item.productId : item.serviceId) <= 0 ||
            !Number.isSafeInteger(Number(item.quantity)) || Number(item.quantity) <= 0 ||
            !Number.isFinite(Number(item.unitPrice)) || Number(item.unitPrice) < 0
        );
    });

    if (invalidItem) {
        return Promise.reject(new Error("Um ou mais itens do orçamento possuem dados inválidos."));
    }

    const requestBody: BudgetCreateRequest = {
        clientId: payload.clientId ?? null,
        totalValue: Number(payload.totalValue),
        items: payload.items.map((item) => ({
            ...(item.productId !== undefined && item.productId !== null
                ? { productId: Number(item.productId) }
                : { serviceId: Number(item.serviceId) }),
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
            unitMeasure: item.unitMeasure?.trim() || "UN"
        }))
    };

    return postData<BudgetCreateResult>(
        "/api/budget",
        requestBody,
        "Não foi possível salvar o orçamento. Verifique se a rota POST /budget está registrada no backend.",
        true
    );
}

export async function deleteBudget(budgetId: number): Promise<BudgetDeleteResult> {
    if (!Number.isSafeInteger(Number(budgetId)) || Number(budgetId) <= 0) {
        throw new Error("Informe um identificador de orçamento válido.");
    }

    const path = `/api/budget/${Number(budgetId)}`;
    const init: RequestInit = {
        method: "DELETE",
        headers: { Accept: "application/json" }
    };

    const response = await fetchBudgetRoute(path, init);
    const result = await readJson<ApiResponse<BudgetDeleteResult>>(response);

    if (!response.ok) {
        if (response.status === 403) throw new Error("Você não tem permissão para excluir orçamentos.");
        if (response.status === 404 && !isMissingRoute(response, result)) {
            throw new Error(result?.message ?? "Orçamento não encontrado.");
        }
        throw new Error(getHttpErrorMessage(
            response.status,
            result,
            "Não foi possível excluir o orçamento. Verifique se a rota DELETE /budget/:budgetId está registrada no backend."
        ));
    }

    if (result?.data == null) {
        throw new Error("O servidor não retornou a confirmação da exclusão do orçamento.");
    }

    return result.data;
}


/* -------------------------------------------------------------------------- */
/* Documento PDF do orçamento                                                 */
/* Requer a rota GET /budget/:budgetId/pdf no backend.                        */
/* -------------------------------------------------------------------------- */

export interface BudgetDocumentFile {
    blob: Blob;
    filename: string;
    contentType: string;
}

function getBudgetDocumentFilename(
    response: Response,
    fallbackFilename: string
): string {
    const disposition = response.headers.get("Content-Disposition");
    if (!disposition) return fallbackFilename;

    const utf8Match = disposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) {
        try {
            return decodeURIComponent(utf8Match[1].trim().replace(/^"|"$/g, ""));
        } catch {
            // Usa o filename convencional.
        }
    }

    const basicMatch = disposition.match(/filename\s*=\s*"?([^";]+)"?/i);
    return basicMatch?.[1]?.trim() || fallbackFilename;
}

export interface BudgetPdfOptions {
    /** Condição meramente estimativa escolhida na tela de orçamento. */
    paymentMethodName?: string | null;
    /** Número estimado de parcelas; não representa pagamento realizado. */
    installmentCount?: number | null;
}

export async function getBudgetPdf(
    budgetId: number,
    options: BudgetPdfOptions = {},
    signal?: AbortSignal
): Promise<BudgetDocumentFile> {
    const id = Number(budgetId);
    if (!Number.isSafeInteger(id) || id <= 0) {
        throw new Error("Informe um identificador de orçamento válido.");
    }

    const query = new URLSearchParams();
    if (options.paymentMethodName?.trim()) {
        query.set("paymentMethodName", options.paymentMethodName.trim());
    }
    if (
        options.installmentCount !== undefined &&
        options.installmentCount !== null &&
        Number.isSafeInteger(Number(options.installmentCount)) &&
        Number(options.installmentCount) > 0
    ) {
        query.set("installmentCount", String(Number(options.installmentCount)));
    }

    const queryString = query.toString();
    const path = `/api/budget/${id}/pdf${queryString ? `?${queryString}` : ""}`;
    const response = await fetchBudgetRoute(path, {
        method: "GET",
        headers: { Accept: "application/pdf" },
        ...(signal ? { signal } : {})
    });

    if (!response.ok) {
        const result = await readJson<ApiResponse<unknown>>(response.clone());
        throw new Error(getHttpErrorMessage(
            response.status,
            result,
            "Não foi possível gerar o PDF do orçamento. Verifique se a rota GET /budget/:budgetId/pdf está registrada no backend."
        ));
    }

    const contentType = (response.headers.get("Content-Type") ?? "").toLowerCase();
    if (!contentType.includes("application/pdf")) {
        const body = await response.text();
        let message = "O servidor não retornou um PDF válido.";
        try {
            const parsed = JSON.parse(body) as ApiResponse<unknown>;
            message = parsed.message ?? message;
        } catch {
            // A resposta não era JSON.
        }
        throw new Error(message);
    }

    const blob = await response.blob();
    if (!blob.size) {
        throw new Error("O servidor retornou um PDF vazio.");
    }

    return {
        blob,
        filename: getBudgetDocumentFilename(response, `orcamento-${id}.pdf`),
        contentType
    };
}
