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
  | 'criado' | 'alterado' | 'inativado' | 'reativado' | 'cancelado'
  | 'emitido' | 'recebido' | 'inspecionado' | 'guardado' | 'transferido' | 'reservado' | 'baixado'
  | 'segregado' | 'nao_localizado' | 'ocorrencia' | 'declarado' | 'laudo' | 'comunicado' | 'retirado'
  | 'lancado' | 'informado' | 'perdido' | 'fechado';

/** O que o evento descreve (a linha do tempo de cada objeto filtra por entidade e id). */
export type EntidadeEvento =
  | 'fardo' | 'dormente' | 'contrato' | 'ata' | 'entrega' | 'rme' | 'fornecedor' | 'cadastro' | 'local' | 'parametros' | 'usuario'
  | 'saldo_dof' | 'inventario';

/**
 * Evento (histórico e auditoria): toda operação que muda o estado registra um. É a fonte das linhas do tempo da ficha
 * do dormente, do fardo, do contrato e da RME. No Supabase, uma tabela só de inclusão (sem alterar nem apagar).
 */
export interface Evento {
  id: Id;
  tipo: TipoEvento;
  entidade: EntidadeEvento;
  entidadeId: Id;
  descricao: string;
  referencia?: string;
  quem: string;
  quando: string;
}

/** Feriado considerado no cálculo de dias úteis (prazo do laudo, comunicação e retirada de reprovados). */
export interface Feriado { data: string; nome: string; abrangencia: 'nacional' | 'estadual' | 'municipal' }

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

/** Espécie de madeira. A classe (NBR 7511) não é da espécie: vem do fardo e de cada dormente, informada pelo fornecedor. */
export interface Especie { id: Id; nomeCientifico: string; nomePopular: string; ativo: boolean }

/** Classe do dormente conforme a NBR 7511 (1ª ou 2ª), informada pelo fornecedor no Boletim de Inspeção e na plaquinha. */
export type Classe = 1 | 2;

/** Via corrente: 2,80 m, padrão da bitola larga (1,60 m). AMV: 3,00 m a 5,40 m, dormentes especiais de aparelho de mudança de via. */
export type UsoTamanho = 'via_corrente' | 'amv';

/** Tamanho = item de compra da CPTM, identificado pelo código de material (ex. 006234 = 2,80 m). */
export interface Tamanho {
  id: Id;
  /** Código de material CPTM (6 dígitos). */
  codigo: string;
  uso: UsoTamanho;
  comprimentoCm: number;
  larguraCm: number;
  alturaCm: number;
  /** Calculado a partir das medidas. */
  volumeM3: number;
  medidas: 'provisorio' | 'confirmado';
  ativo: boolean;
}

export interface Tratamento { id: Id; preservativo: string; empresa: string; ativo: boolean }

/** Empresa acreditada pelo INMETRO que inspeciona o material antes da entrega (ex. IPT, UFV); vem do Boletim de Inspeção. */
export interface EmpresaInspetora { id: Id; nome: string; cnpj?: string; ativo: boolean }

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
  /** Calculado: quando o local foi conferido pela última vez (inventário fechado). */
  ultimoInventarioEm?: string;
  ativo: boolean;
}

/** Mínimo e máximo de estoque disponível por classe + tamanho (editado em Configurações). */
export interface NivelEstoque { classe: Classe; tamanhoId: Id; minimo: number; maximo: number }

// ---------- Suprimento ----------

/**
 * Regras da ata (parâmetros, com os valores dos documentos da CPTM como padrão): pedido mínimo por contrato, número
 * máximo de parcelas, tamanho de cada parcela (somando os itens) e a janela de cada parcela, em dias contados da
 * assinatura do contrato ([de, até]; a 1ª vai de 0 a 90).
 */
export interface RegrasAta { pedidoMinimo: number; maxParcelas: number; parcelaMinima: number; parcelaMaxima: number; prazosParcelas: [number, number][] }

/** Quantidade registrada na ata por tamanho; contratado e saldo são calculados pelos contratos não cancelados. */
export interface ItemAta { tamanhoId: Id; quantidade: number; contratado: number; saldo: number }

