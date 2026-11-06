import { RE_ATA, RE_CODIGO_LOCAL, RE_CONTRATO } from '../../dominio/identificacao';
import { unidadesDeM3, volumeM3 } from '../../dominio/parametros';
import type { Ata, Especie, Id, Tratamento } from '../../types/models';
import type {
  DadosAta, DadosAtualizacaoContrato, DadosContrato, DadosEspecie, DadosFornecedor, DadosItemContrato, DadosLocal, DadosTamanho, DadosTratamento,
} from '../contracts';
import { contratoView, fornecedorView, localView } from './consultas';
import {
  achar, evento, falha, hoje, instante, novoId, type ContratoReg, type Ctx, type Estado, type FornecedorReg, type ItemContratoReg, type LocalReg, type TamanhoReg,
} from './estado';

/* Cadastros (seção 9.18 do plano): nada é apagado, só inativado. Atas e contratos (seções 9.3 e 9.4). */

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const igual = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
function exigirCampos(campos: Record<string, string>, mensagem = 'Confira os campos destacados.') {
  if (Object.keys(campos).length) falha(422, mensagem, campos);
}

// ---------- Fornecedor ----------

export function salvarFornecedor(e: Estado, dados: Partial<DadosFornecedor>, id?: Id): FornecedorReg {
  const atual = id ? achar(e.fornecedores, (f) => f.id === id, 'Fornecedor') : undefined;
  const v = { ...atual, ...dados } as DadosFornecedor;
  const cnpj = (v.cnpj ?? '').replace(/\D/g, '');
  const campos: Record<string, string> = {};
  if (!v.razaoSocial?.trim()) campos.razaoSocial = 'Informe a razão social.';
  if (cnpj.length !== 14) campos.cnpj = 'O CNPJ tem 14 dígitos.';
  else if (e.fornecedores.some((f) => f.id !== id && f.cnpj.replace(/\D/g, '') === cnpj)) campos.cnpj = 'CNPJ já cadastrado.';
  if (!v.cidadeUf?.trim()) campos.cidadeUf = 'Informe a cidade/UF.';
  if (!v.ctfIbama?.trim()) campos.ctfIbama = 'Informe o CTF Ibama.';
  if (!DATA.test(v.ctfValidade ?? '')) campos.ctfValidade = 'Informe a validade do CTF.';
  if (!v.especiesIds?.length) campos.especiesIds = 'Escolha as espécies que o fornecedor fornece.';
  else if (v.especiesIds.some((x) => !e.especies.some((s) => s.id === x))) campos.especiesIds = 'Espécie não encontrada.';
  exigirCampos(campos);
  const reg: FornecedorReg = {
    id: atual?.id ?? novoId(e, 'fo'), razaoSocial: v.razaoSocial.trim(), cnpj, cidadeUf: v.cidadeUf.trim(), ctfIbama: v.ctfIbama.trim(),
    ctfValidade: v.ctfValidade, situacao: atual?.situacao ?? 'ativo', especiesIds: [...new Set(v.especiesIds)], certificados: atual?.certificados ?? [],
  };
  if (atual) Object.assign(atual, reg); else e.fornecedores.push(reg);
  return atual ?? reg;
}

// ---------- Espécie, tamanho, tratamento, local ----------

export function salvarEspecie(e: Estado, dados: Partial<DadosEspecie>, id?: Id): Especie {
  const atual = id ? achar(e.especies, (x) => x.id === id, 'Espécie') : undefined;
  const v = { ...atual, ...dados } as DadosEspecie;
  const campos: Record<string, string> = {};
  if (!v.nomeCientifico?.trim()) campos.nomeCientifico = 'Informe o nome científico.';
  else if (e.especies.some((x) => x.id !== id && igual(x.nomeCientifico, v.nomeCientifico))) campos.nomeCientifico = 'Espécie já cadastrada.';
  if (!v.nomePopular?.trim()) campos.nomePopular = 'Informe o nome popular.';
  exigirCampos(campos);
  const reg: Especie = { id: atual?.id ?? novoId(e, 'es'), nomeCientifico: v.nomeCientifico.trim(), nomePopular: v.nomePopular.trim(), classe: v.classe?.trim() || undefined, ativo: atual?.ativo ?? true };
  if (atual) Object.assign(atual, reg); else e.especies.push(reg);
  return atual ?? reg;
}

