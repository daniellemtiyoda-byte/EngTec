import { useEffect, useId, useRef, useState } from 'react';
import { ESTADO_FARDO } from '../dominio/rotulos';
import { useAsync } from '../hooks/useAsync';
import { servicos } from '../services';
import { ApiError, mensagemSegura } from '../services/http';
import type { OpcaoSeparacao, Rme } from '../types/models';
import { seqPeca } from '../utils/busca';
import { data, paraNumero, un } from '../utils/format';
import { Badge, BadgeDe } from './Badge';
import { Contador } from './Contador';
import { Carregando } from './Estados';
import { Modal } from './Modal';
import { ProgressoPassos } from './Passos';

const PASSOS = ['Separar', 'Revisar e confirmar'];
const chave = (o: { itemId: string; fardoCodigo: string }) => `${o.itemId}|${o.fardoCodigo}`;
const sugestao = (ops: OpcaoSeparacao[]) => Object.fromEntries(ops.map((o) => [chave(o), o.dormentesSugeridos]));

interface Props { rme: Rme | null; aoFechar: () => void; aoConcluir: (r: Rme) => void }

/**
 * Separação (RF18/RF19, regras 4 e 7) em 2 passos: 1. dormentes de cada fardo, já marcados com a sugestão
 * (abertos primeiro, depois fechados por FIFO de lote; dentro do fardo, as primeiras sequências livres); 2. revisão do que
 * sai de cada fardo, com justificativa obrigatória se fardos ou quantidades diferirem da sugestão. Trocar só as peças dentro
 * do fardo não pede justificativa. A quantidade separada de cada item tem de bater com a pedida.
 */
export function SeparacaoModal({ rme, aoFechar, aoConcluir }: Props) {
  const formId = useId();
  const topo = useRef<HTMLDivElement>(null);
  const opcoes = useAsync(() => (rme ? servicos.rme.opcoesSeparacao(rme.id) : Promise.resolve([])), [rme?.id]);
  const [passo, setPasso] = useState(0);
  const [sel, setSel] = useState<Record<string, string[]>>({});
  const [justificativa, setJustificativa] = useState('');
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string>();
  const [enviando, setEnviando] = useState(false);

  const ops = opcoes.dados ?? [];
  useEffect(() => { setSel(sugestao(ops)); setPasso(0); setJustificativa(''); setErros({}); setErroGeral(undefined); }, [opcoes.dados]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { topo.current?.scrollIntoView({ block: 'start' }); }, [passo]);

  if (!rme) return null;
  const pecas = (o: OpcaoSeparacao) => sel[chave(o)] ?? [];
  const valor = (o: OpcaoSeparacao) => pecas(o).length;
  const invalido = (o: OpcaoSeparacao) => valor(o) > o.disponivel;
  // Contador: mais peças entram pela ordem da sequência; menos tiram as últimas marcadas.
  const mudarQuantidade = (o: OpcaoSeparacao, texto: string) => {
    const n = Math.max(0, Math.min(o.disponivel, paraNumero(texto, true) || 0));
    setSel((x) => {
      const atuais = x[chave(o)] ?? [];
      const proximas = o.dormentesDisponiveis.filter((d) => !atuais.includes(d));
      return { ...x, [chave(o)]: n >= atuais.length ? [...atuais, ...proximas.slice(0, n - atuais.length)] : atuais.slice(0, n) };
    });
  };
  const alternar = (o: OpcaoSeparacao, d: string) => setSel((x) => {
    const atuais = x[chave(o)] ?? [];
    return { ...x, [chave(o)]: atuais.includes(d) ? atuais.filter((y) => y !== d) : [...atuais, d] };
  });
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
        itens: ops.filter((o) => valor(o) > 0).map((o) => ({ itemId: o.itemId, fardoCodigo: o.fardoCodigo, quantidade: valor(o), dormentes: pecas(o) })),
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
              Para <strong>{rme.destinatario}</strong>. A sugestão já vem marcada: fardos abertos primeiro, do mais antigo ao mais novo, depois os fechados pelo lote mais antigo.
              Toque nos números para marcar as peças que saem de verdade (são as etiquetas dos dormentes). Só aparecem fardos aprovados
              e sem divergência; o que está separado em outra RME fica reservado.
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
                        <Contador valor={String(valor(o))} aoMudar={(v) => mudarQuantidade(o, v)} rotulo={`Separar do fardo ${o.fardoCodigo}`} min={0} max={o.disponivel} invalido={invalido(o)} />
                        <div className="pecas" role="group" aria-label={`Dormentes do fardo ${o.fardoCodigo}`}>
                          {o.dormentesDisponiveis.map((d) => (
                            <button key={d} type="button" className="peca" aria-pressed={pecas(o).includes(d)} title={d} onClick={() => alternar(o, d)}>{seqPeca(d)}</button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  {erros[`item-${item.id}`] && <span className="erro-campo">{erros[`item-${item.id}`]}</span>}
                </fieldset>
              );
            })}
            {diferente && <div className="aviso aviso-alerta">Separação diferente da sugestão FIFO: será pedida uma justificativa. <button type="button" className="btn btn-sec btn-peq" onClick={() => setSel(sugestao(ops))}>Restaurar sugestão</button></div>}
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
                      <strong>{o.fardoCodigo}</strong>: retirar {un(valor(o))} ({pecas(o).map(seqPeca).join(', ')}) · {sobra > 0 ? `sobram ${un(sobra)} (fardo fica aberto)` : 'o fardo fica sem saldo disponível'}
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
