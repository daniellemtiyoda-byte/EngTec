import { DIAS_AVISO_CTF, diasEntre } from '../../dominio/parametros';
import { ordinalClasse } from '../../dominio/rotulos';
import type { Permissao } from '../../dominio/permissoes';
import type { Alerta, Indicadores, Pendencia, SaldoItem, Usuario } from '../../types/models';
import { saldoPatio } from './ibama';
import { ataView, contratoView, dofView, entregaView, fardoView, fornecedorView, saldoPorItem } from './consultas';
import type { Estado } from './estado';

/* Painel (seção 9.2 do plano): números, "Para fazer agora" por permissão e alertas. Cada um leva à lista filtrada. */

/** Saldo de um tamanho nas atas vigentes (reposição: quanto ainda dá para contratar sem nova ata). */
export function saldoNasAtasVigentes(e: Estado, tamanhoId: string, dia: string) {
  return e.atas.map((a) => ataView(e, a, dia)).filter((a) => a.vigente)
    .map((a) => ({ ata: a.numero, saldo: a.itens.find((i) => i.tamanhoId === tamanhoId)?.saldo ?? 0 })).filter((x) => x.saldo > 0);
}

const nomeItem = (e: Estado, s: SaldoItem) => `${e.tamanhos.find((x) => x.id === s.tamanhoId)?.codigo ?? s.tamanhoId} · ${ordinalClasse(s.classe)} classe`;

export function indicadores(e: Estado, dia: string): Indicadores {
  const saldo = saldoPorItem(e, dia);
  const fardos = e.fardos.map((f) => fardoView(e, f, dia));
  return {
    emEstoque: e.dormentes.filter((d) => d.situacao === 'em_estoque').length,
    aguardandoInspecao: e.dormentes.filter((d) => d.situacao === 'aguardando_inspecao').length,
    itensAbaixoMinimo: saldo.filter((s) => s.situacao === 'falta').length,
    itensAcimaMaximo: saldo.filter((s) => s.situacao === 'excesso').length,
    fardosAcimaLimite: fardos.filter((f) => f.acimaLimiteDias).length,
    dofsADeclarar: e.dofs.filter((d) => !d.declarado).length,
    rmesAbertas: e.rmes.filter((r) => r.situacao === 'aberta').length,
    rmesEmSeparacao: e.rmes.filter((r) => r.situacao === 'em_separacao').length,
    naoLocalizados: e.dormentes.filter((d) => d.situacao === 'nao_localizado').length,
    parcelasAtrasadas: e.contratos.reduce((t, c) => t + contratoView(e, c, dia).parcelasAtrasadas, 0),
    laudosAVencer: e.entregas.map((x) => entregaView(e, x, dia)).filter((x) => x.nivelPrazoLaudo && x.nivelPrazoLaudo !== 'ok').length,
    reprovadosAguardandoRetirada: e.dormentes.filter((d) => d.situacao === 'reprovado').length,
  };
}

