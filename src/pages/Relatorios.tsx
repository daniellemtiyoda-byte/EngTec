import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AbasSecao, useAbaNoEndereco } from '../components/Abas';
import { Badge, BadgeDe } from '../components/Badge';
import { CabecalhoPagina } from '../components/Cabecalhos';
import { CodigoLink } from '../components/Codigos';
import { Aviso, Carregando, Erro, Vazio } from '../components/Estados';
import { FormModal, type Campo } from '../components/FormModal';
import { ConfirmModal } from '../components/Modal';
import { Corta, CabecalhoIbama, TabelaRelatorio } from '../components/RelatorioIbama';
import { useToast } from '../components/Toast';
import { useAuth } from '../contexts/AuthContext';
import { AVISO_ARTIGO_53 } from '../dominio/parametros';
import { MOTIVO_PERDA } from '../dominio/rotulos';
import { useAsync } from '../hooks/useAsync';
import { useCadastros, type Cadastros } from '../hooks/useCadastros';
import { servicos } from '../services';
import { mensagemSegura } from '../services/erros';
import type { BalancoEspecie, DestinacaoFinal, Perda, RecebimentoDof, SituacaoRecebimentoDof } from '../types/models';
import { cnpjFormatado, data, dataHora, diasDesde, hojeSP, m3, numero, paraNumero, pct } from '../utils/format';

type AbaRelatorio = 'recebimentos' | 'balanco' | 'destinacoes' | 'saldo' | 'perdas' | 'inventario';
const ABAS: AbaRelatorio[] = ['recebimentos', 'balanco', 'destinacoes', 'saldo', 'perdas', 'inventario'];
/** Abas que usam o período (?de=&ate=); saldo e inventário mostram a situação de agora. */
const COM_PERIODO: AbaRelatorio[] = ['recebimentos', 'balanco', 'destinacoes', 'perdas'];
const TODOS = 1000;

const dias = (n: number) => `${numero(n)} ${n === 1 ? 'dia' : 'dias'}`;
const pecas = (n: number) => `${numero(n)} ${n === 1 ? 'peça' : 'peças'}`;

/** Recorte da lista ("A lançar / Lançadas / Todas"): o primeiro é o padrão e não aparece no endereço. */
function Recorte({ valor, aoMudar, opcoes }: { valor: string; aoMudar: (v: string) => void; opcoes: { valor: string; rotulo: string }[] }) {
  return (
    <label className="filtro nao-imprimir">
      <span>Situação</span>
      <select value={valor} onChange={(e) => aoMudar(e.target.value)}>{opcoes.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}</select>
    </label>
  );
}

/** Guarda a situação escolhida no endereço (`param`), sem mexer nos outros parâmetros. O primeiro valor é o padrão. */
function useRecorte(param: string, padrao: string): [string, (v: string) => void] {
  const [params, setParams] = useSearchParams();
  const mudar = (v: string) => setParams((p) => { const n = new URLSearchParams(p); if (v === padrao) n.delete(param); else n.set(param, v); return n; }, { replace: true });
  return [params.get(param) ?? padrao, mudar];
}

/** Avisa o pai quando a seção terminou de carregar (o relatório completo só imprime com as seis prontas). */
function usePronto(id: AbaRelatorio, pronto: boolean, aoPronto?: (id: AbaRelatorio) => void) {
  useEffect(() => { if (pronto) aoPronto?.(id); }, [pronto, id, aoPronto]);
}

interface PropsSecao { de: string; ate: string; completo?: boolean; aoPronto?: (id: AbaRelatorio) => void }

function textoPeriodo(aba: AbaRelatorio, de: string, ate: string) {
  if (!COM_PERIODO.includes(aba)) return `Situação em ${data(hojeSP())}`;
  return de || ate ? `Período: ${de ? data(de) : 'início'} a ${ate ? data(ate) : 'hoje'}` : 'Todo o período, até hoje';
}

/** Nome científico e, embaixo, o popular (a fiscalização lê pelo científico). */
function Especie({ cad, id }: { cad: Cadastros; id: string }) {
  const e = cad.especies.get(id);
  return <><span className="corta" title={e?.nomeCientifico}><em>{e?.nomeCientifico ?? '—'}</em></span><span className="linha2">{e?.nomePopular ?? ''}</span></>;
}

/** m³ em cima e peças embaixo. */
const Volume = ({ m3v, qtd }: { m3v: number; qtd: number }) => <>{m3(m3v)}<span className="linha2">{pecas(qtd)}</span></>;

/**
 * Relatórios › IBAMA (seção 9.21 do plano; IN Ibama 21/2014). O sistema não substitui o sistema DOF: organiza o que a
 * CPTM precisa receber, declarar, lançar, comunicar e conferir. Seis abas: recebimentos de DOF (art. 51), balanço por
 * espécie (art. 41), destinações a lançar (art. 56), saldo do pátio, perdas (art. 42) e inventário por local. O período
 * (?de=&ate=) vale para recebimentos, balanço, destinações e perdas. Todas levam o cabeçalho do pátio (art. 40) e
 * imprimem completas, em A4 deitado; "Imprimir relatório completo" imprime as seis, na ordem. Tabelas sem rolagem
 * lateral. As ações exigem `dof:declarar`. Sem CSV nesta versão.
 */
