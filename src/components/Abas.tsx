import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { numero } from '../utils/format';

export interface Aba<K extends string = string> { valor: K; rotulo: string; total?: number }

/**
 * Aba ativa guardada no endereço (`?aba=`): voltar no navegador devolve a aba. Valor desconhecido cai na primeira.
 * A primeira aba não aparece no endereço, para o link "limpo" abrir nela.
 */
export function useAbaNoEndereco<K extends string>(valores: readonly K[], param = 'aba'): [K, (v: K) => void] {
  const [params, setParams] = useSearchParams();
  const lida = params.get(param) as K | null;
  const ativa = lida && valores.includes(lida) ? lida : valores[0];
  const escolher = (v: K) => {
    const novo = new URLSearchParams(params);
    if (v === valores[0]) novo.delete(param); else novo.set(param, v);
    setParams(novo, { replace: true });
  };
  return [ativa, escolher];
}

interface PropsLista<K extends string> {
  abas: Aba<K>[];
  ativa: K;
  aoEscolher: (v: K) => void;
  rotulo: string;
  idBase: string;
  classe: string;
}

/** Lista de abas com teclado: setas mudam de aba, Home e End vão às pontas (padrão WAI-ARIA). */
function ListaAbas<K extends string>({ abas, ativa, aoEscolher, rotulo, idBase, classe }: PropsLista<K>) {
  const ref = useRef<HTMLDivElement>(null);
  function tecla(e: KeyboardEvent<HTMLDivElement>) {
    const i = abas.findIndex((a) => a.valor === ativa);
    const destino = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: abas.length - 1 }[e.key];
    if (destino === undefined) return;
    e.preventDefault();
    const nova = abas[(destino + abas.length) % abas.length];
    aoEscolher(nova.valor);
    ref.current?.querySelector<HTMLButtonElement>(`[data-aba="${nova.valor}"]`)?.focus();
  }
  return (
    <div className={classe} role="tablist" aria-label={rotulo} ref={ref} onKeyDown={tecla}>
      {abas.map((a) => {
        const sel = a.valor === ativa;
        return (
          <button
            key={a.valor} type="button" role="tab" id={`${idBase}-aba-${a.valor}`} data-aba={a.valor}
            aria-selected={sel} aria-controls={`${idBase}-painel`} tabIndex={sel ? 0 : -1}
            className="aba" onClick={() => aoEscolher(a.valor)}
          >
            {a.rotulo}{a.total !== undefined && <span className="aba-total">{numero(a.total)}</span>}
          </button>
        );
      })}
    </div>
  );
}

interface PropsAbas<K extends string> {
  abas: Aba<K>[];
  ativa: K;
  aoEscolher: (v: K) => void;
  rotulo: string;
  children: ReactNode;
}

/** Abas da página de objeto (Resumo, Dormentes, Origem, Histórico), com o conteúdo da aba ativa. Use com `useAbaNoEndereco`. */
export function AbasSecao<K extends string>({ abas, ativa, aoEscolher, rotulo, children }: PropsAbas<K>) {
  const idBase = useId();
  return (
    <div className="abas-secao">
      <ListaAbas abas={abas} ativa={ativa} aoEscolher={aoEscolher} rotulo={rotulo} idBase={idBase} classe="abas" />
      <div role="tabpanel" id={`${idBase}-painel`} aria-labelledby={`${idBase}-aba-${ativa}`} className="aba-painel">{children}</div>
    </div>
  );
}

/** Abas de situação com contador acima das listas (Abertas 4 · Em separação 2 · Entregues 31); o `ListPage` usa por dentro. */
export function AbasSituacao<K extends string>({ abas, ativa, aoEscolher, rotulo, children }: PropsAbas<K>) {
  const idBase = useId();
  return (
    <>
      <ListaAbas abas={abas} ativa={ativa} aoEscolher={aoEscolher} rotulo={rotulo} idBase={idBase} classe="abas abas-situacao" />
      <div role="tabpanel" id={`${idBase}-painel`} aria-labelledby={`${idBase}-aba-${ativa}`} className="aba-painel">{children}</div>
    </>
  );
}
