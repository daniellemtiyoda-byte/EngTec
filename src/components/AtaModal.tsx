import { useEffect, useId, useState } from 'react';
import { RE_ATA } from '../dominio/identificacao';
import { REGRAS_ATA_PADRAO, VIGENCIA_ATA_MESES, dataSP, somarDias, somarMeses } from '../dominio/parametros';
import type { Cadastros } from '../hooks/useCadastros';
import { servicos } from '../services';
import type { DadosAtualizacaoAta } from '../services/contracts';
import { ApiError, mensagemSegura } from '../services/erros';
import type { Ata } from '../types/models';
import { data, numero, paraNumero } from '../utils/format';
import { Modal } from './Modal';

interface Props {
  aberto: boolean;
  /** Ausente: nova ata. Presente: edição (só enquanto a ata não tem contrato). */
  ata?: Ata;
  cad: Cadastros;
  aoFechar: () => void;
  aoSalvar: (a: Ata) => void;
}

interface LinhaItem { chave: number; tamanhoId: string; quantidade: string }

let proximaChave = 1;
const itemVazio = (): LinhaItem => ({ chave: proximaChave++, tamanhoId: '', quantidade: '' });
/**
 * Janelas de entrega como uma condição de pagamento: N parcelas, a 1ª até o dia P da assinatura e as seguintes a cada
 * I dias (AR00224: 6 parcelas, a 1ª em 90 dias e depois a cada 30).
 */
function janelasDoCronograma(parcelas: number, primeira: number, intervalo: number): [number, number][] {
  return Array.from({ length: parcelas }, (_, n) => (n === 0 ? [0, primeira] : [primeira + (n - 1) * intervalo + 1, primeira + n * intervalo]));
}
/** Caminho de volta para a edição: lê a 1ª janela e o intervalo da 2ª. */
const cronogramaDe = (prazos: [number, number][]) => ({
  parcelas: String(prazos.length), primeira: String(prazos[0]?.[1] ?? 90), intervalo: String(prazos[1] ? prazos[1][1] - prazos[1][0] + 1 : 30),
});
const fimSugerido = (inicio: string) => (inicio ? somarDias(somarMeses(inicio, VIGENCIA_ATA_MESES), -1) : '');

/**
 * Nova ata e edição: fornecedor, vigência, regras de fornecimento e os itens registrados, todos próprios da ata. As
 * regras da AR00224 vêm só como sugestão na ata nova. A edição fica liberada até o primeiro contrato da ata, que é
 * quando as regras passam a valer; o serviço valida tudo de novo.
 */
