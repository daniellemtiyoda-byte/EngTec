import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BadgeDe, SeloDemo } from '../components/Badge';
import { CabecalhoPagina } from '../components/Cabecalhos';
import { Contador } from '../components/Contador';
import { faltaEmitirNaParcela, tamanhosDaParcela } from '../dominio/contratos';
import { CARGA_PADRAO_FARDOS, DORMENTES_POR_FARDO_POR_CODIGO, MAX_DORMENTES_POR_FARDO, MAX_FARDOS_POR_ITEM, sugerirDivisao, textoDivisao } from '../dominio/parametros';
import { Aviso } from '../components/Estados';
import { ListPage, type Coluna } from '../components/ListPage';
import { Modal } from '../components/Modal';
import { ProgressoPassos } from '../components/Passos';
import { useToast } from '../components/Toast';
import { useAuth } from '../contexts/AuthContext';
import { SITUACAO_EMISSAO } from '../dominio/rotulos';
import { useAsync } from '../hooks/useAsync';
import { useCadastros } from '../hooks/useCadastros';
import { servicos } from '../services';
import { mensagemSegura } from '../services/erros';
import type { Contrato, Emissao } from '../types/models';
import { data, dataHora, m3, numero, paraNumero } from '../utils/format';

const PASSOS = ['Contrato', 'Fardos e dormentes', 'Revisar e confirmar'];

/** Baixa o XML fictício da NF da emissão (para a importação em NF e DOF). */
async function baixarXml(em: Emissao) {
  const xml = await servicos.simulador.xmlNf(em.id);
  const url = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `NF-${em.nf.numero}.xml`;
  a.click();
  URL.revokeObjectURL(url);
}

interface PropsAssistente { aberto: boolean; contratos: Contrato[]; inicial?: string; porFardo: number; emissoes: Emissao[]; aoFechar: () => void; aoGerar: (em: Emissao) => void }

/**
 * Assistente "Emitir fardos" (seção 9.5 do plano): contrato, fardos e dormentes por item (sem passar do saldo a emitir)
 * e revisão, onde se escolhe se NF e DOF já entram cadastradas ou se a emissão gera só os fardos (a CPTM cadastra
 * NF e DOF depois, pelo XML baixado aqui). O serviço emite fardos e dormentes com IDs sequenciais do contrato.
 */
