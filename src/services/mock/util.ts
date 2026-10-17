import type { ListQuery, Paginado } from '../../types/models';
import { ApiError } from '../http';

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
  if (q.sortBy) {
    const k = q.sortBy;
    const d = q.sortDir === 'desc' ? -1 : 1;
    r.sort((a, b) => {
      const va = (a as unknown as Record<string, unknown>)[k];
      const vb = (b as unknown as Record<string, unknown>)[k];
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * d;
      return String(va ?? '').localeCompare(String(vb ?? ''), 'pt-BR') * d;
    });
  }
  const pageSize = q.pageSize ?? 10;
  const page = q.page ?? 1;
  return { items: r.slice((page - 1) * pageSize, page * pageSize), total: r.length, page, pageSize, origem: 'simulado' };
}
