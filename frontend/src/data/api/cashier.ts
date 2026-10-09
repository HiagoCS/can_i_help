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

export interface CashierService {
    id: number;
    sm_code?: string;
    bar_code?: string;
    name: string;
    description?: string;
    value: string | number;
    amount?: string | number;
    unit_measure?: string;
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
export type CashierSearchField = ProductSearchField;

const appEnv = (import.meta as AppImportMeta).env;

function getApiUrl(path: string): string {
    const apiBaseUrl = appEnv.DEV
        ? ""
        : (appEnv.VITE_API_URL ?? "").replace(/\/+$/, "");

    return `${apiBaseUrl}${path}`;
}

function getSaleEndpoint(id: number): string {
    if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) {
        throw new Error("Informe um identificador de venda válido.");
    }

    return `/api/cashier/${Number(id)}`;
}

async function getErrorMessage(
    response: Response,
    fallbackMessage: string
): Promise<string> {
    if (response.status === 401) {
        return "Sua sessão expirou. Entre novamente no sistema.";
    }

    const result = await response
        .clone()
        .json()
        .catch(() => null) as ApiResponse<unknown> | null;

    return result?.message ?? fallbackMessage;
}

/* -------------------------------------------------------------------------- */
/* Requisições genéricas                                                      */
/* -------------------------------------------------------------------------- */

async function getData<T>(
    path: string,
    signal?: AbortSignal
): Promise<T> {
    let response: Response;

    try {
        response = await fetch(getApiUrl(path), {
            method: "GET",
            credentials: "include",
            ...(signal ? { signal } : {})
        });
    } catch (error) {
        if (signal?.aborted) {
            throw error;
        }

        throw new Error(
            "Não foi possível conectar ao servidor. Verifique a conexão e tente novamente."
        );
    }

    const result = await response
        .json()
        .catch(() => null) as ApiResponse<T> | null;

    if (!response.ok) {
        throw new Error(
            result?.message ??
            (response.status === 401
                ? "Sua sessão expirou. Entre novamente no sistema."
                : "Não foi possível carregar os dados do Caixa.")
        );
    }

    if (result?.data === undefined || result.data === null) {
        throw new Error("O servidor retornou uma resposta inválida.");
    }

    return result.data;
}

async function postData<T>(
    path: string,
    payload: unknown
): Promise<T> {
    let response: Response;

    try {
        response = await fetch(getApiUrl(path), {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });
    } catch {
        throw new Error(
            "Não foi possível conectar ao servidor. Verifique a conexão e tente novamente."
        );
    }

    const result = await response
        .json()
        .catch(() => null) as ApiResponse<T> | null;

    if (!response.ok) {
        throw new Error(
            result?.message ??
            (response.status === 401
                ? "Sua sessão expirou. Entre novamente no sistema."
                : "Não foi possível concluir a operação.")
        );
    }

    if (result?.data === undefined || result.data === null) {
        throw new Error("O servidor retornou uma resposta inválida.");
    }

    return result.data;
}

/* -------------------------------------------------------------------------- */
/* Documentos                                                                 */
/* -------------------------------------------------------------------------- */

export interface CashierDocumentFile {
    blob: Blob;
    filename: string;
    contentType: string;
}

function getDocumentFilename(
    response: Response,
    fallbackFilename: string
): string {
    const disposition = response.headers.get("Content-Disposition");

    if (!disposition) {
        return fallbackFilename;
    }

    const utf8Match = disposition.match(
        /filename\*\s*=\s*UTF-8''([^;]+)/i
    );

    if (utf8Match?.[1]) {
        try {
            return decodeURIComponent(
                utf8Match[1].trim().replace(/^"|"$/g, "")
            );
        } catch {
            // Continua para o nome de arquivo convencional.
        }
    }

    const basicMatch = disposition.match(
        /filename\s*=\s*"?([^";]+)"?/i
    );

    return basicMatch?.[1]?.trim() || fallbackFilename;
}

async function getDocument(
    path: string,
    fallbackFilename: string,
    fallbackMessage: string,
    signal?: AbortSignal
): Promise<CashierDocumentFile> {
    let response: Response;

    try {
        response = await fetch(getApiUrl(path), {
            method: "GET",
            credentials: "include",
            headers: {
                Accept: "application/pdf"
            },
            ...(signal ? { signal } : {})
        });
    } catch (error) {
        if (signal?.aborted) {
            throw error;
        }

        throw new Error(
            "Não foi possível conectar ao servidor para obter o documento."
        );
    }

    if (!response.ok) {
        throw new Error(
            await getErrorMessage(response, fallbackMessage)
        );
    }

    const contentType = (
        response.headers.get("Content-Type") ?? ""
    ).toLowerCase();

    if (!contentType.includes("application/pdf")) {
        const body = await response.text();
        let message = "O servidor não retornou um PDF válido.";

        try {
            const result = JSON.parse(body) as ApiResponse<unknown>;
            message = result.message ?? message;
        } catch {
            // A resposta não é JSON.
        }

        throw new Error(message);
    }

    const blob = await response.blob();

    if (blob.size === 0) {
        throw new Error("O servidor retornou um documento vazio.");
    }

    return {
        blob,
        filename: getDocumentFilename(response, fallbackFilename),
        contentType
    };
}