export function pendencias(e: Estado, u: Usuario, dia: string): Pendencia[] {
  const pode = (p: Permissao) => u.permissoes.includes(p);
  const fardos = e.fardos.map((f) => fardoView(e, f, dia));
  const lista: Pendencia[] = [];
  const add = (p: Pendencia) => { if (p.quantidade > 0) lista.push(p); };
  if (pode('recebimento:registrar')) {
    add({ id: 'receber', titulo: 'Entregas a receber', quantidade: e.entregas.filter((x) => x.situacao !== 'recebida').length, nivel: 'info', link: '/recebimentos', acao: 'Receber' });
  }
  if (pode('inspecao:operar')) {
    add({ id: 'inspecionar', titulo: 'Fardos a inspecionar', quantidade: fardos.filter((f) => f.situacao === 'aguardando_inspecao' || f.situacao === 'em_inspecao').length, nivel: 'info', link: '/inspecao', acao: 'Inspecionar' });
  }
  if (pode('rme:separar')) {
    add({ id: 'separar', titulo: 'RMEs abertas a separar', quantidade: e.rmes.filter((r) => r.situacao === 'aberta').length, nivel: 'atencao', link: '/saidas', acao: 'Separar' });
    add({ id: 'em-separacao', titulo: 'RMEs em separação', quantidade: e.rmes.filter((r) => r.situacao === 'em_separacao').length, nivel: 'info', link: '/saidas?situacao=em_separacao', acao: 'Continuar' });
    add({ id: 'entregar', titulo: 'RMEs prontas para entregar', quantidade: e.rmes.filter((r) => r.situacao === 'pronta').length, nivel: 'info', link: '/saidas?situacao=pronta', acao: 'Entregar' });
  }
  if (pode('dof:declarar')) {
    const dofs = e.dofs.filter((d) => !d.declarado).map((d) => dofView(e, d, dia));
    const urgentes = dofs.filter((d) => d.nivelPrazo === 'vencido' || d.nivelPrazo === 'critico').length;
    add({ id: 'dof', titulo: 'DOFs a declarar no Sinaflor', quantidade: dofs.length, nivel: urgentes ? 'critico' : 'atencao', link: '/documentos?aba=dofs', acao: 'Declarar' });
  }
  if (pode('painel:gestao')) {
    const saldo = saldoPorItem(e, dia);
    add({ id: 'falta', titulo: 'Itens abaixo do mínimo', quantidade: saldo.filter((s) => s.situacao === 'falta').length, nivel: 'critico', link: '/estoque?situacao=falta', acao: 'Ver itens' });
    add({ id: 'excesso', titulo: 'Itens acima do máximo', quantidade: saldo.filter((s) => s.situacao === 'excesso').length, nivel: 'atencao', link: '/estoque?situacao=excesso', acao: 'Ver itens' });
    add({ id: 'parados', titulo: 'Fardos acima do limite de dias', quantidade: fardos.filter((f) => f.acimaLimiteDias).length, nivel: 'atencao', link: '/estoque?visao=fardo&acimaLimite=sim', acao: 'Ver fardos' });
    add({ id: 'nao-localizados', titulo: 'Dormentes não localizados', quantidade: e.dormentes.filter((d) => d.situacao === 'nao_localizado').length, nivel: 'critico', link: '/inspecao?aba=nao_localizados', acao: 'Ver dormentes' });
  }
  if (pode('rme:abrir')) {
    add({ id: 'minhas-rmes', titulo: 'Minhas RMEs em andamento', quantidade: e.rmes.filter((r) => r.solicitanteId === u.id && ['aberta', 'em_separacao', 'pronta'].includes(r.situacao)).length, nivel: 'info', link: '/saidas?minhas=sim', acao: 'Acompanhar' });
  }
  if (pode('admin')) {
    add({ id: 'ctf', titulo: `Fornecedores com CTF vencendo em ${DIAS_AVISO_CTF} dias`, quantidade: e.fornecedores.filter((f) => f.situacao === 'ativo' && f.ctfValidade >= dia && diasEntre(dia, f.ctfValidade) <= DIAS_AVISO_CTF).length, nivel: 'atencao', link: '/cadastros?aba=fornecedores&ctf=vencendo', acao: 'Ver fornecedores' });
  }
  return lista;
}

/**
 * Alertas do usuário: cada tipo só aparece para quem pode agir sobre ele (quem não tem nenhuma das permissões não o vê).
 * Os três do IBAMA são calculados com as mesmas funções do serviço `ibama` e levam à aba de Relatórios que explica o número.
 */
