import { idDormente, idFardo, sequenciaDe } from '../../dominio/identificacao';
import { dataSP, somarDias } from '../../dominio/parametros';
import type { Id } from '../../types/models';
import { chaveComDigito } from '../../utils/nfeXml';
import type { DadosEmissao } from '../contracts';
import { contratoView, itemDescrito } from './consultas';
import { cadastrarEntrega } from './documentos';
import { achar, evento, falha, novoId, proximoNumero, type Ctx, type EmissaoReg, type Estado } from './estado';

/*
 * Simulador do fornecedor (só demonstração): emite fardos e dormentes com IDs sequenciais do contrato, com a NF e a
 * DOF de exemplo que acompanham o material. Com documentos, a entrega já nasce cadastrada; sem, a CPTM cadastra NF e
 * DOF depois em NF e DOF, importando o XML baixado aqui (a entrega é ligada à emissão pela chave de acesso).
 */

const MAX_FARDOS = 50;
const MAX_POR_FARDO = 50;

/** Próxima sequência livre do contrato (IDs nunca se repetem nem são reaproveitados). */
function proximaSequencia(e: Estado, contratoId: Id, tipo: 'dormente' | 'fardo'): number {
  const lista = tipo === 'dormente' ? e.dormentes : e.fardos;
  return lista.filter((x) => x.contratoId === contratoId).reduce((m, x) => Math.max(m, sequenciaDe(x.id) ?? 0), 0) + 1;
}

/** Chave de acesso fictícia com a estrutura da NF-e (UF, AAMM, CNPJ, modelo 55, série, número) e dígito válido. */
function chaveFicticia(cnpj: string, emissao: string, numero: number): string {
  const aamm = emissao.slice(2, 4) + emissao.slice(5, 7);
  const base = `35${aamm}${cnpj.replace(/\D/g, '').padStart(14, '0')}55001${String(numero).padStart(9, '0')}1${String(numero).padStart(8, '0')}`;
  return chaveComDigito(base);
}

export function emitir(e: Estado, dados: DadosEmissao, ctx: Ctx, validadeDofDias = 7): EmissaoReg {
  const reg = achar(e.contratos, (c) => c.id === dados.contratoId, 'Contrato');
  const contrato = contratoView(e, reg);
  if (contrato.situacao !== 'vigente') falha(422, `O contrato ${contrato.numero} não está vigente.`, { contratoId: 'Escolha um contrato vigente.' });
  const itens = dados.itens.filter((i) => i.fardos > 0);
  if (!itens.length) falha(422, 'Informe ao menos um fardo.', { itens: 'Informe a quantidade de fardos.' });
  const campos: Record<string, string> = {};
  itens.forEach((i, n) => {
    const item = contrato.itens.find((x) => x.id === i.itemContratoId);
    if (!item) { campos[`itens.${n}`] = 'Item não pertence ao contrato.'; return; }
    if (!Number.isInteger(i.fardos) || i.fardos > MAX_FARDOS) campos[`itens.${n}`] = `De 1 a ${MAX_FARDOS} fardos.`;
    else if (!Number.isInteger(i.dormentesPorFardo) || i.dormentesPorFardo < 1 || i.dormentesPorFardo > MAX_POR_FARDO) campos[`itens.${n}`] = `De 1 a ${MAX_POR_FARDO} dormentes por fardo.`;
    else if (i.fardos * i.dormentesPorFardo > item.saldoAEmitir) campos[`itens.${n}`] = `Passa do saldo a emitir do item (${item.saldoAEmitir}).`;
  });
  if (Object.keys(campos).length) falha(422, 'Confira as quantidades: o total emitido, descontados os reprovados, não pode passar do contratado.', campos);

  // Emissão dos fardos e dormentes (situação: em trânsito / emitido).
  const ata = achar(e.atas, (a) => a.id === reg.ataId, 'Ata');
  const fornecedor = achar(e.fornecedores, (f) => f.id === ata.fornecedorId, 'Fornecedor');
  const emissaoId = novoId(e, 'em');
  let seqFardo = proximaSequencia(e, reg.id, 'fardo');
  let seqDormente = proximaSequencia(e, reg.id, 'dormente');
  const fardosIds: Id[] = [];
  const volumePorEspecie = new Map<Id, number>();
  const itensNf: { itemContratoId: Id; quantidade: number; volumeM3: number }[] = [];
  for (const i of itens) {
    const desc = itemDescrito(e, i.itemContratoId);
    for (let k = 0; k < i.fardos; k++) {
      const fardoId = idFardo(reg.numero, seqFardo++);
      fardosIds.push(fardoId);
      e.fardos.push({ id: fardoId, contratoId: reg.id, itemContratoId: i.itemContratoId, emissaoId, quantidadeInicial: i.dormentesPorFardo, historico: [evento(ctx, 'emitido', 'Fardo emitido pelo fornecedor')] });
      for (let j = 0; j < i.dormentesPorFardo; j++) {
        e.dormentes.push({
          id: idDormente(reg.numero, seqDormente++), contratoId: reg.id, itemContratoId: i.itemContratoId, fardoId,
          situacao: 'emitido', historico: [evento(ctx, 'emitido', `Emitido pelo fornecedor no fardo ${fardoId}`, fardoId)],
        });
      }
    }
    const quantidade = i.fardos * i.dormentesPorFardo;
    const volume = Math.round(quantidade * desc.tamanho.volumeM3 * 1000) / 1000;
    itensNf.push({ itemContratoId: i.itemContratoId, quantidade, volumeM3: volume });
    volumePorEspecie.set(desc.especie.id, (volumePorEspecie.get(desc.especie.id) ?? 0) + volume);
  }

  // NF e DOF de exemplo, coerentes com o volume emitido (a DOF declara o volume nominal).
  const dataEmissao = dataSP(ctx.agora());
  const numeroNf = proximoNumero(e, 'numeroNf', 4500);
  const numeroDof = proximoNumero(e, 'numeroDof', 26_010_001);
  const emissao: EmissaoReg = {
    id: emissaoId, contratoId: reg.id, fardosIds, comDocumentos: dados.comDocumentos,
    nf: { numero: String(numeroNf), serie: '1', chaveAcesso: chaveFicticia(fornecedor.cnpj, dataEmissao, numeroNf), emissao: dataEmissao, itens: itensNf },
    dof: { numero: String(numeroDof), validade: somarDias(dataEmissao, validadeDofDias), volumes: [...volumePorEspecie].map(([especieId, v]) => ({ especieId, volumeM3: Math.round(v * 1000) / 1000 })) },
    criadoEm: ctx.agora().toISOString(), criadoPor: ctx.quem,
  };
  e.emissoes.push(emissao);
  // Com documentos: a entrega já nasce cadastrada, como se a CPTM tivesse cadastrado NF e DOF (liga-se pela chave).
  if (dados.comDocumentos) {
    cadastrarEntrega(e, {
      nf: { ...emissao.nf, contratoId: reg.id, itens: itensNf.map((i) => ({ ...i })) },
      dof: { ...emissao.dof, volumes: emissao.dof.volumes.map((v) => ({ ...v })) },
      fardosIds,
    }, 'simulador', ctx, { xml: { name: `NF-${numeroNf}.xml` } as File });
  }
  return emissao;
}

