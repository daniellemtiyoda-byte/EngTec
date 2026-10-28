import type {
  Especie, Fardo, ItemSeparacao, Lote, Movimentacao, NovaRme, NovaSeparacao, OpcaoSeparacao, Rme, SaldoEstoque, StatusRme, Tamanho,
} from '../../types/models';
import { STATUS_RME } from '../../dominio/rotulos';
import { ApiError } from '../http';

/** O que as operações de RME leem e alteram nos dados simulados. */
export interface BaseRme {
  especies: Especie[];
  tamanhos: Tamanho[];
  lotes: Lote[];
  fardos: Fardo[];
  saldos: SaldoEstoque[];
  movimentacoes: Movimentacao[];
  rmes: Rme[];
}

interface Contexto {
  quando: string;
  usuario: string;
  novoId: (prefixo: string) => string;
}

/** RMEs cuja separação reserva os fardos até a entrega ou o cancelamento. */
const RESERVA: StatusRme[] = ['em_separacao', 'conferida'];

function exigirStatus(rme: Rme, ...status: StatusRme[]) {
  if (!status.includes(rme.status)) throw new ApiError(409, `Operação não permitida: a RME ${rme.numero} está com status "${STATUS_RME[rme.status][1]}".`);
}

const registrar = (rme: Rme, ctx: Contexto, acao: string, detalhe?: string) => rme.historico.push({ quando: ctx.quando, usuario: ctx.usuario, acao, detalhe });

/** Quantidade de cada fardo já separada em outras RMEs ainda não entregues. */
function reservas(B: BaseRme, excetoRmeId?: string) {
  const r = new Map<string, number>();
  for (const x of B.rmes) {
    if (x.id === excetoRmeId || !RESERVA.includes(x.status)) continue;
    for (const s of x.separacao?.itens ?? []) r.set(s.fardoCodigo, (r.get(s.fardoCodigo) ?? 0) + s.quantidade);
  }
  return r;
}

/**
 * Regras 3, 4 e 7 do PRD: só lote aprovado na inspeção e com estoque disponível (fora: aguardando inspeção, quarentena,
 * reprovado, com divergência); fardos abertos primeiro, do mais antigo ao mais novo, depois os fechados por FIFO de lote.
 */
export function opcoesSeparacao(B: BaseRme, rme: Rme): OpcaoSeparacao[] {
  const reservado = reservas(B, rme.id);
  return rme.itens.flatMap((item) => {
    const lotes = new Map(B.lotes
      .filter((l) => l.inspecao === 'aprovado' && l.estoqueStatus === 'disponivel' && l.especieDocumental === item.especie && l.tamanho === item.tamanho)
      .map((l) => [l.codigo, l]));
    const candidatos = B.fardos
      .filter((f) => f.estado !== 'baixado' && lotes.has(f.loteCodigo))
      .map((f) => ({ f, lote: lotes.get(f.loteCodigo)!, disponivel: f.saldo - (reservado.get(f.codigo) ?? 0) }))
      .filter((c) => c.disponivel > 0)
      .sort((a, b) => Number(b.f.estado === 'aberto') - Number(a.f.estado === 'aberto')
        || a.lote.recebidoEm.localeCompare(b.lote.recebidoEm) || a.lote.codigo.localeCompare(b.lote.codigo) || a.f.sequencia - b.f.sequencia);
    let falta = item.quantidade;
    return candidatos.map(({ f, lote, disponivel }) => {
      const sugerido = Math.min(disponivel, falta);
      falta -= sugerido;
      return { itemId: item.id, fardoCodigo: f.codigo, loteCodigo: lote.codigo, recebidoEm: lote.recebidoEm, estado: f.estado, local: f.local, disponivel, sugerido };
    });
  });
}

function proximoNumero(B: BaseRme, quando: string) {
  const prefixo = `RME${quando.slice(2, 4)}-`;
  const ultimo = B.rmes.filter((r) => r.numero.startsWith(prefixo)).reduce((m, r) => Math.max(m, Number(r.numero.slice(prefixo.length)) || 0), 0);
  return `${prefixo}${String(ultimo + 1).padStart(4, '0')}`;
}

