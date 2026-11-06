import { useEffect, useId, useState } from 'react';
import { RE_ATA, RE_CONTRATO } from '../dominio/identificacao';
import { UNIDADE_ITEM_OPCOES } from '../dominio/opcoes';
import { unidadesDeM3 } from '../dominio/parametros';
import type { Cadastros } from '../hooks/useCadastros';
import { servicos } from '../services';
import type { DadosItemContrato } from '../services/contracts';
import { ApiError, mensagemSegura } from '../services/http';
import type { Contrato } from '../types/models';
import { m3, numero, paraNumero } from '../utils/format';
import { Modal } from './Modal';

interface LinhaItem { chave: number; id?: string; especieId: string; tamanhoId: string; tratamentoId: string; quantidade: string; unidade: 'un' | 'm3'; minimo?: number }

interface Props {
  aberto: boolean;
  /** Ausente: novo contrato. Presente: edição (empresa inspetora, quantidades e itens novos). */
  contrato?: Contrato;
  cad: Cadastros;
  aoFechar: () => void;
  aoSalvar: (c: Contrato) => void;
}

let proximaChave = 1;
const linhaVazia = (): LinhaItem => ({ chave: proximaChave++, especieId: '', tamanhoId: '', tratamentoId: '', quantidade: '', unidade: 'un' });

/**
 * Novo contrato e edição (seção 9.3 do plano). O fornecedor vem da ata (escolhida ou criada aqui) e só aparecem as
 * espécies que ele fornece; fornecedor inativo ou com CTF vencido não entra. Item em m³ é convertido em unidades pelo
 * volume do tamanho, arredondando para baixo: a tela mostra a conversão e o serviço grava em unidades.
 */
