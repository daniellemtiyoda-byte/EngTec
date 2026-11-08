import { env } from '../../config/env';
import type { ServicoAuth } from './contrato';
import { criarAuthSimulado } from './simulado';
import { criarAuthSupabase } from './supabase';

export type { ServicoAuth } from './contrato';

/** Login simulado (nome do perfil) ou Supabase Auth (e-mail e senha), pela mesma variável da fonte de dados. */
export const autenticacao: ServicoAuth = env.FONTE_DADOS === 'supabase' ? criarAuthSupabase() : criarAuthSimulado();
