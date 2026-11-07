import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge, BadgeDe, type Tom } from '../components/Badge';
import { CabecalhoObjeto, FatoChave } from '../components/Cabecalhos';
import { CodigoLink } from '../components/Codigos';
import { Aviso, Carregando, Erro } from '../components/Estados';
import { BarraProgresso } from '../components/Indicadores';
import { LeitorQr, type RetornoLeitura } from '../components/LeitorQr';
import { Modal } from '../components/Modal';
import { RodapeAcoes } from '../components/RodapeAcoes';
import { useToast } from '../components/Toast';
import { useAuth } from '../contexts/AuthContext';
import type { CodigoLido } from '../dominio/identificacao';
import { GRUPO_DIFERENCA, SITUACAO_INVENTARIO } from '../dominio/rotulos';
import { useAsync } from '../hooks/useAsync';
import { useCadastros } from '../hooks/useCadastros';
import { useTelaPequena } from '../hooks/useTelaPequena';
import { servicos } from '../services';
import { ApiError, mensagemSegura } from '../services/http';
import type { DiferencaInventario, GrupoDiferenca, Inventario, ResultadoInventario, RetornoLeituraInventario } from '../types/models';
import { dataHora, numero } from '../utils/format';

const TOM_LEITURA: Record<RetornoLeituraInventario['situacao'], Tom> = { conferido: 'verde', local_errado: 'laranja', inesperado: 'laranja', repetido: 'cinza' };
const GRUPOS: GrupoDiferenca[] = ['local_errado', 'nao_encontrado', 'inesperado'];
const chaveDe = (d: DiferencaInventario) => `${d.tipo}:${d.id}`;

/** Conferidos de um local, pelo que já foi lido (dormente lido no local ou o seu fardo lido no local). */
function progressoDoLocal(inv: Inventario, localId: string) {
  const esperados = inv.esperados.filter((x) => x.localId === localId);
  const lidos = new Set(inv.leituras.filter((l) => l.localId === localId).map((l) => `${l.tipo}:${l.id}`));
  const ok = (x: { dormenteId: string; fardoId: string }) => lidos.has(`dormente:${x.dormenteId}`) || lidos.has(`fardo:${x.fardoId}`);
  const fardos = [...new Set(esperados.map((x) => x.fardoId))].map((fardoId) => {
    const ds = esperados.filter((x) => x.fardoId === fardoId);
    return { fardoId, total: ds.length, lidos: ds.filter(ok).length };
  });
  return { esperados: esperados.length, conferidos: esperados.filter(ok).length, fardos };
}

