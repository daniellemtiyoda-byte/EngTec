import type { Evento, Id, SituacaoDormente } from '../../types/models';
import { fardoView, localView } from './consultas';
import { achar, evento, falha, hoje, instante, novoId, type Ctx, type Estado, type FardoReg } from './estado';

/**
 * Transições permitidas da situação do dormente. É a única porta de mudança de saldo: o saldo do fardo é sempre
 * contado a partir dos seus dormentes (em estoque + reservados), nunca gravado à parte.
 */
const TRANSICOES: Record<SituacaoDormente, SituacaoDormente[]> = {
  emitido: ['aguardando_inspecao'],
  aguardando_inspecao: ['em_estoque', 'reprovado', 'nao_localizado'],
  nao_localizado: ['em_estoque', 'reprovado'],
  em_estoque: ['reservado'],
  reservado: ['em_estoque', 'baixado'],
  baixado: [],
  reprovado: [],
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
  const ev = evento(ctx, op.evento.tipo, op.evento.descricao, op.evento.referencia);
  for (const d of dormentes) {
    if (para === 'reservado' || para === 'baixado') d.rmeNumero = op.rmeNumero;
    if (para === 'em_estoque' && d.situacao === 'reservado') d.rmeNumero = undefined;
    if (para === 'reprovado') d.localId = op.localId;
    d.situacao = para;
    d.historico.push({ ...ev });
  }
}

/** Transfere o fardo com saldo para outro local (guarda e transferência são lendo o QR do fardo e do local). */
export function transferirFardo(e: Estado, fardoId: Id, localId: Id, ctx: Ctx): FardoReg {
  const f = achar(e.fardos, (x) => x.id === fardoId, 'Fardo');
  const v = fardoView(e, f, hoje(ctx));
  if (v.situacao !== 'em_estoque' && v.situacao !== 'aberto') falha(409, `O fardo ${f.id} não está em estoque (situação: ${v.situacao}).`);
  const destino = achar(e.locais, (l) => l.id === localId, 'Local');
  if (!destino.ativo) falha(422, `O local ${destino.codigo} está inativo.`, { localId: 'Escolha um local ativo.' });
  if (destino.tipo !== 'armazenagem' && destino.tipo !== 'expedicao') falha(422, `O local ${destino.codigo} não é de armazenagem nem de expedição.`, { localId: 'Escolha um local de armazenagem ou expedição.' });
  if (destino.id === f.localId) falha(422, `O fardo já está em ${destino.codigo}.`, { localId: 'Escolha outro local.' });
  const origem = e.locais.find((l) => l.id === f.localId);
  const noFardo = e.dormentes.filter((d) => d.fardoId === f.id && (d.situacao === 'em_estoque' || d.situacao === 'reservado'));
  const descricao = `Transferido de ${origem?.codigo ?? '—'} para ${destino.codigo}`;
  const ev = evento(ctx, 'transferido', descricao);
  f.historico.push(ev);
  for (const d of noFardo) d.historico.push({ ...ev });
  e.movimentacoes.push({
    id: novoId(e, 'mv'), tipo: 'transferencia', fardoId: f.id, dormentesIds: noFardo.map((d) => d.id), quantidade: noFardo.length,
    deLocalId: f.localId, paraLocalId: destino.id, quando: instante(ctx), quem: ctx.quem,
  });
  f.localId = destino.id;
  return f;
}

/** Local ativo de segregação para os reprovados (o primeiro com espaço; sem espaço, o primeiro). */
export function localDeSegregacao(e: Estado, ctx: Ctx) {
  const locais = e.locais.filter((l) => l.ativo && l.tipo === 'segregacao');
  if (!locais.length) falha(409, 'Não há local de segregação ativo. Cadastre um em Cadastros › Locais.');
  return locais.find((l) => { const v = localView(e, l, hoje(ctx)); return v.ocupacao < v.capacidade; }) ?? locais[0];
}
