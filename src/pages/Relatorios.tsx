import { useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AbasSecao, useAbaNoEndereco } from '../components/Abas';
import { Badge, BadgeDe } from '../components/Badge';
import { CabecalhoPagina } from '../components/Cabecalhos';
import { CodigoLink } from '../components/Codigos';
import { Aviso, Carregando, Erro, Vazio } from '../components/Estados';
import { FormModal, type Campo } from '../components/FormModal';
import { ConfirmModal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { useAuth } from '../contexts/AuthContext';
import { MOTIVO_PERDA } from '../dominio/rotulos';
import { useAsync } from '../hooks/useAsync';
import { useCadastros } from '../hooks/useCadastros';
import { servicos } from '../services';
import { mensagemSegura } from '../services/erros';
import type { DestinacaoFinal, Perda } from '../types/models';
import { data, dataHora, hojeSP, m3, numero, paraNumero, pct } from '../utils/format';

type AbaRelatorio = 'destinacoes' | 'saldo' | 'perdas' | 'inventario';
const ABAS: AbaRelatorio[] = ['destinacoes', 'saldo', 'perdas', 'inventario'];
const TODOS = 1000;

/** Recorte da lista ("A lançar / Lançadas / Todas"): o primeiro é o padrão e não aparece no endereço. */
function Recorte({ valor, aoMudar, opcoes }: { valor: string; aoMudar: (v: string) => void; opcoes: { valor: string; rotulo: string }[] }) {
  return (
    <label className="filtro nao-imprimir">
      <span>Situação</span>
      <select value={valor} onChange={(e) => aoMudar(e.target.value)}>{opcoes.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}</select>
    </label>
  );
}

function Tabela({ cabecalho, children }: { cabecalho: ReactNode; children: ReactNode }) {
  return <div className="tabela-wrap"><table className="tabela"><thead><tr>{cabecalho}</tr></thead><tbody>{children}</tbody></table></div>;
}

/** Guarda a situação escolhida no endereço (?situacao=), sem mexer nos outros parâmetros. */
function useRecorte(): [string, (v: string) => void] {
  const [params, setParams] = useSearchParams();
  const mudar = (v: string) => setParams((p) => { const n = new URLSearchParams(p); if (v === 'nao') n.delete('situacao'); else n.set('situacao', v); return n; }, { replace: true });
  return [params.get('situacao') ?? 'nao', mudar];
}

/**
 * Relatórios › IBAMA (seção 9.21 do plano, versão base da Etapa 10; IN Ibama 21/2014). O sistema não substitui o sistema
 * DOF: organiza o que a CPTM precisa lançar e conferir lá. Quatro abas: destinações a lançar, saldo do pátio × informado,
 * perdas a comunicar e inventário por local. O período (?de=&ate=) vale para destinações e perdas; saldo e inventário
 * mostram a situação de agora. As ações exigem `dof:declarar`. Sem CSV nesta versão; a impressão usa `@media print`.
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
  const usaPeriodo = aba === 'destinacoes' || aba === 'perdas';
  const textoPeriodo = de || ate ? `Período: ${de ? data(de) : 'início'} a ${ate ? data(ate) : 'hoje'}` : 'Todo o período';

  return (
    <div className="relatorio-ibama">
      <CabecalhoPagina
        titulo="Relatórios"
        subtitulo="IBAMA (IN Ibama 21/2014): o que a CPTM precisa lançar, comunicar e conferir no sistema DOF. O sistema não substitui o DOF nem o Sinaflor."
        acoes={<button type="button" className="btn btn-sec nao-imprimir" onClick={() => window.print()}>Imprimir</button>}
      />
      <AbasSecao
        abas={[
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
        {usaPeriodo && <p className="mudo so-impressao">{textoPeriodo}</p>}
        {aba === 'destinacoes' && <Destinacoes de={de} ate={ate} podeLancar={pode('dof:declarar')} />}
        {aba === 'saldo' && <SaldoPatio podeInformar={pode('dof:declarar')} />}
        {aba === 'perdas' && <Perdas de={de} ate={ate} podeComunicar={pode('dof:declarar') || pode('painel:gestao')} />}
        {aba === 'inventario' && <InventarioPorLocal />}
      </AbasSecao>
    </div>
  );
}

function Destinacoes({ de, ate, podeLancar }: { de: string; ate: string; podeLancar: boolean }) {
  const cad = useCadastros();
  const notificar = useToast();
  const [situacao, setSituacao] = useRecorte();
  const [rec, setRec] = useState(0);
  const [alvo, setAlvo] = useState<DestinacaoFinal | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string>();
  const r = useAsync(() => servicos.ibama.destinacoes({
    pageSize: TODOS,
    filters: { ...(situacao === 'todas' ? {} : { lancado: situacao === 'sim' ? 'sim' : 'nao' }), ...(de ? { de } : {}), ...(ate ? { ate } : {}) },
  }), [situacao, de, ate, rec]);
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
  return (
    <section className="painel" aria-label="Destinações finais">
      <p className="mudo">Baixa do saldo virtual: o volume das RMEs entregues, por espécie, que precisa ser lançado no sistema DOF.</p>
      <div className="toolbar">
        <Recorte valor={situacao} aoMudar={setSituacao} opcoes={[{ valor: 'nao', rotulo: 'A lançar' }, { valor: 'sim', rotulo: 'Lançadas' }, { valor: 'todas', rotulo: 'Todas' }]} />
      </div>
      {erro && <Aviso tom="critico">{erro}</Aviso>}
      {r.carregando && !r.dados ? <Carregando /> : r.erro ? <Erro erro={r.erro} aoTentar={r.recarregar} /> : !itens.length ? <Vazio mensagem="Nenhuma destinação neste recorte." dica="Mude a situação ou o período." /> : (
        <>
          <Tabela cabecalho={<><th>RME</th><th>Espécie</th><th className="al-right">Dormentes</th><th className="al-right">Volume</th><th>Entregue em</th><th>Lançada no DOF</th>{podeLancar && <th className="nao-imprimir">Ações</th>}</>}>
            {itens.map((d) => (
              <tr key={d.id}>
                <td><CodigoLink codigo={d.rmeNumero} /></td>
                <td>{nome(d.especieId)}</td>
                <td className="al-right">{numero(d.quantidade)}</td>
                <td className="al-right">{m3(d.volumeM3)}</td>
                <td>{data(d.entregueEm)}</td>
                <td>{d.lancadoEm ? <>{dataHora(d.lancadoEm)}{d.lancadoPor ? ` · ${d.lancadoPor}` : ''}</> : <Badge tom="laranja">a lançar</Badge>}</td>
                {podeLancar && <td className="nao-imprimir">{!d.lancadoEm && <button type="button" className="btn btn-acao btn-peq" onClick={() => setAlvo(d)}>Marcar como lançado no DOF</button>}</td>}
              </tr>
            ))}
          </Tabela>
          <p className="mudo">{numero(itens.length)} destinação(ões) · {numero(itens.reduce((t, d) => t + d.quantidade, 0))} dormentes · {m3(itens.reduce((t, d) => t + d.volumeM3, 0))}</p>
        </>
      )}
      <ConfirmModal
        aberto={!!alvo} carregando={enviando} titulo="Marcar como lançado no DOF"
        mensagem={alvo ? `Confirma que a baixa de ${m3(alvo.volumeM3)} de ${nome(alvo.especieId)} (${alvo.rmeNumero}) já foi lançada no sistema DOF? Não há como desfazer.` : ''}
        rotuloConfirmar="Marcar como lançado" aoConfirmar={lancar} aoCancelar={() => setAlvo(null)}
      />
    </section>
  );
}

function SaldoPatio({ podeInformar }: { podeInformar: boolean }) {
  const cad = useCadastros();
  const notificar = useToast();
  const [rec, setRec] = useState(0);
  const [informando, setInformando] = useState(false);
  const r = useAsync(() => servicos.ibama.saldoPatio(), [rec]);
  const nome = (id: string) => cad.especies.get(id)?.nomeCientifico ?? '—';
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
    <section className="painel" aria-label="Saldo do pátio">
      <p className="mudo">Volume físico no pátio (aguardando inspeção, em estoque, reservados, reprovados ainda não retirados e não localizados; o perdido sai) comparado com o último saldo informado do DOF. Tolerância de 10% (art. 41).</p>
      {podeInformar && <div className="acoes nao-imprimir"><button type="button" className="btn btn-pri" onClick={() => setInformando(true)}>Informar saldo do DOF</button></div>}
      {r.carregando && !r.dados ? <Carregando /> : r.erro ? <Erro erro={r.erro} aoTentar={r.recarregar} /> : !lista.length ? <Vazio mensagem="Nenhum dormente no pátio." /> : (
        <Tabela cabecalho={<><th>Espécie</th><th className="al-right">Dormentes</th><th className="al-right">Pátio</th><th className="al-right">Não localizados</th><th className="al-right">Informado no DOF</th><th className="al-right">Diferença</th><th>Situação</th></>}>
          {lista.map((s) => (
            <tr key={s.especieId}>
              <td className="quebra">{nome(s.especieId)}<span className="detalhe-linha" style={{ display: 'block' }}>{s.porTamanho.map((t) => `${cad.codigoTamanho(t.tamanhoId)}: ${numero(t.quantidade)} (${m3(t.volumeM3)})`).join(' · ')}</span></td>
              <td className="al-right">{numero(s.quantidade)}</td>
              <td className="al-right">{m3(s.fisicoM3)}</td>
              <td className="al-right">{s.naoLocalizados.quantidade ? `${numero(s.naoLocalizados.quantidade)} (${m3(s.naoLocalizados.volumeM3)})` : '—'}</td>
              <td className="al-right">{s.informadoM3 === undefined ? '—' : <>{m3(s.informadoM3)}<span className="detalhe-linha" style={{ display: 'block' }}>em {data(s.informadoEm)}</span></>}</td>
              <td className="al-right">{s.diferencaPct === undefined ? '—' : Number.isFinite(s.diferencaPct) ? pct(s.diferencaPct) : 'sem base'}</td>
              <td>{s.informadoM3 === undefined ? <Badge tom="cinza">sem saldo informado</Badge> : s.acimaTolerancia ? <Badge tom="vermelho">acima de 10%</Badge> : <Badge tom="verde">dentro da tolerância</Badge>}</td>
            </tr>
          ))}
        </Tabela>
      )}
      <FormModal
        titulo="Informar saldo do DOF" campos={campos} aberto={informando} aoFechar={() => setInformando(false)} aoEnviar={informar}
        iniciais={{ data: hojeSP() }} rotuloEnviar="Informar saldo"
        validar={(v): Record<string, string> => (Object.entries(v).some(([k, x]) => k.startsWith('e_') && x.trim()) ? {} : { data: 'Informe o saldo de ao menos uma espécie.' })}
      />
    </section>
  );
}

function Perdas({ de, ate, podeComunicar }: { de: string; ate: string; podeComunicar: boolean }) {
  const cad = useCadastros();
  const notificar = useToast();
  const [situacao, setSituacao] = useRecorte();
  const [rec, setRec] = useState(0);
  const [alvo, setAlvo] = useState<Perda | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string>();
  const r = useAsync(() => servicos.ibama.perdas({
    pageSize: TODOS,
    filters: { ...(situacao === 'todas' ? {} : { comunicado: situacao === 'sim' ? 'sim' : 'nao' }), ...(de ? { de } : {}), ...(ate ? { ate } : {}) },
  }), [situacao, de, ate, rec]);
  const itens = r.dados?.items ?? [];

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
    <section className="painel" aria-label="Perdas a comunicar ao IBAMA">
      <p className="mudo">Dormentes perdidos (o gestor transforma um "não localizado" em perdido, na Inspeção). Extravio, avaria, incêndio e intempérie são comunicados ao órgão (art. 42).</p>
      <div className="toolbar">
        <Recorte valor={situacao} aoMudar={setSituacao} opcoes={[{ valor: 'nao', rotulo: 'A comunicar' }, { valor: 'sim', rotulo: 'Comunicadas' }, { valor: 'todas', rotulo: 'Todas' }]} />
      </div>
      {erro && <Aviso tom="critico">{erro}</Aviso>}
      {r.carregando && !r.dados ? <Carregando /> : r.erro ? <Erro erro={r.erro} aoTentar={r.recarregar} /> : !itens.length ? <Vazio mensagem="Nenhuma perda neste recorte." dica="Mude a situação ou o período." /> : (
        <>
          <Tabela cabecalho={<><th>Dormente</th><th>Espécie</th><th className="al-right">Volume</th><th>Motivo</th><th>Perdido em</th><th>Comunicada ao órgão</th>{podeComunicar && <th className="nao-imprimir">Ações</th>}</>}>
            {itens.map((p) => (
              <tr key={p.id}>
                <td><CodigoLink codigo={p.dormenteId} /></td>
                <td>{cad.especies.get(p.especieId)?.nomeCientifico ?? '—'}</td>
                <td className="al-right">{m3(p.volumeM3)}</td>
                <td className="quebra"><BadgeDe mapa={MOTIVO_PERDA} valor={p.motivo} />{p.descricao && <span className="detalhe-linha" style={{ display: 'block' }}>{p.descricao}</span>}</td>
                <td>{dataHora(p.quando)}<span className="detalhe-linha" style={{ display: 'block' }}>{p.quem}</span></td>
                <td>{p.comunicadoEm ? <>{dataHora(p.comunicadoEm)}{p.comunicadoPor ? ` · ${p.comunicadoPor}` : ''}</> : <Badge tom="vermelho">a comunicar</Badge>}</td>
                {podeComunicar && <td className="nao-imprimir">{!p.comunicadoEm && <button type="button" className="btn btn-acao btn-peq" onClick={() => setAlvo(p)}>Marcar como comunicado</button>}</td>}
              </tr>
            ))}
          </Tabela>
          <p className="mudo">{numero(itens.length)} perda(s) · {m3(itens.reduce((t, p) => t + p.volumeM3, 0))}</p>
        </>
      )}
      <ConfirmModal
        aberto={!!alvo} carregando={enviando} titulo="Marcar como comunicado ao órgão"
        mensagem={alvo ? `Confirma que a perda do dormente ${alvo.dormenteId} já foi comunicada ao IBAMA? Não há como desfazer.` : ''}
        rotuloConfirmar="Marcar como comunicado" aoConfirmar={comunicar} aoCancelar={() => setAlvo(null)}
      />
    </section>
  );
}

function InventarioPorLocal() {
  const cad = useCadastros();
  const r = useAsync(() => servicos.ibama.inventarioPorLocal(), []);
  const lista = [...(r.dados ?? [])].sort((a, b) => cad.codigoLocal(a.localId).localeCompare(cad.codigoLocal(b.localId), 'pt-BR'));
  return (
    <section className="painel" aria-label="Inventário por local">
      <p className="mudo">Último inventário fechado de cada local ativo: quando foi conferido, o que foi localizado e as diferenças (art. 41). Mostra a situação de agora, sem filtro de período.</p>
      {r.carregando && !r.dados ? <Carregando /> : r.erro ? <Erro erro={r.erro} aoTentar={r.recarregar} /> : !lista.length ? <Vazio mensagem="Nenhum local ativo." /> : (
        <Tabela cabecalho={<><th>Local</th><th>Último inventário</th><th className="al-right">Esperados</th><th className="al-right">Localizados</th><th className="al-right">No lugar certo</th><th className="al-right">Local errado</th><th className="al-right">Não encontrados</th><th className="al-right">Inesperados</th></>}>
          {lista.map((i) => {
            const codigo = cad.codigoLocal(i.localId);
            return (
              <tr key={i.localId}>
                <td><Link className="mono" to={`/locais/${codigo}`}>{codigo}</Link></td>
                <td>{i.fechadoEm ? <><Link className="mono" to={`/inventarios/${i.inventarioId}`}>{i.numero}</Link> · {data(i.fechadoEm)}</> : <Badge tom="cinza">nunca conferido</Badge>}</td>
                <td className="al-right">{i.fechadoEm ? numero(i.esperados) : '—'}</td>
                <td className="al-right">{i.percentualLocalizados === undefined ? '—' : `${numero(i.localizados)} (${pct(i.percentualLocalizados)})`}</td>
                <td className="al-right">{i.percentualNoLugarCerto === undefined ? '—' : `${numero(i.noLugarCerto)} (${pct(i.percentualNoLugarCerto)})`}</td>
                <td className="al-right">{i.fechadoEm ? numero(i.localErrado) : '—'}</td>
                <td className="al-right">{i.fechadoEm ? numero(i.naoEncontrados) : '—'}</td>
                <td className="al-right">{i.fechadoEm ? numero(i.inesperados) : '—'}</td>
              </tr>
            );
          })}
        </Tabela>
      )}
    </section>
  );
}
