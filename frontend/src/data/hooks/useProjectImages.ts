import { useQueries } from "@tanstack/react-query";
import { getProjectImages } from "@/data/api/images";

interface Project {
    id: number;
}
export function useProjectImages(projects: Project[] = []){
    return useQueries({
        queries: projects.map((project) => ({
            queryKey: ["projectImages", project.id],
            queryFn: () => getProjectImages(project.id),
        })),
    });
}