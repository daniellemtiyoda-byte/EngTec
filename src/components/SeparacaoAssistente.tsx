import { useEffect, useMemo, useState } from 'react';
import type { CodigoLido } from '../dominio/identificacao';
import { classeInferior, classeSugerida } from '../dominio/parametros';
import { ordinalClasse, TIPO_DESTINO } from '../dominio/rotulos';
import type { Cadastros } from '../hooks/useCadastros';
import { servicos } from '../services';
import { ApiError, mensagemSegura } from '../services/http';
import type { Rme, SugestaoSeparacao } from '../types/models';
import { dias, numero } from '../utils/format';
import { Badge } from './Badge';
import { Carregando, Vazio } from './Estados';
import { Icone } from './Icone';
import { LeitorQr, type RetornoLeitura } from './LeitorQr';
import { Modal } from './Modal';
import { ProgressoPassos } from './Passos';

const PASSOS = ['Sugestão', 'Leitura dos dormentes', 'Revisar e confirmar'];

/** Onde está cada dormente disponível para esta RME: fardo, item da RME e se está na sugestão. */
interface Origem { fardoId: string; item: number; sugerido: boolean }

interface Props { aberto: boolean; rme: Rme; cad: Cadastros; aoFechar: () => void; aoSeparar: (r: Rme) => void }

/**
 * Separação da RME (seções 9.17 e 11.1 do plano), tela de campo: 1) a sugestão de fardos (abertos primeiro, depois os
 * mais antigos); 2) a leitura dos QR dos dormentes (cada leitura risca o dormente e avisa na hora quando ele não está
 * na sugestão) ou do QR do fardo para "fardo inteiro"; marcar à mão também; 3) a revisão, com a quantidade de cada
 * item batendo com a pedida e a justificativa por fardo que difere da sugestão. A separação reserva os dormentes.
 */
