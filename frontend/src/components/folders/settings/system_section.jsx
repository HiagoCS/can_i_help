import { SettingsSectionHeading } from "./common";

export default function SystemSection() {
    return (
        <section className="settings-form">
            <SettingsSectionHeading
                title="Funcionamento do sistema"
                description="Opções gerais já disponíveis no backend."
            />
            <div className="settings-info-card">
                <strong>Não há outras opções gerais persistidas no backend.</strong>
                <p>As configurações existentes ficam nas áreas de Configuração Fiscal, Empresa e Certificado Digital, visíveis somente para level 3 ou superior.</p>
                <p>A sessão usa o cookie JWT atual. A presença de usuários é atualizada por WebSocket, sem consultas periódicas.</p>
            </div>
        </section>
    );
}
