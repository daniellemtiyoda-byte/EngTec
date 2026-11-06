import type { Servicos } from '../contracts';
import { criarDados } from './data';

/**
 * Serviços simulados. Os serviços da v2, as regras por módulo (simulador, recebimento, inspeção, estoque, rme)
 * e a persistência no localStorage entram na Etapa 2. A autenticação simulada fica em services/auth/.
 */
export function criarServicosSimulados(): Servicos {
  criarDados();
  return {};
}
