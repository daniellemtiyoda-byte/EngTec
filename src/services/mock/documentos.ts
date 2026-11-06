import type { Id } from '../../types/models';
import { chaveAcessoValida, mesmoCnpj } from '../../utils/nfeXml';
import type { ArquivosEntrega, DadosEntrega } from '../contracts';
import { contratoView } from './consultas';
import { achar, anexo, evento, falha, instante, novoId, type Ctx, type EntregaReg, type Estado } from './estado';

const DATA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Cadastra a NF e a DOF e cria a entrega "a caminho" (seção 9.9 do plano). Usada pela tela NF e DOF, pelo
 * recebimento (exceção: material que chegou sem cadastro) e pelo Simulador.
 */
export function cadastrarEntrega(e: Estado, dados: DadosEntrega, origem: EntregaReg['origem'], ctx: Ctx, arquivos: ArquivosEntrega = {}): EntregaReg {
  const { nf, dof } = dados;
  const reg = e.contratos.find((c) => c.id === nf.contratoId);
  if (!reg) falha(422, 'Escolha o contrato da NF.', { 'nf.contratoId': 'Contrato não encontrado.' });
  const contrato = contratoView(e, reg);
  if (contrato.situacao === 'cancelado') falha(422, `O contrato ${contrato.numero} está cancelado.`, { 'nf.contratoId': 'Contrato cancelado.' });
  const fornecedor = achar(e.fornecedores, (f) => f.id === contrato.fornecedorId, 'Fornecedor');

  // NF
  const campos: Record<string, string> = {};
  if (!nf.numero?.trim()) campos['nf.numero'] = 'Informe o número da NF.';
  const chave = (nf.chaveAcesso ?? '').replace(/\D/g, '');
  if (!chaveAcessoValida(chave)) campos['nf.chaveAcesso'] = 'A chave de acesso tem 44 dígitos e um dígito verificador válido.';
  else if (!mesmoCnpj(chave.slice(6, 20), fornecedor.cnpj)) campos['nf.chaveAcesso'] = `A chave não é do CNPJ do fornecedor do contrato (${fornecedor.razaoSocial}).`;
  if (!DATA.test(nf.emissao ?? '')) campos['nf.emissao'] = 'Informe a data de emissão.';
  if (!nf.itens?.length) campos['nf.itens'] = 'Informe ao menos um item da NF.';
  nf.itens?.forEach((i, n) => {
    if (!contrato.itens.some((ic) => ic.id === i.itemContratoId)) campos[`nf.itens.${n}`] = 'Item não pertence ao contrato.';
    else if (!Number.isInteger(i.quantidade) || i.quantidade <= 0) campos[`nf.itens.${n}`] = 'Quantidade em unidades, maior que zero.';
    else if (!(i.volumeM3 >= 0)) campos[`nf.itens.${n}`] = 'Volume inválido.';
  });
  // DOF: sem DOF não há entrega.
  if (!dof?.numero?.trim()) campos['dof.numero'] = 'Informe o número da DOF: sem DOF não há entrega.';
  if (!DATA.test(dof?.validade ?? '')) campos['dof.validade'] = 'Informe a validade da DOF.';
  const especiesDoContrato = new Set(contrato.itens.map((i) => i.especieId));
  if (!dof?.volumes?.length) campos['dof.volumes'] = 'Informe o volume por espécie, como no documento.';
  dof?.volumes?.forEach((v, n) => {
    if (!especiesDoContrato.has(v.especieId)) campos[`dof.volumes.${n}`] = 'Espécie fora do contrato.';
    else if (!(v.volumeM3 > 0)) campos[`dof.volumes.${n}`] = 'Volume maior que zero.';
  });
  if (Object.keys(campos).length) falha(422, 'Confira os dados da NF e da DOF.', campos);

  const repetida = e.nfs.find((n) => n.chaveAcesso === chave);
  if (repetida) falha(409, `Esta chave de acesso já foi cadastrada (NF ${repetida.numero}).`, { 'nf.chaveAcesso': 'Chave de acesso já cadastrada.' });
  if (e.dofs.some((d) => d.numero === dof.numero.trim())) falha(409, `A DOF ${dof.numero} já foi cadastrada.`, { 'dof.numero': 'DOF já cadastrada.' });

  // Fardos indicados (opcional): emitidos do contrato, em trânsito e sem entrega.
  const fardosIds = [...new Set(dados.fardosIds ?? [])];
  for (const id of fardosIds) {
    const f = e.fardos.find((x) => x.id === id);
    if (!f || f.contratoId !== contrato.id) falha(422, `O fardo ${id} não é deste contrato.`, { fardosIds: `Fardo ${id} fora do contrato.` });
    if (f.recebidoEm || f.entregaId) falha(409, `O fardo ${id} já está em outra entrega ou já foi recebido.`, { fardosIds: `Fardo ${id} indisponível.` });
  }

  const entregaId = novoId(e, 'en');
  const nfId = novoId(e, 'nf');
  const dofId = novoId(e, 'dof');
  e.nfs.push({
    id: nfId, numero: nf.numero.trim(), serie: nf.serie?.trim() || '1', chaveAcesso: chave, fornecedorId: fornecedor.id, contratoId: contrato.id,
    emissao: nf.emissao, entregaId, xml: anexo(e, ctx, arquivos.xml, 'xml'), itens: nf.itens.map((i) => ({ ...i })), criadoEm: instante(ctx), criadoPor: ctx.quem,
  });
  e.dofs.push({ id: dofId, numero: dof.numero.trim(), nfId, validade: dof.validade, volumes: dof.volumes.map((v) => ({ ...v })), pdf: anexo(e, ctx, arquivos.pdf, 'pdf') });
  const entrega: EntregaReg = { id: entregaId, contratoId: contrato.id, nfId, dofId, fardosIds, situacao: 'a_caminho', origem, criadoEm: instante(ctx), criadoPor: ctx.quem };
  e.entregas.push(entrega);
  for (const f of e.fardos.filter((x) => fardosIds.includes(x.id))) f.entregaId = entregaId;
  return entrega;
}

/** Marca a DOF como declarada no Sinaflor, com quem e quando. */
export function declararDof(e: Estado, dofId: Id, ctx: Ctx) {
  const d = achar(e.dofs, (x) => x.id === dofId, 'DOF');
  if (d.declarado) falha(409, `A DOF ${d.numero} já foi declarada.`);
  // A declaração no Sinaflor confirma o recebimento: só depois que algum fardo da entrega chegou.
  const daEntrega = e.entregas.find((en) => en.dofId === d.id);
  if (daEntrega?.situacao === 'a_caminho') falha(409, `A DOF ${d.numero} só pode ser declarada depois do recebimento da entrega.`);
  d.declarado = { quando: instante(ctx), quem: ctx.quem };
  const entrega = e.entregas.find((en) => en.dofId === d.id);
  const nf = e.nfs.find((n) => n.id === d.nfId);
  // O registro fica também no histórico dos fardos da entrega, para a ficha mostrar a origem completa.
  if (entrega) for (const f of e.fardos.filter((x) => x.entregaId === entrega.id)) f.historico.push(evento(ctx, 'ocorrencia', `DOF ${d.numero} declarada no Sinaflor`, nf ? `NF ${nf.numero}` : undefined));
  return d;
}
