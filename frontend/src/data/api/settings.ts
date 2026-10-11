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

function getApiUrl(path: string): string {
    const apiBaseUrl = appEnv.DEV
        ? ""
        : (appEnv.VITE_API_URL ?? "").replace(/\/+$/, "");

    return apiBaseUrl + path;
}

async function request<T>(
    path: string,
    options: RequestInit = {}
): Promise<T> {
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
            response.status === 401
                ? "Sua sessão expirou. Entre novamente no sistema."
                : response.status === 403
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

/* -------------------------------------------------------------------------- */
/* Tipos de configurações gerais do sistema                                   */
/* -------------------------------------------------------------------------- */

export interface SettingsRole {
    id?: number;
    name: string;
    level: number;
    status: number | boolean;
}

export interface SettingsUnitMeasure {
    unity: string;
    description?: string | null;
}

export interface SystemConfigInput {
    pixKey?: string;
    roles?: SettingsRole[];
    unit_measure?: SettingsUnitMeasure;
}

export interface SystemConfigRoleResult {
    id: number;
    name: string;
    level: number;
    status: boolean | number;
}

export type SystemConfigSaveItem =
    | { pix_key: string }
    | { roles: SystemConfigRoleResult[] }
    | {
        unit_measure: {
            id: number;
            unity: string;
            description: string | null;
        };
    };

/* -------------------------------------------------------------------------- */
/* Configurações críticas gerais                                              */
/* -------------------------------------------------------------------------- */

export function getCriticalSettings() {
    return request<{
        company: Record<string, unknown> | null;
        users: Array<{
            id: number;
            email: string;
            status: number;
        }>;
    }>("/api/settings/critical");
}

export function getSettingsUsers() {
    return request<Array<{
        id: number;
        email: string;
        avatar?: string | null;
        status: number;
        roles: Array<{
            id: number;
            name: string;
            level: number;
        }>;
    }>>("/api/users");
}

/* -------------------------------------------------------------------------- */
/* Configurações do sistema                                                   */
/* -------------------------------------------------------------------------- */

export function getSystemConfig() {
    return request<Array<{
        pixKey: string | null;
    }>>("/api/settings/system-config", {
        method: "GET"
    });
}

export function saveSystemConfig(data: SystemConfigInput) {
    return request<SystemConfigSaveItem[]>(
        "/api/settings/system-config",
        jsonBody(data)
    );
}

export function getRoles() {
    return request<Array<{
        id: number;
        name: string;
        level: number;
        status?: number | boolean;
    }>>("/api/roles");
}

/* -------------------------------------------------------------------------- */
/* Backup e restauração do banco SQLite                                       */
/* -------------------------------------------------------------------------- */

export interface DatabaseImportResult {
    imported: boolean;
    tablesImported: number;
    sizeBytes: number;
}

/**
 * Extrai o nome do arquivo enviado no Content-Disposition.
 * Suporta filename* (UTF-8) e filename convencional.
 */
function getDatabaseDownloadFilename(
    response: Response,
    fallback = "posso-ajudar-backup.sqlite"
): string {
    const disposition = response.headers.get("Content-Disposition");

    if (!disposition) {
        return fallback;
    }

    const utf8Match = disposition.match(
        /filename\*\s*=\s*UTF-8''([^;]+)/i
    );

    if (utf8Match?.[1]) {
        try {
            const filename = decodeURIComponent(
                utf8Match[1].trim().replace(/^"|"$/g, "")
            );

            return filename.replace(/[\\/]/g, "_") || fallback;
        } catch {
            // Tenta o formato convencional abaixo.
        }
    }

    const basicMatch = disposition.match(
        /filename\s*=\s*"?([^";]+)"?/i
    );

    const filename = basicMatch?.[1]?.trim();

    return filename
        ? filename.replace(/[\\/]/g, "_")
        : fallback;
}

/**
 * Lê uma mensagem de erro retornada pelo backend.
 * O download e a importação retornam JSON quando ocorrem erros.
 */
async function getDatabaseOperationError(
    response: Response,
    fallback: string
): Promise<string> {
    if (response.status === 401) {
        return "Sua sessão expirou. Entre novamente no sistema.";
    }

    if (response.status === 403) {
        return "Seu nível de acesso não permite esta operação.";
    }

    const body = await response.text().catch(() => "");

    if (body) {
        try {
            const result = JSON.parse(body) as ApiResponse<unknown>;

            if (typeof result.message === "string" && result.message.trim()) {
                return result.message;
            }
        } catch {
            // Evita exibir HTML ou conteúdo interno do servidor ao usuário.
        }
    }

    return fallback;
}

/**
 * GET /api/settings/database/download
 *
 * Baixa o backup SQLite gerado pelo backend.
 * O arquivo é recebido como Blob e salvo pelo navegador.
 */
