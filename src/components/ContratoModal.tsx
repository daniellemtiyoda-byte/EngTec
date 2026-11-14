import { useEffect, useId, useState } from 'react';
import { avisoSequenciaContrato, gestorSugerido, proximoNumeroContrato } from '../dominio/contratos';
import { RE_ATA, RE_CONTRATO } from '../dominio/identificacao';
import { REGRAS_ATA_PADRAO, VIGENCIA_ATA_MESES, dataSP, janelaParcela, somarDias, somarMeses } from '../dominio/parametros';
import type { Cadastros } from '../hooks/useCadastros';
import { servicos } from '../services';
import type { DadosParcela } from '../services/contracts';
import { ApiError, mensagemSegura } from '../services/erros';
import type { Contrato, RegrasAta } from '../types/models';
import { data, numero, paraNumero } from '../utils/format';
import { Modal } from './Modal';

interface LinhaParcela { chave: number; itens: { chave: number; tamanhoId: string; quantidade: string }[] }

interface Props {
  aberto: boolean;
  /** Ausente: novo contrato. Presente: edição (gestor e cronograma). */
  contrato?: Contrato;
  cad: Cadastros;
  aoFechar: () => void;
  aoSalvar: (c: Contrato) => void;
}

let proximaChave = 1;
const itemVazio = () => ({ chave: proximaChave++, tamanhoId: '', quantidade: '' });
const parcelaVazia = (): LinhaParcela => ({ chave: proximaChave++, itens: [itemVazio()] });

/**
 * Novo contrato e edição (seção 9.3 do plano), conforme os documentos da CPTM: não existe AF, cada pedido é um contrato
 * sob a ata. A ata (escolhida ou criada aqui) traz o fornecedor, a vigência de 12 meses e as regras (pedido mínimo,
 * número e tamanho das parcelas, prazos). O contrato tem data de assinatura, gestor e o cronograma: as parcelas, cada
 * uma com a quantidade por tamanho (código de material CPTM). Os itens do contrato são a soma das parcelas; a tela
 * mostra a janela de cada parcela e o total, e o serviço valida as regras da ata.
 */
