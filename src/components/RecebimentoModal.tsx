import { useEffect, useId, useState } from 'react';
import { SUFIXO_SIMULADO } from '../config/env';
import { diferencaVolumePct, foraDaTolerancia, sugerirFardos, TOLERANCIA_VOLUME_PCT } from '../dominio/parametros';
import { SITUACAO_VOLUMETRIA } from '../dominio/rotulos';
import { useAsync } from '../hooks/useAsync';
import { servicos } from '../services';
import { ApiError, mensagemSegura } from '../services/http';
import type { NotaFiscal, ResultadoRecebimento } from '../types/models';
import { arquivoInvalido, data, m3, paraNumero, pct, un } from '../utils/format';
import { BadgeDe } from './Badge';
import { ConfirmModal, Modal } from './Modal';

const EXTENSOES_FOTO = ['jpg', 'jpeg', 'png'];

/** Texto do toast após a confirmação (mostrado só depois da resposta do serviço). */
export function mensagemRecebimento(r: ResultadoRecebimento) {
  const lotes = r.lotes.map((l) => l.codigo).join(', ');
  const divergencia = r.recebimento.acimaTolerancia ? ' Lotes "Com divergência": alerta gerado.' : '';
  return `Recebimento confirmado: lote(s) ${lotes} e ${r.fardos.length} fardo(s) criados, aguardando inspeção.${divergencia}${SUFIXO_SIMULADO}`;
}

interface Props { nf: NotaFiscal | null; aoFechar: () => void; aoConcluir: (r: ResultadoRecebimento) => void }

/**
 * Recebimento de uma NF com DOF (RF03/RF04/RF07/RF31): o usuário informa a quantidade de cada fardo e a conferida é a soma.
 * Divergência com a NF ou avaria exige fotos; divergência de volume acima da tolerância exige confirmação e justificativa.
 */
