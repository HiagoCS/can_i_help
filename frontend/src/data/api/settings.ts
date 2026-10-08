interface ApiResponse<T> {
    message?: string;
    data?: T;
}

interface SettingsImportMeta extends ImportMeta {
    env: {
        DEV: boolean;
        VITE_API_URL?: string;
    };
}

const appEnv = (import.meta as SettingsImportMeta).env;

function getApiUrl(path: string) {
    const apiBaseUrl = appEnv.DEV
        ? ""
        : (appEnv.VITE_API_URL ?? "").replace(/\/+$/, "");

    return apiBaseUrl + path;
}

async function request<T>(path: string, options: RequestInit = {}) {
    let response: Response;

    try {
        response = await fetch(getApiUrl(path), {
            credentials: "include",
            ...options,
            headers: {
                ...(options.body && !(options.body instanceof FormData)
                    ? { "Content-Type": "application/json" }
                    : {}),
                ...options.headers
            }
        });
    } catch {
        throw new Error("Não foi possível conectar ao servidor.");
    }

    const result = response.status === 204
        ? null
        : await response.json().catch(() => null) as ApiResponse<T> | null;

    if (!response.ok) {
        const message = result?.message ?? (
            response.status === 403
                ? "Seu nível de acesso não permite esta configuração."
                : "Não foi possível concluir a operação."
        );
        throw new Error(message);
    }

    return result?.data as T;
}

function jsonBody(body: unknown): RequestInit {
    return {
        method: "PUT",
        body: JSON.stringify(body)
    };
}

export function getCriticalSettings() {
    return request<{
        company: Record<string, unknown> | null;
        fiscal: Record<string, unknown> | null;
        certificate: {
            exists: boolean;
            status: boolean;
            valid_from: string | null;
            valid_until: string | null;
            is_valid: boolean;
        };
        users: Array<{ id: number; email: string; status: number }>;
    }>("/api/settings/critical");
}

export function getSettingsUsers() {
    return request<Array<{
        id: number;
        email: string;
        avatar?: string | null;
        status: number;
        roles: Array<{ id: number; name: string; level: number }>;
    }>>("/api/users");
}

export function getRoles() {
    return request<Array<{ id: number; name: string; level: number }>>("/api/roles");
}

export function updateMyProfile(data: { email: string; password?: string }) {
    return request<{
        id: number;
        email: string;
        avatar?: string | null;
        status?: number;
        roles?: Array<{ id: number; name: string; level: number }>;
    }>("/api/me", {
        method: "PUT",
        body: JSON.stringify(data)
    });
}

export async function uploadProfileAvatar(file: File) {
    const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Não foi possível ler a imagem selecionada."));
        reader.onload = () => {
            const result = String(reader.result ?? "");
            const separator = result.indexOf(",");
            if (separator < 0) {
                reject(new Error("Formato de imagem inválido."));
                return;
            }
            resolve(result.slice(separator + 1));
        };
        reader.readAsDataURL(file);
    });

    return request<{ avatar: string }>("/api/settings/avatar", {
        method: "POST",
        body: JSON.stringify({ data, content_type: file.type })
    });
}

export function saveCompany(data: Record<string, unknown>) {
    return request<Record<string, unknown>>("/api/settings/company", jsonBody(data));
}

export function saveFiscalSettings(data: Record<string, unknown>) {
    return request<Record<string, unknown>>("/api/settings/fiscal", jsonBody(data));
}

export function saveCertificate(data: {
    certificate_data: string;
    password: string;
    valid_from: string;
    valid_until: string;
}) {
    return request<{
        exists: boolean;
        status: boolean;
        valid_from: string | null;
        valid_until: string | null;
        is_valid: boolean;
    }>("/api/settings/certificate", jsonBody(data));
}

export function setCertificateActive(active: boolean) {
    return request<{
        exists: boolean;
        status: boolean;
        valid_from: string | null;
        valid_until: string | null;
        is_valid: boolean;
    }>("/api/settings/certificate/status", jsonBody({ active }));
}

export async function removeCertificate() {
    await request<void>("/api/settings/certificate", { method: "DELETE" });
}

export function updateSettingsUser(id: number, data: { status: number; roles: number[] }) {
    return request<Record<string, unknown>>("/api/user/" + id, jsonBody(data));
}

export function getPresenceSocketUrl() {
    const configuredBase = appEnv.VITE_API_URL?.replace(/\/+$/, "");
    const base = configuredBase || window.location.origin;
    const url = new URL(base, window.location.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = url.pathname.replace(/\/+$/, "") + "/api/settings/presence";
    url.search = "";
    url.hash = "";
    return url.toString();
}

export function createSettingsUser(data: { email: string; password: string; roles: number[] }) {
    return request<{
        id: number;
        email: string;
        status: number;
        roles: Array<{ id: number; name: string; level: number }>;
    }>("/api/user/new", {
        method: "POST",
        body: JSON.stringify(data)
    });
}