/**
 * Reconhece os códigos do sistema e diz para onde levar (busca global e links das tabelas).
 *  LT26-0042-F03 → lote com o fardo em destaque · LT26-0042-0007 (dormente) → lote com a peça em destaque · LT26-0042 → lote
 *  RME26-0007 → RME · "NF 1000" ou só números → NF
 */
const FARDO = /^LT\d{2}-\d{4}-F\d{2,}$/i;
const PECA = /^(LT\d{2}-\d{4})-\d{4}$/i;
const LOTE = /^LT\d{2}-\d{4}$/i;
const RME = /^RME\d{2}-\d{4}$/i;
const NF = /^(?:NF\s*)?(\d{1,9})$/i;

export const loteDoFardo = (fardo: string) => fardo.replace(/-F\d+$/i, '');

export function rotaDoCodigo(texto: string): string | null {
  const t = texto.trim();
  if (FARDO.test(t)) return `/lotes/${encodeURIComponent(loteDoFardo(t).toUpperCase())}?fardo=${encodeURIComponent(t.toUpperCase())}`;
  const peca = PECA.exec(t);
  if (peca) return `/lotes/${encodeURIComponent(peca[1].toUpperCase())}?peca=${encodeURIComponent(t.toUpperCase())}`;
  if (LOTE.test(t)) return `/lotes/${encodeURIComponent(t.toUpperCase())}`;
  if (RME.test(t)) return `/rme?visao=lista&q=${encodeURIComponent(t.toUpperCase())}`;
  const nf = NF.exec(t);
  if (nf) return `/notas?visao=lista&q=${encodeURIComponent(nf[1])}`;
  return null;
}

/** Busca global: código conhecido vai direto ao registro; texto livre pesquisa nos lotes. */
export const destinoBusca = (texto: string) => rotaDoCodigo(texto) ?? `/lotes?q=${encodeURIComponent(texto.trim())}`;

/** Sequência da peça para exibir de forma curta: LT26-0042-0007 → 0007. */
export const seqPeca = (codigo: string) => codigo.slice(-4);

/**
 * Lê os códigos de dormentes digitados (separados por vírgula, espaço ou quebra de linha). Aceita o código completo
 * (LT26-0042-0007) ou só a sequência (7 ou 0007), que é completada com o lote. O servidor confere cada código.
 */
export function codigosDePecas(texto: string, loteCodigo: string): string[] {
  return texto.split(/[\s,;]+/).map((t) => t.trim().toUpperCase()).filter(Boolean)
    .map((t) => (/^\d{1,4}$/.test(t) ? `${loteCodigo.toUpperCase()}-${t.padStart(4, '0')}` : t));
}