export function abrirRme(B: BaseRme, n: NovaRme, ctx: Contexto): Rme {
  const erros: Record<string, string> = {};
  if (!n.destinatario.trim()) erros.destinatario = 'Informe o destinatário.';
  if (!n.dataLimite || n.dataLimite < ctx.quando.slice(0, 10)) erros.dataLimite = 'A data limite não pode estar no passado.';
  if (!n.itens.length) erros.itens = 'Informe ao menos um item.';
  const chaves = new Set<string>();
  for (const it of n.itens) {
    const k = `${it.especieId}|${it.tamanhoId}`;
    if (chaves.has(k)) erros.itens = 'Há itens repetidos (mesma espécie e tamanho): some as quantidades em um só item.';
    chaves.add(k);
    if (!Number.isInteger(it.quantidade) || it.quantidade < 1) erros.itens = 'Cada item precisa de quantidade inteira, mínimo 1.';
  }
  if (Object.keys(erros).length) throw new ApiError(422, 'Confira os dados da RME.', erros);
  const id = ctx.novoId('rme');
  const rme: Rme = {
    id, numero: proximoNumero(B, ctx.quando), requisitante: ctx.usuario, destinatario: n.destinatario.trim(), urgencia: n.urgencia, dataLimite: n.dataLimite,
    observacao: n.observacao?.trim() || undefined, abertaEm: ctx.quando, status: 'aberta', historico: [],
    itens: n.itens.map((it, i) => {
      const e = B.especies.find((x) => x.id === it.especieId);
      const t = B.tamanhos.find((x) => x.id === it.tamanhoId);
      if (!e || !t) throw new ApiError(422, 'Espécie ou tamanho do item não encontrado no cadastro.');
      return { id: `${id}-i${i + 1}`, especieId: e.id, especie: e.nomeCientifico, tamanhoId: t.id, tamanho: t.codigo, quantidade: it.quantidade, quantidadeEntregue: 0 };
    }),
  };
  registrar(rme, ctx, 'RME aberta');
  B.rmes.unshift(rme);
  return rme;
}

/** Separação: a quantidade de cada item tem de bater com a pedida; escolha diferente da sugestão exige justificativa. */
export function separarRme(B: BaseRme, rme: Rme, n: NovaSeparacao, ctx: Contexto): Rme {
  exigirStatus(rme, 'aberta');
  const opcoes = opcoesSeparacao(B, rme);
  const erros: Record<string, string> = {};
  const itens: ItemSeparacao[] = [];
  for (const item of rme.itens) {
    const escolhidos = n.itens.filter((x) => x.itemId === item.id && x.quantidade > 0);
    if (new Set(escolhidos.map((e) => e.fardoCodigo)).size !== escolhidos.length) erros[`item-${item.id}`] = 'O mesmo fardo aparece mais de uma vez.';
    let total = 0;
    for (const e of escolhidos) {
      const op = opcoes.find((o) => o.itemId === item.id && o.fardoCodigo === e.fardoCodigo);
      if (!op) { erros[`item-${item.id}`] = `Fardo ${e.fardoCodigo} não está disponível para este item.`; continue; }
      if (!Number.isInteger(e.quantidade) || e.quantidade > op.disponivel) { erros[`item-${item.id}`] = `Quantidade inválida no fardo ${e.fardoCodigo} (disponível: ${op.disponivel}).`; continue; }
      const f = B.fardos.find((x) => x.codigo === e.fardoCodigo)!;
      itens.push({ itemId: item.id, fardoCodigo: f.codigo, loteCodigo: f.loteCodigo, quantidade: e.quantidade, saldoFardo: f.saldo });
      total += e.quantidade;
    }
    if (!erros[`item-${item.id}`] && total !== item.quantidade) erros[`item-${item.id}`] = `Separado ${total} de ${item.quantidade}: a quantidade separada tem de bater com a pedida.`;
  }
  if (Object.keys(erros).length) throw new ApiError(422, 'Confira a separação.', erros);

  const chave = (l: { itemId: string; fardoCodigo: string; quantidade: number }[]) => l.map((x) => `${x.itemId}|${x.fardoCodigo}|${x.quantidade}`).sort().join(';');
  const seguiuSugestao = chave(itens) === chave(opcoes.filter((o) => o.sugerido > 0).map((o) => ({ ...o, quantidade: o.sugerido })));
  const justificativa = n.justificativa?.trim();
  if (!seguiuSugestao && !justificativa) throw new ApiError(422, 'A separação difere da sugestão FIFO: a justificativa é obrigatória.', { justificativa: 'Informe a justificativa.' });

  rme.separacao = { itens, seguiuSugestao, justificativa: seguiuSugestao ? undefined : justificativa, almoxarife: ctx.usuario, separadaEm: ctx.quando };
  rme.status = 'em_separacao';
  registrar(rme, ctx, 'Separação registrada', seguiuSugestao ? 'Seguiu a sugestão FIFO.' : `Fora da sugestão FIFO: ${justificativa}`);
  return rme;
}

