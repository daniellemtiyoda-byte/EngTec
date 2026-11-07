import { dataSP } from '../../dominio/parametros';
import type { BoletimInspecao, Id, RelatorioTecnico } from '../../types/models';
import { chaveAcessoValida, mesmoCnpj } from '../../utils/nfeXml';
import type { ArquivosEntrega, DadosEntrega } from '../contracts';
import { contratoView } from './consultas';
import { achar, anexo, registrar, falha, instante, novoId, type Ctx, type EntregaReg, type Estado } from './estado';

const DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Reprovados do contrato ainda não retirados pelo fornecedor. Enquanto houver, a reentrega (reposição) não é aceita. */
export const reprovadosAguardandoRetirada = (e: Estado, contratoId: Id) => e.dormentes.filter((d) => d.contratoId === contratoId && d.situacao === 'reprovado').length;

export function exigirReentregaLiberada(e: Estado, contratoId: Id) {
  const pendentes = reprovadosAguardandoRetirada(e, contratoId);
  if (pendentes) falha(409, `Reentrega só depois da retirada dos reprovados: ${pendentes} dormente(s) deste contrato ainda aguardam retirada pelo fornecedor.`, { reentrega: 'Reprovados aguardando retirada.' });
}

/**
 * Cadastra a NF e a DOF (e, se vierem, o Boletim de Inspeção e o Relatório Técnico) e cria a entrega "a caminho",
 * vinculada a uma parcela do cronograma (seção 9.9 do plano). Usada pela tela NF e DOF, pelo recebimento (exceção:
 * material que chegou sem cadastro) e pelo Simulador.
 */
