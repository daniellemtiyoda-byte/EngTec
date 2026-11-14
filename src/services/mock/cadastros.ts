import { RE_ATA, RE_CODIGO_LOCAL, RE_CONTRATO } from '../../dominio/identificacao';
import { REGRAS_ATA_PADRAO, VIGENCIA_ATA_MESES, somarDias, somarMeses } from '../../dominio/parametros';
import type { EmpresaInspetora, Especie, Id, RegrasAta, Tratamento } from '../../types/models';
import type {
  DadosAta, DadosAtualizacaoAta, DadosAtualizacaoContrato, DadosContrato, DadosEmpresaInspetora, DadosEspecie, DadosFornecedor, DadosLocal, DadosParcela, DadosTamanho, DadosTratamento,
} from '../contracts';
import { ataView, contratoView, fornecedorView, localView } from './consultas';
import {
  achar, falha, hoje, instante, novoId, registrar, type AtaReg, type ContratoReg, type Ctx, type Estado, type FornecedorReg, type LocalReg, type ParcelaReg, type TamanhoReg,
} from './estado';

/* Cadastros (seção 9.18 do plano): nada é apagado, só inativado. Atas e contratos (seções 9.3 e 9.4). */

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const igual = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
function exigirCampos(campos: Record<string, string>, mensagem = 'Confira os campos destacados.') {
  if (Object.keys(campos).length) falha(422, mensagem, campos);
}

// ---------- Fornecedor ----------

export function salvarFornecedor(e: Estado, dados: Partial<DadosFornecedor>, ctx: Ctx, id?: Id): FornecedorReg {
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
  registrar(e, ctx, 'fornecedor', reg.id, atual ? 'alterado' : 'criado', `Fornecedor ${reg.razaoSocial} ${atual ? 'alterado' : 'cadastrado'}`);
  return atual ?? reg;
}

// ---------- Espécie, tamanho, tratamento, local ----------

export function salvarEspecie(e: Estado, dados: Partial<DadosEspecie>, ctx: Ctx, id?: Id): Especie {
  const atual = id ? achar(e.especies, (x) => x.id === id, 'Espécie') : undefined;
  const v = { ...atual, ...dados } as DadosEspecie;
  const campos: Record<string, string> = {};
  if (!v.nomeCientifico?.trim()) campos.nomeCientifico = 'Informe o nome científico.';
  else if (e.especies.some((x) => x.id !== id && igual(x.nomeCientifico, v.nomeCientifico))) campos.nomeCientifico = 'Espécie já cadastrada.';
  if (!v.nomePopular?.trim()) campos.nomePopular = 'Informe o nome popular.';
  exigirCampos(campos);
  const reg: Especie = { id: atual?.id ?? novoId(e, 'es'), nomeCientifico: v.nomeCientifico.trim(), nomePopular: v.nomePopular.trim(), ativo: atual?.ativo ?? true };
  if (atual) Object.assign(atual, reg); else e.especies.push(reg);
  registrar(e, ctx, 'cadastro', reg.id, atual ? 'alterado' : 'criado', `Espécie ${reg.nomePopular} ${atual ? 'alterada' : 'cadastrada'}`);
  return atual ?? reg;
}

export function salvarTamanho(e: Estado, dados: Partial<DadosTamanho>, ctx: Ctx, id?: Id): TamanhoReg {
  const atual = id ? achar(e.tamanhos, (x) => x.id === id, 'Tamanho') : undefined;
  const v = { ...atual, ...dados } as DadosTamanho;
  const campos: Record<string, string> = {};
  if (!/^\d{6}$/.test(v.codigo?.trim() ?? '')) campos.codigo = 'Código de material CPTM com 6 dígitos (ex. 006234).';
  else if (e.tamanhos.some((x) => x.id !== id && igual(x.codigo, v.codigo))) campos.codigo = 'Código já utilizado.';
  for (const k of ['comprimentoCm', 'larguraCm', 'alturaCm'] as const) if (!(v[k] > 0)) campos[k] = 'Medida em cm, maior que zero.';
  if (v.uso !== 'via_corrente' && v.uso !== 'amv') campos.uso = 'Escolha o uso: via corrente ou AMV.';
  exigirCampos(campos);
  const reg: TamanhoReg = {
    id: atual?.id ?? novoId(e, 'ta'), codigo: v.codigo.trim(), uso: v.uso, comprimentoCm: v.comprimentoCm, larguraCm: v.larguraCm, alturaCm: v.alturaCm,
    medidas: v.medidas ?? 'provisorio', ativo: atual?.ativo ?? true,
  };
  if (atual) Object.assign(atual, reg); else e.tamanhos.push(reg);
  registrar(e, ctx, 'cadastro', reg.id, atual ? 'alterado' : 'criado', `Tamanho ${reg.codigo} ${atual ? 'alterado' : 'cadastrado'}`);
  return atual ?? reg;
}

