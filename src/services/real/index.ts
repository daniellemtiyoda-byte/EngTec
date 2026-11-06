import type { ListQuery, Paginado } from '../../types/models';
import type { Servicos, ServicoLista } from '../contracts';
import { ENDPOINTS, type ChaveEndpoint } from '../endpoints';
import { ApiError, http } from '../http';

/**
 * Implementação REAL (HTTP). Os caminhos vêm de endpoints.ts e são PROVISÓRIOS.
 * Ao receber a documentação do back-end, ajuste endpoints.ts e, se os formatos divergirem, `consulta`/`lista` abaixo.
 */
const caminho = (k: ChaveEndpoint, id?: string) => ENDPOINTS[k].caminho.replace('{id}', encodeURIComponent(id ?? ''));

function consulta(q: ListQuery = {}) {
  // Nomes de parâmetros provisórios (pendentes de confirmação com o back-end).
  // Vários campos: ordenarPor=a,b&ordem=desc,asc (mesma posição).
  const ordenarPor = q.sortBy ?? q.sort?.map((s) => s.campo).join(',');
  const ordem = q.sortBy ? q.sortDir : q.sort?.map((s) => s.dir).join(',');
  return { pagina: q.page ?? 1, tamanho: q.pageSize ?? 10, busca: q.search, ordenarPor, ordem, ...(q.filters ?? {}) };
}

async function lista<T>(k: ChaveEndpoint, q?: ListQuery, id?: string): Promise<Paginado<T>> {
  const r = await http<{ items?: T[]; total?: number; page?: number; pageSize?: number }>(caminho(k, id), { query: consulta(q) });
  if (!r || !Array.isArray(r.items)) throw new ApiError(200, 'Resposta inesperada do servidor.');
  return { items: r.items, total: r.total ?? r.items.length, page: r.page ?? q?.page ?? 1, pageSize: r.pageSize ?? q?.pageSize ?? 10, origem: 'api' };
}

const servicoLista = <T,>(k: ChaveEndpoint): ServicoLista<T> => ({ listar: (q) => lista<T>(k, q) });
const post = <T,>(k: ChaveEndpoint, corpo?: unknown, id?: string) => http<T>(caminho(k, id), { metodo: 'POST', corpo });
const patch = <T,>(k: ChaveEndpoint, id: string, corpo: unknown) => http<T>(caminho(k, id), { metodo: 'PATCH', corpo });

function enviarArquivo<T>(k: ChaveEndpoint, arquivo: File) {
  const f = new FormData();
  f.append('arquivo', arquivo);
  return http<T>(caminho(k), { metodo: 'POST', formulario: f });
}

/** Multipart com os dados em JSON no campo `dados` e os arquivos nos campos indicados (formato provisório). */
function enviarComArquivos<T>(k: ChaveEndpoint, dados: unknown, arquivos: Record<string, File[]>, id?: string) {
  const f = new FormData();
  f.append('dados', JSON.stringify(dados));
  for (const [campo, lista] of Object.entries(arquivos)) for (const a of lista) f.append(campo, a);
  return http<T>(caminho(k, id), { metodo: 'POST', formulario: f });
}

export function criarServicosReais(): Servicos {
  return {
  };
}
