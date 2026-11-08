import { env } from '../config/env';
import { autenticacao } from './auth';
import type { Servicos } from './contracts';
import { criarServicosSimulados } from './mock';
import { criarServicosSupabase } from './supabase';
import { bancoSupabase } from './supabase/cliente';

/**
 * As telas importam apenas `servicos`. A fonte é escolhida por VITE_FONTE_DADOS: "supabase" (banco e Supabase Auth)
 * ou, sem a variável, o modo simulado (dados de demonstração no navegador).
 */
export const servicos: Servicos = env.FONTE_DADOS === 'supabase'
  ? criarServicosSupabase({ banco: bancoSupabase(), usuarioAtual: () => autenticacao.usuarioAtual() })
  : criarServicosSimulados();
