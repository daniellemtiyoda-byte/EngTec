import { idRme, RE_RME } from '../../dominio/identificacao';
import type { Id, Rme, SeparacaoFardo, SugestaoSeparacao, Usuario } from '../../types/models';
import type { DadosRme, DadosSeparacao } from '../contracts';
import { dormentesDoFardo, fardoView } from './consultas';
import { achar, evento, falha, hoje, instante, novoId, type Ctx, type Estado } from './estado';
import { devolverDaExpedicao, movimentarDormentes } from './estoque';

/*
 * Saída por requisição (seção 9.17 do plano): aberta → em separação → pronta → entregue (ou cancelada antes da
 * entrega). A separação só reserva; a baixa acontece na entrega.
 */

const DATA = /^\d{4}-\d{2}-\d{2}$/;

export const acharRme = (e: Estado, numero: string) => achar(e.rmes, (r) => r.numero === numero, `RME ${numero}`);

export function abrirRme(e: Estado, dados: DadosRme, solicitante: Usuario, ctx: Ctx): Rme {
  const campos: Record<string, string> = {};
  if (!dados.destino?.trim()) campos.destino = 'Informe a obra ou o trecho.';
  if (!DATA.test(dados.necessidadeEm ?? '')) campos.necessidadeEm = 'Informe a data de necessidade.';
  else if (dados.necessidadeEm < hoje(ctx)) campos.necessidadeEm = 'A data de necessidade já passou.';
  if (!dados.itens?.length) campos.itens = 'Informe ao menos um item.';
  const vistos = new Set<string>();
  dados.itens?.forEach((i, n) => {
    const k = `${i.especieId}|${i.tamanhoId}`;
    if (!e.especies.some((x) => x.id === i.especieId) || !e.tamanhos.some((x) => x.id === i.tamanhoId)) campos[`itens.${n}`] = 'Espécie ou tamanho não encontrado.';
    else if (vistos.has(k)) campos[`itens.${n}`] = 'Item repetido: some as quantidades numa linha.';
    else if (!Number.isInteger(i.quantidade) || i.quantidade <= 0) campos[`itens.${n}`] = 'Quantidade em unidades, maior que zero.';
    vistos.add(k);
  });
  if (Object.keys(campos).length) falha(422, 'Confira os dados da requisição.', campos);
  const ano = ctx.agora().getFullYear();
  const seq = e.rmes.map((r) => RE_RME.exec(r.numero)).filter((m) => m && Number(m[1]) === ano).reduce((max, m) => Math.max(max, Number(m![2])), 0) + 1;
  const rme: Rme = {
    id: novoId(e, 'rm'), numero: idRme(ano, seq), solicitanteId: solicitante.id, solicitanteNome: solicitante.nome,
    destino: dados.destino.trim(), necessidadeEm: dados.necessidadeEm, itens: dados.itens.map((i) => ({ ...i })),
    situacao: 'aberta', criadoEm: instante(ctx), historico: [evento(ctx, 'emitido', `RME aberta para ${dados.destino.trim()}`)],
  };
  e.rmes.push(rme);
  return rme;
}

export function iniciarSeparacao(e: Estado, numero: string, ctx: Ctx): Rme {
  const r = acharRme(e, numero);
  if (r.situacao === 'em_separacao') return r;
  if (r.situacao !== 'aberta') falha(409, `A RME ${r.numero} não está aberta.`);
  r.situacao = 'em_separacao';
  r.historico.push(evento(ctx, 'reservado', 'Separação iniciada'));
  return r;
}

/** Item (espécie + tamanho) de um fardo, pelo item do contrato. */
function itemDoFardo(e: Estado, fardoId: Id) {
  const f = achar(e.fardos, (x) => x.id === fardoId, `Fardo ${fardoId}`);
  const item = achar(e.contratos.flatMap((c) => c.itens), (i) => i.id === f.itemContratoId, 'Item do contrato');
  return { fardo: f, especieId: item.especieId, tamanhoId: item.tamanhoId };
}