export function AtaModal({ aberto, ata, cad, aoFechar, aoSalvar }: Props) {
  const formId = useId();
  const editando = !!ata;
  const [numeroAta, setNumero] = useState('');
  const [fornecedorId, setFornecedor] = useState('');
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [fimManual, setFimManual] = useState(false);
  const [regras, setRegras] = useState({ pedidoMinimo: '', parcelaMinima: '', parcelaMaxima: '' });
  const [cronograma, setCronograma] = useState({ parcelas: '', primeira: '', intervalo: '' });
  const [itens, setItens] = useState<LinhaItem[]>([itemVazio()]);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string>();
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setErros({}); setErroGeral(undefined);
    const base = ata?.regras ?? REGRAS_ATA_PADRAO;
    setRegras({ pedidoMinimo: String(base.pedidoMinimo), parcelaMinima: String(base.parcelaMinima), parcelaMaxima: String(base.parcelaMaxima) });
    setCronograma(cronogramaDe(base.prazosParcelas.slice(0, base.maxParcelas)));
    if (ata) {
      setNumero(ata.numero); setFornecedor(ata.fornecedorId); setInicio(ata.vigenciaInicio); setFim(ata.vigenciaFim); setFimManual(true);
      setItens(ata.itens.length ? ata.itens.map((i) => ({ chave: proximaChave++, tamanhoId: i.tamanhoId, quantidade: String(i.quantidade) })) : [itemVazio()]);
    } else {
      const hoje = dataSP(new Date());
      setNumero(''); setFornecedor(''); setInicio(hoje); setFim(fimSugerido(hoje)); setFimManual(false); setItens([itemVazio()]);
    }
  }, [aberto, ata]);

  const listas = cad.listas;
  const liberado = (id: string) => { const f = cad.fornecedores.get(id); return !!f && f.situacao === 'ativo' && !f.bloqueado; };
  const tamanhos = (listas?.tamanhos ?? []).filter((t) => t.ativo || itens.some((i) => i.tamanhoId === t.id));
  const totalRegistrado = itens.reduce((t, i) => t + (paraNumero(i.quantidade, true) || 0), 0);

  const mudarInicio = (v: string) => { setInicio(v); if (!fimManual) setFim(fimSugerido(v)); };
  const mudarItem = (chave: number, campo: 'tamanhoId' | 'quantidade', valor: string) => setItens((l) => l.map((i) => (i.chave === chave ? { ...i, [campo]: valor } : i)));
  const nParcelas = paraNumero(cronograma.parcelas, true);
  const primeira = paraNumero(cronograma.primeira, true);
  const intervalo = paraNumero(cronograma.intervalo, true);
  const cronogramaValido = nParcelas >= 1 && nParcelas <= 12 && primeira >= 1 && (nParcelas === 1 || intervalo >= 1);
  const janelas = cronogramaValido ? janelasDoCronograma(nParcelas, primeira, nParcelas === 1 ? 0 : intervalo) : [];

  function validar(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!editando && !RE_ATA.test(numeroAta.trim().toUpperCase())) e.numero = 'Número no formato AA00000 (ex. AR00224).';
    if (!fornecedorId) e.fornecedorId = 'Escolha o fornecedor.';
    if (!inicio) e.vigenciaInicio = 'Informe o início da vigência.';
    if (!fim) e.vigenciaFim = 'Informe o fim da vigência.';
    else if (inicio && fim <= inicio) e.vigenciaFim = 'O fim vem depois do início.';
    const n = (k: keyof typeof regras) => paraNumero(regras[k], true);
    if (!(n('pedidoMinimo') > 0)) e['regras.pedidoMinimo'] = 'Pedido mínimo em dormentes, maior que zero.';
    if (!(n('parcelaMinima') > 0)) e['regras.parcelaMinima'] = 'Parcela mínima em dormentes, maior que zero.';
    if (!(n('parcelaMaxima') > 0) || n('parcelaMaxima') < n('parcelaMinima')) e['regras.parcelaMaxima'] = 'A parcela máxima não pode ser menor que a mínima.';
    if (!(nParcelas >= 1 && nParcelas <= 12)) e['cronograma.parcelas'] = 'De 1 a 12 parcelas.';
    if (!(primeira >= 1)) e['cronograma.primeira'] = 'Em dias da assinatura, maior que zero.';
    if (nParcelas > 1 && !(intervalo >= 1)) e['cronograma.intervalo'] = 'Em dias, maior que zero.';
    if (!itens.length) e.itens = 'Registre ao menos um tamanho com a quantidade.';
    const vistos = new Set<string>();
    itens.forEach((i, k) => {
      if (!i.tamanhoId) e[`itens.${k}`] = 'Escolha o tamanho.';
      else if (vistos.has(i.tamanhoId)) e[`itens.${k}`] = 'Tamanho repetido.';
      else if (!(paraNumero(i.quantidade, true) > 0)) e[`itens.${k}`] = 'Quantidade em unidades, maior que zero.';
      vistos.add(i.tamanhoId);
    });
    return e;
  }

  async function enviar(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validar();
    setErros(e);
    setErroGeral(undefined);
    if (Object.keys(e).length) return;
    const dados: DadosAtualizacaoAta = {
      fornecedorId, vigenciaInicio: inicio, vigenciaFim: fim,
      regras: {
        pedidoMinimo: paraNumero(regras.pedidoMinimo, true), parcelaMinima: paraNumero(regras.parcelaMinima, true), parcelaMaxima: paraNumero(regras.parcelaMaxima, true),
        maxParcelas: janelas.length, prazosParcelas: janelas,
      },
      itens: itens.map((i) => ({ tamanhoId: i.tamanhoId, quantidade: paraNumero(i.quantidade, true) })),
    };
    setEnviando(true);
    try {
      const salva = ata ? await servicos.atas.atualizar(ata.numero, dados) : await servicos.atas.criar({ ...dados, numero: numeroAta.trim().toUpperCase() });
      aoSalvar(salva);
    } catch (err) {
      // Erro nas janelas (do serviço) volta para os campos do cronograma.
      if (err instanceof ApiError && err.detalhes) setErros(Object.fromEntries(Object.entries(err.detalhes).map(([k, v]) => [k.startsWith('regras.prazosParcelas') || k === 'regras.maxParcelas' ? 'cronograma.parcelas' : k, v])));
      setErroGeral(mensagemSegura(err));
    } finally {
      setEnviando(false);
    }
  }

  const erro = (k: string) => erros[k] && <span className="erro-campo" id={`${formId}-${k}-erro`}>{erros[k]}</span>;
  const invalido = (k: string) => ({ 'aria-invalid': !!erros[k], 'aria-describedby': erros[k] ? `${formId}-${k}-erro` : undefined });
  const campoRegra = (k: keyof typeof regras, rotulo: string, ajuda?: string) => (
    <div className="campo">
      <label htmlFor={`${formId}-${k}`}>{rotulo}<span className="obrig" aria-hidden="true"> *</span></label>
      <input id={`${formId}-${k}`} value={regras[k]} inputMode="numeric" maxLength={6} onChange={(e) => setRegras((r) => ({ ...r, [k]: e.target.value }))} {...invalido(`regras.${k}`)} />
      {ajuda && <span className="ajuda">{ajuda}</span>}
      {erro(`regras.${k}`)}
    </div>
  );

  return (
    <Modal
      largo titulo={ata ? `Editar ata ${ata.numero}` : 'Nova ata'} aberto={aberto} aoFechar={aoFechar}
      rodape={<>
        <button type="button" className="btn btn-sec" onClick={aoFechar} disabled={enviando}>Cancelar</button>
        <button type="submit" form={formId} className="btn btn-pri" disabled={enviando}>{enviando ? 'Salvando…' : ata ? 'Salvar' : 'Cadastrar ata'}</button>
      </>}
    >
      <form id={formId} onSubmit={enviar} noValidate>
        {erroGeral && <div className="aviso aviso-critico" role="alert">{erroGeral}</div>}
        <p className="ajuda">Regras, vigência e itens podem ser corrigidos até o primeiro contrato da ata. Depois dele, ficam travados.</p>

        <fieldset className="secao-formulario">
          <legend>Ata de registro de preços</legend>
          <div className="linha-campos-2">
            <div className="campo">
              <label htmlFor={`${formId}-numero`}>Número da ata<span className="obrig" aria-hidden="true"> *</span></label>
              <input id={`${formId}-numero`} className="mono" value={numeroAta} maxLength={7} placeholder="AR00224" disabled={editando} onChange={(e) => setNumero(e.target.value)} {...invalido('numero')} />
              {editando && <span className="ajuda">O número não muda: os contratos começam por ele.</span>}
              {erro('numero')}
            </div>
            <div className="campo">
              <label htmlFor={`${formId}-forn`}>Fornecedor<span className="obrig" aria-hidden="true"> *</span></label>
              <select id={`${formId}-forn`} value={fornecedorId} onChange={(e) => setFornecedor(e.target.value)} {...invalido('fornecedorId')}>
                <option value="">Selecione…</option>
                {(listas?.fornecedores ?? []).filter((f) => liberado(f.id) || f.id === fornecedorId).map((f) => <option key={f.id} value={f.id}>{f.razaoSocial}</option>)}
              </select>
              <span className="ajuda">Fornecedor inativo ou com CTF vencido não aparece.</span>
              {erro('fornecedorId')}
            </div>
            <div className="campo">
              <label htmlFor={`${formId}-ini`}>Início da vigência<span className="obrig" aria-hidden="true"> *</span></label>
              <input id={`${formId}-ini`} type="date" value={inicio} onChange={(e) => mudarInicio(e.target.value)} {...invalido('vigenciaInicio')} />
              {erro('vigenciaInicio')}
            </div>
            <div className="campo">
              <label htmlFor={`${formId}-fim`}>Fim da vigência<span className="obrig" aria-hidden="true"> *</span></label>
              <input id={`${formId}-fim`} type="date" value={fim} onChange={(e) => { setFim(e.target.value); setFimManual(true); }} {...invalido('vigenciaFim')} />
              <span className="ajuda">Sugestão: {VIGENCIA_ATA_MESES} meses a partir do início{inicio ? ` (até ${data(fimSugerido(inicio))})` : ''}.</span>
              {erro('vigenciaFim')}
            </div>
          </div>
        </fieldset>

        <fieldset className="secao-formulario">
          <legend>Itens registrados</legend>
          <p className="ajuda">Cada tamanho que a ata registra, com a quantidade. É o teto dos contratos: nenhum contrato passa do saldo de cada item.</p>
          {itens.map((i, k) => (
            <div key={i.chave} className="parcela-item">
              <div className="campo">
                <label htmlFor={`${formId}-${i.chave}-tam`}>Tamanho</label>
                <select id={`${formId}-${i.chave}-tam`} value={i.tamanhoId} onChange={(e) => mudarItem(i.chave, 'tamanhoId', e.target.value)} {...invalido(`itens.${k}`)}>
                  <option value="">Selecione…</option>
                  {tamanhos.map((t) => <option key={t.id} value={t.id}>{cad.descreverTamanho(t.id)}</option>)}
                </select>
              </div>
              <div className="campo">
                <label htmlFor={`${formId}-${i.chave}-qtd`}>Quantidade registrada</label>
                <input id={`${formId}-${i.chave}-qtd`} value={i.quantidade} inputMode="numeric" maxLength={6} onChange={(e) => mudarItem(i.chave, 'quantidade', e.target.value)} />
              </div>
              {itens.length > 1 && <button type="button" className="btn btn-sec btn-peq" onClick={() => setItens((l) => l.filter((x) => x.chave !== i.chave))} aria-label={`Remover o ${k + 1}º tamanho`}>Remover</button>}
              {erro(`itens.${k}`)}
            </div>
          ))}
          <div className="parcela-rodape">
            <button type="button" className="btn btn-sec btn-peq" onClick={() => setItens((l) => [...l, itemVazio()])}>+ Tamanho</button>
            <span className="mudo">Total registrado: <strong>{numero(totalRegistrado)}</strong> dormentes</span>
          </div>
          {erro('itens')}
        </fieldset>

        <fieldset className="secao-formulario">
          <legend>Regras de fornecimento</legend>
          <p className="ajuda">Valem para todos os contratos desta ata.{!editando && ' Os valores sugeridos são os da ata AR00224.'}</p>
          <div className="linha-campos-2">
            {campoRegra('pedidoMinimo', 'Pedido mínimo por contrato', 'Em dormentes, somando todos os tamanhos.')}
            {campoRegra('parcelaMinima', 'Mínimo por parcela')}
            {campoRegra('parcelaMaxima', 'Máximo por parcela')}
          </div>
          <p className="ajuda">Prazos de entrega, como uma condição de pagamento: contados da assinatura de cada contrato.</p>
          <div className="linha-campos-2">
            <div className="campo">
              <label htmlFor={`${formId}-nparc`}>Número de parcelas<span className="obrig" aria-hidden="true"> *</span></label>
              <input id={`${formId}-nparc`} value={cronograma.parcelas} inputMode="numeric" maxLength={2} onChange={(e) => setCronograma((c) => ({ ...c, parcelas: e.target.value }))} {...invalido('cronograma.parcelas')} />
              <span className="ajuda">Máximo de parcelas por contrato.</span>
              {erro('cronograma.parcelas')}
            </div>
            <div className="campo">
              <label htmlFor={`${formId}-prim`}>1ª parcela até o dia<span className="obrig" aria-hidden="true"> *</span></label>
              <input id={`${formId}-prim`} value={cronograma.primeira} inputMode="numeric" maxLength={4} onChange={(e) => setCronograma((c) => ({ ...c, primeira: e.target.value }))} {...invalido('cronograma.primeira')} />
              {erro('cronograma.primeira')}
            </div>
            <div className="campo">
              <label htmlFor={`${formId}-int`}>Demais parcelas a cada (dias)<span className="obrig" aria-hidden="true"> *</span></label>
              <input id={`${formId}-int`} value={cronograma.intervalo} inputMode="numeric" maxLength={4} disabled={nParcelas === 1} onChange={(e) => setCronograma((c) => ({ ...c, intervalo: e.target.value }))} {...invalido('cronograma.intervalo')} />
              {erro('cronograma.intervalo')}
            </div>
          </div>
          {janelas.length > 0 && (
            <p className="mudo" role="status">
              {janelas.map(([de, ate], n) => `${n + 1}ª ${n === 0 ? `até o dia ${ate}` : `do dia ${de} ao ${ate}`}`).join(' · ')}
            </p>
          )}
        </fieldset>
      </form>
    </Modal>
  );
}