export function cadastrarEntrega(e: Estado, dados: DadosEntrega, origem: EntregaReg['origem'], ctx: Ctx, arquivos: ArquivosEntrega = {}): EntregaReg {
  const { nf, dof } = dados;
  const reg = e.contratos.find((c) => c.id === nf.contratoId);
  if (!reg) falha(422, 'Escolha o contrato da NF.', { 'nf.contratoId': 'Contrato não encontrado.' });
  const contrato = contratoView(e, reg, dataSP(ctx.agora()));
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
  const parcela = reg.parcelas.find((p) => p.numero === dados.parcela);
  if (!parcela) campos.parcela = 'Escolha a parcela do cronograma do contrato.';
  nf.itens?.forEach((i, n) => {
    const ic = contrato.itens.find((x) => x.id === i.itemContratoId);
    if (!ic) campos[`nf.itens.${n}`] = 'Item não pertence ao contrato.';
    else if (parcela && !parcela.itens.some((x) => x.tamanhoId === ic.tamanhoId)) campos[`nf.itens.${n}`] = `Tamanho fora da ${parcela.numero}ª parcela.`;
    else if (!Number.isInteger(i.quantidade) || i.quantidade <= 0) campos[`nf.itens.${n}`] = 'Quantidade em unidades, maior que zero.';
    else if (!(i.volumeM3 >= 0)) campos[`nf.itens.${n}`] = 'Volume inválido.';
  });
  // DOF: sem DOF não há entrega.
  if (!dof?.numero?.trim()) campos['dof.numero'] = 'Informe o número da DOF: sem DOF não há entrega.';
  if (!DATA.test(dof?.validade ?? '')) campos['dof.validade'] = 'Informe a validade da DOF.';
  // Espécies que o fornecedor fornece (o contrato não define espécie).
  const especiesDoContrato = new Set(fornecedor.especiesIds);
  if (!dof?.volumes?.length) campos['dof.volumes'] = 'Informe o volume por espécie, como no documento.';
  dof?.volumes?.forEach((v, n) => {
    if (!especiesDoContrato.has(v.especieId)) campos[`dof.volumes.${n}`] = 'Espécie que o fornecedor não fornece.';
    else if (!(v.volumeM3 > 0)) campos[`dof.volumes.${n}`] = 'Volume maior que zero.';
  });
  // Boletim de Inspeção (opcional): empresa inspetora ativa e, por tamanho do contrato, espécies e quantidades aprovadas.
  const b = dados.boletim;
  if (b) {
    if (!b.numero?.trim()) campos['boletim.numero'] = 'Informe o número do boletim.';
    if (!DATA.test(b.data ?? '')) campos['boletim.data'] = 'Informe a data do boletim.';
    const emp = e.empresasInspetoras.find((x) => x.id === b.empresaInspetoraId);
    if (!emp) campos['boletim.empresaInspetoraId'] = 'Escolha a empresa inspetora.';
    else if (!emp.ativo) campos['boletim.empresaInspetoraId'] = `A empresa ${emp.nome} está inativa.`;
    b.itens?.forEach((i, n) => {
      if (!contrato.itens.some((ic) => ic.tamanhoId === i.tamanhoId)) campos[`boletim.itens.${n}`] = 'Tamanho fora do contrato.';
      else if (!e.especies.some((x) => x.id === i.especieId)) campos[`boletim.itens.${n}`] = 'Escolha a espécie.';
      else if (!Number.isInteger(i.quantidade) || i.quantidade <= 0) campos[`boletim.itens.${n}`] = 'Quantidade aprovada, maior que zero.';
    });
  }
  const rt = dados.relatorioTecnico;
  if (rt) {
    if (!rt.numero?.trim()) campos['relatorioTecnico.numero'] = 'Informe o número do relatório.';
    if (!DATA.test(rt.data ?? '')) campos['relatorioTecnico.data'] = 'Informe a data do relatório.';
  }
  if (Object.keys(campos).length) falha(422, 'Confira os dados da NF e da DOF.', campos);
  if (dados.reentrega) exigirReentregaLiberada(e, contrato.id);

  const repetida = e.nfs.find((n) => n.chaveAcesso === chave);
  if (repetida) falha(409, `Esta chave de acesso já foi cadastrada (NF ${repetida.numero}).`, { 'nf.chaveAcesso': 'Chave de acesso já cadastrada.' });
  if (e.dofs.some((d) => d.numero === dof.numero.trim())) falha(409, `A DOF ${dof.numero} já foi cadastrada.`, { 'dof.numero': 'DOF já cadastrada.' });

  // Emissão do fornecedor com a mesma chave (Simulador): sem fardos indicados, os dela que seguem livres viram os esperados.
  const emissao = e.emissoes.find((x) => x.nf.chaveAcesso === chave && !x.entregaId);
  // Fardos indicados (opcional): emitidos do contrato, em trânsito e sem entrega.
  const indicados = dados.fardosIds?.length ? dados.fardosIds : emissao?.fardosIds.filter((id) => e.fardos.some((f) => f.id === id && !f.entregaId && !f.recebidoEm)) ?? [];
  const fardosIds = [...new Set(indicados)];
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
  const boletim: BoletimInspecao | undefined = b && {
    numero: b.numero.trim(), data: b.data, empresaInspetoraId: b.empresaInspetoraId, itens: b.itens.map((i) => ({ ...i })), arquivo: anexo(e, ctx, arquivos.boletim, 'pdf'),
  };
  const relatorioTecnico: RelatorioTecnico | undefined = rt && { numero: rt.numero.trim(), data: rt.data, arquivo: anexo(e, ctx, arquivos.relatorio, 'pdf') };
  const entrega: EntregaReg = {
    id: entregaId, contratoId: contrato.id, nfId, dofId, fardosIds, parcela: dados.parcela, reentrega: !!dados.reentrega, situacao: 'a_caminho', origem, boletim, relatorioTecnico,
    criadoEm: instante(ctx), criadoPor: ctx.quem,
  };
  e.entregas.push(entrega);
  for (const f of e.fardos.filter((x) => fardosIds.includes(x.id))) f.entregaId = entregaId;
  if (emissao) emissao.entregaId = entregaId;
  const desc = `Entrega da NF ${nf.numero} cadastrada (${dados.parcela}ª parcela${dados.reentrega ? ', reentrega' : ''}; ${origem})`;
  registrar(e, ctx, 'entrega', entregaId, 'criado', desc, `NF ${nf.numero}`);
  registrar(e, ctx, 'contrato', contrato.id, 'criado', desc, `NF ${nf.numero}`);
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
  if (daEntrega) registrar(e, ctx, 'entrega', daEntrega.id, 'declarado', `DOF ${d.numero} declarada no Sinaflor`, `DOF ${d.numero}`);
  const entrega = e.entregas.find((en) => en.dofId === d.id);
  const nf = e.nfs.find((n) => n.id === d.nfId);
  // O registro fica também no histórico dos fardos da entrega, para a ficha mostrar a origem completa.
  if (entrega) for (const f of e.fardos.filter((x) => x.entregaId === entrega.id)) registrar(e, ctx, 'fardo', f.id, 'declarado', `DOF ${d.numero} declarada no Sinaflor`, nf ? `NF ${nf.numero}` : undefined);
  return d;
}
