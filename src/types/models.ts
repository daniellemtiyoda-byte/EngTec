import type { Perfil, Permissao } from '../dominio/permissoes';

/**
 * Modelo de dados v2 (seção 5 do docs/PLANO-V2.md). Cada tipo é pensado como uma tabela do futuro banco:
 * `id` próprio e vínculos por id. Campos marcados "calculado" não são gravados: o serviço os monta na consulta
 * (no Supabase, viram views ou funções). Datas sem hora em AAAA-MM-DD; instantes em ISO 8601.
 */
export type Origem = 'simulado' | 'api';
export type Id = string;

export interface Paginado<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  origem: Origem;
}

export interface ListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  /** Ordenação por vários campos; usada quando não há `sortBy`. */
  sort?: { campo: string; dir: 'asc' | 'desc' }[];
  filters?: Record<string, string>;
}

export interface Usuario {
  id: Id;
  nome: string;
  email: string;
  perfil: Perfil;
  /** Calculadas a partir do perfil (`PERFIS` em dominio/permissoes.ts). */
  permissoes: Permissao[];
  ativo: boolean;
}

/** Arquivo anexado. No mock só o nome é guardado (sem `url`). */
export interface Anexo { id: Id; nome: string; tipo: 'pdf' | 'xml' | 'imagem'; url?: string; enviadoEm: string; enviadoPor: string }

export type TipoEvento =
  | 'emitido' | 'recebido' | 'inspecionado' | 'guardado' | 'transferido' | 'reservado' | 'baixado'
  | 'segregado' | 'nao_localizado' | 'cancelado' | 'ocorrencia';

/** Evento do histórico de um objeto: quem, quando, o que e o documento de referência. */
export interface Evento { quando: string; quem: string; tipo: TipoEvento; descricao: string; referencia?: string }

// ---------- Cadastros ----------

export type SituacaoCadastro = 'ativo' | 'inativo';

export interface Fornecedor {
  id: Id;
  razaoSocial: string;
  cnpj: string;
  cidadeUf: string;
  ctfIbama: string;
  ctfValidade: string;
  situacao: SituacaoCadastro;
  /** Calculado: CTF vencido pela validade. Fornecedor bloqueado não entra em novas atas e contratos. */
  bloqueado: boolean;
  especiesIds: Id[];
  certificados: Anexo[];
}

export interface Especie { id: Id; nomeCientifico: string; nomePopular: string; classe?: string; ativo: boolean }

export interface Tamanho {
  id: Id;
  codigo: string;
  comprimentoCm: number;
  larguraCm: number;
  alturaCm: number;
  /** Calculado a partir das medidas. */
  volumeM3: number;
  medidas: 'provisorio' | 'confirmado';
  ativo: boolean;
}

export interface Tratamento { id: Id; preservativo: string; empresa: string; ativo: boolean }

export type TipoLocal = 'armazenagem' | 'inspecao' | 'segregacao' | 'expedicao';

export interface Local {
  id: Id;
  /** A03; o ID do QR é LOC-A03 (`idLocal`). */
  codigo: string;
  descricao: string;
  tipo: TipoLocal;
  /** Em dormentes. */
  capacidade: number;
  /** Calculado: dormentes nos fardos do local (saldo físico) mais os reprovados segregados nele. */
  ocupacao: number;
  /** Calculado: fardos com saldo no local. */
  fardos: number;
  ativo: boolean;
}

/** Mínimo e máximo de estoque disponível por espécie + tamanho (editado em Configurações). */
export interface NivelEstoque { especieId: Id; tamanhoId: Id; minimo: number; maximo: number }

// ---------- Suprimento ----------

export interface Ata { id: Id; numero: string; fornecedorId: Id; vigenciaInicio: string; vigenciaFim: string }

export type SituacaoContrato = 'vigente' | 'concluido' | 'cancelado';

