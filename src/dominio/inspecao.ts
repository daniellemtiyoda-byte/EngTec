import type { Categoria, ResultadoPeca } from '../types/models';
import { RESULTADO_INSPECAO } from './rotulos';

/**
 * Grupos da formação de fardos: aprovadas separadas por categoria; quarentena e reprovado não se dividem por categoria.
 * Um fardo nunca mistura grupos. Usado pela tela (prévia) e pelo mock; no modo real a regra vale no servidor.
 */
export const chaveGrupo = (g: { resultado: ResultadoPeca; categoria?: Categoria }) => (g.resultado === 'aprovado' ? `aprovado|${g.categoria ?? ''}` : g.resultado);

/** "Aprovado · Categoria 1", "Quarentena", "Reprovado". */
export const rotuloGrupo = (g: { resultado: ResultadoPeca; categoria?: Categoria }) =>
  `${RESULTADO_INSPECAO[g.resultado][1]}${g.resultado === 'aprovado' && g.categoria ? ` · Categoria ${g.categoria}` : ''}`;

/** Ordem de exibição: aprovadas (Categoria 1, 2, 3), quarentena, reprovadas. */
export const ORDEM_RESULTADO: ResultadoPeca[] = ['aprovado', 'quarentena', 'reprovado'];
