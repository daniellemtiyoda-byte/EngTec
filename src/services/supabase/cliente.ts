import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../../config/env';
import { ApiError } from '../erros';
import { erroDoBanco, type Banco } from './index';

/**
 * Cliente do Supabase (um só no app), com a URL e a chave pública (anon) do .env.local. A sessão fica guardada no
 * aparelho (padrão do supabase-js), para o QR abrir a ficha sem novo login. Quem decide o acesso são as políticas e
 * as funções do banco.
 */
let cliente: SupabaseClient | null = null;

export function clienteSupabase(): SupabaseClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    throw new ApiError(0, 'Supabase não configurado: informe VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env.local.');
  }
  cliente ??= createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'holz:sessao-supabase' },
  });
  return cliente;
}

/** `Banco` sobre o supabase-js: funções do banco pelo RPC e anexos no bucket privado "anexos". */
export function bancoSupabase(): Banco {
  return {
    async rpc<T>(nome: string, args: Record<string, unknown> = {}) {
      const { data, error } = await clienteSupabase().rpc(nome, args);
      if (error) throw erroDoBanco(error);
      return data as T;
    },
    async enviar(caminho, arquivo) {
      const { error } = await clienteSupabase().storage.from('anexos').upload(caminho, arquivo, { contentType: arquivo.type || undefined, upsert: false });
      if (error) throw new ApiError(422, traduzirErroStorage(error.message, arquivo.name));
    },
  };
}

/** Link temporário (5 minutos) para abrir um anexo do bucket privado. */
export async function linkDoAnexo(caminho: string): Promise<string> {
  const { data, error } = await clienteSupabase().storage.from('anexos').createSignedUrl(caminho, 300);
  if (error || !data) throw new ApiError(404, 'Não foi possível abrir o arquivo.');
  return data.signedUrl;
}

/**
 * Traduz a mensagem de erro do Supabase Storage para o português.
 * Nunca expõe a mensagem técnica original: só o tamanho, o tipo ou a mensagem genérica com o código.
 */
export function traduzirErroStorage(mensagem: string, nomeArquivo: string): string {
  const m = mensagem.toLowerCase();
  if (m.includes('exceeded') || m.includes('maximum allowed size') || m.includes('payload too large') || m.includes('too large')) {
    return `${nomeArquivo} é maior que o limite permitido.`;
  }
  if (m.includes('mime type') || m.includes('not supported') || m.includes('invalid mime') || m.includes('content type')) {
    return `Tipo de arquivo não permitido: ${nomeArquivo}.`;
  }
  // Genérico: inclui o código quando há um, sem a mensagem técnica.
  const codigo = /^[A-Z0-9_]{2,30}$/i.test(mensagem.trim()) ? ` (código ${mensagem.trim()})` : '';
  return `Não foi possível enviar ${nomeArquivo}${codigo}. Tente novamente.`;
}
