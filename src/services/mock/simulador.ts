import { idDormente, idFardo, sequenciaDe } from '../../dominio/identificacao';
import { dataSP, somarDias } from '../../dominio/parametros';
import type { Classe, Id } from '../../types/models';
import { chaveComDigito } from '../../utils/nfeXml';
import type { DadosEmissao } from '../contracts';
import { contratoView, tamanhoDoItem } from './consultas';
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
  const contrato = contratoView(e, reg, dataSP(ctx.agora()));
  if (contrato.situacao !== 'vigente') falha(422, `O contrato ${contrato.numero} não está vigente.`, { contratoId: 'Escolha um contrato vigente.' });
  const parcela = reg.parcelas.find((p) => p.numero === dados.parcela);
  if (!parcela) falha(422, 'Escolha a parcela do cronograma.', { parcela: 'Parcela não encontrada no contrato.' });
  const itens = dados.itens.filter((i) => i.fardos > 0);
  if (!itens.length) falha(422, 'Informe ao menos um fardo.', { itens: 'Informe a quantidade de fardos.' });
  const campos: Record<string, string> = {};
  itens.forEach((i, n) => {
    const item = contrato.itens.find((x) => x.id === i.itemContratoId);
    if (!item) { campos[`itens.${n}`] = 'Item não pertence ao contrato.'; return; }
    if (!parcela.itens.some((x) => x.tamanhoId === item.tamanhoId)) { campos[`itens.${n}`] = `O tamanho não está na ${parcela.numero}ª parcela.`; return; }
    if (!Number.isInteger(i.fardos) || i.fardos > MAX_FARDOS) campos[`itens.${n}`] = `De 1 a ${MAX_FARDOS} fardos.`;
    else if (!Number.isInteger(i.dormentesPorFardo) || i.dormentesPorFardo < 1 || i.dormentesPorFardo > MAX_POR_FARDO) campos[`itens.${n}`] = `De 1 a ${MAX_POR_FARDO} dormentes por fardo.`;
    else if (i.fardos * i.dormentesPorFardo > item.saldoAEmitir) campos[`itens.${n}`] = `Passa do saldo a emitir do item (${item.saldoAEmitir}).`;
  });
  if (Object.keys(campos).length) falha(422, 'Confira as quantidades: o total emitido, descontados os reprovados, não pode passar do contratado.', campos);

  // Emissão dos fardos e dormentes (situação: em trânsito / emitido).
  const ata = achar(e.atas, (a) => a.id === reg.ataId, 'Ata');
  const fornecedor = achar(e.fornecedores, (f) => f.id === ata.fornecedorId, 'Fornecedor');
  // Espécie, classe e tratamento de cada fardo: atribuídos de forma determinística pela sequência do fardo, entre as
  // espécies que o fornecedor fornece (como viriam do Boletim de Inspeção e da plaquinha).
  const especies = fornecedor.especiesIds.filter((id) => e.especies.some((s) => s.id === id && s.ativo));
  const tratamentos = e.tratamentos.filter((t) => t.ativo).map((t) => t.id);
  if (!especies.length || !tratamentos.length) falha(409, 'Cadastre espécies (do fornecedor) e tratamentos ativos antes de emitir.');
  const doFardo = (seq: number) => ({
    especieId: especies[(seq - 1) % especies.length],
    classe: (seq % 5 === 0 ? 2 : 1) as Classe,
    tratamentoId: tratamentos[(seq - 1) % tratamentos.length],
  });
  const emissaoId = novoId(e, 'em');
  let seqFardo = proximaSequencia(e, reg.id, 'fardo');
  let seqDormente = proximaSequencia(e, reg.id, 'dormente');
  const fardosIds: Id[] = [];
  const volumePorEspecie = new Map<Id, number>();
  const boletim = new Map<string, number>();
  const itensNf: { itemContratoId: Id; quantidade: number; volumeM3: number }[] = [];
  for (const i of itens) {
    const tamanho = tamanhoDoItem(e, i.itemContratoId);
    for (let k = 0; k < i.fardos; k++) {
      const seq = seqFardo++;
      const fardoId = idFardo(reg.numero, seq);
      const madeira = doFardo(seq);
      fardosIds.push(fardoId);
      e.fardos.push({ id: fardoId, contratoId: reg.id, itemContratoId: i.itemContratoId, ...madeira, emissaoId, quantidadeInicial: i.dormentesPorFardo, historico: [evento(ctx, 'emitido', 'Fardo emitido pelo fornecedor')] });
      for (let j = 0; j < i.dormentesPorFardo; j++) {
        e.dormentes.push({
          id: idDormente(reg.numero, seqDormente++), contratoId: reg.id, itemContratoId: i.itemContratoId, fardoId, ...madeira,
          situacao: 'emitido', historico: [evento(ctx, 'emitido', `Emitido pelo fornecedor no fardo ${fardoId}`, fardoId)],
        });
      }
      volumePorEspecie.set(madeira.especieId, (volumePorEspecie.get(madeira.especieId) ?? 0) + i.dormentesPorFardo * tamanho.volumeM3);
      const k2 = `${tamanho.id}|${madeira.especieId}`;
      boletim.set(k2, (boletim.get(k2) ?? 0) + i.dormentesPorFardo);
    }
    const quantidade = i.fardos * i.dormentesPorFardo;
    itensNf.push({ itemContratoId: i.itemContratoId, quantidade, volumeM3: Math.round(quantidade * tamanho.volumeM3 * 1000) / 1000 });
  }

  // NF e DOF de exemplo, coerentes com o volume emitido (a DOF declara o volume nominal).
  const dataEmissao = dataSP(ctx.agora());
  const numeroNf = proximoNumero(e, 'numeroNf', 4500);
  const numeroDof = proximoNumero(e, 'numeroDof', 26_010_001);
  // Boletim de Inspeção e Relatório Técnico de exemplo: empresa inspetora fixa por contrato, quantidades por tamanho e espécie.
  const empresas = e.empresasInspetoras.filter((x) => x.ativo);
  if (!empresas.length) falha(409, 'Cadastre uma empresa inspetora ativa antes de emitir.');
  const empresa = empresas[e.contratos.indexOf(reg) % empresas.length];
  const numeroBoletim = proximoNumero(e, 'numeroBoletim', 1);
  const ano = dataEmissao.slice(0, 4);
  const emissao: EmissaoReg = {
    id: emissaoId, contratoId: reg.id, fardosIds, parcela: parcela.numero, reentrega: !!dados.reentrega, comDocumentos: dados.comDocumentos,
    boletim: {
      numero: `BI-${ano}-${String(numeroBoletim).padStart(4, '0')}`, data: somarDias(dataEmissao, -1), empresaInspetoraId: empresa.id,
      itens: [...boletim].map(([k, quantidade]) => { const [tamanhoId, especieId] = k.split('|'); return { tamanhoId, especieId, quantidade }; }),
    },
    relatorioTecnico: { numero: `RT-${ano}-${String(numeroBoletim).padStart(4, '0')}`, data: somarDias(dataEmissao, -1) },
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
      parcela: parcela.numero, reentrega: !!dados.reentrega, fardosIds,
      boletim: { ...emissao.boletim, itens: emissao.boletim.itens.map((i) => ({ ...i })) }, relatorioTecnico: { ...emissao.relatorioTecnico },
    }, 'simulador', ctx, { xml: { name: `NF-${numeroNf}.xml` } as File, boletim: { name: `${emissao.boletim.numero}.pdf` } as File, relatorio: { name: `${emissao.relatorioTecnico.numero}.pdf` } as File });
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
    const t = tamanhoDoItem(e, i.itemContratoId);
    return `      <det nItem="${n + 1}">
        <prod>
          <cProd>${escaparXml(t.codigo)}</cProd>
          <xProd>${escaparXml(`DORMENTE DE MADEIRA TRATADA ${t.larguraCm * 10}X${t.alturaCm * 10}X${t.comprimentoCm * 10} MM - MATERIAL CPTM ${t.codigo}`)}</xProd>
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
