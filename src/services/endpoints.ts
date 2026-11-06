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

// Vazio até a Etapa 2. Volta a `{ ... } satisfies Record<string, EndpointProvisorio>` quando houver endpoints,
// para a chave ser conferida pelo TypeScript.
export const ENDPOINTS: Record<string, EndpointProvisorio> = {};

export type ChaveEndpoint = keyof typeof ENDPOINTS;
export const LISTA_ENDPOINTS: EndpointProvisorio[] = Object.values(ENDPOINTS);
