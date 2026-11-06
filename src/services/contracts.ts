import type { ListQuery, Paginado, Usuario } from '../types/models';

/**
 * CONTRATO ÚNICO entre as telas e o back-end.
 * Há duas implementações com a mesma interface: services/mock (dados fictícios) e services/real (HTTP);
 * o Supabase entra depois como terceira implementação (services/supabase), sem mudar nenhuma tela.
 * Os serviços da v2 (seção 6 do docs/PLANO-V2.md) entram na Etapa 2.
 */
export interface ServicoLista<T> {
  listar(q?: ListQuery): Promise<Paginado<T>>;
}

export interface Servicos {
  auth: {
    entrar(c: { usuario: string; senha: string }): Promise<Usuario>;
    usuarioAtual(): Promise<Usuario | null>;
    sair(): Promise<void>;
  };
}