function EmitirFardos({ aberto, contratos, inicial, porFardo, emissoes, aoFechar, aoGerar }: PropsAssistente) {
  const cad = useCadastros();
  const [passo, setPasso] = useState(0);
  const [contratoId, setContratoId] = useState('');
  // total = "Dormentes a enviar"; fardos/porFardo só existem quando a pessoa ajustou a divisão à mão ("Ajustar divisão").
  const [qtd, setQtd] = useState<Record<string, { total: string; fardos?: string; porFardo?: string; ajustando?: boolean }>>({});
  const [comDocumentos, setComDocumentos] = useState(true);
  const [parcela, setParcela] = useState('');
  const [reentrega, setReentrega] = useState(false);
  const [erro, setErro] = useState<string>();
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setPasso(0); setErro(undefined); setQtd({}); setComDocumentos(true); setParcela(''); setReentrega(false);
    setContratoId(contratos.find((c) => c.numero === inicial)?.id ?? '');
  }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps

  const contrato = contratos.find((c) => c.id === contratoId);
  const padraoDoTamanho = (tamanhoId: string) => DORMENTES_POR_FARDO_POR_CODIGO[cad.codigoTamanho(tamanhoId)] ?? porFardo;

  /** Sugestão de partida: o menor entre o que falta na parcela e uma carga (fardos do padrão). */
  const totalSugerido = (falta: number, tamanhoId: string) => Math.min(falta, CARGA_PADRAO_FARDOS * padraoDoTamanho(tamanhoId));

  /** Ao escolher a parcela, cada tamanho já vem com os "Dormentes a enviar" sugeridos (editável). */
  function escolherParcela(numeroParcela: string) {
    setParcela(numeroParcela);
    const sugestao: typeof qtd = {};
    for (const { item } of tamanhosDaParcela(contrato, numeroParcela)) {
      sugestao[item.id] = { total: String(totalSugerido(faltaEmitirNaParcela(contrato, numeroParcela, item.tamanhoId, emissoes).falta, item.tamanhoId)) };
    }
    setQtd(sugestao);
  }
  /** Emitido na parcela (soma dos tamanhos). */
  const emitidoNaParcela = (n: number) => tamanhosDaParcela(contrato, n).reduce((s, { item }) => s + faltaEmitirNaParcela(contrato, n, item.tamanhoId, emissoes).emitido, 0);
  // Só as parcelas em que ainda há o que emitir; na reentrega, as que têm tamanho com saldo a emitir (reprovados a repor).
  const parcelasComSaldo = (contrato?.parcelas ?? []).filter((p) => tamanhosDaParcela(contrato, p.numero).some(({ item }) =>
    reentrega ? item.saldoAEmitir > 0 : faltaEmitirNaParcela(contrato, p.numero, item.tamanhoId, emissoes).falta > 0));
  const daParcela = contrato?.parcelas.find((p) => String(p.numero) === parcela);
  // Só os tamanhos da parcela escolhida. A divisão sai do total digitado; ajustada à mão, o total passa a ser fardos × por fardo.
  const linhas = tamanhosDaParcela(contrato, parcela).map(({ item: i }) => {
    const padrao = padraoDoTamanho(i.tamanhoId);
    const q = qtd[i.id] ?? { total: '0' };
    const manual = q.fardos !== undefined && q.porFardo !== undefined;
    const auto = sugerirDivisao(paraNumero(q.total, true) || 0, padrao);
    const fardos = manual ? paraNumero(q.fardos!, true) || 0 : auto.fardos;
    const por = manual ? paraNumero(q.porFardo!, true) || 0 : auto.dormentesPorFardo;
    const total = fardos * por;
    return { item: i, q, manual, padrao, aviso: manual ? undefined : auto.aviso, fardos, por, parcela: faltaEmitirNaParcela(contrato, parcela, i.tamanhoId, emissoes), total, passou: total > i.saldoAEmitir };
  });
  const totalFardos = linhas.reduce((s, l) => s + l.fardos, 0);
  const totalDormentes = linhas.reduce((s, l) => s + l.total, 0);

  function avancar() {
    setErro(undefined);
    if (passo === 0 && !contrato) { setErro('Escolha o contrato.'); return; }
    if (passo === 0 && !daParcela) { setErro('Escolha a parcela do cronograma.'); return; }
    if (passo === 1) {
      if (!totalFardos) { setErro('Informe ao menos um fardo.'); return; }
      if (linhas.some((l) => l.fardos > 0 && (l.por < 1 || l.por > MAX_DORMENTES_POR_FARDO))) { setErro(`De 1 a ${MAX_DORMENTES_POR_FARDO} dormentes por fardo.`); return; }
      if (linhas.some((l) => l.passou)) { setErro('Algum item passa do saldo a emitir (contratado menos emitidos não reprovados).'); return; }
    }
    setPasso((p) => p + 1);
  }

  async function confirmar() {
    if (!contrato) return;
    setEnviando(true); setErro(undefined);
    try {
      const em = await servicos.simulador.emitir({
        contratoId: contrato.id, parcela: Number(parcela), reentrega, comDocumentos,
        itens: linhas.filter((l) => l.fardos > 0).map((l) => ({ itemContratoId: l.item.id, fardos: l.fardos, dormentesPorFardo: l.por })),
      });
      aoGerar(em);
    } catch (e) {
      setErro(mensagemSegura(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      largo titulo="Emitir fardos" aberto={aberto} aoFechar={aoFechar}
      rodape={<>
        {passo > 0 && <button type="button" className="btn btn-sec" onClick={() => setPasso((p) => p - 1)} disabled={enviando}>Voltar</button>}
        {passo < 2
          ? <button type="button" className="btn btn-pri" onClick={avancar}>Avançar</button>
          : <button type="button" className="btn btn-pri" onClick={() => void confirmar()} disabled={enviando}>{enviando ? 'Emitindo…' : comDocumentos ? 'Emitir com NF e DOF' : 'Emitir só os fardos'}</button>}
      </>}
    >
      <ProgressoPassos passos={PASSOS} atual={passo} />
      {erro && <div className="aviso aviso-critico" role="alert">{erro}</div>}
      {passo === 0 && (
        <div className="campo">
          <label htmlFor="sim-contrato">Contrato vigente<span className="obrig" aria-hidden="true"> *</span></label>
          <select id="sim-contrato" value={contratoId} onChange={(e) => { setContratoId(e.target.value); setParcela(''); setQtd({}); }}>
            <option value="">Selecione…</option>
            {contratos.map((c) => <option key={c.id} value={c.id}>{c.numero} · {cad.nomeFornecedor(c.fornecedorId)}</option>)}
          </select>
          <span className="ajuda">Os IDs continuam a sequência do contrato: nenhum se repete entre entregas. Espécie, classe e tratamento de cada fardo são atribuídos pelo simulador, entre as espécies que o fornecedor fornece.</span>
          {contrato && (
            <>
              <label htmlFor="sim-parcela">Parcela do cronograma<span className="obrig" aria-hidden="true"> *</span></label>
              <select id="sim-parcela" value={parcela} onChange={(e) => escolherParcela(e.target.value)}>
                <option value="">Selecione…</option>
                {parcelasComSaldo.map((p) => <option key={p.numero} value={p.numero}>{p.numero}ª · emitido {numero(emitidoNaParcela(p.numero))} de {numero(p.quantidade)} · até {data(p.fim)}</option>)}
              </select>
              {!parcelasComSaldo.length && <span className="ajuda">Nenhuma parcela com saldo a emitir. Para repor reprovados, marque Reentrega.</span>}
              <label className="caixa"><input type="checkbox" checked={reentrega} onChange={(e) => { setReentrega(e.target.checked); setParcela(''); setQtd({}); }} /> Reentrega (reposição de reprovados)</label>
            </>
          )}
        </div>
      )}
      {passo === 1 && contrato && (
        <ul className="itens-simulador">
          {linhas.map((l) => (
            <li key={l.item.id} className={l.passou ? 'invalido' : undefined}>
              <div>
                <strong>{cad.descreverTamanho(l.item.tamanhoId)}</strong>
                <span className="mudo">Parcela {numero(l.parcela.quantidade)} · emitido {numero(l.parcela.emitido)} · falta {numero(l.parcela.falta)}</span>
              </div>
              <label className="campo-contador"><span>Dormentes a enviar</span>
                <Contador
                  rotulo={`${cad.descreverTamanho(l.item.tamanhoId)}: dormentes a enviar`} min={0} invalido={l.passou}
                  valor={l.manual ? String(l.total) : l.q.total}
                  aoMudar={(v) => setQtd((s) => ({ ...s, [l.item.id]: { total: v, ajustando: l.q.ajustando } }))}
                />
              </label>
              <span className={l.passou ? 'texto-critico' : 'divisao-texto'}>
                {l.fardos > 0 ? `${textoDivisao(l.fardos, l.por)}${l.manual ? ` (${numero(l.total)} dormentes)` : ''}` : 'Nenhum fardo'}
                {l.passou && ' · passa do saldo a emitir'}
              </span>
              {l.aviso && <span className="mudo aviso-divisao">{l.aviso}</span>}
              <span className="mudo secundario">Saldo do contrato: {numero(l.item.saldoAEmitir)} de {numero(l.item.quantidade)}</span>
              <div className="ajuste-divisao">
                <button type="button" className="btn-link" aria-expanded={!!l.q.ajustando} onClick={() => setQtd((s) => ({ ...s, [l.item.id]: { ...l.q, ajustando: !l.q.ajustando } }))}>Ajustar divisão</button>
                {l.q.ajustando && (
                  <>
                    <label className="campo-contador"><span>Fardos</span>
                      <Contador rotulo={`${cad.descreverTamanho(l.item.tamanhoId)}: fardos`} valor={String(l.fardos)} min={0} max={MAX_FARDOS_POR_ITEM} invalido={l.passou}
                        aoMudar={(v) => setQtd((s) => ({ ...s, [l.item.id]: { ...l.q, total: String(l.total), fardos: v, porFardo: String(l.por || l.padrao) } }))} />
                    </label>
                    <label className="campo-contador"><span>Dormentes por fardo</span>
                      <Contador rotulo={`${cad.descreverTamanho(l.item.tamanhoId)}: dormentes por fardo`} valor={String(l.por)} min={1} max={MAX_DORMENTES_POR_FARDO} invalido={l.passou}
                        aoMudar={(v) => setQtd((s) => ({ ...s, [l.item.id]: { ...l.q, total: String(l.total), fardos: String(l.fardos), porFardo: v } }))} />
                    </label>
                    <button type="button" className="btn-link" onClick={() => setQtd((s) => ({ ...s, [l.item.id]: { total: String(totalSugerido(l.parcela.falta, l.item.tamanhoId)), ajustando: true } }))}>Usar sugestão</button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {passo === 2 && contrato && (
        <div className="resumo-revisao">
          <p>Contrato <span className="mono">{contrato.numero}</span> · {cad.nomeFornecedor(contrato.fornecedorId)} · {parcela}ª parcela{reentrega && ' · reentrega'}</p>
          <ul>
            {linhas.filter((l) => l.fardos > 0).map((l) => <li key={l.item.id}>{cad.descreverTamanho(l.item.tamanhoId)}: {textoDivisao(l.fardos, l.por)} ({numero(l.total)} dormentes)</li>)}
          </ul>
          <p><strong>{numero(totalFardos)} fardos e {numero(totalDormentes)} dormentes</strong>, com IDs sequenciais do contrato, em trânsito.</p>
          <fieldset className="opcoes-radio">
            <legend>NF e DOF</legend>
            <label className="cartao-escolha">
              <input type="radio" name="sim-docs" checked={comDocumentos} onChange={() => setComDocumentos(true)} />
              <span><strong>Com NF e DOF já cadastradas</strong><span className="mudo">A entrega aparece "A caminho" em Recebimentos, como se a CPTM já tivesse cadastrado os documentos.</span></span>
            </label>
            <label className="cartao-escolha">
              <input type="radio" name="sim-docs" checked={!comDocumentos} onChange={() => setComDocumentos(false)} />
              <span><strong>Gerar só os fardos (sem NF e DOF)</strong><span className="mudo">Para demonstrar o fluxo completo: baixe o XML da NF aqui, cadastre NF e DOF em Entrada › NF e DOF e depois receba.</span></span>
            </label>
          </fieldset>
          <p className="mudo">A NF e a DOF de exemplo têm validade de 7 dias; com elas vão o Boletim de Inspeção e o Relatório Técnico. Os dados ficam em "Ver documentos" na lista.</p>
        </div>
      )}
    </Modal>
  );
}

/** Documentos de exemplo da emissão (DOF, Boletim de Inspeção e Relatório Técnico), para digitar no cadastro de NF e DOF. */
function VerDof({ emissao, aoFechar }: { emissao?: Emissao; aoFechar: () => void }) {
  const cad = useCadastros();
  return (
    <Modal titulo={`Documentos da NF ${emissao?.nf.numero ?? ''}`} aberto={!!emissao} aoFechar={aoFechar} rodape={<button type="button" className="btn btn-sec" onClick={aoFechar}>Fechar</button>}>
      {emissao && (
        <div className="resumo-revisao">
          <p>DOF de exemplo que acompanha a NF {emissao.nf.numero}. No cadastro de NF e DOF, o número vem do XML; a validade e o volume por espécie são digitados deste documento.</p>
          <dl className="detalhes">
            <dt>Número</dt><dd className="mono">{emissao.dof.numero}</dd>
            <dt>Validade</dt><dd>{data(emissao.dof.validade)}</dd>
            {emissao.dof.volumes.map((v) => [<dt key={`t${v.especieId}`}>{cad.nomeEspecie(v.especieId)}</dt>, <dd key={`d${v.especieId}`} className="al-right">{m3(v.volumeM3)}</dd>])}
          </dl>
          <p><strong>Boletim de Inspeção {emissao.boletim.numero}</strong> · {data(emissao.boletim.data)} · {cad.nomeEmpresa(emissao.boletim.empresaInspetoraId)}</p>
          <ul>{emissao.boletim.itens.map((i) => <li key={`${i.tamanhoId}${i.especieId}`}>{cad.descreverTamanho(i.tamanhoId)} · {cad.nomeEspecie(i.especieId)}: {numero(i.quantidade)} aprovados</li>)}</ul>
          <p><strong>Relatório Técnico {emissao.relatorioTecnico.numero}</strong> · {data(emissao.relatorioTecnico.data)}</p>
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
  const emissoes = useAsync(() => servicos.simulador.listar({ pageSize: 500 }), [rec]);
  const [verDof, setVerDof] = useState<Emissao>();
  const pedido = params.get('contrato') ?? undefined;
  const contratos = todos.dados?.items ?? [];
  // Só os vigentes com algo a emitir (saldo a emitir = contratado menos emitidos não reprovados).
  const vigentes = useMemo(() => contratos.filter((c) => c.situacao === 'vigente' && c.itens.some((i) => i.saldoAEmitir > 0)), [contratos]);
  const numeroDe = (id: string) => contratos.find((c) => c.id === id)?.numero ?? '—';
  const ligado = !!parametros.dados?.modoDemonstracao;

  // Vindo da página do contrato (?contrato=AR00224-01): o assistente já abre com ele.
  useEffect(() => { if (pedido && ligado && contratos.length) setAberto(true); }, [pedido, ligado, contratos.length]);

  const colunas: Coluna<Emissao>[] = [
    { chave: 'nf', titulo: 'NF', render: (em) => `NF ${em.nf.numero}` },
    { chave: 'contratoId', titulo: 'Contrato', render: (em) => <span className="mono">{numeroDe(em.contratoId)}</span> },
    { chave: 'fardosIds', titulo: 'Fardos', alinhar: 'right', render: (em) => numero(em.fardosIds.length) },
    { chave: 'dormentes', titulo: 'Dormentes', alinhar: 'right', ordenavel: true, render: (em) => numero(em.dormentes) },
    { chave: 'situacao', titulo: 'Situação', render: (em) => <BadgeDe mapa={SITUACAO_EMISSAO} valor={em.situacao} /> },
    { chave: 'criadoEm', titulo: 'Emitida em', ordenavel: true, opcional: true, render: (em) => dataHora(em.criadoEm) },
  ];

  return (
    <>
      <CabecalhoPagina
        titulo="Simulador do fornecedor" selo={<SeloDemo />}
        subtitulo="Emite fardos e dormentes com IDs do contrato, com a NF e a DOF de exemplo, e imprime as etiquetas com QR."
        acoes={ligado && pode('simulador:usar') && <button className="btn btn-pri" onClick={() => setAberto(true)}>Emitir fardos</button>}
      />
      <Aviso tom="alerta"><strong>Demonstração.</strong> Na operação real, o fornecedor grava o QR na plaquinha seguindo o padrão do contrato.</Aviso>
      {parametros.dados && !ligado && <Aviso tom="critico">O modo demonstração está desligado em Configurações: o simulador não emite fardos.</Aviso>}
      <ListPage<Emissao>
        titulo="Emissões" subnivel
        listar={(q) => servicos.simulador.listar(q)}
        recarregar={rec}
        colunas={colunas}
        acoesLinha={[
          { rotulo: 'Imprimir etiquetas', principal: true, aoClicar: (em) => nav(`/simulador/etiquetas/${em.id}`) },
          { rotulo: 'Baixar XML da NF', aoClicar: (em) => { baixarXml(em).catch((e) => notificar('erro', mensagemSegura(e))); } },
          { rotulo: 'Ver documentos', aoClicar: setVerDof },
        ]}
      />
      <VerDof emissao={verDof} aoFechar={() => setVerDof(undefined)} />
      <EmitirFardos
        aberto={aberto} contratos={vigentes} inicial={pedido} porFardo={parametros.dados?.dormentesPorFardoPadrao ?? 14} emissoes={emissoes.dados?.items ?? []}
        aoFechar={() => { setAberto(false); if (pedido) setParams({}, { replace: true }); }}
        aoGerar={(em) => {
          setAberto(false);
          if (pedido) setParams({}, { replace: true });
          notificar('sucesso', em.comDocumentos
            ? `Emitidos ${em.fardosIds.length} fardo(s) e ${numero(em.dormentes)} dormentes, com a entrega da NF ${em.nf.numero} a caminho.`
            : `Emitidos ${em.fardosIds.length} fardo(s) e ${numero(em.dormentes)} dormentes. Baixe o XML da NF ${em.nf.numero} e cadastre NF e DOF.`);
          setRec((x) => x + 1);
          todos.recarregar();
        }}
      />
    </>
  );
}
