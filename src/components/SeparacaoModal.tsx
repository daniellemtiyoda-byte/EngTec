import { useEffect, useId, useRef, useState } from 'react';
import { ESTADO_FARDO } from '../dominio/rotulos';
import { useAsync } from '../hooks/useAsync';
import { servicos } from '../services';
import { ApiError, mensagemSegura } from '../services/http';
import type { OpcaoSeparacao, Rme } from '../types/models';
import { data, paraNumero, un } from '../utils/format';
import { Badge, BadgeDe } from './Badge';
import { Contador } from './Contador';
import { Carregando } from './Estados';
import { Modal } from './Modal';
import { ProgressoPassos } from './Passos';

const PASSOS = ['Separar', 'Revisar e confirmar'];
const chave = (o: { itemId: string; fardoCodigo: string }) => `${o.itemId}|${o.fardoCodigo}`;
const sugestao = (ops: OpcaoSeparacao[]) => Object.fromEntries(ops.map((o) => [chave(o), String(o.sugerido)]));

interface Props { rme: Rme | null; aoFechar: () => void; aoConcluir: (r: Rme) => void }

/**
 * Separação (RF18/RF19, regras 4 e 7) em 2 passos: 1. quantidade de cada fardo, já preenchida com a sugestão
 * (abertos primeiro, depois fechados por FIFO de lote); 2. revisão do que sai de cada fardo, com justificativa
 * obrigatória se a escolha diferir da sugestão. A quantidade separada de cada item tem de bater com a pedida.
 */