export function SeparacaoAssistente({ aberto, rme, cad, aoFechar, aoSeparar }: Props) {
  const [passo, setPasso] = useState(0);
  const [sugestao, setSugestao] = useState<SugestaoSeparacao>();
  const [erroCarga, setErroCarga] = useState<string>();
  const [lidos, setLidos] = useState<Record<string, Origem>>({});
  const [lendo, setLendo] = useState(false);
  const [justificativas, setJustificativas] = useState<Record<string, string>>({});
  const [justClasse, setJustClasse] = useState<Record<string, string>>({});
  const sugerida = classeSugerida(rme.tipoDestino);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string>();
  const [enviando, setEnviando] = useState(false);

  async function carregar() {
    setErroCarga(undefined); setSugestao(undefined);
    try { setSugestao(await servicos.rme.sugerirSeparacao(rme.numero)); } catch (e) { setErroCarga(mensagemSegura(e)); }
  }

  useEffect(() => {
    if (!aberto) return;
    setPasso(0); setLidos({}); setJustificativas({}); setJustClasse({}); setErros({}); setErroGeral(undefined);
    void carregar();
  }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Dormentes disponíveis para a RME (dos fardos candidatos de cada item), para validar a leitura na hora. */
  const indice = useMemo(() => {
    const m = new Map<string, Origem>();
    sugestao?.itens.forEach((it, item) => {
      const sugeridos = new Set(it.fardos.flatMap((f) => f.dormentesIds));
      for (const f of it.candidatos) for (const id of f.dormentesIds) m.set(id, { fardoId: f.fardoId, item, sugerido: sugeridos.has(id) });
    });
    return m;
  }, [sugestao]);

  const porItem = (item: number) => Object.values(lidos).filter((o) => o.item === item).length;
  const descricao = (item: number) => (sugestao ? cad.descreverItemRme(sugestao.itens[item]) : '');

  function marcar(id: string, origem: Origem) { setLidos((l) => ({ ...l, [id]: origem })); }
  function desmarcar(id: string) { setLidos((l) => { const n = { ...l }; delete n[id]; return n; }); }

  /** Leitura contínua: dormente (risca na lista) ou fardo (fardo inteiro). */
  function aoLer(c: CodigoLido): RetornoLeitura {
    if (!sugestao) return { ok: false, mensagem: 'Aguarde a sugestão carregar.' };
    if (c.tipo === 'fardo') {
      const it = sugestao.itens.findIndex((x) => x.candidatos.some((f) => f.fardoId === c.id));
      if (it < 0) return { ok: false, mensagem: `O fardo ${c.id} não tem dormentes disponíveis para esta RME.` };
      const livres = sugestao.itens[it].candidatos.find((f) => f.fardoId === c.id)!.dormentesIds.filter((id) => !lidos[id]);
      const faltam = sugestao.itens[it].quantidade - porItem(it);
      if (!livres.length) return { ok: false, mensagem: `O fardo ${c.id} já está todo separado.` };
      if (livres.length > faltam) return { ok: false, mensagem: `O fardo ${c.id} tem ${livres.length} disponíveis e faltam ${faltam} neste item: leia os dormentes um a um.` };
      setLidos((l) => ({ ...l, ...Object.fromEntries(livres.map((id) => [id, indice.get(id)!])) }));
      const sugerido = sugestao.itens[it].fardos.some((f) => f.fardoId === c.id);
      return sugerido
        ? { ok: true, mensagem: `Fardo inteiro ${c.id}: ${livres.length} dormentes separados.` }
        : { ok: true, alerta: true, mensagem: `Fardo ${c.id} não está na sugestão: ${livres.length} dormentes entram como troca de fardo (pede justificativa).` };
    }
    if (c.tipo !== 'dormente') return { ok: false, mensagem: 'Leia o QR da plaquinha do dormente (ou o do fardo, para o fardo inteiro).' };
    if (lidos[c.id]) return { ok: false, mensagem: `${c.id} já foi lido.` };
    const o = indice.get(c.id);
    if (!o) return { ok: false, mensagem: `${c.id} não está disponível para esta RME: é de outro item, já está reservado ou não está em estoque. Deixe-o no fardo.` };
    const it = sugestao.itens[o.item];
    if (porItem(o.item) >= it.quantidade) return { ok: false, mensagem: `${descricao(o.item)} já tem ${it.quantidade} de ${it.quantidade}. Deixe ${c.id} no fardo.` };
    marcar(c.id, o);
    if (o.sugerido) return { ok: true, mensagem: `${c.id} separado (${porItem(o.item) + 1} de ${it.quantidade}).` };
    const fardoSugerido = it.fardos.some((f) => f.fardoId === o.fardoId);
    return {
      ok: true, alerta: true,
      mensagem: `${c.id} não está na sugestão${fardoSugerido ? ', mas é do mesmo fardo: troca sem justificativa.' : ` (fardo ${o.fardoId}): troca de fardo, pede justificativa.`}`,
    };
  }

  /** Separação por fardo, como vai para o serviço, com o que mudou em relação à sugestão. */
  const linhas = useMemo(() => {
    const porFardo = new Map<string, string[]>();
    for (const [id, o] of Object.entries(lidos)) porFardo.set(o.fardoId, [...(porFardo.get(o.fardoId) ?? []), id]);
    const sugeridos = new Map((sugestao?.itens ?? []).flatMap((i) => i.fardos).map((f) => [f.fardoId, f.dormentesIds.length]));
    // Classe do fardo (a do item a que ele pertence) abaixo da sugerida para o tipo de destino: pede justificativa.
    const itemDo = new Map(Object.values(lidos).map((o) => [o.fardoId, o.item]));
    return [...porFardo].map(([fardoId, ids]) => {
      const classe = sugestao?.itens[itemDo.get(fardoId) ?? 0]?.classe ?? 1;
      return { fardoId, dormentesIds: ids.sort(), seguiu: sugeridos.get(fardoId) === ids.length, sugeridos: sugeridos.get(fardoId) ?? 0, classe, abaixo: classeInferior(classe, sugerida) };
    });
  }, [lidos, sugestao, sugerida]);

  async function avancar() {
    setErroGeral(undefined);
    if (passo === 0) {
      if (sugestao?.itens.some((i) => i.faltam > 0)) { setErroGeral('Não há disponível para atender todos os itens: a separação precisa da quantidade inteira.'); return; }
      try { if (rme.situacao === 'aberta') await servicos.rme.iniciarSeparacao(rme.numero); } catch (e) { setErroGeral(mensagemSegura(e)); return; }
    }
    if (passo === 1) {
      const falta = sugestao?.itens.findIndex((it, n) => porItem(n) !== it.quantidade) ?? -1;
      if (falta >= 0) { setErroGeral(`${descricao(falta)}: separados ${porItem(falta)} de ${sugestao!.itens[falta].quantidade}. A quantidade tem de bater com a pedida.`); return; }
    }
    setPasso((p) => p + 1);
  }

  async function confirmar() {
    const e: Record<string, string> = {};
    linhas.forEach((l) => {
      if (!l.seguiu && !justificativas[l.fardoId]?.trim()) e[l.fardoId] = 'O fardo difere da sugestão: informe a justificativa.';
      if (l.abaixo && !justClasse[l.fardoId]?.trim()) e[`classe-${l.fardoId}`] = `Classe abaixo da ${ordinalClasse(sugerida)} sugerida para o destino: informe a justificativa.`;
    });
    setErros(e); setErroGeral(undefined);
    if (Object.keys(e).length) return;
    setEnviando(true);
    try {
      const r = await servicos.rme.separar(rme.numero, linhas.map((l) => ({
        fardoId: l.fardoId, dormentesIds: l.dormentesIds, justificativa: l.seguiu ? undefined : justificativas[l.fardoId], justificativaClasse: l.abaixo ? justClasse[l.fardoId] : undefined,
      })));
      aoSeparar(r);
    } catch (err) {
      if (err instanceof ApiError && err.detalhes) {
        const porFardo: Record<string, string> = {};
        for (const [k, v] of Object.entries(err.detalhes)) { const n = /^separacao\.(\d+)$/.exec(k); if (n && linhas[Number(n[1])]) porFardo[linhas[Number(n[1])].fardoId] = v; }
        setErros(porFardo);
      }
      setErroGeral(mensagemSegura(err));
    } finally { setEnviando(false); }
  }

  /** O que separar, por item e por fardo; também aparece embaixo da câmera. */
  const lista = sugestao && (
    <div className="separacao-lista">
      {sugestao.itens.map((it, n) => {
        const fora = Object.entries(lidos).filter(([, o]) => o.item === n && !o.sugerido);
        return (
          <section key={n} className="separacao-item">
            <h3 className="separacao-item-titulo">{descricao(n)} <span className={porItem(n) === it.quantidade ? 'texto-ok' : ''}>{porItem(n)} de {it.quantidade}</span></h3>
            {it.fardos.map((f) => {
              const inteiro = it.candidatos.find((x) => x.fardoId === f.fardoId)?.dormentesIds.length === f.dormentesIds.length;
              return (
                <div key={f.fardoId} className="separacao-fardo">
                  <p className="separacao-fardo-titulo">
                    <span className="mono">{f.fardoId}</span> · {cad.codigoLocal(f.localId)}
                    {f.aberto && <Badge tom="cinza">Aberto</Badge>}
                    {inteiro && <Badge tom="azul">fardo inteiro</Badge>}
                  </p>
                  <ul className="separacao-dormentes">
                    {f.dormentesIds.map((id) => (
                      <li key={id} className={lidos[id] ? 'lido' : undefined}>
                        <label className="caixa"><input type="checkbox" checked={!!lidos[id]} onChange={() => (lidos[id] ? desmarcar(id) : porItem(n) < it.quantidade && marcar(id, indice.get(id)!))} /> <span className="mono">{id.slice(-6)}</span></label>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            {fora.length > 0 && (
              <div className="separacao-fora">
                <p><Badge tom="laranja">Fora da sugestão</Badge></p>
                <ul className="lista-simples">
                  {fora.map(([id, o]) => (
                    <li key={id}><span className="mono">{id}</span> <span className="mudo">fardo {o.fardoId}</span> <button type="button" className="btn btn-link" onClick={() => desmarcar(id)}>Tirar</button></li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );

  return (
    <>
      <Modal
        largo titulo={`Separar ${rme.numero}`} aberto={aberto && !lendo} aoFechar={aoFechar}
        rodape={<>
          {passo > 0 ? <button type="button" className="btn btn-sec" onClick={() => setPasso((p) => p - 1)} disabled={enviando}>Voltar</button>
            : <button type="button" className="btn btn-sec" onClick={aoFechar}>Cancelar</button>}
          {passo < 2
            ? <button type="button" className="btn btn-pri" onClick={() => void avancar()} disabled={!sugestao}>{passo === 0 ? 'Começar a separação' : 'Avançar'}</button>
            : <button type="button" className="btn btn-pri" onClick={() => void confirmar()} disabled={enviando}>{enviando ? 'Reservando…' : 'Confirmar separação'}</button>}
        </>}
      >
        <ProgressoPassos passos={PASSOS} atual={passo} />
        {erroGeral && <div className="aviso aviso-critico" role="alert">{erroGeral}</div>}
        {erroCarga && <div className="aviso aviso-critico" role="alert">{erroCarga} <button type="button" className="btn btn-sec btn-peq" onClick={() => void carregar()}>Tentar de novo</button></div>}
        {!sugestao && !erroCarga && <Carregando linhas={3} />}

        {passo === 0 && sugestao && (
          <div className="assistente-passo">
            <p>Destino: <strong>{rme.destino}</strong> ({TIPO_DESTINO[rme.tipoDestino][1]}, classe mínima sugerida {ordinalClasse(sugerida)}). Fardos abertos primeiro, depois os mais antigos; só dormentes disponíveis (fora da cura).</p>
            {sugestao.itens.map((it, n) => (
              <section key={n} className="separacao-item">
                <h3 className="separacao-item-titulo">{descricao(n)} · {numero(it.quantidade)} dormentes</h3>
                {it.fardos.length === 0 ? <Vazio mensagem="Nenhum fardo com disponível para este item." /> : (
                  <ul className="lista-simples">
                    {it.fardos.map((f) => (
                      <li key={f.fardoId}>
                        <span className="mono">{f.fardoId}</span> · {cad.codigoLocal(f.localId)} · tirar <strong>{numero(f.dormentesIds.length)}</strong>
                        {f.aberto && <> <Badge tom="cinza">Aberto</Badge></>}
                        {f.idadeDias !== undefined && <span className="mudo"> · {dias(f.idadeDias)}</span>}
                      </li>
                    ))}
                  </ul>
                )}
                {it.faltam > 0 && <p className="texto-critico">Faltam {numero(it.faltam)} no estoque disponível para este item.</p>}
              </section>
            ))}
          </div>
        )}

        {passo === 1 && sugestao && (
          <div className="assistente-passo">
            <button type="button" className="btn btn-acao btn-grande botao-ler" onClick={() => setLendo(true)}><Icone nome="qr" /> Ler QR dos dormentes</button>
            <p className="mudo">Cada leitura risca o dormente. O QR do fardo separa o fardo inteiro. Também dá para marcar à mão.</p>
            {lista}
          </div>
        )}

        {passo === 2 && sugestao && (
          <div className="assistente-passo">
            <ul className="resumo-conclusao">
              {sugestao.itens.map((it, n) => <li key={n}><Badge tom="verde">{porItem(n)} de {it.quantidade}</Badge> {descricao(n)}</li>)}
            </ul>
            {linhas.map((l) => (
              <div key={l.fardoId} className="separacao-fardo">
                <p className="separacao-fardo-titulo">
                  <span className="mono">{l.fardoId}</span> · {numero(l.dormentesIds.length)} dormente(s)
                  {l.seguiu ? <Badge tom="verde">como a sugestão</Badge> : <Badge tom="laranja">{l.sugeridos ? `sugestão: ${l.sugeridos}` : 'fora da sugestão'}</Badge>}
                </p>
                {!l.seguiu && (
                  <div className="campo">
                    <label htmlFor={`sep-just-${l.fardoId}`}>Justificativa<span className="obrig" aria-hidden="true"> *</span></label>
                    <textarea id={`sep-just-${l.fardoId}`} rows={2} maxLength={300} value={justificativas[l.fardoId] ?? ''} onChange={(e) => setJustificativas((j) => ({ ...j, [l.fardoId]: e.target.value }))} placeholder="Ex.: fardo sugerido no fundo da pilha" />
                    {erros[l.fardoId] && <span className="erro-campo" role="alert">{erros[l.fardoId]}</span>}
                  </div>
                )}
                {l.abaixo && (
                  <div className="campo">
                    <label htmlFor={`sep-cls-${l.fardoId}`}>Justificativa da classe ({ordinalClasse(l.classe)}, abaixo da {ordinalClasse(sugerida)} sugerida para {TIPO_DESTINO[rme.tipoDestino][1].toLowerCase()})<span className="obrig" aria-hidden="true"> *</span></label>
                    <textarea id={`sep-cls-${l.fardoId}`} rows={2} maxLength={300} value={justClasse[l.fardoId] ?? ''} onChange={(e) => setJustClasse((j) => ({ ...j, [l.fardoId]: e.target.value }))} placeholder="Ex.: sem 1ª classe disponível; liberado pela engenharia" />
                    {erros[`classe-${l.fardoId}`] && <span className="erro-campo" role="alert">{erros[`classe-${l.fardoId}`]}</span>}
                  </div>
                )}
              </div>
            ))}
            <p className="mudo">Ao confirmar, os dormentes ficam reservados para a {rme.numero} (continuam no fardo, fora do disponível) e a RME fica pronta para a entrega.</p>
          </div>
        )}
      </Modal>
      <LeitorQr aberto={lendo} aoFechar={() => setLendo(false)} modo="capturar" continuo aoLer={aoLer} titulo={`Separar ${rme.numero}`}>
        {lista}
      </LeitorQr>
    </>
  );
}