export default function Relatorios() {
  const { pode } = useAuth();
  const [params, setParams] = useSearchParams();
  const [aba, setAba] = useAbaNoEndereco<AbaRelatorio>(ABAS);
  const de = params.get('de') ?? '';
  const ate = params.get('ate') ?? '';
  const periodoInvalido = !!de && !!ate && de > ate;
  const mudar = (chave: string, valor: string) => setParams((p) => { const n = new URLSearchParams(p); if (valor) n.set(chave, valor); else n.delete(chave); return n; }, { replace: true });
  const limparPeriodo = () => setParams((p) => { const n = new URLSearchParams(p); n.delete('de'); n.delete('ate'); return n; }, { replace: true });
  const usaPeriodo = COM_PERIODO.includes(aba);

  // Relatório completo: monta as seis seções (todas as situações), espera os dados e imprime; ao fechar a impressão, volta às abas.
  const [completo, setCompleto] = useState(false);
  const [prontos, setProntos] = useState<AbaRelatorio[]>([]);
  const marcar = useCallback((id: AbaRelatorio) => setProntos((p) => (p.includes(id) ? p : [...p, id])), []);
  useEffect(() => {
    if (!completo || prontos.length < ABAS.length) return undefined;
    const t = setTimeout(() => window.print(), 200);
    return () => clearTimeout(t);
  }, [completo, prontos]);
  useEffect(() => {
    const fim = () => { setCompleto(false); setProntos([]); };
    window.addEventListener('afterprint', fim);
    return () => window.removeEventListener('afterprint', fim);
  }, []);

  const secoes = (c: boolean, aoPronto?: (id: AbaRelatorio) => void) => ({ de, ate, completo: c, aoPronto });
  const acoes = (
    <>
      <button type="button" className="btn btn-sec nao-imprimir" onClick={() => window.print()} disabled={completo}>Imprimir</button>
      <button type="button" className="btn btn-sec nao-imprimir" onClick={() => { setProntos([]); setCompleto(true); }} disabled={completo}>Imprimir relatório completo</button>
    </>
  );

  return (
    <div className="relatorio-ibama">
      <div className="nao-imprimir">
        <CabecalhoPagina
          titulo="Relatórios"
          subtitulo="IBAMA (IN Ibama 21/2014): o que a CPTM precisa receber, declarar, lançar, comunicar e conferir no sistema DOF. O sistema não substitui o DOF nem o Sinaflor."
          acoes={acoes}
        />
      </div>
      {completo ? (
        <>
          <div className="nao-imprimir"><Aviso tom="info">Preparando o relatório completo para impressão: {prontos.length} de {ABAS.length} partes carregadas.</Aviso></div>
          <Recebimentos {...secoes(true, marcar)} />
          <Balanco {...secoes(true, marcar)} />
          <Destinacoes {...secoes(true, marcar)} podeLancar={false} />
          <SaldoPatio {...secoes(true, marcar)} podeInformar={false} />
          <Perdas {...secoes(true, marcar)} podeComunicar={false} />
          <InventarioPorLocal {...secoes(true, marcar)} />
        </>
      ) : (
        <AbasSecao
          abas={[
            { valor: 'recebimentos', rotulo: 'Recebimentos de DOF' }, { valor: 'balanco', rotulo: 'Balanço por espécie' },
            { valor: 'destinacoes', rotulo: 'Destinações a lançar' }, { valor: 'saldo', rotulo: 'Saldo do pátio' },
            { valor: 'perdas', rotulo: 'Perdas' }, { valor: 'inventario', rotulo: 'Inventário por local' },
          ]}
          ativa={aba} aoEscolher={setAba} rotulo="Relatórios do IBAMA"
        >
          {usaPeriodo && (
            <div className="toolbar nao-imprimir">
              <label className="filtro"><span>De</span><input type="date" value={de} max={ate || undefined} onChange={(e) => mudar('de', e.target.value)} /></label>
              <label className="filtro"><span>Até</span><input type="date" value={ate} min={de || undefined} onChange={(e) => mudar('ate', e.target.value)} /></label>
              {(de || ate) && <button type="button" className="btn btn-sec btn-peq" onClick={limparPeriodo}>Limpar período</button>}
            </div>
          )}
          {periodoInvalido && <Aviso tom="alerta">A data inicial é depois da final: nenhum registro entra no período.</Aviso>}
          {aba === 'recebimentos' && <Recebimentos {...secoes(false)} />}
          {aba === 'balanco' && <Balanco {...secoes(false)} />}
          {aba === 'destinacoes' && <Destinacoes {...secoes(false)} podeLancar={pode('dof:declarar')} />}
          {aba === 'saldo' && <SaldoPatio {...secoes(false)} podeInformar={pode('dof:declarar')} />}
          {aba === 'perdas' && <Perdas {...secoes(false)} podeComunicar={pode('dof:declarar') || pode('painel:gestao')} />}
          {aba === 'inventario' && <InventarioPorLocal {...secoes(false)} />}
        </AbasSecao>
      )}
    </div>
  );
}

function Secao({ aba, titulo, artigo, de, ate, children }: { aba: AbaRelatorio; titulo: string; artigo: string; de: string; ate: string; children: ReactNode }) {
  return (
    <section className="painel secao-relatorio" aria-label={titulo}>
      <CabecalhoIbama titulo={titulo} artigo={artigo} periodo={textoPeriodo(aba, de, ate)} />
      {children}
    </section>
  );
}

// ---------- Recebimentos de DOF (art. 51) ----------

