import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAsync, useDebounced } from '../hooks/useAsync';
import type { ListQuery, Paginado } from '../types/models';
import { numero } from '../utils/format';
import { AbasSituacao, type Aba } from './Abas';
import { BarraFiltros, type Filtro } from './BarraFiltros';
import { CabecalhoPagina, type Migalha } from './Cabecalhos';
import { Carregando, Erro, Vazio } from './Estados';
import { MenuAcoes } from './MenuAcoes';

export type { Filtro };

interface ColunaBase<T> {
  titulo: string;
  render?: (l: T) => ReactNode;
  alinhar?: 'right' | 'center';
  /** Escondida por padrão; a pessoa liga em "Colunas" (a escolha fica guardada neste navegador). */
  opcional?: boolean;
  /** Não aparece no cartão do celular (ex.: informação repetida no título). */
  foraDoCartao?: boolean;
  /** Texto longo (ex. espécie e tamanho) pode quebrar linha, para a tabela caber sem rolar para o lado. */
  quebrar?: boolean;
}
/**
 * A chave de uma coluna ordenável vai como `sortBy` para o serviço, então precisa ser um campo real do modelo
 * (o TypeScript acusa se o campo for renomeado). Colunas calculadas, como "Dimensões", usam chave livre e não ordenam.
 */
export type Coluna<T> = ColunaBase<T> & (
  | { chave: Extract<keyof T, string>; ordenavel?: boolean }
  | { chave: string; ordenavel?: false }
);
/** `principal`: a próxima ação do fluxo; aparece como botão e as demais vão para o menu "⋯". */
export interface AcaoLinha<T> { rotulo: string; aoClicar: (l: T) => void; visivel?: (l: T) => boolean; principal?: boolean }

interface Props<T> {
  titulo: string;
  /** Sem descrição, o subtítulo mostra a contagem de registros. */
  descricao?: string;
  migalhas?: Migalha[];
  /**
   * Abas de situação acima da lista (seção 8.1 do plano). A aba ativa vai como filtro `chave` para o serviço e fica no
   * endereço (`?situacao=`); a primeira é a padrão. Valor vazio = sem filtro (ex. "Todas").
   */
  abasSituacao?: { chave: string; rotulo: string; abas: Aba[] };
  aviso?: ReactNode;
  /** Formulário de inclusão em linha (FormLinha), logo abaixo do título, como nos cadastros. */
  inclusao?: ReactNode;
  /** Totais logo abaixo do título (ex.: cartões do saldo de estoque). */
  resumo?: ReactNode;
  listar: (q: ListQuery) => Promise<Paginado<T>>;
  colunas: Coluna<T>[];
  filtros?: Filtro[];
  acoes?: ReactNode;
  acoesLinha?: AcaoLinha<T>[];
  recarregar?: number;
  secao?: boolean;
  /** Título como h2 sem deixar de usar o endereço (lista dentro de uma página com outro h1). */
  subnivel?: boolean;
  semBusca?: boolean;
  /** Ordem usada enquanto a pessoa não escolhe uma coluna (ex.: em andamento primeiro, depois a mais recente). */
  ordemPadrao?: { campo: string; dir: 'asc' | 'desc' }[];
}

const TAMANHO = 10;
/** Linhas do cartão no celular, além do título. */
const LINHAS_CARTAO = 5;

