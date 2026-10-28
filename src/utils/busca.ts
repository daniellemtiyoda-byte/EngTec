/**
 * Reconhece os códigos do sistema e diz para onde levar (busca global e links das tabelas).
 *  LT26-0042-F03 → lote com o fardo em destaque · LT26-0042 → lote · RME26-0007 → RME · "NF 1000" ou só números → NF
 */
const FARDO = /^LT\d{2}-\d{4}-F\d{2,}$/i;
const LOTE = /^LT\d{2}-\d{4}$/i;
const RME = /^RME\d{2}-\d{4}$/i;
const NF = /^(?:NF\s*)?(\d{1,9})$/i;

export const loteDoFardo = (fardo: string) => fardo.replace(/-F\d+$/i, '');

export function rotaDoCodigo(texto: string): string | null {
  const t = texto.trim();
  if (FARDO.test(t)) return `/lotes/${encodeURIComponent(loteDoFardo(t).toUpperCase())}?fardo=${encodeURIComponent(t.toUpperCase())}`;
  if (LOTE.test(t)) return `/lotes/${encodeURIComponent(t.toUpperCase())}`;
  if (RME.test(t)) return `/rme?q=${encodeURIComponent(t.toUpperCase())}`;
  const nf = NF.exec(t);
  if (nf) return `/notas?q=${encodeURIComponent(nf[1])}`;
  return null;
}

/** Busca global: código conhecido vai direto ao registro; texto livre pesquisa nos lotes. */
export const destinoBusca = (texto: string) => rotaDoCodigo(texto) ?? `/lotes?q=${encodeURIComponent(texto.trim())}`;
