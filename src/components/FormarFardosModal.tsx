import { useEffect, useId, useRef, useState } from 'react';
import { SUFIXO_SIMULADO } from '../config/env';
import { chaveGrupo, rotuloGrupo } from '../dominio/inspecao';
import { DORMENTES_POR_FARDO, sugerirFardos } from '../dominio/parametros';
import { RESULTADO_INSPECAO } from '../dominio/rotulos';
import { useAsync } from '../hooks/useAsync';
import { servicos } from '../services';
import { ApiError, mensagemSegura } from '../services/http';
import type { FardoSugerido, Lote, LoteDetalhe } from '../types/models';
import { seqPeca } from '../utils/busca';
import { numero as fmt, un } from '../utils/format';
import { BadgeDe } from './Badge';
import { Carregando, Erro } from './Estados';
import { Modal } from './Modal';
import { ProgressoPassos } from './Passos';

const PASSOS = ['Resumo da inspeção', 'Fardos e peças', 'Revisar e confirmar'];

interface FardoEditado extends FardoSugerido { divergente: boolean }

/** Texto do toast após a conclusão (mostrado só depois da resposta do serviço). */
export function mensagemFardos(d: LoteDetalhe) {
  const liberados = d.fardos.filter((f) => f.resultado === 'aprovado' && !f.motivoBloqueio).length;
  return `Inspeção do lote ${d.lote.codigo} concluída: ${d.fardos.length} fardo(s) formado(s), ${liberados} disponível(is) para separação.${SUFIXO_SIMULADO}`;
}

/** Divide as peças do grupo em fardos de até 14, na ordem da sequência (a mesma sugestão do serviço). */
function distribuir(g: FardoSugerido): FardoEditado[] {
  let i = 0;
  return sugerirFardos(g.dormentes.length).map((q) => {
    const dormentes = g.dormentes.slice(i, i + q);
    i += q;
    return { ...g, quantidade: q, dormentes, divergente: false };
  });
}

interface Props { lote: Lote | null; aoFechar: () => void; aoConcluir: (d: LoteDetalhe) => void }

/**
 * Conclusão da inspeção (RF06/RF07), em 3 passos: 1. resumo das peças por resultado e categoria (todas precisam de resultado);
 * 2. fardos sugeridos com as peças de cada um (por grupo, na ordem da sequência): a pessoa marca peças e move para outro fardo
 * do mesmo grupo, marca divergência de espécie/tamanho e escolhe o local; 3. revisão. O servidor confere tudo de novo.
 */