/** Ata de registro de preços: fornecedor, vigência (12 meses), regras e as quantidades registradas. Não existe AF: cada pedido é um contrato. */
export interface Ata {
  id: Id;
  numero: string;
  fornecedorId: Id;
  vigenciaInicio: string;
  vigenciaFim: string;
  regras: RegrasAta;
  itens: ItemAta[];
  // calculado:
  vigente: boolean;
}

export type SituacaoContrato = 'vigente' | 'concluido' | 'cancelado';

/** Item do contrato = tamanho (código de material CPTM). O contrato não define espécie, classe nem tratamento. */
export interface ItemContrato {
  id: Id;
  tamanhoId: Id;
  /** Em unidades (soma das parcelas). */
  quantidade: number;
  // calculados:
  emitidos: number;
  recebidos: number;
  aprovados: number;
  reprovados: number;
  /** quantidade − (emitidos − reprovados): o contrato é cumprido por aprovados, então reposição é permitida. */
  saldoAEmitir: number;
}

export type SituacaoParcela = 'a_entregar' | 'atrasada' | 'entregue' | 'entregue_com_atraso';

/** Parcela do cronograma do contrato: quantidade por tamanho; prazo e situação calculados pela assinatura e pelas regras da ata. */
export interface ParcelaContrato {
  numero: number;
  itens: { tamanhoId: Id; quantidade: number }[];
  // calculados:
  quantidade: number;
  /** Janela de entrega (AAAA-MM-DD), pela data de assinatura e pelas regras da ata. */
  inicio: string;
  fim: string;
  /** Dormentes recebidos nas entregas desta parcela (sem a falta declarada). */
  recebidos: number;
  /** Quando os recebidos alcançaram a quantidade da parcela. */
  entregueEm?: string;
  situacao: SituacaoParcela;
  /** Dias de atraso: até hoje (a entregar) ou até a entrega completa. */
  diasAtraso: number;
}

export interface Contrato {
  id: Id;
  numero: string;
  ataId: Id;
  /** Calculado: o fornecedor da ata (não é gravado de novo no contrato). */
  fornecedorId: Id;
  ano: number;
  dataAssinatura: string;
  /** Gestor do contrato na CPTM (na demonstração, nomes fictícios). */
  gestor: string;
  parcelas: ParcelaContrato[];
  /** Gravado: vigente ou cancelado. "Concluído" é calculado (todos os itens aprovados e nada pendente na entrada). */
  situacao: SituacaoContrato;
  motivoCancelamento?: string;
  itens: ItemContrato[];
  criadoEm: string;
  criadoPor: string;
  // calculados:
  parcelasAtrasadas: number;
  /** 15 dias após o laudo da última entrega, quando o contrato está concluído. */
  recebimentoDefinitivoEm?: string;
}

// ---------- Fardo e dormente ----------

/** O fardo aberto (algum dormente já saiu numa RME) continua em estoque; "aberto" é o campo calculado `aberto`. */
export type SituacaoFardo = 'em_transito' | 'aguardando_inspecao' | 'em_inspecao' | 'em_estoque' | 'baixado';

export interface ConclusaoInspecao { quando: string; quem: string; justificativa?: string; naoLocalizados: Id[] }

/**
 * Reprovados do fardo: ao concluir a inspeção o sistema registra a comunicação ao fornecedor (até 5 dias úteis) e o
 * prazo de retirada (15 dias úteis). Retirados, os dormentes ficam "retirado pelo fornecedor".
 */
export interface ReprovacaoFardo {
  dormentesIds: Id[];
  comunicarAte: string;
  retirarAte: string;
  comunicadoEm?: string;
  comunicadoPor?: string;
  retiradoEm?: string;
  retiradoPor?: string;
}