const escaparXml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** XML fictício da NF da emissão, no formato que `lerXmlNfe` lê (para a importação em NF e DOF). */
export function xmlDaNf(e: Estado, emissaoId: Id): string {
  const em = achar(e.emissoes, (x) => x.id === emissaoId, 'Emissão');
  const { nf, dof } = em;
  const contrato = achar(e.contratos, (c) => c.id === em.contratoId, 'Contrato');
  const ata = achar(e.atas, (a) => a.id === contrato.ataId, 'Ata');
  const forn = achar(e.fornecedores, (f) => f.id === ata.fornecedorId, 'Fornecedor');
  const itens = nf.itens.map((i, n) => {
    const d = itemDescrito(e, i.itemContratoId);
    const t = d.tamanho;
    return `      <det nItem="${n + 1}">
        <prod>
          <cProd>DRM-${escaparXml(t.codigo)}</cProd>
          <xProd>${escaparXml(`DORMENTE ${d.especie.nomeCientifico.toUpperCase()} ${t.larguraCm}X${t.alturaCm}X${t.comprimentoCm} CM`)}</xProd>
          <uCom>UN</uCom>
          <qCom>${i.quantidade.toFixed(4)}</qCom>
        </prod>
      </det>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- NF-e FICTÍCIA gerada pelo Simulador do fornecedor (demonstração). Não representa nenhuma nota real. -->
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe${nf.chaveAcesso}" versao="4.00">
      <ide>
        <cUF>35</cUF>
        <natOp>Venda de mercadoria</natOp>
        <mod>55</mod>
        <serie>${escaparXml(nf.serie)}</serie>
        <nNF>${escaparXml(nf.numero)}</nNF>
        <dhEmi>${nf.emissao}T09:00:00-03:00</dhEmi>
      </ide>
      <emit>
        <CNPJ>${forn.cnpj.replace(/\D/g, '')}</CNPJ>
        <xNome>${escaparXml(forn.razaoSocial)}</xNome>
      </emit>
${itens}
      <infAdic>
        <infCpl>Produto florestal acompanhado do DOF n. ${escaparXml(dof.numero)}. Contrato ${escaparXml(contrato.numero)}.</infCpl>
      </infAdic>
    </infNFe>
  </NFe>
  <protNFe versao="4.00">
    <infProt>
      <chNFe>${nf.chaveAcesso}</chNFe>
    </infProt>
  </protNFe>
</nfeProc>
`;
}