export function FormarFardosModal({ lote, aoFechar, aoConcluir }: Props) {
  const formId = useId();
  const topo = useRef<HTMLDivElement>(null);
  const sug = useAsync(() => (lote ? servicos.lotes.sugestaoFardos(lote.codigo) : Promise.resolve(null)), [lote?.codigo]);
  const locais = useAsync(() => servicos.patio.listar({ pageSize: 100, sortBy: 'codigo' }), []);
  const [passo, setPasso] = useState(0);
  const [fardos, setFardos] = useState<FardoEditado[]>([]);
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const [destino, setDestino] = useState<Record<string, string>>({});
  const [local, setLocal] = useState('');
  const [motivo, setMotivo] = useState('');
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string>();
  const [enviando, setEnviando] = useState(false);

  const s = sug.dados;
  useEffect(() => {
    setFardos(s ? s.grupos.flatMap(distribuir) : []);
    setPasso(0); setMotivo(''); setMarcadas([]); setDestino({}); setErros({}); setErroGeral(undefined);
    setLocal(lote && lote.local !== 'A definir' ? lote.local : '');
  }, [s, lote]);
  useEffect(() => { topo.current?.scrollIntoView({ block: 'start' }); }, [passo]);

  if (!lote) return null;
  const algumDivergente = fardos.some((f) => f.divergente);
  const bloqueado = !s || s.semResultado > 0 || s.excedentes > 0;
  // Índices na lista, por grupo (para numerar "Fardo 1, 2..." dentro do grupo e mover peças).
  const indicesDo = (g: FardoSugerido) => fardos.map((f, i) => (chaveGrupo(f) === chaveGrupo(g) ? i : -1)).filter((i) => i >= 0);

  const mudar = (i: number, m: Partial<FardoEditado>) => setFardos((fs) => fs.map((f, j) => (j === i ? { ...f, ...m } : f)));
  const marcar = (d: string) => setMarcadas((m) => (m.includes(d) ? m.filter((x) => x !== d) : [...m, d]));
  const adicionar = (g: FardoSugerido) => setFardos((fs) => [...fs, { ...g, quantidade: 0, dormentes: [], divergente: false }]);
  const remover = (i: number) => setFardos((fs) => fs.filter((_, j) => j !== i));
  const refazer = (g: FardoSugerido) => {
    setFardos((fs) => [...fs.filter((f) => chaveGrupo(f) !== chaveGrupo(g)), ...distribuir(g)]);
    setMarcadas((m) => m.filter((d) => !g.dormentes.includes(d)));
  };
  // Move as peças marcadas deste grupo para o fardo escolhido (do mesmo grupo).
  function mover(g: FardoSugerido) {
    const alvo = Number(destino[chaveGrupo(g)]);
    const doGrupo = marcadas.filter((d) => g.dormentes.includes(d));
    if (!doGrupo.length || Number.isNaN(alvo)) return;
    setFardos((fs) => fs.map((f, i) => {
      if (chaveGrupo(f) !== chaveGrupo(g)) return f;
      const resto = f.dormentes.filter((d) => !doGrupo.includes(d));
      const dormentes = i === alvo ? [...resto, ...doGrupo].sort() : resto;
      return { ...f, dormentes, quantidade: dormentes.length };
    }));
    setMarcadas((m) => m.filter((d) => !doGrupo.includes(d)));
  }

  function validarPasso(p: number): Record<string, string> {
    const e: Record<string, string> = {};
    if (p === 1 && s) {
      for (const g of s.grupos) {
        const fs = fardos.filter((f) => chaveGrupo(f) === chaveGrupo(g));
        if (fs.some((f) => !f.dormentes.length)) e[chaveGrupo(g)] = 'Há fardo vazio: mova peças para ele ou remova.';
      }
      if (!local) e.local = 'Escolha onde os fardos foram montados.';
      if (algumDivergente && !motivo.trim()) e.motivoDivergencia = 'Descreva a divergência de espécie ou tamanho.';
    }
    return e;
  }

  function avancar(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validarPasso(passo);
    setErros(e);
    if (Object.keys(e).length) return;
    if (passo < PASSOS.length - 1) { setPasso(passo + 1); return; }
    void enviar();
  }

  async function enviar() {
    setEnviando(true);
    setErroGeral(undefined);
    try {
      const d = await servicos.lotes.formarFardos(lote!.codigo, {
        fardos: ordenados.map((f) => ({ resultado: f.resultado, categoria: f.categoria, quantidade: f.dormentes.length, dormentes: f.dormentes, divergente: f.divergente || undefined })),
        local, motivoDivergencia: algumDivergente ? motivo.trim() : undefined,
      });
      aoConcluir(d);
      aoFechar();
    } catch (err) {
      if (err instanceof ApiError && err.detalhes) { setErros(err.detalhes); setPasso(1); }
      setErroGeral(mensagemSegura(err));
    } finally {
      setEnviando(false);
    }
  }

  // Ordem em que os fardos serão numerados (F01, F02...): agrupados como na sugestão.
  const ordenados = s ? s.grupos.flatMap((g) => fardos.filter((f) => chaveGrupo(f) === chaveGrupo(g))) : [];
  const liberados = ordenados.filter((f) => f.resultado === 'aprovado' && !f.divergente);
  const ultimo = passo === PASSOS.length - 1;

  return (
    <Modal
      titulo={`Formar fardos do lote ${lote.codigo}`} aberto aoFechar={aoFechar} largo
      rodape={<>
        {passo === 0
          ? <button type="button" className="btn btn-sec" onClick={aoFechar} disabled={enviando}>Cancelar</button>
          : <button type="button" className="btn btn-sec" onClick={() => setPasso(passo - 1)} disabled={enviando}>Voltar</button>}
        <button type="submit" form={formId} className="btn btn-pri" disabled={enviando || bloqueado}>
          {enviando ? 'Enviando…' : ultimo ? 'Confirmar e formar fardos' : 'Próximo'}
        </button>
      </>}
    >
      <div ref={topo} />
      <ProgressoPassos passos={PASSOS} atual={passo} />
      {sug.carregando && !s ? <Carregando linhas={4} /> : sug.erro ? <Erro erro={sug.erro} aoTentar={sug.recarregar} /> : s && (
        <form id={formId} onSubmit={avancar} noValidate>
          {erroGeral && <div className="aviso aviso-critico" role="alert">{erroGeral}</div>}

          {passo === 0 && (
            <>
              <p className="mudo"><em>{lote.especieDocumental}</em> · Tamanho {lote.tamanho} · NF {lote.nfNumero} · {un(s.quantidadeLote)} recebidos</p>
              {s.semResultado > 0 && (
                <div className="aviso aviso-critico" role="alert">
                  Faltam {fmt(s.semResultado)} peça(s) sem resultado ({fmt(s.pecasInspecionadas)} de {fmt(s.quantidadeLote)} inspecionadas).
                  Aguarde o Inspector ou lance o resultado manualmente antes de formar os fardos.
                </div>
              )}
              {s.excedentes > 0 && (
                <div className="aviso aviso-critico" role="alert">
                  {fmt(s.excedentes)} inspeção(ões) com sequência acima da quantidade do lote: confira os códigos das peças no Inspector.
                </div>
              )}
              <div className="tabela-wrap">
                <table className="tabela">
                  <thead><tr><th>Resultado</th><th>Categoria</th><th className="al-right">Peças</th></tr></thead>
                  <tbody>
                    {s.grupos.map((g) => (
                      <tr key={chaveGrupo(g)}>
                        <td><BadgeDe mapa={RESULTADO_INSPECAO} valor={g.resultado} /></td>
                        <td>{g.resultado === 'aprovado' && g.categoria ? `Categoria ${g.categoria}` : <span className="mudo">—</span>}</td>
                        <td className="al-right">{fmt(g.quantidade)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mudo">
                Aprovadas viram fardos disponíveis, separados por categoria. Quarentena e reprovadas viram fardos segregados, fora da separação.
                A conversão do veredito do Inspector (Aprovado, Atenção, Rejeitado) e a categoria pelo índice são provisórias.
              </p>
            </>
          )}

          {passo === 1 && (
            <>
              <p className="mudo">
                O sistema distribuiu as peças pela etiqueta (até {DORMENTES_POR_FARDO} por fardo, na ordem da sequência). Monte cada fardo com
                essas peças ou, se montou diferente, marque as peças e mova para o fardo certo do mesmo grupo.
              </p>
              {s.grupos.map((g) => {
                const idx = indicesDo(g);
                const marcadasGrupo = marcadas.filter((d) => g.dormentes.includes(d));
                return (
                  <fieldset className="bloco-item" key={chaveGrupo(g)}>
                    <legend className="sr-only">{rotuloGrupo(g)}</legend>
                    <div className="bloco-item-topo">
                      <strong>{rotuloGrupo(g)}</strong>
                      <span className="mudo">{fmt(g.quantidade)} peças em {idx.length} fardo(s)</span>
                    </div>
                    {idx.map((i, n) => {
                      const f = fardos[i];
                      return (
                        <div className="fardo-pecas" key={i}>
                          <div className="fardo-pecas-topo">
                            <strong>Fardo {n + 1} · {fmt(f.dormentes.length)} peça(s)</strong>
                            <label className="caixa"><input type="checkbox" checked={f.divergente} onChange={(e) => mudar(i, { divergente: e.target.checked })} /> Espécie/tamanho divergente</label>
                            {!f.dormentes.length && <button type="button" className="btn btn-sec btn-peq" onClick={() => remover(i)}>Remover fardo vazio</button>}
                          </div>
                          <div className="pecas" role="group" aria-label={`Peças do fardo ${n + 1}`}>
                            {f.dormentes.map((d) => (
                              <button key={d} type="button" className="peca" aria-pressed={marcadas.includes(d)} title={d} onClick={() => marcar(d)}>{seqPeca(d)}</button>
                            ))}
                            {!f.dormentes.length && <span className="mudo">Vazio: mova peças para cá.</span>}
                          </div>
                        </div>
                      );
                    })}
                    <div className="mover-pecas">
                      <span className="mudo">{marcadasGrupo.length ? `${marcadasGrupo.length} marcada(s): mover para` : 'Marque peças para mover'}</span>
                      <select aria-label="Fardo de destino" value={destino[chaveGrupo(g)] ?? ''} onChange={(e) => setDestino((x) => ({ ...x, [chaveGrupo(g)]: e.target.value }))} disabled={!marcadasGrupo.length}>
                        <option value="">Fardo…</option>
                        {idx.map((i, n) => <option key={i} value={i}>Fardo {n + 1}</option>)}
                      </select>
                      <button type="button" className="btn btn-sec btn-peq" onClick={() => mover(g)} disabled={!marcadasGrupo.length || !destino[chaveGrupo(g)]}>Mover</button>
                      <button type="button" className="btn btn-sec btn-peq" onClick={() => adicionar(g)}>+ Fardo</button>
                      <button type="button" className="btn btn-sec btn-peq" onClick={() => refazer(g)}>Refazer sugestão</button>
                    </div>
                    {erros[chaveGrupo(g)] && <span className="erro-campo">{erros[chaveGrupo(g)]}</span>}
                  </fieldset>
                );
              })}
              {erros.fardos && <span className="erro-campo">{erros.fardos}</span>}
              <div className="campo">
                <label htmlFor={`${formId}-local`}>Local onde os fardos foram montados<span className="obrig" aria-hidden="true"> *</span></label>
                <select id={`${formId}-local`} value={local} aria-invalid={!!erros.local} onChange={(e) => setLocal(e.target.value)}>
                  <option value="">Selecione…</option>
                  {(locais.dados?.items ?? []).map((x) => <option key={x.id} value={x.codigo}>{x.codigo}</option>)}
                </select>
                {erros.local && <span className="erro-campo">{erros.local}</span>}
              </div>
              {algumDivergente && (
                <div className="campo">
                  <label htmlFor={`${formId}-motivo`}>Divergência de espécie ou tamanho<span className="obrig" aria-hidden="true"> *</span></label>
                  <textarea id={`${formId}-motivo`} rows={2} maxLength={300} value={motivo} aria-invalid={!!erros.motivoDivergencia} onChange={(e) => setMotivo(e.target.value)} />
                  <span className="ajuda">Os fardos marcados ficam bloqueados até o supervisor resolver.</span>
                  {erros.motivoDivergencia && <span className="erro-campo">{erros.motivoDivergencia}</span>}
                </div>
              )}
            </>
          )}

          {passo === 2 && (
            <>
              <div className="resumo">
                <h3>Ao confirmar, o sistema cria {ordenados.length} fardo(s) no local {local}</h3>
                <ul>
                  {ordenados.map((f, i) => (
                    <li key={i}>
                      <strong>{lote.codigo}-F{String(i + 1).padStart(2, '0')}</strong>: {un(f.dormentes.length)} · {rotuloGrupo(f)}
                      {f.divergente && <span className="val-erro"> · divergente</span>}
                      <div className="mudo">Peças {f.dormentes.map(seqPeca).join(', ')}</div>
                    </li>
                  ))}
                </ul>
                <p className="mudo">
                  {un(liberados.reduce((a, f) => a + f.dormentes.length, 0))} ficam disponíveis para separação em {liberados.length} fardo(s); o restante fica segregado.
                  Cada peça fica registrada no seu fardo. O saldo do lote não muda.
                </p>
              </div>
              {algumDivergente && <div className="aviso aviso-alerta">Divergência informada: {motivo.trim()}</div>}
            </>
          )}
        </form>
      )}
    </Modal>
  );
}