export interface Fardo {
  id: Id;
  contratoId: Id;
  /** Item do contrato = tamanho. */
  itemContratoId: Id;
  /** Espécie, classe e tratamento informados pelo fornecedor (Boletim de Inspeção e plaquinha). */
  especieId: Id;
  classe: Classe;
  tratamentoId: Id;
  /**
   * Marcação exigida (PIM-14 do DNIT e NBR 7511): usina de tratamento e data de impregnação (a marcação mostra mês e
   * ano; o dia conta a cura).
   */
  usinaTratamento: string;
  dataTratamento: string;
  /** Definida quando o fardo entra numa entrega (cadastro de NF e DOF ou leitura no recebimento). */
  entregaId?: Id;
  /** Emissão do fornecedor que gerou o fardo (no protótipo, o Simulador). */
  emissaoId?: Id;
  /** Dormentes que faltavam no fardo, declarados no recebimento (saem do recebido e do volume nominal). */
  faltaDeclarada?: number;
  quantidadeInicial: number;
  localId?: Id;
  recebidoEm?: string;
  conclusaoInspecao?: ConclusaoInspecao;
  reprovacao?: ReprovacaoFardo;
  // calculados:
  /** Saldo físico: dormentes em estoque + reservados (ainda estão no fardo). */
  saldo: number;
  /** Disponível para nova saída: os em estoque, fora da cura (CCA ou CCB: 15 dias após o tratamento). */
  disponivel: number;
  /** Dormentes reservados para RME (ainda no fardo). */
  reservados: number;
  /** Em cura: os em estoque só ficam disponíveis a partir desta data (AAAA-MM-DD). */
  emCuraAte?: string;
  situacao: SituacaoFardo;
  /** Em estoque e incompleto: algum dormente já saiu numa RME (vem primeiro na sugestão de separação). */
  aberto: boolean;
  /** Dias desde o recebimento. */
  idadeDias?: number;
  acimaLimiteDias: boolean;
  /** Recebido e com a inspeção ainda aberta: quantos dormentes já têm resultado. */
  progressoInspecao?: { inspecionados: number; total: number };
}

export type SituacaoDormente = 'emitido' | 'aguardando_inspecao' | 'em_estoque' | 'reservado' | 'baixado' | 'reprovado' | 'retirado' | 'nao_localizado' | 'perdido';
export type Categoria = 1 | 2 | 3;
export interface Medidas { comprimentoCm: number; larguraCm: number; alturaCm: number }

export interface Dormente {
  id: Id;
  contratoId: Id;
  itemContratoId: Id;
  /** Do próprio dormente (o fornecedor informa por peça; no protótipo, igual ao do fardo), como na marcação. */
  especieId: Id;
  classe: Classe;
  tratamentoId: Id;
  usinaTratamento: string;
  dataTratamento: string;
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
  nfNumero: string;
  fornecedorId: Id;
  contratoId: Id;
  entregaId: Id;
  situacaoDeclaracao: 'a_declarar' | 'declarado';
  /** Só pode ser declarada depois que algum fardo da entrega foi recebido. */
  podeDeclarar: boolean;
  /** Dia seguinte ao fim da validade. */
  prazoDeclaracao: string;
  diasParaPrazo: number;
  /** Só para DOF não declarada; declarada fica 'ok'. */
  nivelPrazo: NivelPrazo;
}

export type SituacaoEntrega = 'a_caminho' | 'recebida_parcial' | 'recebida';

/** Boletim de Inspeção do fornecedor: empresa inspetora (acreditada pelo INMETRO) e, por tamanho, espécies e quantidades aprovadas. */
export interface BoletimInspecao {
  numero: string;
  data: string;
  empresaInspetoraId: Id;
  itens: { tamanhoId: Id; especieId: Id; quantidade: number }[];
  arquivo?: Anexo;
}
/** Relatório Técnico do lote, anexado à entrega. */
export interface RelatorioTecnico { numero: string; data: string; arquivo?: Anexo }
/** Laudo Técnico de aprovação, emitido pela CPTM depois da inspeção (prazo: 20 dias úteis da entrega). */
export interface LaudoTecnico { numero: string; emitidoEm: string; emitidoPor: string; aprovados: number; reprovados: number }

