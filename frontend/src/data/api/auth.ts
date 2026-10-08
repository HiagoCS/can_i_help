interface AuthRole {
    id: number;
    name: string;
    level: number;
}

interface AuthUser {
    id: number;
    email: string;
    avatar?: string | null;
    roles?: AuthRole[];
}

interface LoginResponse {
    message?: string;
    data?: {
        user?: AuthUser;
    };
}

interface SessionResponse {
    message?: string;
    data?: AuthUser;
}

interface AppImportMeta extends ImportMeta {
    env: {
        DEV: boolean;
        VITE_API_URL?: string;
    };
}

const appEnv = (import.meta as AppImportMeta).env;

function getApiUrl(path: string) {
    const apiBaseUrl = appEnv.DEV
        ? ""
        : (appEnv.VITE_API_URL ?? "").replace(/\/+$/, "");

    return apiBaseUrl + path;
}

export function getAvatarUrl(avatar?: string | null) {
    if (!avatar) {
        return null;
    }

    if (/^https?:\/\//i.test(avatar)) {
        return avatar;
    }

    const normalizedPath = avatar.replace(/^\/+/, "");
    const avatarPath = normalizedPath.startsWith("storage/")
        ? "/" + normalizedPath
        : "/storage/" + normalizedPath;
    const apiBaseUrl = appEnv.DEV
        ? ""
        : (appEnv.VITE_API_URL ?? "").replace(/\/+$/, "");

    return apiBaseUrl + avatarPath;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
    let response: Response;

    try {
        response = await fetch(getApiUrl("/api/me"), {
            credentials: "include"
        });
    } catch {
        return null;
    }

    if (!response.ok) {
        return null;
    }

    const result = await response.json().catch(() => null) as SessionResponse | null;

    return result?.data ?? null;
}

export async function loginUser(email: string, password: string): Promise<AuthUser> {
    let response: Response;

    try {
        response = await fetch(getApiUrl("/api/login"), {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ email, password })
        });
    } catch {
        throw new Error(
            "Não foi possível conectar ao servidor. Verifique a conexão e tente novamente."
        );
    }

    const result = await response.json().catch(() => null) as LoginResponse | null;

    if (response.status === 401) {
        throw new Error("E-mail ou senha inválidos.");
    }

    if (!response.ok) {
        throw new Error(
            result?.message ?? "Não foi possível entrar. Tente novamente."
        );
    }

    const user = result?.data?.user;

    if (!user) {
        throw new Error("O servidor não confirmou a autenticação.");
    }

    return (await getCurrentUser()) ?? user;
}