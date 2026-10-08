import type { infos } from "@/data/types/infos";
interface infosResponse {
    message: string;
    data: infos[];
}
export async function getInfos(): Promise<infos[]> {

    const response = await fetch(
        `${(import.meta as ImportMeta & { env: { VITE_API_URL: string } }).env.VITE_API_URL}/api/infos`
    );

    const result: infosResponse = await response.json();
    if (!response.ok) {
        throw new Error("Erro ao buscar infos do cliente");
    }

    return result.data;
}