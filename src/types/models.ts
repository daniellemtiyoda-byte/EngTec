export type Origem = 'simulado' | 'api';
export type StatusRegistro = 'aprovado' | 'pendente' | 'bloqueado' | 'simulado';
export type StatusEstoque = 'disponivel' | 'bloqueado' | 'em_analise' | 'divergente';
/** Classe vem do cadastro da espécie (ex. "1ª"); sem valor = "a definir". */
export type Classe = string;
/** Categoria numérica do estado do dormente (1, 2, 3...), vinda da inspeção; sem valor = "a definir". */
export type Categoria = number;
export type ResultadoInspecao = 'aguardando' | 'aprovado' | 'reprovado' | 'quarentena';
export type UsoEspecie = 'via' | 'AMV';

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
  filters?: Record<string, string>;
}

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  perfil: string;
  permissoes: string[];
  ativo?: boolean;
  ultimoAcesso?: string;
}

export interface Fornecedor {
  id: string;
  razaoSocial: string;
  cnpj: string;
  cidadeUf: string;
  documentosVigentes: number;
  status: StatusRegistro;
}

export interface Documento {
  id: string;
  tipo: 'NF-e' | 'DOF' | 'Romaneio' | 'Laudo';
  numero: string;
  fornecedor: string;
  emissao: string;
  quantidade: number;
  volumeDocumentalM3: number;
  status: StatusRegistro;
  urlVisualizacao?: string;
}

export interface Especie {
  id: string;
  /** Posição na lista de espécies da RME. */
  numero: number;
  nomeCientifico: string;
  observacao?: string;
  classe?: Classe;
  uso: UsoEspecie;
  lotesAtivos: number;
}

/** `classe: null` volta a classe para "a definir". */
export interface AtualizacaoEspecie {
  classe: Classe | null;
  uso: UsoEspecie;
}

export type SituacaoMedidas = 'provisorio' | 'confirmado';

export interface Tamanho {
  id: string;
  codigo: string;
  larguraCm: number;
  alturaCm: number;
  comprimentoCm: number;
  /** Volume de um dormente, calculado pelo sistema a partir das três dimensões. */
  volumeM3: number;
  medidas: SituacaoMedidas;
}

export interface NovoTamanho {
  codigo: string;
  larguraCm: number;
  alturaCm: number;
  comprimentoCm: number;
  medidas: SituacaoMedidas;
}

export interface Lote {
  id: string;
  codigo: string;
  fornecedor: string;
  especieDocumental: string;
  classe?: Classe;
  categoria?: Categoria;
  inspecao: ResultadoInspecao;
  quantidade: number;
  comprimentoM: number;
  larguraM: number;
  espessuraM: number;
  metrosLineares: number;
  volumeDocumentalM3: number;
  volumeCalculadoM3: number;
  recebidoEm: string;
  status: StatusRegistro;
  estoqueStatus: StatusEstoque;
  local: string;
}

export interface NovoLote {
  codigo: string;
  fornecedorId: string;
  especieId: string;
  quantidade: number;
  comprimentoM: number;
  larguraM: number;
  espessuraM: number;
}

export interface Recebimento {
  id: string;
  loteCodigo: string;
  fornecedor: string;
  documento: string;
  recebidoEm: string;
  quantidadeDocumental: number;
  quantidadeConferida: number;
  divergencia: number;
  metrosLinearesDocumentais: number;
  metrosLinearesConferidos: number;
  status: StatusRegistro;
  conferente: string;
}

export interface NovaConferencia {
  loteCodigo: string;
  documentoNumero: string;
  quantidadeConferida: number;
  observacao?: string;
}

export interface SaldoEstoque {
  id: string;
  loteCodigo: string;
  especieDocumental: string;
  classe?: Classe;
  categoria?: Categoria;
  disponivel: number;
  bloqueado: number;
  emAnalise: number;
  divergente: number;
  metrosLineares: number;
  volumeM3: number;
  local: string;
}

export type TipoMovimentacao = 'entrada' | 'saida' | 'transferencia';

export interface Movimentacao {
  id: string;
  tipo: TipoMovimentacao;
  loteCodigo: string;
  quantidade: number;
  origem: string;
  destino: string;
  dataHora: string;
  usuario: string;
  status: StatusRegistro;
}

export interface NovaMovimentacao {
  tipo: TipoMovimentacao;
  loteCodigo: string;
  quantidade: number;
  origem?: string;
  destino?: string;
  motivo?: string;
}

export interface SessaoInventario {
  id: string;
  descricao: string;
  local: string;
  abertaEm: string;
  estado: 'em_contagem' | 'aguardando_aprovacao' | 'aprovado' | 'rejeitado';
  itensContados: number;
  divergencias: number;
  ajuste: 'nao_aplicavel' | 'pendente_aprovacao' | 'aprovado';
}

export interface DivergenciaInventario {
  id: string;
  sessaoId: string;
  loteCodigo: string;
  saldoSistema: number;
  contagem: number;
  diferenca: number;
}

export interface ContagemInventario {
  loteCodigo: string;
  quantidadeContada: number;
}

export interface ProcessamentoImagem {
  id: string;
  arquivo: string;
  enviadoEm: string;
  estado: 'na_fila' | 'processando' | 'concluido' | 'falha';
  contagemEstimada?: number;
  confianca?: number; // 0..1, quando fornecida pelo serviço
  revisao: 'pendente' | 'revisado' | 'rejeitado' | 'nao_aplicavel';
}

export interface LocalPatio {
  id: string;
  codigo: string;
  descricao: string;
  capacidade: number;
  ocupacao: number;
  status: 'liberado' | 'bloqueado' | 'em_inventario';
}

export interface Transferencia {
  id: string;
  loteCodigo: string;
  quantidade: number;
  de: string;
  para: string;
  dataHora: string;
  status: StatusRegistro;
}

export interface VolumetriaLote {
  id: string;
  loteCodigo: string;
  volumeDocumentalM3: number;
  volumeCalculadoM3: number;
  diferencaM3: number;
  diferencaPct: number;
  situacao: 'conforme' | 'divergente';
}

export interface Relatorio {
  id: string;
  nome: string;
  descricao: string;
  formatos: ('csv' | 'pdf' | 'xlsx')[];
}

export interface SolicitacaoExportacao {
  id: string;
  relatorioId: string;
  formato: string;
  estado: 'solicitada' | 'em_geracao' | 'pronta' | 'falha';
}

export interface RegistroAuditoria {
  id: string;
  dataHora: string;
  usuario: string;
  acao: string;
  entidade: string;
  detalhe: string;
}

export interface Serie {
  rotulo: string;
  valor: number;
}

export interface Indicadores {
  disponivel: number;
  bloqueado: number;
  emAnalise: number;
  divergente: number;
  metrosLineares: number;
  volumeDocumentalM3: number;
  volumeCalculadoM3: number;
  recebimentosPendentes: number;
  inventariosAbertos: number;
  recebimentosPorMes: Serie[];
  estoquePorClasse: Serie[];
  origem: Origem;
}

export interface Alerta {
  id: string;
  nivel: 'critico' | 'atencao' | 'info';
  titulo: string;
  descricao: string;
  link?: string;
}

export interface ResultadoConexao {
  ok: boolean;
  mensagem: string;
  simulado: boolean;
}
