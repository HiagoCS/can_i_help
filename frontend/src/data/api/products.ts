
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

export interface ProductRecord {
    id: number;
    sm_code: string;
    bar_code: string;
    name: string;
    description: string | null;
    value: string | number | null;
    cost: string | number | null;
    amount: string | number | null;
    status: number | boolean;
    unit_measure?: string | null;
}

/**
 * Campos permitidos para cadastrar um produto.
 * Os códigos podem ser gerados automaticamente pelo backend.
 */
export interface ProductPayload {
    name: string;
    sm_code?: string;
    bar_code?: string;
    cost: string | number;
    value: string | number;
    amount: string | number;
}

/**
 * Campos aceitos pela rota PUT de produtos.
 * Todos são opcionais para permitir atualizações parciais.
 */
export interface ProductUpdatePayload {
    name?: string;
    sm_code?: string;
    bar_code?: string;
    description?: string | null;
    value?: string | number | null;
    cost?: string | number | null;
    amount?: string | number | null;
    status?: number | boolean;
}

export const PRODUCT_COST_HELP =
    "Informe quanto você paga pelo produto. O sistema utiliza esse valor para comparar com o preço de venda e calcular o lucro estimado.";

export interface ProductMovement {
    id: number;
    product_id: number;
    movement_type: string;
    qunt_remove: number;
    qunt_add: number;
    dt_update: string;
    reference_id: number | null;
    movement_value: string | number | null;
    notes: string | null;
    sm_code: string;
    bar_code: string;
    name: string;
    description: string | null;
    value: string | number | null;
    cost: string | number | null;
    amount: string | number | null;
}

export interface ProductStockSummary extends ProductRecord {
    latest_entry: ProductMovement | null;
    latest_sale: ProductMovement | null;
    latest_exit: ProductMovement | null;
}

export interface ProductReportRow {
    id: number;
    name: string;
    units_purchased: number;
    units_sold: number;
    units_lost: number;
    entry_cost: number;
    sales_cost: number;
    loss_cost: number;
    revenue: number;
    unknown_sale_cost_count: number;
    unknown_loss_cost_count: number;
}

const env = (import.meta as AppImportMeta).env;

function requestOptions(signal?: AbortSignal): RequestInit {
    return signal ? { signal } : {};
}

function url(path: string): string {
    const baseUrl = env.DEV
        ? ""
        : (env.VITE_API_URL ?? "").replace(/\/+$/, "");

    return `${baseUrl}${path}`;
}

async function requestData<T>(
    path: string,
    options: RequestInit = {}
): Promise<T> {
    let response: Response;

    const headers = new Headers(options.headers);

    if (options.body != null && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }

    try {
        response = await fetch(url(path), {
            ...options,
            credentials: "include",
            headers
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
            result?.message ??
                "O servidor retornou uma resposta inválida."
        );
    }

    return result.data;
}

/**
 * Prepara exclusivamente os campos aceitos no cadastro.
 * Códigos vazios são omitidos para permitir a geração pelo backend.
 */
function buildCreateProductPayload(
    data: ProductPayload
): ProductPayload {
    const payload: ProductPayload = {
        name: data.name.trim(),
        cost: data.cost,
        value: data.value,
        amount: data.amount
    };

    const smCode = data.sm_code?.trim();

    if (smCode) {
        payload.sm_code = smCode;
    }

    const barCode = data.bar_code?.trim();

    if (barCode) {
        payload.bar_code = barCode;
    }

    return payload;
}

/**
 * Prepara os campos enviados na edição.
 *
 * Campos undefined não são enviados, portanto não sobrescrevem
 * os valores atuais do produto no backend.
 *
 * Valores 0 e false são preservados.
 * A descrição pode ser enviada como null ou string vazia.
 */
function buildUpdateProductPayload(
    data: ProductUpdatePayload
): Partial<ProductUpdatePayload> {
    const payload: Partial<ProductUpdatePayload> = {};

    if (data.name !== undefined) {
        payload.name = data.name.trim();
    }

    if (data.sm_code !== undefined) {
        const smCode = data.sm_code.trim();

        if (smCode) {
            payload.sm_code = smCode;
        }
    }

    if (data.bar_code !== undefined) {
        const barCode = data.bar_code.trim();

        if (barCode) {
            payload.bar_code = barCode;
        }
    }

    if (data.description !== undefined) {
        payload.description = data.description;
    }

    if (data.cost !== undefined && data.cost !== null) {
        payload.cost = data.cost;
    }

    if (data.value !== undefined && data.value !== null) {
        payload.value = data.value;
    }

    if (data.amount !== undefined && data.amount !== null) {
        payload.amount = data.amount;
    }

    if (data.status !== undefined) {
        payload.status = data.status;
    }

    return payload;
}

export function getProducts(signal?: AbortSignal) {
    return requestData<ProductRecord[]>(
        "/api/products",
        requestOptions(signal)
    );
}

export function getProductStock(signal?: AbortSignal) {
    return requestData<ProductStockSummary[]>(
        "/api/products/stock",
        requestOptions(signal)
    );
}

export function getProductReports(
    range: { from?: string; to?: string } = {},
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

    return requestData<ProductReportRow[]>(
        "/api/products/reports" + (suffix ? `?${suffix}` : ""),
        requestOptions(signal)
    );
}

export function getProductMovements(
    id: number,
    signal?: AbortSignal
) {
    return requestData<ProductMovement[]>(
        `/api/product/${id}/stock-movements`,
        requestOptions(signal)
    );
}

/**
 * Cadastra um produto.
 */
export function createProduct(data: ProductPayload) {
    return requestData<ProductRecord>("/api/product/new", {
        method: "POST",
        body: JSON.stringify(buildCreateProductPayload(data))
    });
}

/**
 * Atualiza um produto existente.
 *
 * Permite enviar somente os campos alterados.
 * A rota backend continua responsável por validar os dados,
 * aplicar as alterações e registrar as movimentações de estoque.
 */
export function updateProduct(
    id: number,
    data: ProductUpdatePayload
): Promise<ProductRecord> {
    if (!Number.isInteger(id) || id <= 0) {
        return Promise.reject(
            new Error("O identificador do produto é inválido.")
        );
    }

    const payload = buildUpdateProductPayload(data);

    if (Object.keys(payload).length === 0) {
        return Promise.reject(
            new Error("Informe pelo menos um campo para atualizar.")
        );
    }

    return requestData<ProductRecord>(`/api/product/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload)
    });
}

/**
 * Registra uma entrada ou saída de estoque.
 */
export function adjustProductStock(
    id: number,
    direction: "add" | "remove",
    quantity = 1,
    notes = ""
) {
    return requestData<ProductRecord>(
        `/api/product/${id}/stock-movement`,
        {
            method: "POST",
            body: JSON.stringify({
                direction,
                quantity,
                notes
            })
        }
    );
}

/**
 * Exclui um produto.
 */
export function deleteProduct(id: number) {
    return requestData<ProductRecord>(`/api/product/${id}`, {
        method: "DELETE"
    });
}