/** O que o fornecedor envia de uma vez: uma NF, uma DOF e os fardos. Nasce "a caminho" no cadastro de NF e DOF. */
export interface Entrega {
  id: Id;
  contratoId: Id;
  nfId: Id;
  dofId: Id;
  /** Fardos esperados (podem ser indicados no cadastro ou entrar na leitura do recebimento). */
  fardosIds: Id[];
  /** Parcela do cronograma do contrato a que a entrega pertence. */
  parcela: number;
  /** Reentrega: reposição de reprovados; só é aceita depois da retirada dos reprovados do contrato. */
  reentrega: boolean;
  situacao: SituacaoEntrega;
  origem: 'cadastro' | 'simulador' | 'recebimento';
  boletim?: BoletimInspecao;
  relatorioTecnico?: RelatorioTecnico;
  laudo?: LaudoTecnico;
  criadoEm: string;
  criadoPor: string;
  // calculados:
  /** Recebimento provisório (o primeiro), que conta o prazo do laudo. */
  recebidaEm?: string;
  /** 20 dias úteis contados da entrega (recebimento provisório). */
  prazoLaudo?: string;
  nivelPrazoLaudo?: NivelPrazo;
  /** Toda a entrega recebida e inspecionada, ainda sem laudo. */
  podeEmitirLaudo: boolean;
  nfNumero: string;
  fornecedorId: Id;
  fardosRecebidos: Id[];
  dormentes: number;
  prazoDeclaracao: string;
  nivelPrazo: NivelPrazo;
  /** Volume por espécie: DOF × tudo o que já chegou. Recalculada a cada recebimento (inclusive dos fardos que faltaram). */
  divergenciaVolume: DivergenciaVolume[];
  /** Etapa para as abas de Recebimentos: a caminho (inclui recebida em parte), aguardando inspeção ou concluída. */
  etapa: EtapaEntrega;
  /** Algum recebimento desta entrega teve ocorrência (declarada ou automática). */
  comOcorrencia: boolean;
  recebimentosIds: Id[];
}

export type EtapaEntrega = 'a_caminho' | 'aguardando_inspecao' | 'aguardando_laudo' | 'concluida';

/** Prévia do recebimento, antes de confirmar: o que o serviço vai aceitar, recusar e calcular com os fardos lidos. */
export interface PreviaRecebimento {
  aceitos: Id[];
  /** Lidos que não são desta entrega (viram ocorrência "fardo desconhecido"). */
  desconhecidos: Id[];
  /** Esperados e não lidos (viram ocorrência de falta e continuam em trânsito). */
  faltantes: Id[];
  dormentes: number;
  divergenciaVolume: DivergenciaVolume[];
  /** Preenchida quando a divergência vem só dos fardos que faltaram. */
  justificativaAutomatica?: string;
  /** Há divergência acima da tolerância que a pessoa precisa justificar. */
  exigeJustificativa: boolean;
}

export type TipoOcorrencia = 'avaria' | 'falta' | 'sobra' | 'fardo_desconhecido';
/** `quantidade`: na falta declarada, os dormentes que faltavam no fardo. */
export interface Ocorrencia { tipo: TipoOcorrencia; descricao: string; fardoId?: Id; quantidade?: number; fotos: Anexo[]; automatica: boolean }
/**
 * Volume por espécie: documental (DOF) × nominal (dormentes recebidos × volume do tamanho, descontada a falta declarada)
 * e, depois da inspeção de todos os fardos recebidos da espécie, medido (soma das medidas reais dos aprovados e
 * reprovados). A divergência oficial usa o medido quando existe; antes, é provisória (nominal).
 */
export interface DivergenciaVolume {
  especieId: Id;
  documentalM3: number;
  nominalM3: number;
  medidoM3?: number;
  /** Dormentes do volume medido sem medidas (lançados à mão), contados pelo volume do tamanho. */
  estimados?: number;
  base: 'nominal' | 'medido';
  percentual: number;
  acimaTolerancia: boolean;
}