export function RecebimentoModal({ nf, aoFechar, aoConcluir }: Props) {
  const formId = useId();
  const tam = useAsync(() => servicos.tamanhos.listar({ pageSize: 50 }), []);
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
    setAvaria(false); setObservacao(''); setJustificativa(''); setFotos([]); setErros({}); setErroGeral(undefined); setConfirmando(false);
  }, [nf]);

  if (!nf) return null;
  const tamanhos = tam.dados?.items ?? [];
  const numeros = (itemId: string) => (fardos[itemId] ?? []).map((t) => paraNumero(t, true));
  const conferida = (itemId: string) => numeros(itemId).reduce((a, q) => a + (Number.isInteger(q) && q > 0 ? q : 0), 0);
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

  const mudarFardo = (itemId: string, idx: number, valor: string) => setFardos((f) => ({ ...f, [itemId]: f[itemId].map((x, i) => (i === idx ? valor : x)) }));
  const removerFardo = (itemId: string, idx: number) => setFardos((f) => ({ ...f, [itemId]: f[itemId].filter((_, i) => i !== idx) }));
  const adicionarFardo = (itemId: string) => setFardos((f) => ({ ...f, [itemId]: [...(f[itemId] ?? []), ''] }));

  function escolherFotos(lista: FileList | null) {
    const fs = Array.from(lista ?? []);
    const invalido = fs.map((f) => arquivoInvalido(f, EXTENSOES_FOTO)).find(Boolean);
    setErros((e) => { const n = { ...e }; if (invalido) n.fotos = invalido; else delete n.fotos; return n; });
    setFotos(invalido ? [] : fs);
  }

  function validar(): Record<string, string> {
    const e: Record<string, string> = {};
    for (const item of nf!.itens) {
      const ns = numeros(item.id);
      if (!ns.length) e[`item-${item.id}`] = 'Informe ao menos um fardo.';
      else if (ns.some((q) => !Number.isInteger(q) || q < 1)) e[`item-${item.id}`] = 'Cada fardo precisa de uma quantidade inteira, mínimo 1.';
    }
    if (precisaFotos && !fotos.length) e.fotos = 'Anexe ao menos uma foto da carga (há divergência com a NF ou avaria).';
    if (acimaTolerancia && !justificativa.trim()) e.justificativa = 'Informe a justificativa para registrar o recebimento com divergência de volume.';
    return e;
  }

  function aoSubmeter(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validar();
    setErros(e);
    if (Object.keys(e).length) return;
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
      if (err instanceof ApiError && err.detalhes) setErros(err.detalhes);
      setErroGeral(mensagemSegura(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <Modal
        titulo={`Receber NF ${nf.numero}`} aberto={!confirmando} aoFechar={aoFechar} largo
        rodape={<>
          <button type="button" className="btn btn-sec" onClick={aoFechar} disabled={enviando}>Cancelar</button>
          <button type="submit" form={formId} className="btn btn-pri" disabled={enviando || !nf.dof}>{enviando ? 'Enviando…' : 'Confirmar recebimento'}</button>
        </>}
      >
        <form id={formId} onSubmit={aoSubmeter} noValidate>
          {erroGeral && <div className="aviso aviso-critico" role="alert">{erroGeral}</div>}
          {!nf.dof && <div className="aviso aviso-critico" role="alert">Recebimento bloqueado: a NF não tem DOF. Cadastre o DOF em NF e DOF.</div>}
          <dl className="detalhes">
            <dt>Fornecedor</dt><dd>{nf.fornecedor}</dd>
            <dt>NF</dt><dd>{nf.numero} · série {nf.serie} · emitida em {data(nf.emissao)}</dd>
            {nf.dof && <><dt>DOF</dt><dd>{nf.dof.numero} · válido até {data(nf.dof.validade)}</dd></>}
          </dl>
          <p className="mudo">Informe a quantidade de cada fardo (a sugestão é de fardos de 14). A quantidade conferida é a soma dos fardos. Ao confirmar, o sistema cria um lote por espécie e tamanho e os códigos dos fardos.</p>

          {nf.itens.map((item) => {
            const total = conferida(item.id);
            const dif = total - item.quantidade;
            return (
              <fieldset className="bloco-item" key={item.id}>
                <legend className="sr-only">{item.descricao}</legend>
                <div className="bloco-item-topo">
                  <div><strong><em>{item.especie}</em> · {item.tamanho}</strong><div className="mudo">{item.descricao}</div></div>
                  <div>NF: <strong>{un(item.quantidade)}</strong> · Conferido: <strong>{un(total)}</strong>{' '}
                    {dif === 0 ? <span className="mudo">(sem divergência)</span> : <span className="val-erro">({dif > 0 ? '+' : ''}{un(dif)})</span>}
                  </div>
                </div>
                <div className="fardos">
                  {(fardos[item.id] ?? []).map((q, i) => (
                    <span className="fardo" key={i}>
                      <input
                        value={q} inputMode="numeric" aria-label={`Fardo ${i + 1}: quantidade de dormentes`} onChange={(e) => mudarFardo(item.id, i, e.target.value)}
                        aria-invalid={!(Number.isInteger(paraNumero(q, true)) && paraNumero(q, true) > 0)}
                      />
                      <button type="button" className="btn-icone" aria-label={`Remover fardo ${i + 1}`} onClick={() => removerFardo(item.id, i)}>×</button>
                    </span>
                  ))}
                  <button type="button" className="btn btn-sec btn-peq" onClick={() => adicionarFardo(item.id)}>+ Fardo</button>
                  <span className="mudo">{(fardos[item.id] ?? []).length} fardo(s)</span>
                </div>
                {erros[`item-${item.id}`] && <span className="erro-campo">{erros[`item-${item.id}`]}</span>}
              </fieldset>
            );
          })}

          <h3>Volume recebido x DOF (por espécie)</h3>
          {medidasProvisorias && <div className="aviso aviso-alerta">Há tamanhos com medidas provisórias: o volume calculado também é provisório.</div>}
          <div className="tabela-wrap">
            <table className="tabela">
              <thead><tr><th>Espécie</th><th className="al-right">DOF</th><th className="al-right">Recebido (calculado)</th><th className="al-right">Diferença</th><th>Situação</th></tr></thead>
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
          {acimaTolerancia && (
            <div className="aviso aviso-critico" role="alert">
              <strong>Divergência de volume acima de {TOLERANCIA_VOLUME_PCT}% em relação ao DOF.</strong> A IN Ibama 21/2014 (art. 53) manda recusar a carga e comunicar o órgão.
              Se o recebimento for registrado mesmo assim, a justificativa é obrigatória e os lotes ficam "Com divergência", fora da separação até serem liberados.
            </div>
          )}
          {acimaTolerancia && (
            <div className="campo">
              <label htmlFor={`${formId}-just`}>Justificativa<span className="obrig" aria-hidden="true"> *</span></label>
              <textarea id={`${formId}-just`} rows={3} maxLength={500} value={justificativa} aria-invalid={!!erros.justificativa} onChange={(e) => setJustificativa(e.target.value)} />
              {erros.justificativa && <span className="erro-campo">{erros.justificativa}</span>}
            </div>
          )}

          <label className="caixa"><input type="checkbox" checked={avaria} onChange={(e) => setAvaria(e.target.checked)} /> Há avaria na carga</label>
          <div className="campo">
            <label htmlFor={`${formId}-fotos`}>Fotos da carga{precisaFotos && <span className="obrig" aria-hidden="true"> *</span>}</label>
            <input id={`${formId}-fotos`} type="file" multiple accept={EXTENSOES_FOTO.map((e) => `.${e}`).join(',')} aria-invalid={!!erros.fotos} onChange={(e) => escolherFotos(e.target.files)} />
            <span className="ajuda">{precisaFotos ? 'Obrigatórias: há divergência com a NF ou avaria.' : 'Opcionais quando não há divergência nem avaria.'} JPG ou PNG.</span>
            {fotos.length > 0 && <span className="mudo">{fotos.length} foto(s) selecionada(s).</span>}
            {erros.fotos && <span className="erro-campo">{erros.fotos}</span>}
          </div>
          <div className="campo">
            <label htmlFor={`${formId}-obs`}>Observação</label>
            <textarea id={`${formId}-obs`} rows={2} maxLength={500} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          </div>
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
