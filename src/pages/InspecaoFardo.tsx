import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Badge, BadgeDe } from '../components/Badge';
import { CabecalhoObjeto, FatoChave } from '../components/Cabecalhos';
import { CodigoLink } from '../components/Codigos';
import { Aviso, Carregando, Erro, Vazio } from '../components/Estados';
import { Icone } from '../components/Icone';
import { BarraProgresso } from '../components/Indicadores';
import { LeitorQr, type RetornoLeitura } from '../components/LeitorQr';
import { Modal } from '../components/Modal';
import { RodapeAcoes } from '../components/RodapeAcoes';
import { useToast } from '../components/Toast';
import { PROTOCOLO_INSPECTOR } from '../config/env';
import { useAuth } from '../contexts/AuthContext';
import { linkQr, RE_FARDO, type CodigoLido } from '../dominio/identificacao';
import { RESULTADO_INSPECAO, rotuloCategoria, SITUACAO_FARDO } from '../dominio/rotulos';
import { useAsync } from '../hooks/useAsync';
import { useCadastros } from '../hooks/useCadastros';
import { useTelaPequena } from '../hooks/useTelaPequena';
import { servicos } from '../services';
import { ApiError, mensagemSegura } from '../services/http';
import type { Categoria, Inspecao, InspecaoFardo as DadosInspecaoFardo, ResultadoInspecao } from '../types/models';
import { cm, dataHora, dias, numero } from '../utils/format';

type DormenteInsp = DadosInspecaoFardo['dormentes'][number];

/** Estado de cada dormente na tela de inspeção: pendente, aprovado, reprovado ou não localizado. */
function estadoDoDormente(d: DormenteInsp): { tom: 'cinza' | 'verde' | 'vermelho' | 'laranja'; rotulo: string } {
  if (d.situacao === 'nao_localizado' && !d.inspecao) return { tom: 'laranja', rotulo: 'Não localizado' };
  if (!d.inspecao) return { tom: 'cinza', rotulo: 'Pendente' };
  return d.inspecao.resultado === 'aprovado' ? { tom: 'verde', rotulo: 'Aprovado' } : { tom: 'vermelho', rotulo: 'Reprovado' };
}

/** Lido que não pertence ao fardo: fica visível como pendência até a pessoa resolver. */
interface Pendencia { id: string; mensagem: string }

/**
 * Inspeção do fardo (seções 9.10 e 11.1 do plano). Esquerda: os dormentes com o estado; direita: o último lido e as
 * formas de inspecionar (Inspector, simulação, registro à mão). "Registrar à mão" é tela de campo: ler o QR, tocar em
 * Aprovado ou Reprovado e na categoria, e a câmera continua aberta para o próximo. Concluir guarda os aprovados no
 * local escolhido, segrega os reprovados e pede justificativa para os não lidos, que ficam "não localizado".
 */