const SITUACAO_DOF: Record<SituacaoRecebimentoDof, [Parameters<typeof Badge>[0]['tom'], string]> = {
  no_prazo: ['verde', 'Declarada no prazo'], declarada_atraso: ['laranja', 'Declarada com atraso'], pendente: ['azul', 'Pendente'], vencida: ['vermelho', 'Vencida'],
};

function Recebimentos({ de, ate, completo, aoPronto }: PropsSecao) {
  const cad = useCadastros();
  const [recorte, setRecorte] = useRecorte('dofs', 'todas');
  const filtro = completo ? 'todas' : recorte;
  const r = useAsync(() => servicos.ibama.recebimentosDof({ ...(de ? { de } : {}), ...(ate ? { ate } : {}) }), [de, ate]);
  usePronto('recebimentos', !!r.dados && !!cad.listas || !!r.erro, aoPronto);
  const todas = r.dados ?? [];
  const itens = todas.filter((l) => filtro === 'todas' || (filtro === 'abertas' ? l.situacao === 'pendente' || l.situacao === 'vencida' : l.situacao === 'no_prazo' || l.situacao === 'declarada_atraso'));
  const acima = itens.filter((l) => l.acimaTolerancia);
  const tamanhos = (l: RecebimentoDof) => l.tamanhosIds.map((id) => cad.tamanhos.get(id)).filter((t) => !!t);

  return (
    <Secao aba="recebimentos" titulo="Recebimentos de DOF" artigo="art. 51" de={de} ate={ate}>
      <p className="mudo nao-imprimir">Cada DOF recebida, por espécie: o que o documento trouxe, o que chegou e a declaração no Sinaflor (prazo: o dia seguinte ao fim da validade). Pendentes e vencidas primeiro. O período vale pela data do recebimento.</p>
      <div className="toolbar nao-imprimir">
        <Recorte valor={recorte} aoMudar={setRecorte} opcoes={[{ valor: 'todas', rotulo: 'Todas' }, { valor: 'abertas', rotulo: 'Pendentes e vencidas' }, { valor: 'declaradas', rotulo: 'Declaradas' }]} />
      </div>
      {acima.length > 0 && <Aviso tom="alerta">{acima.length} {acima.length === 1 ? 'espécie' : 'espécies'} com divergência de volume acima de 10%. {AVISO_ARTIGO_53}</Aviso>}
      {r.carregando && !r.dados ? <Carregando /> : r.erro ? <Erro erro={r.erro} aoTentar={r.recarregar} /> : !itens.length ? <Vazio mensagem="Nenhuma DOF neste recorte." dica="Mude a situação ou o período." /> : (
        <>
          <TabelaRelatorio
            legenda="Recebimentos de DOF por espécie" larguras={[11, 19, 15, 17, 14, 10, 14]}
            cabecalho={<><th scope="col">DOF · NF</th><th scope="col">Fornecedor</th><th scope="col">Espécie</th><th scope="col">Produto</th><th scope="col" className="num">Volume (DOF · recebido)</th><th scope="col">Prazo</th><th scope="col">Situação</th></>}
          >
            {itens.map((l) => {
              const f = cad.fornecedores.get(l.fornecedorId);
              const [tom, rotulo] = SITUACAO_DOF[l.situacao];
              const ts = tamanhos(l);
              const quando = l.situacao === 'pendente' ? (l.prazoDeclaracao === hojeSP() ? 'prazo é hoje' : `prazo em ${dias(Math.max(0, Math.round((Date.parse(l.prazoDeclaracao) - Date.parse(hojeSP())) / 86_400_000)))}`)
                : l.situacao === 'vencida' ? `venceu há ${dias(l.diasAtraso ?? 0)}` : l.situacao === 'declarada_atraso' ? `${dias(l.diasAtraso ?? 0)} de atraso` : '';
              return (
                <tr key={l.id} className={l.situacao === 'vencida' ? 'linha-alerta' : undefined}>
                  <td data-rotulo="DOF · NF"><Link className="mono" to={`/documentos?q=${l.nfNumero}`}>{l.dofNumero}</Link><span className="linha2">NF {l.nfNumero}</span></td>
                  <td data-rotulo="Fornecedor"><Corta texto={f?.razaoSocial ?? '—'} /><span className="linha2">{f ? `${cnpjFormatado(f.cnpj)} · CTF ${f.ctfIbama}` : ''}</span></td>
                  <td data-rotulo="Espécie"><Especie cad={cad} id={l.especieId} /></td>
                  <td data-rotulo="Produto">
                    Dormente{ts.length ? ` · ${ts.map((t) => t!.codigo).join(', ')}` : ''}
                    <span className="linha2">{ts.length ? `${ts.map((t) => `${numero(t!.comprimentoCm)} × ${numero(t!.larguraCm)} × ${numero(t!.alturaCm)} cm`).join('; ')} · ` : ''}{pecas(l.quantidade)}</span>
                  </td>
                  <td className="num" data-rotulo="Volume (DOF · recebido)">
                    {m3(l.documentalM3)}
                    <span className="linha2" title={l.base === 'nominal' ? 'Volume nominal (dormentes × volume do tamanho); o oficial é o medido, depois da inspeção.' : undefined}>{l.recebidoM3 === undefined ? 'não recebido' : `receb. ${m3(l.recebidoM3)}`}</span>
                    {l.divergenciaPct !== undefined && <span className="linha2">dif. {pct(l.divergenciaPct)}{l.base === 'nominal' ? ' (prov.)' : ''}{l.acimaTolerancia && <> <Badge tom="vermelho">acima de 10%</Badge></>}</span>}
                  </td>
                  <td data-rotulo="Prazo">{data(l.prazoDeclaracao)}<span className="linha2">validade {data(l.validade)}</span></td>
                  <td data-rotulo="Situação">
                    <Badge tom={tom}>{rotulo}</Badge>
                    {l.declaradoEm ? <span className="linha2" title={`${dataHora(l.declaradoEm)} · ${l.declaradoPor ?? ''}`}>{dataHora(l.declaradoEm)}{l.declaradoPor ? ` · ${l.declaradoPor}` : ''}</span> : null}
                    {quando && <span className="linha2">{quando}</span>}
                  </td>
                </tr>
              );
            })}
          </TabelaRelatorio>
          <p className="mudo">{numero(itens.length)} linha(s) · {pecas(itens.reduce((t, l) => t + l.quantidade, 0))} · DOF {m3(itens.reduce((t, l) => t + l.documentalM3, 0))} · recebido {m3(itens.reduce((t, l) => t + (l.recebidoM3 ?? 0), 0))}</p>
        </>
      )}
    </Secao>
  );
}

