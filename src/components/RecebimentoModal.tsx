import { useEffect, useId, useRef, useState } from 'react';
import { SUFIXO_SIMULADO } from '../config/env';
import { diferencaVolumePct, DORMENTES_POR_FARDO, foraDaTolerancia, sugerirFardos, TOLERANCIA_VOLUME_PCT } from '../dominio/parametros';
import { SITUACAO_VOLUMETRIA } from '../dominio/rotulos';
import { useAsync } from '../hooks/useAsync';
import { servicos } from '../services';
import { ApiError, mensagemSegura } from '../services/http';
import type { NotaFiscal, ResultadoRecebimento } from '../types/models';
import { arquivoInvalido, data, m3, paraNumero, pct, un } from '../utils/format';
import { BadgeDe } from './Badge';
import { Contador } from './Contador';
import { ConfirmModal, Modal } from './Modal';
import { ProgressoPassos } from './Passos';

const EXTENSOES_FOTO = ['jpg', 'jpeg', 'png'];
const PASSOS = ['Fardos', 'Fotos e observações', 'Revisar e confirmar'];

/** Texto do toast após a confirmação (mostrado só depois da resposta do serviço). */
export function mensagemRecebimento(r: ResultadoRecebimento) {
  const lotes = r.lotes.map((l) => l.codigo).join(', ');
  const divergencia = r.recebimento.acimaTolerancia ? ' Lotes "Com divergência": alerta gerado.' : '';
  return `Recebimento confirmado: lote(s) ${lotes} e ${r.fardos.length} fardo(s) criados, aguardando inspeção.${divergencia}${SUFIXO_SIMULADO}`;
}

interface Props { nf: NotaFiscal | null; aoFechar: () => void; aoConcluir: (r: ResultadoRecebimento) => void }

/**
 * Recebimento de uma NF com DOF (RF03/RF04/RF07/RF31), em 3 passos pensados para o celular:
 * 1. fardos de cada item (a conferida é a soma); 2. avaria, fotos (obrigatórias com divergência ou avaria) e justificativa
 * (obrigatória com divergência de volume acima da tolerância); 3. revisão do que será criado antes de confirmar.
 */
