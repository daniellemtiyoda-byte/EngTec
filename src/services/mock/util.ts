import type { ListQuery, Paginado } from '../../types/models';
import { ApiError } from '../erros';

/** Modo de teste dos estados da interface, lido do endereço: ?simular=erro (falha) ou ?simular=vazio (listas vazias). */
export function modoSimulado(): 'erro' | 'vazio' | null {
  if (typeof window === 'undefined') return null;
  const m = new URLSearchParams(window.location.search).get('simular');
  return m === 'erro' || m === 'vazio' ? m : null;
}

/** Espera de rede simulada e o ?simular=erro. */
export async function simularRede(atrasoMs: number) {
  if (atrasoMs > 0) await new Promise<void>((r) => setTimeout(r, atrasoMs));
  if (modoSimulado() === 'erro') throw new ApiError(0, 'Falha de comunicação com o servidor (simulada).');
}

const comparar = (va: unknown, vb: unknown) =>
  typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va ?? '').localeCompare(String(vb ?? ''), 'pt-BR');

/**
 * Busca, filtros (igualdade de campo), ordenação e paginação no cliente, como o banco fará.
 * A busca olha os campos simples do registro e os `extrasBusca` (ex. nomes que só existem por vínculo).
 */
export function paginar<T extends object>(todos: T[], q: ListQuery = {}, extrasBusca?: (x: T) => string[]): Paginado<T> {
  let r = modoSimulado() === 'vazio' ? [] : [...todos];
  if (q.search?.trim()) {
    const s = q.search.trim().toLowerCase();
    r = r.filter((x) => {
      const campos = Object.values(x).filter((v) => v !== null && typeof v !== 'object').map(String);
      return [...campos, ...(extrasBusca?.(x) ?? [])].some((v) => v.toLowerCase().includes(s));
    });
  }
  for (const [k, v] of Object.entries(q.filters ?? {})) {
    if (v) r = r.filter((x) => String((x as Record<string, unknown>)[k]) === v);
  }
  const criterios = q.sortBy ? [{ campo: q.sortBy, dir: q.sortDir ?? 'asc' }] : q.sort ?? [];
  if (criterios.length) {
    r.sort((a, b) => {
      for (const { campo, dir } of criterios) {
        const c = comparar((a as Record<string, unknown>)[campo], (b as Record<string, unknown>)[campo]);
        if (c) return dir === 'desc' ? -c : c;
      }
      return 0;
    });
  }
  const pageSize = q.pageSize ?? 10;
  const page = q.page ?? 1;
  return { items: r.slice((page - 1) * pageSize, page * pageSize), total: r.length, page, pageSize, origem: 'simulado' };
}