export interface ItemContrato {
  id: Id;
  especieId: Id;
  tamanhoId: Id;
  tratamentoId: Id;
  /** Em unidades. */
  quantidade: number;
  // calculados:
  emitidos: number;
  recebidos: number;
  aprovados: number;
  reprovados: number;
  /** quantidade − (emitidos − reprovados): o contrato é cumprido por aprovados, então reposição é permitida. */
  saldoAEmitir: number;
}

export interface Contrato {
  id: Id;
  numero: string;
  ataId: Id;
  /** Calculado: o fornecedor da ata (não é gravado de novo no contrato). */
  fornecedorId: Id;
  empresaInspetora: string;
  ano: number;
  /** Gravado: vigente ou cancelado. "Concluído" é calculado (todos os itens aprovados e nada pendente na entrada). */
  situacao: SituacaoContrato;
  motivoCancelamento?: string;
  itens: ItemContrato[];
  criadoEm: string;
  criadoPor: string;
}

// ---------- Fardo e dormente ----------

export type SituacaoFardo = 'em_transito' | 'aguardando_inspecao' | 'em_inspecao' | 'em_estoque' | 'aberto' | 'baixado';

export interface ConclusaoInspecao { quando: string; quem: string; justificativa?: string; naoLocalizados: Id[] }

export interface Fardo {
  id: Id;
  contratoId: Id;
  itemContratoId: Id;
  /** Definida quando o fardo entra numa entrega (cadastro de NF e DOF ou leitura no recebimento). */
  entregaId?: Id;
  quantidadeInicial: number;
  localId?: Id;
  recebidoEm?: string;
  conclusaoInspecao?: ConclusaoInspecao;
  historico: Evento[];
  // calculados:
  /** Saldo físico: dormentes em estoque + reservados (ainda estão no fardo). */
  saldo: number;
  /** Disponível para nova saída: só os em estoque. */
  disponivel: number;
  situacao: SituacaoFardo;
  /** Dias desde o recebimento. */
  idadeDias?: number;
  acimaLimiteDias: boolean;
}

export type SituacaoDormente = 'emitido' | 'aguardando_inspecao' | 'em_estoque' | 'reservado' | 'baixado' | 'reprovado' | 'nao_localizado';
export type Categoria = 1 | 2 | 3;
export interface Medidas { comprimentoCm: number; larguraCm: number; alturaCm: number }

export interface Dormente {
  id: Id;
  contratoId: Id;
  itemContratoId: Id;
  /** Fardo de origem; o reprovado continua apontando para ele. */
  fardoId: Id;
  situacao: SituacaoDormente;
  categoria?: Categoria;
  medidas?: Medidas;
  /** Inspeção que vale (a mais recente). */
  inspecaoId?: Id;
  /** RME da reserva ou da baixa. */
  rmeNumero?: string;
  /** Só do reprovado: local de segregação. Os demais estão no local do fardo. */
  localId?: Id;
  historico: Evento[];
}

// ---------- Entrada ----------

export interface ItemNf { itemContratoId: Id; quantidade: number; volumeM3: number }

export interface NotaFiscal {
  id: Id;
  numero: string;
  serie: string;
  chaveAcesso: string;
  fornecedorId: Id;
  contratoId: Id;
  emissao: string;
  entregaId: Id;
  xml?: Anexo;
  itens: ItemNf[];
  criadoEm: string;
  criadoPor: string;
}

export interface VolumeEspecie { especieId: Id; volumeM3: number }
export type NivelPrazo = 'ok' | 'atencao' | 'critico' | 'vencido';

export interface Dof {
  id: Id;
  numero: string;
  nfId: Id;
  validade: string;
  volumes: VolumeEspecie[];
  pdf?: Anexo;
  declarado?: { quando: string; quem: string };
  // calculados:
  /** Dia seguinte ao fim da validade. */
  prazoDeclaracao: string;
  diasParaPrazo: number;
  /** Só para DOF não declarada; declarada fica 'ok'. */
  nivelPrazo: NivelPrazo;
}

export type SituacaoEntrega = 'a_caminho' | 'recebida_parcial' | 'recebida';

