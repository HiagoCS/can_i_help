export async function getProjectImages(projectId: number) {
    const response = await fetch(
        `${(import.meta as ImportMeta & { env: { VITE_API_URL: string } }).env.VITE_API_URL}/api/projects/${projectId}/images`
    );

    if (!response.ok) {
        throw new Error("Erro ao buscar imagens");
    }

    const result = await response.json();

    return result.data;
}