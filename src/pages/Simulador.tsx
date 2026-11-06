import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BadgeDe, SeloDemo } from '../components/Badge';
import { CabecalhoPagina } from '../components/Cabecalhos';
import { Contador } from '../components/Contador';
import { Aviso } from '../components/Estados';
import { ListPage, type Coluna } from '../components/ListPage';
import { Modal } from '../components/Modal';
import { ProgressoPassos } from '../components/Passos';
import { useToast } from '../components/Toast';
import { useAuth } from '../contexts/AuthContext';
import { SITUACAO_ENTREGA } from '../dominio/rotulos';
import { useAsync } from '../hooks/useAsync';
import { useCadastros } from '../hooks/useCadastros';
import { servicos } from '../services';
import { mensagemSegura } from '../services/http';
import type { Contrato, Entrega } from '../types/models';
import { dataHora, numero, paraNumero } from '../utils/format';

const PASSOS = ['Contrato', 'Fardos e dormentes', 'Revisar e confirmar'];

/** Baixa o XML fictício da NF da entrega (para testar a importação em NF e DOF). */
async function baixarXml(en: Entrega) {
  const xml = await servicos.simulador.xmlNf(en.id);
  const url = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `NF-${en.nfNumero}.xml`;
  a.click();
  URL.revokeObjectURL(url);
}

interface PropsAssistente { aberto: boolean; contratos: Contrato[]; inicial?: string; porFardo: number; aoFechar: () => void; aoGerar: (en: Entrega) => void }

/**
 * Assistente "Gerar entrega" (seção 9.5 do plano): contrato, fardos e dormentes por item (sem passar do saldo a emitir)
 * e revisão. O serviço emite fardos e dormentes com IDs sequenciais do contrato e cria NF e DOF de exemplo.
 */