export async function downloadSystemDatabase(): Promise<void> {
    let response: Response;

    try {
        response = await fetch(
            getApiUrl("/api/settings/database/download"),
            {
                method: "GET",
                credentials: "include",
                headers: {
                    Accept: "application/vnd.sqlite3, application/octet-stream"
                }
            }
        );
    } catch {
        throw new Error(
            "Não foi possível conectar ao servidor para baixar o banco de dados."
        );
    }

    if (!response.ok) {
        throw new Error(
            await getDatabaseOperationError(
                response,
                "Não foi possível baixar o backup do banco de dados."
            )
        );
    }

    const blob = await response.blob();

    if (blob.size === 0) {
        throw new Error(
            "O servidor retornou um arquivo de banco de dados vazio."
        );
    }

    const filename = getDatabaseDownloadFilename(response);

    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = objectUrl;
    link.download = filename;
    link.style.display = "none";

    document.body.appendChild(link);

    try {
        link.click();
    } finally {
        link.remove();

        window.setTimeout(() => {
            URL.revokeObjectURL(objectUrl);
        }, 60_000);
    }
}

/**
 * PUT /api/settings/database/import
 *
 * Envia um arquivo SQLite no campo multipart "database".
 *
 * Não define Content-Type manualmente: o navegador precisa gerar
 * o boundary correto de multipart/form-data.
 */
export async function importSystemDatabase(
    file: File
): Promise<DatabaseImportResult> {
    if (!(file instanceof File)) {
        throw new Error("Selecione um arquivo de banco de dados SQLite.");
    }

    if (file.size === 0) {
        throw new Error("O arquivo selecionado está vazio.");
    }

    const formData = new FormData();

    formData.append("database", file, file.name);

    let response: Response;

    try {
        response = await fetch(
            getApiUrl("/api/settings/database/import"),
            {
                method: "PUT",
                credentials: "include",
                headers: {
                    Accept: "application/json"
                },
                body: formData
            }
        );
    } catch {
        throw new Error(
            "Não foi possível conectar ao servidor para importar o banco de dados."
        );
    }

    const result = await response
        .json()
        .catch(() => null) as ApiResponse<DatabaseImportResult> | null;

    if (!response.ok) {
        const message = result?.message ?? (
            response.status === 401
                ? "Sua sessão expirou. Entre novamente no sistema."
                : response.status === 403
                    ? "Seu nível de acesso não permite importar o banco de dados."
                    : response.status === 413
                        ? "O arquivo enviado ultrapassa o limite permitido pelo servidor."
                        : "Não foi possível importar o banco de dados."
        );

        throw new Error(message);
    }

    if (!result?.data) {
        throw new Error(
            "O servidor não retornou a confirmação da importação do banco."
        );
    }

    return result.data;
}

/* -------------------------------------------------------------------------- */
/* Perfil do usuário atual                                                    */
/* -------------------------------------------------------------------------- */

export function updateMyProfile(data: {
    email: string;
    password?: string;
}) {
    return request<{
        id: number;
        email: string;
        avatar?: string | null;
        status?: number;
        roles?: Array<{
            id: number;
            name: string;
            level: number;
        }>;
    }>("/api/me", {
        method: "PUT",
        body: JSON.stringify(data)
    });
}

export async function uploadProfileAvatar(file: File) {
    const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();

        reader.onerror = () => reject(
            new Error("Não foi possível ler a imagem selecionada.")
        );

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
        body: JSON.stringify({
            data,
            content_type: file.type
        })
    });
}

/* -------------------------------------------------------------------------- */
/* Dados gerais da empresa                                                    */
/* -------------------------------------------------------------------------- */

export function saveCompany(data: Record<string, unknown>) {
    return request<Record<string, unknown>>(
        "/api/settings/company",
        jsonBody(data)
    );
}

/* -------------------------------------------------------------------------- */
/* Usuários                                                                   */
/* -------------------------------------------------------------------------- */

export function updateSettingsUser(
    id: number,
    data: {
        status: number;
        roles: number[];
    }
) {
    return request<Record<string, unknown>>(
        "/api/user/" + id,
        jsonBody(data)
    );
}

export function createSettingsUser(data: {
    email: string;
    password: string;
    roles: number[];
}) {
    return request<{
        id: number;
        email: string;
        status: number;
        roles: Array<{
            id: number;
            name: string;
            level: number;
        }>;
    }>("/api/user/new", {
        method: "POST",
        body: JSON.stringify(data)
    });
}

/* -------------------------------------------------------------------------- */
/* Presença / WebSocket                                                       */
/* -------------------------------------------------------------------------- */

export function getPresenceSocketUrl(): string {
    const configuredBase = appEnv.VITE_API_URL?.replace(/\/+$/, "");
    const base = configuredBase || window.location.origin;
    const url = new URL(base, window.location.href);

    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname =
        url.pathname.replace(/\/+$/, "") + "/api/settings/presence";
    url.search = "";
    url.hash = "";

    return url.toString();
}