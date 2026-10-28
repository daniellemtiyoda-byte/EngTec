import type { Fardo, Lote, SaldoEstoque, SituacaoLote, StatusEstoque } from '../../types/models';
import { ApiError } from '../http';

/** O que uma alteração de saldo lê e altera nos dados simulados. */
export interface BaseSaldo {
  lotes: Lote[];
  fardos: Fardo[];
  saldos: SaldoEstoque[];
}

const BALDE: Record<StatusEstoque, 'disponivel' | 'emAnalise' | 'bloqueado' | 'divergente'> = {
  disponivel: 'disponivel', em_analise: 'emAnalise', bloqueado: 'bloqueado', divergente: 'divergente',
};

/** Situação única do lote para a tela, na ordem do que impede o uso: sem saldo, divergência, inspeção, bloqueio. */
export function situacaoDoLote(l: Lote): SituacaoLote {
  if (l.saldo <= 0) return 'sem_saldo';
  if (l.estoqueStatus === 'divergente') return 'divergente';
  if (l.inspecao === 'aguardando' || l.estoqueStatus === 'em_analise') return 'aguardando_inspecao';
  if (l.inspecao === 'quarentena') return 'quarentena';
  if (l.inspecao === 'reprovado') return 'reprovado';
  return l.estoqueStatus === 'disponivel' ? 'disponivel' : 'bloqueado';
}

/**
 * Única forma de mudar saldo no mock (baixa de RME, perda e ajuste aprovados): fardo, lote e estoque juntos.
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
  const s = B.saldos.find((x) => x.loteCodigo === lote.codigo);
  if (s) {
    s[BALDE[lote.estoqueStatus]] += delta;
    s.volumeM3 = (lote.volumeCalculadoM3 / lote.quantidade) * lote.saldo;
    s.metrosLineares = lote.comprimentoM * lote.saldo;
  }
  return { fardo, lote };
}