export function salvarTratamento(e: Estado, dados: Partial<DadosTratamento>, ctx: Ctx, id?: Id): Tratamento {
  const atual = id ? achar(e.tratamentos, (x) => x.id === id, 'Tratamento') : undefined;
  const v = { ...atual, ...dados } as DadosTratamento;
  const campos: Record<string, string> = {};
  if (!v.preservativo?.trim()) campos.preservativo = 'Informe o preservativo.';
  if (!v.empresa?.trim()) campos.empresa = 'Informe a empresa de tratamento.';
  if (!campos.preservativo && !campos.empresa && e.tratamentos.some((x) => x.id !== id && igual(x.preservativo, v.preservativo) && igual(x.empresa, v.empresa))) campos.preservativo = 'Tratamento já cadastrado.';
  exigirCampos(campos);
  const reg: Tratamento = { id: atual?.id ?? novoId(e, 'tr'), preservativo: v.preservativo.trim(), empresa: v.empresa.trim(), ativo: atual?.ativo ?? true };
  if (atual) Object.assign(atual, reg); else e.tratamentos.push(reg);
  registrar(e, ctx, 'cadastro', reg.id, atual ? 'alterado' : 'criado', `Tratamento ${reg.preservativo} / ${reg.empresa} ${atual ? 'alterado' : 'cadastrado'}`);
  return atual ?? reg;
}

export function salvarEmpresaInspetora(e: Estado, dados: Partial<DadosEmpresaInspetora>, ctx: Ctx, id?: Id): EmpresaInspetora {
  const atual = id ? achar(e.empresasInspetoras, (x) => x.id === id, 'Empresa inspetora') : undefined;
  const v = { ...atual, ...dados } as DadosEmpresaInspetora;
  const cnpj = (v.cnpj ?? '').replace(/\D/g, '');
  const campos: Record<string, string> = {};
  if (!v.nome?.trim()) campos.nome = 'Informe o nome.';
  else if (e.empresasInspetoras.some((x) => x.id !== id && igual(x.nome, v.nome))) campos.nome = 'Empresa já cadastrada.';
  if (cnpj && cnpj.length !== 14) campos.cnpj = 'O CNPJ tem 14 dígitos (ou deixe em branco).';
  else if (cnpj && e.empresasInspetoras.some((x) => x.id !== id && x.cnpj === cnpj)) campos.cnpj = 'CNPJ já cadastrado.';
  exigirCampos(campos);
  const reg: EmpresaInspetora = { id: atual?.id ?? novoId(e, 'ei'), nome: v.nome.trim(), cnpj: cnpj || undefined, ativo: atual?.ativo ?? true };
  if (atual) Object.assign(atual, reg); else e.empresasInspetoras.push(reg);
  registrar(e, ctx, 'cadastro', reg.id, atual ? 'alterado' : 'criado', `Empresa inspetora ${reg.nome} ${atual ? 'alterada' : 'cadastrada'}`);
  return atual ?? reg;
}

/**
 * Inativa ou reativa um cadastro simples (espécie, tamanho, tratamento, empresa inspetora). Nada é apagado; o que
 * está inativo não entra em novos contratos, mas continua nos registros antigos.
 */
export function alterarAtivo<T extends { id: Id; ativo: boolean }>(e: Estado, ctx: Ctx, lista: T[], id: Id, ativo: boolean, oQue: string): T {
  const x = achar(lista, (i) => i.id === id, oQue);
  if (x.ativo === ativo) falha(409, `${oQue} já está ${ativo ? 'ativo' : 'inativo'}.`);
  x.ativo = ativo;
  registrar(e, ctx, oQue === 'Local' ? 'local' : 'cadastro', x.id, ativo ? 'reativado' : 'inativado', `${oQue} ${ativo ? 'reativado' : 'inativado'}`);
  return x;
}

