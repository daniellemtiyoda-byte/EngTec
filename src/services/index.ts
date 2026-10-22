import { criarServicosReais } from './real';
import { criarServicosSimulados } from './mock';
import type { Servicos } from './contracts';

/**
 * As telas importam apenas `servicos`; trocar simulado/real é só VITE_USE_MOCK.
 * A comparação fica aqui, direto em import.meta.env, para o Vite resolvê-la no build:
 * assim os dados fictícios não entram no JavaScript publicado com a API real.
 */
export const servicos: Servicos = import.meta.env.VITE_USE_MOCK === 'true' ? criarServicosSimulados() : criarServicosReais();
