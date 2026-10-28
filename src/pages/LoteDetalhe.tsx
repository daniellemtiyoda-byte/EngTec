import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { BadgeDe, StatusEstoqueBadge, StatusRegistroBadge } from '../components/Badge';
import { CodigoLink } from '../components/Codigos';
import { Aviso, Carregando, Erro, PageHeader, Vazio } from '../components/Estados';
import { FardosModal } from '../components/FardosModal';
import { StatCard } from '../components/Graficos';
import { DECLARACAO_DOF, ESTADO_FARDO, RESULTADO_INSPECAO, TIPO_MOVIMENTACAO } from '../dominio/rotulos';
import { useAsync } from '../hooks/useAsync';
import { servicos } from '../services';
import { ApiError } from '../services/http';
import type { EventoLote } from '../types/models';
import { data, dataHora, dias, m3, metros, rotuloCategoria, rotuloClasse, un } from '../utils/format';

const ICONE_EVENTO: Record<EventoLote['tipo'], string> = {
  nf: 'NF', recebimento: 'REC', declaracao: 'DOF', entrada: 'ENT', saida: 'SAÍ', transferencia: 'TRF', perda: 'PER', ajuste: 'AJU',
};

/** Página do lote (RF09/RF23): situação, fardos com saldo e local, origem (NF, DOF, recebimento) e linha do tempo da NF ao destino. */
export default function LoteDetalhe() {
  const { codigo = '' } = useParams();
  const [params] = useSearchParams();
  const fardoDestaque = params.get('fardo')?.toUpperCase();
  const r = useAsync(() => servicos.lotes.obter(codigo), [codigo]);
  const [etiquetas, setEtiquetas] = useState(false);

  // Fardo vindo da busca (LT26-0042-F03): rola até ele.
  useEffect(() => {
    if (r.dados && fardoDestaque) document.getElementById(`fardo-${fardoDestaque}`)?.scrollIntoView({ block: 'center' });
  }, [r.dados, fardoDestaque]);

  const voltar = <Link to="/lotes" className="btn btn-sec">← Lotes e fardos</Link>;
  if (r.carregando && !r.dados) return <Carregando />;
  if (r.erro) {
    return r.erro instanceof ApiError && r.erro.status === 404
      ? <section className="painel"><Vazio mensagem={`Lote ${codigo} não encontrado.`} dica="Confira o código (ex.: LT26-0042) ou pesquise na lista de lotes." />{voltar}</section>
      : <Erro erro={r.erro} aoTentar={r.recarregar} />;
  }
  if (!r.dados) return null;
  const { lote: l, fardos, nf, recebimento, historico } = r.dados;
  const dof = nf?.dof;

  return (
    <>
      <nav className="migalhas" aria-label="Você está em"><Link to="/lotes">Lotes e fardos</Link> <span aria-hidden="true">›</span> <span>{l.codigo}</span></nav>
      <PageHeader
        titulo={`Lote ${l.codigo}`}
        descricao={`${l.especieDocumental} · ${rotuloClasse(l.classe)} · ${rotuloCategoria(l.categoria)} · Tamanho ${l.tamanho}`}
        acoes={<>{voltar}<button className="btn btn-pri" onClick={() => setEtiquetas(true)}>Imprimir etiquetas</button></>}
      />
      <div className="selos">
        <BadgeDe mapa={RESULTADO_INSPECAO} valor={l.inspecao} /> <StatusEstoqueBadge s={l.estoqueStatus} />
        {l.acimaLimiteIdade && <span className="badge badge-laranja">Acima do limite de dias</span>}
      </div>
      {l.estoqueStatus === 'divergente' && <Aviso tom="critico">Recebido com divergência de volume acima da tolerância: fora da separação até ser liberado.</Aviso>}

      <div className="grade-cards">
        <StatCard rotulo="Saldo" valor={un(l.saldo)} detalhe={`de ${un(l.quantidade)} recebidos`} tom={l.saldo ? 'verde' : 'cinza'} />
        <StatCard rotulo="Idade" valor={dias(l.idadeDias)} detalhe={`Recebido em ${data(l.recebidoEm)}`} tom={l.acimaLimiteIdade ? 'laranja' : undefined} />
        <StatCard rotulo="Volume calculado" valor={m3(l.volumeCalculadoM3)} detalhe={`Documental (DOF): ${m3(l.volumeDocumentalM3)}`} />
        <StatCard rotulo="Local" valor={l.local} detalhe={`${fardos.filter((f) => f.estado !== 'baixado').length} de ${l.fardos} fardos com saldo`} />
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
          <PageHeader titulo="Fardos" nivel={2} descricao="Saída parcial deixa o fardo aberto com o saldo restante." />
          <div className="tabela-wrap">
            <table className="tabela">
              <thead><tr><th>Fardo</th><th className="al-right">Inicial</th><th className="al-right">Saldo</th><th>Estado</th><th>Local</th></tr></thead>
              <tbody>
                {fardos.map((f) => (
                  <tr key={f.id} id={`fardo-${f.codigo}`} className={f.codigo === fardoDestaque ? 'linha-destaque' : undefined} aria-current={f.codigo === fardoDestaque ? 'true' : undefined}>
                    <td>{f.codigo}</td><td className="al-right">{un(f.quantidadeInicial)}</td><td className="al-right">{un(f.saldo)}</td>
                    <td><BadgeDe mapa={ESTADO_FARDO} valor={f.estado} /></td><td>{f.local}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

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
