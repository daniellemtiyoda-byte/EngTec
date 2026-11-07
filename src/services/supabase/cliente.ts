import { env } from '../../config/env';
import type { ListQuery, Paginado } from '../../types/models';
import { ApiError } from '../http';

/**
 * Único ponto de fetch do modo Supabase (o equivalente de services/http.ts para a API própria).
 * Fala com três serviços do Supabase: Auth (login), PostgREST (views v_* e funções rpc/*) e Storage (arquivos).
 * Sessão só em memória, de propósito (como no AuthContext): recarregar a página pede login de novo.
 */

interface Sessao {
  acesso: string;
  renovacao: string;
  /** epoch em ms */
  expiraEm: number;
  usuarioId: string;
}

let sessao: Sessao | null = null;

const MENSAGENS: Record<number, string> = {
  400: 'Dados inválidos. Revise os campos informados.',
  401: 'Sessão expirada ou não autenticada. Entre novamente.',
  403: 'Você não tem permissão para executar esta operação.',
  404: 'Registro não encontrado.',
  409: 'A operação conflita com o estado atual do registro.',
  422: 'Os dados informados não foram aceitos pelo servidor.',
};

function configurado() {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    throw new ApiError(0, 'Supabase não configurado (VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY).');
  }
}

async function buscar(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new ApiError(0, 'Falha de comunicação com o servidor. Verifique a conexão e tente novamente.');
  }
}

function guardarSessao(j: { access_token: string; refresh_token: string; expires_in: number; user: { id: string } }) {
  sessao = { acesso: j.access_token, renovacao: j.refresh_token, expiraEm: Date.now() + j.expires_in * 1000, usuarioId: j.user.id };
}

async function token(corpo: Record<string, string>, tipo: 'password' | 'refresh_token') {
  configurado();
  const r = await buscar(`${env.SUPABASE_URL}/auth/v1/token?grant_type=${tipo}`, {
    method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
  });
  if (!r.ok) {
    if (tipo === 'password') throw new ApiError(401, 'E-mail ou senha inválidos.');
    sessao = null;
    throw new ApiError(401, MENSAGENS[401]);
  }
  guardarSessao(await r.json());
}

export const auth = {
  entrar: (email: string, senha: string) => token({ email, password: senha }, 'password'),
  async sair() {
    const s = sessao;
    sessao = null;
    if (!s) return;
    await buscar(`${env.SUPABASE_URL}/auth/v1/logout`, { method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${s.acesso}` } }).catch(() => undefined);
  },
  logado: () => !!sessao,
  esquecer() { sessao = null; },
};

/** Token válido para a próxima chamada (renova se faltar menos de 1 minuto). */
async function tokenAtual(): Promise<string> {
  if (!sessao) throw naoAutenticado();
  if (sessao.expiraEm - Date.now() < 60_000) await token({ refresh_token: sessao.renovacao }, 'refresh_token');
  return sessao!.acesso;
}

function naoAutenticado() {
  sessao = null;
  window.dispatchEvent(new Event('sgd:nao-autenticado'));
  return new ApiError(401, MENSAGENS[401]);
}

/** Erro do PostgREST/Storage → ApiError com mensagem segura. As regras do banco usam SQLSTATE 'PT<status>' e HINT 'campo:<nome>'. */
async function erro(r: Response): Promise<ApiError> {
  let corpo: { code?: string; message?: string; hint?: string | null } = {};
  try { corpo = await r.json(); } catch { /* corpo não-JSON */ }
  if (r.status === 401) return naoAutenticado();
  const nossa = typeof corpo.code === 'string' && corpo.code.startsWith('PT') && typeof corpo.message === 'string';
  const mensagem = nossa ? corpo.message!.slice(0, 300)
    : r.status >= 500 ? 'O servidor não conseguiu concluir a operação. Tente novamente em instantes.'
      : MENSAGENS[r.status] ?? 'Erro ao comunicar com o servidor.';
  const campo = nossa && corpo.hint?.startsWith('campo:') ? corpo.hint.slice(6) : undefined;
  return new ApiError(r.status, mensagem, campo ? { [campo]: mensagem } : undefined);
}

async function rest(caminho: string, init: RequestInit & { headers?: Record<string, string> } = {}): Promise<Response> {
  configurado();
  const r = await buscar(`${env.SUPABASE_URL}${caminho}`, {
    ...init,
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${await tokenAtual()}`, Accept: 'application/json', ...init.headers },
  });
  if (!r.ok) throw await erro(r);
  return r;
}

