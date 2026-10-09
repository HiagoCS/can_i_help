import "./style.scss";

function CashierFinalizationModal({
    stage,
    clientName,
    taxId,
    onTaxIdChange,
    errorMessage,
    isSubmitting,
    sale,
    onAddTaxId,
    onContinueWithoutTaxId,
    onSubmitTaxId,
    onClose,
    onDownloadPdf,
    onDownloadXml
}) {
    const isSuccess = stage === "success";

    return (
        <div className="cashier-finalization__backdrop">
            <section
                className="cashier-finalization"
                role="dialog"
                aria-modal="true"
                aria-labelledby="cashier-finalization-title"
                aria-busy={isSubmitting}
            >
                <button
                    className="cashier-finalization__close"
                    type="button"
                    aria-label={isSuccess ? "Fechar venda" : "Cancelar finalização"}
                    onClick={onClose}
                    disabled={isSubmitting}
                >
                    ×
                </button>

                {!isSuccess && stage === "ask-tax-id" && (
                    <>
                        <h2 id="cashier-finalization-title">Cliente sem CPF/CNPJ</h2>
                        {errorMessage && <p className="cashier-finalization__error" role="alert">{errorMessage}</p>}
                        <p>
                            {clientName
                                ? "Deseja adicionar o CPF ou CNPJ de " + clientName + " antes de finalizar?"
                                : "Deseja adicionar o CPF ou CNPJ antes de finalizar?"}
                        </p>
                        <div className="cashier-finalization__actions">
                            <button
                                className="cashier-finalization__button cashier-finalization__button--primary"
                                type="button"
                                onClick={onAddTaxId}
                                disabled={isSubmitting}
                            >
                                Adicionar CPF/CNPJ
                            </button>
                            <button
                                className="cashier-finalization__button cashier-finalization__button--secondary"
                                type="button"
                                onClick={onContinueWithoutTaxId}
                                disabled={isSubmitting}
                            >
                                {isSubmitting ? "Finalizando..." : "Continuar sem CPF/CNPJ"}
                            </button>
                        </div>
                    </>
                )}

                {!isSuccess && stage === "submitting" && (
                    <>
                        <h2 id="cashier-finalization-title">Finalizando venda</h2>
                        <p>{isSubmitting ? "Registrando a venda e atualizando o estoque..." : "A venda ainda não foi registrada."}</p>
                        {errorMessage && <p className="cashier-finalization__error" role="alert">{errorMessage}</p>}
                        {!isSubmitting && errorMessage && (
                            <button
                                className="cashier-finalization__button cashier-finalization__button--primary"
                                type="button"
                                onClick={onContinueWithoutTaxId}
                            >
                                Tentar novamente
                            </button>
                        )}
                    </>
                )}
                {!isSuccess && stage === "tax-id" && (
                    <>
                        <h2 id="cashier-finalization-title">Documento do cliente</h2>
                        <p>Informe o CPF ou CNPJ. Esse dado é opcional para concluir a venda.</p>
                        <label className="cashier-finalization__field">
                            <span>CPF/CNPJ</span>
                            <input
                                autoFocus
                                inputMode="numeric"
                                autoComplete="off"
                                maxLength={18}
                                placeholder="000.000.000-00 ou 00.000.000/0000-00"
                                value={taxId}
                                onChange={(event) => onTaxIdChange(event.target.value)}
                                disabled={isSubmitting}
                            />
                        </label>
                        {errorMessage && <p className="cashier-finalization__error" role="alert">{errorMessage}</p>}
                        <div className="cashier-finalization__actions">
                            <button
                                className="cashier-finalization__button cashier-finalization__button--primary"
                                type="button"
                                onClick={onSubmitTaxId}
                                disabled={isSubmitting}
                            >
                                {isSubmitting ? "Finalizando..." : "Confirmar e finalizar"}
                            </button>
                            <button
                                className="cashier-finalization__button cashier-finalization__button--secondary"
                                type="button"
                                onClick={onContinueWithoutTaxId}
                                disabled={isSubmitting}
                            >
                                Finalizar sem CPF/CNPJ
                            </button>
                        </div>
                    </>
                )}

                {isSuccess && (
                    <>
                        <div className="cashier-finalization__success-icon" aria-hidden="true">✓</div>
                        <h2 id="cashier-finalization-title">Venda finalizada!</h2>
                        <p>Escolha o que deseja fazer a seguir.</p>
                        <p className="cashier-finalization__fiscal-note">
                            O comprovante e o XML gerados são documentos gerenciais sem validade fiscal.
                        </p>
                        <p className="cashier-finalization__pdf-hint">
                            Para gerar o PDF, escolha “Salvar como PDF” na impressão do navegador.
                        </p>
                        <div className="cashier-finalization__actions cashier-finalization__actions--success">
                            <button
                                className="cashier-finalization__button cashier-finalization__button--primary"
                                type="button"
                                onClick={onClose}
                            >
                                Fechar venda
                            </button>
                            <button
                                className="cashier-finalization__button cashier-finalization__button--pdf"
                                type="button"
                                title="Abre a impressão do navegador para salvar como PDF."
                                onClick={() => onDownloadPdf(sale)}
                            >
                                Baixar PDF
                            </button>
                            <button
                                className="cashier-finalization__button cashier-finalization__button--xml"
                                type="button"
                                onClick={() => onDownloadXml(sale)}
                            >
                                Baixar Cupom Fiscal
                            </button>
                            {sale?.fiscal_data_complete && (
                                <button
                                    className="cashier-finalization__button cashier-finalization__button--danfe"
                                    type="button"
                                    disabled
                                    title="A emissão depende de certificado digital e integração com a SEFAZ."
                                >
                                    Baixar DANFE
                                </button>
                            )}
                        </div>
                    </>
                )}
            </section>
        </div>
    );
}

export default CashierFinalizationModal;
