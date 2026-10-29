import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { BadgeDe, StatusEstoqueBadge, StatusRegistroBadge } from '../components/Badge';
import { CodigoLink } from '../components/Codigos';
import { Aviso, Carregando, Erro, PageHeader, Vazio } from '../components/Estados';
import { FardosModal } from '../components/FardosModal';
import { StatCard } from '../components/Graficos';
import { DECLARACAO_DOF, ESTADO_FARDO, ETAPA_INSPECAO, ORIGEM_INSPECAO, RESULTADO_INSPECAO, TIPO_MOVIMENTACAO, VEREDITO_INSPECTOR } from '../dominio/rotulos';
import { useAsync } from '../hooks/useAsync';
import { servicos } from '../services';
import { ApiError } from '../services/http';
import type { Dormente, EventoLote } from '../types/models';
import { seqPeca } from '../utils/busca';
import { data, dataHora, dias, m3, metros, numero, rotuloCategoria, rotuloClasse, un, urlSegura } from '../utils/format';

const ICONE_EVENTO: Record<EventoLote['tipo'], string> = {
  nf: 'NF', recebimento: 'REC', declaracao: 'DOF', inspecao: 'INS', entrada: 'ENT', saida: 'SAÍ', transferencia: 'TRF', perda: 'PER', ajuste: 'AJU',
};