export function situacaoFornecedor(e: Estado, id: Id, situacao: 'ativo' | 'inativo', ctx: Ctx) {
  const f = achar(e.fornecedores, (x) => x.id === id, 'Fornecedor');
  if (f.situacao === situacao) falha(409, `O fornecedor já está ${situacao}.`);
  // Reativar não desbloqueia: o bloqueio pelo CTF vencido continua calculado pela validade.
  f.situacao = situacao;
  registrar(e, ctx, 'fornecedor', f.id, situacao === 'ativo' ? 'reativado' : 'inativado', `Fornecedor ${f.razaoSocial} ${situacao === 'ativo' ? 'reativado' : 'inativado'}`);
  return f;
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
  registrar(e, ctx, 'local', reg.id, atual ? 'alterado' : 'criado', `Local ${reg.codigo} ${atual ? 'alterado' : 'cadastrado'}`);
  return atual ?? reg;
}

export function inativarLocal(e: Estado, id: Id, ctx: Ctx) {
  const l = achar(e.locais, (x) => x.id === id, 'Local');
  if (!l.ativo) falha(409, `O local ${l.codigo} já está inativo.`);
  if (localView(e, l, hoje(ctx)).ocupacao > 0) falha(409, `O local ${l.codigo} tem dormentes: transfira os fardos antes de inativar.`);
  l.ativo = false;
  registrar(e, ctx, 'local', l.id, 'inativado', `Local ${l.codigo} inativado`);
  return l;
}