export function ContratoModal({ aberto, contrato, cad, aoFechar, aoSalvar }: Props) {
  const formId = useId();
  const editando = !!contrato;
  const hoje = dataSP(new Date());
  const [modoAta, setModoAta] = useState<'existente' | 'nova'>('existente');
  const [ataId, setAtaId] = useState('');
  const [novaAta, setNovaAta] = useState({ numero: '', fornecedorId: '', vigenciaInicio: '' });
  const [numeroContrato, setNumero] = useState('');
  const [ano, setAno] = useState(String(new Date().getFullYear()));
  const [dataAssinatura, setAssinatura] = useState(hoje);
  const [gestor, setGestor] = useState('');
  const [parcelas, setParcelas] = useState<LinhaParcela[]>([parcelaVazia()]);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string>();
  const [enviando, setEnviando] = useState(false);
  const [todosContratos, setTodosContratos] = useState<Contrato[]>();

  useEffect(() => {
    if (!aberto) return;
    setErros({}); setErroGeral(undefined); setModoAta('existente'); setNovaAta({ numero: '', fornecedorId: '', vigenciaInicio: hoje });
    if (contrato) {
      setAtaId(contrato.ataId); setNumero(contrato.numero); setAno(String(contrato.ano)); setAssinatura(contrato.dataAssinatura); setGestor(contrato.gestor);
      setParcelas(contrato.parcelas.map((p) => ({ chave: proximaChave++, itens: p.itens.map((i) => ({ chave: proximaChave++, tamanhoId: i.tamanhoId, quantidade: String(i.quantidade) })) })));
    } else {
      setAtaId(''); setNumero(''); setAno(String(new Date().getFullYear())); setAssinatura(hoje); setGestor(''); setParcelas([parcelaVazia()]);
    }
  }, [aberto, contrato]); // eslint-disable-line react-hooks/exhaustive-deps

  const listas = cad.listas;
  const liberado = (fornecedorId: string) => { const f = cad.fornecedores.get(fornecedorId); return !!f && f.situacao === 'ativo' && !f.bloqueado; };
  const ata = modoAta === 'existente' ? cad.atas.get(ataId) : undefined;
  const regras: RegrasAta = ata?.regras ?? REGRAS_ATA_PADRAO;
  const fornecedorId = modoAta === 'nova' ? novaAta.fornecedorId : ata?.fornecedorId ?? '';
  const fornecedor = cad.fornecedores.get(fornecedorId);
  const numeroAta = modoAta === 'nova' ? novaAta.numero.trim().toUpperCase() : ata?.numero ?? '';
  const fimNovaAta = novaAta.vigenciaInicio ? somarDias(somarMeses(novaAta.vigenciaInicio, VIGENCIA_ATA_MESES), -1) : '';
  // Tamanhos: com ata existente que registra quantidades, os dela; senão, todos os ativos.
  const tamanhos = (listas?.tamanhos ?? []).filter((t) => (t.ativo || contrato?.itens.some((i) => i.tamanhoId === t.id)) && (!ata?.itens.length || ata.itens.some((i) => i.tamanhoId === t.id)));
  const saldoAta = (tamanhoId: string) => {
    const i = ata?.itens.find((x) => x.tamanhoId === tamanhoId);
    return i ? i.saldo + (contrato?.itens.find((x) => x.tamanhoId === tamanhoId)?.quantidade ?? 0) : undefined;
  };

  // Contratos de todas as atas (cancelados inclusive), para sugerir a próxima sequência e o gestor.
  useEffect(() => {
    if (!aberto || contrato) return;
    let ativo = true;
    servicos.contratos.listar({ pageSize: 1000 }).then((r) => { if (ativo) setTodosContratos(r.items); }).catch(() => { if (ativo) setTodosContratos([]); });
    return () => { ativo = false; };
  }, [aberto, contrato]);
  const contratosDaAta = ata ? (todosContratos ?? []).filter((c) => c.ataId === ata.id) : [];

  // Ao escolher a ata, o número do contrato vem com a próxima sequência e o gestor com o do contrato mais recente
  // (editáveis). Ata nova ou sem contratos: número só com o prefixo da ata e gestor vazio.
  useEffect(() => {
    if (editando) return;
    if (modoAta === 'existente' && ata && todosContratos) {
      setNumero(proximoNumeroContrato(ata.numero, contratosDaAta));
      setGestor(gestorSugerido(contratosDaAta));
    } else if (numeroAta && (!numeroContrato || !numeroContrato.startsWith(`${numeroAta}-`))) {
      setNumero(`${numeroAta}-`);
    }
  }, [numeroAta, modoAta, todosContratos]); // eslint-disable-line react-hooks/exhaustive-deps
  const avisoSequencia = editando ? undefined : avisoSequenciaContrato(numeroContrato, numeroAta, contratosDaAta);

  const somaParcela = (p: LinhaParcela) => p.itens.reduce((t, i) => t + (paraNumero(i.quantidade, true) || 0), 0);
  const total = parcelas.reduce((t, p) => t + somaParcela(p), 0);
  const mudarItem = (pc: number, ic: number, campo: 'tamanhoId' | 'quantidade', valor: string) =>
    setParcelas((l) => l.map((p) => (p.chave !== pc ? p : { ...p, itens: p.itens.map((i) => (i.chave === ic ? { ...i, [campo]: valor } : i)) })));

  function validar(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!editando) {
      if (modoAta === 'existente' && !ataId) e.ataId = 'Escolha a ata.';
      if (modoAta === 'nova') {
        if (!RE_ATA.test(numeroAta)) e['ata.numero'] = 'Número no formato AA00000 (ex. AR00224).';
        if (!novaAta.fornecedorId) e['ata.fornecedorId'] = 'Escolha o fornecedor.';
        if (!novaAta.vigenciaInicio) e['ata.vigenciaInicio'] = 'Informe o início da vigência.';
      }
      const n = numeroContrato.trim().toUpperCase();
      if (!RE_CONTRATO.test(n)) e.numero = 'Número no formato AA00000-00 (ex. AR00224-01).';
      else if (numeroAta && !n.startsWith(`${numeroAta}-`)) e.numero = `O contrato começa pelo número da ata (${numeroAta}-).`;
      if (!/^\d{4}$/.test(ano)) e.ano = 'Informe o ano.';
      if (!dataAssinatura) e.dataAssinatura = 'Informe a data de assinatura.';
    }
    if (!gestor.trim()) e.gestor = 'Informe o gestor do contrato.';
    parcelas.forEach((p, n) => {
      p.itens.forEach((i, k) => {
        if (!i.tamanhoId) e[`parcelas.${n}.${k}`] = 'Escolha o tamanho.';
        else if (!(paraNumero(i.quantidade, true) > 0)) e[`parcelas.${n}.${k}`] = 'Quantidade em unidades, maior que zero.';
      });
      const soma = somaParcela(p);
      if (soma < regras.parcelaMinima || soma > regras.parcelaMaxima) e[`parcelas.${n}`] = `A parcela soma ${numero(soma)}: cada parcela tem de ${numero(regras.parcelaMinima)} a ${numero(regras.parcelaMaxima)} dormentes.`;
    });
    if (parcelas.length > regras.maxParcelas) e.parcelas = `A ata permite até ${regras.maxParcelas} parcelas.`;
    else if (total < regras.pedidoMinimo) e.parcelas = `O contrato soma ${numero(total)} dormentes: o pedido mínimo da ata é ${numero(regras.pedidoMinimo)}.`;
    return e;
  }

  const paraParcelas = (): DadosParcela[] => parcelas.map((p) => ({ itens: p.itens.map((i) => ({ tamanhoId: i.tamanhoId, quantidade: paraNumero(i.quantidade, true) })) }));

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
        salvo = await servicos.contratos.atualizar(contrato.numero, { gestor: gestor.trim(), parcelas: paraParcelas() });
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
        salvo = await servicos.contratos.criar({ numero: numeroContrato.trim().toUpperCase(), ataId: idAta, ano: Number(ano), dataAssinatura, gestor: gestor.trim(), parcelas: paraParcelas() });
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
  const prazos = regras.prazosParcelas;

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
                      <option key={a.id} value={a.id} disabled={!liberado(a.fornecedorId) || !a.vigente}>
                        {a.numero} · {cad.nomeFornecedor(a.fornecedorId)} · até {data(a.vigenciaFim)}
                        {!liberado(a.fornecedorId) ? ' (fornecedor bloqueado ou inativo)' : !a.vigente ? ' (fora da vigência)' : ''}
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
                    {fimNovaAta && <span className="ajuda">Vigência de {VIGENCIA_ATA_MESES} meses: até {data(fimNovaAta)}.</span>}
                    {erro('ata.vigenciaInicio')}
                  </div>
                </div>
              )}
              {fornecedor && <p className="mudo">Fornecedor do contrato (vem da ata): <strong>{fornecedor.razaoSocial}</strong></p>}
            </>
          )}
          <p className="ajuda">
            Regras da ata: pedido mínimo de {numero(regras.pedidoMinimo)} dormentes; até {regras.maxParcelas} parcelas de {numero(regras.parcelaMinima)} a {numero(regras.parcelaMaxima)},
            com prazos contados da assinatura ({prazos.map(([de, ate], n) => `${n + 1}ª: ${n === 0 ? `até ${ate}` : `${de} a ${ate}`} dias`).join('; ')}).
          </p>
        </fieldset>

        <fieldset className="secao-formulario">
          <legend>Contrato</legend>
          <div className="linha-campos-2">
            <div className="campo">
              <label htmlFor={`${formId}-numero`}>Número do contrato<span className="obrig" aria-hidden="true"> *</span></label>
              <input id={`${formId}-numero`} className="mono" value={numeroContrato} maxLength={10} placeholder="AR00224-01" disabled={editando} onChange={(e) => setNumero(e.target.value)} {...invalido('numero')} />
              {avisoSequencia && <span className="ajuda texto-aviso" role="status">{avisoSequencia}</span>}
              {erro('numero')}
            </div>
            <div className="campo">
              <label htmlFor={`${formId}-ass`}>Data de assinatura<span className="obrig" aria-hidden="true"> *</span></label>
              <input id={`${formId}-ass`} type="date" value={dataAssinatura} disabled={editando} onChange={(e) => setAssinatura(e.target.value)} {...invalido('dataAssinatura')} />
              <span className="ajuda">Os prazos das parcelas contam a partir dela.</span>
              {erro('dataAssinatura')}
            </div>
            <div className="campo">
              <label htmlFor={`${formId}-gestor`}>Gestor do contrato<span className="obrig" aria-hidden="true"> *</span></label>
              <input id={`${formId}-gestor`} value={gestor} maxLength={80} onChange={(e) => setGestor(e.target.value)} {...invalido('gestor')} />
              {erro('gestor')}
            </div>
            <div className="campo">
              <label htmlFor={`${formId}-ano`}>Ano<span className="obrig" aria-hidden="true"> *</span></label>
              <input id={`${formId}-ano`} value={ano} inputMode="numeric" maxLength={4} disabled={editando} onChange={(e) => setAno(e.target.value)} {...invalido('ano')} />
              {erro('ano')}
            </div>
          </div>
        </fieldset>

        <fieldset className="secao-formulario">
          <legend>Cronograma por parcela</legend>
          <p className="mudo">O item do contrato é o tamanho (código de material CPTM). Espécie, classe e tratamento vêm do fornecedor em cada fardo.</p>
          {erro('parcelas')}
          <div className="parcelas-contrato">
            {parcelas.map((p, n) => {
              const janela = dataAssinatura ? janelaParcela(dataAssinatura, regras, n + 1) : undefined;
              const soma = somaParcela(p);
              const fora = soma < regras.parcelaMinima || soma > regras.parcelaMaxima;
              return (
                <div key={p.chave} className="parcela-contrato" role="group" aria-label={`Parcela ${n + 1}`}>
                  <div className="parcela-topo">
                    <strong>{n + 1}ª parcela</strong>
                    {janela && <span className="mudo">entrega de {data(janela.inicio)} a {data(janela.fim)}</span>}
                    <span className={fora ? 'texto-critico' : 'mudo'}>{numero(soma)} dormentes</span>
                    {parcelas.length > 1 && <button type="button" className="btn btn-link" onClick={() => setParcelas((l) => l.filter((x) => x.chave !== p.chave))}>Remover parcela</button>}
                  </div>
                  {p.itens.map((i, k) => (
                    <div key={i.chave} className="parcela-item">
                      <div className="campo">
                        <label htmlFor={`${formId}-${i.chave}-tam`}>Tamanho</label>
                        <select id={`${formId}-${i.chave}-tam`} value={i.tamanhoId} onChange={(e) => mudarItem(p.chave, i.chave, 'tamanhoId', e.target.value)} {...invalido(`parcelas.${n}.${k}`)}>
                          <option value="">Selecione…</option>
                          {tamanhos.map((t) => {
                            const saldo = saldoAta(t.id);
                            return <option key={t.id} value={t.id}>{cad.descreverTamanho(t.id)}{saldo !== undefined ? ` · saldo na ata ${numero(saldo)}` : ''}</option>;
                          })}
                        </select>
                      </div>
                      <div className="campo">
                        <label htmlFor={`${formId}-${i.chave}-qtd`}>Quantidade</label>
                        <input id={`${formId}-${i.chave}-qtd`} value={i.quantidade} inputMode="numeric" maxLength={6} onChange={(e) => mudarItem(p.chave, i.chave, 'quantidade', e.target.value)} />
                      </div>
                      {p.itens.length > 1 && (
                        <button type="button" className="btn btn-sec btn-peq" onClick={() => setParcelas((l) => l.map((x) => (x.chave !== p.chave ? x : { ...x, itens: x.itens.filter((y) => y.chave !== i.chave) })))} aria-label={`Remover tamanho da ${n + 1}ª parcela`}>Remover</button>
                      )}
                      {erro(`parcelas.${n}.${k}`)}
                    </div>
                  ))}
                  <button type="button" className="btn btn-sec btn-peq" onClick={() => setParcelas((l) => l.map((x) => (x.chave !== p.chave ? x : { ...x, itens: [...x.itens, itemVazio()] })))}>+ Tamanho</button>
                  {erro(`parcelas.${n}`)}
                </div>
              );
            })}
          </div>
          <div className="parcela-rodape">
            <button type="button" className="btn btn-sec btn-peq" disabled={parcelas.length >= regras.maxParcelas} onClick={() => setParcelas((l) => [...l, parcelaVazia()])}>+ Parcela</button>
            <span className={total < regras.pedidoMinimo ? 'texto-critico' : 'mudo'}>Total do contrato: <strong>{numero(total)}</strong> dormentes (mínimo {numero(regras.pedidoMinimo)})</span>
          </div>
          {editando && <p className="ajuda">Nenhum tamanho pode ficar abaixo do que já foi emitido, descontados os reprovados.</p>}
        </fieldset>
      </form>
    </Modal>
  );
}
