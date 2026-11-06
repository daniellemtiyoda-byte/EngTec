import type {
  NivelAlerta, NivelPrazo, ResultadoInspecao, SituacaoCadastro, SituacaoContrato, SituacaoDormente, SituacaoEmissao, SituacaoEntrega,
  SituacaoFardo, SituacaoRme, SituacaoSaldo, TipoLocal, TipoMovimentacao, TipoOcorrencia,
} from '../types/models';

/**
 * Dicionário do domínio: rótulo e cor de cada estado exibido na interface.
 * Mudar um texto ou uma cor aqui muda em todas as telas, filtros e formulários.
 * Paleta semântica (manter em todos os mapas): verde = disponível/concluído, azul = em andamento,
 * laranja = atenção, vermelho = bloqueio ou prazo vencido, cinza = encerrado/neutro.
 */
export type Tom = 'verde' | 'laranja' | 'vermelho' | 'azul' | 'cinza';
export type Rotulos<K extends string> = Record<K, [Tom, string]>;

export const SITUACAO_DORMENTE: Rotulos<SituacaoDormente> = {
  emitido: ['cinza', 'Emitido'],
  aguardando_inspecao: ['laranja', 'Aguardando inspeção'],
  em_estoque: ['verde', 'Em estoque'],
  reservado: ['azul', 'Reservado'],
  baixado: ['cinza', 'Baixado'],
  reprovado: ['vermelho', 'Reprovado'],
  nao_localizado: ['vermelho', 'Não localizado'],
};

export const SITUACAO_FARDO: Rotulos<SituacaoFardo> = {
  em_transito: ['cinza', 'Em trânsito'],
  aguardando_inspecao: ['laranja', 'Aguardando inspeção'],
  em_inspecao: ['azul', 'Em inspeção'],
  em_estoque: ['verde', 'Em estoque'],
  aberto: ['azul', 'Aberto'],
  baixado: ['cinza', 'Baixado'],
};

export const SITUACAO_ENTREGA: Rotulos<SituacaoEntrega> = {
  a_caminho: ['azul', 'A caminho'],
  recebida_parcial: ['laranja', 'Recebida em parte'],
  recebida: ['verde', 'Recebida'],
};

/** Emissão do fornecedor (Simulador): sem NF e DOF, aguarda o cadastro dos documentos pela CPTM. */
export const SITUACAO_EMISSAO: Rotulos<SituacaoEmissao> = {
  aguardando_documentos: ['laranja', 'Aguardando NF e DOF'],
  ...SITUACAO_ENTREGA,
};

export const SITUACAO_CONTRATO: Rotulos<SituacaoContrato> = {
  vigente: ['azul', 'Vigente'],
  concluido: ['verde', 'Concluído'],
  cancelado: ['cinza', 'Cancelado'],
};

export const SITUACAO_RME: Rotulos<SituacaoRme> = {
  aberta: ['laranja', 'Aberta'],
  em_separacao: ['azul', 'Em separação'],
  pronta: ['azul', 'Pronta'],
  entregue: ['verde', 'Entregue'],
  cancelada: ['cinza', 'Cancelada'],
};

export const RESULTADO_INSPECAO: Rotulos<ResultadoInspecao> = {
  aprovado: ['verde', 'Aprovado'],
  reprovado: ['vermelho', 'Reprovado'],
};

export const NIVEL_PRAZO: Rotulos<NivelPrazo> = {
  ok: ['verde', 'No prazo'],
  atencao: ['laranja', 'Atenção'],
  critico: ['vermelho', 'Crítico'],
  vencido: ['vermelho', 'Vencido'],
};

export const SITUACAO_SALDO: Rotulos<SituacaoSaldo> = {
  falta: ['vermelho', 'Falta'],
  ok: ['verde', 'Ok'],
  excesso: ['laranja', 'Excesso'],
};

export const SITUACAO_MEDIDAS: Rotulos<'provisorio' | 'confirmado'> = {
  provisorio: ['laranja', 'Provisório'],
  confirmado: ['verde', 'Confirmado'],
};

export const SITUACAO_CADASTRO: Rotulos<SituacaoCadastro> = {
  ativo: ['verde', 'Ativo'],
  inativo: ['cinza', 'Inativo'],
};

export const TIPO_LOCAL: Rotulos<TipoLocal> = {
  armazenagem: ['azul', 'Armazenagem'],
  inspecao: ['laranja', 'Inspeção'],
  segregacao: ['vermelho', 'Segregação'],
  expedicao: ['cinza', 'Expedição'],
};

export const TIPO_MOVIMENTACAO: Rotulos<TipoMovimentacao> = {
  guarda: ['verde', 'Guarda'],
  transferencia: ['azul', 'Transferência'],
  segregacao: ['vermelho', 'Segregação'],
  saida: ['cinza', 'Saída'],
};

export const TIPO_OCORRENCIA: Rotulos<TipoOcorrencia> = {
  avaria: ['vermelho', 'Avaria'],
  falta: ['laranja', 'Falta'],
  sobra: ['laranja', 'Sobra'],
  fardo_desconhecido: ['vermelho', 'Fardo desconhecido'],
};

export const NIVEL_ALERTA: Rotulos<NivelAlerta> = {
  info: ['azul', 'Informação'],
  atencao: ['laranja', 'Atenção'],
  critico: ['vermelho', 'Crítico'],
};

/** Classe vem do cadastro da espécie; categoria vem da inspeção. Sempre com o nome do campo. */
export const rotuloClasse = (c?: string) => (c ? `Classe ${c}` : 'Classe a definir');
export const rotuloCategoria = (c?: number) => (c ? `Categoria ${c}` : 'Categoria a definir');
