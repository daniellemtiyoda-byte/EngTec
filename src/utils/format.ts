import { env } from '../config/env';

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

const DIA_MS = 86_400_000;
/** Hoje (AAAA-MM-DD) no fuso de São Paulo. */
export const hojeSP = () => new Date().toLocaleDateString('sv-SE', { timeZone: TZ });
/** Dias de hoje até a data AAAA-MM-DD (negativo = já passou). */
export const diasAte = (aaaammdd: string) => Math.round((Date.parse(aaaammdd) - Date.parse(hojeSP())) / DIA_MS);
/** Dias inteiros desde o instante ISO. */
export const diasDesde = (iso: string) => Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / DIA_MS));
/** "vence hoje", "vence em 3 dias", "venceu há 2 dias". */
export function prazoTexto(dias: number) {
  if (dias === 0) return 'vence hoje';
  return dias > 0 ? `vence em ${dias} ${dias === 1 ? 'dia' : 'dias'}` : `venceu há ${-dias} ${dias === -1 ? 'dia' : 'dias'}`;
}

export function dataHora(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { timeZone: TZ, hour12: false, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(', ', ' ');
}

/** Classe e categoria são campos diferentes e sempre aparecem com o nome do campo (regra do PRD). */
export const rotuloClasse = (c?: string) => (c ? `Classe ${c}` : 'Classe a definir');
export const rotuloCategoria = (c?: number) => (c ? `Categoria ${c}` : 'Categoria a definir');
/** Para tabelas: só o que já foi definido ("Classe 1ª · Categoria 2"); vazio quando nenhum dos dois foi lançado, para não repetir "a definir" em toda linha. */
export const classeCategoria = (classe?: string, categoria?: number) =>
  [classe && rotuloClasse(classe), categoria && rotuloCategoria(categoria)].filter(Boolean).join(' · ');
export const dias = (n: number) => `${NUMERO.format(Math.round(n))} ${Math.round(n) === 1 ? 'dia' : 'dias'}`;
export const cm = (v: number) => `${NUMERO.format(v)} cm`;

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

/** Valida extensão, tamanho e arquivo vazio no navegador (o servidor valida de novo). Retorna a mensagem de erro ou undefined. */
export function arquivoInvalido(f: File, extensoes: string[]): string | undefined {
  const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
  if (extensoes.length && !extensoes.includes(ext)) return `Formato não permitido em ${f.name}. Aceitos: ${extensoes.join(', ').toUpperCase()}.`;
  if (f.size > env.UPLOAD_MAX_MB * 1024 * 1024) return `${f.name} é maior que o limite de ${env.UPLOAD_MAX_MB} MB.`;
  if (f.size === 0) return `${f.name} está vazio.`;
  return undefined;
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
