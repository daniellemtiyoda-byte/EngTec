/**
 * Linha de etapas de um fluxo (RME, entrada de NF). `atual` é a etapa em andamento (0 = primeira);
 * igual ao número de etapas = fluxo concluído. `interrompida` (ex. "Cancelada") marca o fluxo como encerrado antes do fim.
 */
export function Etapas({ etapas, atual, interrompida }: { etapas: string[]; atual: number; interrompida?: string }) {
  return (
    <ol className={`etapas${interrompida ? ' etapas-interrompidas' : ''}`} aria-label="Etapas">
      {etapas.map((e, i) => {
        const estado = i < atual ? 'feita' : i === atual && !interrompida ? 'atual' : 'futura';
        return (
          <li key={e} className={`etapa etapa-${estado}`} aria-current={estado === 'atual' ? 'step' : undefined}>
            <span className="etapa-marca" aria-hidden="true">{estado === 'feita' ? '✓' : i + 1}</span>
            <span>{e}<span className="sr-only">{estado === 'feita' ? ' (concluída)' : estado === 'atual' ? ' (etapa atual)' : ''}</span></span>
          </li>
        );
      })}
      {interrompida && <li className="etapa etapa-interrompida"><span className="etapa-marca" aria-hidden="true">×</span><span>{interrompida}</span></li>}
    </ol>
  );
}
