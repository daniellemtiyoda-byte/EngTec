import type { Categoria } from '../types/models';
import {
  NIVEL_PRAZO, SITUACAO_CADASTRO, SITUACAO_CONTRATO, SITUACAO_DORMENTE, SITUACAO_ENTREGA, SITUACAO_FARDO, SITUACAO_RME,
  SITUACAO_SALDO, TIPO_LOCAL, TIPO_MOVIMENTACAO, TIPO_OCORRENCIA, rotuloCategoria, type Rotulos,
} from './rotulos';

export interface Opcao<V extends string = string> { valor: V; rotulo: string }

/** Gera as opções de filtro/select a partir de um mapa do dicionário (rotulos.ts). */
export function opcoesDe<K extends string>(mapa: Rotulos<K>, apenas?: K[]): Opcao<K>[] {
  return (apenas ?? (Object.keys(mapa) as K[])).map((valor) => ({ valor, rotulo: mapa[valor][1] }));
}

export const SITUACAO_DORMENTE_OPCOES = opcoesDe(SITUACAO_DORMENTE);
export const SITUACAO_FARDO_OPCOES = opcoesDe(SITUACAO_FARDO);
/** Fardos que contam no estoque (Estoque por fardo). */
export const SITUACAO_FARDO_ESTOQUE_OPCOES = opcoesDe(SITUACAO_FARDO, ['em_estoque', 'aberto']);
export const SITUACAO_ENTREGA_OPCOES = opcoesDe(SITUACAO_ENTREGA);
export const SITUACAO_CONTRATO_OPCOES = opcoesDe(SITUACAO_CONTRATO);
export const SITUACAO_RME_OPCOES = opcoesDe(SITUACAO_RME);
export const NIVEL_PRAZO_OPCOES = opcoesDe(NIVEL_PRAZO);
export const SITUACAO_SALDO_OPCOES = opcoesDe(SITUACAO_SALDO);
export const SITUACAO_CADASTRO_OPCOES = opcoesDe(SITUACAO_CADASTRO);
export const TIPO_LOCAL_OPCOES = opcoesDe(TIPO_LOCAL);
export const TIPO_MOVIMENTACAO_OPCOES = opcoesDe(TIPO_MOVIMENTACAO);
/** Ocorrências que a pessoa declara no recebimento (falta e fardo desconhecido também nascem automáticas). */
export const TIPO_OCORRENCIA_OPCOES = opcoesDe(TIPO_OCORRENCIA, ['avaria', 'falta', 'sobra']);

/** PROVISÓRIO (time da inspeção a confirmar): três categorias. */
export const CATEGORIAS: Categoria[] = [1, 2, 3];
export const CATEGORIA_OPCOES: Opcao[] = CATEGORIAS.map((c) => ({ valor: String(c), rotulo: rotuloCategoria(c) }));

export const UNIDADE_ITEM_OPCOES: Opcao<'un' | 'm3'>[] = [{ valor: 'un', rotulo: 'Unidades' }, { valor: 'm3', rotulo: 'm³ (convertido em unidades)' }];
export const SIM_NAO_OPCOES: Opcao<'true' | 'false'>[] = [{ valor: 'true', rotulo: 'Sim' }, { valor: 'false', rotulo: 'Não' }];
