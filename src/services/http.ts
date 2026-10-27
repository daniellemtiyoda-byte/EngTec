import { env } from '../config/env';

/** Erro padronizado: a mensagem já é segura para exibir (sem stack trace, tokens ou detalhes internos). */
export class ApiError extends Error {
  status: number;
  detalhes?: Record<string, string>;
  constructor(status: number, message: string, detalhes?: Record<string, string>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detalhes = detalhes;
  }
}

export function mensagemSegura(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return 'Não foi possível concluir a operação. Tente novamente.';
}

const MENSAGENS: Record<number, string> = {
  400: 'Dados inválidos. Revise os campos informados.',
  401: 'Sessão expirada ou não autenticada. Entre novamente.',
  403: 'Você não tem permissão para executar esta operação.',
  404: 'Registro não encontrado.',
  409: 'A operação conflita com o estado atual do registro.',
  422: 'Os dados informados não foram aceitos pelo servidor.',
};

interface Opcoes {
  metodo?: 'GET' | 'POST' | 'PATCH';
  query?: Record<string, string | number | undefined>;
  corpo?: unknown;
  formulario?: FormData;
}

/** Único ponto de chamadas HTTP do front-end. Autenticação via cookie de sessão (mecanismo PENDENTE de confirmação). */
export async function http<T>(caminho: string, op: Opcoes = {}): Promise<T> {
  if (!env.API_URL) {
    throw new ApiError(0, 'URL do back-end não configurada (VITE_API_URL).');
  }
  const url = new URL(env.API_URL + caminho);
  for (const [k, v] of Object.entries(op.query ?? {})) {
    if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  }
  // X-Requested-With: cabeçalho próprio obriga o navegador a fazer a verificação prévia de CORS em TODA chamada,
  // inclusive envios de arquivo (FormData), que sem ele seriam "requisições simples" e ficariam expostas a CSRF.
  const headers: Record<string, string> = { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
  let body: BodyInit | undefined;
  if (op.formulario) body = op.formulario;
  else if (op.corpo !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(op.corpo);
  }

  let resp: Response;
  try {
    resp = await fetch(url.toString(), { method: op.metodo ?? 'GET', headers, body, credentials: 'include' });
  } catch {
    throw new ApiError(0, 'Falha de comunicação com o servidor. Verifique a conexão e tente novamente.');
  }

  if (!resp.ok) {
    let detalhes: Record<string, string> | undefined;
    let mensagemServidor: string | undefined;
    try {
      const j = (await resp.json()) as { mensagem?: unknown; campos?: Record<string, unknown> };
      if (typeof j.mensagem === 'string') mensagemServidor = j.mensagem.slice(0, 300);
      if (j.campos && typeof j.campos === 'object') {
        detalhes = {};
        for (const [k, v] of Object.entries(j.campos)) if (typeof v === 'string') detalhes[k] = v;
      }
    } catch { /* corpo não-JSON: ignora */ }
    if (resp.status === 401) window.dispatchEvent(new Event('sgd:nao-autenticado'));
    const generica = resp.status >= 500 ? 'O servidor não conseguiu concluir a operação. Tente novamente em instantes.' : MENSAGENS[resp.status] ?? 'Erro ao comunicar com o servidor.';
    throw new ApiError(resp.status, mensagemServidor ?? generica, detalhes);
  }
  if (resp.status === 204) return undefined as T;
  try {
    return (await resp.json()) as T;
  } catch {
    throw new ApiError(resp.status, 'Resposta inesperada do servidor.');
  }
}