export function alertas(e: Estado, dia: string, u: Usuario): Alerta[] {
  const lista: Alerta[] = [];
  const pode = (...ps: Permissao[]) => ps.some((p) => u.permissoes.includes(p));
  const GESTAO: Permissao = 'painel:gestao';
  if (!pode('operacao:consultar')) return lista;
  for (const reg of pode('dof:declarar', GESTAO) ? e.dofs.filter((d) => !d.declarado) : []) {
    const d = dofView(e, reg, dia);
    if (d.nivelPrazo === 'ok') continue;
    const quando = d.diasParaPrazo < 0 ? `venceu há ${-d.diasParaPrazo} dia(s)` : d.diasParaPrazo === 0 ? 'vence hoje' : `vence em ${d.diasParaPrazo} dia(s)`;
    lista.push({ id: `dof-${d.id}`, nivel: d.nivelPrazo === 'atencao' ? 'atencao' : 'critico', titulo: `DOF ${d.numero} a declarar`, descricao: `Prazo de declaração no Sinaflor ${quando}.`, link: `/documentos?aba=dofs&q=${d.numero}` });
  }
  for (const s of pode(GESTAO) ? saldoPorItem(e, dia).filter((x) => x.situacao !== 'ok') : []) {
    const nome = nomeItem(e, s);
    // Reposição: com o item abaixo do mínimo, o saldo nas atas vigentes e o atalho para um novo contrato.
    const atas = saldoNasAtasVigentes(e, s.tamanhoId, dia);
    const saldoAta = atas.length ? ` Saldo na ata vigente: ${atas.map((a) => `${a.saldo} (${a.ata})`).join(', ')}.` : ' Sem saldo em ata vigente.';
    lista.push(s.situacao === 'falta'
      ? { id: `falta-${s.id}`, nivel: 'critico', titulo: `Falta: ${nome}`, descricao: `${s.emEstoque} em estoque, abaixo do mínimo de ${s.minimo}.${saldoAta}`, link: atas.length ? '/contratos?novo=1' : '/estoque' }
      : { id: `excesso-${s.id}`, nivel: 'atencao', titulo: `Excesso: ${nome}`, descricao: `${s.emEstoque} em estoque, acima do máximo de ${s.maximo}.`, link: '/estoque' });
  }
  for (const c of pode(GESTAO) ? e.contratos.map((x) => contratoView(e, x, dia)).filter((x) => x.parcelasAtrasadas > 0) : []) {
    const p = c.parcelas.filter((x) => x.situacao === 'atrasada');
    lista.push({ id: `parcela-${c.id}`, nivel: 'critico', titulo: `Contrato ${c.numero}: ${p.length} parcela(s) atrasada(s)`, descricao: p.map((x) => `${x.numero}ª: ${x.recebidos} de ${x.quantidade}, prazo ${x.fim}`).join('; '), link: `/contratos/${c.numero}` });
  }
  for (const en of pode('inspecao:operar', GESTAO) ? e.entregas.map((x) => entregaView(e, x, dia)).filter((x) => x.nivelPrazoLaudo && x.nivelPrazoLaudo !== 'ok') : []) {
    lista.push({ id: `laudo-${en.id}`, nivel: en.nivelPrazoLaudo === 'atencao' ? 'atencao' : 'critico', titulo: `Laudo da NF ${en.nfNumero}`, descricao: `Prazo do Laudo Técnico: ${en.prazoLaudo}${en.nivelPrazoLaudo === 'vencido' ? ' (vencido)' : ''}.`, link: `/recebimentos?etapa=${en.etapa}` });
  }
  const aRetirar = pode('inspecao:operar', GESTAO) ? e.dormentes.filter((d) => d.situacao === 'reprovado').length : 0;
  if (aRetirar) lista.push({ id: 'reprovados', nivel: 'atencao', titulo: `${aRetirar} reprovado(s) aguardando retirada`, descricao: 'Comunique o fornecedor e registre a retirada na Inspeção.', link: '/inspecao?aba=reprovados' });
  const parados = pode('estoque:movimentar', GESTAO) ? e.fardos.map((f) => fardoView(e, f, dia)).filter((f) => f.acimaLimiteDias) : [];
  if (parados.length) lista.push({ id: 'parados', nivel: 'atencao', titulo: `${parados.length} fardo(s) acima de ${e.parametros.limiteDiasEstoque} dias em estoque`, descricao: parados.map((f) => f.id).join(', '), link: '/estoque?visao=fardo&acimaLimite=sim' });
  const naoLoc = pode(GESTAO) ? e.dormentes.filter((d) => d.situacao === 'nao_localizado').length : 0;
  if (naoLoc) lista.push({ id: 'nao-localizados', nivel: 'critico', titulo: `${naoLoc} dormente(s) não localizado(s)`, descricao: 'Não lidos na conclusão da inspeção; inspecione se forem encontrados.', link: '/inspecao?aba=nao_localizados' });
  for (const f of pode('admin') ? e.fornecedores.filter((x) => x.situacao === 'ativo') : []) {
    const v = fornecedorView(f, dia);
    const dias = diasEntre(dia, f.ctfValidade);
    if (v.bloqueado) lista.push({ id: `ctf-${f.id}`, nivel: 'critico', titulo: `CTF vencido: ${f.razaoSocial}`, descricao: 'Fornecedor bloqueado para novas atas e contratos.', link: `/fornecedores/${f.id}` });
    else if (dias <= DIAS_AVISO_CTF) lista.push({ id: `ctf-${f.id}`, nivel: 'atencao', titulo: `CTF vence em ${dias} dia(s): ${f.razaoSocial}`, descricao: 'Peça a renovação ao fornecedor.', link: `/fornecedores/${f.id}` });
  }
  if (pode('dof:declarar', GESTAO)) {
    // IBAMA: o que a CPTM precisa lançar ou comunicar (mesmos números das abas de Relatórios).
    const fora = saldoPatio(e).filter((x) => x.acimaTolerancia);
    if (fora.length) lista.push({ id: 'ibama-saldo', nivel: 'critico', titulo: `Saldo do pátio acima de 10% do informado: ${fora.length} espécie(s)`, descricao: 'O físico do pátio difere do último saldo informado do DOF além da tolerância (art. 41). Confira e informe o saldo.', link: '/relatorios?aba=saldo' });
    const aLancar = e.destinacoes.filter((d) => !d.lancadoEm).length;
    if (aLancar) lista.push({ id: 'ibama-destinacao', nivel: 'atencao', titulo: `${aLancar} destinação(ões) final(is) a lançar no DOF`, descricao: 'RMEs entregues cuja baixa ainda não foi lançada no sistema DOF.', link: '/relatorios?aba=destinacoes' });
    const aComunicar = e.perdas.filter((p) => !p.comunicadoEm).length;
    if (aComunicar) lista.push({ id: 'ibama-perdas', nivel: 'critico', titulo: `${aComunicar} perda(s) a comunicar ao IBAMA`, descricao: 'Dormentes perdidos ainda não comunicados ao órgão (art. 42).', link: '/relatorios?aba=perdas' });
  }
  return lista;
}