/**
 * Sugestão: fardos abertos primeiro (do mais antigo ao mais novo), depois os demais do mais antigo ao mais novo,
 * só com dormentes disponíveis (em estoque, sem reserva); dentro do fardo, as menores sequências.
 */
export function sugerirSeparacao(e: Estado, numero: string, ctx: Ctx): SugestaoSeparacao {
  const r = acharRme(e, numero);
  const dia = hoje(ctx);
  const candidatos = e.fardos.map((f) => fardoView(e, f, dia)).filter((f) => f.situacao === 'em_estoque' && f.disponivel > 0);
  return {
    itens: r.itens.map((it) => {
      const doItem = candidatos
        .filter((f) => { const i = itemDoFardo(e, f.id); return i.especieId === it.especieId && i.tamanhoId === it.tamanhoId; })
        .sort((a, b) => Number(b.aberto) - Number(a.aberto) || (a.recebidoEm ?? '').localeCompare(b.recebidoEm ?? '') || a.id.localeCompare(b.id));
      const livresDo = (id: Id) => dormentesDoFardo(e, id).filter((d) => d.situacao === 'em_estoque').map((d) => d.id).sort();
      let falta = it.quantidade;
      const fardos: SugestaoSeparacao['itens'][number]['fardos'] = [];
      for (const f of doItem) {
        if (falta <= 0) break;
        const pega = livresDo(f.id).slice(0, falta);
        fardos.push({ fardoId: f.id, dormentesIds: pega, aberto: f.aberto, idadeDias: f.idadeDias, localId: f.localId });
        falta -= pega.length;
      }
      const candidatosDoItem = doItem.map((f) => ({ fardoId: f.id, dormentesIds: livresDo(f.id), aberto: f.aberto, idadeDias: f.idadeDias, localId: f.localId }));
      return { especieId: it.especieId, tamanhoId: it.tamanhoId, quantidade: it.quantidade, fardos, candidatos: candidatosDoItem, faltam: Math.max(0, falta) };
    }),
  };
}

/**
 * Separa: reserva os dormentes e deixa a RME pronta. A quantidade de cada item tem de bater com a pedida. Trocar
 * dormentes dentro do fardo sugerido não pede justificativa; trocar de fardo ou mudar a quantidade do fardo pede.
 */
export function separarRme(e: Estado, numero: string, separacao: DadosSeparacao[], ctx: Ctx): Rme {
  const r = acharRme(e, numero);
  if (r.situacao !== 'aberta' && r.situacao !== 'em_separacao') falha(409, `A RME ${r.numero} não está aberta para separação.`);
  if (!separacao.length) falha(422, 'Informe os dormentes separados.', { separacao: 'Nada separado.' });
  const sugestao = sugerirSeparacao(e, numero, ctx);
  const sugeridoPorFardo = new Map(sugestao.itens.flatMap((i) => i.fardos).map((f) => [f.fardoId, f.dormentesIds.length]));

  const campos: Record<string, string> = {};
  const usados = new Set<Id>();
  const totalPorItem = new Map<string, number>();
  const linhas: SeparacaoFardo[] = separacao.map((s, n) => {
    const { fardo, especieId, tamanhoId } = itemDoFardo(e, s.fardoId);
    const k = `${especieId}|${tamanhoId}`;
    if (!r.itens.some((i) => `${i.especieId}|${i.tamanhoId}` === k)) campos[`separacao.${n}`] = `O fardo ${fardo.id} não é de um item desta RME.`;
    const ids = [...new Set(s.dormentesIds.map((x) => x.trim().toUpperCase()))];
    if (!ids.length) campos[`separacao.${n}`] = `Nenhum dormente do fardo ${fardo.id}.`;
    for (const id of ids) {
      const d = e.dormentes.find((x) => x.id === id);
      if (!d || d.fardoId !== fardo.id) campos[`separacao.${n}`] = `O dormente ${id} não é do fardo ${fardo.id}.`;
      else if (d.situacao !== 'em_estoque') campos[`separacao.${n}`] = `O dormente ${id} não está disponível (${d.situacao}).`;
      else if (usados.has(id)) campos[`separacao.${n}`] = `O dormente ${id} aparece duas vezes.`;
      usados.add(id);
    }
    totalPorItem.set(k, (totalPorItem.get(k) ?? 0) + ids.length);
    const seguiuSugestao = sugeridoPorFardo.get(fardo.id) === ids.length;
    if (!seguiuSugestao && !s.justificativa?.trim()) campos[`separacao.${n}`] = `O fardo ${fardo.id} difere da sugestão: informe a justificativa.`;
    return { fardoId: fardo.id, dormentesIds: ids, seguiuSugestao, justificativa: seguiuSugestao ? undefined : s.justificativa?.trim() };
  });
  r.itens.forEach((i, n) => {
    const total = totalPorItem.get(`${i.especieId}|${i.tamanhoId}`) ?? 0;
    if (total !== i.quantidade) campos[`itens.${n}`] = `Separados ${total} de ${i.quantidade}: a quantidade tem de bater com a pedida.`;
  });
  if (Object.keys(campos).length) falha(422, 'Confira a separação.', campos);

  for (const l of linhas) {
    movimentarDormentes(e, l.dormentesIds, 'reservado', { rmeNumero: r.numero, evento: { tipo: 'reservado', descricao: `Reservado para a ${r.numero} (${r.destino})`, referencia: r.numero } }, ctx);
  }
  r.separacao = linhas;
  r.situacao = 'pronta';
  r.historico.push(evento(ctx, 'reservado', `Separação concluída: ${usados.size} dormentes reservados${linhas.some((l) => !l.seguiuSugestao) ? ' (com troca de fardo justificada)' : ''}`));
  return r;
}

