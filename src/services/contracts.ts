import type { ListQuery, Paginado } from '../types/models';

/**
 * CONTRATO ÚNICO entre as telas e o back-end.
 * Há duas implementações com a mesma interface: services/mock (dados fictícios) e services/real (HTTP);
 * o Supabase entra depois como terceira implementação (services/supabase), sem mudar nenhuma tela.
 * A autenticação fica fora daqui, em services/auth/. Os serviços da v2 (seção 6 do docs/PLANO-V2.md) entram na Etapa 2.
 */
export interface ServicoLista<T> {
  listar(q?: ListQuery): Promise<Paginado<T>>;
}

// Vazio até a Etapa 2, quando entram os serviços de dados da v2.
export interface Servicos {}
