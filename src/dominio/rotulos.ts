import type {
  DofPendente, EtapaEntrada, MotivoPerda, Dof, EstadoFardo, LocalPatio, NotaFiscal, ProcessamentoImagem, ResultadoInspecao, SessaoInventario, SituacaoLote, SituacaoMedidas, SituacaoNf, StatusEstoque,
  StatusRegistro, StatusRme, TipoMovimentacao, UrgenciaRme, UsoEspecie,
} from '../types/models';

/**
 * Dicionário do domínio: rótulo e cor de cada estado exibido na interface.
 * Mudar um texto ou uma cor aqui muda em todas as telas, filtros e formulários.
 * Paleta semântica (manter em todos os mapas): verde = disponível/concluído, azul = em andamento,
 * laranja = atenção, vermelho = bloqueio ou prazo vencido, cinza = encerrado/neutro.
 */
export type Tom = 'verde' | 'laranja' | 'vermelho' | 'azul' | 'cinza' | 'simulado';
export type Rotulos<K extends string> = Record<K, [Tom, string]>;

export const STATUS_REGISTRO: Rotulos<StatusRegistro> = {
  aprovado: ['verde', 'Aprovado'], pendente: ['laranja', 'Pendente'], bloqueado: ['vermelho', 'Bloqueado'], rejeitado: ['vermelho', 'Rejeitado'], simulado: ['simulado', 'Simulado'],
};

export const STATUS_ESTOQUE: Rotulos<StatusEstoque> = {
  disponivel: ['verde', 'Disponível'], bloqueado: ['vermelho', 'Bloqueado'], em_analise: ['azul', 'Em análise'], divergente: ['vermelho', 'Com divergência'],
};

export const RESULTADO_INSPECAO: Rotulos<ResultadoInspecao> = {
  aguardando: ['azul', 'Aguardando inspeção'], aprovado: ['verde', 'Aprovado'], reprovado: ['vermelho', 'Reprovado'], quarentena: ['laranja', 'Quarentena'],
};

export const SITUACAO_LOTE: Rotulos<SituacaoLote> = {
  disponivel: ['verde', 'Disponível'], aguardando_inspecao: ['azul', 'Aguardando inspeção'], quarentena: ['laranja', 'Quarentena'],
  reprovado: ['vermelho', 'Reprovado'], divergente: ['vermelho', 'Com divergência'], bloqueado: ['vermelho', 'Bloqueado'], sem_saldo: ['cinza', 'Sem saldo'],
};

export const USO_ESPECIE: Rotulos<UsoEspecie> = {
  via: ['azul', 'Via corrida'], AMV: ['laranja', 'AMV'],
};

/** Medidas de tamanho ainda não confirmadas pela CPTM aparecem como provisórias. */
export const SITUACAO_MEDIDAS: Rotulos<SituacaoMedidas> = {
  provisorio: ['laranja', 'Provisório'], confirmado: ['verde', 'Confirmado'],
};

export const SITUACAO_NF: Rotulos<SituacaoNf> = {
  aguardando_dof: ['vermelho', 'Aguardando DOF'], aguardando_recebimento: ['laranja', 'Aguardando recebimento'], recebida: ['verde', 'Recebida'],
};

/** Quadro de Entrada: da NF à declaração do DOF no Sinaflor. */
export const ETAPA_ENTRADA: Rotulos<EtapaEntrada> = {
  aguardando_dof: ['vermelho', 'Aguardando DOF'], aguardando_recebimento: ['laranja', 'Aguardando recebimento'],
  declarar: ['azul', 'Declarar no Sinaflor'], concluida: ['verde', 'Concluída'],
};

export const ORIGEM_NF: Rotulos<NotaFiscal['origem']> = {
  manual: ['cinza', 'Manual'], xml: ['azul', 'XML da NF-e'],
};

export const DECLARACAO_DOF: Rotulos<Dof['declaracao']> = {
  pendente: ['laranja', 'Pendente no Sinaflor'], declarado: ['verde', 'Declarado no Sinaflor'],
};

export const ESTADO_FARDO: Rotulos<EstadoFardo> = {
  fechado: ['verde', 'Fechado'], aberto: ['azul', 'Aberto'], baixado: ['cinza', 'Baixado'],
};

export const STATUS_RME: Rotulos<StatusRme> = {
  aberta: ['azul', 'Aberta'], em_separacao: ['laranja', 'Em separação'], conferida: ['verde', 'Conferida'], entregue: ['cinza', 'Entregue'], cancelada: ['cinza', 'Cancelada'],
};

export const URGENCIA_RME: Rotulos<UrgenciaRme> = {
  normal: ['cinza', 'Normal'], urgente: ['vermelho', 'Urgente'],
};

export const MOTIVO_PERDA: Rotulos<MotivoPerda> = {
  avaria: ['laranja', 'Avaria'], incendio: ['vermelho', 'Incêndio'], intemperie: ['azul', 'Intempérie'], furto: ['vermelho', 'Furto'], outro: ['cinza', 'Outro'],
};

/** Prazo de declaração do DOF no Sinaflor. */
export const NIVEL_PRAZO_DOF: Rotulos<DofPendente['nivel']> = {
  critico: ['vermelho', 'Prazo crítico'], atencao: ['laranja', 'Vence em breve'], no_prazo: ['verde', 'No prazo'],
};

export const TIPO_MOVIMENTACAO: Rotulos<TipoMovimentacao> = {
  entrada: ['verde', 'Entrada'], saida: ['laranja', 'Saída'], transferencia: ['azul', 'Transferência'], perda: ['vermelho', 'Perda'], ajuste: ['cinza', 'Ajuste'],
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
