import type {
  LocalPatio, ProcessamentoImagem, ResultadoInspecao, SessaoInventario, SituacaoMedidas, StatusEstoque, StatusRegistro, TipoMovimentacao, UsoEspecie,
} from '../types/models';

/**
 * Dicionário do domínio: rótulo e cor de cada estado exibido na interface.
 * Mudar um texto ou uma cor aqui muda em todas as telas, filtros e formulários.
 */
export type Tom = 'verde' | 'laranja' | 'vermelho' | 'azul' | 'cinza' | 'simulado';
export type Rotulos<K extends string> = Record<K, [Tom, string]>;

export const STATUS_REGISTRO: Rotulos<StatusRegistro> = {
  aprovado: ['verde', 'Aprovado'], pendente: ['laranja', 'Pendente'], bloqueado: ['vermelho', 'Bloqueado'], simulado: ['simulado', 'Simulado'],
};

export const STATUS_ESTOQUE: Rotulos<StatusEstoque> = {
  disponivel: ['verde', 'Disponível'], bloqueado: ['cinza', 'Bloqueado'], em_analise: ['azul', 'Em análise'], divergente: ['vermelho', 'Com divergência'],
};

export const RESULTADO_INSPECAO: Rotulos<ResultadoInspecao> = {
  aguardando: ['azul', 'Aguardando inspeção'], aprovado: ['verde', 'Aprovado'], reprovado: ['vermelho', 'Reprovado'], quarentena: ['laranja', 'Quarentena'],
};

export const USO_ESPECIE: Rotulos<UsoEspecie> = {
  via: ['azul', 'Via corrida'], AMV: ['laranja', 'AMV'],
};

/** Medidas de tamanho ainda não confirmadas pela CPTM aparecem como provisórias. */
export const SITUACAO_MEDIDAS: Rotulos<SituacaoMedidas> = {
  provisorio: ['laranja', 'Provisório'], confirmado: ['verde', 'Confirmado'],
};

export const TIPO_MOVIMENTACAO: Rotulos<TipoMovimentacao> = {
  entrada: ['verde', 'Entrada'], saida: ['laranja', 'Saída'], transferencia: ['azul', 'Transferência'],
};

export const ESTADO_PROCESSAMENTO: Rotulos<ProcessamentoImagem['estado']> = {
  na_fila: ['cinza', 'Na fila'], processando: ['azul', 'Processando'], concluido: ['verde', 'Concluído'], falha: ['vermelho', 'Falha no processamento'],
};

export const REVISAO_PROCESSAMENTO: Rotulos<ProcessamentoImagem['revisao']> = {
  pendente: ['laranja', 'Revisão pendente'], revisado: ['verde', 'Revisado'], rejeitado: ['vermelho', 'Rejeitado'], nao_aplicavel: ['cinza', 'Não se aplica'],
};

export const ESTADO_INVENTARIO: Rotulos<SessaoInventario['estado']> = {
  em_contagem: ['azul', 'Em contagem'], aguardando_aprovacao: ['laranja', 'Aguardando aprovação'], aprovado: ['verde', 'Aprovado'], rejeitado: ['vermelho', 'Rejeitado'],
};

export const AJUSTE_INVENTARIO: Rotulos<SessaoInventario['ajuste']> = {
  nao_aplicavel: ['cinza', 'Sem ajuste'], pendente_aprovacao: ['laranja', 'Ajuste pendente de aprovação'], aprovado: ['verde', 'Ajuste aprovado e aplicado'],
};

export const STATUS_PATIO: Rotulos<LocalPatio['status']> = {
  liberado: ['verde', 'Liberado'], bloqueado: ['vermelho', 'Bloqueado'], em_inventario: ['azul', 'Em inventário'],
};

export const SITUACAO_VOLUMETRIA: Rotulos<'conforme' | 'divergente'> = {
  conforme: ['verde', 'Conforme'], divergente: ['vermelho', 'Divergente'],
};