// ---------- Balanço por espécie (art. 41) ----------

function Balanco({ de, ate, aoPronto }: PropsSecao) {
  const cad = useCadastros();
  const r = useAsync(() => servicos.ibama.balanco({ ...(de ? { de } : {}), ...(ate ? { ate } : {}) }), [de, ate]);
  usePronto('balanco', !!r.dados && !!cad.listas || !!r.erro, aoPronto);
  const b = r.dados;
  const lista = [...(b?.especies ?? [])].sort((x, y) => (cad.especies.get(x.especieId)?.nomeCientifico ?? '').localeCompare(cad.especies.get(y.especieId)?.nomeCientifico ?? '', 'pt-BR'));
  const naoFecham = lista.filter((x) => x.fecha === false);
  const soma = (f: (x: BalancoEspecie) => number) => lista.reduce((t, x) => t + f(x), 0);

  return (
    <Secao aba="balanco" titulo="Balanço por espécie" artigo="art. 41" de={de} ate={ate}>
      <p className="mudo nao-imprimir">Por espécie (nome científico): saldo inicial + entradas (dormentes dos fardos recebidos) − destinações (RMEs entregues, art. 56) − perdas (art. 42) − retiradas (reprovados levados pelo fornecedor) = saldo final calculado, comparado com o saldo físico do pátio. Em m³ e em peças. Sem data inicial, o saldo inicial é zero.</p>
      {b && !b.comparaFisico && <Aviso tom="info">O saldo físico é o de agora. Para compará-lo com o saldo final, deixe a data final vazia ou igual a hoje.</Aviso>}
      {naoFecham.length > 0 && <Aviso tom="critico">O balanço não fecha em {naoFecham.length} {naoFecham.length === 1 ? 'espécie' : 'espécies'}: {naoFecham.map((x) => cad.especies.get(x.especieId)?.nomeCientifico ?? x.especieId).join(', ')}. Confira os movimentos antes de apresentar à fiscalização.</Aviso>}
      {r.carregando && !r.dados ? <Carregando /> : r.erro ? <Erro erro={r.erro} aoTentar={r.recarregar} /> : !lista.length ? <Vazio mensagem="Nenhum movimento de dormentes no período." dica="Mude o período." /> : (
        <TabelaRelatorio
          legenda="Balanço por espécie, em m³ e em peças" larguras={[17, 11, 11, 12, 10, 11, 12, 16]}
          cabecalho={<><th scope="col">Espécie</th><th scope="col" className="num">Saldo inicial</th><th scope="col" className="num">Entradas (recebidos)</th><th scope="col" className="num">Destinações (art. 56)</th><th scope="col" className="num">Perdas (art. 42)</th><th scope="col" className="num">Retiradas de reprovados</th><th scope="col" className="num">Saldo final</th><th scope="col" className="num">Saldo físico</th></>}
          rodape={(
            <tr>
              <td data-rotulo="Espécie">Total</td>
              <td className="num" data-rotulo="Saldo inicial"><Volume m3v={soma((x) => x.inicialM3)} qtd={soma((x) => x.inicialPecas)} /></td>
              <td className="num" data-rotulo="Entradas"><Volume m3v={soma((x) => x.entradasM3)} qtd={soma((x) => x.entradasPecas)} /></td>
              <td className="num" data-rotulo="Destinações"><Volume m3v={soma((x) => x.destinacoesM3)} qtd={soma((x) => x.destinacoesPecas)} /></td>
              <td className="num" data-rotulo="Perdas"><Volume m3v={soma((x) => x.perdasM3)} qtd={soma((x) => x.perdasPecas)} /></td>
              <td className="num" data-rotulo="Retiradas"><Volume m3v={soma((x) => x.retiradasM3)} qtd={soma((x) => x.retiradasPecas)} /></td>
              <td className="num" data-rotulo="Saldo final"><Volume m3v={soma((x) => x.finalM3)} qtd={soma((x) => x.finalPecas)} /></td>
              <td className="num" data-rotulo="Saldo físico">{b?.comparaFisico ? <Volume m3v={soma((x) => x.fisicoM3 ?? 0)} qtd={soma((x) => x.fisicoPecas ?? 0)} /> : '—'}</td>
            </tr>
          )}
        >
          {lista.map((x) => (
            <tr key={x.especieId} className={x.fecha === false ? 'linha-alerta' : undefined}>
              <td data-rotulo="Espécie"><Especie cad={cad} id={x.especieId} /></td>
              <td className="num" data-rotulo="Saldo inicial"><Volume m3v={x.inicialM3} qtd={x.inicialPecas} /></td>
              <td className="num" data-rotulo="Entradas"><Volume m3v={x.entradasM3} qtd={x.entradasPecas} /></td>
              <td className="num" data-rotulo="Destinações"><Volume m3v={x.destinacoesM3} qtd={x.destinacoesPecas} /></td>
              <td className="num" data-rotulo="Perdas"><Volume m3v={x.perdasM3} qtd={x.perdasPecas} /></td>
              <td className="num" data-rotulo="Retiradas"><Volume m3v={x.retiradasM3} qtd={x.retiradasPecas} /></td>
              <td className="num" data-rotulo="Saldo final"><Volume m3v={x.finalM3} qtd={x.finalPecas} /></td>
              <td className="num" data-rotulo="Saldo físico">
                {x.fisicoM3 === undefined ? '—' : (
                  <>
                    <Volume m3v={x.fisicoM3} qtd={x.fisicoPecas ?? 0} />
                    <span className="linha2">
                      {x.fecha ? <Badge tom="verde">fecha</Badge> : <Badge tom="vermelho">não fecha</Badge>}
                      {!x.fecha && <> dif. {(x.diferencaM3 ?? 0) > 0 ? '+' : ''}{m3(x.diferencaM3 ?? 0)} · {(x.diferencaPecas ?? 0) > 0 ? '+' : ''}{pecas(x.diferencaPecas ?? 0)}</>}
                    </span>
                  </>
                )}
              </td>
            </tr>
          ))}
        </TabelaRelatorio>
      )}
    </Secao>
  );
}