export function ContratoModal({ aberto, contrato, cad, aoFechar, aoSalvar }: Props) {
  const formId = useId();
  const editando = !!contrato;
  const [modoAta, setModoAta] = useState<'existente' | 'nova'>('existente');
  const [ataId, setAtaId] = useState('');
  const [novaAta, setNovaAta] = useState({ numero: '', fornecedorId: '', vigenciaInicio: '', vigenciaFim: '' });
  const [numeroContrato, setNumero] = useState('');
  const [empresaInspetora, setEmpresa] = useState('');
  const [ano, setAno] = useState(String(new Date().getFullYear()));
  const [itens, setItens] = useState<LinhaItem[]>([linhaVazia()]);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string>();
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setErros({}); setErroGeral(undefined); setModoAta('existente'); setNovaAta({ numero: '', fornecedorId: '', vigenciaInicio: '', vigenciaFim: '' });
    if (contrato) {
      setAtaId(contrato.ataId); setNumero(contrato.numero); setEmpresa(contrato.empresaInspetora); setAno(String(contrato.ano));
      setItens(contrato.itens.map((i) => ({
        chave: proximaChave++, id: i.id, especieId: i.especieId, tamanhoId: i.tamanhoId, tratamentoId: i.tratamentoId,
        quantidade: String(i.quantidade), unidade: 'un', minimo: i.emitidos - i.reprovados,
      })));
    } else {
      setAtaId(''); setNumero(''); setEmpresa(''); setAno(String(new Date().getFullYear())); setItens([linhaVazia()]);
    }
  }, [aberto, contrato]);

  const listas = cad.listas;
  const liberado = (fornecedorId: string) => { const f = cad.fornecedores.get(fornecedorId); return !!f && f.situacao === 'ativo' && !f.bloqueado; };
  const fornecedorId = modoAta === 'nova' ? novaAta.fornecedorId : cad.atas.get(ataId)?.fornecedorId ?? '';
  const fornecedor = cad.fornecedores.get(fornecedorId);
  const numeroAta = modoAta === 'nova' ? novaAta.numero.trim().toUpperCase() : cad.atas.get(ataId)?.numero ?? '';
  const especiesDoFornecedor = (listas?.especies ?? []).filter((e) => e.ativo && fornecedor?.especiesIds.includes(e.id));

  // Ao escolher a ata, o número do contrato já começa com o dela.
  useEffect(() => {
    if (!editando && numeroAta && (!numeroContrato || !numeroContrato.startsWith(`${numeroAta}-`))) setNumero(`${numeroAta}-`);
  }, [numeroAta]); // eslint-disable-line react-hooks/exhaustive-deps

  const mudarItem = (chave: number, campo: keyof LinhaItem, valor: string) => setItens((l) => l.map((i) => (i.chave === chave ? { ...i, [campo]: valor } : i)));

  /** Prévia da conversão de m³ (o serviço grava o resultado em unidades). */
  function conversao(i: LinhaItem): string | undefined {
    if (i.unidade !== 'm3') return undefined;
    const t = cad.tamanhos.get(i.tamanhoId);
    const v = paraNumero(i.quantidade);
    if (!t || !(v > 0)) return 'Escolha o tamanho e informe o volume: o sistema converte em unidades.';
    return `${m3(v)} ÷ ${m3(t.volumeM3)} por dormente = ${numero(unidadesDeM3(v, t.volumeM3))} dormentes (arredondado para baixo).`;
  }

  function validar(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!editando) {
      if (modoAta === 'existente' && !ataId) e.ataId = 'Escolha a ata.';
      if (modoAta === 'nova') {
        if (!RE_ATA.test(numeroAta)) e['ata.numero'] = 'Número no formato AA00000 (ex. AR00224).';
        if (!novaAta.fornecedorId) e['ata.fornecedorId'] = 'Escolha o fornecedor.';
        if (!novaAta.vigenciaInicio) e['ata.vigenciaInicio'] = 'Informe o início.';
        if (!novaAta.vigenciaFim) e['ata.vigenciaFim'] = 'Informe o fim.';
        else if (novaAta.vigenciaInicio && novaAta.vigenciaFim < novaAta.vigenciaInicio) e['ata.vigenciaFim'] = 'O fim vem depois do início.';
      }
      const n = numeroContrato.trim().toUpperCase();
      if (!RE_CONTRATO.test(n)) e.numero = 'Número no formato AA00000-00 (ex. AR00224-01).';
      else if (numeroAta && !n.startsWith(`${numeroAta}-`)) e.numero = `O contrato começa pelo número da ata (${numeroAta}-).`;
      if (!/^\d{4}$/.test(ano)) e.ano = 'Informe o ano.';
    }
    if (!empresaInspetora.trim()) e.empresaInspetora = 'Informe a empresa inspetora.';
    itens.forEach((i, n) => {
      const q = paraNumero(i.quantidade, i.unidade === 'un');
      if (!i.especieId || !i.tamanhoId || !i.tratamentoId) e[`itens.${n}`] = 'Escolha espécie, tamanho e tratamento.';
      else if (!(q > 0)) e[`itens.${n}`] = i.unidade === 'un' ? 'Quantidade em unidades, maior que zero.' : 'Volume em m³, maior que zero.';
      else if (i.minimo !== undefined && q < i.minimo) e[`itens.${n}`] = `Não pode ficar abaixo do já emitido (${i.minimo}).`;
    });
    if (!itens.length) e.itens = 'Inclua ao menos um item.';
    return e;
  }

  const paraItem = (i: LinhaItem): DadosItemContrato & { id?: string } => ({
    id: i.id, especieId: i.especieId, tamanhoId: i.tamanhoId, tratamentoId: i.tratamentoId, quantidade: paraNumero(i.quantidade, i.unidade === 'un'), unidade: i.unidade,
  });

  async function enviar(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validar();
    setErros(e);
    setErroGeral(undefined);
    if (Object.keys(e).length) return;
    setEnviando(true);
    try {
      let salvo: Contrato;
      if (contrato) {
        salvo = await servicos.contratos.atualizar(contrato.numero, { empresaInspetora, itens: itens.map(paraItem) });
      } else {
        let idAta = ataId;
        if (modoAta === 'nova') {
          try {
            idAta = (await servicos.atas.criar({ ...novaAta, numero: numeroAta })).id;
          } catch (err) {
            // Erros da ata voltam com os nomes dos campos da ata.
            if (err instanceof ApiError && err.detalhes) throw new ApiError(err.status, err.message, Object.fromEntries(Object.entries(err.detalhes).map(([k, v]) => [`ata.${k}`, v])));
            throw err;
          }
          setModoAta('existente'); setAtaId(idAta); cad.recarregar();
        }
        salvo = await servicos.contratos.criar({ numero: numeroContrato.trim().toUpperCase(), ataId: idAta, empresaInspetora, ano: Number(ano), itens: itens.map(paraItem) });
      }
      aoSalvar(salvo);
    } catch (err) {
      if (err instanceof ApiError && err.detalhes) setErros(err.detalhes);
      setErroGeral(mensagemSegura(err));
    } finally {
      setEnviando(false);
    }
  }

  const erro = (k: string) => erros[k] && <span className="erro-campo" id={`${formId}-${k}-erro`}>{erros[k]}</span>;
  const invalido = (k: string) => ({ 'aria-invalid': !!erros[k], 'aria-describedby': erros[k] ? `${formId}-${k}-erro` : undefined });

  return (
    <Modal
      largo titulo={contrato ? `Editar contrato ${contrato.numero}` : 'Novo contrato'} aberto={aberto} aoFechar={aoFechar}
      rodape={<>
        <button type="button" className="btn btn-sec" onClick={aoFechar} disabled={enviando}>Cancelar</button>
        <button type="submit" form={formId} className="btn btn-pri" disabled={enviando}>{enviando ? 'Salvando…' : contrato ? 'Salvar' : 'Criar contrato'}</button>
      </>}
    >
      <form id={formId} onSubmit={enviar} noValidate>
        {erroGeral && <div className="aviso aviso-critico" role="alert">{erroGeral}</div>}

        <fieldset className="secao-formulario">
          <legend>Ata de registro de preços</legend>
          {editando ? (
            <p>Ata {numeroAta} · {fornecedor?.razaoSocial ?? '—'}</p>
          ) : (
            <>
              <div className="opcoes-ata" role="radiogroup" aria-label="Ata">
                <label className="caixa"><input type="radio" name={`${formId}-ata`} checked={modoAta === 'existente'} onChange={() => setModoAta('existente')} /> Ata já cadastrada</label>
                <label className="caixa"><input type="radio" name={`${formId}-ata`} checked={modoAta === 'nova'} onChange={() => setModoAta('nova')} /> Nova ata</label>
              </div>
              {modoAta === 'existente' ? (
                <div className="campo">
                  <label htmlFor={`${formId}-ataId`}>Ata<span className="obrig" aria-hidden="true"> *</span></label>
                  <select id={`${formId}-ataId`} value={ataId} onChange={(e) => setAtaId(e.target.value)} {...invalido('ataId')}>
                    <option value="">Selecione…</option>
                    {(listas?.atas ?? []).map((a) => (
                      <option key={a.id} value={a.id} disabled={!liberado(a.fornecedorId)}>
                        {a.numero} · {cad.nomeFornecedor(a.fornecedorId)}{!liberado(a.fornecedorId) ? ' (fornecedor bloqueado ou inativo)' : ''}
                      </option>
                    ))}
                  </select>
                  {erro('ataId')}
                </div>
              ) : (
                <div className="linha-campos-2">
                  <div className="campo">
                    <label htmlFor={`${formId}-ata-numero`}>Número da ata<span className="obrig" aria-hidden="true"> *</span></label>
                    <input id={`${formId}-ata-numero`} value={novaAta.numero} maxLength={7} placeholder="AR00224" onChange={(e) => setNovaAta((a) => ({ ...a, numero: e.target.value }))} {...invalido('ata.numero')} />
                    {erro('ata.numero')}
                  </div>
                  <div className="campo">
                    <label htmlFor={`${formId}-ata-forn`}>Fornecedor<span className="obrig" aria-hidden="true"> *</span></label>
                    <select id={`${formId}-ata-forn`} value={novaAta.fornecedorId} onChange={(e) => setNovaAta((a) => ({ ...a, fornecedorId: e.target.value }))} {...invalido('ata.fornecedorId')}>
                      <option value="">Selecione…</option>
                      {(listas?.fornecedores ?? []).filter((f) => liberado(f.id)).map((f) => <option key={f.id} value={f.id}>{f.razaoSocial}</option>)}
                    </select>
                    <span className="ajuda">Fornecedor inativo ou com CTF vencido não aparece.</span>
                    {erro('ata.fornecedorId')}
                  </div>
                  <div className="campo">
                    <label htmlFor={`${formId}-ata-ini`}>Início da vigência<span className="obrig" aria-hidden="true"> *</span></label>
                    <input id={`${formId}-ata-ini`} type="date" value={novaAta.vigenciaInicio} onChange={(e) => setNovaAta((a) => ({ ...a, vigenciaInicio: e.target.value }))} {...invalido('ata.vigenciaInicio')} />
                    {erro('ata.vigenciaInicio')}
                  </div>
                  <div className="campo">
                    <label htmlFor={`${formId}-ata-fim`}>Fim da vigência<span className="obrig" aria-hidden="true"> *</span></label>
                    <input id={`${formId}-ata-fim`} type="date" value={novaAta.vigenciaFim} onChange={(e) => setNovaAta((a) => ({ ...a, vigenciaFim: e.target.value }))} {...invalido('ata.vigenciaFim')} />
                    {erro('ata.vigenciaFim')}
                  </div>
                </div>
              )}
              {fornecedor && <p className="mudo">Fornecedor do contrato (vem da ata): <strong>{fornecedor.razaoSocial}</strong></p>}
            </>
          )}
        </fieldset>

        <fieldset className="secao-formulario">
          <legend>Contrato</legend>
          <div className="linha-campos-2">
            <div className="campo">
              <label htmlFor={`${formId}-numero`}>Número do contrato<span className="obrig" aria-hidden="true"> *</span></label>
              <input id={`${formId}-numero`} className="mono" value={numeroContrato} maxLength={10} placeholder="AR00224-01" disabled={editando} onChange={(e) => setNumero(e.target.value)} {...invalido('numero')} />
              {erro('numero')}
            </div>
            <div className="campo">
              <label htmlFor={`${formId}-empresa`}>Empresa inspetora<span className="obrig" aria-hidden="true"> *</span></label>
              <input id={`${formId}-empresa`} value={empresaInspetora} maxLength={80} placeholder="ex.: UFV" onChange={(e) => setEmpresa(e.target.value)} {...invalido('empresaInspetora')} />
              {erro('empresaInspetora')}
            </div>
            <div className="campo">
              <label htmlFor={`${formId}-ano`}>Ano<span className="obrig" aria-hidden="true"> *</span></label>
              <input id={`${formId}-ano`} value={ano} inputMode="numeric" maxLength={4} disabled={editando} onChange={(e) => setAno(e.target.value)} {...invalido('ano')} />
              {erro('ano')}
            </div>
          </div>
        </fieldset>

        <fieldset className="secao-formulario">
          <legend>Itens</legend>
          {!fornecedor && !editando && <p className="mudo">Escolha a ata para ver as espécies que o fornecedor fornece.</p>}
          {erro('itens')}
          <div className="itens-contrato">
            {itens.map((i, n) => {
              const k = `itens.${n}`;
              const existente = !!i.id;
              return (
                <div key={i.chave} className="item-contrato" role="group" aria-label={`Item ${n + 1}`}>
                  <div className="campo">
                    <label htmlFor={`${formId}-${i.chave}-esp`}>Espécie</label>
                    <select id={`${formId}-${i.chave}-esp`} value={i.especieId} disabled={existente} onChange={(e) => mudarItem(i.chave, 'especieId', e.target.value)} {...invalido(k)}>
                      <option value="">Selecione…</option>
                      {(existente ? (listas?.especies ?? []) : especiesDoFornecedor).map((e) => <option key={e.id} value={e.id}>{e.nomePopular}</option>)}
                    </select>
                  </div>
                  <div className="campo">
                    <label htmlFor={`${formId}-${i.chave}-tam`}>Tamanho</label>
                    <select id={`${formId}-${i.chave}-tam`} value={i.tamanhoId} disabled={existente} onChange={(e) => mudarItem(i.chave, 'tamanhoId', e.target.value)}>
                      <option value="">Selecione…</option>
                      {(listas?.tamanhos ?? []).filter((t) => t.ativo || existente).map((t) => <option key={t.id} value={t.id}>{t.codigo}</option>)}
                    </select>
                  </div>
                  <div className="campo">
                    <label htmlFor={`${formId}-${i.chave}-tra`}>Tratamento</label>
                    <select id={`${formId}-${i.chave}-tra`} value={i.tratamentoId} disabled={existente} onChange={(e) => mudarItem(i.chave, 'tratamentoId', e.target.value)}>
                      <option value="">Selecione…</option>
                      {(listas?.tratamentos ?? []).filter((t) => t.ativo || existente).map((t) => <option key={t.id} value={t.id}>{t.preservativo} / {t.empresa}</option>)}
                    </select>
                  </div>
                  <div className="campo">
                    <label htmlFor={`${formId}-${i.chave}-qtd`}>{i.unidade === 'm3' ? 'Volume (m³)' : 'Quantidade'}</label>
                    <input id={`${formId}-${i.chave}-qtd`} value={i.quantidade} inputMode="decimal" maxLength={12} onChange={(e) => mudarItem(i.chave, 'quantidade', e.target.value)} />
                  </div>
                  <div className="campo">
                    <label htmlFor={`${formId}-${i.chave}-un`}>Unidade</label>
                    <select id={`${formId}-${i.chave}-un`} value={i.unidade} disabled={existente} onChange={(e) => mudarItem(i.chave, 'unidade', e.target.value)}>
                      {UNIDADE_ITEM_OPCOES.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
                    </select>
                  </div>
                  {existente ? <span /> : (
                    <button type="button" className="btn btn-sec btn-peq" disabled={itens.length === 1} onClick={() => setItens((l) => l.filter((x) => x.chave !== i.chave))} aria-label={`Remover item ${n + 1}`}>Remover</button>
                  )}
                  {(conversao(i) || i.minimo !== undefined || erros[k]) && (
                    <p className="conversao ajuda">
                      {conversao(i)}
                      {i.minimo !== undefined && `Já emitidos (descontados os reprovados): ${numero(i.minimo)}; a quantidade não pode ficar abaixo disso.`}
                      {erros[k] && <span className="erro-campo" id={`${formId}-${k}-erro`}> {erros[k]}</span>}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <button type="button" className="btn btn-sec btn-peq" onClick={() => setItens((l) => [...l, linhaVazia()])}>+ Item</button>
        </fieldset>
      </form>
    </Modal>
  );
}