/**
 * Abre o PDF em uma nova aba.
 *
 * A aba é aberta imediatamente durante a interação do usuário
 * para evitar bloqueadores de pop-up.
 */
async function openCashierDocument(
    saleId: number,
    document: "pdf" | "coupon" | "danfe"
): Promise<void> {
    if (!Number.isSafeInteger(saleId) || saleId <= 0) {
        throw new Error("Identificador da venda inválido.");
    }

    const base = getSaleEndpoint(saleId);

    const endpoints = {
        pdf: `${base}/pdf`,
        coupon: `${base}/coupon`,
        danfe: `${base}/danfe/pdf`
    };

    const tab = window.open("", "_blank");

    if (!tab) {
        throw new Error(
            "O navegador bloqueou a abertura do documento. Permita pop-ups para este sistema."
        );
    }

    tab.document.title = "Carregando documento...";
    tab.document.body.textContent = "Gerando documento, aguarde...";

    try {
        const fallbackMessages = {
            pdf: "Não foi possível gerar o PDF da venda.",
            coupon: "Não foi possível gerar o cupom para impressão.",
            danfe: "Não foi possível obter o DANFE. Verifique se a NF-e foi autorizada e se o PDF está disponível."
        };

        const file = await getDocument(
            endpoints[document],
            `${document === "coupon"
                ? "cupom"
                : document === "danfe"
                    ? "danfe"
                    : "venda"}-${saleId}.pdf`,
            fallbackMessages[document]
        );

        const objectUrl = URL.createObjectURL(file.blob);
        tab.location.href = objectUrl;

        window.setTimeout(() => {
            URL.revokeObjectURL(objectUrl);
        }, 60_000);
    } catch (error) {
        tab.close();

        throw error instanceof Error
            ? error
            : new Error("Não foi possível abrir o documento.");
    }
}

export function openCashierSalePdf(saleId: number): Promise<void> {
    return openCashierDocument(saleId, "pdf");
}

export function openCashierFiscalCoupon(saleId: number): Promise<void> {
    return openCashierDocument(saleId, "coupon");
}

export function openCashierDanfe(saleId: number): Promise<void> {
    return openCashierDocument(saleId, "danfe");
}

/* -------------------------------------------------------------------------- */
/* Pagamentos                                                                 */
/* -------------------------------------------------------------------------- */

export function getCashierPaymentMethods(): Promise<CashierPaymentMethod[]> {
    return getData<CashierPaymentMethod[]>("/api/payment-methods");
}

export function getCashierInstallments(): Promise<CashierInstallment[]> {
    return getData<CashierInstallment[]>("/api/installments");
}

/* -------------------------------------------------------------------------- */
/* Pesquisa de serviços                                                       */
/* -------------------------------------------------------------------------- */

export async function searchCashierServices(
    field: CashierSearchField,
    query: string,
    signal?: AbortSignal
): Promise<CashierService[]> {
    const normalizedQuery = query.trim();

    if (!normalizedQuery) {
        return [];
    }

    const endpoint = {
        name: "name",
        smCode: "smcode",
        barCode: "barcode"
    }[field];

    const encodedQuery = encodeURIComponent(normalizedQuery);

    let response: Response;

    try {
        response = await fetch(
            getApiUrl(`/api/service/${endpoint}/${encodedQuery}`),
            {
                method: "GET",
                credentials: "include",
                ...(signal ? { signal } : {})
            }
        );
    } catch (error) {
        if (signal?.aborted) {
            throw error;
        }

        throw new Error(
            "Não foi possível pesquisar serviços. Verifique a conexão e tente novamente."
        );
    }

    if (response.status === 404) {
        return [];
    }

    const result = await response
        .json()
        .catch(() => null) as ApiResponse<CashierService[]> | null;

    if (!response.ok) {
        throw new Error(
            result?.message ??
            (response.status === 401
                ? "Sua sessão expirou. Entre novamente no sistema."
                : "Não foi possível pesquisar serviços.")
        );
    }

    return Array.isArray(result?.data) ? result.data : [];
}

