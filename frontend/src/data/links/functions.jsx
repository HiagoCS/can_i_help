import { useNavLinks } from "@/data/hooks/useNavLinks";
const pagesComponents = import.meta.glob("@/components/folders/*/index.jsx", { eager: true, import: 'default' });
const links = {}
const getFunctions = () => {
    return Object.entries(pagesComponents)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, jsx]) => jsx);
};
const functions = getFunctions();
export function useDynamicLinks(){
    const { data: navbarLinks, isLoading, error } = useNavLinks();
    if (isLoading) {
        console.log(`Loading...`);
        return { links: {}, isLoading: true };
    }
    if (error || !navbarLinks?.length) {
        console.log(`Nenhum link encontrado!`);
        return { links: {}, error: true };
    }
    navbarLinks.map((link, index) => {
        if (link.typeId) {
            links[navbarLinks[index]?.function] = functions[functions.findIndex(func => func.name === 'projectPage')];
        }
        else if (!link.typeId && functions[functions.findIndex(func => func.name.toLowerCase() === navbarLinks[index]?.function.toLowerCase())]) {
            links[navbarLinks[index]?.function] = functions[functions.findIndex(func => func.name.toLowerCase() === navbarLinks[index]?.function.toLowerCase())];
        }

    })
    return { links, isLoading: false, data: navbarLinks };
}