/** O que o fornecedor envia de uma vez: uma NF, uma DOF e os fardos. Nasce "a caminho" no cadastro de NF e DOF. */
export interface Entrega {
  id: Id;
  contratoId: Id;
  nfId: Id;
  dofId: Id;
  /** Fardos esperados (podem ser indicados no cadastro ou entrar na leitura do recebimento). */
  fardosIds: Id[];
  situacao: SituacaoEntrega;
  origem: 'cadastro' | 'simulador' | 'recebimento';
  criadoEm: string;
  criadoPor: string;
  // calculados:
  nfNumero: string;
  fornecedorId: Id;
  fardosRecebidos: Id[];
  dormentes: number;
  prazoDeclaracao: string;
  nivelPrazo: NivelPrazo;
  /** Volume por espécie: DOF × tudo o que já chegou. Recalculada a cada recebimento (inclusive dos fardos que faltaram). */
  divergenciaVolume: DivergenciaVolume[];
}

export type TipoOcorrencia = 'avaria' | 'falta' | 'sobra' | 'fardo_desconhecido';
export interface Ocorrencia { tipo: TipoOcorrencia; descricao: string; fardoId?: Id; fotos: Anexo[]; automatica: boolean }
export interface DivergenciaVolume { especieId: Id; documentalM3: number; calculadoM3: number; percentual: number; acimaTolerancia: boolean }

export interface Recebimento {
  id: Id;
  entregaId: Id;
  nfId: Id;
  dofId: Id;
  recebidoEm: string;
  recebidoPor: string;
  fardosEsperados: Id[];
  fardosLidos: Id[];
  conforme: boolean;
  ocorrencias: Ocorrencia[];
  divergenciaVolume: DivergenciaVolume[];
  justificativaDivergencia?: string;
  /** A justificativa foi preenchida pelo sistema: a divergência vinha só dos fardos que faltaram. */
  justificativaAutomatica: boolean;
  localEsperaId: Id;
}

export type ResultadoInspecao = 'aprovado' | 'reprovado';
/** Veredito como sai do Railway Edge Inspector. */
export type VereditoInspector = 'APROVADO' | 'ATENCAO' | 'REJEITADO';

export interface Inspecao {
  id: Id;
  dormenteId: Id;
  fardoId: Id;
  resultado: ResultadoInspecao;
  categoria?: Categoria;
  /** 0 a 100, vindo do Inspector. */
  indice?: number;
  veredito?: VereditoInspector;
  medidas?: Medidas;
  inspetor: string;
  inspecionadoEm: string;
  origem: 'inspector' | 'simulado' | 'manual';
  relatorioUrl?: string;
}

// ---------- Estoque e saída ----------

export type SituacaoSaldo = 'falta' | 'ok' | 'excesso';

export interface SaldoItem {
  especieId: Id;
  tamanhoId: Id;
  /** Disponível (em estoque, sem reserva). */
  emEstoque: number;
  aguardandoInspecao: number;
  reservado: number;
  naoLocalizado: number;
  minimo: number;
  maximo: number;
  situacao: SituacaoSaldo;
}

export type TipoMovimentacao = 'guarda' | 'transferencia' | 'segregacao' | 'saida';

export interface Movimentacao {
  id: Id;
  tipo: TipoMovimentacao;
  fardoId: Id;
  dormentesIds: Id[];
  quantidade: number;
  deLocalId?: Id;
  paraLocalId?: Id;
  quando: string;
  quem: string;
  /** RME, recebimento ou inspeção que originou. */
  referencia?: string;
}

export type SituacaoRme = 'aberta' | 'em_separacao' | 'pronta' | 'entregue' | 'cancelada';
export interface ItemRme { especieId: Id; tamanhoId: Id; quantidade: number }
export interface SeparacaoFardo { fardoId: Id; dormentesIds: Id[]; seguiuSugestao: boolean; justificativa?: string }

