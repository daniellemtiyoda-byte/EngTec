import { Link } from 'react-router-dom';
import { AbasSecao, useAbaNoEndereco, type Aba } from '../components/Abas';
import { Badge, BadgeDe } from '../components/Badge';
import { CabecalhoPagina } from '../components/Cabecalhos';
import { Carregando, Erro, Vazio } from '../components/Estados';
import { BarraProgresso } from '../components/Indicadores';
import { ListPage, type Coluna } from '../components/ListPage';
import { useAuth } from '../contexts/AuthContext';
import { TIPO_LOCAL_OPCOES } from '../dominio/opcoes';
import { SITUACAO_CADASTRO, TIPO_LOCAL } from '../dominio/rotulos';
import { useAsync } from '../hooks/useAsync';
import { servicos } from '../services';
import type { Local, TipoLocal } from '../types/models';
import { numero } from '../utils/format';

type Visao = 'mapa' | 'lista';
const VISOES: Visao[] = ['mapa', 'lista'];
const ORDEM_TIPO: TipoLocal[] = ['armazenagem', 'expedicao', 'inspecao', 'segregacao'];

/** Ocupação do local em texto e cor: lotado (vermelho), quase cheio a partir de 85% (laranja). */
function nivelOcupacao(l: Local): { tom: 'vermelho' | 'laranja'; rotulo: string } | null {
  if (!l.capacidade) return null;
  const p = l.ocupacao / l.capacidade;
  if (p >= 1) return { tom: 'vermelho', rotulo: 'Lotado' };
  if (p >= 0.85) return { tom: 'laranja', rotulo: 'Quase cheio' };
  return null;
}

/**
 * Locais (seção 9.15 do plano): mapa em cartões por tipo (ocupação em dormentes e fardos) ou lista. Cada local abre a
 * sua página, que é o destino do QR do local. Imprimir QR dos locais gera as etiquetas de endereço para a guarda
 * por leitura; Gerenciar locais leva ao cadastro (só para quem edita cadastros).
 */
export default function Locais() {
  const { pode } = useAuth();
  const [visao, setVisao] = useAbaNoEndereco<Visao>(VISOES, 'visao');
  const todos = useAsync(() => servicos.locais.listar({ pageSize: 500 }), []);
  const abas: Aba<Visao>[] = [{ valor: 'mapa', rotulo: 'Mapa' }, { valor: 'lista', rotulo: 'Lista' }];

  const colunas: Coluna<Local>[] = [
    { chave: 'codigo', titulo: 'Código', ordenavel: true, render: (l) => <Link className="mono" to={`/locais/${l.codigo}`}>{l.codigo}</Link> },
    { chave: 'tipo', titulo: 'Tipo', render: (l) => <BadgeDe mapa={TIPO_LOCAL} valor={l.tipo} /> },
    { chave: 'descricao', titulo: 'Descrição', quebrar: true, render: (l) => l.descricao },
    { chave: 'fardos', titulo: 'Fardos', alinhar: 'right', ordenavel: true, render: (l) => numero(l.fardos) },
    { chave: 'ocupacao', titulo: 'Ocupação', alinhar: 'right', ordenavel: true, render: (l) => { const n = nivelOcupacao(l); return <>{numero(l.ocupacao)}/{numero(l.capacidade)}{n && <> <Badge tom={n.tom}>{n.rotulo}</Badge></>}</>; } },
    { chave: 'ativo', titulo: 'Situação', render: (l) => <BadgeDe mapa={SITUACAO_CADASTRO} valor={l.ativo ? 'ativo' : 'inativo'} /> },
  ];

  const ativos = (todos.dados?.items ?? []).filter((l) => l.ativo);

  return (
    <>
      <CabecalhoPagina
        titulo="Locais"
        subtitulo="Onde os fardos estão: ocupação em dormentes e fardos. Cada local tem um QR para a guarda e a transferência por leitura."
        acoes={<>
          <Link className="btn btn-pri" to="/locais/etiquetas">Imprimir QR dos locais</Link>
          {pode('cadastros:editar') && <Link className="btn btn-sec" to="/cadastros?aba=locais">Gerenciar locais</Link>}
        </>}
      />
      <AbasSecao abas={abas} ativa={visao} aoEscolher={setVisao} rotulo="Visão dos locais">
        {visao === 'mapa' && (
          todos.carregando && !todos.dados ? <Carregando /> : todos.erro ? <Erro erro={todos.erro} aoTentar={todos.recarregar} /> : !ativos.length ? <Vazio mensagem="Nenhum local ativo." /> : (
            <div className="mapa-locais">
              {ORDEM_TIPO.filter((t) => ativos.some((l) => l.tipo === t)).map((t) => (
                <section key={t} aria-labelledby={`tipo-${t}`}>
                  <h2 id={`tipo-${t}`} className="titulo-secao">{TIPO_LOCAL[t][1]}</h2>
                  <ul className="mapa-locais-grade">
                    {ativos.filter((l) => l.tipo === t).map((l) => {
                      const n = nivelOcupacao(l);
                      return (
                        <li key={l.id}>
                          <Link className={`cartao-local cartao-local-${l.tipo}${n ? ` ocupacao-${n.tom}` : ''}`} to={`/locais/${l.codigo}`}>
                            <span className="cartao-local-topo"><span className="mono cartao-local-codigo">{l.codigo}</span>{n && <Badge tom={n.tom}>{n.rotulo}</Badge>}</span>
                            <span className="mudo">{l.descricao}</span>
                            <BarraProgresso total={l.capacidade} recebido={l.ocupacao} unidade="dormentes" />
                            <span>{numero(l.fardos)} {l.fardos === 1 ? 'fardo' : 'fardos'}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )
        )}
        {visao === 'lista' && (
          <ListPage<Local>
            key="lista" titulo="Lista de locais" subnivel colunas={colunas}
            filtros={[{ chave: 'tipo', rotulo: 'Tipo', opcoes: TIPO_LOCAL_OPCOES }]}
            listar={(q) => servicos.locais.listar(q)}
          />
        )}
      </AbasSecao>
    </>
  );
}
