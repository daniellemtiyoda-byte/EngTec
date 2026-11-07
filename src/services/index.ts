import { criarServicosReais } from './real';
import { criarServicosSimulados } from './mock';
import { criarServicosSupabase } from './supabase';
import type { Servicos } from './contracts';

/**
 * As telas importam apenas `servicos`. Qual implementação vale:
 *  - VITE_USE_MOCK=true            → dados simulados (services/mock);
 *  - VITE_SUPABASE_URL preenchida  → banco no Supabase (services/supabase);
 *  - senão                         → API própria do back-end (services/real, VITE_API_URL).
 * As comparações ficam aqui, direto em import.meta.env, para o Vite resolvê-las no build:
 * assim os dados fictícios não entram no JavaScript publicado com a API real ou o Supabase.
 */
export const servicos: Servicos = import.meta.env.VITE_USE_MOCK === 'true'
  ? criarServicosSimulados()
  : import.meta.env.VITE_SUPABASE_URL
    ? criarServicosSupabase()
    : criarServicosReais();
