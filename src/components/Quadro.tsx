import { useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Tom } from '../dominio/rotulos';
import { useAsync } from '../hooks/useAsync';
import type { Paginado } from '../types/models';
import { Carregando, Erro } from './Estados';

export interface ColunaQuadro<T> {
  chave: string;
  titulo: string;
  tom: Tom;
  carregar: () => Promise<Paginado<T>>;
  /** Ordenação dentro da coluna (ex.: urgentes primeiro), aplicada sobre o que foi carregado. */
  ordenar?: (a: T, b: T) => number;
  vazio?: string;
  /** Link "ver todas" quando a coluna mostra só parte (colunas finais, como Entregue). */
  verTodas?: string;
}

interface Props<T> {
  rotulo: string;
  colunas: ColunaQuadro<T>[];
  cartao: (item: T, coluna: ColunaQuadro<T>) => ReactNode;
  recarregar?: number;
}

/**
 * Quadro (Kanban) de um fluxo com etapas. Sem arrastar e soltar: cada passagem exige um formulário
 * (separação, conferência, recebimento...), então o cartão traz o botão da próxima ação e só muda de coluna
 * depois da resposta do serviço. No celular as colunas viram abas com contador.
 */
export function Quadro<T extends { id: string }>({ rotulo, colunas, cartao, recarregar }: Props<T>) {
  const id = useId();
  const [ativa, setAtiva] = useState(colunas[0]?.chave);
  const r = useAsync(() => Promise.all(colunas.map((c) => c.carregar())), [recarregar]);

  if (r.carregando && !r.dados) return <Carregando />;
  if (r.erro) return <Erro erro={r.erro} aoTentar={r.recarregar} />;
  const dados = r.dados ?? [];

  return (
    <div className="quadro" aria-busy={r.carregando}>
      <div className="quadro-abas" role="tablist" aria-label={rotulo}>
        {colunas.map((c, i) => (
          <button
            key={c.chave} role="tab" id={`${id}-aba-${c.chave}`} aria-controls={`${id}-col-${c.chave}`} aria-selected={ativa === c.chave}
            className={`aba quadro-aba tom-${c.tom}`} onClick={() => setAtiva(c.chave)}
          >
            {c.titulo} <span className="quadro-contador">{dados[i]?.total ?? 0}</span>
          </button>
        ))}
      </div>
      <div className="quadro-colunas" style={{ gridTemplateColumns: `repeat(${colunas.length}, minmax(240px, 1fr))` }}>
        {colunas.map((c, i) => {
          const pagina = dados[i];
          const itens = [...(pagina?.items ?? [])].sort(c.ordenar ?? (() => 0));
          return (
            <section
              key={c.chave} id={`${id}-col-${c.chave}`} role="tabpanel" aria-labelledby={`${id}-titulo-${c.chave}`}
              className={`quadro-coluna${ativa === c.chave ? ' ativa' : ''}`}
            >
              <header className={`quadro-topo tom-${c.tom}`}>
                <h3 id={`${id}-titulo-${c.chave}`}>{c.titulo}</h3>
                <span className="quadro-contador" aria-label={`${pagina?.total ?? 0} itens`}>{pagina?.total ?? 0}</span>
              </header>
              <div className="quadro-cartoes">
                {itens.length ? itens.map((item) => <div key={item.id}>{cartao(item, c)}</div>) : <p className="mudo quadro-vazio">{c.vazio ?? 'Nada nesta etapa.'}</p>}
              </div>
              {c.verTodas && pagina && pagina.total > itens.length && <Link className="quadro-ver-todas" to={c.verTodas}>Ver todas ({pagina.total})</Link>}
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** Cartão do quadro: destaque pela urgência ou prazo, conteúdo livre e as ações no rodapé. */
export function Cartao({ destaque, children, acoes }: { destaque?: 'critico' | 'atencao'; children: ReactNode; acoes?: ReactNode }) {
  return (
    <article className={`cartao${destaque ? ` cartao-${destaque}` : ''}`}>
      {children}
      {acoes && <div className="cartao-acoes">{acoes}</div>}
    </article>
  );
}

/** Alternância Quadro / Lista; a escolha fica no endereço (?visao=). */
export function AlternarVisao({ visao, aoMudar }: { visao: 'quadro' | 'lista'; aoMudar: (v: 'quadro' | 'lista') => void }) {
  return (
    <div className="alternar-visao" role="group" aria-label="Visualização">
      {(['quadro', 'lista'] as const).map((v) => (
        <button key={v} type="button" className="alternar-opcao" aria-pressed={visao === v} onClick={() => aoMudar(v)}>
          {v === 'quadro' ? 'Quadro' : 'Lista'}
        </button>
      ))}
    </div>
  );
}