export function SeparacaoModal({ rme, aoFechar, aoConcluir }: Props) {
  const formId = useId();
  const topo = useRef<HTMLDivElement>(null);
  const opcoes = useAsync(() => (rme ? servicos.rme.opcoesSeparacao(rme.id) : Promise.resolve([])), [rme?.id]);
  const [passo, setPasso] = useState(0);
  const [qtd, setQtd] = useState<Record<string, string>>({});
  const [justificativa, setJustificativa] = useState('');
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string>();
  const [enviando, setEnviando] = useState(false);

  const ops = opcoes.dados ?? [];
  useEffect(() => { setQtd(sugestao(ops)); setPasso(0); setJustificativa(''); setErros({}); setErroGeral(undefined); }, [opcoes.dados]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { topo.current?.scrollIntoView({ block: 'start' }); }, [passo]);

  if (!rme) return null;
  const valor = (o: OpcaoSeparacao) => { const t = (qtd[chave(o)] ?? '').trim(); return t ? paraNumero(t, true) : 0; };
  const invalido = (o: OpcaoSeparacao) => { const v = valor(o); return !Number.isInteger(v) || v < 0 || v > o.disponivel; };
  const totalItem = (itemId: string) => ops.filter((o) => o.itemId === itemId).reduce((a, o) => a + (invalido(o) ? 0 : valor(o)), 0);
  const disponivelItem = (itemId: string) => ops.filter((o) => o.itemId === itemId).reduce((a, o) => a + o.disponivel, 0);
  const diferente = ops.some((o) => !invalido(o) && valor(o) !== o.sugerido);

  function validarPasso(p: number) {
    const e: Record<string, string> = {};
    if (p === 0) {
      for (const item of rme!.itens) {
        const lista = ops.filter((o) => o.itemId === item.id);
        if (lista.some(invalido)) e[`item-${item.id}`] = 'Quantidade inválida: inteiro entre 0 e o disponível do fardo.';
        else if (totalItem(item.id) !== item.quantidade) e[`item-${item.id}`] = `Separado ${totalItem(item.id)} de ${item.quantidade}: tem de bater com a quantidade pedida.`;
      }
    }
    if (p === 1 && diferente && !justificativa.trim()) e.justificativa = 'A separação difere da sugestão FIFO: informe a justificativa.';
    return e;
  }

  async function avancar(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validarPasso(passo);
    setErros(e);
    if (Object.keys(e).length) return;
    if (passo === 0) { setPasso(1); return; }
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
      if (err instanceof ApiError && err.detalhes) {
        setErros(err.detalhes);
        if (Object.keys(err.detalhes).some((k) => k.startsWith('item-'))) setPasso(0);
      }
      setErroGeral(mensagemSegura(err));
    } finally {
      setEnviando(false);
    }
  }

  const escolhidos = ops.filter((o) => !invalido(o) && valor(o) > 0);
  return (
    <Modal
      titulo={`Separar RME ${rme.numero}`} aberto aoFechar={aoFechar} largo
      rodape={<>
        {passo === 0
          ? <button type="button" className="btn btn-sec" onClick={aoFechar} disabled={enviando}>Cancelar</button>
          : <button type="button" className="btn btn-sec" onClick={() => setPasso(0)} disabled={enviando}>Voltar</button>}
        <button type="submit" form={formId} className="btn btn-pri" disabled={enviando || opcoes.carregando}>
          {enviando ? 'Enviando…' : passo === 0 ? 'Próximo' : 'Registrar separação'}
        </button>
      </>}
    >
      <div ref={topo} />
      <ProgressoPassos passos={PASSOS} atual={passo} />
      <form id={formId} onSubmit={(e) => void avancar(e)} noValidate>
        {erroGeral && <div className="aviso aviso-critico" role="alert">{erroGeral}</div>}

        {passo === 0 && (
          <>
            <p className="mudo">
              Para <strong>{rme.destinatario}</strong>. A sugestão já vem preenchida: fardos abertos primeiro, do mais antigo ao mais novo, depois os fechados pelo lote mais antigo.
              Só aparecem lotes aprovados e sem divergência; o que está separado em outra RME fica reservado.
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
                    <div className="total-item">
                      <span>Pedido <strong>{un(item.quantidade)}</strong></span>
                      <span>Separado <strong className={total !== item.quantidade ? 'val-erro' : undefined}>{un(total)}</strong></span>
                    </div>
                  </div>
                  {falta && <div className="aviso aviso-critico" role="alert">Saldo disponível insuficiente: {un(disponivelItem(item.id))} de {un(item.quantidade)}. A RME não pode ser separada assim; ajuste ou cancele a RME.</div>}
                  <div className="lista-fardos">
                    {lista.map((o) => (
                      <div key={o.fardoCodigo} className={`fardo-opcao${o.sugerido ? ' sugerido' : ''}`}>
                        <div>
                          <div className="cartao-topo"><strong>{o.fardoCodigo}</strong><BadgeDe mapa={ESTADO_FARDO} valor={o.estado} />{o.sugerido > 0 && <Badge tom="verde">Sugerido: {o.sugerido}</Badge>}</div>
                          <div className="mudo">Recebido em {data(o.recebidoEm)} · {o.local} · disponível {un(o.disponivel)}</div>
                        </div>
                        <Contador valor={qtd[chave(o)] ?? '0'} aoMudar={(v) => setQtd((q) => ({ ...q, [chave(o)]: v }))} rotulo={`Separar do fardo ${o.fardoCodigo}`} min={0} max={o.disponivel} invalido={invalido(o)} />
                      </div>
                    ))}
                  </div>
                  {erros[`item-${item.id}`] && <span className="erro-campo">{erros[`item-${item.id}`]}</span>}
                </fieldset>
              );
            })}
            {diferente && <div className="aviso aviso-alerta">Separação diferente da sugestão FIFO: será pedida uma justificativa. <button type="button" className="btn btn-sec btn-peq" onClick={() => setQtd(sugestao(ops))}>Restaurar sugestão</button></div>}
          </>
        )}

        {passo === 1 && (
          <>
            <div className="resumo">
              <h3>Separar {un(escolhidos.reduce((a, o) => a + valor(o), 0))} de {escolhidos.length} fardo(s) para {rme.destinatario}</h3>
              <ul>
                {escolhidos.map((o) => {
                  const sobra = o.disponivel - valor(o);
                  return (
                    <li key={chave(o)}>
                      <strong>{o.fardoCodigo}</strong>: retirar {un(valor(o))} · {sobra > 0 ? `sobram ${un(sobra)} (fardo fica aberto)` : 'o fardo fica sem saldo disponível'}
                    </li>
                  );
                })}
              </ul>
              <p className="mudo">Os fardos ficam reservados para esta RME. A baixa só acontece na entrega, depois da conferência do supervisor.</p>
            </div>
            {diferente ? (
              <>
                <div className="aviso aviso-alerta">A escolha é diferente da sugestão FIFO e fica registrada.</div>
                <div className="campo">
                  <label htmlFor={`${formId}-just`}>Justificativa<span className="obrig" aria-hidden="true"> *</span></label>
                  <textarea id={`${formId}-just`} rows={3} maxLength={500} value={justificativa} aria-invalid={!!erros.justificativa} onChange={(e) => setJustificativa(e.target.value)} />
                  {erros.justificativa && <span className="erro-campo">{erros.justificativa}</span>}
                </div>
              </>
            ) : <p><Badge tom="verde">Segue a sugestão FIFO</Badge></p>}
          </>
        )}
      </form>
    </Modal>
  );
}