export function salvarTamanho(e: Estado, dados: Partial<DadosTamanho>, id?: Id): TamanhoReg {
  const atual = id ? achar(e.tamanhos, (x) => x.id === id, 'Tamanho') : undefined;
  const v = { ...atual, ...dados } as DadosTamanho;
  const campos: Record<string, string> = {};
  if (!v.codigo?.trim()) campos.codigo = 'Informe o código.';
  else if (e.tamanhos.some((x) => x.id !== id && igual(x.codigo, v.codigo))) campos.codigo = 'Código já utilizado.';
  for (const k of ['comprimentoCm', 'larguraCm', 'alturaCm'] as const) if (!(v[k] > 0)) campos[k] = 'Medida em cm, maior que zero.';
  exigirCampos(campos);
  const reg: TamanhoReg = {
    id: atual?.id ?? novoId(e, 'ta'), codigo: v.codigo.trim(), comprimentoCm: v.comprimentoCm, larguraCm: v.larguraCm, alturaCm: v.alturaCm,
    medidas: v.medidas ?? 'provisorio', ativo: atual?.ativo ?? true,
  };
  if (atual) Object.assign(atual, reg); else e.tamanhos.push(reg);
  return atual ?? reg;
}

export function salvarTratamento(e: Estado, dados: Partial<DadosTratamento>, id?: Id): Tratamento {
  const atual = id ? achar(e.tratamentos, (x) => x.id === id, 'Tratamento') : undefined;
  const v = { ...atual, ...dados } as DadosTratamento;
  const campos: Record<string, string> = {};
  if (!v.preservativo?.trim()) campos.preservativo = 'Informe o preservativo.';
  if (!v.empresa?.trim()) campos.empresa = 'Informe a empresa de tratamento.';
  if (!campos.preservativo && !campos.empresa && e.tratamentos.some((x) => x.id !== id && igual(x.preservativo, v.preservativo) && igual(x.empresa, v.empresa))) campos.preservativo = 'Tratamento já cadastrado.';
  exigirCampos(campos);
  const reg: Tratamento = { id: atual?.id ?? novoId(e, 'tr'), preservativo: v.preservativo.trim(), empresa: v.empresa.trim(), ativo: atual?.ativo ?? true };
  if (atual) Object.assign(atual, reg); else e.tratamentos.push(reg);
  return atual ?? reg;
}

export function salvarLocal(e: Estado, dados: Partial<DadosLocal>, ctx: Ctx, id?: Id): LocalReg {
  const atual = id ? achar(e.locais, (x) => x.id === id, 'Local') : undefined;
  const v = { ...atual, ...dados } as DadosLocal;
  const codigo = (v.codigo ?? '').trim().toUpperCase();
  const campos: Record<string, string> = {};
  if (!RE_CODIGO_LOCAL.test(codigo)) campos.codigo = 'Código com letras e números, partes separadas por hífen (ex. A-03).';
  else if (e.locais.some((x) => x.id !== id && x.codigo === codigo)) campos.codigo = 'Código já utilizado.';
  if (!v.descricao?.trim()) campos.descricao = 'Informe a descrição.';
  if (!['armazenagem', 'inspecao', 'segregacao', 'expedicao'].includes(v.tipo)) campos.tipo = 'Escolha o tipo.';
  if (!Number.isInteger(v.capacidade) || v.capacidade <= 0) campos.capacidade = 'Capacidade em dormentes, maior que zero.';
  else if (atual && v.capacidade < localView(e, atual, hoje(ctx)).ocupacao) campos.capacidade = 'A capacidade não pode ficar abaixo da ocupação atual.';
  // O código vai impresso no QR do local: não muda depois de criado.
  if (atual && codigo !== atual.codigo) campos.codigo = 'O código do local não muda depois de criado (está no QR impresso).';
  exigirCampos(campos);
  const reg: LocalReg = { id: atual?.id ?? novoId(e, 'lo'), codigo, descricao: v.descricao.trim(), tipo: v.tipo, capacidade: v.capacidade, ativo: atual?.ativo ?? true };
  if (atual) Object.assign(atual, reg); else e.locais.push(reg);
  return atual ?? reg;
}

export function inativarLocal(e: Estado, id: Id, ctx: Ctx) {
  const l = achar(e.locais, (x) => x.id === id, 'Local');
  if (localView(e, l, hoje(ctx)).ocupacao > 0) falha(409, `O local ${l.codigo} tem dormentes: transfira os fardos antes de inativar.`);
  l.ativo = false;
  return l;
}

