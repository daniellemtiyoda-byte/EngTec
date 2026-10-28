/**
 * Parâmetros de negócio do PRD. No modo real quem aplica as regras é o servidor; a interface usa
 * estes valores só para a prévia (ex.: a divergência mostrada antes de confirmar o recebimento).
 */

/** Divergência de volume (carga real x DOF) acima da qual a norma manda recusar a carga e comunicar o órgão (IN Ibama 21/2014, art. 53). */
export const TOLERANCIA_VOLUME_PCT = 10;

/** Quantidade usual de dormentes por fardo; serve só de sugestão, a quantidade real é informada no recebimento. */
export const DORMENTES_POR_FARDO = 14;

/** Diferença percentual do volume recebido em relação ao volume do DOF. */
export const diferencaVolumePct = (recebidoM3: number, dofM3: number) => (dofM3 > 0 ? ((recebidoM3 - dofM3) / dofM3) * 100 : recebidoM3 > 0 ? 100 : 0);

export const foraDaTolerancia = (diferencaPct: number) => Math.abs(diferencaPct) > TOLERANCIA_VOLUME_PCT;

/** Sugestão inicial de fardos para uma quantidade: fardos cheios de 14 e um último com o resto. */
export function sugerirFardos(quantidade: number): number[] {
  const cheios = Math.floor(quantidade / DORMENTES_POR_FARDO);
  const resto = quantidade % DORMENTES_POR_FARDO;
  return [...Array<number>(cheios).fill(DORMENTES_POR_FARDO), ...(resto ? [resto] : [])];
}
