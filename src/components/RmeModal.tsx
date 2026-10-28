import { useEffect, useId, useState } from 'react';
import { URGENCIA_OPCOES } from '../dominio/opcoes';
import { useAsync } from '../hooks/useAsync';
import { servicos } from '../services';
import { ApiError, mensagemSegura } from '../services/http';
import type { Rme, UrgenciaRme } from '../types/models';
import { paraNumero, rotuloClasse } from '../utils/format';
import { Modal } from './Modal';

interface ItemForm { chave: number; especieId: string; tamanhoId: string; quantidade: string }
let proximaChave = 1;
const itemVazio = (): ItemForm => ({ chave: proximaChave++, especieId: '', tamanhoId: '', quantidade: '' });
const hoje = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const VAZIO = { destinatario: '', urgencia: 'normal', dataLimite: '', observacao: '' };

interface Props { aberto: boolean; aoFechar: () => void; aoSalvar: (r: Rme) => void }

/** Abertura de RME (RF16): destinatário, urgência, data limite e vários itens (espécie, tamanho, quantidade). */
export function RmeModal({ aberto, aoFechar, aoSalvar }: Props) {
  const formId = useId();
  const esp = useAsync(() => servicos.especies.listar({ pageSize: 100, sortBy: 'numero' }), []);
  const tam = useAsync(() => servicos.tamanhos.listar({ pageSize: 50, sortBy: 'codigo' }), []);
  const [campos, setCampos] = useState(VAZIO);
  const [itens, setItens] = useState<ItemForm[]>([]);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string>();
  const [enviando, setEnviando] = useState(false);

  useEffect(() => { if (aberto) { setCampos(VAZIO); setItens([itemVazio()]); setErros({}); setErroGeral(undefined); } }, [aberto]);

  const campo = (nome: keyof typeof VAZIO) => ({
    id: `${formId}-${nome}`, value: campos[nome], 'aria-invalid': !!erros[nome],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setCampos((c) => ({ ...c, [nome]: e.target.value })),
  });
  const alterarItem = (chave: number, m: Partial<ItemForm>) => setItens((l) => l.map((i) => (i.chave === chave ? { ...i, ...m } : i)));
  const erro = (k: string) => erros[k] && <span className="erro-campo">{erros[k]}</span>;

  function validar() {
    const e: Record<string, string> = {};
    if (!campos.destinatario.trim()) e.destinatario = 'Campo obrigatório.';
    if (!campos.dataLimite) e.dataLimite = 'Campo obrigatório.';
    else if (campos.dataLimite < hoje()) e.dataLimite = 'A data limite não pode estar no passado.';
    if (!itens.length) e.itens = 'Informe ao menos um item.';
    const vistos = new Set<string>();
    for (const it of itens) {
      if (!it.especieId) e[`item-${it.chave}-especieId`] = 'Selecione a espécie.';
      if (!it.tamanhoId) e[`item-${it.chave}-tamanhoId`] = 'Selecione o tamanho.';
      const q = paraNumero(it.quantidade, true);
      if (!Number.isInteger(q) || q < 1) e[`item-${it.chave}-quantidade`] = 'Quantidade inteira, mínimo 1.';
      const k = `${it.especieId}|${it.tamanhoId}`;
      if (it.especieId && it.tamanhoId && vistos.has(k)) e[`item-${it.chave}-especieId`] = 'Item repetido: some as quantidades no item anterior.';
      vistos.add(k);
    }
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
      const r = await servicos.rme.abrir({
        destinatario: campos.destinatario.trim(), urgencia: campos.urgencia as UrgenciaRme, dataLimite: campos.dataLimite, observacao: campos.observacao.trim() || undefined,
        itens: itens.map((it) => ({ especieId: it.especieId, tamanhoId: it.tamanhoId, quantidade: paraNumero(it.quantidade, true) })),
      });
      aoSalvar(r);
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
      titulo="Abrir RME" aberto={aberto} aoFechar={aoFechar} largo
      rodape={<>
        <button type="button" className="btn btn-sec" onClick={aoFechar} disabled={enviando}>Cancelar</button>
        <button type="submit" form={formId} className="btn btn-pri" disabled={enviando}>{enviando ? 'Enviando…' : 'Abrir RME'}</button>
      </>}
    >
      <form id={formId} onSubmit={enviar} noValidate>
        {erroGeral && <div className="aviso aviso-critico" role="alert">{erroGeral}</div>}
        {(esp.erro || tam.erro) && <div className="aviso aviso-alerta">Não foi possível carregar espécies ou tamanhos.</div>}
        <div className="campo">
          <label htmlFor={`${formId}-destinatario`}>Destinatário<span className="obrig" aria-hidden="true"> *</span></label>
          <input {...campo('destinatario')} maxLength={120} autoComplete="off" />
          <span className="ajuda">Setor ou obra que vai receber os dormentes. O requisitante é você (usuário logado).</span>{erro('destinatario')}
        </div>
        <div className="linha-campos">
          <div className="campo">
            <label htmlFor={`${formId}-urgencia`}>Urgência<span className="obrig" aria-hidden="true"> *</span></label>
            <select {...campo('urgencia')}>{URGENCIA_OPCOES.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}</select>
          </div>
          <div className="campo">
            <label htmlFor={`${formId}-dataLimite`}>Data limite<span className="obrig" aria-hidden="true"> *</span></label>
            <input {...campo('dataLimite')} type="date" min={hoje()} />{erro('dataLimite')}
          </div>
        </div>
        <div className="campo">
          <label htmlFor={`${formId}-observacao`}>Observação</label>
          <textarea {...campo('observacao')} rows={2} maxLength={500} />
        </div>

        <h3>Itens</h3>
        {erro('itens')}
        {itens.map((it, n) => (
          <div className="bloco-item" key={it.chave}>
            <div className="bloco-item-topo">
              <strong>Item {n + 1}</strong>
              {itens.length > 1 && <button type="button" className="btn btn-sec btn-peq" onClick={() => setItens((l) => l.filter((x) => x.chave !== it.chave))}>Remover item</button>}
            </div>
            <div className="linha-campos">
              <div className="campo">
                <label htmlFor={`${formId}-e${it.chave}`}>Espécie<span className="obrig" aria-hidden="true"> *</span></label>
                <select id={`${formId}-e${it.chave}`} value={it.especieId} aria-invalid={!!erros[`item-${it.chave}-especieId`]} onChange={(e) => alterarItem(it.chave, { especieId: e.target.value })}>
                  <option value="">Selecione…</option>
                  {esp.dados?.items.map((e) => <option key={e.id} value={e.id}>{e.nomeCientifico} · {rotuloClasse(e.classe)}</option>)}
                </select>{erro(`item-${it.chave}-especieId`)}
              </div>
              <div className="campo">
                <label htmlFor={`${formId}-t${it.chave}`}>Tamanho<span className="obrig" aria-hidden="true"> *</span></label>
                <select id={`${formId}-t${it.chave}`} value={it.tamanhoId} aria-invalid={!!erros[`item-${it.chave}-tamanhoId`]} onChange={(e) => alterarItem(it.chave, { tamanhoId: e.target.value })}>
                  <option value="">Selecione…</option>
                  {tam.dados?.items.map((t) => <option key={t.id} value={t.id}>{t.codigo} ({t.larguraCm}×{t.alturaCm}×{t.comprimentoCm} cm)</option>)}
                </select>{erro(`item-${it.chave}-tamanhoId`)}
              </div>
              <div className="campo">
                <label htmlFor={`${formId}-q${it.chave}`}>Quantidade (un.)<span className="obrig" aria-hidden="true"> *</span></label>
                <input id={`${formId}-q${it.chave}`} value={it.quantidade} inputMode="numeric" aria-invalid={!!erros[`item-${it.chave}-quantidade`]} onChange={(e) => alterarItem(it.chave, { quantidade: e.target.value })} />
                {erro(`item-${it.chave}-quantidade`)}
              </div>
            </div>
          </div>
        ))}
        <div><button type="button" className="btn btn-sec" onClick={() => setItens((l) => [...l, itemVazio()])}>Adicionar item</button></div>
      </form>
    </Modal>
  );
}
