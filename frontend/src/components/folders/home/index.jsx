import './style.scss';
import { useDynamicLinks } from '@/data/links/functions.jsx';

import FormComponent from "../budget/form/index";
import cards from '@/data/cards/index.json';
import { cardsIcons } from '@/data/cards/functions.jsx';

import { useInfos } from "@/data/hooks/useInfos";
export default function HomePage() {
    const { data: infos } = useInfos();
    const { links, data } = useDynamicLinks();
    const { icons } = cardsIcons();
    if (!infos) return console.log("Nenhuma informação de cliente encontrada!")
    if (!data) return console.log("Nenhuma função encontrada!")
    if (!links) return console.log("Nenhum link encontrado!")
    return (
        <div className="app">
            <div className="home-banner">
                <div className="banner-overlay"></div>
                <div className="banner-content">
                    <p>{infos['description']}</p>
                </div>
                <div className="cards-display">
                    {
                        data.filter((link) => link.card.id)
                            .sort((a, b) => {
                                if (a.card.type_id && !b.card.type_id) return -1;
                                if (!a.card.type_id && b.card.type_id) return 1;
                                return 0;
                            })
                            .map((link) => {
                                if (link.card.id) {
                                    const card = cards.find(
                                        (card) =>
                                            card.icon.toLowerCase() ===
                                            link.card.icon.toLowerCase()
                                    );
                                    const Component = card
                                        ? icons[card.icon.toLowerCase()]
                                        : undefined;
                                    if (!Component) {
                                        console.warn(
                                            "Ícone não encontrado:",
                                            link.card.icon
                                        );

                                        return null;
                                    }

                                    return (
                                        <div key={link.card.id} className={`card ${link.card.class}`}>
                                            <div className="icon">
                                                <Component style={{ width: '3pc', height: '3pc' }} />
                                            </div>
                                            <div className="info">
                                                <span className="title">{link.card.title}</span>
                                                <span className="text">{link.card.text}</span>
                                                <a className='link'
                                                    onClick={() => {
                                                        const el = document.querySelector(`.${link.card.type_id ? "project" : "app"}.${link.card.class}`);
                                                        if (el) {
                                                            el.scrollIntoView({ behavior: "smooth", block: "center" });
                                                        }
                                                    }}>{link.card.type_id ? "Ver Projetos" : link.card.title} ➡️</a>
                                            </div>
                                        </div>
                                    )
                                }
                            })
                    }
                </div>
            </div>
            <div className="home">
                <span className="home-title">O Que Eu Desenvolvo</span>
                
            </div>
            {data.filter((link) => link.card.id)
                .sort((a, b) => {
                    if (a.card.type_id && !b.card.type_id) return -1;
                    if (!a.card.type_id && b.card.type_id) return 1;
                    return 0;
                })
                .map((link) => {
                    if (links[link.function] && link.url !== "/") {
                        const Component = links[link.function];
                        const type = link.function.toLowerCase().replace("page", "");
                        return (
                            <Component id="pages" key={type} type={type} />
                        );
                    }
                })}
        </div>
    )
}