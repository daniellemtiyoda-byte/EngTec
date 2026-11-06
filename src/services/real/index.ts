import type { Servicos } from '../contracts';
import { ApiError } from '../http';

/**
 * Implementação sem o mock. Não há back-end próprio (decisão da v2): os dados vêm do mock até a Etapa 10, quando
 * entra services/supabase/ e esta pasta sai. Até lá, qualquer operação avisa que é preciso usar o modo simulado.
 */
export function criarServicosReais(): Servicos {
  const indisponivel = () => Promise.reject(new ApiError(0, 'Sem back-end configurado: use VITE_USE_MOCK=true até a integração com o Supabase.'));
  const grupo = () => new Proxy({}, { get: () => indisponivel });
  return new Proxy({}, { get: () => grupo() }) as Servicos;
}
