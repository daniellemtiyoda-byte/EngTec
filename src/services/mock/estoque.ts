import type { Dormente, Fardo, Lote, SaldoEstoque, SituacaoLote } from '../../types/models';
import { ApiError } from '../http';

/** O que uma alteração de saldo lê e altera nos dados simulados. */
export interface BaseSaldo {
  lotes: Lote[];
  fardos: Fardo[];
  saldos: SaldoEstoque[];
  dormentes: Dormente[];
}

/** Fardo que pode ir para a separação: aprovado na inspeção e sem divergência de espécie ou tamanho. */
export const fardoLiberado = (f: Fardo) => f.resultado === 'aprovado' && !f.motivoBloqueio;

/**
 * Situação única do lote para a tela, na ordem do que impede o uso: sem saldo, divergência, inspeção não concluída;
 * depois, disponível se algum fardo liberado tem saldo, senão o motivo do bloqueio dos fardos que sobraram.
 */
export function situacaoDoLote(l: Lote, fardos: Fardo[]): SituacaoLote {
  if (l.saldo <= 0) return 'sem_saldo';
  if (l.estoqueStatus === 'divergente') return 'divergente';
  if (l.etapaInspecao !== 'concluida') return 'aguardando_inspecao';
  const comSaldo = fardos.filter((f) => f.loteCodigo === l.codigo && f.saldo > 0);
  if (comSaldo.some(fardoLiberado)) return 'disponivel';
  if (comSaldo.some((f) => f.resultado === 'quarentena')) return 'quarentena';
  if (comSaldo.some((f) => f.resultado === 'reprovado')) return 'reprovado';
  return 'bloqueado';
}

/**
 * Saldo do lote por estado, a partir dos fardos: liberado = disponível, quarentena/reprovado/divergência de espécie = bloqueado,
 * unidades ainda sem fardo = em análise; lote com divergência de volume fica todo em "com divergência".
 */
export function recalcularSaldo(B: BaseSaldo, lote: Lote) {
  const s = B.saldos.find((x) => x.loteCodigo === lote.codigo);
  if (!s) return;
  const fs = B.fardos.filter((f) => f.loteCodigo === lote.codigo);
  const soma = (l: Fardo[]) => l.reduce((a, f) => a + f.saldo, 0);
  const divergente = lote.estoqueStatus === 'divergente';
  Object.assign(s, {
    disponivel: divergente ? 0 : soma(fs.filter(fardoLiberado)),
    bloqueado: divergente ? 0 : soma(fs.filter((f) => !fardoLiberado(f))),
    emAnalise: divergente ? 0 : lote.unidadesSemFardo,
    divergente: divergente ? lote.saldo : 0,
    categoria: lote.categoria, local: lote.local,
    volumeM3: (lote.volumeCalculadoM3 / lote.quantidade) * lote.saldo,
    metrosLineares: lote.comprimentoM * lote.saldo,
  });
}

/**
 * Única forma de mudar saldo no mock (chamada por `movimentarDormentes`, na baixa de RME e na perda e no ajuste aprovados):
 * fardo, lote e estoque juntos.
 * Fardo zerado fica "baixado"; com saldo abaixo do inicial (ou que já tinha sido aberto) fica "aberto".
 */
export function alterarSaldoFardo(B: BaseSaldo, fardoCodigo: string, delta: number) {
  const fardo = B.fardos.find((f) => f.codigo === fardoCodigo);
  const lote = fardo && B.lotes.find((l) => l.codigo === fardo.loteCodigo);
  if (!fardo || !lote) throw new ApiError(404, `Fardo ${fardoCodigo} não encontrado.`);
  if (fardo.saldo + delta < 0) throw new ApiError(409, `Saldo insuficiente no fardo ${fardoCodigo} (saldo ${fardo.saldo}).`);
  fardo.saldo += delta;
  fardo.estado = fardo.saldo === 0 ? 'baixado' : fardo.estado === 'fechado' && fardo.saldo >= fardo.quantidadeInicial ? 'fechado' : 'aberto';
  lote.saldo += delta;
  recalcularSaldo(B, lote);
  return { fardo, lote };
}

/**
 * Confere os dormentes de uma baixa ou devolução: "sai" exige peças em estoque neste fardo; "volta" exige peças do mesmo lote
 * que tiveram baixa por perda ou ajuste (nenhum código novo é criado). Devolve a mensagem do problema, ou nada.
 */
export function problemaDormentes(B: BaseSaldo, fardo: Fardo, codigos: string[], sentido: 'sai' | 'volta'): string | undefined {
  if (!codigos.length) return 'Informe os códigos dos dormentes.';
  if (new Set(codigos).size !== codigos.length) return 'Há código de dormente repetido.';
  for (const c of codigos) {
    const d = B.dormentes.find((x) => x.codigo === c);
    if (!d || d.loteCodigo !== fardo.loteCodigo) return `O dormente ${c} não é do lote ${fardo.loteCodigo}.`;
    if (sentido === 'sai' && (d.fardoCodigo !== fardo.codigo || d.estado !== 'em_estoque')) return `O dormente ${c} não está em estoque no fardo ${fardo.codigo}.`;
    if (sentido === 'volta' && (d.estado !== 'baixado' || d.baixa?.tipo === 'saida')) return `O dormente ${c} não teve baixa por perda ou ajuste: não pode voltar ao fardo.`;
  }
  return undefined;
}

/** Baixa ou devolução de dormentes num fardo: peças e saldo (fardo, lote e estoque) mudam juntos. */
export function movimentarDormentes(B: BaseSaldo, fardoCodigo: string, codigos: string[], sentido: 'sai' | 'volta', baixa: NonNullable<Dormente['baixa']>) {
  const fardo = B.fardos.find((f) => f.codigo === fardoCodigo);
  if (!fardo) throw new ApiError(404, `Fardo ${fardoCodigo} não encontrado.`);
  const problema = problemaDormentes(B, fardo, codigos, sentido);
  if (problema) throw new ApiError(409, problema);
  for (const c of codigos) {
    const d = B.dormentes.find((x) => x.codigo === c)!;
    if (sentido === 'sai') Object.assign(d, { estado: 'baixado', baixa });
    else Object.assign(d, { estado: 'em_estoque', fardoCodigo: fardo.codigo, baixa: undefined });
  }
  return alterarSaldoFardo(B, fardoCodigo, sentido === 'sai' ? -codigos.length : codigos.length);
}