const lerColunas = (chave: string): string[] => {
  try { const v = JSON.parse(localStorage.getItem(chave) ?? '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; }
};
const gravarColunas = (chave: string, v: string[]) => { try { localStorage.setItem(chave, JSON.stringify(v)); } catch { /* navegador sem armazenamento: só não lembra a escolha */ } };

function AcoesDaLinha<T>({ acoes, linha }: { acoes: AcaoLinha<T>[]; linha: T }) {
  const visiveis = acoes.filter((a) => !a.visivel || a.visivel(linha)).sort((a, b) => Number(!!b.principal) - Number(!!a.principal));
  if (!visiveis.length) return null;
  const [primeira, ...resto] = visiveis;
  return (
    <div className="acoes-linha">
      <button className={`btn ${primeira.principal ? 'btn-acao' : 'btn-sec'} btn-peq`} onClick={() => primeira.aoClicar(linha)}>{primeira.rotulo}</button>
      {resto.length > 0 && <MenuAcoes itens={resto.map((a) => ({ rotulo: a.rotulo, aoClicar: () => a.aoClicar(linha) }))} />}
    </div>
  );
}

export function ListPage<T extends { id: string }>(p: Props<T>) {
  const [params, setParams] = useSearchParams();
  const [busca, setBusca] = useState(params.get('q') ?? '');
  // Busca (?q=) e filtros (ex.: ?status=aberta) ficam no endereço: voltar, recarregar e compartilhar mantêm a consulta.
  const filtrosDaUrl = () => (p.secao ? {} : Object.fromEntries((p.filtros ?? []).flatMap((f) => {
    const v = params.get(f.chave);
    return v && f.opcoes.some((o) => o.valor === v) ? [[f.chave, v]] : [];
  })));
  const [filtros, setFiltros] = useState<Record<string, string>>(filtrosDaUrl);
  const abasS = p.abasSituacao;
  const situacaoDaUrl = () => {
    if (!abasS) return '';
    const v = p.secao ? null : params.get(abasS.chave);
    return v !== null && abasS.abas.some((a) => a.valor === v) ? v : abasS.abas[0].valor;
  };
  const [situacao, setSituacao] = useState(situacaoDaUrl);
  const [ordem, setOrdem] = useState<{ chave: string; dir: 'asc' | 'desc' } | null>(null);
  const buscaAtraso = useDebounced(busca, 300);
  const chaveColunas = `holz:colunas:${p.titulo}`;
  const [extras, setExtras] = useState<string[]>(() => lerColunas(chaveColunas));

  // A página vale só para a busca/filtros em que foi escolhida: mudou a consulta, volta para a 1 já
  // na mesma renderização (antes um efeito fazia isso depois, gerando uma requisição extra com a página antiga).
  const consulta = JSON.stringify([buscaAtraso, filtros, situacao]);
  const [pag, setPag] = useState({ consulta, n: 1 });
  const pagina = pag.consulta === consulta ? pag.n : 1;
  const irPara = (n: number) => setPag({ consulta, n });

  // Endereço → estado, só quando a mudança veio de fora (link, voltar); a que esta lista escreveu é ignorada
  // para não sobrescrever o que a pessoa ainda está digitando.
  const escrito = useRef<string | null>(null);
  useEffect(() => {
    if (p.secao || params.toString() === escrito.current) return;
    setBusca(params.get('q') ?? '');
    const f = filtrosDaUrl();
    setFiltros((atual) => (JSON.stringify(atual) === JSON.stringify(f) ? atual : f));
    setSituacao(situacaoDaUrl());
  }, [params, p.secao]); // eslint-disable-line react-hooks/exhaustive-deps
  // Estado → endereço (substitui a entrada do histórico, preservando os outros parâmetros da tela).
  useEffect(() => {
    if (p.secao) return;
    const novo = new URLSearchParams(params);
    novo.delete('q');
    for (const f of p.filtros ?? []) novo.delete(f.chave);
    if (abasS) novo.delete(abasS.chave);
    if (buscaAtraso.trim()) novo.set('q', buscaAtraso.trim());
    for (const [k, v] of Object.entries(filtros)) if (v) novo.set(k, v);
    if (abasS && situacao !== abasS.abas[0].valor) novo.set(abasS.chave, situacao);
    if (novo.toString() !== params.toString()) { escrito.current = novo.toString(); setParams(novo, { replace: true }); }
  }, [buscaAtraso, filtros, situacao]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtrosConsulta = abasS && situacao ? { ...filtros, [abasS.chave]: situacao } : filtros;
  const r = useAsync(
    () => p.listar({ page: pagina, pageSize: TAMANHO, search: buscaAtraso, sortBy: ordem?.chave, sortDir: ordem?.dir, sort: ordem ? undefined : p.ordemPadrao, filters: filtrosConsulta }),
    [pagina, buscaAtraso, filtros, situacao, ordem, p.recarregar],
  );

  const total = r.dados?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / TAMANHO));

  // Se a lista encolheu (ex.: após recarregar), não fica presa numa página que não existe mais.
  useEffect(() => {
    if (r.dados && !r.carregando && pagina > paginas) setPag({ consulta, n: paginas });
  }, [r.dados, r.carregando, pagina, paginas, consulta]);

  const opcionais = p.colunas.filter((c) => c.opcional);
  const colunas = p.colunas.filter((c) => !c.opcional || extras.includes(c.chave));
  const temAcoes = !!p.acoesLinha?.length;
  const ordenaveis = colunas.filter((c) => c.ordenavel);
  const ativos = (p.filtros ?? []).filter((f) => filtros[f.chave]);
  const celula = (c: Coluna<T>, l: T) => (c.render ? c.render(l) : String((l as unknown as Record<string, unknown>)[c.chave] ?? '—'));

  function alternarOrdem(chave: string) {
    setOrdem((o) => (o?.chave === chave ? (o.dir === 'asc' ? { chave, dir: 'desc' } : null) : { chave, dir: 'asc' }));
  }
  function alternarColuna(chave: string) {
    const v = extras.includes(chave) ? extras.filter((x) => x !== chave) : [...extras, chave];
    setExtras(v);
    gravarColunas(chaveColunas, v);
  }
  const limpar = () => { setBusca(''); setFiltros({}); };

  const subtitulo = p.descricao ?? (r.dados ? `${numero(total)} registro${total === 1 ? '' : 's'}` : undefined);

  const resultado = (
    <>
      {r.carregando && !r.dados ? <Carregando /> : r.erro ? <Erro erro={r.erro} aoTentar={r.recarregar} /> : r.dados && r.dados.items.length === 0 ? (
        <Vazio mensagem="Nenhum resultado encontrado." dica={buscaAtraso || ativos.length ? 'Ajuste a pesquisa ou os filtros.' : 'Ainda não há registros nesta lista.'} />
      ) : r.dados ? (
        <>
          <div className="tabela-wrap lista-tabela" aria-busy={r.carregando}>
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
                    {colunas.map((c) => <td key={c.chave} className={[c.alinhar && `al-${c.alinhar}`, c.quebrar && 'quebra'].filter(Boolean).join(' ') || undefined}>{celula(c, l)}</td>)}
                    {temAcoes && <td className="celula-acoes"><AcoesDaLinha acoes={p.acoesLinha!} linha={l} /></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Celular: cada linha vira um cartão (título = primeira coluna) com as colunas principais e as ações. */}
          <ul className="lista-cartoes" aria-busy={r.carregando}>
            {r.dados.items.map((l) => (
              <li key={l.id} className="cartao-linha">
                <div className="cartao-linha-titulo">{celula(colunas[0], l)}</div>
                <dl>
                  {colunas.slice(1).filter((c) => !c.foraDoCartao).slice(0, LINHAS_CARTAO).map((c) => (
                    <Fragment key={c.chave}><dt>{c.titulo}</dt><dd>{celula(c, l)}</dd></Fragment>
                  ))}
                </dl>
                {temAcoes && <AcoesDaLinha acoes={p.acoesLinha!} linha={l} />}
              </li>
            ))}
          </ul>
          <div className="paginacao">
            <span className="mudo">{total} registro{total === 1 ? '' : 's'} · página {pagina} de {paginas}</span>
            <div>
              <button className="btn btn-sec btn-peq" onClick={() => irPara(pagina - 1)} disabled={pagina <= 1}>Anterior</button>
              <button className="btn btn-sec btn-peq" onClick={() => irPara(pagina + 1)} disabled={pagina >= paginas}>Próxima</button>
            </div>
          </div>
        </>
      ) : null}
    </>
  );

  const barra = (
    <BarraFiltros
      busca={p.semBusca ? undefined : { valor: busca, aoMudar: setBusca, rotulo: `Pesquisar em ${p.titulo}` }}
      buscaAplicada={buscaAtraso}
      filtros={p.filtros}
      valores={filtros}
      aoFiltrar={(chave, valor) => setFiltros((f) => ({ ...f, [chave]: valor }))}
      aoLimpar={limpar}
    >
      {ordenaveis.length > 0 && (
        <label className="filtro so-celular">
          <span>Ordenar por</span>
          <select value={ordem ? `${ordem.chave}|${ordem.dir}` : ''} onChange={(e) => { const [chave, dir] = e.target.value.split('|'); setOrdem(chave ? { chave, dir: dir as 'asc' | 'desc' } : null); }}>
            <option value="">Padrão</option>
            {ordenaveis.flatMap((c) => [
              <option key={`${c.chave}-a`} value={`${c.chave}|asc`}>{c.titulo} ↑</option>,
              <option key={`${c.chave}-d`} value={`${c.chave}|desc`}>{c.titulo} ↓</option>,
            ])}
          </select>
        </label>
      )}
      {opcionais.length > 0 && (
        <details className="menu-colunas">
          <summary className="btn btn-sec btn-peq">Colunas{extras.length ? ` (+${extras.filter((x) => opcionais.some((c) => c.chave === x)).length})` : ''}</summary>
          <div className="menu-colunas-painel" role="group" aria-label="Colunas extras">
            {opcionais.map((c) => (
              <label key={c.chave} className="caixa"><input type="checkbox" checked={extras.includes(c.chave)} onChange={() => alternarColuna(c.chave)} /> {c.titulo}</label>
            ))}
          </div>
        </details>
      )}
    </BarraFiltros>
  );

  return (
    <section className="painel">
      <CabecalhoPagina titulo={p.titulo} subtitulo={subtitulo} migalhas={p.migalhas} acoes={p.acoes} nivel={p.secao || p.subnivel ? 2 : 1} />
      {p.inclusao}
      {p.resumo}
      {p.aviso}
      {abasS ? <AbasSituacao abas={abasS.abas} ativa={situacao} aoEscolher={setSituacao} rotulo={abasS.rotulo}>{barra}{resultado}</AbasSituacao> : <>{barra}{resultado}</>}
    </section>
  );
}