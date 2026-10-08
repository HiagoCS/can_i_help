import "./style.scss"
const WHATSAPP_NUMBER = '5511997448269';
const WHATSAPP_MESSAGE = `Olá! Gostaria de solicitar um orçamento.

**Nome**:\n{nome}
**WhatsApp**:\n{whatsapp}
**Endereço**:\n{endereco}
**Serviço**:\n{servico}
**Mensagem**:\n{mensagem}`;

const services = [
    'Pintura',
    'Residencial',
    'Predial',
    'Acabamentos',
    'Reformas em geral'
];

function buildWhatsAppUrl({
    name,
    whatsapp,
    address,
    service,
    message
}) {
    const text = WHATSAPP_MESSAGE
        .replace('{nome}', name)
        .replace('{whatsapp}', whatsapp)
        .replace('{endereco}', address)
        .replace('{servico}', service)
        .replace('{mensagem}', message);

    return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}
export default function form(){
    function handleSubmit(event) {
        event.preventDefault();

        const form = new FormData(event.currentTarget);

        const name = form.get('name')?.toString().trim() || '';
        const whatsapp = form.get('whatsapp')?.toString().trim() || '';
        const address = form.get('address')?.toString().trim() || '';
        const service = form.get('service')?.toString().trim() || '';
        const message = form.get('message')?.toString().trim() || '';

        const url = buildWhatsAppUrl({
            name,
            whatsapp,
            address,
            service,
            message
        });

        window.open(
            url,
            '_blank',
            'noopener,noreferrer'
        );
    }
    return(
        <div className="budget-card">

                    <div className="budget-card-header">

                        <span className="budget-card-label">
                            SOLICITE SEU ORÇAMENTO
                        </span>

                        <h2>
                            Receba seu orçamento pelo WhatsApp
                        </h2>

                        <p>
                            Preencha o formulário e entraremos
                            em contato para entender melhor o seu projeto.
                        </p>

                    </div>

                    <form
                        className="budget-form"
                        onSubmit={handleSubmit}
                    >

                        <div className="budget-field">
                            <label htmlFor="name">
                                Nome
                            </label>

                            <input
                                id="name"
                                name="name"
                                type="text"
                                placeholder="Seu nome"
                                required
                            />
                        </div>

                        <div className="budget-field">
                            <label htmlFor="whatsapp">
                                WhatsApp
                            </label>

                            <input
                                id="whatsapp"
                                name="whatsapp"
                                type="tel"
                                placeholder="(11) 91234-5678"
                                required
                            />
                        </div>

                        <div className="budget-field">
                            <label htmlFor="address">
                                Endereço
                            </label>

                            <input
                                id="address"
                                name="address"
                                type="text"
                                placeholder="Rua, número, bairro e cidade"
                                required
                            />
                        </div>

                        <div className="budget-field">
                            <label htmlFor="service">
                                Serviço
                            </label>

                            <select
                                id="service"
                                name="service"
                                defaultValue=""
                                required
                            >
                                <option
                                    value=""
                                    disabled
                                >
                                    Selecione o serviço
                                </option>

                                {services.map((service) => (
                                    <option
                                        key={service}
                                        value={service}
                                    >
                                        {service}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="budget-field">
                            <label htmlFor="message">
                                Sobre o projeto
                            </label>

                            <textarea
                                id="message"
                                name="message"
                                rows="4"
                                placeholder="Conte brevemente o que você precisa."
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            className="budget-submit"
                        >
                            <span>
                                Receber orçamento no WhatsApp
                            </span>

                            <span className="budget-submit-icon">
                                →
                            </span>
                        </button>

                        <p className="budget-disclaimer">
                            Seus dados serão utilizados apenas
                            para o atendimento da solicitação.
                        </p>

                    </form>

                </div>
    )
}