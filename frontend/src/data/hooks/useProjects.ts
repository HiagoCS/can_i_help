import { useQuery } from "@tanstack/react-query";
import { getProjects } from "@/data/api/projects";

export function useProjects(type: string) {

    return useQuery({
        queryKey: ["projects", type],
        queryFn: () => getProjects(type)
    });

}