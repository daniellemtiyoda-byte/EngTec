import { env } from '../config/env';

/**
 * Identificação dos objetos do sistema (seção 5.1 do docs/PLANO-V2.md). Toda validação de ID passa por aqui,
 * nunca por regex espalhada pelas telas. Formatos de ata e contrato são PROVISÓRIOS (como na plaquinha atual).
 *
 * Exemplos (testados em identificacao.test.ts):
 *  válidos:   AR00224 (ata) · AR00224-01 (contrato) · AR00224-01-000357 (dormente) · AR00224-01-F012 (fardo)
 *             RME-2026-0012 (RME) · LOC-A03 e LOC-A-03 (local) · https://app.exemplo/#/d/AR00224-01-000357 (link do QR)
 *  inválidos: AR224-01 · AR00224-1 · AR00224-01-357 · AR00224-01-F12 · RME26-0012 · LOC- · LOC-a 03
 */
export const RE_ATA = /^[A-Z]{2}\d{5}$/;
export const RE_CONTRATO = /^[A-Z]{2}\d{5}-\d{2}$/;
export const RE_DORMENTE = /^([A-Z]{2}\d{5}-\d{2})-(\d{6})$/;
export const RE_FARDO = /^([A-Z]{2}\d{5}-\d{2})-F(\d{3})$/;
export const RE_RME = /^RME-(\d{4})-(\d{4})$/;
export const RE_LOCAL = /^LOC-([A-Z0-9]+(?:-[A-Z0-9]+)*)$/;
/** Código do local sem o prefixo (A03, A-03): letras e números em maiúsculas, partes separadas por hífen. */
export const RE_CODIGO_LOCAL = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

export type TipoCodigo = 'dormente' | 'fardo' | 'contrato' | 'rme' | 'local';
export interface CodigoLido { tipo: TipoCodigo; id: string }

const zeros = (n: number, casas: number) => String(n).padStart(casas, '0');

function exigirSequencia(seq: number, max: number) {
  if (!Number.isInteger(seq) || seq < 1 || seq > max) throw new Error(`Sequência fora do intervalo (1 a ${max}): ${seq}`);
}
function exigirContrato(contrato: string) {
  if (!RE_CONTRATO.test(contrato)) throw new Error(`Número de contrato inválido: ${contrato}`);
}

/** AR00224-01 + 357 → AR00224-01-000357. */
export function idDormente(contrato: string, seq: number): string {
  exigirContrato(contrato);
  exigirSequencia(seq, 999_999);
  return `${contrato}-${zeros(seq, 6)}`;
}

/** AR00224-01 + 12 → AR00224-01-F012. */
export function idFardo(contrato: string, seq: number): string {
  exigirContrato(contrato);
  exigirSequencia(seq, 999);
  return `${contrato}-F${zeros(seq, 3)}`;
}

/** 2026 + 12 → RME-2026-0012. */
export function idRme(ano: number, seq: number): string {
  exigirSequencia(seq, 9_999);
  return `RME-${ano}-${zeros(seq, 4)}`;
}

/** Código do local (A03) → ID do QR (LOC-A03). */
export function idLocal(codigo: string): string {
  const c = codigo.trim().toUpperCase();
  if (!RE_CODIGO_LOCAL.test(c)) throw new Error(`Código de local inválido: ${codigo}`);
  return `LOC-${c}`;
}

/** Sequência do dormente ou do fardo (AR00224-01-000357 → 357; AR00224-01-F012 → 12); null se não for um deles. */
export function sequenciaDe(id: string): number | null {
  const m = RE_DORMENTE.exec(id) ?? RE_FARDO.exec(id);
  return m ? Number(m[2]) : null;
}

/** Contrato a que o ID de dormente ou de fardo pertence. */
export function contratoDe(id: string): string | null {
  return (RE_DORMENTE.exec(id) ?? RE_FARDO.exec(id))?.[1] ?? null;
}

function lerId(t: string): CodigoLido | null {
  if (RE_DORMENTE.test(t)) return { tipo: 'dormente', id: t };
  if (RE_FARDO.test(t)) return { tipo: 'fardo', id: t };
  if (RE_RME.test(t)) return { tipo: 'rme', id: t };
  if (RE_LOCAL.test(t)) return { tipo: 'local', id: t };
  if (RE_CONTRATO.test(t)) return { tipo: 'contrato', id: t };
  return null;
}

/**
 * Lê o que veio do QR ou foi digitado: o ID puro ou o link completo do QR (…/#/d/<id>, …/#/f/<id>, …/#/locais/<código>).
 * O endereço do link não é conferido: só o caminho depois do # importa, e o ID tem de ter um formato conhecido.
 * Devolve null para qualquer outra coisa ("QR não pertence ao sistema").
 */
export function lerCodigo(texto: string): CodigoLido | null {
  const t = texto.trim();
  if (!t || t.length > 300) return null;
  const hash = t.indexOf('#/');
  if (hash >= 0) {
    let caminho: string;
    try { caminho = decodeURIComponent(t.slice(hash + 1).split(/[?#]/)[0]); } catch { return null; }
    const [, tipo, valor = ''] = caminho.split('/');
    const v = valor.trim().toUpperCase();
    if (tipo === 'd' && RE_DORMENTE.test(v)) return { tipo: 'dormente', id: v };
    if (tipo === 'f' && RE_FARDO.test(v)) return { tipo: 'fardo', id: v };
    if (tipo === 'locais' && RE_CODIGO_LOCAL.test(v)) return { tipo: 'local', id: `LOC-${v}` };
    return null;
  }
  return lerId(t.toUpperCase());
}

/** Rota da página do objeto. Local: o ID LOC-A03 abre /locais/A03. */
export function rotaDoObjeto({ tipo, id }: CodigoLido): string {
  switch (tipo) {
    case 'dormente': return `/d/${id}`;
    case 'fardo': return `/f/${id}`;
    case 'contrato': return `/contratos/${id}`;
    case 'rme': return `/saidas/${id}`;
    case 'local': return `/locais/${id.replace(/^LOC-/, '')}`;
  }
}

/** Base do link: VITE_APP_URL (a URL da Vercel) ou o endereço em que o app está aberto. */
function baseDoApp(): string {
  if (env.APP_URL) return env.APP_URL;
  if (typeof window === 'undefined') return '';
  return (window.location.origin + window.location.pathname).replace(/\/$/, '');
}

/** Conteúdo do QR: link do sistema com o ID, aberto pela câmera comum do celular (seção 10.2 do plano). */
export function linkQr(tipo: 'dormente' | 'fardo' | 'local', id: string, base = baseDoApp()): string {
  return `${base.replace(/\/$/, '')}/#${rotaDoObjeto({ tipo, id })}`;
}