// ---------- Ata e contrato ----------

function exigirFornecedorLiberado(e: Estado, fornecedorId: Id, ctx: Ctx, campo: string) {
  const reg = e.fornecedores.find((f) => f.id === fornecedorId);
  if (!reg) falha(422, 'Escolha o fornecedor.', { [campo]: 'Fornecedor não encontrado.' });
  const f = fornecedorView(reg, hoje(ctx));
  if (f.situacao !== 'ativo') falha(422, `O fornecedor ${f.razaoSocial} está inativo.`, { [campo]: 'Fornecedor inativo.' });
  if (f.bloqueado) falha(422, `O fornecedor ${f.razaoSocial} está bloqueado: CTF Ibama vencido em ${f.ctfValidade}.`, { [campo]: 'Fornecedor bloqueado (CTF vencido).' });
  return f;
}

export function criarAta(e: Estado, dados: DadosAta, ctx: Ctx): Ata {
  const numero = (dados.numero ?? '').trim().toUpperCase();
  const campos: Record<string, string> = {};
  if (!RE_ATA.test(numero)) campos.numero = 'Número no formato AA00000 (ex. AR00224).';
  else if (e.atas.some((a) => a.numero === numero)) campos.numero = 'Ata já cadastrada.';
  if (!DATA.test(dados.vigenciaInicio ?? '')) campos.vigenciaInicio = 'Informe o início da vigência.';
  if (!DATA.test(dados.vigenciaFim ?? '')) campos.vigenciaFim = 'Informe o fim da vigência.';
  else if (dados.vigenciaFim < dados.vigenciaInicio) campos.vigenciaFim = 'O fim vem depois do início.';
  exigirCampos(campos);
  exigirFornecedorLiberado(e, dados.fornecedorId, ctx, 'fornecedorId');
  const ata: Ata = { id: novoId(e, 'at'), numero, fornecedorId: dados.fornecedorId, vigenciaInicio: dados.vigenciaInicio, vigenciaFim: dados.vigenciaFim };
  e.atas.push(ata);
  return ata;
}

/** Valida os itens do contrato e converte m³ em unidades (pelo volume do tamanho, arredondando para baixo). */
function itensDoContrato(e: Estado, itens: DadosItemContrato[], especiesDoFornecedor: Id[], campos: Record<string, string>): Omit<ItemContratoReg, 'id'>[] {
  if (!itens?.length) campos.itens = 'Informe ao menos um item.';
  const vistos = new Set<string>();
  return (itens ?? []).map((i, n) => {
    const t = e.tamanhos.find((x) => x.id === i.tamanhoId && x.ativo);
    let quantidade = i.quantidade;
    if (!e.especies.some((x) => x.id === i.especieId && x.ativo)) campos[`itens.${n}`] = 'Escolha uma espécie ativa.';
    else if (!especiesDoFornecedor.includes(i.especieId)) campos[`itens.${n}`] = 'O fornecedor da ata não fornece esta espécie.';
    else if (!t) campos[`itens.${n}`] = 'Escolha um tamanho ativo.';
    else if (!e.tratamentos.some((x) => x.id === i.tratamentoId && x.ativo)) campos[`itens.${n}`] = 'Escolha um tratamento ativo.';
    else {
      if (i.unidade === 'm3') quantidade = unidadesDeM3(i.quantidade, volumeM3(t.comprimentoCm, t.larguraCm, t.alturaCm));
      const k = `${i.especieId}|${i.tamanhoId}|${i.tratamentoId}`;
      if (vistos.has(k)) campos[`itens.${n}`] = 'Item repetido.';
      else if (!Number.isInteger(quantidade) || quantidade <= 0) campos[`itens.${n}`] = i.unidade === 'm3' ? 'O volume não chega a uma unidade.' : 'Quantidade em unidades, maior que zero.';
      vistos.add(k);
    }
    return { especieId: i.especieId, tamanhoId: i.tamanhoId, tratamentoId: i.tratamentoId, quantidade };
  });
}

