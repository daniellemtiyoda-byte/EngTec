import { Link, useParams } from 'react-router-dom';
import { BadgeDe } from '../components/Badge';
import { CodigoLink } from '../components/Codigos';
import { Aviso, Carregando, Erro, PageHeader, Vazio } from '../components/Estados';
import { StatCard } from '../components/Graficos';
import { LinhaTempo } from '../components/LinhaTempo';
import { ESTADO_FARDO, ORIGEM_INSPECAO, RESULTADO_INSPECAO, SITUACAO_LOTE, VEREDITO_INSPECTOR } from '../dominio/rotulos';
import { useAsync } from '../hooks/useAsync';
import { servicos } from '../services';
import { ApiError } from '../services/http';
import type { Dormente } from '../types/models';
import { data, dataHora, dias, m3, numero, rotuloCategoria, rotuloClasse, un, urlSegura } from '../utils/format';

const situacaoDormente = (d: Dormente) => (d.estado === 'em_estoque' ? 'Em estoque'
  : d.baixa?.tipo === 'saida' ? <>Saiu na <CodigoLink codigo={d.baixa.referencia} /></> : `Baixa por ${d.baixa?.tipo === 'perda' ? 'perda' : 'ajuste'}`);

/** Página do fardo: situação, saldo e local, os dormentes que estão (e estiveram) nele com a inspeção de cada um, o lote de origem e o histórico. */
export default function FardoDetalhe() {
  const { codigo = '' } = useParams();
  const r = useAsync(() => servicos.fardos.obter(codigo), [codigo]);

  const voltar = <Link to="/estoque" className="btn btn-sec">← Estoque</Link>;
  if (r.carregando && !r.dados) return <Carregando />;
  if (r.erro) {
    return r.erro instanceof ApiError && r.erro.status === 404
      ? <section className="painel"><Vazio mensagem={`Fardo ${codigo} não encontrado.`} dica="Confira o código (ex.: LT26-0042-F03) ou pesquise no estoque." />{voltar}</section>
      : <Erro erro={r.erro} aoTentar={r.recarregar} />;
  }
  if (!r.dados) return null;
  const { fardo: f, lote: l, dormentes, inspecoes, historico } = r.dados;
  const inspecaoDe = new Map(inspecoes.map((p) => [p.codigoPeca, p]));
  // Em estoque primeiro, depois os que já saíram; cada grupo pela sequência.
  const ordenados = [...dormentes].sort((a, b) => Number(a.estado !== 'em_estoque') - Number(b.estado !== 'em_estoque') || a.sequencia - b.sequencia);
  const baixados = dormentes.length - f.saldo;

  return (
    <>
      <nav className="migalhas" aria-label="Você está em">
        <Link to="/estoque">Estoque</Link> <span aria-hidden="true">›</span> <Link to={`/lotes/${encodeURIComponent(l.codigo)}`}>{l.codigo}</Link> <span aria-hidden="true">›</span> <span>{f.codigo}</span>
      </nav>
      <PageHeader
        titulo={`Fardo ${f.codigo}`}
        descricao={`${f.especieDocumental} · ${rotuloClasse(f.classe)} · Tamanho ${f.tamanho}${f.resultado === 'aprovado' ? ` · ${rotuloCategoria(f.categoria)}` : ''}`}
        acoes={voltar}
      />
      <div className="selos">
        <BadgeDe mapa={SITUACAO_LOTE} valor={f.situacao} /> <BadgeDe mapa={ESTADO_FARDO} valor={f.estado} />
        {f.acimaLimiteIdade && <span className="badge badge-laranja">Acima do limite de dias</span>}
      </div>
      {f.motivoBloqueio && <Aviso tom="critico">Segregado: {f.motivoBloqueio}. Fora da separação até o supervisor resolver.</Aviso>}
      {f.situacao === 'divergente' && <Aviso tom="critico">O lote foi recebido com divergência de volume acima da tolerância: fora da separação até ser liberado.</Aviso>}

      <div className="grade-cards">
        <StatCard rotulo="Saldo" valor={un(f.saldo)} detalhe={`de ${un(f.quantidadeInicial)} na formação`} tom={f.saldo ? 'verde' : 'cinza'} />
        <StatCard rotulo="Local" valor={f.local} />
        <StatCard rotulo="Idade" valor={dias(f.idadeDias)} detalhe={`Entrada em ${data(f.recebidoEm)}`} tom={f.acimaLimiteIdade ? 'laranja' : undefined} />
        <StatCard rotulo="Volume calculado" valor={m3(f.volumeM3)} detalhe="Do saldo atual" />
      </div>

      <section className="painel">
        <PageHeader
          titulo="Dormentes" nivel={2}
          descricao={`${numero(f.saldo)} em estoque${baixados > 0 ? ` · ${numero(baixados)} já saíram` : ''}. Cada peça pelo código da etiqueta, com o resultado da inspeção e por onde saiu.`}
        />
        {!dormentes.length ? <Vazio mensagem="Nenhum dormente neste fardo." /> : (
          <div className="tabela-wrap">
            <table className="tabela">
              <thead><tr><th>Dormente</th><th>Situação</th><th>Inspeção</th><th>Inspector</th><th>Baixa em</th><th>Relatório</th></tr></thead>
              <tbody>
                {ordenados.map((d) => {
                  const p = inspecaoDe.get(d.codigo);
                  const url = urlSegura(p?.relatorioUrl);
                  return (
                    <tr key={d.id} className={d.estado === 'em_estoque' ? undefined : 'mudo'}>
                      <td>{d.codigo}</td>
                      <td>{situacaoDormente(d)}</td>
                      <td><BadgeDe mapa={RESULTADO_INSPECAO} valor={d.resultado} />{d.categoria && <div className="mudo">{rotuloCategoria(d.categoria)}</div>}</td>
                      <td>{p?.veredito ? <><BadgeDe mapa={VEREDITO_INSPECTOR} valor={p.veredito} />{p.indice !== undefined && <div className="mudo">índice {p.indice}</div>}</> : p ? <BadgeDe mapa={ORIGEM_INSPECAO} valor={p.origem} /> : <span className="mudo">—</span>}</td>
                      <td>{d.baixa && d.estado !== 'em_estoque' ? <>{dataHora(d.baixa.quando)}<div className="mudo">{d.baixa.usuario}</div></> : <span className="mudo">—</span>}</td>
                      <td>{url ? <a href={url} target="_blank" rel="noopener noreferrer">PDF</a> : <span className="mudo">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grade-2">
        <section className="painel">
          <PageHeader titulo="Origem" nivel={2} />
          <dl className="detalhes">
            <dt>Lote</dt><dd><CodigoLink codigo={l.codigo} /></dd>
            <dt>NF</dt><dd><CodigoLink codigo={`NF ${f.nfNumero}`} /> · {f.fornecedor}</dd>
            <dt>DOF</dt><dd>{l.dofNumero}</dd>
            <dt>Formado em</dt><dd>{dataHora(f.formadoEm)} por {f.formadoPor}</dd>
          </dl>
        </section>
        <section className="painel">
          <PageHeader titulo="Linha do tempo" nivel={2} descricao="Da formação até o último dormente que saiu." />
          <LinhaTempo eventos={historico} />
        </section>
      </div>
    </>
  );
}