export default function InspecaoFardo() {
  const { fardo: id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const { pode } = useAuth();
  const notificar = useToast();
  const nav = useNavigate();
  const cad = useCadastros();
  const pequena = useTelaPequena();
  const r = useAsync(() => servicos.inspecao.obterFardo(id), [id]);
  const parametros = useAsync(() => servicos.parametros.obter(), []);
  const [atual, setAtual] = useState<DadosInspecaoFardo>();
  const [ultimo, setUltimo] = useState<Inspecao>();
  const [pendencias, setPendencias] = useState<Pendencia[]>([]);
  const [lendo, setLendo] = useState(false);
  const [lido, setLido] = useState<string>();
  const [aprovando, setAprovando] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [erroRegistro, setErroRegistro] = useState<{ mensagem: string; repetir: () => void }>();
  const [simulando, setSimulando] = useState(false);
  const [concluir, setConcluir] = useState(false);

  useEffect(() => { setAtual(r.dados); }, [r.dados]);
  const info = atual ?? r.dados;
  const operar = pode('inspecao:operar');
  const procurado = params.get('dormente')?.toUpperCase();

  // Vindo da ficha do dormente ou dos não localizados (?dormente=): o leitor já abre com ele lido.
  useEffect(() => {
    if (!procurado || !info || !operar) return;
    const d = info.dormentes.find((x) => x.id === procurado);
    if (d && (d.situacao === 'aguardando_inspecao' || d.situacao === 'nao_localizado')) { setLido(d.id); setLendo(true); }
    setParams((p) => { p.delete('dormente'); return p; }, { replace: true });
  }, [procurado, !!info]); // eslint-disable-line react-hooks/exhaustive-deps

  const contagem = useMemo(() => {
    const ds = info?.dormentes ?? [];
    const abertos = ds.filter((d) => d.situacao === 'aguardando_inspecao');
    return {
      aprovados: abertos.filter((d) => d.inspecao?.resultado === 'aprovado'),
      reprovados: abertos.filter((d) => d.inspecao?.resultado === 'reprovado'),
      naoLidos: abertos.filter((d) => !d.inspecao),
    };
  }, [info]);

  if (r.carregando && !info) return <section className="painel"><Carregando /></section>;
  if (r.erro instanceof ApiError && r.erro.status === 404) {
    return <section className="painel"><Vazio mensagem={`Fardo ${id} não encontrado.`} dica={RE_FARDO.test(id) ? 'Confira o código na etiqueta do fardo.' : 'O código não tem o formato de um fardo (ex. AR00224-01-F012).'} /></section>;
  }
  if (r.erro || !info) return <section className="painel"><Erro erro={r.erro} aoTentar={r.recarregar} /></section>;

  const { fardo: f, item, local, dormentes } = info;
  const aberta = !!f.recebidoEm && (f.situacao === 'aguardando_inspecao' || f.situacao === 'em_inspecao');
  const naoLocalizados = dormentes.filter((d) => d.situacao === 'nao_localizado');
  const podeRegistrar = operar && (aberta || naoLocalizados.length > 0);
  const demonstracao = !!parametros.dados?.modoDemonstracao;
  const enderecoInspector = `${PROTOCOLO_INSPECTOR}?${new URLSearchParams({
    fardo: f.id, especie: item.especie.nomeCientifico, tamanho: item.tamanho.codigo, quantidade: String(dormentes.length), retorno: linkQr('fardo', f.id),
  }).toString()}`;

  /** Leitura no modo "Registrar à mão": aceita só dormente deste fardo ainda sem conclusão. */
  function aoLer(c: CodigoLido): RetornoLeitura {
    if (gravando) return { ok: false, mensagem: 'Aguarde: gravando o resultado anterior.' };
    if (lido) return { ok: false, mensagem: `Registre o resultado do ${lido} antes de ler outro.` };
    if (c.tipo !== 'dormente') return { ok: false, mensagem: 'Este QR não é de dormente. Leia a plaquinha do dormente.' };
    const d = dormentes.find((x) => x.id === c.id);
    if (!d) {
      const mensagem = `${c.id} não pertence a este fardo.`;
      setPendencias((l) => (l.some((p) => p.id === c.id) ? l : [...l, { id: c.id, mensagem }]));
      return { ok: false, mensagem: `${mensagem} Separe o dormente e confira a etiqueta.` };
    }
    if (d.situacao !== 'aguardando_inspecao' && d.situacao !== 'nao_localizado') return { ok: false, mensagem: `${d.id} já está com a inspeção concluída.` };
    setLido(d.id); setAprovando(false); setErroRegistro(undefined);
    return { ok: true, mensagem: d.inspecao ? `${d.id} já inspecionado: o novo resultado substitui o anterior.` : `${d.id} lido: escolha o resultado.` };
  }

  async function registrar(resultado: ResultadoInspecao, categoria?: Categoria) {
    if (!lido) return;
    const dormenteId = lido;
    setGravando(true); setErroRegistro(undefined);
    try {
      const novo = await servicos.inspecao.registrar(dormenteId, { origem: 'manual', resultado, categoria }, f.id);
      setAtual(novo);
      setUltimo(novo.dormentes.find((d) => d.id === dormenteId)?.inspecao);
      setLido(undefined); setAprovando(false);
      if (typeof navigator.vibrate === 'function') navigator.vibrate(60);
    } catch (e) {
      setErroRegistro({ mensagem: mensagemSegura(e), repetir: () => void registrar(resultado, categoria) });
    } finally {
      setGravando(false);
    }
  }

  async function simular() {
    setSimulando(true);
    try {
      const novo = await servicos.inspecao.simularFardo(f.id);
      setAtual(novo);
      notificar('sucesso', `Inspeção simulada: ${novo.inspecionados} de ${novo.dormentes.length} dormentes com resultado.`);
    } catch (e) { notificar('erro', mensagemSegura(e)); }
    finally { setSimulando(false); }
  }

  const ultimoDormente = ultimo && dormentes.find((d) => d.id === ultimo.dormenteId);
  const progresso = f.progressoInspecao ?? { inspecionados: info.inspecionados, total: dormentes.length };

  /** Painel de decisão embaixo da câmera: botões grandes, sem digitação. */
  const decisao = (
    <div className="decisao-inspecao" aria-live="polite">
      {lido ? (
        <>
          <p className="decisao-id"><span className="mudo">Dormente</span> <span className="mono">{lido}</span></p>
          {erroRegistro && (
            <div className="aviso aviso-critico" role="alert">
              {erroRegistro.mensagem} <button type="button" className="btn btn-sec btn-peq" onClick={erroRegistro.repetir}>Tentar de novo</button>
            </div>
          )}
          {!aprovando ? (
            <div className="decisao-botoes">
              <button type="button" className="btn btn-grande btn-aprovado" disabled={gravando} onClick={() => setAprovando(true)}>Aprovado</button>
              <button type="button" className="btn btn-grande btn-reprovado" disabled={gravando} onClick={() => void registrar('reprovado')}>Reprovado</button>
            </div>
          ) : (
            <>
              <p className="decisao-pergunta">Categoria do aprovado</p>
              <div className="decisao-botoes decisao-categorias">
                {([1, 2, 3] as Categoria[]).map((c) => (
                  <button key={c} type="button" className="btn btn-grande btn-acao" disabled={gravando} onClick={() => void registrar('aprovado', c)}>{c}</button>
                ))}
              </div>
              <button type="button" className="btn btn-sec" disabled={gravando} onClick={() => setAprovando(false)}>Voltar</button>
            </>
          )}
          <button type="button" className="btn btn-link" disabled={gravando} onClick={() => { setLido(undefined); setAprovando(false); setErroRegistro(undefined); }}>Cancelar esta leitura</button>
        </>
      ) : (
        <>
          <p className="leitura-contador"><strong>{numero(progresso.inspecionados)} de {numero(progresso.total)}</strong> dormentes com resultado</p>
          {ultimo && ultimoDormente && (
            <p className="mudo">Último: <span className="mono">{ultimo.dormenteId}</span> · <BadgeDe mapa={RESULTADO_INSPECAO} valor={ultimo.resultado} />{ultimo.categoria && <> · {rotuloCategoria(ultimo.categoria)}</>}</p>
          )}
        </>
      )}
    </div>
  );

  return (
    <section className="painel">
      <CabecalhoObjeto
        tipo="Inspeção do fardo" id={f.id} situacao={<BadgeDe mapa={SITUACAO_FARDO} valor={f.situacao} />}
        migalhas={[{ rotulo: 'Inspeção', para: '/inspecao' }, { rotulo: `Fardo ${f.id}` }]}
        acoes={<>
          {aberta && operar && !pequena && <button type="button" className="btn btn-pri" onClick={() => setConcluir(true)}>Concluir inspeção</button>}
          <Link className="btn btn-sec" to={`/f/${f.id}`}>Página do fardo</Link>
        </>}
        fatos={<>
          <FatoChave rotulo="Item" valor={`${item.especie.nomePopular} · ${item.tamanho.codigo}`} />
          <FatoChave rotulo="Inspecionados" valor={`${numero(progresso.inspecionados)} de ${numero(progresso.total)}`} />
          <FatoChave rotulo="Local" valor={local ? local.codigo : '—'} para={local ? `/locais/${local.codigo}` : undefined} />
          <FatoChave rotulo="Recebido há" valor={f.idadeDias !== undefined ? dias(f.idadeDias) : '—'} />
          {info.faltaDeclarada ? <FatoChave rotulo="Falta declarada" valor={`${numero(info.faltaDeclarada)} dormente(s)`} /> : null}
        </>}
      />

      {!f.recebidoEm && <Aviso tom="alerta">Este fardo ainda não foi recebido: a inspeção começa depois do recebimento.</Aviso>}
      {f.conclusaoInspecao && (
        <Aviso tom="info">
          Inspeção concluída em {dataHora(f.conclusaoInspecao.quando)} por {f.conclusaoInspecao.quem}.
          {naoLocalizados.length > 0 && <> {numero(naoLocalizados.length)} dormente(s) não localizado(s): quando forem encontrados, use "Registrar à mão".</>}
        </Aviso>
      )}

      <div className="inspecao-grade">
        <div className="inspecao-lista">
          <h2 className="titulo-secao">Dormentes do fardo</h2>
          <BarraProgresso total={progresso.total} recebido={progresso.inspecionados} unidade="com resultado" />
          <ul className="lista-dormentes-inspecao">
            {dormentes.map((d) => {
              const est = estadoDoDormente(d);
              return (
                <li key={d.id} className={d.id === ultimo?.dormenteId ? 'destaque' : undefined}>
                  <CodigoLink codigo={d.id} />
                  <Badge tom={est.tom}>{est.rotulo}</Badge>
                  <span className="mudo">
                    {d.inspecao?.categoria ? rotuloCategoria(d.inspecao.categoria) : ''}
                    {d.medidas ? `${d.inspecao?.categoria ? ' · ' : ''}${cm(d.medidas.comprimentoCm)}` : ''}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <aside className="inspecao-lado">
          <div className="ficha-cartao">
            <h2 className="titulo-secao">Último lido</h2>
            {ultimo && ultimoDormente ? (
              <div className="ultimo-lido">
                <span className="mono ultimo-id">{ultimo.dormenteId}</span>
                <p><BadgeDe mapa={RESULTADO_INSPECAO} valor={ultimo.resultado} />{ultimo.categoria && <> · {rotuloCategoria(ultimo.categoria)}</>}</p>
                {ultimo.medidas && <p className="mudo">{cm(ultimo.medidas.comprimentoCm)} × {cm(ultimo.medidas.larguraCm)} × {cm(ultimo.medidas.alturaCm)}</p>}
                <p className="mudo">{ultimo.inspetor}{ultimo.origem === 'manual' && ' (lançado à mão)'} · {dataHora(ultimo.inspecionadoEm)}</p>
              </div>
            ) : <p className="mudo">Nenhum dormente lido nesta tela ainda.</p>}
          </div>

          {pendencias.length > 0 && (
            <div className="ficha-cartao cartao-alerta" role="alert">
              <h2 className="titulo-secao">Pendências</h2>
              <ul className="lista-simples">
                {pendencias.map((p) => (
                  <li key={p.id}>
                    <CodigoLink codigo={p.id} /> <span>{p.mensagem}</span>
                    <button type="button" className="btn btn-link" onClick={() => setPendencias((l) => l.filter((x) => x.id !== p.id))}>Resolvido</button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {podeRegistrar && (
            <div className="ficha-cartao">
              <h2 className="titulo-secao">Inspecionar</h2>
              <div className="acoes-coluna">
                <button type="button" className="btn btn-acao btn-grande" onClick={() => setLendo(true)}><Icone nome="qr" /> Registrar à mão</button>
                {aberta && (
                  <a className="btn btn-sec" href={enderecoInspector}>Abrir no Inspector</a>
                )}
                {aberta && demonstracao && (
                  <button type="button" className="btn btn-sec" disabled={simulando || contagem.naoLidos.length === 0} onClick={() => void simular()}>
                    {simulando ? 'Simulando…' : 'Simular inspeção do fardo'}
                  </button>
                )}
              </div>
              <p className="ajuda">
                À mão: leia o QR, toque em Aprovado ou Reprovado e na categoria; a câmera continua aberta para o próximo.
                {aberta && ' "Abrir no Inspector" só funciona no computador com o Railway Edge Inspector instalado.'}
                {aberta && demonstracao && ' A simulação dá resultado aos dormentes ainda sem inspeção (cerca de 5% reprovados).'}
              </p>
            </div>
          )}
        </aside>
      </div>

      {aberta && operar && pequena && (
        <RodapeAcoes>
          <button type="button" className="btn btn-acao" onClick={() => setLendo(true)}>Registrar à mão</button>
          <button type="button" className="btn btn-pri" onClick={() => setConcluir(true)}>Concluir</button>
        </RodapeAcoes>
      )}

      <LeitorQr
        aberto={lendo} aoFechar={() => { setLendo(false); setLido(undefined); setAprovando(false); setErroRegistro(undefined); }}
        modo="capturar" continuo aoLer={aoLer} titulo={`Registrar à mão · ${f.id}`} cameraReduzida={!!lido}
      >
        {decisao}
      </LeitorQr>

      <ConcluirInspecao
        aberto={concluir && !lendo} info={info} contagem={contagem} cad={cad}
        aoFechar={() => setConcluir(false)}
        aoConcluir={(msg) => { setConcluir(false); notificar('sucesso', msg); nav(`/f/${f.id}`); }}
      />
    </section>
  );
}

interface PropsConcluir {
  aberto: boolean;
  info: DadosInspecaoFardo;
  contagem: { aprovados: DormenteInsp[]; reprovados: DormenteInsp[]; naoLidos: DormenteInsp[] };
  cad: ReturnType<typeof useCadastros>;
  aoFechar: () => void;
  aoConcluir: (mensagem: string) => void;
}

/** Conclusão: local de guarda (lido pelo QR do local ou escolhido), o que vai para onde e a justificativa dos não lidos. */
function ConcluirInspecao({ aberto, info, contagem, cad, aoFechar, aoConcluir }: PropsConcluir) {
  const [localId, setLocalId] = useState('');
  const [justificativa, setJustificativa] = useState('');
  const [lendoLocal, setLendoLocal] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string>();
  const [enviando, setEnviando] = useState(false);
  const locais = (cad.listas?.locais ?? []).filter((l) => l.ativo && l.tipo === 'armazenagem');
  const { aprovados, reprovados, naoLidos } = contagem;
  const cabeNaFalta = !!info.faltaDeclarada && naoLidos.length > 0 && naoLidos.length <= info.faltaDeclarada;

  useEffect(() => {
    if (!aberto) return;
    setErros({}); setErroGeral(undefined); setLocalId('');
    setJustificativa(cabeNaFalta ? info.justificativaSugerida ?? '' : '');
  }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps

  function aoLerLocal(c: CodigoLido): RetornoLeitura {
    if (c.tipo !== 'local') return { ok: false, mensagem: 'Leia o QR do local de guarda.' };
    const codigo = c.id.replace(/^LOC-/, '');
    const l = locais.find((x) => x.codigo === codigo);
    if (!l) return { ok: false, mensagem: `O local ${codigo} não é de armazenagem ou está inativo.` };
    setLocalId(l.id);
    return { ok: true, mensagem: `Local ${codigo} escolhido.` };
  }

  async function confirmar() {
    const e: Record<string, string> = {};
    if (!localId) e.localId = 'Escolha o local de guarda.';
    if (naoLidos.length && !justificativa.trim()) e.justificativa = 'Justificativa obrigatória com dormentes não lidos.';
    setErros(e); setErroGeral(undefined);
    if (Object.keys(e).length) return;
    setEnviando(true);
    try {
      await servicos.inspecao.concluir(info.fardo.id, { localId, justificativa: naoLidos.length ? justificativa : undefined });
      aoConcluir(`Inspeção do fardo ${info.fardo.id} concluída: ${aprovados.length} em estoque em ${cad.codigoLocal(localId)}, ${reprovados.length} segregado(s)${naoLidos.length ? `, ${naoLidos.length} não localizado(s)` : ''}.`);
    } catch (err) {
      if (err instanceof ApiError && err.detalhes) setErros(err.detalhes);
      setErroGeral(mensagemSegura(err));
    } finally { setEnviando(false); }
  }

  const erro = (k: string) => erros[k] && <span className="erro-campo" role="alert">{erros[k]}</span>;

  return (
    <>
      <Modal
        largo titulo={`Concluir inspeção · ${info.fardo.id}`} aberto={aberto && !lendoLocal} aoFechar={aoFechar}
        rodape={<>
          <button type="button" className="btn btn-sec" onClick={aoFechar} disabled={enviando}>Cancelar</button>
          <button type="button" className="btn btn-pri" onClick={() => void confirmar()} disabled={enviando}>{enviando ? 'Concluindo…' : 'Concluir inspeção'}</button>
        </>}
      >
        {erroGeral && <div className="aviso aviso-critico" role="alert">{erroGeral}</div>}
        <ul className="resumo-conclusao">
          <li><Badge tom="verde">{numero(aprovados.length)}</Badge> aprovado(s): ficam em estoque no fardo, no local de guarda.</li>
          <li><Badge tom="vermelho">{numero(reprovados.length)}</Badge> reprovado(s): vão para o local de segregação.</li>
          {naoLidos.length > 0 && <li><Badge tom="laranja">{numero(naoLidos.length)}</Badge> sem leitura: ficam como não localizados (pendência do gestor).</li>}
        </ul>
        {naoLidos.length > 0 && (
          <p className="mudo quebra-palavra">Não lidos: {naoLidos.map((d) => d.id).join(', ')}</p>
        )}
        <div className="campo">
          <label htmlFor="conc-local">Local de guarda<span className="obrig" aria-hidden="true"> *</span></label>
          <div className="linha-com-botao">
            <select id="conc-local" value={localId} onChange={(e) => setLocalId(e.target.value)}>
              <option value="">Selecione…</option>
              {locais.map((l) => <option key={l.id} value={l.id}>{l.codigo} · {l.descricao} ({numero(Math.max(0, l.capacidade - l.ocupacao))} livres)</option>)}
            </select>
            <button type="button" className="btn btn-acao" onClick={() => setLendoLocal(true)}><Icone nome="qr" /> Ler QR do local</button>
          </div>
          {erro('localId')}
        </div>
        {naoLidos.length > 0 && (
          <div className="campo">
            <label htmlFor="conc-just">Justificativa dos não lidos<span className="obrig" aria-hidden="true"> *</span></label>
            {cabeNaFalta && <p className="aviso aviso-info">Os não lidos cabem na falta de {numero(info.faltaDeclarada!)} dormente(s) declarada no recebimento: a justificativa já vem preenchida.</p>}
            <textarea id="conc-just" rows={3} maxLength={500} value={justificativa} onChange={(e) => setJustificativa(e.target.value)} placeholder="Ex.: QR ilegível, dormente não encontrado no fardo" />
            {erro('justificativa')}
          </div>
        )}
      </Modal>
      <LeitorQr aberto={lendoLocal} aoFechar={() => setLendoLocal(false)} modo="capturar" aoLer={aoLerLocal} titulo="Ler QR do local de guarda" />
    </>
  );
}
