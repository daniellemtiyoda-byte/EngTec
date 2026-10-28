import type { Documento, StatusRegistro } from '../types/models';
import { RESULTADO_INSPECAO, SITUACAO_MEDIDAS, SITUACAO_NF, SITUACAO_VOLUMETRIA, STATUS_RME, TIPO_MOVIMENTACAO, URGENCIA_RME, USO_ESPECIE, type Rotulos } from './rotulos';

export interface Opcao<V extends string = string> { valor: V; rotulo: string }

/** Gera as opções de filtro/select a partir de um mapa do dicionário (rotulos.ts). */
export function opcoesDe<K extends string>(mapa: Rotulos<K>, apenas?: K[]): Opcao<K>[] {
  return (apenas ?? (Object.keys(mapa) as K[])).map((valor) => ({ valor, rotulo: mapa[valor][1] }));
}

/** "Simulado" é só marcação de dado fictício: não aparece como opção de filtro. */
export const STATUS_OPCOES: Opcao<StatusRegistro>[] = [
  { valor: 'aprovado', rotulo: 'Aprovado' }, { valor: 'pendente', rotulo: 'Pendente' }, { valor: 'bloqueado', rotulo: 'Bloqueado' },
];

/** Classe é definida por espécie no cadastro de espécies. Lista PROVISÓRIA: o PRD só confirma a 1ª. */
export const CLASSE_OPCOES: Opcao[] = ['1ª', '2ª', '3ª'].map((c) => ({ valor: c, rotulo: `Classe ${c}` }));

/** Categoria numérica do estado do dormente. Número de níveis PROVISÓRIO: a combinar com o projeto de inspeção. */
export const CATEGORIA_OPCOES: Opcao[] = [1, 2, 3].map((c) => ({ valor: String(c), rotulo: `Categoria ${c}` }));

export const RESULTADO_INSPECAO_OPCOES = opcoesDe(RESULTADO_INSPECAO);
export const USO_OPCOES = opcoesDe(USO_ESPECIE);
export const SITUACAO_MEDIDAS_OPCOES = opcoesDe(SITUACAO_MEDIDAS);
export const SITUACAO_NF_OPCOES = opcoesDe(SITUACAO_NF);
export const STATUS_RME_OPCOES = opcoesDe(STATUS_RME);
export const URGENCIA_OPCOES = opcoesDe(URGENCIA_RME);
export const TIPO_MOVIMENTACAO_OPCOES = opcoesDe(TIPO_MOVIMENTACAO);

export const TIPO_DOCUMENTO_OPCOES: Opcao<Documento['tipo']>[] = (['NF-e', 'DOF', 'Romaneio', 'Laudo'] as const).map((t) => ({ valor: t, rotulo: t }));

export const SITUACAO_VOLUMETRIA_OPCOES = opcoesDe(SITUACAO_VOLUMETRIA);