/** Diferenças de um grupo, com a justificativa nos inesperados (editável na revisão). */
function ListaDiferencas({ grupo, itens, cad, justificativas, aoJustificar, erros }: {
  grupo: GrupoDiferenca; itens: DiferencaInventario[]; cad: ReturnType<typeof useCadastros>;
  justificativas?: Record<string, string>; aoJustificar?: (chave: string, texto: string) => void; erros?: Record<string, string>;
}) {
  if (!itens.length) return null;
  return (
    <section className="inventario-grupo">
      <h3><BadgeDe mapa={GRUPO_DIFERENCA} valor={grupo} /> {numero(itens.length)}</h3>
      <ul className="lista-simples">
        {itens.map((d) => (
          <li key={chaveDe(d)}>
            <CodigoLink codigo={d.id} />
            {d.tipo === 'fardo' && d.quantidade > 1 && <span className="mudo"> · {numero(d.quantidade)} dormentes</span>}
            {d.tipo === 'dormente' && d.fardoId !== d.id && <span className="mudo"> · fardo <CodigoLink codigo={d.fardoId} /></span>}
            {grupo === 'local_errado' && <span> · {cad.codigoLocal(d.localId)} → {cad.codigoLocal(d.lidoEmId)}</span>}
            <p className="mudo">{d.motivo}</p>
            {grupo === 'inesperado' && (aoJustificar ? (
              <label className="campo">
                <span>Justificativa (obrigatória)</span>
                <textarea rows={2} value={justificativas?.[chaveDe(d)] ?? ''} onChange={(ev) => aoJustificar(chaveDe(d), ev.target.value)} aria-invalid={!!erros?.[chaveDe(d)]} />
                {erros?.[chaveDe(d)] && <span className="erro-campo">{erros[chaveDe(d)]}</span>}
              </label>
            ) : d.justificativa && <p>Justificativa: {d.justificativa}</p>)}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Conferência por local: esperados, conferidos e percentual. */
function TabelaPorLocal({ r, cad }: { r: ResultadoInventario; cad: ReturnType<typeof useCadastros> }) {
  return (
    <div className="tabela-rolagem">
      <table className="tabela tabela-cartoes">
        <thead><tr><th>Local</th><th className="al-right">Esperados</th><th className="al-right">Conferidos</th><th className="al-right">Diferenças</th></tr></thead>
        <tbody>
          {r.porLocal.map((l) => (
            <tr key={l.localId}>
              <td data-rotulo="Local"><Link to={`/locais/${cad.codigoLocal(l.localId)}`}>{cad.codigoLocal(l.localId)}</Link></td>
              <td data-rotulo="Esperados" className="al-right">{numero(l.esperados)}</td>
              <td data-rotulo="Conferidos" className="al-right">{numero(l.conferidos)} ({l.percentual.toLocaleString('pt-BR')}%)</td>
              <td data-rotulo="Diferenças" className="al-right">{numero(l.diferencas)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Inventário (tela de campo, seção 11.1 do plano): aberto, escolhe o local que está conferindo e lê os QR em modo
 * contínuo (câmera em cima; lista dos fardos esperados e contador embaixo); "Revisar e fechar" mostra o resultado em
 * grupos e pede a justificativa dos inesperados. Fechado, mostra o resultado (o gestor trata os não encontrados).
 */
export default function InventarioDetalhe() {
  const { id = '' } = useParams();
  const { pode } = useAuth();
  const cad = useCadastros();
  const notificar = useToast();
  const pequena = useTelaPequena();
  const r = useAsync(() => servicos.inventarios.obter(id), [id]);
  const [localId, setLocalId] = useState('');
  const [lendo, setLendo] = useState(false);
  const [ultimo, setUltimo] = useState<RetornoLeituraInventario | null>(null);
  const [revisar, setRevisar] = useState(false);
  const [previa, setPrevia] = useState<ResultadoInventario | null>(null);
  const [justificativas, setJustificativas] = useState<Record<string, string>>({});
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  if (r.carregando && !r.dados) return <section className="painel"><Carregando /></section>;
  if (r.erro || !r.dados) return <section className="painel"><Erro erro={r.erro} aoTentar={r.recarregar} /></section>;
  const inv = r.dados;
  const atual = localId || inv.locaisIds[0];
  const operar = inv.situacao === 'aberto' && pode('estoque:movimentar');
  const prog = progressoDoLocal(inv, atual);

  function aoLer(c: CodigoLido): RetornoLeitura {
    if (c.tipo === 'local') {
      const codigo = c.id.replace(/^LOC-/, '');
      const l = inv.locaisIds.find((x) => cad.codigoLocal(x) === codigo);
      if (!l) return { ok: false, mensagem: `O local ${codigo} não está neste inventário.` };
      setLocalId(l);
      return { ok: true, mensagem: `Conferindo ${codigo}.` };
    }
    if (c.tipo !== 'fardo' && c.tipo !== 'dormente') return { ok: false, mensagem: 'Leia o QR de um fardo, de um dormente ou do local.' };
    servicos.inventarios.ler(inv.id, { tipo: c.tipo, id: c.id, localId: atual })
      .then((ret) => { setUltimo(ret); r.recarregar(); })
      .catch((e: unknown) => setUltimo({ situacao: 'inesperado', mensagem: mensagemSegura(e), quantidade: 0 }));
    return { ok: true, mensagem: `${c.id} lido em ${cad.codigoLocal(atual)}.` };
  }

  async function abrirRevisao() {
    setRevisar(true); setPrevia(null); setErros({});
    try { setPrevia(await servicos.inventarios.previa(inv.id)); } catch (e) { notificar('erro', mensagemSegura(e)); setRevisar(false); }
  }

  async function fechar() {
    setEnviando(true); setErros({});
    try {
      const f = await servicos.inventarios.fechar(inv.id, justificativas);
      notificar('sucesso', `${f.numero} fechado: ${numero(f.resultado!.conferidos)} de ${numero(f.resultado!.esperados)} conferidos.`);
      setRevisar(false); r.recarregar();
    } catch (e) {
      if (e instanceof ApiError && e.detalhes) setErros(e.detalhes);
      notificar('erro', mensagemSegura(e));
    } finally { setEnviando(false); }
  }

  const acoes = operar && (
    <>
      <button type="button" className="btn btn-acao" onClick={() => setLendo(true)}>Ler QR</button>
      <button type="button" className="btn btn-pri" onClick={abrirRevisao}>Revisar e fechar</button>
    </>
  );

  const listaDoLocal = (
    <div className="leitura-fardos">
      <label className="campo">
        <span>Local que está conferindo</span>
        <select value={atual} onChange={(ev) => setLocalId(ev.target.value)}>
          {inv.locaisIds.map((l) => <option key={l} value={l}>{cad.codigoLocal(l)}</option>)}
        </select>
      </label>
      <p className="leitura-contador" aria-live="polite"><strong>{numero(prog.conferidos)} de {numero(prog.esperados)}</strong> dormentes conferidos em {cad.codigoLocal(atual)}</p>
      {ultimo && <p aria-live="polite"><Badge tom={TOM_LEITURA[ultimo.situacao]}>{ultimo.situacao === 'local_errado' ? 'local errado' : ultimo.situacao}</Badge> {ultimo.mensagem}</p>}
      <ul>
        {prog.fardos.map((f) => (
          <li key={f.fardoId} className={f.lidos === f.total ? 'lido' : undefined}>
            <span className="mono">{f.fardoId}</span> <span className="mudo">{numero(f.lidos)} de {numero(f.total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );

  const res = inv.resultado;
  return (
    <section className="painel">
      <CabecalhoObjeto
        tipo="Inventário" id={inv.numero} situacao={<BadgeDe mapa={SITUACAO_INVENTARIO} valor={inv.situacao} />}
        migalhas={[{ rotulo: 'Inventário', para: '/inventarios' }, { rotulo: inv.numero }]}
        acoes={!pequena && acoes}
        fatos={<>
          <FatoChave rotulo="Locais" valor={inv.locaisIds.map((l) => cad.codigoLocal(l)).join(', ')} />
          <FatoChave rotulo="Aberto" valor={`${dataHora(inv.abertoEm)} · ${inv.abertoPor}`} />
          {inv.fechadoEm && <FatoChave rotulo="Fechado" valor={`${dataHora(inv.fechadoEm)} · ${inv.fechadoPor}`} />}
          <FatoChave rotulo="Esperados" valor={numero(res?.esperados ?? inv.esperados.length)} />
          <FatoChave rotulo="Leituras" valor={numero(inv.leituras.length)} />
          {res && <FatoChave rotulo="Conferidos" valor={`${numero(res.conferidos)} (${res.percentual.toLocaleString('pt-BR')}%)`} />}
        </>}
      />

      {inv.situacao === 'aberto' && (
        <>
          {!pode('estoque:movimentar') && <Aviso tom="info">Inventário em andamento: o almoxarifado lê e fecha. O resultado aparece aqui depois do fechamento.</Aviso>}
          <BarraProgresso recebido={prog.conferidos} total={prog.esperados} unidade="conferidos" />
          {listaDoLocal}
        </>
      )}

      {res && (
        <>
          <h2 className="subtitulo">Por local</h2>
          <TabelaPorLocal r={res} cad={cad} />
          <h2 className="subtitulo">Diferenças</h2>
          {!res.diferencas.length && <p className="mudo">Nenhuma diferença: tudo conferido.</p>}
          {GRUPOS.map((g) => <ListaDiferencas key={g} grupo={g} itens={res.diferencas.filter((d) => d.grupo === g)} cad={cad} />)}
          {res.diferencas.some((d) => d.grupo === 'nao_encontrado') && (
            <Aviso tom="alerta">
              Os não encontrados passaram a "não localizado". {pode('painel:gestao') ? <Link to="/inspecao?aba=nao_localizados">Tratar os não localizados</Link> : 'O gestor trata cada um (inspeção, se aparecer, ou perda).'}
            </Aviso>
          )}
        </>
      )}

      {pequena && acoes && <RodapeAcoes>{acoes}</RodapeAcoes>}

      <LeitorQr aberto={lendo} aoFechar={() => setLendo(false)} modo="capturar" continuo aoLer={aoLer} titulo={`Inventário · ${cad.codigoLocal(atual)}`}>
        {listaDoLocal}
        <button type="button" className="btn btn-pri btn-grande" onClick={() => setLendo(false)}>Concluir leitura</button>
      </LeitorQr>

      <Modal
        titulo={`Revisar e fechar ${inv.numero}`} aberto={revisar} aoFechar={() => setRevisar(false)} largo
        rodape={<>
          <button type="button" className="btn btn-sec" onClick={() => setRevisar(false)}>Voltar à leitura</button>
          <button type="button" className="btn btn-pri" onClick={fechar} disabled={!previa || enviando}>{enviando ? 'Fechando…' : 'Fechar inventário'}</button>
        </>}
      >
        {!previa ? <Carregando /> : (
          <>
            <p>{numero(previa.conferidos)} de {numero(previa.esperados)} conferidos ({previa.percentual.toLocaleString('pt-BR')}%). Ao fechar: o local errado é corrigido por transferência, os não encontrados passam a "não localizado" e os inesperados ficam registrados com a justificativa. Não há ajuste de quantidade.</p>
            <TabelaPorLocal r={previa} cad={cad} />
            {!previa.diferencas.length && <p className="mudo">Nenhuma diferença.</p>}
            {GRUPOS.map((g) => (
              <ListaDiferencas
                key={g} grupo={g} itens={previa.diferencas.filter((d) => d.grupo === g)} cad={cad} erros={erros}
                justificativas={justificativas} aoJustificar={(k, t) => setJustificativas((j) => ({ ...j, [k]: t }))}
              />
            ))}
          </>
        )}
      </Modal>
    </section>
  );
}
