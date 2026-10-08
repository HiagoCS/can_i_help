import './style.scss';
import FormComponent from "./form/index"
export default function OrcamentoPage() {
    

    return (
        <section className="app budget-page">

            <div className="budget-container">

                <div className="budget-content">

                    <span className="budget-label">
                        ORÇAMENTO
                    </span>

                    <h1>
                        Vamos conversar sobre
                        <br />
                        o seu projeto.
                    </h1>

                    <p className="budget-description">
                        Preencha seus dados e explique brevemente
                        o que você precisa. A solicitação será
                        encaminhada diretamente pelo WhatsApp.
                    </p>

                    <div className="budget-highlights">
                        <span>
                            Atendimento personalizado
                        </span>

                        <span>
                            Resposta rápida
                        </span>

                        <span>
                            Orçamento sem compromisso
                        </span>
                    </div>

                </div>

                <FormComponent></FormComponent>

            </div>

        </section>
    );
}