/** Recebimento provisório: chegada, leitura dos fardos e o canhoto da NF assinado (foto opcional). O definitivo vem com o laudo. */
export interface Recebimento {
  id: Id;
  entregaId: Id;
  canhoto?: Anexo;
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

/** Saldo por classe + tamanho (o item de estoque); a espécie é detalhe (`especies`). */
export interface SaldoItem {
  /** Calculado: `<classe>|<tamanhoId>`. */
  id: string;
  classe: Classe;
  tamanhoId: Id;
  uso: UsoTamanho;
  /** Disponível (em estoque, sem reserva e fora da cura). */
  emEstoque: number;
  /** Em estoque, mas ainda em cura (CCA ou CCB), com a primeira data de liberação. */
  emCura: number;
  liberacaoCura?: string;
  aguardandoInspecao: number;
  reservado: number;
  naoLocalizado: number;
  minimo: number;
  maximo: number;
  situacao: SituacaoSaldo;
  /** Disponível por espécie, do maior para o menor. */
  especies: { especieId: Id; emEstoque: number }[];
}

export type TipoMovimentacao = 'guarda' | 'transferencia' | 'segregacao' | 'saida' | 'retirada';

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
/**
 * Item da RME: tamanho e classe obrigatórios; categoria mínima opcional (sem ela, qualquer aprovado; 1 é a melhor) e
 * espécie opcional. Um item por tamanho + classe.
 */
export interface ItemRme { tamanhoId: Id; classe: Classe; categoriaMinima?: Categoria; especieId?: Id; quantidade: number }
/** `justificativaClasse`: o fardo é de classe inferior à sugerida para o tipo de destino da RME. */
export interface SeparacaoFardo { fardoId: Id; dormentesIds: Id[]; seguiuSugestao: boolean; justificativa?: string; justificativaClasse?: string }

/** Tipo de destino da RME: define a classe mínima sugerida (1ª para linha principal de tráfego pesado; 2ª aceita nos demais). */
export type TipoDestino = 'principal_pesado' | 'principal_medio' | 'desvio' | 'patio';

export interface Rme {
  id: Id;
  numero: string;
  solicitanteId: Id;
  solicitanteNome: string;
  /** Obra ou trecho. */
  destino: string;
  tipoDestino: TipoDestino;
  necessidadeEm: string;
  itens: ItemRme[];
  separacao?: SeparacaoFardo[];
  situacao: SituacaoRme;
  motivoCancelamento?: string;
  criadoEm: string;
}

// ---------- IBAMA (IN Ibama 21/2014) ----------

/**
 * Destinação final: o volume por espécie de uma RME entregue, que a CPTM lança como "Destinação Final" no sistema DOF
 * para baixar o saldo virtual. Gerada na entrega da RME; `lancadoEm` e `lancadoPor` quando for lançada.
 */
export interface DestinacaoFinal {
  id: Id;
  rmeId: Id;
  rmeNumero: string;
  especieId: Id;
  quantidade: number;
  /** Volume medido na inspeção (sem medidas, o volume do tamanho). */
  volumeM3: number;
  entregueEm: string;
  lancadoEm?: string;
  lancadoPor?: string;
}

/** Saldo informado do DOF: o saldo por espécie que aparece no sistema DOF numa data (registro periódico). */
export interface SaldoDofInformado {
  id: Id;
  /** Data do saldo consultado no sistema DOF. */
  data: string;
  itens: { especieId: Id; volumeM3: number }[];
  observacao?: string;
  quem: string;
  quando: string;
}

// ---------- Inventário físico por leitura de QR (IN Ibama 21/2014, art. 41) ----------

/** Leitura do QR de um fardo (todos os seus dormentes) ou de um dormente, no local que está sendo conferido. */
export interface LeituraInventario { tipo: 'fardo' | 'dormente'; id: Id; localId: Id; quando: string; quem: string }

/** O que deveria estar em cada local quando o inventário foi aberto (dormente a dormente). */
export interface EsperadoInventario { dormenteId: Id; fardoId: Id; localId: Id }

export type GrupoDiferenca = 'local_errado' | 'nao_encontrado' | 'inesperado';

/**
 * Diferença encontrada, sempre dormente a dormente (não existe ajuste de quantidade). Local errado do fardo vem numa
 * linha só (`tipo: 'fardo'`, com a quantidade); não encontrado e inesperado, por dormente (ou fardo lido sem saldo).
 */
export interface DiferencaInventario {
  grupo: GrupoDiferenca;
  tipo: 'fardo' | 'dormente';
  id: Id;
  fardoId: Id;
  /** Onde deveria estar. */
  localId?: Id;
  /** Onde foi lido. */
  lidoEmId?: Id;
  quantidade: number;
  motivo: string;
  /** Obrigatória nos inesperados. */
  justificativa?: string;
}

/**
 * Dois números por local: localizados (achados em qualquer local do inventário; é o que os relatórios do IBAMA usam) e
 * no lugar certo (lidos no local em que o sistema os esperava; a operação usa os dois).
 */
export interface ResultadoLocalInventario {
  localId: Id;
  esperados: number;
  localizados: number;
  noLugarCerto: number;
  percentualLocalizados: number;
  percentualNoLugarCerto: number;
  diferencas: number;
}

export interface ResultadoInventario {
  porLocal: ResultadoLocalInventario[];
  esperados: number;
  localizados: number;
  noLugarCerto: number;
  percentualLocalizados: number;
  percentualNoLugarCerto: number;
  diferencas: DiferencaInventario[];
}

export type SituacaoInventario = 'aberto' | 'fechado';

export interface Inventario {
  id: Id;
  /** INV-2026-0001 */
  numero: string;
  locaisIds: Id[];
  esperados: EsperadoInventario[];
  leituras: LeituraInventario[];
  situacao: SituacaoInventario;
  abertoEm: string;
  abertoPor: string;
  fechadoEm?: string;
  fechadoPor?: string;
  /** Gravado no fechamento (com as justificativas dos inesperados). */
  resultado?: ResultadoInventario;
}

/** Resposta de cada leitura, para o retorno na hora na tela de campo. */
export interface RetornoLeituraInventario { situacao: 'conferido' | 'local_errado' | 'inesperado' | 'repetido'; mensagem: string; quantidade: number }

/** Último inventário de cada local (relatórios do IBAMA e Inventário para vistoria). */
export interface InventarioDoLocal {
  localId: Id;
  inventarioId?: Id;
  numero?: string;
  fechadoEm?: string;
  esperados: number;
  localizados: number;
  noLugarCerto: number;
  /** Percentual de localizados (o dos relatórios do IBAMA). */
  percentualLocalizados?: number;
  percentualNoLugarCerto?: number;
  localErrado: number;
  naoEncontrados: number;
  inesperados: number;
}

/** Motivo da perda (IN Ibama 21/2014, art. 42: perdas, incêndios e intempéries são informados ao órgão). */
export type MotivoPerda = 'extravio' | 'avaria' | 'incendio' | 'intemperie' | 'outro';

/**
 * Perda: o gestor transforma um dormente "não localizado" em "perdido", com motivo. O dormente sai do saldo físico e
 * entra no relatório "Perdas a comunicar ao IBAMA" até ser marcado como comunicado ao órgão.
 */
export interface Perda {
  id: Id;
  dormenteId: Id;
  fardoId: Id;
  contratoId: Id;
  especieId: Id;
  tamanhoId: Id;
  /** Volume do tamanho (o dormente perdido não foi medido). */
  volumeM3: number;
  motivo: MotivoPerda;
  descricao?: string;
  quando: string;
  quem: string;
  comunicadoEm?: string;
  comunicadoPor?: string;
}

/** Calculado: saldo físico do pátio por espécie (e tamanho), comparado com o último saldo informado do DOF (art. 41). */
export interface SaldoPatioEspecie {
  especieId: Id;
  quantidade: number;
  fisicoM3: number;
  porTamanho: { tamanhoId: Id; quantidade: number; volumeM3: number }[];
  /** Parte do físico que está "não localizada" (continua no saldo; mostrada à parte para explicar diferenças em vistoria). */
  naoLocalizados: { quantidade: number; volumeM3: number };
  informadoM3?: number;
  informadoEm?: string;
  diferencaPct?: number;
  /** Diferença acima de 10% (tolerância do art. 41). */
  acimaTolerancia: boolean;
}

/** Sugestão de separação: fardos abertos primeiro (mais antigos antes), depois os demais do mais antigo ao mais novo. */
export interface SugestaoSeparacao {
  itens: (ItemRme & {
    fardos: { fardoId: Id; dormentesIds: Id[]; aberto: boolean; idadeDias?: number; localId?: Id }[];
    /** Já reservados para o item numa separação anterior (a `quantidade` aqui é a que falta para completar). */
    jaSeparados: number;
    /** Todos os fardos do item com dormentes disponíveis (para validar na hora a leitura fora da sugestão). */
    candidatos: { fardoId: Id; dormentesIds: Id[]; aberto: boolean; idadeDias?: number; localId?: Id }[];
    /** Quanto não há disponível para atender o item. */
    faltam: number;
  })[];
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
  /** Antecedência (dias úteis) dos alertas do prazo do laudo: [atenção, crítico]. */
  alertaLaudoDias: [number, number];
  /** Feriados fora dos dias úteis (nacionais, do estado e da cidade de São Paulo). */
  feriados: Feriado[];
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
  parcelasAtrasadas: number;
  laudosAVencer: number;
  reprovadosAguardandoRetirada: number;
}

export type NivelAlerta = 'info' | 'atencao' | 'critico';
/** "Para fazer agora": tarefa do perfil, com a quantidade e o link para agir. */
export interface Pendencia { id: Id; titulo: string; quantidade: number; nivel: NivelAlerta; link: string; acao: string }
export interface Alerta { id: Id; nivel: Exclude<NivelAlerta, 'info'>; titulo: string; descricao: string; link: string }

// ---------- Visões montadas para as páginas de objeto ----------

/** Item do contrato com os nomes, para exibir. */
/** Descrição do fardo ou do dormente: tamanho (o item do contrato) e espécie, classe e tratamento informados pelo fornecedor. */
export interface ItemDescrito { especie: Especie; tamanho: Tamanho; tratamento: Tratamento; classe: Classe; usinaTratamento: string; dataTratamento: string }

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
  /** Linha do tempo do fardo (eventos), do mais antigo ao mais novo. */
  eventos: Evento[];
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
  /** Empresa inspetora do Boletim de Inspeção da entrega. */
  empresaInspetora?: EmpresaInspetora;
  /** Garantia de 5 anos a partir da entrega (recebimento do fardo). */
  garantiaAte?: string;
  /** Linha do tempo do dormente (eventos), do mais antigo ao mais novo. */
  eventos: Evento[];
  /** Perda registrada (dormente perdido). */
  perda?: Perda;
}

