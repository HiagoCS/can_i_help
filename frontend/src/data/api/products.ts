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
}

export interface ProductPayload {
  sm_code?: string;
  bar_code?: string;
  name: string;
  description: string | null;
  value: string | number;
  cost: string | number;
  amount?: string | number;
  status?: number | boolean;
}

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

function url(path: string) {
  return (
    (env.DEV ? "" : (env.VITE_API_URL ?? "").replace(/\/+$/, "")) +
    path
  );
}

async function requestData<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;

  const headers = new Headers(options.headers);

  // Só define JSON quando a requisição possui corpo.
  if (options.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  try {
    response = await fetch(url(path), {
      ...options,
      credentials: "include",
      headers,
    });
  } catch {
    throw new Error("Não foi possível conectar ao servidor.");
  }

  const result = (await response.json().catch(() => null)) as
    | ApiResponse<T>
    | null;

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error(
        "Sua sessão expirou. Entre novamente no sistema.",
      );
    }

    throw new Error(
      result?.message ?? "Não foi possível concluir a operação.",
    );
  }

  if (result?.data == null) {
    throw new Error("O servidor retornou uma resposta inválida.");
  }

  return result.data;
}

export function getProducts(signal?: AbortSignal) {
  return requestData<ProductRecord[]>("/api/products", requestOptions(signal));
}

export function getProductStock(signal?: AbortSignal) {
  return requestData<ProductStockSummary[]>(
    "/api/products/stock",
    requestOptions(signal),
  );
}

export function getProductReports(
  range: { from?: string; to?: string } = {},
  signal?: AbortSignal,
) {
  const query = new URLSearchParams();

  if (range.from) query.set("from", range.from);
  if (range.to) query.set("to", range.to);

  const suffix = query.toString();

  return requestData<ProductReportRow[]>(
    "/api/products/reports" + (suffix ? "?" + suffix : ""),
    requestOptions(signal),
  );
}

export function getProductMovements(
  id: number,
  signal?: AbortSignal,
) {
  return requestData<ProductMovement[]>(
    "/api/product/" + id + "/stock-movements",
    requestOptions(signal),
  );
}

export function createProduct(data: ProductPayload) {
  return requestData<ProductRecord>("/api/product/new", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateProduct(
  id: number,
  data: Partial<ProductPayload>,
) {
  return requestData<ProductRecord>("/api/product/" + id, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function adjustProductStock(
  id: number,
  direction: "add" | "remove",
  quantity = 1,
  notes = "",
) {
  return requestData<ProductRecord>(
    "/api/product/" + id + "/stock-movement",
    {
      method: "POST",
      body: JSON.stringify({ direction, quantity, notes }),
    },
  );
}

export function deleteProduct(id: number) {
  return requestData<ProductRecord>("/api/product/" + id, {
    method: "DELETE",
  });
}
