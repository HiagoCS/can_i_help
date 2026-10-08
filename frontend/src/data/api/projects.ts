import type { Project } from "@/data/types/project";
interface ProjectsResponse {
    message: string;
    data: Project[];
}
export async function getProjects(type: string): Promise<Project[]> {

    const response = await fetch(
        `${(import.meta as ImportMeta & { env: { VITE_API_URL: string } }).env.VITE_API_URL}/api/projects/type/${type.toLowerCase()}`
    );

    const result: ProjectsResponse = await response.json();
    if (!response.ok) {
        throw new Error("Erro ao buscar projetos");
    }

    return result.data;
}