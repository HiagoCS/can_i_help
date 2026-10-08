import type { navbarLink } from "@/data/types/navbar_link";
interface NavbarLinksResponse {
    message: string;
    data: navbarLink[];
}
export async function getNavbarLinks(): Promise<navbarLink[]> {

    const response = await fetch(
        `${(import.meta as ImportMeta & { env: { VITE_API_URL: string } }).env.VITE_API_URL}/api/pages`
    );

    const result: NavbarLinksResponse = await response.json();
    if (!response.ok) {
        throw new Error("Erro ao buscar links da navbar");
    }

    return result.data;
}