/** Tira `null` (o modelo usa campo ausente) e a coluna auxiliar `busca`, em qualquer profundidade. */
export function limpar<T>(v: unknown): T {
  if (Array.isArray(v)) return v.map((x) => limpar(x)) as T;
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) if (x !== null && k !== 'busca') o[k] = limpar(x);
    return o as T;
  }
  return v as T;
}

/** Chama uma função do banco (POST /rest/v1/rpc/<nome>) com argumentos nomeados. */
export async function rpc<T = unknown>(nome: string, args: Record<string, unknown> = {}): Promise<T> {
  const r = await rest(`/rest/v1/rpc/${nome}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  if (r.status === 204) return undefined as T;
  const texto = await r.text();
  return limpar<T>(texto ? JSON.parse(texto) : null);
}

/** Valor seguro para um filtro do PostgREST (eq. / in.): sem os caracteres reservados da sintaxe. */
const valorFiltro = (v: string) => v.replace(/[(),"]/g, ' ').trim();

/**
 * Lista paginada a partir de uma view v_* (colunas com os nomes do modelo).
 * Busca: coluna `busca`; filtros: igualdade; ordenação: `sortBy` ou `sort` (vários campos), mais `id` para paginar estável.
 */
export async function lista<T>(view: string, q: ListQuery = {}, fixos: Record<string, string> = {}): Promise<Paginado<T>> {
  const page = q.page ?? 1;
  const pageSize = q.pageSize ?? 10;
  const p = new URLSearchParams({ select: '*' });
  const termo = q.search?.toLowerCase().replace(/[*%(),"\\]/g, ' ').trim();
  if (termo) p.append('busca', `ilike.*${termo}*`);
  for (const [k, v] of Object.entries({ ...(q.filters ?? {}), ...fixos })) if (v !== undefined && v !== '') p.append(k, `eq.${valorFiltro(v)}`);
  const criterios = q.sortBy ? [{ campo: q.sortBy, dir: q.sortDir ?? 'asc' }] : q.sort ?? [];
  p.append('order', [...criterios.map((c) => `${c.campo}.${c.dir}`), 'id.asc'].join(','));
  p.append('limit', String(pageSize));
  p.append('offset', String((page - 1) * pageSize));
  // Espaço como %20 (URLSearchParams usaria "+", que o PostgREST não lê como espaço dentro do filtro)
  const consulta = [...p].map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  const r = await rest(`/rest/v1/${view}?${consulta}`, { headers: { Prefer: 'count=exact' } });
  const items = limpar<T[]>(await r.json());
  const total = Number(r.headers.get('Content-Range')?.split('/')[1]);
  return { items, total: Number.isFinite(total) ? total : items.length, page, pageSize, origem: 'api' };
}

/** Linhas de uma view por igualdade (ou lista de valores) em uma coluna, sem paginação. */
export async function linhas<T>(view: string, coluna: string, valores: string | string[]): Promise<T[]> {
  const filtro = Array.isArray(valores) ? `in.(${valores.map(valorFiltro).join(',')})` : `eq.${valorFiltro(valores)}`;
  const r = await rest(`/rest/v1/${view}?select=*&${encodeURIComponent(coluna)}=${encodeURIComponent(filtro)}`);
  return limpar<T[]>(await r.json());
}

export async function uma<T>(view: string, coluna: string, valor: string): Promise<T> {
  const [x] = await linhas<T>(view, coluna, valor);
  if (!x) throw new ApiError(404, MENSAGENS[404]);
  return x;
}

const MIME: Record<string, string> = { xml: 'text/xml', pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic' };

/** Envia o arquivo ao Storage (pasta do usuário) e registra no banco; devolve o id do registro em `arquivos`. */
export async function enviarArquivo(bucket: string, arquivo: File): Promise<string> {
  const tipo = arquivo.type || MIME[arquivo.name.split('.').pop()?.toLowerCase() ?? ''] || 'application/octet-stream';
  const nome = arquivo.name.normalize('NFD').replace(/[^\w.-]+/g, '_').slice(-80) || 'arquivo';
  const usuario = sessao?.usuarioId;
  if (!usuario) throw naoAutenticado();
  const caminho = `${usuario}/${crypto.randomUUID()}-${nome}`;
  try {
    await rest(`/storage/v1/object/${bucket}/${caminho.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'POST', headers: { 'Content-Type': tipo, 'x-upsert': 'false' }, body: arquivo,
    });
  } catch (e) {
    if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 401) {
      throw new ApiError(e.status, `O arquivo ${arquivo.name} foi recusado pelo armazenamento (tipo, tamanho ou permissão).`);
    }
    throw e;
  }
  return rpc<string>('registrar_arquivo', { p_bucket: bucket, p_caminho: caminho, p_nome: arquivo.name, p_mime: tipo, p_tamanho: arquivo.size });
}
