import type { ServicoAuth } from './contrato';
import { criarAuthSimulado } from './simulado';

export type { ServicoAuth } from './contrato';

/** Até a Etapa 9, só o login simulado; lá entra o Supabase Auth, escolhido por variável de ambiente. */
export const autenticacao: ServicoAuth = criarAuthSimulado();