export function criarContrato(e: Estado, dados: DadosContrato, ctx: Ctx): ContratoReg {
  const numero = (dados.numero ?? '').trim().toUpperCase();
  const ata = e.atas.find((a) => a.id === dados.ataId);
  const campos: Record<string, string> = {};
  if (!ata) campos.ataId = 'Escolha a ata.';
  if (!RE_CONTRATO.test(numero)) campos.numero = 'Número no formato AA00000-00 (ex. AR00224-01).';
  else if (ata && !numero.startsWith(`${ata.numero}-`)) campos.numero = `O contrato começa pelo número da ata (${ata.numero}-).`;
  else if (e.contratos.some((c) => c.numero === numero)) campos.numero = 'Contrato já cadastrado.';
  if (!dados.empresaInspetora?.trim()) campos.empresaInspetora = 'Informe a empresa inspetora.';
  if (!Number.isInteger(dados.ano) || dados.ano < 2000) campos.ano = 'Informe o ano.';
  exigirCampos(campos);
  const fornecedor = exigirFornecedorLiberado(e, ata!.fornecedorId, ctx, 'ataId');
  const itens = itensDoContrato(e, dados.itens, fornecedor.especiesIds, campos);
  exigirCampos(campos);
  const reg: ContratoReg = {
    id: novoId(e, 'ct'), numero, ataId: ata!.id, empresaInspetora: dados.empresaInspetora.trim(), ano: dados.ano, situacao: 'vigente',
    itens: itens.map((i) => ({ ...i, id: novoId(e, 'ic') })), criadoEm: instante(ctx), criadoPor: ctx.quem,
  };
  e.contratos.push(reg);
  return reg;
}

export function atualizarContrato(e: Estado, numero: string, dados: DadosAtualizacaoContrato): ContratoReg {
  const reg = achar(e.contratos, (c) => c.numero === numero, `Contrato ${numero}`);
  if (reg.situacao === 'cancelado') falha(409, `O contrato ${numero} está cancelado.`);
  const v = contratoView(e, reg);
  const campos: Record<string, string> = {};
  if (dados.empresaInspetora !== undefined && !dados.empresaInspetora.trim()) campos.empresaInspetora = 'Informe a empresa inspetora.';
  if (dados.itens) {
    const fornecedor = achar(e.fornecedores, (f) => f.id === v.fornecedorId, 'Fornecedor');
    const novos = dados.itens.filter((i) => !i.id);
    const convertidos = itensDoContrato(e, novos, fornecedor.especiesIds, campos);
    // Item existente só muda a quantidade, e nunca abaixo do que já foi emitido (descontados os reprovados).
    dados.itens.filter((i) => i.id).forEach((i, n) => {
      const atual = v.itens.find((x) => x.id === i.id);
      if (!atual) campos[`itens.existente.${n}`] = 'Item não pertence ao contrato.';
      else if (!Number.isInteger(i.quantidade) || i.quantidade < atual.emitidos - atual.reprovados) campos[`itens.existente.${n}`] = `A quantidade não pode ficar abaixo do já emitido (${atual.emitidos - atual.reprovados}).`;
    });
    exigirCampos(campos);
    for (const i of dados.itens.filter((x) => x.id)) achar(reg.itens, (x) => x.id === i.id, 'Item').quantidade = i.quantidade;
    reg.itens.push(...convertidos.map((i) => ({ ...i, id: novoId(e, 'ic') })));
  }
  exigirCampos(campos);
  if (dados.empresaInspetora !== undefined) reg.empresaInspetora = dados.empresaInspetora.trim();
  return reg;
}

export function cancelarContrato(e: Estado, numero: string, motivo: string, ctx: Ctx): ContratoReg {
  const reg = achar(e.contratos, (c) => c.numero === numero, `Contrato ${numero}`);
  if (reg.situacao === 'cancelado') falha(409, `O contrato ${numero} já está cancelado.`);
  if (!motivo?.trim()) falha(422, 'Informe o motivo do cancelamento.', { motivo: 'Motivo obrigatório.' });
  if (e.fardos.some((f) => f.contratoId === reg.id && f.recebidoEm && !f.conclusaoInspecao)) falha(409, 'Há fardos deste contrato aguardando inspeção: conclua antes de cancelar.');
  reg.situacao = 'cancelado';
  reg.motivoCancelamento = motivo.trim();
  for (const f of e.fardos.filter((x) => x.contratoId === reg.id && !x.recebidoEm)) f.historico.push(evento(ctx, 'cancelado', `Contrato cancelado: ${motivo.trim()}`));
  return reg;
}
