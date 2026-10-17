const nf = (d: number) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const TZ = 'America/Sao_Paulo';

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

/** Aceita só URLs http(s); evita javascript: e similares vindos da API. */
export function urlSegura(u?: string): string | null {
  if (!u) return null;
  try {
    const x = new URL(u);
    return x.protocol === 'https:' || x.protocol === 'http:' ? x.toString() : null;
  } catch { return null; }
}
