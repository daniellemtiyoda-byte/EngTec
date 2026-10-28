/** Progresso de um assistente em passos ("Passo 2 de 3: Fotos e observações"), com barra. */
export function ProgressoPassos({ passos, atual }: { passos: string[]; atual: number }) {
  return (
    <div className="passos">
      <div className="passos-texto" aria-live="polite">Passo {atual + 1} de {passos.length}: <strong>{passos[atual]}</strong></div>
      <ol className="passos-barra" aria-hidden="true">
        {passos.map((p, i) => <li key={p} className={i < atual ? 'feito' : i === atual ? 'atual' : undefined} title={p} />)}
      </ol>
    </div>
  );
}
