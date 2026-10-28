import { useState } from 'react';
import { Badge, BadgeDe } from '../components/Badge';
import { CodigoLink } from '../components/Codigos';
import { Aviso } from '../components/Estados';
import { FormModal } from '../components/FormModal';
import { ListPage, type Coluna } from '../components/ListPage';
import { ConfirmModal, Modal } from '../components/Modal';
import { RmeModal } from '../components/RmeModal';
import { SeparacaoModal } from '../components/SeparacaoModal';
import { useToast } from '../components/Toast';
import { SUFIXO_SIMULADO } from '../config/env';
import { useAlertas } from '../contexts/AlertasContext';
import { useAuth } from '../contexts/AuthContext';
import { STATUS_RME_OPCOES, URGENCIA_OPCOES } from '../dominio/opcoes';
import { STATUS_RME, URGENCIA_RME } from '../dominio/rotulos';
import { servicos } from '../services';
import { mensagemSegura } from '../services/http';
import type { Rme } from '../types/models';
import { data, dataHora, un } from '../utils/format';

const hoje = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const emAndamento = (r: Rme) => r.status !== 'entregue' && r.status !== 'cancelada';
const vencida = (r: Rme) => emAndamento(r) && r.dataLimite < hoje();

/** O que sobra em cada fardo depois da baixa: os que ficam com saldo passam a "aberto". */
const sobras = (r: Rme) => (r.separacao?.itens ?? []).map((s) => ({ ...s, sobra: s.saldoFardo - s.quantidade }));

