import type { ReactNode } from 'react';

export interface AbaLateral<K extends string> { chave: K; rotulo: string; total?: number }

interface Props<K extends string> {
  rotulo: string;
  abas: AbaLateral<K>[];
  ativa: K;
  aoEscolher: (k: K) => void;
  children: ReactNode;
}

/**
 * Cartão com as abas na lateral esquerda (com o total de cada uma) e o conteúdo à direita, usado em Cadastros.
 * No celular as abas viram uma faixa horizontal acima do conteúdo.
 */
export function PainelAbas<K extends string>({ rotulo, abas, ativa, aoEscolher, children }: Props<K>) {
  return (
    <div className="painel-abas">
      <div className="painel-abas-menu" role="tablist" aria-label={rotulo} aria-orientation="vertical">
        {abas.map((a) => (
          <button
            key={a.chave} role="tab" id={`aba-${a.chave}`} aria-controls="painel-abas-conteudo" aria-selected={ativa === a.chave}
            className="painel-aba" onClick={() => aoEscolher(a.chave)}
          >
            <span>{a.rotulo}</span>
            {a.total !== undefined && <span className="painel-aba-total" aria-label={`${a.total} registros`}>{a.total}</span>}
          </button>
        ))}
      </div>
      <div className="painel-abas-conteudo" id="painel-abas-conteudo" role="tabpanel" aria-labelledby={`aba-${ativa}`}>
        {children}
      </div>
    </div>
  );
}