function GerarEntrega({ aberto, contratos, inicial, porFardo, aoFechar, aoGerar }: PropsAssistente) {
  const cad = useCadastros();
  const [passo, setPasso] = useState(0);
  const [contratoId, setContratoId] = useState('');
  const [qtd, setQtd] = useState<Record<string, { fardos: string; porFardo: string }>>({});
  const [erro, setErro] = useState<string>();
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setPasso(0); setErro(undefined); setQtd({});
    setContratoId(contratos.find((c) => c.numero === inicial)?.id ?? '');
  }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps

  const contrato = contratos.find((c) => c.id === contratoId);
  const linhas = (contrato?.itens ?? []).map((i) => {
    const q = qtd[i.id] ?? { fardos: '0', porFardo: String(porFardo) };
    const fardos = paraNumero(q.fardos, true) || 0;
    const por = paraNumero(q.porFardo, true) || 0;
    return { item: i, q, fardos, por, total: fardos * por, passou: fardos * por > i.saldoAEmitir };
  });
  const totalFardos = linhas.reduce((s, l) => s + l.fardos, 0);
  const totalDormentes = linhas.reduce((s, l) => s + l.total, 0);

  function avancar() {
    setErro(undefined);
    if (passo === 0 && !contrato) { setErro('Escolha o contrato.'); return; }
    if (passo === 1) {
      if (!totalFardos) { setErro('Informe ao menos um fardo.'); return; }
      if (linhas.some((l) => l.fardos > 0 && (l.por < 1 || l.por > 50))) { setErro('De 1 a 50 dormentes por fardo.'); return; }
      if (linhas.some((l) => l.passou)) { setErro('Algum item passa do saldo a emitir (contratado menos emitidos não reprovados).'); return; }
    }
    setPasso((p) => p + 1);
  }

  async function confirmar() {
    if (!contrato) return;
    setEnviando(true); setErro(undefined);
    try {
      const en = await servicos.simulador.gerarEntrega({
        contratoId: contrato.id,
        itens: linhas.filter((l) => l.fardos > 0).map((l) => ({ itemContratoId: l.item.id, fardos: l.fardos, dormentesPorFardo: l.por })),
      });
      aoGerar(en);
    } catch (e) {
      setErro(mensagemSegura(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      largo titulo="Gerar entrega" aberto={aberto} aoFechar={aoFechar}
      rodape={<>
        {passo > 0 && <button type="button" className="btn btn-sec" onClick={() => setPasso((p) => p - 1)} disabled={enviando}>Voltar</button>}
        {passo < 2
          ? <button type="button" className="btn btn-pri" onClick={avancar}>Avançar</button>
          : <button type="button" className="btn btn-pri" onClick={() => void confirmar()} disabled={enviando}>{enviando ? 'Gerando…' : 'Gerar entrega'}</button>}
      </>}
    >
      <ProgressoPassos passos={PASSOS} atual={passo} />
      {erro && <div className="aviso aviso-critico" role="alert">{erro}</div>}
      {passo === 0 && (
        <div className="campo">
          <label htmlFor="sim-contrato">Contrato vigente<span className="obrig" aria-hidden="true"> *</span></label>
          <select id="sim-contrato" value={contratoId} onChange={(e) => setContratoId(e.target.value)}>
            <option value="">Selecione…</option>
            {contratos.map((c) => <option key={c.id} value={c.id}>{c.numero} · {cad.nomeFornecedor(c.fornecedorId)}</option>)}
          </select>
          <span className="ajuda">Os IDs continuam a sequência do contrato: nenhum se repete entre entregas.</span>
        </div>
      )}
      {passo === 1 && contrato && (
        <ul className="itens-simulador">
          {linhas.map((l) => (
            <li key={l.item.id} className={l.passou ? 'invalido' : undefined}>
              <div>
                <strong>{cad.descreverItem(l.item)}</strong>
                <span className="mudo">Saldo a emitir: {numero(l.item.saldoAEmitir)} de {numero(l.item.quantidade)}</span>
              </div>
              <label className="campo-contador"><span>Fardos</span>
                <Contador rotulo={`${cad.descreverItem(l.item)}: fardos`} valor={l.q.fardos} min={0} max={50} invalido={l.passou} aoMudar={(v) => setQtd((s) => ({ ...s, [l.item.id]: { ...l.q, fardos: v } }))} />
              </label>
              <label className="campo-contador"><span>Dormentes por fardo</span>
                <Contador rotulo={`${cad.descreverItem(l.item)}: dormentes por fardo`} valor={l.q.porFardo} min={1} max={50} invalido={l.passou} aoMudar={(v) => setQtd((s) => ({ ...s, [l.item.id]: { ...l.q, porFardo: v } }))} />
              </label>
              <span className={l.passou ? 'texto-critico' : 'mudo'}>{numero(l.total)} dormentes{l.passou && ' · passa do saldo a emitir'}</span>
            </li>
          ))}
        </ul>
      )}
      {passo === 2 && contrato && (
        <div className="resumo-revisao">
          <p>Contrato <span className="mono">{contrato.numero}</span> · {cad.nomeFornecedor(contrato.fornecedorId)}</p>
          <ul>
            {linhas.filter((l) => l.fardos > 0).map((l) => <li key={l.item.id}>{cad.descreverItem(l.item)}: {l.fardos} fardo(s) × {l.por} = {numero(l.total)} dormentes</li>)}
          </ul>
          <p><strong>{numero(totalFardos)} fardos e {numero(totalDormentes)} dormentes</strong>, com IDs sequenciais do contrato, em trânsito.</p>
          <p className="mudo">Junto, uma NF e uma DOF de exemplo (validade em 7 dias), como se tivessem sido cadastradas em NF e DOF: a entrega aparece "A caminho" em Recebimentos.</p>
        </div>
      )}
    </Modal>
  );
}

/** Simulador do fornecedor (seção 9.5 do plano): só para demonstração. */
export default function Simulador() {
  const { pode } = useAuth();
  const notificar = useToast();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const parametros = useAsync(() => servicos.parametros.obter(), []);
  const todos = useAsync(() => servicos.contratos.listar({ pageSize: 500 }), []);
  const [aberto, setAberto] = useState(false);
  const [rec, setRec] = useState(0);
  const pedido = params.get('contrato') ?? undefined;
  const contratos = todos.dados?.items ?? [];
  const vigentes = useMemo(() => contratos.filter((c) => c.situacao === 'vigente'), [contratos]);
  const numeroDe = (id: string) => contratos.find((c) => c.id === id)?.numero ?? '—';
  const ligado = !!parametros.dados?.modoDemonstracao;

  // Vindo da página do contrato (?contrato=AR00224-01): o assistente já abre com ele.
  useEffect(() => { if (pedido && ligado && contratos.length) setAberto(true); }, [pedido, ligado, contratos.length]);

  const colunas: Coluna<Entrega>[] = [
    { chave: 'nfNumero', titulo: 'NF', ordenavel: true, render: (en) => `NF ${en.nfNumero}` },
    { chave: 'contratoId', titulo: 'Contrato', render: (en) => <span className="mono">{numeroDe(en.contratoId)}</span> },
    { chave: 'fardosIds', titulo: 'Fardos', alinhar: 'right', render: (en) => numero(en.fardosIds.length) },
    { chave: 'dormentes', titulo: 'Dormentes', alinhar: 'right', ordenavel: true, render: (en) => numero(en.dormentes) },
    { chave: 'situacao', titulo: 'Situação', render: (en) => <BadgeDe mapa={SITUACAO_ENTREGA} valor={en.situacao} /> },
    { chave: 'criadoEm', titulo: 'Gerada em', ordenavel: true, render: (en) => dataHora(en.criadoEm) },
  ];

  return (
    <>
      <CabecalhoPagina
        titulo="Simulador do fornecedor" selo={<SeloDemo />}
        subtitulo="Gera fardos e dormentes com IDs do contrato, NF e DOF de exemplo, e imprime as etiquetas com QR."
        acoes={ligado && pode('simulador:usar') && <button className="btn btn-pri" onClick={() => setAberto(true)}>Gerar entrega</button>}
      />
      <Aviso tom="alerta"><strong>Demonstração.</strong> Na operação real, o fornecedor grava o QR na plaquinha seguindo o padrão do contrato.</Aviso>
      {parametros.dados && !ligado && <Aviso tom="critico">O modo demonstração está desligado em Configurações: o simulador não gera entregas.</Aviso>}
      <ListPage<Entrega>
        titulo="Entregas geradas" subnivel
        listar={(q) => servicos.documentos.listarEntregas({ ...q, filters: { ...q.filters, origem: 'simulador' } })}
        recarregar={rec}
        colunas={colunas}
        acoesLinha={[
          { rotulo: 'Imprimir etiquetas', principal: true, aoClicar: (en) => nav(`/simulador/etiquetas/${en.id}`) },
          { rotulo: 'Baixar XML da NF', aoClicar: (en) => { baixarXml(en).catch((e) => notificar('erro', mensagemSegura(e))); } },
        ]}
      />
      <GerarEntrega
        aberto={aberto} contratos={vigentes} inicial={pedido} porFardo={parametros.dados?.dormentesPorFardoPadrao ?? 14}
        aoFechar={() => { setAberto(false); if (pedido) setParams({}, { replace: true }); }}
        aoGerar={(en) => {
          setAberto(false);
          if (pedido) setParams({}, { replace: true });
          notificar('sucesso', `Entrega da NF ${en.nfNumero} gerada: ${en.fardosIds.length} fardo(s), ${numero(en.dormentes)} dormentes.`);
          setRec((x) => x + 1);
          todos.recarregar();
        }}
      />
    </>
  );
}