/* -------------------------------------------------------------------------- */
/* Produtos                                                                   */
/* -------------------------------------------------------------------------- */

export async function searchCashierProducts(
    field: ProductSearchField,
    query: string,
    signal?: AbortSignal
): Promise<CashierProduct[]> {
    const normalizedQuery = query.trim();

    if (!normalizedQuery) {
        return [];
    }

    const endpoint = {
        name: "name",
        smCode: "smcode",
        barCode: "barcode"
    }[field];

    const encodedQuery = encodeURIComponent(normalizedQuery);

    let response: Response;

    try {
        response = await fetch(
            getApiUrl(`/api/product/${endpoint}/${encodedQuery}`),
            {
                method: "GET",
                credentials: "include",
                ...(signal ? { signal } : {})
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

    const result = await response
        .json()
        .catch(() => null) as ApiResponse<CashierProduct[]> | null;

    if (!response.ok) {
        throw new Error(
            result?.message ??
            (response.status === 401
                ? "Sua sessão expirou. Entre novamente no sistema."
                : "Não foi possível pesquisar produtos.")
        );
    }

    return Array.isArray(result?.data) ? result.data : [];
}
export type CashierSearchItem =
    | (CashierProduct & {
        itemType: "product";
    })
    | (CashierProduct & {
        itemType: "service";
    });

export async function searchCashierItems(
    field: CashierSearchField,
    query: string,
    signal?: AbortSignal
): Promise<CashierSearchItem[]> {
    const normalizedQuery = query.trim();

    if (!normalizedQuery) {
        return [];
    }

    const [productsResult, servicesResult] = await Promise.allSettled([
        searchCashierProducts(field, normalizedQuery, signal),
        searchCashierServices(field, normalizedQuery, signal)
    ]);

    if (
        productsResult.status === "rejected" &&
        servicesResult.status === "rejected"
    ) {
        throw new Error(
            "Não foi possível pesquisar produtos ou serviços."
        );
    }

    const products: CashierSearchItem[] =
        productsResult.status === "fulfilled"
            ? productsResult.value.map((product) => ({
                ...product,
                itemType: "product" as const
            }))
            : [];

    const services: CashierSearchItem[] =
        servicesResult.status === "fulfilled"
            ? servicesResult.value.map((service) => ({
                id: service.id,
                sm_code: service.sm_code ?? "",
                bar_code: service.bar_code ?? "",
                name: service.name,
                description: service.description ?? "",
                value: service.value,
                amount: 0,
                unit_measure: service.unit_measure ?? "UN",
                status: service.status,
                itemType: "service" as const
            }))
            : [];

    return [...products, ...services];
}

/* -------------------------------------------------------------------------- */
/* Vendas                                                                      */
/* -------------------------------------------------------------------------- */

export interface CashierSale {
    id: number;
    total_value: string | number;
    dt_sale: string;
    client_name: string | null;
    client_tax_id?: string | null;
    fiscal_invoice_status?:
        | "pending"
        | "signed"
        | "processing"
        | "authorized"
        | "rejected"
        | "cancelled"
        | null;
    danfe_available: boolean;
}

export function getCashierSales(): Promise<CashierSale[]> {
    return getData<CashierSale[]>("/api/cashier");
}

export interface CashierSaleItemInput {
    productId?: number;
    serviceId?: number;
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

export type CashierNFeStatus =
    | "not_sent"
    | "processing"
    | "authorized"
    | "rejected"
    | "cancelled"
    | "error";

export interface CashierNFeTransmissionResult {
    sale_id: number;
    status: CashierNFeStatus;
    message: string;
    access_key: string | null;
    protocol: string | null;
    sefaz_status_code: string | null;
    sefaz_reason: string | null;
    authorized_at: string | null;
    response_saved: boolean;
    danfe_available: boolean;
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
    danfe_available: boolean;
    nfe_status?: CashierNFeStatus | null;
    nfe_access_key?: string | null;
    nfe_protocol?: string | null;
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

export async function createCashierSale(
    payload: CashierSaleRequest
): Promise<CashierCompletedSale> {
    let response: Response;

    try {
        response = await fetch(getApiUrl("/api/cashier"), {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });
    } catch {
        throw new Error(
            "Não foi possível conectar ao servidor. A venda não foi registrada."
        );
    }

    const result = await response
        .json()
        .catch(() => null) as ApiResponse<CashierCompletedSale> | null;

    if (!response.ok) {
        throw new Error(
            result?.message ??
            (response.status === 401
                ? "Sua sessão expirou. Entre novamente no sistema."
                : "Não foi possível registrar a venda.")
        );
    }

    if (!result?.data) {
        throw new Error(
            "O servidor não retornou os dados da venda registrada."
        );
    }

    return result.data;
}
/* -------------------------------------------------------------------------- */
/* Exclusão de vendas                                                         */
/* -------------------------------------------------------------------------- */

export interface CashierDeletedStockItem {
    productId: number;
    name: string;
    quantity: number;
}

export interface CashierDeleteSaleResult {
    saleId: number;
    totalValue: string | number;
    restoredStock: CashierDeletedStockItem[];
    removedInternalDocuments: number;
    removedFiles: number;
}

export async function deleteCashierSale(
    saleId: number
): Promise<CashierDeleteSaleResult> {

    // Valida e monta a rota usando o helper já existente.
    const endpoint = getSaleEndpoint(saleId);

    let response: Response;

    try {
        response = await fetch(getApiUrl(endpoint), {
            method: "DELETE",
            credentials: "include",
            headers: {
                Accept: "application/json"
            }
        });
    } catch {
        throw new Error(
            "Não foi possível conectar ao servidor. " +
            "Não foi possível confirmar a exclusão da venda."
        );
    }

    const result = await response
        .json()
        .catch(() => null) as ApiResponse<CashierDeleteSaleResult> | null;

    if (!response.ok) {
        if (response.status === 401) {
            throw new Error(
                "Sua sessão expirou. Entre novamente no sistema."
            );
        }

        if (response.status === 403) {
            throw new Error(
                "Você não tem permissão para excluir vendas."
            );
        }

        if (response.status === 404) {
            throw new Error(
                result?.message ?? "Venda não encontrada."
            );
        }

        if (response.status === 409) {
            throw new Error(
                result?.message ??
                "A venda não pode ser excluída devido a vínculos fiscais."
            );
        }

        throw new Error(
            result?.message ??
            "Não foi possível excluir a venda."
        );
    }

    if (!result?.data) {
        throw new Error(
            "O servidor não retornou a confirmação da exclusão."
        );
    }

    return result.data;
}
/* -------------------------------------------------------------------------- */
/* Documentos da venda                                                        */
/* -------------------------------------------------------------------------- */

export function getCashierSalePdf(
    saleId: number,
    signal?: AbortSignal
): Promise<CashierDocumentFile> {
    const base = getSaleEndpoint(saleId);

    return getDocument(
        `${base}/pdf`,
        `venda-${saleId}.pdf`,
        "Não foi possível gerar o PDF da venda.",
        signal
    );
}

export function getCashierFiscalCoupon(
    saleId: number,
    signal?: AbortSignal
): Promise<CashierDocumentFile> {
    const base = getSaleEndpoint(saleId);

    return getDocument(
        `${base}/coupon`,
        `cupom-${saleId}.pdf`,
        "Não foi possível gerar o cupom para impressão.",
        signal
    );
}

export function transmitCashierSaleToSefaz(
    saleId: number
): Promise<CashierNFeTransmissionResult> {
    const base = getSaleEndpoint(saleId);

    return postData<CashierNFeTransmissionResult>(
        `${base}/nfe/authorize`,
        {}
    );
}

export function getCashierDanfePdf(
    saleId: number,
    signal?: AbortSignal
): Promise<CashierDocumentFile> {
    const base = getSaleEndpoint(saleId);

    return getDocument(
        `${base}/danfe/pdf`,
        `danfe-${saleId}.pdf`,
        "Não foi possível gerar o DANFE. Verifique se a NF-e foi autorizada pela SEFAZ.",
        signal
    );
}

/* -------------------------------------------------------------------------- */
/* Clientes                                                                    */
/* -------------------------------------------------------------------------- */

export interface CashierClient {
    id: number;
    name: string;
    cpf: string | null;
    cnpj: string | null;
}

export function getCashierClients(
    search = "",
    signal?: AbortSignal
): Promise<CashierClient[]> {
    return getData<CashierClient[]>(
        `/api/clients?search=${encodeURIComponent(search.trim())}`,
        signal
    );
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
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });
    } catch {
        throw new Error(
            "Não foi possível conectar ao servidor para cadastrar o cliente."
        );
    }

    const result = await response
        .json()
        .catch(() => null) as ApiResponse<CashierClient> | null;

    if (!response.ok) {
        throw new Error(
            result?.message ??
            (response.status === 401
                ? "Sua sessão expirou. Entre novamente no sistema."
                : "Não foi possível cadastrar o cliente.")
        );
    }

    if (!result?.data) {
        throw new Error(
            "O servidor não retornou os dados do cliente cadastrado."
        );
    }

    return result.data;
}
