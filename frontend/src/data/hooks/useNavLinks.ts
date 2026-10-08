import { useQuery } from "@tanstack/react-query";
import { getNavbarLinks } from "@/data/api/navbar_links";

export function useNavLinks() {

    return useQuery({
        queryKey: ["navbarLinks"],
        queryFn: () => getNavbarLinks()
    });

}