/** Reativar o local: o código continua o mesmo (está no QR impresso). */
export function reativarLocal(e: Estado, id: Id, ctx: Ctx) {
  return alterarAtivo(e, ctx, e.locais, id, true, 'Local');
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

/** Regras da ata: as padrão (documentos da CPTM) com o que vier informado por cima, validadas. */
function regrasDaAta(r: Partial<RegrasAta> | undefined, campos: Record<string, string>): RegrasAta {
  const regras: RegrasAta = { ...REGRAS_ATA_PADRAO, ...r, prazosParcelas: r?.prazosParcelas ?? REGRAS_ATA_PADRAO.prazosParcelas.map((p) => [...p] as [number, number]) };
  const inteiro = (n: number) => Number.isInteger(n) && n > 0;
  if (!inteiro(regras.pedidoMinimo)) campos['regras.pedidoMinimo'] = 'Pedido mínimo em dormentes, maior que zero.';
  if (!inteiro(regras.maxParcelas) || regras.maxParcelas > regras.prazosParcelas.length) campos['regras.maxParcelas'] = `De 1 a ${regras.prazosParcelas.length} parcelas.`;
  if (!inteiro(regras.parcelaMinima)) campos['regras.parcelaMinima'] = 'Parcela mínima em dormentes, maior que zero.';
  if (!inteiro(regras.parcelaMaxima) || regras.parcelaMaxima < regras.parcelaMinima) campos['regras.parcelaMaxima'] = 'A parcela máxima não pode ser menor que a mínima.';
  // Janelas de entrega em dias da assinatura: a 1ª começa em 0 ou depois, cada uma termina depois de começar e a seguinte
  // começa depois do fim da anterior.
  let fimAnterior = -1;
  regras.prazosParcelas.forEach(([de, ate], n) => {
    if (!Number.isInteger(de) || !Number.isInteger(ate) || de < 0 || ate < de) campos[`regras.prazosParcelas.${n}`] = 'Janela em dias da assinatura: o fim não vem antes do início.';
    else if (de <= fimAnterior) campos[`regras.prazosParcelas.${n}`] = `A ${n + 1}ª parcela começa depois do fim da anterior (dia ${fimAnterior}).`;
    fimAnterior = Number.isInteger(ate) ? ate : fimAnterior;
  });
  return regras;
}

/** Vigência, regras e itens da ata (cadastro e edição): itens obrigatórios, um por tamanho ativo, com quantidade. */
function dadosDaAta(e: Estado, dados: DadosAtualizacaoAta, campos: Record<string, string>) {
  if (!DATA.test(dados.vigenciaInicio ?? '')) campos.vigenciaInicio = 'Informe o início da vigência.';
  const vigenciaFim = dados.vigenciaFim || (DATA.test(dados.vigenciaInicio ?? '') ? somarDias(somarMeses(dados.vigenciaInicio, VIGENCIA_ATA_MESES), -1) : '');
  if (!DATA.test(vigenciaFim)) campos.vigenciaFim = 'Informe o fim da vigência.';
  else if (vigenciaFim <= dados.vigenciaInicio) campos.vigenciaFim = 'O fim vem depois do início.';
  const regras = regrasDaAta(dados.regras, campos);
  if (!dados.itens?.length) campos.itens = 'Registre ao menos um tamanho com a quantidade.';
  const vistos = new Set<Id>();
  (dados.itens ?? []).forEach((i, n) => {
    if (!e.tamanhos.some((t) => t.id === i.tamanhoId && t.ativo)) campos[`itens.${n}`] = 'Escolha um tamanho ativo.';
    else if (vistos.has(i.tamanhoId)) campos[`itens.${n}`] = 'Tamanho repetido.';
    else if (!Number.isInteger(i.quantidade) || i.quantidade <= 0) campos[`itens.${n}`] = 'Quantidade registrada em unidades, maior que zero.';
    vistos.add(i.tamanhoId);
  });
  return { vigenciaFim, regras, itens: (dados.itens ?? []).map((i) => ({ tamanhoId: i.tamanhoId, quantidade: i.quantidade })) };
}

/** Ata de registro de preços: fornecedor liberado, vigência (12 meses sugeridos), regras próprias e os itens registrados. */
export function criarAta(e: Estado, dados: DadosAta, ctx: Ctx): AtaReg {
  const numero = (dados.numero ?? '').trim().toUpperCase();
  const campos: Record<string, string> = {};
  if (!RE_ATA.test(numero)) campos.numero = 'Número no formato AA00000 (ex. AR00224).';
  else if (e.atas.some((a) => a.numero === numero)) campos.numero = 'Ata já cadastrada.';
  const v = dadosDaAta(e, dados, campos);
  exigirCampos(campos);
  exigirFornecedorLiberado(e, dados.fornecedorId, ctx, 'fornecedorId');
  const ata: AtaReg = { id: novoId(e, 'at'), numero, fornecedorId: dados.fornecedorId, vigenciaInicio: dados.vigenciaInicio, ...v };
  e.atas.push(ata);
  registrar(e, ctx, 'ata', ata.id, 'criado', `Ata ${ata.numero} cadastrada (vigência até ${ata.vigenciaFim})`, ata.numero);
  return ata;
}

/**
 * Edição da ata (fornecedor, vigência, regras e itens; o número não muda) só enquanto ela não tem contrato, cancelado
 * também: o primeiro contrato é o momento em que as regras são validadas e passam a valer.
 */
export function atualizarAta(e: Estado, numero: string, dados: DadosAtualizacaoAta, ctx: Ctx): AtaReg {
  const ata = achar(e.atas, (a) => a.numero === (numero ?? '').trim().toUpperCase(), `Ata ${numero}`);
  const n = e.contratos.filter((c) => c.ataId === ata.id).length;
  if (n) falha(409, `A ata ${ata.numero} já tem ${n === 1 ? 'um contrato' : `${n} contratos`}: regras, vigência e itens não mudam mais.`);
  const campos: Record<string, string> = {};
  const v = dadosDaAta(e, dados, campos);
  exigirCampos(campos);
  exigirFornecedorLiberado(e, dados.fornecedorId, ctx, 'fornecedorId');
  Object.assign(ata, { fornecedorId: dados.fornecedorId, vigenciaInicio: dados.vigenciaInicio, ...v });
  registrar(e, ctx, 'ata', ata.id, 'alterado', `Ata ${ata.numero} alterada (vigência até ${ata.vigenciaFim})`, ata.numero);
  return ata;
}

/**
 * Valida o cronograma pelas regras da ata: total do contrato no mínimo o pedido mínimo, até o máximo de parcelas, cada
 * parcela (somando os itens) entre a mínima e a máxima, tamanhos ativos e, com quantidades registradas na ata, dentro
 * do saldo de cada tamanho. Devolve os itens do contrato (a soma das parcelas por tamanho).
 */
function validarCronograma(e: Estado, ata: AtaReg, parcelas: DadosParcela[], campos: Record<string, string>, ctx: Ctx, contratoAtual?: ContratoReg) {
  const r = ata.regras;
  if (!parcelas?.length) campos.parcelas = 'Informe ao menos uma parcela.';
  else if (parcelas.length > r.maxParcelas) campos.parcelas = `A ata permite até ${r.maxParcelas} parcelas.`;
  const porTamanho = new Map<Id, number>();
  (parcelas ?? []).forEach((p, n) => {
    const vistos = new Set<Id>();
    let soma = 0;
    p.itens.forEach((i, k) => {
      if (!e.tamanhos.some((t) => t.id === i.tamanhoId && (t.ativo || contratoAtual?.itens.some((x) => x.tamanhoId === i.tamanhoId)))) campos[`parcelas.${n}.${k}`] = 'Escolha um tamanho ativo.';
      else if (vistos.has(i.tamanhoId)) campos[`parcelas.${n}.${k}`] = 'Tamanho repetido na parcela.';
      else if (!Number.isInteger(i.quantidade) || i.quantidade < 0) campos[`parcelas.${n}.${k}`] = 'Quantidade em unidades.';
      vistos.add(i.tamanhoId);
      soma += i.quantidade > 0 ? i.quantidade : 0;
      porTamanho.set(i.tamanhoId, (porTamanho.get(i.tamanhoId) ?? 0) + (i.quantidade > 0 ? i.quantidade : 0));
    });
    if (soma < r.parcelaMinima || soma > r.parcelaMaxima) campos[`parcelas.${n}`] = `A ${n + 1}ª parcela soma ${soma}: cada parcela tem de ${r.parcelaMinima} a ${r.parcelaMaxima} dormentes.`;
  });
  const total = [...porTamanho.values()].reduce((t, q) => t + q, 0);
  if (parcelas?.length && total < r.pedidoMinimo) campos.parcelas = `O contrato soma ${total} dormentes: o pedido mínimo da ata é ${r.pedidoMinimo}.`;
  if (ata.itens.length) {
    const v = ataView(e, ata, hoje(ctx));
    for (const [tamanhoId, q] of porTamanho) {
      const item = v.itens.find((i) => i.tamanhoId === tamanhoId);
      const jaNoContrato = contratoAtual?.itens.find((i) => i.tamanhoId === tamanhoId)?.quantidade ?? 0;
      const codigo = e.tamanhos.find((t) => t.id === tamanhoId)?.codigo ?? tamanhoId;
      if (!item) campos.parcelas = `O tamanho ${codigo} não está registrado na ata ${ata.numero}.`;
      else if (q > item.saldo + jaNoContrato) campos.parcelas = `O tamanho ${codigo} passa do saldo da ata (${item.saldo + jaNoContrato}).`;
    }
  }
  return porTamanho;
}

const parcelasReg = (parcelas: DadosParcela[]): ParcelaReg[] =>
  parcelas.map((p, n) => ({ numero: n + 1, itens: p.itens.filter((i) => i.quantidade > 0).map((i) => ({ tamanhoId: i.tamanhoId, quantidade: i.quantidade })) }));

export function criarContrato(e: Estado, dados: DadosContrato, ctx: Ctx): ContratoReg {
  const numero = (dados.numero ?? '').trim().toUpperCase();
  const ata = e.atas.find((a) => a.id === dados.ataId);
  const campos: Record<string, string> = {};
  if (!ata) campos.ataId = 'Escolha a ata.';
  if (!RE_CONTRATO.test(numero)) campos.numero = 'Número no formato AA00000-00 (ex. AR00224-01).';
  else if (ata && !numero.startsWith(`${ata.numero}-`)) campos.numero = `O contrato começa pelo número da ata (${ata.numero}-).`;
  else if (e.contratos.some((c) => c.numero === numero)) campos.numero = 'Contrato já cadastrado.';
  if (!Number.isInteger(dados.ano) || dados.ano < 2000) campos.ano = 'Informe o ano.';
  if (!DATA.test(dados.dataAssinatura ?? '')) campos.dataAssinatura = 'Informe a data de assinatura.';
  else if (ata && (dados.dataAssinatura < ata.vigenciaInicio || dados.dataAssinatura > ata.vigenciaFim)) campos.dataAssinatura = `A ata ${ata.numero} vale de ${ata.vigenciaInicio} a ${ata.vigenciaFim}.`;
  if (!dados.gestor?.trim()) campos.gestor = 'Informe o gestor do contrato.';
  if (!dados.localEntrega?.trim()) campos.localEntrega = 'Informe o local de entrega.';
  exigirCampos(campos);
  exigirFornecedorLiberado(e, ata!.fornecedorId, ctx, 'ataId');
  const porTamanho = validarCronograma(e, ata!, dados.parcelas, campos, ctx);
  exigirCampos(campos, 'Confira o cronograma: as regras da ata não foram atendidas.');
  const reg: ContratoReg = {
    id: novoId(e, 'ct'), numero, ataId: ata!.id, ano: dados.ano, dataAssinatura: dados.dataAssinatura, gestor: dados.gestor.trim(), localEntrega: dados.localEntrega.trim(), situacao: 'vigente',
    itens: [...porTamanho].filter(([, q]) => q > 0).map(([tamanhoId, quantidade]) => ({ id: novoId(e, 'ic'), tamanhoId, quantidade })),
    parcelas: parcelasReg(dados.parcelas), criadoEm: instante(ctx), criadoPor: ctx.quem,
  };
  e.contratos.push(reg);
  registrar(e, ctx, 'contrato', reg.id, 'criado', `Contrato criado: ${reg.parcelas.length} parcela(s), ${reg.itens.reduce((t, i) => t + i.quantidade, 0)} dormentes (gestor ${reg.gestor})`, reg.numero);
  return reg;
}

/** Novo gestor ou novo cronograma (mesmas regras da ata); nenhum item abaixo do já emitido, descontados os reprovados. */
export function atualizarContrato(e: Estado, numero: string, dados: DadosAtualizacaoContrato, ctx: Ctx): ContratoReg {
  const reg = achar(e.contratos, (c) => c.numero === numero, `Contrato ${numero}`);
  if (reg.situacao === 'cancelado') falha(409, `O contrato ${numero} está cancelado.`);
  const campos: Record<string, string> = {};
  if (dados.gestor !== undefined && !dados.gestor.trim()) campos.gestor = 'Informe o gestor do contrato.';
  if (dados.localEntrega !== undefined && !dados.localEntrega.trim()) campos.localEntrega = 'Informe o local de entrega.';
  let porTamanho: Map<Id, number> | undefined;
  if (dados.parcelas) {
    const ata = achar(e.atas, (a) => a.id === reg.ataId, 'Ata');
    porTamanho = validarCronograma(e, ata, dados.parcelas, campos, ctx, reg);
    const v = contratoView(e, reg, hoje(ctx));
    for (const item of v.itens) {
      const q = porTamanho.get(item.tamanhoId) ?? 0;
      const codigo = e.tamanhos.find((t) => t.id === item.tamanhoId)?.codigo ?? item.tamanhoId;
      if (q < item.emitidos - item.reprovados) campos.parcelas = `O tamanho ${codigo} não pode ficar abaixo do já emitido (${item.emitidos - item.reprovados}).`;
    }
    // Entregas já vinculadas a uma parcela que deixaria de existir.
    const ultima = dados.parcelas.length;
    if (e.entregas.some((x) => x.contratoId === reg.id && x.parcela > ultima)) campos.parcelas = 'Há entregas em parcelas que deixariam de existir.';
  }
  exigirCampos(campos, 'Confira o cronograma: as regras da ata não foram atendidas.');
  if (dados.gestor !== undefined) reg.gestor = dados.gestor.trim();
  if (dados.localEntrega !== undefined) reg.localEntrega = dados.localEntrega.trim();
  if (dados.parcelas && porTamanho) {
    reg.parcelas = parcelasReg(dados.parcelas);
    for (const [tamanhoId, quantidade] of porTamanho) {
      const item = reg.itens.find((i) => i.tamanhoId === tamanhoId);
      if (item) item.quantidade = quantidade; else if (quantidade > 0) reg.itens.push({ id: novoId(e, 'ic'), tamanhoId, quantidade });
    }
    for (const item of reg.itens) if (!porTamanho.has(item.tamanhoId)) item.quantidade = 0;
  }
  registrar(e, ctx, 'contrato', reg.id, 'alterado', dados.parcelas ? 'Cronograma alterado' : 'Gestor alterado', reg.numero);
  return reg;
}

export function cancelarContrato(e: Estado, numero: string, motivo: string, ctx: Ctx): ContratoReg {
  const reg = achar(e.contratos, (c) => c.numero === numero, `Contrato ${numero}`);
  if (reg.situacao === 'cancelado') falha(409, `O contrato ${numero} já está cancelado.`);
  if (!motivo?.trim()) falha(422, 'Informe o motivo do cancelamento.', { motivo: 'Motivo obrigatório.' });
  if (e.fardos.some((f) => f.contratoId === reg.id && f.recebidoEm && !f.conclusaoInspecao)) falha(409, 'Há fardos deste contrato aguardando inspeção: conclua antes de cancelar.');
  reg.situacao = 'cancelado';
  reg.motivoCancelamento = motivo.trim();
  registrar(e, ctx, 'contrato', reg.id, 'cancelado', `Contrato cancelado: ${motivo.trim()}`, reg.numero);
  for (const f of e.fardos.filter((x) => x.contratoId === reg.id && !x.recebidoEm)) registrar(e, ctx, 'fardo', f.id, 'cancelado', `Contrato cancelado: ${motivo.trim()}`);
  return reg;
}
