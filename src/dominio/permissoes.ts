/**
 * Permissões conhecidas pela interface. Usar o tipo `Permissao` em `pode()` faz o TypeScript
 * acusar erros de digitação, que antes escondiam botões em silêncio.
 * Os nomes ainda são provisórios (ver docs/CONTRATOS-API.md); o servidor valida cada operação.
 */
export const PERMISSOES = [
  'recebimento:registrar',
  'movimentacoes:registrar',
  'inventario:criar',
  'cadastros:editar', // classe e uso das espécies; medidas dos tamanhos
  'nf:cadastrar', // NF (manual ou XML) e DOF
  'rme:abrir', // requisitante: abrir e cancelar RME
  'rme:separar', // almoxarife: separar e confirmar a entrega
  'rme:conferir', // supervisor: conferência antes da entrega
  'visao:enviar',
  'relatorios:exportar',
  'admin',
] as const;

export type Permissao = (typeof PERMISSOES)[number];
