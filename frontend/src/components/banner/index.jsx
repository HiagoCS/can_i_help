import './style.scss';
import { useInfos } from "@/data/hooks/useInfos";
function main() {
    const { data: infos, isLoading, error } = useInfos();
        if (isLoading) return console.log("Loading...")
        if (error) return console.log(error.message)
        if (!infos) return console.log("Nenhuma informação de cliente encontrada!")
    let company = '';
    if(infos['company'])
        company = infos['company'].includes(' ') ? infos['company'].split(' ') : null;
    return (
        <div className="app banner">
            <div className="banner">
                <div className="name">
                    <h1>{infos['name']}</h1>
                    <h2>{infos['occupation']}</h2>
                </div>
                <div className="logo">
                    <span className='logo-text'>{company ? (company[0] ? company[0] : company) : infos['company']}</span>
                    <span className='sublogo-text'>{company ? company[1]: null}</span>
                </div>
            </div>
        </div>
    )
}

export default main