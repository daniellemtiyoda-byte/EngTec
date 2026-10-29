import type { ListQuery, Paginado } from '../../types/models';
import { ApiError } from '../http';

/** Volume de um dormente em m³ a partir das dimensões em cm. No modo real quem calcula é o servidor. */
export const volumeDormenteM3 = (larguraCm: number, alturaCm: number, comprimentoCm: number) => (larguraCm * alturaCm * comprimentoCm) / 1_000_000;

const DIA_MS = 86_400_000;
/** Data de hoje (AAAA-MM-DD) no fuso de São Paulo. */
export const hojeSP = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
export const dataSP = (iso: string) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
/** Dias de `de` até `ate`, ambos AAAA-MM-DD (negativo se `ate` for antes). */
export const diasEntre = (de: string, ate: string) => Math.round((Date.parse(ate) - Date.parse(de)) / DIA_MS);
export const somarDias = (aaaammdd: string, n: number) => new Date(Date.parse(aaaammdd) + n * DIA_MS).toISOString().slice(0, 10);

export const atraso = (ms = 350) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Permite testar os estados da interface no modo simulado:
 *  ?simular=erro  -> falha de comunicação      ?simular=vazio -> listas vazias
 */
export async function simularRede() {
  await atraso();
  const modo = new URLSearchParams(window.location.search).get('simular');
  if (modo === 'erro') {
    throw new ApiError(0, 'Falha de comunicação com o servidor (simulada).');
  }
  return modo;
}

export async function paginar<T extends { id: string }>(todos: T[], q: ListQuery = {}): Promise<Paginado<T>> {
  const modo = await simularRede();
  let r = modo === 'vazio' ? [] : [...todos];
  if (q.search) {
    const s = q.search.toLowerCase();
    r = r.filter((x) => Object.values(x).some((v) => v !== null && typeof v !== 'object' && String(v).toLowerCase().includes(s)));
  }
  for (const [k, v] of Object.entries(q.filters ?? {})) {
    if (v) r = r.filter((x) => String((x as unknown as Record<string, unknown>)[k]) === v);
  }
  const criterios = q.sortBy ? [{ campo: q.sortBy, dir: q.sortDir ?? 'asc' }] : q.sort ?? [];
  if (criterios.length) {
    const comparar = (va: unknown, vb: unknown) => (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va ?? '').localeCompare(String(vb ?? ''), 'pt-BR'));
    r.sort((a, b) => {
      for (const { campo, dir } of criterios) {
        const c = comparar((a as unknown as Record<string, unknown>)[campo], (b as unknown as Record<string, unknown>)[campo]);
        if (c) return dir === 'desc' ? -c : c;
      }
      return 0;
    });
  }
  const pageSize = q.pageSize ?? 10;
  const page = q.page ?? 1;
  return { items: r.slice((page - 1) * pageSize, page * pageSize), total: r.length, page, pageSize, origem: 'simulado' };
}