// ---------- Destinações (art. 56) ----------

function Destinacoes({ de, ate, completo, aoPronto, podeLancar }: PropsSecao & { podeLancar: boolean }) {
  const cad = useCadastros();
  const notificar = useToast();
  const [recorte, setRecorte] = useRecorte('situacao', 'nao');
  const situacao = completo ? 'todas' : recorte;
  const [rec, setRec] = useState(0);
  const [alvo, setAlvo] = useState<DestinacaoFinal | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string>();
  const r = useAsync(() => servicos.ibama.destinacoes({
    pageSize: TODOS,
    filters: { ...(situacao === 'todas' ? {} : { lancado: situacao === 'sim' ? 'sim' : 'nao' }), ...(de ? { de } : {}), ...(ate ? { ate } : {}) },
  }), [situacao, de, ate, rec]);
  usePronto('destinacoes', !!r.dados && !!cad.listas || !!r.erro, aoPronto);
  const nome = (id: string) => cad.especies.get(id)?.nomeCientifico ?? '—';

  async function lancar() {
    if (!alvo) return;
    setEnviando(true);
    setErro(undefined);
    try {
      await servicos.ibama.marcarLancado(alvo.id);
      notificar('sucesso', `Destinação da ${alvo.rmeNumero} marcada como lançada no DOF.`);
      setAlvo(null);
      setRec((x) => x + 1);
    } catch (e) {
      setErro(mensagemSegura(e));
      setAlvo(null);
    } finally {
      setEnviando(false);
    }
  }

  const itens = r.dados?.items ?? [];
  const atrasadas = itens.filter((d) => !d.lancadoEm && (d.diasAtraso ?? 0) > 0).length;
  return (
    <Secao aba="destinacoes" titulo="Destinações finais" artigo="art. 56" de={de} ate={ate}>
      <p className="mudo nao-imprimir">Baixa do saldo virtual: o volume das RMEs entregues, por espécie, que precisa ser lançado no sistema DOF até o dia seguinte à entrega da RME (art. 56).</p>
      <div className="toolbar nao-imprimir">
        <Recorte valor={recorte} aoMudar={setRecorte} opcoes={[{ valor: 'nao', rotulo: 'A lançar' }, { valor: 'sim', rotulo: 'Lançadas' }, { valor: 'todas', rotulo: 'Todas' }]} />
      </div>
      {erro && <Aviso tom="critico">{erro}</Aviso>}
      {atrasadas > 0 && <Aviso tom="alerta">{atrasadas} {atrasadas === 1 ? 'destinação passou' : 'destinações passaram'} do prazo de lançamento (dia seguinte à entrega da RME, art. 56).</Aviso>}
      {r.carregando && !r.dados ? <Carregando /> : r.erro ? <Erro erro={r.erro} aoTentar={r.recarregar} /> : !itens.length ? <Vazio mensagem="Nenhuma destinação neste recorte." dica="Mude a situação ou o período." /> : (
        <>
          <TabelaRelatorio
            legenda="Destinações finais das RMEs entregues" larguras={[11, 19, 13, 13, 16, 18, 10]}
            cabecalho={<><th scope="col">RME</th><th scope="col">Espécie</th><th scope="col">Tamanho</th><th scope="col" className="num">Volume</th><th scope="col">Entrega · prazo</th><th scope="col">Lançamento no DOF</th>{podeLancar && <th scope="col" className="nao-imprimir">Ações</th>}</>}
          >
            {itens.map((d) => {
              const ts = (d.tamanhosIds ?? []).map((id) => cad.tamanhos.get(id)).filter((t) => !!t);
              const atraso = d.diasAtraso ?? 0;
              return (
                <tr key={d.id} className={!d.lancadoEm && atraso > 0 ? 'linha-alerta' : undefined}>
                  <td data-rotulo="RME"><CodigoLink codigo={d.rmeNumero} /></td>
                  <td data-rotulo="Espécie"><Especie cad={cad} id={d.especieId} /></td>
                  <td data-rotulo="Tamanho">{ts.length ? ts.map((t) => t!.codigo).join(', ') : '—'}<span className="linha2">{ts.map((t) => `${numero(t!.comprimentoCm / 100)} m`).join('; ')}</span></td>
                  <td className="num" data-rotulo="Volume"><Volume m3v={d.volumeM3} qtd={d.quantidade} /></td>
                  <td data-rotulo="Entrega · prazo">{data(d.entregueEm)}<span className="linha2">lançar até {data(d.prazoLancamento)}</span></td>
                  <td data-rotulo="Lançamento no DOF">
                    {d.lancadoEm ? <>{dataHora(d.lancadoEm)}<span className="linha2" title={d.lancadoPor}>{d.lancadoPor ?? ''}</span></> : <Badge tom={atraso > 0 ? 'vermelho' : 'laranja'}>a lançar</Badge>}
                    {atraso > 0 && <span className="linha2">{d.lancadoEm ? 'lançada com' : ''} {dias(atraso)} de atraso</span>}
                  </td>
                  {podeLancar && <td className="nao-imprimir" data-rotulo="Ações">{!d.lancadoEm && <button type="button" className="btn btn-acao btn-peq" onClick={() => setAlvo(d)}>Marcar como lançado</button>}</td>}
                </tr>
              );
            })}
          </TabelaRelatorio>
          <p className="mudo">{numero(itens.length)} destinação(ões) · {numero(itens.reduce((t, d) => t + d.quantidade, 0))} dormentes · {m3(itens.reduce((t, d) => t + d.volumeM3, 0))}</p>
        </>
      )}
      <ConfirmModal
        aberto={!!alvo} carregando={enviando} titulo="Marcar como lançado no DOF"
        mensagem={alvo ? `Confirma que a baixa de ${m3(alvo.volumeM3)} de ${nome(alvo.especieId)} (${alvo.rmeNumero}) já foi lançada no sistema DOF? Não há como desfazer.` : ''}
        rotuloConfirmar="Marcar como lançado" aoConfirmar={lancar} aoCancelar={() => setAlvo(null)}
      />
    </Secao>
  );
}

