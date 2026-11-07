import { useEffect, useState } from 'react';
import { useAsync } from '../hooks/useAsync';
import type { Cadastros } from '../hooks/useCadastros';
import { servicos } from '../services';
import { ApiError, mensagemSegura } from '../services/http';
import type { Rme } from '../types/models';
import { dataSP, somarDias } from '../dominio/parametros';
import { numero, paraNumero } from '../utils/format';
import { Contador } from './Contador';
import { Modal } from './Modal';

interface Linha { chave: number; item: string; quantidade: string }
let seq = 1;

interface Props { aberto: boolean; cad: Cadastros; aoFechar: () => void; aoCriar: (r: Rme) => void }

/**
 * Nova RME (seção 9.17 do plano), pelo requisitante: destino (obra ou trecho), data de necessidade e itens (espécie +
 * tamanho com o disponível visível). Pedir mais que o disponível é permitido, com aviso: a separação só fecha quando
 * houver estoque para a quantidade inteira.
 */
export function NovaRme({ aberto, cad, aoFechar, aoCriar }: Props) {
  const saldo = useAsync(() => (aberto ? servicos.estoque.porItem({ pageSize: 500 }) : Promise.resolve(undefined)), [aberto]);
  const [destino, setDestino] = useState('');
  const [necessidadeEm, setNecessidadeEm] = useState('');
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string>();
  const [enviando, setEnviando] = useState(false);
  const itens = saldo.dados?.items ?? [];
  const hoje = dataSP(new Date());

  useEffect(() => {
    if (!aberto) return;
    setDestino(''); setNecessidadeEm(somarDias(hoje, 7)); setLinhas([{ chave: seq++, item: '', quantidade: '' }]); setErros({}); setErroGeral(undefined);
  }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps

  const mudar = (chave: number, campo: 'item' | 'quantidade', v: string) => setLinhas((l) => l.map((x) => (x.chave === chave ? { ...x, [campo]: v } : x)));

  async function enviar() {
    const e: Record<string, string> = {};
    if (!destino.trim()) e.destino = 'Informe a obra ou o trecho.';
    if (!necessidadeEm) e.necessidadeEm = 'Informe a data de necessidade.';
    else if (necessidadeEm < hoje) e.necessidadeEm = 'A data de necessidade já passou.';
    const usados = new Set<string>();
    linhas.forEach((l, n) => {
      if (!l.item) e[`itens.${n}`] = 'Escolha a espécie e o tamanho.';
      else if (usados.has(l.item)) e[`itens.${n}`] = 'Item repetido: some as quantidades numa linha.';
      else if (!(paraNumero(l.quantidade, true) > 0)) e[`itens.${n}`] = 'Quantidade em unidades, maior que zero.';
      usados.add(l.item);
    });
    if (!linhas.length) e.itens = 'Inclua ao menos um item.';
    setErros(e); setErroGeral(undefined);
    if (Object.keys(e).length) return;
    setEnviando(true);
    try {
      const r = await servicos.rme.abrir({
        destino: destino.trim(), necessidadeEm,
        itens: linhas.map((l) => { const [especieId, tamanhoId] = l.item.split('|'); return { especieId, tamanhoId, quantidade: paraNumero(l.quantidade, true) }; }),
      });
      aoCriar(r);
    } catch (err) {
      if (err instanceof ApiError && err.detalhes) setErros(err.detalhes);
      setErroGeral(mensagemSegura(err));
    } finally { setEnviando(false); }
  }

  const erro = (k: string) => erros[k] && <span className="erro-campo" role="alert">{erros[k]}</span>;

  return (
    <Modal
      largo titulo="Nova RME" aberto={aberto} aoFechar={aoFechar}
      rodape={<>
        <button type="button" className="btn btn-sec" onClick={aoFechar} disabled={enviando}>Cancelar</button>
        <button type="button" className="btn btn-pri" onClick={() => void enviar()} disabled={enviando}>{enviando ? 'Abrindo…' : 'Abrir RME'}</button>
      </>}
    >
      {erroGeral && <div className="aviso aviso-critico" role="alert">{erroGeral}</div>}
      <div className="linha-campos-2">
        <div className="campo">
          <label htmlFor="rme-destino">Destino (obra ou trecho)<span className="obrig" aria-hidden="true"> *</span></label>
          <input id="rme-destino" value={destino} maxLength={120} onChange={(e) => setDestino(e.target.value)} placeholder="Ex.: Linha 10 · km 32 a 34" />
          {erro('destino')}
        </div>
        <div className="campo">
          <label htmlFor="rme-data">Necessidade em<span className="obrig" aria-hidden="true"> *</span></label>
          <input id="rme-data" type="date" min={hoje} value={necessidadeEm} onChange={(e) => setNecessidadeEm(e.target.value)} />
          {erro('necessidadeEm')}
        </div>
      </div>
      <fieldset className="secao-formulario">
        <legend>Itens</legend>
        {erro('itens')}
        <ul className="itens-rme">
          {linhas.map((l, n) => {
            const s = itens.find((x) => x.id === l.item);
            const q = paraNumero(l.quantidade, true) || 0;
            return (
              <li key={l.chave}>
                <div className="campo">
                  <label htmlFor={`rme-item-${l.chave}`}>Espécie e tamanho</label>
                  <select id={`rme-item-${l.chave}`} value={l.item} onChange={(e) => mudar(l.chave, 'item', e.target.value)}>
                    <option value="">Selecione…</option>
                    {itens.map((x) => <option key={x.id} value={x.id}>{cad.descreverItem(x)} · {numero(x.emEstoque)} disponíveis</option>)}
                  </select>
                </div>
                <div className="campo">
                  <span className="rotulo-campo">Quantidade</span>
                  <Contador rotulo={`Item ${n + 1}: quantidade`} valor={l.quantidade || '0'} min={0} max={9999} aoMudar={(v) => mudar(l.chave, 'quantidade', v)} />
                </div>
                {s && <span className={q > s.emEstoque ? 'texto-critico' : 'mudo'}>Disponível: {numero(s.emEstoque)}{q > s.emEstoque && ' · acima do disponível: a separação só fecha quando houver estoque'}</span>}
                {erro(`itens.${n}`)}
                {linhas.length > 1 && <button type="button" className="btn btn-sec btn-peq" onClick={() => setLinhas((x) => x.filter((y) => y.chave !== l.chave))}>Remover item</button>}
              </li>
            );
          })}
        </ul>
        <button type="button" className="btn btn-sec btn-peq" onClick={() => setLinhas((x) => [...x, { chave: seq++, item: '', quantidade: '' }])}>+ Item</button>
      </fieldset>
    </Modal>
  );
}
