import { diasEntre } from '../../dominio/parametros';
import type { Permissao } from '../../dominio/permissoes';
import type { Alerta, Indicadores, Pendencia, Usuario } from '../../types/models';
import { dofView, fardoView, fornecedorView, saldoPorItem } from './consultas';
import type { Estado } from './estado';

/* Painel (seção 9.2 do plano): números, "Para fazer agora" por permissão e alertas. Cada um leva à lista filtrada. */

export function indicadores(e: Estado, dia: string): Indicadores {
  const saldo = saldoPorItem(e);
  const fardos = e.fardos.map((f) => fardoView(e, f, dia));
  return {
    emEstoque: e.dormentes.filter((d) => d.situacao === 'em_estoque').length,
    aguardandoInspecao: e.dormentes.filter((d) => d.situacao === 'aguardando_inspecao').length,
    itensAbaixoMinimo: saldo.filter((s) => s.situacao === 'falta').length,
    itensAcimaMaximo: saldo.filter((s) => s.situacao === 'excesso').length,
    fardosAcimaLimite: fardos.filter((f) => f.acimaLimiteDias).length,
    dofsADeclarar: e.dofs.filter((d) => !d.declarado).length,
    rmesAbertas: e.rmes.filter((r) => r.situacao === 'aberta').length,
    naoLocalizados: e.dormentes.filter((d) => d.situacao === 'nao_localizado').length,
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
    add({ id: 'separar', titulo: 'RMEs a separar', quantidade: e.rmes.filter((r) => r.situacao === 'aberta' || r.situacao === 'em_separacao').length, nivel: 'atencao', link: '/saidas?situacao=aberta', acao: 'Separar' });
    add({ id: 'entregar', titulo: 'RMEs prontas para entregar', quantidade: e.rmes.filter((r) => r.situacao === 'pronta').length, nivel: 'info', link: '/saidas?situacao=pronta', acao: 'Entregar' });
  }
  if (pode('dof:declarar')) {
    const dofs = e.dofs.filter((d) => !d.declarado).map((d) => dofView(e, d, dia));
    const urgentes = dofs.filter((d) => d.nivelPrazo === 'vencido' || d.nivelPrazo === 'critico').length;
    add({ id: 'dof', titulo: 'DOFs a declarar no Sinaflor', quantidade: dofs.length, nivel: urgentes ? 'critico' : 'atencao', link: '/documentos?aba=dofs', acao: 'Declarar' });
  }
  if (pode('painel:gestao')) {
    const saldo = saldoPorItem(e);
    add({ id: 'falta-excesso', titulo: 'Itens em falta ou excesso', quantidade: saldo.filter((s) => s.situacao !== 'ok').length, nivel: 'atencao', link: '/estoque', acao: 'Ver estoque' });
    add({ id: 'parados', titulo: 'Fardos acima do limite de dias', quantidade: fardos.filter((f) => f.acimaLimiteDias).length, nivel: 'atencao', link: '/estoque?visao=fardo&acimaLimiteDias=true', acao: 'Ver fardos' });
    add({ id: 'nao-localizados', titulo: 'Dormentes não localizados', quantidade: e.dormentes.filter((d) => d.situacao === 'nao_localizado').length, nivel: 'critico', link: '/inspecao?aba=nao-localizados', acao: 'Ver dormentes' });
  }
  if (pode('rme:abrir')) {
    add({ id: 'minhas-rmes', titulo: 'Minhas RMEs em andamento', quantidade: e.rmes.filter((r) => r.solicitanteId === u.id && r.situacao !== 'entregue' && r.situacao !== 'cancelada').length, nivel: 'info', link: '/saidas', acao: 'Acompanhar' });
  }
  if (pode('admin')) {
    add({ id: 'ctf', titulo: 'Fornecedores com CTF vencido ou vencendo em 30 dias', quantidade: e.fornecedores.filter((f) => f.situacao === 'ativo' && diasEntre(dia, f.ctfValidade) <= 30).length, nivel: 'atencao', link: '/cadastros?aba=fornecedores', acao: 'Ver fornecedores' });
  }
  return lista;
}

export function alertas(e: Estado, dia: string): Alerta[] {
  const lista: Alerta[] = [];
  for (const reg of e.dofs.filter((d) => !d.declarado)) {
    const d = dofView(e, reg, dia);
    if (d.nivelPrazo === 'ok') continue;
    const quando = d.diasParaPrazo < 0 ? `venceu há ${-d.diasParaPrazo} dia(s)` : d.diasParaPrazo === 0 ? 'vence hoje' : `vence em ${d.diasParaPrazo} dia(s)`;
    lista.push({ id: `dof-${d.id}`, nivel: d.nivelPrazo === 'atencao' ? 'atencao' : 'critico', titulo: `DOF ${d.numero} a declarar`, descricao: `Prazo de declaração no Sinaflor ${quando}.`, link: `/documentos?aba=dofs&q=${d.numero}` });
  }
  for (const s of saldoPorItem(e).filter((x) => x.situacao !== 'ok')) {
    const esp = e.especies.find((x) => x.id === s.especieId);
    const tam = e.tamanhos.find((x) => x.id === s.tamanhoId);
    const nome = `${esp?.nomePopular ?? s.especieId} · ${tam?.codigo ?? s.tamanhoId}`;
    lista.push(s.situacao === 'falta'
      ? { id: `falta-${s.especieId}-${s.tamanhoId}`, nivel: 'critico', titulo: `Falta: ${nome}`, descricao: `${s.emEstoque} em estoque, abaixo do mínimo de ${s.minimo}.`, link: '/estoque' }
      : { id: `excesso-${s.especieId}-${s.tamanhoId}`, nivel: 'atencao', titulo: `Excesso: ${nome}`, descricao: `${s.emEstoque} em estoque, acima do máximo de ${s.maximo}.`, link: '/estoque' });
  }
  const parados = e.fardos.map((f) => fardoView(e, f, dia)).filter((f) => f.acimaLimiteDias);
  if (parados.length) lista.push({ id: 'parados', nivel: 'atencao', titulo: `${parados.length} fardo(s) acima de ${e.parametros.limiteDiasEstoque} dias em estoque`, descricao: parados.map((f) => f.id).join(', '), link: '/estoque?visao=fardo&acimaLimiteDias=true' });
  const naoLoc = e.dormentes.filter((d) => d.situacao === 'nao_localizado').length;
  if (naoLoc) lista.push({ id: 'nao-localizados', nivel: 'critico', titulo: `${naoLoc} dormente(s) não localizado(s)`, descricao: 'Não lidos na conclusão da inspeção; inspecione se forem encontrados.', link: '/inspecao?aba=nao-localizados' });
  for (const f of e.fornecedores.filter((x) => x.situacao === 'ativo')) {
    const v = fornecedorView(f, dia);
    const dias = diasEntre(dia, f.ctfValidade);
    if (v.bloqueado) lista.push({ id: `ctf-${f.id}`, nivel: 'critico', titulo: `CTF vencido: ${f.razaoSocial}`, descricao: 'Fornecedor bloqueado para novas atas e contratos.', link: `/fornecedores/${f.id}` });
    else if (dias <= 30) lista.push({ id: `ctf-${f.id}`, nivel: 'atencao', titulo: `CTF vence em ${dias} dia(s): ${f.razaoSocial}`, descricao: 'Peça a renovação ao fornecedor.', link: `/fornecedores/${f.id}` });
  }
  return lista;
}