// ---------- Saldo do pátio (art. 41) ----------

function SaldoPatio({ de, ate, aoPronto, podeInformar }: PropsSecao & { podeInformar: boolean }) {
  const cad = useCadastros();
  const notificar = useToast();
  const [rec, setRec] = useState(0);
  const [informando, setInformando] = useState(false);
  const r = useAsync(() => servicos.ibama.saldoPatio(), [rec]);
  usePronto('saldo', !!r.dados && !!cad.listas || !!r.erro, aoPronto);
  const lista = r.dados ?? [];
  const campos: Campo[] = [
    { nome: 'data', rotulo: 'Data do saldo no sistema DOF', tipo: 'date', obrigatorio: true, ajuda: 'A data em que você consultou o saldo no DOF.' },
    ...(cad.listas?.especies ?? []).filter((x) => x.ativo).map((x): Campo => ({
      nome: `e_${x.id}`, rotulo: `Saldo de ${x.nomeCientifico} (m³)`, tipo: 'number', min: 0, ajuda: 'Deixe em branco a espécie que não aparece no DOF.',
    })),
    { nome: 'observacao', rotulo: 'Observação', tipo: 'textarea', maxLength: 300 },
  ];

  async function informar(v: Record<string, string>) {
    const itens = Object.entries(v).filter(([k, x]) => k.startsWith('e_') && x.trim()).map(([k, x]) => ({ especieId: k.slice(2), volumeM3: paraNumero(x) }));
    await servicos.ibama.informarSaldo({ data: v.data, itens, observacao: v.observacao?.trim() || undefined });
    notificar('sucesso', 'Saldo do DOF informado.');
    setRec((x) => x + 1);
  }

  return (
    <Secao aba="saldo" titulo="Saldo do pátio" artigo="art. 41" de={de} ate={ate}>
      <p className="mudo nao-imprimir">Volume físico no pátio (aguardando inspeção, em estoque, reservados, reprovados ainda não retirados e não localizados; o perdido sai) comparado com o último saldo informado do DOF. Tolerância de 10% (art. 41).</p>
      {podeInformar && <div className="acoes nao-imprimir"><button type="button" className="btn btn-pri" onClick={() => setInformando(true)}>Informar saldo do DOF</button></div>}
      {r.carregando && !r.dados ? <Carregando /> : r.erro ? <Erro erro={r.erro} aoTentar={r.recarregar} /> : !lista.length ? <Vazio mensagem="Nenhum dormente no pátio." /> : (
        <TabelaRelatorio
          legenda="Saldo do pátio por espécie e tamanho" larguras={[28, 16, 16, 18, 22]}
          cabecalho={<><th scope="col">Espécie · por tamanho</th><th scope="col" className="num">Pátio</th><th scope="col" className="num">Não localizados</th><th scope="col" className="num">Informado no DOF</th><th scope="col">Diferença · situação</th></>}
        >
          {lista.map((s) => (
            <tr key={s.especieId} className={s.acimaTolerancia ? 'linha-alerta' : undefined}>
              <td data-rotulo="Espécie · por tamanho">
                <Especie cad={cad} id={s.especieId} />
                <span className="linha2">{s.porTamanho.map((t) => `${cad.codigoTamanho(t.tamanhoId)}: ${numero(t.quantidade)} (${m3(t.volumeM3)})`).join(' · ')}</span>
              </td>
              <td className="num" data-rotulo="Pátio"><Volume m3v={s.fisicoM3} qtd={s.quantidade} /></td>
              <td className="num" data-rotulo="Não localizados">{s.naoLocalizados.quantidade ? <Volume m3v={s.naoLocalizados.volumeM3} qtd={s.naoLocalizados.quantidade} /> : '—'}</td>
              <td className="num" data-rotulo="Informado no DOF">{s.informadoM3 === undefined ? '—' : <>{m3(s.informadoM3)}<span className="linha2">em {data(s.informadoEm)}</span></>}</td>
              <td data-rotulo="Diferença · situação">
                {s.informadoM3 === undefined ? <Badge tom="cinza">sem saldo informado</Badge> : s.acimaTolerancia ? <Badge tom="vermelho">acima de 10%</Badge> : <Badge tom="verde">dentro da tolerância</Badge>}
                {s.diferencaPct !== undefined && <span className="linha2">{Number.isFinite(s.diferencaPct) ? pct(s.diferencaPct) : 'sem base'}</span>}
              </td>
            </tr>
          ))}
        </TabelaRelatorio>
      )}
      <FormModal
        titulo="Informar saldo do DOF" campos={campos} aberto={informando} aoFechar={() => setInformando(false)} aoEnviar={informar}
        iniciais={{ data: hojeSP() }} rotuloEnviar="Informar saldo"
        validar={(v): Record<string, string> => (Object.entries(v).some(([k, x]) => k.startsWith('e_') && x.trim()) ? {} : { data: 'Informe o saldo de ao menos uma espécie.' })}
      />
    </Secao>
  );
}

