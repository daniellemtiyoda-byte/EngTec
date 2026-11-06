export type MetodoHttp = 'GET' | 'POST' | 'PATCH';

export interface EndpointProvisorio {
  modulo: string;
  operacao: string;
  metodo: MetodoHttp;
  caminho: string; // {id} é substituído por parâmetro
  estado: 'pendente de confirmação' | 'confirmado';
}

/**
 * TODOS os endpoints abaixo são PROVISÓRIOS: foram nomeados pelo front-end para permitir
 * a integração incremental. Substitua pelos valores da documentação do back-end e mude o
 * estado para 'confirmado' somente depois de validar (campos, autenticação, permissões, códigos de erro).
 */
const P = 'pendente de confirmação' as const;

export const ENDPOINTS = {
  'auth.entrar': { modulo: 'Autenticação', operacao: 'Iniciar sessão', metodo: 'POST', caminho: '/auth/login', estado: P },
  'auth.usuarioAtual': { modulo: 'Autenticação', operacao: 'Usuário conectado', metodo: 'GET', caminho: '/auth/me', estado: P },
  'auth.sair': { modulo: 'Autenticação', operacao: 'Encerrar sessão', metodo: 'POST', caminho: '/auth/logout', estado: P },
} satisfies Record<string, EndpointProvisorio>;

export type ChaveEndpoint = keyof typeof ENDPOINTS;
export const LISTA_ENDPOINTS: EndpointProvisorio[] = Object.values(ENDPOINTS);
