import type { Perfil, Permissao } from '../dominio/permissoes';

/**
 * Modelos de dados do front-end. O modelo v2 (contrato, fardo e dormente com QR) entra na Etapa 2 do docs/PLANO-V2.md.
 * Pense cada tipo como uma tabela: `id` próprio, vínculos por id e campos calculados marcados como tal.
 */
export type Origem = 'simulado' | 'api';

export interface Paginado<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  origem: Origem;
}

export interface ListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  /** Ordenação por vários campos; usada quando não há `sortBy`. */
  sort?: { campo: string; dir: 'asc' | 'desc' }[];
  filters?: Record<string, string>;
}

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
  /** Calculadas a partir do perfil (`PERFIS` em dominio/permissoes.ts). */
  permissoes: Permissao[];
  ativo: boolean;
}
