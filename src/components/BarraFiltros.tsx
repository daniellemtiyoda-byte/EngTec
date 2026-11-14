import { useId, type ReactNode } from 'react';

/** `noEndereco`: em lista de seção (`secao`), que não usa o endereço, este filtro vem e vai para o endereço (link do Painel). */
export interface Filtro { chave: string; rotulo: string; opcoes: { valor: string; rotulo: string }[]; noEndereco?: boolean }

interface Props {
  /** Ausente: sem campo de busca. */
  busca?: { valor: string; aoMudar: (v: string) => void; rotulo: string; dica?: string };
  /** Pesquisa já aplicada (depois do atraso de digitação), mostrada como chip. */
  buscaAplicada?: string;
  /** Até 4 filtros (seção 8.1 do plano). */
  filtros?: Filtro[];
  valores: Record<string, string>;
  aoFiltrar: (chave: string, valor: string) => void;
  aoLimpar: () => void;
  /** Controles extras no fim da barra (ordenar no celular, colunas). */
  children?: ReactNode;
}

/** Busca + filtros + chips removíveis + "Limpar tudo". Extraída do `ListPage` para servir a outras listas. */
export function BarraFiltros({ busca, buscaAplicada, filtros = [], valores, aoFiltrar, aoLimpar, children }: Props) {
  const buscaId = useId();
  const ativos = filtros.filter((f) => valores[f.chave]);
  return (
    <>
      <div className="toolbar">
        {busca && (
          <div className="busca">
            <label className="sr-only" htmlFor={buscaId}>{busca.rotulo}</label>
            <input id={buscaId} type="search" placeholder={busca.dica ?? 'Pesquisar…'} value={busca.valor} onChange={(e) => busca.aoMudar(e.target.value)} />
          </div>
        )}
        {filtros.map((f) => (
          <label key={f.chave} className="filtro">
            <span>{f.rotulo}</span>
            <select value={valores[f.chave] ?? ''} onChange={(e) => aoFiltrar(f.chave, e.target.value)}>
              <option value="">Todos</option>
              {f.opcoes.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
            </select>
          </label>
        ))}
        {children}
      </div>
      {(ativos.length > 0 || buscaAplicada) && (
        <div className="chips" aria-label="Filtros ativos">
          {buscaAplicada && busca && <button type="button" className="chip" onClick={() => busca.aoMudar('')} aria-label={`Remover pesquisa ${buscaAplicada}`}>Pesquisa: “{buscaAplicada}” <span aria-hidden="true">×</span></button>}
          {ativos.map((f) => (
            <button key={f.chave} type="button" className="chip" aria-label={`Remover filtro ${f.rotulo}`} onClick={() => aoFiltrar(f.chave, '')}>
              {f.rotulo}: {f.opcoes.find((o) => o.valor === valores[f.chave])?.rotulo ?? valores[f.chave]} <span aria-hidden="true">×</span>
            </button>
          ))}
          <button type="button" className="chip chip-limpar" onClick={aoLimpar}>Limpar tudo</button>
        </div>
      )}
    </>
  );
}
