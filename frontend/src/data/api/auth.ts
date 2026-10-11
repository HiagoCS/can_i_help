
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

interface RegisterResponse {
    message?: string;
    data?: AuthUser;
}

interface ApiMessageResponse {
    message?: string;
}

interface RegisterUserData {
    email: string;
    password: string;
    avatar: File | null;
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

    // Data URLs, como imagens armazenadas em Base64, já podem ser utilizadas.
    if (/^data:image\//i.test(avatar)) {
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

    const result = await response
        .json()
        .catch(() => null) as SessionResponse | null;

    return result?.data ?? null;
}

export async function loginUser(
    email: string,
    password: string
): Promise<AuthUser> {
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

    const result = await response
        .json()
        .catch(() => null) as LoginResponse | null;

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

export async function registerUser(
    data: RegisterUserData
): Promise<AuthUser> {
    const formData = new FormData();

    formData.append("email", data.email.trim());
    formData.append("password", data.password);

    if (data.avatar) {
        formData.append("avatar", data.avatar);
    }

    let response: Response;

    try {
        response = await fetch(getApiUrl("/api/auth/register"), {
            method: "POST",
            credentials: "include",
            body: formData
        });
    } catch {
        throw new Error(
            "Não foi possível conectar ao servidor. Verifique a conexão e tente novamente."
        );
    }

    const result = await response
        .json()
        .catch(() => null) as RegisterResponse | null;

    if (!response.ok) {
        throw new Error(
            result?.message ?? "Não foi possível criar a conta. Tente novamente."
        );
    }

    const user = result?.data;

    if (!user) {
        throw new Error("O servidor não confirmou o cadastro.");
    }

    return user;
}

/**
 * Encerra a sessão autenticada e solicita ao backend a remoção
 * do cookie de autenticação.
 */
export async function logoutUser(): Promise<void> {
    let response: Response;

    try {
        response = await fetch(getApiUrl("/api/logout"), {
            method: "POST",
            credentials: "include"
        });
    } catch {
        throw new Error(
            "Não foi possível conectar ao servidor para encerrar a sessão."
        );
    }

    const result = await response
        .json()
        .catch(() => null) as ApiMessageResponse | null;

    if (!response.ok) {
        throw new Error(
            result?.message ??
            (response.status === 401
                ? "Sua sessão já expirou."
                : "Não foi possível encerrar a sessão. Tente novamente.")
        );
    }
}
