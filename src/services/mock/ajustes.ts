import { MOTIVO_PERDA } from '../../dominio/rotulos';
import type { Movimentacao, NovaMovimentacao } from '../../types/models';
import { ApiError } from '../http';
import { movimentarDormentes, problemaDormentes, type BaseSaldo } from './estoque';
import { dormentesReservados, type BaseRme } from './rme';

interface Contexto {
  quando: string;
  usuario: string;
  novoId: (prefixo: string) => string;
}

type Base = BaseSaldo & BaseRme;

/** Perda e ajuste tiram as peças do fardo; ajuste positivo devolve ao fardo peças que tinham baixa por perda ou ajuste. */
const sentido = (m: { tipo: string; quantidade: number }) => (m.tipo === 'ajuste' && m.quantidade > 0 ? 'volta' : 'sai');

/**
 * Perda e ajuste (regras 6 e 9): por fardo, com os códigos dos dormentes e motivo, pendentes até a aprovação;
 * não alteram o saldo ao registrar. A quantidade é o número de dormentes (negativa no ajuste que retira).
 */
export function registrarPerdaAjuste(B: Base, n: Extract<NovaMovimentacao, { tipo: 'perda' | 'ajuste' }>, ctx: Contexto): Movimentacao {
  const fardo = B.fardos.find((f) => f.codigo.toLowerCase() === n.fardoCodigo.trim().toLowerCase());
  if (!fardo) throw new ApiError(404, 'Fardo não encontrado.', { fardoCodigo: 'Fardo inexistente.' });
  const lote = B.lotes.find((l) => l.codigo === fardo.loteCodigo)!;
  const motivo = n.motivo.trim();
  if (!motivo) throw new ApiError(422, 'Informe o motivo.', { motivo: 'Campo obrigatório.' });
  if (!Number.isInteger(n.quantidade) || n.quantidade === 0) throw new ApiError(422, 'Quantidade inválida.', { quantidade: 'Informe um número inteiro diferente de zero.' });
  if (n.tipo === 'perda' && n.quantidade < 0) throw new ApiError(422, 'A perda é informada em quantidade positiva.', { quantidade: 'Use um número positivo.' });
  const dormentes = (n.dormentes ?? []).map((d) => d.trim().toUpperCase());
  if (dormentes.length !== Math.abs(n.quantidade)) throw new ApiError(422, 'Informe um código de dormente para cada peça.', { dormentes: `Informe ${Math.abs(n.quantidade)} código(s).` });
  const problema = problemaDormentes(B, fardo, dormentes, sentido(n));
  if (problema) throw new ApiError(422, problema, { dormentes: problema });
  const m: Movimentacao = {
    id: ctx.novoId('m'), tipo: n.tipo, loteCodigo: lote.codigo, fardoCodigo: fardo.codigo, especie: lote.especieDocumental, quantidade: n.quantidade,
    origem: fardo.local, destino: n.tipo === 'perda' ? `Perda: ${MOTIVO_PERDA[n.motivoPerda][1]}` : 'Ajuste de saldo', dataHora: ctx.quando, usuario: ctx.usuario,
    status: 'pendente', motivoPerda: n.tipo === 'perda' ? n.motivoPerda : undefined, motivo, dormentes,
  };
  B.movimentacoes.unshift(m);
  return m;
}

/** Aprovação pelo supervisor/gestor. O servidor recusa quem registrou; o mock aceita (demonstração) e a tela avisa. */
export function decidirMovimentacao(B: Base, m: Movimentacao, d: { aprovada: boolean; motivo?: string }, ctx: Contexto): Movimentacao {
  if (m.tipo !== 'perda' && m.tipo !== 'ajuste') throw new ApiError(409, 'Só perda e ajuste passam por aprovação.');
  if (m.status !== 'pendente') throw new ApiError(409, 'Esta movimentação já foi decidida.');
  if (!d.aprovada) {
    const motivo = d.motivo?.trim();
    if (!motivo) throw new ApiError(422, 'Informe o motivo da rejeição.', { motivo: 'Campo obrigatório.' });
    Object.assign(m, { status: 'rejeitado', motivoRejeicao: motivo, decididoPor: ctx.usuario, decididoEm: ctx.quando });
    return m;
  }
  const dormentes = m.dormentes ?? [];
  const lado = sentido(m);
  if (lado === 'sai') {
    const presos = dormentesReservados(B);
    const reservado = dormentes.find((x) => presos.has(x));
    if (reservado) throw new ApiError(409, `O dormente ${reservado} está reservado em RME. Resolva a RME antes de aprovar.`);
  }
  movimentarDormentes(B, m.fardoCodigo!, dormentes, lado, { tipo: m.tipo, quando: ctx.quando, usuario: ctx.usuario });
  Object.assign(m, { status: 'aprovado', decididoPor: ctx.usuario, decididoEm: ctx.quando });
  return m;
}
