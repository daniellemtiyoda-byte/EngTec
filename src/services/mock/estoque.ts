import type { Evento, Id, SituacaoDormente } from '../../types/models';
import { fardoView, localView } from './consultas';
import { achar, registrar, falha, hoje, instante, novoId, type Ctx, type Estado, type FardoReg } from './estado';

/**
 * Transições permitidas da situação do dormente. É a única porta de mudança de saldo: o saldo do fardo é sempre
 * contado a partir dos seus dormentes (em estoque + reservados), nunca gravado à parte.
 */
const TRANSICOES: Record<SituacaoDormente, SituacaoDormente[]> = {
  emitido: ['aguardando_inspecao'],
  aguardando_inspecao: ['em_estoque', 'reprovado', 'nao_localizado'],
  nao_localizado: ['em_estoque', 'reprovado', 'perdido'],
  em_estoque: ['reservado'],
  reservado: ['em_estoque', 'baixado'],
  baixado: [],
  reprovado: ['retirado'],
  retirado: [],
  perdido: [],
};

interface Opcoes {
  evento: Pick<Evento, 'tipo' | 'descricao' | 'referencia'>;
  /** RME da reserva ou da baixa; na liberação da reserva, a referência sai. */
  rmeNumero?: string;
  /** Local de segregação do reprovado. */
  localId?: Id;
}

export function movimentarDormentes(e: Estado, ids: Id[], para: SituacaoDormente, op: Opcoes, ctx: Ctx) {
  const dormentes = ids.map((id) => achar(e.dormentes, (d) => d.id === id, `Dormente ${id}`));
  for (const d of dormentes) {
    if (!TRANSICOES[d.situacao].includes(para)) falha(409, `O dormente ${d.id} não pode passar de "${d.situacao}" para "${para}".`);
  }
  for (const d of dormentes) {
    if (para === 'reservado' || para === 'baixado') d.rmeNumero = op.rmeNumero;
    if (para === 'em_estoque' && d.situacao === 'reservado') d.rmeNumero = undefined;
    if (para === 'reprovado') d.localId = op.localId;
    if (para === 'retirado') d.localId = undefined;
    d.situacao = para;
    registrar(e, ctx, 'dormente', d.id, op.evento.tipo, op.evento.descricao, op.evento.referencia);
  }
}

/** Transfere o fardo com saldo para outro local (guarda e transferência são lendo o QR do fardo e do local). */
export function transferirFardo(e: Estado, fardoId: Id, localId: Id, ctx: Ctx): FardoReg {
  const f = achar(e.fardos, (x) => x.id === fardoId, 'Fardo');
  const v = fardoView(e, f, hoje(ctx));
  if (v.situacao !== 'em_estoque') falha(409, `O fardo ${f.id} não está em estoque (situação: ${v.situacao}).`);
  const destino = achar(e.locais, (l) => l.id === localId, 'Local');
  if (!destino.ativo) falha(422, `O local ${destino.codigo} está inativo.`, { localId: 'Escolha um local ativo.' });
  if (destino.tipo !== 'armazenagem' && destino.tipo !== 'expedicao') falha(422, `O local ${destino.codigo} não é de armazenagem nem de expedição.`, { localId: 'Escolha um local de armazenagem ou expedição.' });
  if (destino.id === f.localId) falha(422, `O fardo já está em ${destino.codigo}.`, { localId: 'Escolha outro local.' });
  const origem = e.locais.find((l) => l.id === f.localId);
  const noFardo = e.dormentes.filter((d) => d.fardoId === f.id && (d.situacao === 'em_estoque' || d.situacao === 'reservado'));
  // Expedição: só o fardo inteiro reservado para uma RME pronta. A separação parcial fica no local atual até a entrega.
  let referencia: string | undefined;
  if (destino.tipo === 'expedicao') {
    const rmes = new Set(noFardo.map((d) => (d.situacao === 'reservado' ? d.rmeNumero : undefined)));
    const rme = rmes.size === 1 ? e.rmes.find((r) => r.numero === [...rmes][0]) : undefined;
    if (!rme || rme.situacao !== 'pronta') {
      const livres = noFardo.filter((d) => d.situacao === 'em_estoque').length;
      falha(422, `O local ${destino.codigo} é de expedição: só recebe fardo com todos os dormentes reservados para uma RME pronta. ${livres ? `O fardo ${f.id} tem ${livres} dormente(s) disponível(is): fica no local atual até a entrega.` : `Os dormentes do fardo ${f.id} não estão reservados para uma única RME pronta.`}`, { localId: 'Expedição só recebe fardo inteiro reservado para uma RME pronta.' });
    }
    referencia = rme.numero;
  }
  const descricao = `Transferido de ${origem?.codigo ?? '—'} para ${destino.codigo}${referencia ? ` (${referencia})` : ''}`;
  registrar(e, ctx, 'fardo', f.id, 'transferido', descricao, referencia);
  for (const d of noFardo) registrar(e, ctx, 'dormente', d.id, 'transferido', descricao, referencia);
  e.movimentacoes.push({
    id: novoId(e, 'mv'), tipo: 'transferencia', fardoId: f.id, dormentesIds: noFardo.map((d) => d.id), quantidade: noFardo.length,
    deLocalId: f.localId, paraLocalId: destino.id, quando: instante(ctx), quem: ctx.quem, referencia,
  });
  f.localId = destino.id;
  return f;
}

/** Devolve à origem o fardo que foi para a expedição por uma RME cancelada (o local de onde ele saiu para lá). */
export function devolverDaExpedicao(e: Estado, fardoId: Id, rmeNumero: string, ctx: Ctx) {
  const f = achar(e.fardos, (x) => x.id === fardoId, 'Fardo');
  const aqui = e.locais.find((l) => l.id === f.localId);
  if (aqui?.tipo !== 'expedicao') return;
  const ida = [...e.movimentacoes].reverse().find((m) => m.fardoId === f.id && m.paraLocalId === f.localId && m.tipo === 'transferencia');
  const origem = e.locais.find((l) => l.id === ida?.deLocalId);
  if (!origem) return;
  const noFardo = e.dormentes.filter((d) => d.fardoId === f.id && (d.situacao === 'em_estoque' || d.situacao === 'reservado'));
  const descricao = `Devolvido de ${aqui.codigo} para ${origem.codigo}: ${rmeNumero} cancelada`;
  registrar(e, ctx, 'fardo', f.id, 'transferido', descricao, rmeNumero);
  for (const d of noFardo) registrar(e, ctx, 'dormente', d.id, 'transferido', descricao, rmeNumero);
  e.movimentacoes.push({
    id: novoId(e, 'mv'), tipo: 'transferencia', fardoId: f.id, dormentesIds: noFardo.map((d) => d.id), quantidade: noFardo.length,
    deLocalId: aqui.id, paraLocalId: origem.id, quando: instante(ctx), quem: ctx.quem, referencia: rmeNumero,
  });
  f.localId = origem.id;
}

/** Local ativo de segregação para os reprovados (o primeiro com espaço; sem espaço, o primeiro). */
export function localDeSegregacao(e: Estado, ctx: Ctx) {
  const locais = e.locais.filter((l) => l.ativo && l.tipo === 'segregacao');
  if (!locais.length) falha(409, 'Não há local de segregação ativo. Cadastre um em Cadastros › Locais.');
  return locais.find((l) => { const v = localView(e, l, hoje(ctx)); return v.ocupacao < v.capacidade; }) ?? locais[0];
}
