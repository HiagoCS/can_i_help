import { useQuery } from "@tanstack/react-query";
import { getInfos } from "@/data/api/infos";

export function useInfos() {

    return useQuery({
        queryKey: ["infos"],
        queryFn: () => getInfos()
    });

}