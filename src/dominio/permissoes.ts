/**
 * Permissões conhecidas pela interface. Usar o tipo `Permissao` em `pode()` faz o TypeScript
 * acusar erros de digitação, que antes escondiam botões em silêncio.
 * As permissões granulares da v2 (seção 12 do docs/PLANO-V2.md) entram na Etapa 2; o servidor valida cada operação.
 */
export const PERMISSOES = ['admin'] as const;

export type Permissao = (typeof PERMISSOES)[number];