/** Entrega: baixa os dormentes reservados; o fardo com sobra fica aberto e o zerado, baixado. */
export function entregarRme(e: Estado, numero: string, ctx: Ctx): Rme {
  const r = acharRme(e, numero);
  if (r.situacao !== 'pronta' || !r.separacao) falha(409, `A RME ${r.numero} não está pronta para entrega.`);
  for (const l of r.separacao) {
    const f = achar(e.fardos, (x) => x.id === l.fardoId, 'Fardo');
    movimentarDormentes(e, l.dormentesIds, 'baixado', { rmeNumero: r.numero, evento: { tipo: 'baixado', descricao: `Entregue para ${r.destino}`, referencia: r.numero } }, ctx);
    e.movimentacoes.push({ id: novoId(e, 'mv'), tipo: 'saida', fardoId: f.id, dormentesIds: [...l.dormentesIds], quantidade: l.dormentesIds.length, deLocalId: f.localId, quando: instante(ctx), quem: ctx.quem, referencia: r.numero });
    f.historico.push(evento(ctx, 'baixado', `${l.dormentesIds.length} dormente(s) entregues para ${r.destino}`, r.numero));
  }
  r.situacao = 'entregue';
  r.historico.push(evento(ctx, 'baixado', `Entregue para ${r.destino}`));
  return r;
}

/** Cancela antes da entrega: libera as reservas e devolve à origem o fardo que já estava na expedição. */
export function cancelarRme(e: Estado, numero: string, motivo: string, ctx: Ctx): Rme {
  const r = acharRme(e, numero);
  if (r.situacao === 'entregue' || r.situacao === 'cancelada') falha(409, `A RME ${r.numero} já foi ${r.situacao === 'entregue' ? 'entregue' : 'cancelada'}.`);
  if (!motivo?.trim()) falha(422, 'Informe o motivo do cancelamento.', { motivo: 'Motivo obrigatório.' });
  for (const l of r.separacao ?? []) devolverDaExpedicao(e, l.fardoId, r.numero, ctx);
  const reservados = (r.separacao ?? []).flatMap((l) => l.dormentesIds);
  if (reservados.length) movimentarDormentes(e, reservados, 'em_estoque', { evento: { tipo: 'cancelado', descricao: `Reserva liberada: ${r.numero} cancelada`, referencia: r.numero } }, ctx);
  r.situacao = 'cancelada';
  r.motivoCancelamento = motivo.trim();
  r.historico.push(evento(ctx, 'cancelado', `Cancelada: ${motivo.trim()}`));
  return r;
}
