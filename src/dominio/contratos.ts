import type { Contrato, ItemContrato } from '../types/models';

type ContratoDaAta = Pick<Contrato, 'numero' | 'dataAssinatura' | 'gestor'>;

/** Sequência do contrato no número ("AR00224-04" → 4); 0 se o número não tiver o formato. */
export const sequenciaDoContrato = (numeroContrato: string): number => {
  const m = /-(\d{2})$/.exec(numeroContrato.trim());
  return m ? Number(m[1]) : 0;
};

/** Maior sequência já usada na ata, contando os cancelados (o número de um contrato cancelado não é reaproveitado). */
export const maiorSequenciaDaAta = (contratos: Pick<Contrato, 'numero'>[]): number =>
  contratos.reduce((m, c) => Math.max(m, sequenciaDoContrato(c.numero)), 0);

/** Número sugerido do próximo contrato da ata: maior sequência + 1, com dois dígitos ("AR00224-04"). */
export const proximoNumeroContrato = (numeroAta: string, contratosDaAta: Pick<Contrato, 'numero'>[]): string =>
  `${numeroAta}-${String(maiorSequenciaDaAta(contratosDaAta) + 1).padStart(2, '0')}`;

/** Aviso (não bloqueia) quando o número digitado pula a sequência da ata; vazio quando está certo ou incompleto. */
export function avisoSequenciaContrato(numeroDigitado: string, numeroAta: string, contratosDaAta: Pick<Contrato, 'numero'>[]): string | undefined {
  const n = numeroDigitado.trim().toUpperCase();
  if (!numeroAta || !/^[A-Z]{2}\d{5}-\d{2}$/.test(n) || !n.startsWith(`${numeroAta}-`)) return undefined;
  const esperada = maiorSequenciaDaAta(contratosDaAta) + 1;
  const digitada = sequenciaDoContrato(n);
  if (digitada <= esperada) return undefined;
  return `A próxima sequência da ata seria ${String(esperada).padStart(2, '0')}: este número pula ${digitada - esperada === 1 ? 'uma sequência' : `${digitada - esperada} sequências`}.`;
}

/** Gestor do contrato mais recente da ata (pela data de assinatura; empate pela maior sequência); vazio sem contratos. */
export function gestorSugerido(contratosDaAta: ContratoDaAta[]): string {
  let melhor: ContratoDaAta | undefined;
  for (const c of contratosDaAta) {
    if (!melhor || c.dataAssinatura > melhor.dataAssinatura || (c.dataAssinatura === melhor.dataAssinatura && sequenciaDoContrato(c.numero) > sequenciaDoContrato(melhor.numero))) melhor = c;
  }
  return melhor?.gestor ?? '';
}

/** Itens do contrato que pertencem à parcela, com o saldo a emitir de cada um; vazio sem parcela escolhida. */
export function tamanhosDaParcela(contrato: Pick<Contrato, 'itens' | 'parcelas'> | undefined, numeroParcela: number | string | undefined): { item: ItemContrato; saldo: number }[] {
  const p = contrato?.parcelas.find((x) => String(x.numero) === String(numeroParcela));
  if (!contrato || !p) return [];
  return contrato.itens.filter((i) => p.itens.some((x) => x.tamanhoId === i.tamanhoId)).map((item) => ({ item, saldo: item.saldoAEmitir }));
}