/** Tela de inspeção de um fardo: cada dormente com a inspeção que vale. */
export interface InspecaoFardo {
  fardo: Fardo;
  item: ItemDescrito;
  local?: Local;
  dormentes: (Dormente & { inspecao?: Inspecao })[];
  inspecionados: number;
  pendentes: number;
  /** Falta de dormentes declarada no recebimento deste fardo. */
  faltaDeclarada?: number;
  /** Justificativa que o sistema usa se os não lidos couberem na falta declarada no recebimento. */
  justificativaSugerida?: string;
}

export type SituacaoEmissao = 'aguardando_documentos' | 'a_caminho' | 'recebida_parcial' | 'recebida';

/**
 * Emissão do fornecedor (no protótipo, o Simulador): os fardos e dormentes com QR e a NF e a DOF que acompanham o
 * material. Com documentos, a entrega já nasce cadastrada; sem, a CPTM cadastra NF e DOF depois, pelo XML.
 */
export interface Emissao {
  id: Id;
  contratoId: Id;
  fardosIds: Id[];
  parcela: number;
  reentrega: boolean;
  nf: { numero: string; serie: string; chaveAcesso: string; emissao: string; itens: ItemNf[] };
  /** Boletim de Inspeção e Relatório Técnico de exemplo que acompanham o material (dados para digitar no cadastro). */
  boletim: Omit<BoletimInspecao, 'arquivo'>;
  relatorioTecnico: Omit<RelatorioTecnico, 'arquivo'>;
  /** Dados da DOF que o fornecedor envia, para a demonstração (a pessoa digita do documento). */
  dof: { numero: string; validade: string; volumes: VolumeEspecie[] };
  comDocumentos: boolean;
  /** Entrega criada quando NF e DOF foram cadastradas (no Simulador ou depois, em NF e DOF). */
  entregaId?: Id;
  criadoEm: string;
  criadoPor: string;
  // calculados:
  dormentes: number;
  situacao: SituacaoEmissao;
}

/** Página do fornecedor: atas, contratos e taxa de reprovação por espécie (reprovados sobre inspecionados). */
export interface FornecedorResumo {
  fornecedor: Fornecedor;
  atas: Ata[];
  contratos: Contrato[];
  reprovacao: { especieId: Id; inspecionados: number; reprovados: number; percentual: number }[];
}

/** Etiquetas de uma emissão para impressão: o fardo e os seus dormentes. */
export interface EtiquetasEmissao {
  emissao: Emissao;
  contrato: Contrato;
  fardos: { fardo: Fardo; item: ItemDescrito; dormentesIds: Id[] }[];
}