export default function RmePage() {
  const { pode, usuario } = useAuth();
  const notificar = useToast();
  const alertas = useAlertas();
  const [rec, setRec] = useState(0);
  const [abrir, setAbrir] = useState(false);
  const [separar, setSeparar] = useState<Rme | null>(null);
  const [ver, setVer] = useState<{ rme: Rme; conferir: boolean } | null>(null);
  const [devolver, setDevolver] = useState<Rme | null>(null);
  const [cancelar, setCancelar] = useState<Rme | null>(null);
  const [entregar, setEntregar] = useState<Rme | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string>();

  const atualizado = (msg: string) => { notificar('sucesso', `${msg}${SUFIXO_SIMULADO}`); setRec((x) => x + 1); alertas.recarregar(); };

  async function executar(acao: () => Promise<Rme>, msg: string, fechar: () => void) {
    setEnviando(true);
    setErro(undefined);
    try { await acao(); fechar(); atualizado(msg); }
    catch (e) { setErro(mensagemSegura(e)); }
    finally { setEnviando(false); }
  }

  const colunas: Coluna<Rme>[] = [
    { chave: 'numero', titulo: 'RME', ordenavel: true },
    { chave: 'abertaEm', titulo: 'Aberta em', ordenavel: true, render: (r) => data(r.abertaEm) },
    { chave: 'requisitante', titulo: 'Requisitante', ordenavel: true },
    { chave: 'destinatario', titulo: 'Destinatário', ordenavel: true },
    { chave: 'urgencia', titulo: 'Urgência', ordenavel: true, render: (r) => <BadgeDe mapa={URGENCIA_RME} valor={r.urgencia} /> },
    { chave: 'dataLimite', titulo: 'Data limite', ordenavel: true, render: (r) => (vencida(r) ? <span className="val-erro">{data(r.dataLimite)} (vencida)</span> : data(r.dataLimite)) },
    { chave: 'itens', titulo: 'Itens', render: (r) => r.itens.map((i) => `${un(i.quantidade)} ${i.tamanho}`).join(' + ') },
    { chave: 'status', titulo: 'Status', ordenavel: true, render: (r) => <BadgeDe mapa={STATUS_RME} valor={r.status} /> },
  ];

  const sel = ver?.rme;
  const mesmoUsuario = !!sel?.separacao && sel.separacao.almoxarife === usuario?.nome;

  return (
    <>
      <ListPage<Rme>
        titulo="RME"
        descricao="Requisição de material: única forma de saída do estoque. Fluxo: aberta → em separação → conferida → entregue (baixa)."
        aviso={<Aviso>A baixa só acontece depois da separação pelo almoxarife e da conferência do supervisor (duas pessoas). Até a entrega, os fardos separados ficam reservados.</Aviso>}
        listar={(q) => servicos.rme.listar(q)}
        recarregar={rec}
        colunas={colunas}
        filtros={[{ chave: 'status', rotulo: 'Status', opcoes: STATUS_RME_OPCOES }, { chave: 'urgencia', rotulo: 'Urgência', opcoes: URGENCIA_OPCOES }]}
        acoes={pode('rme:abrir') ? <button className="btn btn-pri" onClick={() => setAbrir(true)}>Abrir RME</button> : undefined}
        acoesLinha={[
          { rotulo: 'Ver', aoClicar: (r) => { setErro(undefined); setVer({ rme: r, conferir: false }); } },
          { rotulo: 'Separar', aoClicar: setSeparar, visivel: (r) => r.status === 'aberta' && pode('rme:separar') },
          { rotulo: 'Conferir', aoClicar: (r) => { setErro(undefined); setVer({ rme: r, conferir: true }); }, visivel: (r) => r.status === 'em_separacao' && pode('rme:conferir') },
          { rotulo: 'Confirmar entrega', aoClicar: (r) => { setErro(undefined); setEntregar(r); }, visivel: (r) => r.status === 'conferida' && pode('rme:separar') },
          { rotulo: 'Cancelar', aoClicar: setCancelar, visivel: (r) => emAndamento(r) && pode('rme:abrir') },
        ]}
      />
      <RmeModal aberto={abrir} aoFechar={() => setAbrir(false)} aoSalvar={(r) => atualizado(`RME ${r.numero} aberta`)} />
      <SeparacaoModal
        rme={separar} aoFechar={() => setSeparar(null)}
        aoConcluir={(r) => atualizado(`Separação da RME ${r.numero} registrada${r.separacao?.seguiuSugestao ? '' : ' (fora da sugestão FIFO, com justificativa)'}; aguarda conferência do supervisor`)}
      />

      <Modal
        titulo={sel ? `${ver?.conferir ? 'Conferir' : 'RME'} ${sel.numero}` : 'RME'} aberto={!!sel} aoFechar={() => setVer(null)} largo
        rodape={ver?.conferir && sel ? <>
          <button className="btn btn-sec" onClick={() => setVer(null)} disabled={enviando}>Fechar</button>
          <button className="btn btn-perigo" onClick={() => { setDevolver(sel); setVer(null); }} disabled={enviando}>Devolver para separação</button>
          <button className="btn btn-pri" disabled={enviando} onClick={() => void executar(() => servicos.rme.conferir(sel.id, { aprovada: true }), `Conferência da RME ${sel.numero} aprovada; pronta para a entrega`, () => setVer(null))}>
            {enviando ? 'Enviando…' : 'Aprovar conferência'}
          </button>
        </> : <button className="btn btn-sec" onClick={() => setVer(null)}>Fechar</button>}
      >
        {sel && (
          <>
            {erro && <div className="aviso aviso-critico" role="alert">{erro}</div>}
            {ver?.conferir && mesmoUsuario && (
              <Aviso tom="alerta">Você registrou esta separação. Pela regra de conferência em duas pessoas, outra pessoa deve conferir e o servidor recusa a conferência. No modo simulado o fluxo fica liberado para teste.</Aviso>
            )}
            <dl className="detalhes">
              <dt>Status</dt><dd><BadgeDe mapa={STATUS_RME} valor={sel.status} /> · <BadgeDe mapa={URGENCIA_RME} valor={sel.urgencia} /></dd>
              <dt>Requisitante</dt><dd>{sel.requisitante}</dd><dt>Destinatário</dt><dd>{sel.destinatario}</dd>
              <dt>Data limite</dt><dd>{data(sel.dataLimite)}{vencida(sel) && <span className="val-erro"> (vencida)</span>}</dd>
              {sel.observacao && <><dt>Observação</dt><dd>{sel.observacao}</dd></>}
              {sel.separacao && <><dt>Separada por</dt><dd>{sel.separacao.almoxarife} em {dataHora(sel.separacao.separadaEm)}</dd></>}
              {sel.supervisor && <><dt>Conferida por</dt><dd>{sel.supervisor} em {dataHora(sel.conferidaEm)}</dd></>}
              {sel.entreguePor && <><dt>Entregue por</dt><dd>{sel.entreguePor} em {dataHora(sel.entregueEm)}</dd></>}
              {sel.motivoCancelamento && <><dt>Motivo do cancelamento</dt><dd>{sel.motivoCancelamento}</dd></>}
            </dl>
            <div className="tabela-wrap">
              <table className="tabela">
                <thead><tr><th>Espécie</th><th>Tamanho</th><th className="al-right">Pedido</th><th className="al-right">Entregue</th></tr></thead>
                <tbody>{sel.itens.map((i) => <tr key={i.id}><td><em>{i.especie}</em></td><td>{i.tamanho}</td><td className="al-right">{un(i.quantidade)}</td><td className="al-right">{un(i.quantidadeEntregue)}</td></tr>)}</tbody>
              </table>
            </div>
            {sel.separacao && (
              <>
                <h3>Separação {sel.separacao.seguiuSugestao ? <Badge tom="verde">Seguiu o FIFO</Badge> : <Badge tom="laranja">Fora da sugestão FIFO</Badge>}</h3>
                {sel.separacao.justificativa && <Aviso tom="alerta"><strong>Justificativa:</strong> {sel.separacao.justificativa}</Aviso>}
                <div className="tabela-wrap">
                  <table className="tabela">
                    <thead><tr><th>Fardo</th><th>Lote</th><th className="al-right">Separado</th><th className="al-right">Saldo do fardo</th><th className="al-right">Fica no fardo</th></tr></thead>
                    <tbody>
                      {sobras(sel).map((s) => (
                        <tr key={s.fardoCodigo}><td><CodigoLink codigo={s.fardoCodigo} /></td><td><CodigoLink codigo={s.loteCodigo} /></td><td className="al-right">{un(s.quantidade)}</td><td className="al-right">{un(s.saldoFardo)}</td><td className="al-right">{s.sobra ? `${un(s.sobra)} (aberto)` : 'baixado'}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            <h3>Histórico</h3>
            <ul>{sel.historico.map((h, i) => <li key={i}>{dataHora(h.quando)} · {h.usuario}: {h.acao}{h.detalhe ? ` (${h.detalhe})` : ''}</li>)}</ul>
          </>
        )}
      </Modal>

      <FormModal
        titulo={devolver ? `Devolver RME ${devolver.numero} para separação` : 'Devolver'} aberto={!!devolver} aoFechar={() => setDevolver(null)} rotuloEnviar="Devolver"
        campos={[{ nome: 'motivo', rotulo: 'Motivo da devolução', tipo: 'textarea', obrigatorio: true, ajuda: 'A separação é desfeita, os fardos voltam a ficar disponíveis e a RME volta para "Aberta".' }]}
        aoEnviar={async (v) => { const r = await servicos.rme.conferir(devolver!.id, { aprovada: false, motivo: v.motivo.trim() }); atualizado(`RME ${r.numero} devolvida para separação`); }}
      />
      <FormModal
        titulo={cancelar ? `Cancelar RME ${cancelar.numero}` : 'Cancelar'} aberto={!!cancelar} aoFechar={() => setCancelar(null)} rotuloEnviar="Cancelar RME"
        campos={[{ nome: 'motivo', rotulo: 'Motivo do cancelamento', tipo: 'textarea', obrigatorio: true }]}
        confirmacao={() => 'Cancelar a RME libera os fardos reservados e não pode ser desfeito. Confirma?'}
        aoEnviar={async (v) => { const r = await servicos.rme.cancelar(cancelar!.id, v.motivo.trim()); atualizado(`RME ${r.numero} cancelada`); }}
      />
      <ConfirmModal
        titulo={entregar ? `Confirmar entrega da RME ${entregar.numero}` : 'Confirmar entrega'} aberto={!!entregar} carregando={enviando} rotuloConfirmar="Confirmar entrega e dar baixa"
        mensagem={entregar ? [
          `Sai do estoque: ${un(entregar.separacao?.itens.reduce((a, s) => a + s.quantidade, 0) ?? 0)} para ${entregar.destinatario}.`,
          sobras(entregar).filter((s) => s.sobra > 0).map((s) => `${s.fardoCodigo} fica aberto com ${un(s.sobra)}.`).join(' '),
          erro ? `Erro: ${erro}` : '',
        ].filter(Boolean).join(' ') : ''}
        aoCancelar={() => setEntregar(null)}
        aoConfirmar={() => entregar && void executar(() => servicos.rme.entregar(entregar.id), `Entrega da RME ${entregar.numero} confirmada; baixa feita no estoque`, () => setEntregar(null))}
      />
    </>
  );
}
