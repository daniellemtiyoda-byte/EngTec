/**
 * Permissões conhecidas pela interface. Usar o tipo `Permissao` em `pode()` faz o TypeScript
 * acusar erros de digitação, que antes escondiam botões em silêncio.
 * Os nomes ainda são provisórios (ver docs/CONTRATOS-API.md); o servidor valida cada operação.
 */
export const PERMISSOES = [
  'lotes:cadastrar',
  'recebimento:registrar',
  'movimentacoes:registrar',
  'inventario:criar',
  'cadastros:editar', // classe e uso das espécies; medidas dos tamanhos
  'documentos:importar',
  'visao:enviar',
  'relatorios:exportar',
  'admin',
] as const;

export type Permissao = (typeof PERMISSOES)[number];