// ---------- Perdas (art. 42) ----------

function Perdas({ de, ate, completo, aoPronto, podeComunicar }: PropsSecao & { podeComunicar: boolean }) {
  const cad = useCadastros();
  const notificar = useToast();
  const [recorte, setRecorte] = useRecorte('situacao', 'nao');
  const situacao = completo ? 'todas' : recorte;
  const [rec, setRec] = useState(0);
  const [alvo, setAlvo] = useState<Perda | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string>();
  const r = useAsync(() => servicos.ibama.perdas({
    pageSize: TODOS,
    filters: { ...(situacao === 'todas' ? {} : { comunicado: situacao === 'sim' ? 'sim' : 'nao' }), ...(de ? { de } : {}), ...(ate ? { ate } : {}) },
  }), [situacao, de, ate, rec]);
  usePronto('perdas', !!r.dados && !!cad.listas || !!r.erro, aoPronto);
  const itens = r.dados?.items ?? [];
  const aComunicar = itens.filter((p) => !p.comunicadoEm).length;

  async function comunicar() {
    if (!alvo) return;
    setEnviando(true);
    setErro(undefined);
    try {
      await servicos.ibama.marcarPerdaComunicada(alvo.id);
      notificar('sucesso', `Perda do dormente ${alvo.dormenteId} marcada como comunicada.`);
      setAlvo(null);
      setRec((x) => x + 1);
    } catch (e) {
      setErro(mensagemSegura(e));
      setAlvo(null);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Secao aba="perdas" titulo="Perdas a comunicar ao IBAMA" artigo="art. 42" de={de} ate={ate}>
      <p className="mudo nao-imprimir">Dormentes perdidos (o gestor transforma um "não localizado" em perdido, na Inspeção). Perdas, incêndios e intempéries são comunicados imediatamente ao órgão ambiental (art. 42): extravio, avaria, incêndio e intempérie.</p>
      <div className="toolbar nao-imprimir">
        <Recorte valor={recorte} aoMudar={setRecorte} opcoes={[{ valor: 'nao', rotulo: 'A comunicar' }, { valor: 'sim', rotulo: 'Comunicadas' }, { valor: 'todas', rotulo: 'Todas' }]} />
      </div>
      {erro && <Aviso tom="critico">{erro}</Aviso>}
      {aComunicar > 0 && <Aviso tom="critico">{aComunicar} {aComunicar === 1 ? 'perda não comunicada' : 'perdas não comunicadas'}: o art. 42 manda comunicar imediatamente ao órgão ambiental.</Aviso>}
      {r.carregando && !r.dados ? <Carregando /> : r.erro ? <Erro erro={r.erro} aoTentar={r.recarregar} /> : !itens.length ? <Vazio mensagem="Nenhuma perda neste recorte." dica="Mude a situação ou o período." /> : (
        <>
          <TabelaRelatorio
            legenda="Perdas de dormentes e comunicação ao órgão ambiental" larguras={[16, 18, 12, 18, 14, 14, 8]}
            cabecalho={<><th scope="col">Dormente</th><th scope="col">Espécie</th><th scope="col" className="num">Volume</th><th scope="col">Motivo</th><th scope="col">Perdido em</th><th scope="col">Comunicação (imediata, art. 42)</th>{podeComunicar && <th scope="col" className="nao-imprimir">Ações</th>}</>}
          >
            {itens.map((p) => (
              <tr key={p.id} className={p.comunicadoEm ? undefined : 'linha-alerta'}>
                <td data-rotulo="Dormente"><CodigoLink codigo={p.dormenteId} /><span className="linha2">fardo {p.fardoId}</span></td>
                <td data-rotulo="Espécie"><Especie cad={cad} id={p.especieId} /></td>
                <td className="num" data-rotulo="Volume">{m3(p.volumeM3)}<span className="linha2">{pecas(1)}</span></td>
                <td data-rotulo="Motivo"><BadgeDe mapa={MOTIVO_PERDA} valor={p.motivo} />{p.descricao && <span className="linha2" title={p.descricao}>{p.descricao}</span>}</td>
                <td data-rotulo="Perdido em">{dataHora(p.quando)}<span className="linha2" title={p.quem}>{p.quem}</span></td>
                <td data-rotulo="Comunicação (imediata, art. 42)">
                  {p.comunicadoEm
                    ? <>{dataHora(p.comunicadoEm)}<span className="linha2" title={p.comunicadoPor}>{p.comunicadoPor ?? ''}</span></>
                    : <><Badge tom="vermelho">comunicar imediatamente</Badge><span className="linha2">perdida há {dias(diasDesde(p.quando))}</span></>}
                </td>
                {podeComunicar && <td className="nao-imprimir" data-rotulo="Ações">{!p.comunicadoEm && <button type="button" className="btn btn-acao btn-peq" onClick={() => setAlvo(p)}>Marcar como comunicado</button>}</td>}
              </tr>
            ))}
          </TabelaRelatorio>
          <p className="mudo">{numero(itens.length)} perda(s) · {m3(itens.reduce((t, p) => t + p.volumeM3, 0))}</p>
        </>
      )}
      <ConfirmModal
        aberto={!!alvo} carregando={enviando} titulo="Marcar como comunicado ao órgão"
        mensagem={alvo ? `Confirma que a perda do dormente ${alvo.dormenteId} já foi comunicada ao IBAMA? Não há como desfazer.` : ''}
        rotuloConfirmar="Marcar como comunicado" aoConfirmar={comunicar} aoCancelar={() => setAlvo(null)}
      />
    </Secao>
  );
}

// ---------- Inventário por local (art. 41) ----------

function InventarioPorLocal({ de, ate, aoPronto }: PropsSecao) {
  const cad = useCadastros();
  const r = useAsync(() => servicos.ibama.inventarioPorLocal(), []);
  usePronto('inventario', !!r.dados && !!cad.listas || !!r.erro, aoPronto);
  const lista = [...(r.dados ?? [])].sort((a, b) => cad.codigoLocal(a.localId).localeCompare(cad.codigoLocal(b.localId), 'pt-BR'));
  return (
    <Secao aba="inventario" titulo="Inventário por local" artigo="art. 41" de={de} ate={ate}>
      <p className="mudo nao-imprimir">Último inventário fechado de cada local ativo: quando foi conferido, o que foi localizado e as diferenças. Mostra a situação de agora, sem filtro de período.</p>
      {r.carregando && !r.dados ? <Carregando /> : r.erro ? <Erro erro={r.erro} aoTentar={r.recarregar} /> : !lista.length ? <Vazio mensagem="Nenhum local ativo." /> : (
        <TabelaRelatorio
          legenda="Último inventário de cada local" larguras={[12, 22, 12, 18, 18, 18]}
          cabecalho={<><th scope="col">Local</th><th scope="col">Último inventário</th><th scope="col" className="num">Esperados</th><th scope="col" className="num">Localizados</th><th scope="col" className="num">No lugar certo</th><th scope="col">Diferenças</th></>}
        >
          {lista.map((i) => {
            const codigo = cad.codigoLocal(i.localId);
            const conferido = !!i.fechadoEm;
            return (
              <tr key={i.localId}>
                <td data-rotulo="Local"><Link className="mono" to={`/locais/${codigo}`}>{codigo}</Link></td>
                <td data-rotulo="Último inventário">{conferido ? <><Link className="mono" to={`/inventarios/${i.inventarioId}`}>{i.numero}</Link><span className="linha2">{data(i.fechadoEm)}</span></> : <Badge tom="cinza">nunca conferido</Badge>}</td>
                <td className="num" data-rotulo="Esperados">{conferido ? numero(i.esperados) : '—'}</td>
                <td className="num" data-rotulo="Localizados">{i.percentualLocalizados === undefined ? '—' : <>{numero(i.localizados)}<span className="linha2">{pct(i.percentualLocalizados)}</span></>}</td>
                <td className="num" data-rotulo="No lugar certo">{i.percentualNoLugarCerto === undefined ? '—' : <>{numero(i.noLugarCerto)}<span className="linha2">{pct(i.percentualNoLugarCerto)}</span></>}</td>
                <td data-rotulo="Diferenças">{conferido ? <>{numero(i.localErrado)} em local errado<span className="linha2">{numero(i.naoEncontrados)} não encontrados · {numero(i.inesperados)} inesperados</span></> : '—'}</td>
              </tr>
            );
          })}
        </TabelaRelatorio>
      )}
    </Secao>
  );
}
