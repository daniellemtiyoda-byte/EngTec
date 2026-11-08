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
      if (error) throw new ApiError(422, `Não foi possível enviar o arquivo ${arquivo.name}: ${error.message}`);
    },
  };
}

/** Link temporário (1 hora) para abrir um anexo do bucket privado. */
export async function linkDoAnexo(caminho: string): Promise<string> {
  const { data, error } = await clienteSupabase().storage.from('anexos').createSignedUrl(caminho, 3600);
  if (error || !data) throw new ApiError(404, 'Não foi possível abrir o arquivo.');
  return data.signedUrl;
}
