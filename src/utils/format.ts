const formatadores = new Map<number, Intl.NumberFormat>();
/** Formatadores são caros de criar: guarda um por número de casas decimais. */
function nf(d: number): Intl.NumberFormat {
  let f = formatadores.get(d);
  if (!f) {
    f = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
    formatadores.set(d, f);
  }
  return f;
}
const NUMERO = new Intl.NumberFormat('pt-BR');
const TZ = 'America/Sao_Paulo';

export const numero = (v: number) => NUMERO.format(v);
export const un = (v: number) => `${nf(0).format(v)} un.`;
export const metros = (v: number) => `${nf(2).format(v)} m`;
export const mLineares = (v: number) => `${nf(2).format(v)} m lineares`;
export const m3 = (v: number) => `${nf(3).format(v)} m³`;
export const pct = (v: number) => `${nf(1).format(v)}%`;
export const pct01 = (v: number) => `${nf(0).format(v * 100)}%`;

export function data(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { timeZone: iso.length === 10 ? 'UTC' : TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function dataHora(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { timeZone: TZ, hour12: false, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(', ', ' ');
}

export const rotuloClasse = (c: string, cat: string) => `${c === 'primeira' ? '1ª classe' : '2ª classe'} · Cat. ${cat}`;

/**
 * Converte número digitado no padrão brasileiro ou com ponto decimal. Única conversão usada por validação e envio.
 *  "1.234,5" → 1234.5 · "5,0" → 5 · "2.8" → 2.8 · inteiro: "1.000" → 1000 · inválido → NaN
 */
export function paraNumero(texto: string, inteiro = false): number {
  const s = texto.trim().replace(/\s/g, '');
  if (!s) return NaN;
  if (s.includes(',')) {
    return /^-?(\d{1,3}(\.\d{3})+|\d+),\d+$/.test(s) ? Number(s.replace(/\./g, '').replace(',', '.')) : NaN;
  }
  if (inteiro && /^-?\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ''));
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

/** Aceita só URLs http(s); evita javascript: e similares vindos da API. */
export function urlSegura(u?: string): string | null {
  if (!u) return null;
  try {
    const x = new URL(u);
    return x.protocol === 'https:' || x.protocol === 'http:' ? x.toString() : null;
  } catch { return null; }
}

/** Aceita só caminhos internos ("/lotes"); rejeita "//site", "/\site" e similares vindos da API (open redirect). */
export function linkInterno(l?: string): string {
  return l && /^\/(?![/\\])[^\\]*$/.test(l) ? l : '/';
}