export interface Rme {
  id: Id;
  numero: string;
  solicitanteId: Id;
  solicitanteNome: string;
  /** Obra ou trecho. */
  destino: string;
  necessidadeEm: string;
  itens: ItemRme[];
  separacao?: SeparacaoFardo[];
  situacao: SituacaoRme;
  motivoCancelamento?: string;
  criadoEm: string;
  historico: Evento[];
}

/** Sugestão de separação: fardos abertos primeiro (mais antigos antes), depois os demais do mais antigo ao mais novo. */
export interface SugestaoSeparacao {
  itens: {
    especieId: Id;
    tamanhoId: Id;
    quantidade: number;
    fardos: { fardoId: Id; dormentesIds: Id[]; aberto: boolean; idadeDias?: number }[];
    /** Quanto não há disponível para atender o item. */
    faltam: number;
  }[];
}

// ---------- Parâmetros e painel ----------

export interface Parametros {
  /** PROVISÓRIO (CPTM a definir). */
  limiteDiasEstoque: number;
  /** [atenção, crítico] em dias antes do prazo da DOF. */
  alertaDofDias: [number, number];
  /** Regra da IN Ibama, só leitura. */
  toleranciaVolumePct: number;
  /** PROVISÓRIO (time da inspeção a confirmar). */
  limitesCategoria: [number, number];
  dormentesPorFardoPadrao: number;
  niveis: NivelEstoque[];
  /** Mostra o Simulador e os botões "Simular". */
  modoDemonstracao: boolean;
}

export interface Indicadores {
  emEstoque: number;
  aguardandoInspecao: number;
  itensAbaixoMinimo: number;
  itensAcimaMaximo: number;
  fardosAcimaLimite: number;
  dofsADeclarar: number;
  rmesAbertas: number;
  naoLocalizados: number;
}

export type NivelAlerta = 'info' | 'atencao' | 'critico';
/** "Para fazer agora": tarefa do perfil, com a quantidade e o link para agir. */
export interface Pendencia { id: Id; titulo: string; quantidade: number; nivel: NivelAlerta; link: string; acao: string }
export interface Alerta { id: Id; nivel: Exclude<NivelAlerta, 'info'>; titulo: string; descricao: string; link: string }

// ---------- Visões montadas para as páginas de objeto ----------

/** Item do contrato com os nomes, para exibir. */
export interface ItemDescrito { especie: Especie; tamanho: Tamanho; tratamento: Tratamento }

export interface FardoDetalhe {
  fardo: Fardo;
  contrato: Contrato;
  item: ItemDescrito;
  local?: Local;
  dormentes: Dormente[];
  entrega?: Entrega;
  nf?: NotaFiscal;
  dof?: Dof;
  recebimento?: Recebimento;
  movimentacoes: Movimentacao[];
}

/** Ficha do dormente (seção 9.13): tudo que se liga a ele, já montado. */
export interface FichaDormente {
  dormente: Dormente;
  fardo: Fardo;
  /** Onde o dormente está: o local do fardo ou, se reprovado, o de segregação. */
  local?: Local;
  /** Desde quando está no local. */
  localDesde?: string;
  contrato: Contrato;
  ata: Ata;
  fornecedor: Fornecedor;
  item: ItemDescrito;
  nf?: NotaFiscal;
  dof?: Dof;
  recebimento?: Recebimento;
  inspecao?: Inspecao;
  rme?: Rme;
}

/** Tela de inspeção de um fardo: cada dormente com a inspeção que vale. */
export interface InspecaoFardo {
  fardo: Fardo;
  item: ItemDescrito;
  local?: Local;
  dormentes: (Dormente & { inspecao?: Inspecao })[];
  inspecionados: number;
  pendentes: number;
}

/** Etiquetas de uma entrega para impressão: o fardo e os seus dormentes. */
export interface EtiquetasEntrega {
  entrega: Entrega;
  contrato: Contrato;
  fardos: { fardo: Fardo; item: ItemDescrito; dormentesIds: Id[] }[];
}
