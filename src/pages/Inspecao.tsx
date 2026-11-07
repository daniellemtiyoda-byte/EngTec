import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AbasSecao, useAbaNoEndereco, type Aba } from '../components/Abas';
import { Badge, BadgeDe } from '../components/Badge';
import { ConfirmModal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { CabecalhoPagina } from '../components/Cabecalhos';
import { CodigoLink } from '../components/Codigos';
import { BarraProgresso } from '../components/Indicadores';
import { ListPage, type Coluna } from '../components/ListPage';
import { useAuth } from '../contexts/AuthContext';
import { SITUACAO_FARDO } from '../dominio/rotulos';
import { useAsync } from '../hooks/useAsync';
import { useCadastros } from '../hooks/useCadastros';
import { servicos } from '../services';
import type { Dormente, Fardo } from '../types/models';
import { mensagemSegura } from '../services/http';
import { data, dataHora, dias, hojeSP, numero } from '../utils/format';

type AbaInspecao = 'fila' | 'nao_localizados' | 'reprovados';
const ABAS: AbaInspecao[] = ['fila', 'nao_localizados', 'reprovados'];

const contar = () => Promise.all([servicos.inspecao.fila({ pageSize: 1 }), servicos.inspecao.naoLocalizados({ pageSize: 1 }), servicos.inspecao.reprovados({ pageSize: 1 })]).then((r) => r.map((x) => x.total));

/** Prazo com o selo "atrasado" quando já passou e a etapa não foi registrada. */
function Prazo({ ate, feito }: { ate: string; feito?: string }) {
  if (feito) return <>{data(ate)} · <Badge tom="verde">feito em {dataHora(feito)}</Badge></>;
  return <>{data(ate)}{hojeSP() > ate && <> <Badge tom="vermelho">atrasado</Badge></>}</>;
}


/**
 * Inspeção (seção 9.10 do plano): a fila dos fardos recebidos e ainda não concluídos, com o progresso; os dormentes
 * não localizados (pendência do gestor), que voltam a ser inspecionados quando forem encontrados; e os reprovados
 * aguardando retirada: comunicação ao fornecedor (até 5 dias úteis) e retirada (até 15 dias úteis).
 */
export default function Inspecao() {
  const { pode } = useAuth();
  const nav = useNavigate();
  const cad = useCadastros();
  const [aba, setAba] = useAbaNoEndereco<AbaInspecao>(ABAS);
  const totais = useAsync(contar, []);
  // Evento que marcou cada dormente como não localizado (data e justificativa da conclusão do fardo), do mais recente.
  const marcas = useAsync(() => servicos.eventos.listar({ filters: { entidade: 'dormente', tipo: 'nao_localizado' }, pageSize: 1000 }), []);
  const marcacao = (d: Dormente) => marcas.dados?.items.find((h) => h.entidadeId === d.id);
  const contratos = useAsync(() => servicos.contratos.listar({ pageSize: 500 }), []);
  const itens = new Map((contratos.dados?.items ?? []).flatMap((c) => c.itens.map((i) => [i.id, i] as const)));
  const operar = pode('inspecao:operar');
  const notificar = useToast();
  const [acao, setAcao] = useState<{ tipo: 'comunicar' | 'retirar'; fardo: Fardo } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [rec, setRec] = useState(0);

  async function confirmar() {
    if (!acao) return;
    setEnviando(true);
    try {
      if (acao.tipo === 'comunicar') await servicos.inspecao.registrarComunicacao(acao.fardo.id);
      else await servicos.inspecao.registrarRetirada(acao.fardo.id);
      notificar('sucesso', acao.tipo === 'comunicar' ? `Comunicação ao fornecedor registrada (fardo ${acao.fardo.id}).` : `Retirada dos reprovados do fardo ${acao.fardo.id} registrada.`);
      setRec((x) => x + 1); totais.recarregar();
    } catch (e) { notificar('erro', mensagemSegura(e)); }
    finally { setEnviando(false); setAcao(null); }
  }

  const abas: Aba<AbaInspecao>[] = [
    { valor: 'fila', rotulo: 'Fila', total: totais.dados?.[0] },
    { valor: 'nao_localizados', rotulo: 'Não localizados', total: totais.dados?.[1] },
    { valor: 'reprovados', rotulo: 'Reprovados a retirar', total: totais.dados?.[2] },
  ];

  const colunasFila: Coluna<Fardo>[] = [
    { chave: 'id', titulo: 'Fardo', render: (f) => <CodigoLink codigo={f.id} /> },
    { chave: 'itemContratoId', titulo: 'Item', render: (f) => { const i = itens.get(f.itemContratoId); return i ? `${cad.descreverItem({ tamanhoId: i.tamanhoId, classe: f.classe })} · ${cad.nomeEspecie(f.especieId)}` : '—'; } },
    { chave: 'localId', titulo: 'Local de espera', render: (f) => cad.codigoLocal(f.localId) },
    {
      chave: 'progressoInspecao', titulo: 'Progresso', render: (f) => f.progressoInspecao
        ? <BarraProgresso total={f.progressoInspecao.total} recebido={f.progressoInspecao.inspecionados} unidade="inspecionados" />
        : '—',
    },
    { chave: 'idadeDias', titulo: 'Recebido há', alinhar: 'right', ordenavel: true, opcional: true, render: (f) => (f.idadeDias !== undefined ? dias(f.idadeDias) : '—') },
    { chave: 'situacao', titulo: 'Situação', render: (f) => <BadgeDe mapa={SITUACAO_FARDO} valor={f.situacao} /> },
  ];

  const colunasNaoLocalizados: Coluna<Dormente>[] = [
    { chave: 'id', titulo: 'Dormente', render: (d) => <CodigoLink codigo={d.id} /> },
    { chave: 'fardoId', titulo: 'Fardo', render: (d) => <CodigoLink codigo={d.fardoId} /> },
    { chave: 'itemContratoId', titulo: 'Item', opcional: true, render: (d) => { const i = itens.get(d.itemContratoId); return i ? cad.descreverItem({ tamanhoId: i.tamanhoId, classe: d.classe }) : '—'; } },
    { chave: 'historico', titulo: 'Desde', render: (d) => dataHora(marcacao(d)?.quando) },
    { chave: 'situacao', titulo: 'Justificativa', quebrar: true, render: (d) => marcacao(d)?.descricao.replace(/^Não lido na inspeção do fardo [^:]+: /, '') ?? '—' },
  ];

  const colunasReprovados: Coluna<Fardo>[] = [
    { chave: 'id', titulo: 'Fardo', render: (f) => <CodigoLink codigo={f.id} /> },
    { chave: 'reprovacao', titulo: 'Reprovados', alinhar: 'right', render: (f) => numero(f.reprovacao?.dormentesIds.length ?? 0) },
    { chave: 'comunicar', titulo: 'Comunicar o fornecedor até', render: (f) => (f.reprovacao ? <Prazo ate={f.reprovacao.comunicarAte} feito={f.reprovacao.comunicadoEm} /> : '—') },
    { chave: 'retirar', titulo: 'Retirada até', render: (f) => (f.reprovacao ? <Prazo ate={f.reprovacao.retirarAte} /> : '—') },
  ];

  return (
    <>
      <CabecalhoPagina
        titulo="Inspeção"
        subtitulo="Fardos recebidos aguardando ou em inspeção. Ao concluir, os aprovados vão para o local de guarda e os reprovados para a segregação."
      />
      <AbasSecao abas={abas} ativa={aba} aoEscolher={setAba} rotulo="Inspeção">
        {aba === 'fila' && (
          <ListPage<Fardo>
            key="fila" titulo="Fila de inspeção" descricao="Do recebido há mais tempo ao mais recente." subnivel colunas={colunasFila}
            listar={(q) => servicos.inspecao.fila(q)}
            acoesLinha={[{ rotulo: operar ? 'Inspecionar' : 'Ver inspeção', principal: true, aoClicar: (f) => nav(`/inspecao/${f.id}`) }]}
          />
        )}
        {aba === 'nao_localizados' && (
          <ListPage<Dormente>
            key="nao_localizados" titulo="Dormentes não localizados" subnivel colunas={colunasNaoLocalizados}
            descricao="Não lidos na conclusão da inspeção do fardo. Quando forem encontrados, inspecione: seguem para o estoque ou para a segregação na hora."
            listar={(q) => servicos.inspecao.naoLocalizados(q)}
            acoesLinha={operar ? [{ rotulo: 'Inspecionar', principal: true, aoClicar: (d) => nav(`/inspecao/${d.fardoId}?dormente=${d.id}`) }] : undefined}
          />
        )}
        {aba === 'reprovados' && (
          <ListPage<Fardo>
            key="reprovados" titulo="Reprovados aguardando retirada" subnivel colunas={colunasReprovados} recarregar={rec}
            descricao="Ao concluir a inspeção, o sistema registra a comunicação ao fornecedor (até 5 dias úteis) e o prazo de retirada (15 dias úteis). Uma reentrega do contrato só é aceita depois da retirada."
            listar={(q) => servicos.inspecao.reprovados(q)}
            acoesLinha={operar ? [
              { rotulo: 'Registrar comunicação', principal: true, visivel: (f) => !f.reprovacao?.comunicadoEm, aoClicar: (f) => setAcao({ tipo: 'comunicar', fardo: f }) },
              { rotulo: 'Registrar retirada', principal: true, visivel: (f) => !!f.reprovacao?.comunicadoEm, aoClicar: (f) => setAcao({ tipo: 'retirar', fardo: f }) },
            ] : undefined}
          />
        )}
      </AbasSecao>
      <ConfirmModal
        titulo={acao?.tipo === 'retirar' ? 'Registrar a retirada' : 'Registrar a comunicação'} aberto={!!acao} carregando={enviando}
        rotuloConfirmar={acao?.tipo === 'retirar' ? 'Registrar retirada' : 'Registrar comunicação'}
        mensagem={acao ? (acao.tipo === 'retirar'
          ? `Confirma que o fornecedor retirou os ${acao.fardo.reprovacao?.dormentesIds.length} reprovado(s) do fardo ${acao.fardo.id}? Eles saem da segregação e ficam "retirado pelo fornecedor".`
          : `Confirma que o fornecedor foi comunicado dos ${acao.fardo.reprovacao?.dormentesIds.length} reprovado(s) do fardo ${acao.fardo.id}?`) : ''}
        aoConfirmar={() => void confirmar()} aoCancelar={() => setAcao(null)}
      />
    </>
  );
}
