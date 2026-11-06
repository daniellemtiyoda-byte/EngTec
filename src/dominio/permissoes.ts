/**
 * Permissões conhecidas pela interface (nomes provisórios, seção 12 do docs/PLANO-V2.md). Usar o tipo `Permissao`
 * em `pode()` faz o TypeScript acusar erros de digitação, que antes escondiam botões em silêncio.
 * Só UX: quem valida são as políticas do banco (Supabase, Etapa 10).
 */
export const PERMISSOES = [
  'admin', // usuários, configurações e vitrine
  'operacao:consultar', // leitura das telas de suprimento, entrada, estoque e cadastros
  'cadastros:editar',
  'contratos:editar',
  'simulador:usar',
  'nf:cadastrar', // NF e DOF antes da chegada (cria a entrega "a caminho")
  'recebimento:registrar',
  'dof:declarar',
  'inspecao:operar',
  'estoque:movimentar', // guardar e transferir fardos; também liga a navegação de campo no celular
  'rme:abrir', // requisitante: abrir e cancelar as próprias RMEs
  'rme:separar', // almoxarife: separar, entregar e cancelar
  'painel:gestao', // indicadores completos do Painel
] as const;

export type Permissao = (typeof PERMISSOES)[number];

export type Perfil = 'administrador' | 'almoxarife' | 'gestor' | 'requisitante';

/** Perfil = conjunto de permissões; nenhuma tela testa o perfil, só as permissões. */
export const PERFIS: Record<Perfil, { rotulo: string; permissoes: Permissao[] }> = {
  administrador: { rotulo: 'Administrador', permissoes: ['admin', 'operacao:consultar', 'cadastros:editar', 'contratos:editar', 'simulador:usar', 'nf:cadastrar', 'painel:gestao'] },
  almoxarife: { rotulo: 'Almoxarife', permissoes: ['operacao:consultar', 'simulador:usar', 'nf:cadastrar', 'recebimento:registrar', 'dof:declarar', 'inspecao:operar', 'estoque:movimentar', 'rme:separar'] },
  gestor: { rotulo: 'Gestor', permissoes: ['operacao:consultar', 'painel:gestao'] },
  requisitante: { rotulo: 'Requisitante', permissoes: ['rme:abrir'] },
};

export const PERFIS_LISTA = Object.keys(PERFIS) as Perfil[];
