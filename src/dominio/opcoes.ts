import type { Categoria, Classe, Documento, StatusRegistro } from '../types/models';
import { SITUACAO_VOLUMETRIA, type Rotulos } from './rotulos';

export interface Opcao<V extends string = string> { valor: V; rotulo: string }

/** Gera as opções de filtro/select a partir de um mapa do dicionário (rotulos.ts). */
export function opcoesDe<K extends string>(mapa: Rotulos<K>, apenas?: K[]): Opcao<K>[] {
  return (apenas ?? (Object.keys(mapa) as K[])).map((valor) => ({ valor, rotulo: mapa[valor][1] }));
}

/** "Simulado" é só marcação de dado fictício: não aparece como opção de filtro. */
export const STATUS_OPCOES: Opcao<StatusRegistro>[] = [
  { valor: 'aprovado', rotulo: 'Aprovado' }, { valor: 'pendente', rotulo: 'Pendente' }, { valor: 'bloqueado', rotulo: 'Bloqueado' },
];

export const CLASSE_OPCOES: Opcao<Classe>[] = [{ valor: 'primeira', rotulo: '1ª classe' }, { valor: 'segunda', rotulo: '2ª classe' }];
export const CATEGORIA_OPCOES: Opcao<Categoria>[] = [{ valor: 'A', rotulo: 'Categoria A' }, { valor: 'B', rotulo: 'Categoria B' }];

export const TIPO_DOCUMENTO_OPCOES: Opcao<Documento['tipo']>[] = (['NF-e', 'DOF', 'Romaneio', 'Laudo'] as const).map((t) => ({ valor: t, rotulo: t }));

export const SITUACAO_VOLUMETRIA_OPCOES = opcoesDe(SITUACAO_VOLUMETRIA);
