import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAsync, useDebounced } from '../hooks/useAsync';
import type { ListQuery, Paginado } from '../types/models';
import { Carregando, Erro, PageHeader, Vazio } from './Estados';

export interface Coluna<T> {
  chave: string;
  titulo: string;
  render?: (l: T) => ReactNode;
  ordenavel?: boolean;
  alinhar?: 'right' | 'center';
}
export interface Filtro { chave: string; rotulo: string; opcoes: { valor: string; rotulo: string }[] }
export interface AcaoLinha<T> { rotulo: string; aoClicar: (l: T) => void; visivel?: (l: T) => boolean }

interface Props<T> {
  titulo: string;
  descricao?: string;
  aviso?: ReactNode;
  listar: (q: ListQuery) => Promise<Paginado<T>>;
  colunas: Coluna<T>[];
  filtros?: Filtro[];
  acoes?: ReactNode;
  acoesLinha?: AcaoLinha<T>[];
  recarregar?: number;
  secao?: boolean;
  semBusca?: boolean;
}

const TAMANHO = 10;

export function ListPage<T extends { id: string }>(p: Props<T>) {
  const [params] = useSearchParams();
  const [busca, setBusca] = useState(params.get('q') ?? '');
  const [filtros, setFiltros] = useState<Record<string, string>>({});
  const [ordem, setOrdem] = useState<{ chave: string; dir: 'asc' | 'desc' } | null>(null);
  const [pagina, setPagina] = useState(1);
  const buscaAtraso = useDebounced(busca, 300);

  useEffect(() => { if (!p.secao) setBusca(params.get('q') ?? ''); }, [params, p.secao]);
  useEffect(() => setPagina(1), [buscaAtraso, filtros]);

  const r = useAsync(
    () => p.listar({ page: pagina, pageSize: TAMANHO, search: buscaAtraso, sortBy: ordem?.chave, sortDir: ordem?.dir, filters: filtros }),
    [pagina, buscaAtraso, filtros, ordem, p.recarregar],
  );

  const total = r.dados?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / TAMANHO));
  const colunas = p.colunas;
  const temAcoes = !!p.acoesLinha?.length;

  function alternarOrdem(chave: string) {
    setOrdem((o) => (o?.chave === chave ? (o.dir === 'asc' ? { chave, dir: 'desc' } : null) : { chave, dir: 'asc' }));
  }

  return (
    <section className="painel">
      <PageHeader titulo={p.titulo} descricao={p.descricao} acoes={p.acoes} nivel={p.secao ? 2 : 1} />
      {p.aviso}
      <div className="toolbar">
        {!p.semBusca && (
          <div className="busca">
            <label className="sr-only" htmlFor={`busca-${p.titulo}`}>Pesquisar em {p.titulo}</label>
            <input id={`busca-${p.titulo}`} type="search" placeholder="Pesquisar…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
        )}
        {p.filtros?.map((f) => (
          <label key={f.chave} className="filtro">
            <span>{f.rotulo}</span>
            <select value={filtros[f.chave] ?? ''} onChange={(e) => setFiltros((s) => ({ ...s, [f.chave]: e.target.value }))}>
              <option value="">Todos</option>
              {f.opcoes.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
            </select>
          </label>
        ))}
        {r.dados?.origem === 'simulado' && <span className="chip-simulado">Dados simulados</span>}
      </div>

      {r.carregando && !r.dados ? <Carregando /> : r.erro ? <Erro erro={r.erro} aoTentar={r.recarregar} /> : r.dados && r.dados.items.length === 0 ? (
        <Vazio mensagem="Nenhum resultado encontrado." dica={buscaAtraso || Object.values(filtros).some(Boolean) ? 'Ajuste a pesquisa ou os filtros.' : 'Ainda não há registros nesta lista.'} />
      ) : r.dados ? (
        <>
          <div className="tabela-wrap" aria-busy={r.carregando}>
            <table className="tabela">
              <thead>
                <tr>
                  {colunas.map((c) => (
                    <th key={c.chave} scope="col" className={c.alinhar ? `al-${c.alinhar}` : undefined} aria-sort={ordem?.chave === c.chave ? (ordem.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                      {c.ordenavel ? (
                        <button className="th-botao" onClick={() => alternarOrdem(c.chave)}>
                          {c.titulo}<span aria-hidden="true">{ordem?.chave === c.chave ? (ordem.dir === 'asc' ? ' ▲' : ' ▼') : ' ↕'}</span>
                        </button>
                      ) : c.titulo}
                    </th>
                  ))}
                  {temAcoes && <th scope="col">Ações</th>}
                </tr>
              </thead>
              <tbody>
                {r.dados.items.map((l) => (
                  <tr key={l.id}>
                    {colunas.map((c) => (
                      <td key={c.chave} className={c.alinhar ? `al-${c.alinhar}` : undefined}>
                        {c.render ? c.render(l) : String((l as unknown as Record<string, unknown>)[c.chave] ?? '—')}
                      </td>
                    ))}
                    {temAcoes && (
                      <td className="celula-acoes">
                        {p.acoesLinha!.filter((a) => !a.visivel || a.visivel(l)).map((a) => (
                          <button key={a.rotulo} className="btn btn-sec btn-peq" onClick={() => a.aoClicar(l)}>{a.rotulo}</button>
                        ))}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="paginacao">
            <span className="mudo">{total} registro{total === 1 ? '' : 's'} · página {pagina} de {paginas}</span>
            <div>
              <button className="btn btn-sec btn-peq" onClick={() => setPagina((x) => x - 1)} disabled={pagina <= 1}>Anterior</button>
              <button className="btn btn-sec btn-peq" onClick={() => setPagina((x) => x + 1)} disabled={pagina >= paginas}>Próxima</button>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
