import { useEffect, useId, useState } from 'react';
import { ESTADO_FARDO } from '../dominio/rotulos';
import { useAsync } from '../hooks/useAsync';
import { servicos } from '../services';
import { ApiError, mensagemSegura } from '../services/http';
import type { OpcaoSeparacao, Rme } from '../types/models';
import { data, paraNumero, un } from '../utils/format';
import { BadgeDe } from './Badge';
import { Carregando } from './Estados';
import { Modal } from './Modal';

const chave = (o: { itemId: string; fardoCodigo: string }) => `${o.itemId}|${o.fardoCodigo}`;
const sugestao = (ops: OpcaoSeparacao[]) => Object.fromEntries(ops.map((o) => [chave(o), o.sugerido ? String(o.sugerido) : '']));

interface Props { rme: Rme | null; aoFechar: () => void; aoConcluir: (r: Rme) => void }

/**
 * Separação (RF18/RF19, regras 4 e 7): o sistema sugere os fardos (abertos primeiro, depois fechados por FIFO de lote);
 * o almoxarife pode mudar, mas precisa justificar. A quantidade separada de cada item tem de bater com a pedida.
 */
export function SeparacaoModal({ rme, aoFechar, aoConcluir }: Props) {
  const formId = useId();
  const opcoes = useAsync(() => (rme ? servicos.rme.opcoesSeparacao(rme.id) : Promise.resolve([])), [rme?.id]);
  const [qtd, setQtd] = useState<Record<string, string>>({});
  const [justificativa, setJustificativa] = useState('');
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string>();
  const [enviando, setEnviando] = useState(false);

  const ops = opcoes.dados ?? [];
  useEffect(() => { setQtd(sugestao(ops)); setJustificativa(''); setErros({}); setErroGeral(undefined); }, [opcoes.dados]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!rme) return null;
  const valor = (o: OpcaoSeparacao) => { const t = (qtd[chave(o)] ?? '').trim(); return t ? paraNumero(t, true) : 0; };
  const invalido = (o: OpcaoSeparacao) => { const v = valor(o); return !Number.isInteger(v) || v < 0 || v > o.disponivel; };
  const totalItem = (itemId: string) => ops.filter((o) => o.itemId === itemId).reduce((a, o) => a + (invalido(o) ? 0 : valor(o)), 0);
  const disponivelItem = (itemId: string) => ops.filter((o) => o.itemId === itemId).reduce((a, o) => a + o.disponivel, 0);
  const diferente = ops.some((o) => !invalido(o) && valor(o) !== o.sugerido);

  function validar() {
    const e: Record<string, string> = {};
    for (const item of rme!.itens) {
      const lista = ops.filter((o) => o.itemId === item.id);
      if (lista.some(invalido)) e[`item-${item.id}`] = 'Quantidade inválida: inteiro entre 0 e o disponível do fardo.';
      else if (totalItem(item.id) !== item.quantidade) e[`item-${item.id}`] = `Separado ${totalItem(item.id)} de ${item.quantidade}: tem de bater com a quantidade pedida.`;
    }
    if (diferente && !justificativa.trim()) e.justificativa = 'A separação difere da sugestão FIFO: informe a justificativa.';
    return e;
  }

  async function enviar(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validar();
    setErros(e);
    if (Object.keys(e).length) return;
    setEnviando(true);
    setErroGeral(undefined);
    try {
      const r = await servicos.rme.separar(rme!.id, {
        itens: ops.filter((o) => valor(o) > 0).map((o) => ({ itemId: o.itemId, fardoCodigo: o.fardoCodigo, quantidade: valor(o) })),
        justificativa: diferente ? justificativa.trim() : undefined,
      });
      aoConcluir(r);
      aoFechar();
    } catch (err) {
      if (err instanceof ApiError && err.detalhes) setErros(err.detalhes);
      setErroGeral(mensagemSegura(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      titulo={`Separar RME ${rme.numero}`} aberto aoFechar={aoFechar} largo
      rodape={<>
        <button type="button" className="btn btn-sec" onClick={aoFechar} disabled={enviando}>Cancelar</button>
        <button type="submit" form={formId} className="btn btn-pri" disabled={enviando || opcoes.carregando}>{enviando ? 'Enviando…' : 'Registrar separação'}</button>
      </>}
    >
      <form id={formId} onSubmit={enviar} noValidate>
        {erroGeral && <div className="aviso aviso-critico" role="alert">{erroGeral}</div>}
        <p className="mudo">
          Destinatário: <strong>{rme.destinatario}</strong>. A sugestão usa primeiro os fardos abertos, do mais antigo ao mais novo, e depois os fechados pelo lote mais antigo.
          Só aparecem lotes aprovados na inspeção e sem divergência; o que está separado em outra RME fica reservado.
        </p>
        {opcoes.carregando ? <Carregando /> : opcoes.erro ? <div className="aviso aviso-critico" role="alert">{mensagemSegura(opcoes.erro)}</div> : rme.itens.map((item) => {
          const lista = ops.filter((o) => o.itemId === item.id);
          const total = totalItem(item.id);
          const falta = disponivelItem(item.id) < item.quantidade;
          return (
            <fieldset className="bloco-item" key={item.id}>
              <legend className="sr-only">{item.especie} {item.tamanho}</legend>
              <div className="bloco-item-topo">
                <strong><em>{item.especie}</em> · {item.tamanho}</strong>
                <span>Pedido: <strong>{un(item.quantidade)}</strong> · Separado: <strong className={total !== item.quantidade ? 'val-erro' : undefined}>{un(total)}</strong></span>
              </div>
              {falta && <div className="aviso aviso-critico" role="alert">Saldo disponível insuficiente: {un(disponivelItem(item.id))} de {un(item.quantidade)}. A RME não pode ser separada assim; ajuste ou cancele a RME.</div>}
              {lista.length > 0 && (
                <div className="tabela-wrap">
                  <table className="tabela">
                    <thead><tr><th>Fardo</th><th>Lote</th><th>Recebido em</th><th>Estado</th><th>Local</th><th className="al-right">Disponível</th><th className="al-right">Sugerido</th><th className="al-right">Separar</th></tr></thead>
                    <tbody>
                      {lista.map((o) => (
                        <tr key={o.fardoCodigo}>
                          <td>{o.fardoCodigo}</td><td>{o.loteCodigo}</td><td>{data(o.recebidoEm)}</td><td><BadgeDe mapa={ESTADO_FARDO} valor={o.estado} /></td><td>{o.local}</td>
                          <td className="al-right">{un(o.disponivel)}</td><td className="al-right">{o.sugerido ? un(o.sugerido) : '—'}</td>
                          <td className="al-right fardo">
                            <input
                              value={qtd[chave(o)] ?? ''} inputMode="numeric" aria-label={`Separar do fardo ${o.fardoCodigo}`} aria-invalid={invalido(o)}
                              onChange={(e) => setQtd((q) => ({ ...q, [chave(o)]: e.target.value }))}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {erros[`item-${item.id}`] && <span className="erro-campo">{erros[`item-${item.id}`]}</span>}
            </fieldset>
          );
        })}
        {diferente && (
          <>
            <div className="aviso aviso-alerta">A separação está diferente da sugestão FIFO. <button type="button" className="btn btn-sec btn-peq" onClick={() => setQtd(sugestao(ops))}>Restaurar sugestão</button></div>
            <div className="campo">
              <label htmlFor={`${formId}-just`}>Justificativa<span className="obrig" aria-hidden="true"> *</span></label>
              <textarea id={`${formId}-just`} rows={3} maxLength={500} value={justificativa} aria-invalid={!!erros.justificativa} onChange={(e) => setJustificativa(e.target.value)} />
              {erros.justificativa && <span className="erro-campo">{erros.justificativa}</span>}
            </div>
          </>
        )}
      </form>
    </Modal>
  );
}
