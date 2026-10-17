import { env } from '../config/env';
import { criarServicosReais } from './real';
import { criarServicosSimulados } from './mock';
import type { Servicos } from './contracts';

/** As telas importam apenas `servicos`; trocar simulado/real é só VITE_USE_MOCK. */
export const servicos: Servicos = env.USE_MOCK ? criarServicosSimulados() : criarServicosReais();