/** Conferência do supervisor (regra 8). O servidor recusa conferente igual a quem separou; o mock aceita (usuário único de demonstração). */
export function conferirRme(rme: Rme, d: { aprovada: boolean; motivo?: string }, ctx: Contexto): Rme {
  exigirStatus(rme, 'em_separacao');
  if (d.aprovada) {
    rme.status = 'conferida';
    rme.supervisor = ctx.usuario;
    rme.conferidaEm = ctx.quando;
    registrar(rme, ctx, 'Conferência aprovada');
    return rme;
  }
  const motivo = d.motivo?.trim();
  if (!motivo) throw new ApiError(422, 'Informe o motivo da devolução.', { motivo: 'Campo obrigatório.' });
  rme.status = 'aberta';
  rme.separacao = undefined;
  registrar(rme, ctx, 'Devolvida para separação', motivo);
  return rme;
}

/** Entrega com baixa: saldo do fardo diminui; com sobra fica "aberto", zerado fica "baixado". Cada fardo gera uma saída. */
export function entregarRme(B: BaseRme, rme: Rme, ctx: Contexto): Rme {
  exigirStatus(rme, 'conferida');
  const sep = rme.separacao!;
  for (const s of sep.itens) {
    const f = B.fardos.find((x) => x.codigo === s.fardoCodigo);
    if (!f || f.saldo < s.quantidade) throw new ApiError(409, `Saldo insuficiente no fardo ${s.fardoCodigo}. Devolva a RME para nova separação.`);
  }
  for (const s of sep.itens) {
    const f = B.fardos.find((x) => x.codigo === s.fardoCodigo)!;
    const lote = B.lotes.find((l) => l.codigo === f.loteCodigo)!;
    f.saldo -= s.quantidade;
    f.estado = f.saldo > 0 ? 'aberto' : 'baixado';
    lote.saldo -= s.quantidade;
    const saldo = B.saldos.find((x) => x.loteCodigo === lote.codigo);
    if (saldo) {
      saldo.disponivel -= s.quantidade;
      saldo.volumeM3 = (lote.volumeCalculadoM3 / lote.quantidade) * lote.saldo;
      saldo.metrosLineares = lote.comprimentoM * lote.saldo;
    }
    B.movimentacoes.unshift({
      id: ctx.novoId('m'), tipo: 'saida', loteCodigo: lote.codigo, fardoCodigo: f.codigo, referencia: rme.numero, quantidade: s.quantidade,
      origem: f.local, destino: rme.destinatario, dataHora: ctx.quando, usuario: ctx.usuario, status: 'aprovado',
    });
    const item = rme.itens.find((i) => i.id === s.itemId)!;
    item.quantidadeEntregue += s.quantidade;
  }
  rme.status = 'entregue';
  rme.entreguePor = ctx.usuario;
  rme.entregueEm = ctx.quando;
  registrar(rme, ctx, 'Entrega confirmada e baixa no estoque');
  return rme;
}

export function cancelarRme(rme: Rme, motivo: string, ctx: Contexto): Rme {
  exigirStatus(rme, 'aberta', 'em_separacao', 'conferida');
  if (!motivo.trim()) throw new ApiError(422, 'Informe o motivo do cancelamento.', { motivo: 'Campo obrigatório.' });
  rme.status = 'cancelada';
  rme.motivoCancelamento = motivo.trim();
  registrar(rme, ctx, 'RME cancelada', motivo.trim());
  return rme;
}