export function RecebimentoModal({ nf, aoFechar, aoConcluir }: Props) {
  const formId = useId();
  const topo = useRef<HTMLDivElement>(null);
  const tam = useAsync(() => servicos.tamanhos.listar({ pageSize: 50 }), []);
  const [passo, setPasso] = useState(0);
  const [fardos, setFardos] = useState<Record<string, string[]>>({});
  const [avaria, setAvaria] = useState(false);
  const [observacao, setObservacao] = useState('');
  const [justificativa, setJustificativa] = useState('');
  const [fotos, setFotos] = useState<File[]>([]);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string>();
  const [enviando, setEnviando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  useEffect(() => {
    if (!nf) return;
    setFardos(Object.fromEntries(nf.itens.map((i) => [i.id, sugerirFardos(i.quantidade).map(String)])));
    setPasso(0); setAvaria(false); setObservacao(''); setJustificativa(''); setFotos([]); setErros({}); setErroGeral(undefined); setConfirmando(false);
  }, [nf]);
  useEffect(() => { topo.current?.scrollIntoView({ block: 'start' }); }, [passo]);

  if (!nf) return null;
  const tamanhos = tam.dados?.items ?? [];
  const numeros = (itemId: string) => (fardos[itemId] ?? []).map((t) => paraNumero(t, true));
  const valido = (q: number) => Number.isInteger(q) && q > 0;
  const conferida = (itemId: string) => numeros(itemId).reduce((a, q) => a + (valido(q) ? q : 0), 0);
  const divergenciaQuantidade = nf.itens.some((i) => conferida(i.id) !== i.quantidade);
  const precisaFotos = divergenciaQuantidade || avaria;

  // Prévia por espécie: soma dos lotes da espécie (conferida x volume do tamanho) x volume do DOF da espécie.
  const volumes = (nf.dof?.volumes ?? []).map((v) => {
    const recebido = nf.itens.filter((i) => i.especieId === v.especieId)
      .reduce((a, i) => a + conferida(i.id) * (tamanhos.find((t) => t.id === i.tamanhoId)?.volumeM3 ?? 0), 0);
    const dif = diferencaVolumePct(recebido, v.volumeM3);
    return { ...v, recebido, dif, fora: foraDaTolerancia(dif) };
  });
  const acimaTolerancia = volumes.some((v) => v.fora);
  const medidasProvisorias = nf.itens.some((i) => tamanhos.find((t) => t.id === i.tamanhoId)?.medidas === 'provisorio');

  // Prévia dos lotes: um por espécie + tamanho (itens iguais da NF somados), como o serviço vai criar.
  const lotesPrevistos = [...nf.itens.reduce((m, i) => {
    const k = `${i.especieId}|${i.tamanhoId}`;
    const g = m.get(k) ?? { especie: i.especie, tamanho: i.tamanho, fardos: [] as number[] };
    g.fardos.push(...numeros(i.id).filter(valido));
    return m.set(k, g);
  }, new Map<string, { especie: string; tamanho: string; fardos: number[] }>()).values()];
  const totalFardos = lotesPrevistos.reduce((a, l) => a + l.fardos.length, 0);

  const mudarFardo = (itemId: string, idx: number, valor: string) => setFardos((f) => ({ ...f, [itemId]: f[itemId].map((x, i) => (i === idx ? valor : x)) }));
  const removerFardo = (itemId: string, idx: number) => setFardos((f) => ({ ...f, [itemId]: f[itemId].filter((_, i) => i !== idx) }));
  // Fardo novo já vem com o que falta para fechar a NF (ou 14, se nada falta).
  const adicionarFardo = (itemId: string, quantidadeNf: number) => {
    const falta = quantidadeNf - conferida(itemId);
    setFardos((f) => ({ ...f, [itemId]: [...(f[itemId] ?? []), String(falta > 0 ? Math.min(falta, DORMENTES_POR_FARDO) : DORMENTES_POR_FARDO)] }));
  };
  const sugerirDeNovo = (itemId: string, quantidadeNf: number) => setFardos((f) => ({ ...f, [itemId]: sugerirFardos(quantidadeNf).map(String) }));

  function escolherFotos(lista: FileList | null) {
    const fs = Array.from(lista ?? []);
    const invalido = fs.map((f) => arquivoInvalido(f, EXTENSOES_FOTO)).find(Boolean);
    setErros((e) => { const n = { ...e }; if (invalido) n.fotos = invalido; else delete n.fotos; return n; });
    setFotos(invalido ? [] : fs);
  }

  function validarPasso(p: number): Record<string, string> {
    const e: Record<string, string> = {};
    if (p === 0) {
      for (const item of nf!.itens) {
        const ns = numeros(item.id);
        if (!ns.length) e[`item-${item.id}`] = 'Informe ao menos um fardo.';
        else if (!ns.every(valido)) e[`item-${item.id}`] = 'Cada fardo precisa de uma quantidade inteira, mínimo 1.';
      }
    }
    if (p === 1) {
      if (precisaFotos && !fotos.length) e.fotos = 'Anexe ao menos uma foto da carga (há divergência com a NF ou avaria).';
      if (acimaTolerancia && !justificativa.trim()) e.justificativa = 'Informe a justificativa para registrar o recebimento com divergência de volume.';
    }
    return e;
  }

  function avancar(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validarPasso(passo);
    setErros(e);
    if (Object.keys(e).length) return;
    if (passo < PASSOS.length - 1) { setPasso(passo + 1); return; }
    if (acimaTolerancia) setConfirmando(true);
    else void enviar();
  }

  async function enviar() {
    setEnviando(true);
    setErroGeral(undefined);
    try {
      const r = await servicos.recebimentos.confirmar({
        nfId: nf!.id, itens: nf!.itens.map((i) => ({ itemId: i.id, fardos: numeros(i.id) })), avaria,
        observacao: observacao.trim() || undefined, justificativa: acimaTolerancia ? justificativa.trim() : undefined,
      }, fotos);
      setConfirmando(false);
      aoConcluir(r);
      aoFechar();
    } catch (err) {
      setConfirmando(false);
      if (err instanceof ApiError && err.detalhes) {
        setErros(err.detalhes);
        // Volta ao passo do primeiro campo recusado pelo servidor.
        setPasso(Object.keys(err.detalhes).some((k) => k.startsWith('item-')) ? 0 : 1);
      }
      setErroGeral(mensagemSegura(err));
    } finally {
      setEnviando(false);
    }
  }

  const ultimo = passo === PASSOS.length - 1;
  return (
    <>
      <Modal
        titulo={`Receber NF ${nf.numero}`} aberto={!confirmando} aoFechar={aoFechar} largo
        rodape={<>
          {passo === 0
            ? <button type="button" className="btn btn-sec" onClick={aoFechar} disabled={enviando}>Cancelar</button>
            : <button type="button" className="btn btn-sec" onClick={() => setPasso(passo - 1)} disabled={enviando}>Voltar</button>}
          <button type="submit" form={formId} className="btn btn-pri" disabled={enviando || !nf.dof}>
            {enviando ? 'Enviando…' : ultimo ? 'Confirmar recebimento' : 'Próximo'}
          </button>
        </>}
      >
        <div ref={topo} />
        <ProgressoPassos passos={PASSOS} atual={passo} />
        <form id={formId} onSubmit={avancar} noValidate>
          {erroGeral && <div className="aviso aviso-critico" role="alert">{erroGeral}</div>}
          {!nf.dof && <div className="aviso aviso-critico" role="alert">Recebimento bloqueado: a NF não tem DOF. Cadastre o DOF em NF e DOF.</div>}

          {passo === 0 && (
            <>
              <p className="mudo">{nf.fornecedor} · DOF {nf.dof?.numero}. Ajuste a quantidade de cada fardo (sugestão: fardos de {DORMENTES_POR_FARDO}). A conferida é a soma.</p>
              {nf.itens.map((item) => {
                const total = conferida(item.id);
                const dif = total - item.quantidade;
                return (
                  <fieldset className="bloco-item" key={item.id}>
                    <legend className="sr-only">{item.especie} {item.tamanho}</legend>
                    <div className="bloco-item-topo">
                      <div><strong><em>{item.especie}</em> · {item.tamanho}</strong><div className="mudo">{item.descricao}</div></div>
                      <div className="total-item">
                        <span>NF <strong>{un(item.quantidade)}</strong></span>
                        <span>Conferido <strong className={dif ? 'val-erro' : undefined}>{un(total)}</strong></span>
                        {dif !== 0 && <span className="val-erro">{dif > 0 ? '+' : ''}{un(dif)}</span>}
                      </div>
                    </div>
                    <div className="grade-fardos">
                      {(fardos[item.id] ?? []).map((q, i) => (
                        <div className="fardo-linha" key={i}>
                          <span>Fardo {i + 1}</span>
                          <Contador valor={q} aoMudar={(v) => mudarFardo(item.id, i, v)} rotulo={`${item.especie} ${item.tamanho}, fardo ${i + 1}`} min={1} invalido={!valido(paraNumero(q, true))} />
                          <button type="button" className="btn-icone" aria-label={`Remover fardo ${i + 1}`} onClick={() => removerFardo(item.id, i)}>×</button>
                        </div>
                      ))}
                    </div>
                    <div className="acoes">
                      <button type="button" className="btn btn-sec btn-peq" onClick={() => adicionarFardo(item.id, item.quantidade)}>+ Fardo</button>
                      <button type="button" className="btn btn-sec btn-peq" onClick={() => sugerirDeNovo(item.id, item.quantidade)}>Refazer sugestão</button>
                      <span className="mudo">{(fardos[item.id] ?? []).length} fardo(s)</span>
                    </div>
                    {erros[`item-${item.id}`] && <span className="erro-campo">{erros[`item-${item.id}`]}</span>}
                  </fieldset>
                );
              })}
              {acimaTolerancia && <div className="aviso aviso-alerta">Divergência de volume acima de {TOLERANCIA_VOLUME_PCT}% em relação ao DOF. Confira os fardos; se estiver certo, você justifica no próximo passo.</div>}
            </>
          )}

          {passo === 1 && (
            <>
              {acimaTolerancia && (
                <>
                  <div className="aviso aviso-critico" role="alert">
                    <strong>Divergência de volume acima de {TOLERANCIA_VOLUME_PCT}% em relação ao DOF.</strong> A IN Ibama 21/2014 (art. 53) manda recusar a carga e comunicar o órgão.
                    Se o recebimento for registrado mesmo assim, os lotes ficam "Com divergência", fora da separação até serem liberados.
                  </div>
                  <div className="campo">
                    <label htmlFor={`${formId}-just`}>Justificativa<span className="obrig" aria-hidden="true"> *</span></label>
                    <textarea id={`${formId}-just`} rows={3} maxLength={500} value={justificativa} aria-invalid={!!erros.justificativa} onChange={(e) => setJustificativa(e.target.value)} />
                    {erros.justificativa && <span className="erro-campo">{erros.justificativa}</span>}
                  </div>
                </>
              )}
              <label className="caixa caixa-grande"><input type="checkbox" checked={avaria} onChange={(e) => setAvaria(e.target.checked)} /> Há avaria na carga</label>
              <div className="campo">
                <label htmlFor={`${formId}-fotos`}>Fotos da carga{precisaFotos && <span className="obrig" aria-hidden="true"> *</span>}</label>
                <input id={`${formId}-fotos`} type="file" multiple accept={EXTENSOES_FOTO.map((e) => `.${e}`).join(',')} aria-invalid={!!erros.fotos} onChange={(e) => escolherFotos(e.target.files)} />
                <span className="ajuda">{precisaFotos ? `Obrigatórias: ${divergenciaQuantidade ? 'a quantidade conferida difere da NF' : 'há avaria'}.` : 'Opcionais quando não há divergência nem avaria.'} JPG ou PNG.</span>
                {fotos.length > 0 && <span className="mudo">{fotos.length} foto(s) selecionada(s).</span>}
                {erros.fotos && <span className="erro-campo">{erros.fotos}</span>}
              </div>
              <div className="campo">
                <label htmlFor={`${formId}-obs`}>Observação</label>
                <textarea id={`${formId}-obs`} rows={2} maxLength={500} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
              </div>
            </>
          )}

          {passo === 2 && (
            <>
              <div className="resumo">
                <h3>Ao confirmar, o sistema cria {lotesPrevistos.length} lote(s) e {totalFardos} fardo(s), aguardando inspeção</h3>
                <ul>
                  {lotesPrevistos.map((l) => (
                    <li key={`${l.especie}|${l.tamanho}`}>
                      <strong><em>{l.especie}</em> · {l.tamanho}</strong>: {un(l.fardos.reduce((a, q) => a + q, 0))} em {l.fardos.length} fardo(s) ({l.fardos.join(', ')})
                    </li>
                  ))}
                </ul>
                <p className="mudo">Os códigos (ex.: LT26-0042 e LT26-0042-F01) são gerados na confirmação.</p>
              </div>
              <dl className="detalhes">
                <dt>NF / DOF</dt><dd>{nf.numero} / {nf.dof?.numero} · {nf.fornecedor}</dd>
                <dt>Quantidade</dt><dd>NF {un(nf.quantidadeTotal)} · conferida {un(nf.itens.reduce((a, i) => a + conferida(i.id), 0))}{divergenciaQuantidade && <span className="val-erro"> (com divergência)</span>}</dd>
                <dt>Avaria</dt><dd>{avaria ? 'Sim' : 'Não'}</dd>
                <dt>Fotos</dt><dd>{fotos.length}</dd>
                {justificativa.trim() && acimaTolerancia && <><dt>Justificativa</dt><dd>{justificativa.trim()}</dd></>}
                {observacao.trim() && <><dt>Observação</dt><dd>{observacao.trim()}</dd></>}
              </dl>
              <h3>Volume recebido x DOF (por espécie)</h3>
              {medidasProvisorias && <div className="aviso aviso-alerta">Há tamanhos com medidas provisórias: o volume calculado também é provisório.</div>}
              <div className="tabela-wrap">
                <table className="tabela">
                  <thead><tr><th>Espécie</th><th className="al-right">DOF</th><th className="al-right">Recebido</th><th className="al-right">Diferença</th><th>Situação</th></tr></thead>
                  <tbody>
                    {volumes.map((v) => (
                      <tr key={v.especieId}>
                        <td><em>{v.especie}</em></td><td className="al-right">{m3(v.volumeM3)}</td><td className="al-right">{m3(v.recebido)}</td>
                        <td className={`al-right${v.fora ? ' val-erro' : ''}`}>{v.dif > 0 ? '+' : ''}{pct(v.dif)}</td>
                        <td><BadgeDe mapa={SITUACAO_VOLUMETRIA} valor={v.fora ? 'divergente' : 'conforme'} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {acimaTolerancia && <div className="aviso aviso-critico">Os lotes serão criados "Com divergência" e um alerta será gerado.</div>}
              <p className="mudo">NF emitida em {data(nf.emissao)} · DOF válido até {data(nf.dof?.validade)}.</p>
            </>
          )}
        </form>
      </Modal>
      <ConfirmModal
        titulo="Confirmar recebimento com divergência" perigo carregando={enviando} aberto={confirmando} rotuloConfirmar="Registrar com divergência"
        mensagem={`A divergência de volume passa de ${TOLERANCIA_VOLUME_PCT}% em relação ao DOF. Os lotes serão criados "Com divergência", fora da separação até serem liberados, e um alerta será gerado. Confirma o registro?`}
        aoCancelar={() => setConfirmando(false)} aoConfirmar={() => void enviar()}
      />
    </>
  );
}
