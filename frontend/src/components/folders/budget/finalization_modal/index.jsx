import "./style.scss";

function BudgetFinalizationModal({
    stage,
    clientName,
    taxId,
    onTaxIdChange,
    errorMessage,
    isSubmitting,
    budget,
    onAddTaxId,
    onContinueWithoutTaxId,
    onSubmitTaxId,
    onClose,
    onDownloadPdf,
    onDownloadCoupon
}) {
    const isSuccess = stage === "success";

    return (
        <div className="budget-finalization__backdrop">
            <section
                className="budget-finalization"
                role="dialog"
                aria-modal="true"
                aria-labelledby="budget-finalization-title"
                aria-busy={isSubmitting}
            >
                <button
                    className="budget-finalization__close"
                    type="button"
                    aria-label={isSuccess ? "Fechar orçamento" : "Cancelar salvamento"}
                    onClick={onClose}
                    disabled={isSubmitting}
                >
                    ×
                </button>

                {!isSuccess && stage === "ask-tax-id" && (
                    <>
                        <h2 id="budget-finalization-title">Cliente sem CPF/CNPJ</h2>
                        {errorMessage && <p className="budget-finalization__error" role="alert">{errorMessage}</p>}
                        <p>
                            {clientName
                                ? "Deseja adicionar o CPF ou CNPJ de " + clientName + " antes de salvar o orçamento?"
                                : "Deseja adicionar o CPF ou CNPJ antes de salvar o orçamento?"}
                        </p>
                        <div className="budget-finalization__actions">
                            <button
                                className="budget-finalization__button budget-finalization__button--primary"
                                type="button"
                                onClick={onAddTaxId}
                                disabled={isSubmitting}
                            >
                                Adicionar CPF/CNPJ
                            </button>
                            <button
                                className="budget-finalization__button budget-finalization__button--secondary"
                                type="button"
                                onClick={onContinueWithoutTaxId}
                                disabled={isSubmitting}
                            >
                                {isSubmitting ? "Salvando..." : "Continuar sem CPF/CNPJ"}
                            </button>
                        </div>
                    </>
                )}

                {!isSuccess && stage === "submitting" && (
                    <>
                        <h2 id="budget-finalization-title">Salvando orçamento</h2>
                        <p>{isSubmitting ? "Registrando o orçamento e seus itens..." : "O orçamento ainda não foi salvo."}</p>
                        {errorMessage && <p className="budget-finalization__error" role="alert">{errorMessage}</p>}
                        {!isSubmitting && errorMessage && (
                            <button
                                className="budget-finalization__button budget-finalization__button--primary"
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
                        <h2 id="budget-finalization-title">Documento do cliente</h2>
                        <p>Informe o CPF ou CNPJ. Esse dado é opcional para concluir o orçamento.</p>
                        <label className="budget-finalization__field">
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
                        {errorMessage && <p className="budget-finalization__error" role="alert">{errorMessage}</p>}
                        <div className="budget-finalization__actions">
                            <button
                                className="budget-finalization__button budget-finalization__button--primary"
                                type="button"
                                onClick={onSubmitTaxId}
                                disabled={isSubmitting}
                            >
                                {isSubmitting ? "Salvando..." : "Confirmar e salvar orçamento"}
                            </button>
                            <button
                                className="budget-finalization__button budget-finalization__button--secondary"
                                type="button"
                                onClick={onContinueWithoutTaxId}
                                disabled={isSubmitting}
                            >
                                Salvar sem CPF/CNPJ
                            </button>
                        </div>
                    </>
                )}

                {isSuccess && (
                    <>
                        <div className="budget-finalization__success-icon" aria-hidden="true">✓</div>
                        <h2 id="budget-finalization-title">Orçamento concluído!</h2>
                        <p>Escolha o que deseja fazer a seguir.</p>
                        <p className="budget-finalization__fiscal-note">
                            O PDF e o cupom gerados são documentos comerciais internos, sem validade fiscal.
                        </p>
                        <p className="budget-finalization__pdf-hint">
                            Para gerar o PDF, escolha “Salvar como PDF” na impressão do navegador.
                        </p>
                        <div className="budget-finalization__actions budget-finalization__actions--success">
                            <button
                                className="budget-finalization__button budget-finalization__button--primary"
                                type="button"
                                onClick={onClose}
                            >
                                Fechar orçamento
                            </button>
                            <button
                                className="budget-finalization__button budget-finalization__button--pdf"
                                type="button"
                                title="Abre o PDF do orçamento no padrão do sistema."
                                onClick={() => onDownloadPdf(budget)}
                            >
                                Baixar PDF
                            </button>
                            <button
                                className="budget-finalization__button budget-finalization__button--xml"
                                type="button"
                                onClick={() => onDownloadCoupon(budget)}
                            >
                                Baixar Cupom do Orçamento
                            </button>
                            {budget?.fiscal_data_complete && (
                                <button
                                    className="budget-finalization__button budget-finalization__button--danfe"
                                    type="button"
                                    disabled
                                    title="Orçamentos não geram DANFE nem comprovante fiscal."
                                >
                                    Documento fiscal
                                </button>
                            )}
                        </div>
                    </>
                )}
            </section>
        </div>
    );
}

export default BudgetFinalizationModal;