/** Página do lote (RF09/RF23): situação, inspeção das peças, fardos com saldo e local, origem (NF, DOF, recebimento) e linha do tempo da NF ao destino. */
export default function LoteDetalhe() {
  const { codigo = '' } = useParams();
  const [params] = useSearchParams();
  const fardoDestaque = params.get('fardo')?.toUpperCase();
  const pecaDestaque = params.get('peca')?.toUpperCase();
  const r = useAsync(() => servicos.lotes.obter(codigo), [codigo]);
  const [etiquetas, setEtiquetas] = useState(false);

  // Fardo ou dormente vindo da busca (LT26-0042-F03, LT26-0042-0007): rola até ele.
  useEffect(() => {
    const alvo = fardoDestaque ? `fardo-${fardoDestaque}` : pecaDestaque ? `peca-${pecaDestaque}` : null;
    if (r.dados && alvo) document.getElementById(alvo)?.scrollIntoView({ block: 'center' });
  }, [r.dados, fardoDestaque, pecaDestaque]);

  const voltar = <Link to="/lotes" className="btn btn-sec">← Lotes e fardos</Link>;
  if (r.carregando && !r.dados) return <Carregando />;
  if (r.erro) {
    return r.erro instanceof ApiError && r.erro.status === 404
      ? <section className="painel"><Vazio mensagem={`Lote ${codigo} não encontrado.`} dica="Confira o código (ex.: LT26-0042) ou pesquise na lista de lotes." />{voltar}</section>
      : <Erro erro={r.erro} aoTentar={r.recarregar} />;
  }
  if (!r.dados) return null;
  const { lote: l, fardos, inspecoes, dormentes, nf, recebimento, historico } = r.dados;
  const vigentes = inspecoes.filter((x) => x.vigente);
  const dormenteDe = new Map(dormentes.map((d) => [d.codigo, d]));
  const situacaoPeca = (d?: Dormente) => (!d ? <span className="mudo">Sem fardo</span>
    : d.estado === 'em_estoque' ? 'Em estoque'
      : d.baixa?.tipo === 'saida' ? <>Saiu na <CodigoLink codigo={d.baixa.referencia} /></> : `Baixa por ${d.baixa?.tipo === 'perda' ? 'perda' : 'ajuste'}`);
  const pecasDoFardo = (codigo: string) => dormentes.filter((d) => d.fardoCodigo === codigo && d.estado === 'em_estoque').map((d) => seqPeca(d.codigo));
  const dof = nf?.dof;

  return (
    <>
      <nav className="migalhas" aria-label="Você está em"><Link to="/lotes">Lotes e fardos</Link> <span aria-hidden="true">›</span> <span>{l.codigo}</span></nav>
      <PageHeader
        titulo={`Lote ${l.codigo}`}
        descricao={`${l.especieDocumental} · ${rotuloClasse(l.classe)} · ${rotuloCategoria(l.categoria)} · Tamanho ${l.tamanho}`}
        acoes={<>{voltar}<button className="btn btn-pri" onClick={() => setEtiquetas(true)} disabled={!fardos.length}>Imprimir etiquetas</button></>}
      />
      <div className="selos">
        <BadgeDe mapa={ETAPA_INSPECAO} valor={l.etapaInspecao} /> <StatusEstoqueBadge s={l.estoqueStatus} />
        {l.acimaLimiteIdade && <span className="badge badge-laranja">Acima do limite de dias</span>}
      </div>
      {l.estoqueStatus === 'divergente' && <Aviso tom="critico">Recebido com divergência de volume acima da tolerância: fora da separação até ser liberado.</Aviso>}
      {l.etapaInspecao !== 'concluida' && (
        <Aviso tom="info">
          {numero(l.pecasInspecionadas)} de {numero(l.quantidade)} peças inspecionadas. O lote fica fora da separação até os fardos serem formados em <Link to="/inspecao">Inspeção</Link>.
        </Aviso>
      )}

      <div className="grade-cards">
        <StatCard rotulo="Saldo" valor={un(l.saldo)} detalhe={`de ${un(l.quantidade)} recebidos`} tom={l.saldo ? 'verde' : 'cinza'} />
        <StatCard rotulo="Idade" valor={dias(l.idadeDias)} detalhe={`Recebido em ${data(l.recebidoEm)}`} tom={l.acimaLimiteIdade ? 'laranja' : undefined} />
        <StatCard rotulo="Volume calculado" valor={m3(l.volumeCalculadoM3)} detalhe={`Documental (DOF): ${m3(l.volumeDocumentalM3)}`} />
        <StatCard rotulo="Local" valor={l.local} detalhe={l.fardos ? `${fardos.filter((f) => f.estado !== 'baixado').length} de ${l.fardos} fardos com saldo` : `${un(l.unidadesSemFardo)} ainda sem fardo`} />
      </div>

      <div className="grade-2">
        <section className="painel">
          <PageHeader titulo="Origem" nivel={2} />
          <dl className="detalhes">
            <dt>Fornecedor</dt><dd>{l.fornecedor}</dd>
            <dt>NF</dt><dd><CodigoLink codigo={`NF ${l.nfNumero}`} />{nf && ` · emitida em ${data(nf.emissao)}`}</dd>
            <dt>DOF</dt><dd>{l.dofNumero}{dof && <> · válido até {data(dof.validade)} · <BadgeDe mapa={DECLARACAO_DOF} valor={dof.declaracao} /></>}</dd>
            {recebimento && <><dt>Recebimento</dt><dd>{dataHora(recebimento.recebidoEm)} por {recebimento.conferente}</dd></>}
            <dt>Dimensões</dt><dd>{metros(l.comprimentoM)} × {metros(l.larguraM)} × {metros(l.alturaM)} (C × L × A)</dd>
          </dl>
        </section>
        <section className="painel">
          <PageHeader titulo="Fardos" nivel={2} descricao="Formados depois da inspeção, um por resultado e categoria. Saída parcial deixa o fardo aberto com o saldo restante." />
          {!fardos.length ? <Vazio mensagem="Ainda sem fardos." dica="Os fardos são formados na tela Inspeção, depois que todas as peças têm resultado." /> : (
            <div className="tabela-wrap">
              <table className="tabela">
                <thead><tr><th>Fardo</th><th>Inspeção</th><th className="al-right">Inicial</th><th className="al-right">Saldo</th><th>Estado</th><th>Local</th></tr></thead>
                <tbody>
                  {fardos.map((f) => (
                    <tr key={f.id} id={`fardo-${f.codigo}`} className={f.codigo === fardoDestaque ? 'linha-destaque' : undefined} aria-current={f.codigo === fardoDestaque ? 'true' : undefined}>
                      <td>{f.codigo}</td>
                      <td>
                        <BadgeDe mapa={RESULTADO_INSPECAO} valor={f.resultado} />{f.resultado === 'aprovado' && <div className="mudo">{rotuloCategoria(f.categoria)}</div>}
                        {f.motivoBloqueio && <div className="val-erro">{f.motivoBloqueio}</div>}
                      </td>
                      <td className="al-right">{un(f.quantidadeInicial)}</td>
                      <td className="al-right">{un(f.saldo)}{f.saldo > 0 && <div className="mudo" title="Dormentes em estoque no fardo">{pecasDoFardo(f.codigo).join(', ')}</div>}</td>
                      <td><BadgeDe mapa={ESTADO_FARDO} valor={f.estado} /></td><td>{f.local}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <section className="painel">
        <PageHeader
          titulo="Dormentes" nivel={2}
          descricao="Cada peça pelo código da etiqueta: resultado da inspeção (do Inspector ou lançado à mão), fardo e situação. Vale a inspeção mais recente; as substituídas ficam no histórico."
        />
        {!inspecoes.length ? <Vazio mensagem="Nenhuma peça inspecionada ainda." /> : (
          <details open={!!pecaDestaque}>
            <summary>Ver as {numero(vigentes.length)} peças inspecionadas{inspecoes.length > vigentes.length && ` e ${numero(inspecoes.length - vigentes.length)} inspeção(ões) substituída(s)`}</summary>
            <div className="tabela-wrap">
              <table className="tabela">
                <thead><tr><th>Dormente</th><th>Resultado</th><th>Fardo</th><th>Situação</th><th>Inspector</th><th>Inspetor</th><th>Data</th><th>Relatório</th></tr></thead>
                <tbody>
                  {inspecoes.map((p) => {
                    const url = urlSegura(p.relatorioUrl);
                    const d = p.vigente ? dormenteDe.get(p.codigoPeca) : undefined;
                    const destaque = p.vigente && p.codigoPeca === pecaDestaque;
                    return (
                      <tr key={p.id} id={p.vigente ? `peca-${p.codigoPeca}` : undefined} className={destaque ? 'linha-destaque' : p.vigente ? undefined : 'mudo'} aria-current={destaque ? 'true' : undefined}>
                        <td>{p.codigoPeca}{!p.vigente && <div>substituída</div>}</td>
                        <td><BadgeDe mapa={RESULTADO_INSPECAO} valor={p.resultado} />{p.categoria && <div className="mudo">{rotuloCategoria(p.categoria)}</div>}</td>
                        <td>{d ? <CodigoLink codigo={d.fardoCodigo} /> : <span className="mudo">—</span>}</td>
                        <td>{p.vigente ? situacaoPeca(d) : <span className="mudo">—</span>}</td>
                        <td>{p.veredito ? <><BadgeDe mapa={VEREDITO_INSPECTOR} valor={p.veredito} />{p.indice !== undefined && <div className="mudo">índice {p.indice}</div>}</> : <BadgeDe mapa={ORIGEM_INSPECAO} valor={p.origem} />}</td>
                        <td>{p.inspetor}{p.estacao && <div className="mudo">{p.estacao}</div>}</td>
                        <td>{dataHora(p.inspecionadoEm)}</td>
                        <td>{url ? <a href={url} target="_blank" rel="noopener noreferrer">PDF</a> : <span className="mudo">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </section>

      <section className="painel">
        <PageHeader titulo="Linha do tempo" nivel={2} descricao="Da NF ao destino: cada evento com data e usuário." />
        {!historico.length ? <Vazio mensagem="Sem eventos registrados." /> : (
          <ol className="linha-tempo">
            {historico.map((e, i) => (
              <li key={i} className={`evento evento-${e.tipo}`}>
                <span className="evento-marca" aria-hidden="true">{ICONE_EVENTO[e.tipo]}</span>
                <div>
                  <div className="evento-topo">
                    <strong>{e.titulo}</strong>
                    {e.tipo in TIPO_MOVIMENTACAO && e.status && e.status !== 'aprovado' && <StatusRegistroBadge s={e.status} />}
                  </div>
                  <div className="mudo">{dataHora(e.quando)}{e.usuario && ` · ${e.usuario}`}{e.referencia && <> · <CodigoLink codigo={e.referencia} /></>}</div>
                  {e.detalhe && <div>{e.detalhe}</div>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
      <FardosModal lote={etiquetas ? l : null} aoFechar={() => setEtiquetas(false)} />
    </>
  );
}
