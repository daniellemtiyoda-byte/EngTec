import { useEffect, useState } from 'react';
import { useAsync } from '../hooks/useAsync';
import type { Cadastros } from '../hooks/useCadastros';
import { servicos } from '../services';
import { ApiError, mensagemSegura } from '../services/erros';
import type { Categoria, Classe, Rme, TipoDestino } from '../types/models';
import { CATEGORIAS, TIPO_DESTINO_OPCOES } from '../dominio/opcoes';
import { ordinalClasse, USO_TAMANHO } from '../dominio/rotulos';
import { classeInferior, classeSugerida, dataSP, somarDias } from '../dominio/parametros';
import { numero, paraNumero } from '../utils/format';
import { Contador } from './Contador';
import { Modal } from './Modal';

/** `item`: `<classe>|<tamanhoId>` (o item de estoque); categoria e espécie opcionais. */
interface Linha { chave: number; item: string; categoria: string; especieId: string; quantidade: string }
let seq = 1;

interface Props { aberto: boolean; cad: Cadastros; aoFechar: () => void; aoCriar: (r: Rme) => void }

/**
 * Nova RME (seção 9.17 do plano), pelo requisitante: destino (obra ou trecho) e o tipo de destino, que sugere a classe
 * mínima (1ª para linha principal de tráfego pesado; 2ª aceita nos demais), data de necessidade e itens por tamanho
 * e classe (obrigatórios), com o disponível visível; categoria mínima (padrão: qualquer aprovado) e espécie opcionais.
 * Pedir mais que o disponível é permitido, com aviso: a separação só fecha quando houver estoque para a quantidade inteira.
 */
export function NovaRme({ aberto, cad, aoFechar, aoCriar }: Props) {
  const saldo = useAsync(() => (aberto ? servicos.estoque.porItem({ pageSize: 500 }) : Promise.resolve(undefined)), [aberto]);
  const [destino, setDestino] = useState('');
  const [tipoDestino, setTipoDestino] = useState<TipoDestino | ''>('');
  const [necessidadeEm, setNecessidadeEm] = useState('');
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string>();
  const [enviando, setEnviando] = useState(false);
  const itens = saldo.dados?.items ?? [];
  const sugerida = tipoDestino ? classeSugerida(tipoDestino) : undefined;
  const hoje = dataSP(new Date());

  useEffect(() => {
    if (!aberto) return;
    setDestino(''); setTipoDestino(''); setNecessidadeEm(somarDias(hoje, 7)); setLinhas([nova()]); setErros({}); setErroGeral(undefined);
  }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps

  const nova = (): Linha => ({ chave: seq++, item: '', categoria: '', especieId: '', quantidade: '' });
  const mudar = (chave: number, campo: 'item' | 'categoria' | 'especieId' | 'quantidade', v: string) => setLinhas((l) => l.map((x) => (x.chave === chave ? { ...x, [campo]: v } : x)));

  async function enviar() {
    const e: Record<string, string> = {};
    if (!destino.trim()) e.destino = 'Informe a obra ou o trecho.';
    if (!tipoDestino) e.tipoDestino = 'Escolha o tipo de destino.';
    if (!necessidadeEm) e.necessidadeEm = 'Informe a data de necessidade.';
    else if (necessidadeEm < hoje) e.necessidadeEm = 'A data de necessidade já passou.';
    const usados = new Set<string>();
    linhas.forEach((l, n) => {
      if (!l.item) e[`itens.${n}`] = 'Escolha o tamanho e a classe.';
      else if (usados.has(l.item)) e[`itens.${n}`] = 'Tamanho e classe repetidos: some as quantidades numa linha.';
      else if (!(paraNumero(l.quantidade, true) > 0)) e[`itens.${n}`] = 'Quantidade em unidades, maior que zero.';
      usados.add(l.item);
    });
    if (!linhas.length) e.itens = 'Inclua ao menos um item.';
    setErros(e); setErroGeral(undefined);
    if (Object.keys(e).length) return;
    setEnviando(true);
    try {
      const r = await servicos.rme.abrir({
        destino: destino.trim(), tipoDestino: tipoDestino as TipoDestino, necessidadeEm,
        itens: linhas.map((l) => {
          const [classe, tamanhoId] = l.item.split('|');
          return {
            tamanhoId, classe: Number(classe) as Classe, quantidade: paraNumero(l.quantidade, true),
            categoriaMinima: l.categoria ? (Number(l.categoria) as Categoria) : undefined, especieId: l.especieId || undefined,
          };
        }),
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
          <label htmlFor="rme-tipo">Tipo de destino<span className="obrig" aria-hidden="true"> *</span></label>
          <select id="rme-tipo" value={tipoDestino} onChange={(e) => setTipoDestino(e.target.value as TipoDestino)}>
            <option value="">Selecione…</option>
            {TIPO_DESTINO_OPCOES.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
          </select>
          {sugerida && <span className="ajuda">Classe mínima sugerida: {ordinalClasse(sugerida)} {sugerida === 1 ? '(tráfego pesado)' : '(2ª aceita; 1ª também serve)'}.</span>}
          {erro('tipoDestino')}
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
            const abaixo = !!s && !!sugerida && classeInferior(s.classe, sugerida);
            return (
              <li key={l.chave}>
                <div className="campo">
                  <label htmlFor={`rme-item-${l.chave}`}>Tamanho e classe</label>
                  <select id={`rme-item-${l.chave}`} value={l.item} onChange={(e) => mudar(l.chave, 'item', e.target.value)}>
                    <option value="">Selecione…</option>
                    {itens.map((x) => <option key={x.id} value={x.id}>{cad.descreverItem(x)} · {USO_TAMANHO[x.uso][1]} · {numero(x.emEstoque)} disponíveis{x.emCura ? ` · ${numero(x.emCura)} em cura` : ''}</option>)}
                  </select>
                  {abaixo && <span className="texto-critico">Classe abaixo da {ordinalClasse(sugerida!)} sugerida para este destino: a separação vai pedir justificativa.</span>}
                </div>
                <div className="linha-campos-2">
                  <div className="campo">
                    <label htmlFor={`rme-cat-${l.chave}`}>Categoria mínima</label>
                    <select id={`rme-cat-${l.chave}`} value={l.categoria} onChange={(e) => mudar(l.chave, 'categoria', e.target.value)}>
                      <option value="">Qualquer aprovado</option>
                      {CATEGORIAS.map((c) => <option key={c} value={c}>{c === 1 ? 'Só categoria 1' : `Até a categoria ${c}`}</option>)}
                    </select>
                  </div>
                  <div className="campo">
                    <label htmlFor={`rme-esp-${l.chave}`}>Espécie</label>
                    <select id={`rme-esp-${l.chave}`} value={l.especieId} onChange={(e) => mudar(l.chave, 'especieId', e.target.value)}>
                      <option value="">Qualquer espécie</option>
                      {(s?.especies ?? []).map((x) => <option key={x.especieId} value={x.especieId}>{cad.nomeEspecie(x.especieId)} · {numero(x.emEstoque)} disponíveis</option>)}
                    </select>
                  </div>
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
        <button type="button" className="btn btn-sec btn-peq" onClick={() => setLinhas((x) => [...x, nova()])}>+ Item</button>
      </fieldset>
    </Modal>
  );
}
