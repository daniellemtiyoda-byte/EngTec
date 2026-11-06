import type {
  Alerta, Ata, Categoria, Contrato, Dof, Dormente, Entrega, EtiquetasEntrega, Fardo, FardoDetalhe, FichaDormente, Fornecedor, FornecedorResumo,
  Id, Indicadores, InspecaoFardo, ItemRme, ListQuery, Local, Medidas, Movimentacao, NotaFiscal, Paginado, Parametros,
  Pendencia, Recebimento, Rme, SaldoItem, SugestaoSeparacao, Tamanho, Tratamento, Especie, TipoOcorrencia, Usuario,
  VereditoInspector, ResultadoInspecao,
} from '../types/models';

/**
 * CONTRATO ÚNICO entre as telas e os dados (seção 6 do docs/PLANO-V2.md). Implementações: services/mock (até a
 * Etapa 10) e services/supabase (Etapa 10). A autenticação fica fora daqui, em services/auth/.
 * Toda regra de negócio vale no serviço; as telas só exibem e enviam. Erros chegam como `ApiError`, com
 * mensagem segura para exibir e, quando for o caso, erros por campo.
 */
export interface ServicoLista<T> {
  listar(q?: ListQuery): Promise<Paginado<T>>;
}

/** Cadastro: nada é apagado, só inativado. */
export interface ServicoCadastro<T, N> extends ServicoLista<T> {
  obter(id: Id): Promise<T>;
  criar(dados: N): Promise<T>;
  atualizar(id: Id, dados: Partial<N>): Promise<T>;
  inativar(id: Id): Promise<T>;
}

// ---------- Entradas das operações ----------

export interface DadosFornecedor { razaoSocial: string; cnpj: string; cidadeUf: string; ctfIbama: string; ctfValidade: string; especiesIds: Id[] }
export interface DadosEspecie { nomeCientifico: string; nomePopular: string; classe?: string }
export interface DadosTamanho { codigo: string; comprimentoCm: number; larguraCm: number; alturaCm: number; medidas: 'provisorio' | 'confirmado' }
export interface DadosTratamento { preservativo: string; empresa: string }
export interface DadosLocal { codigo: string; descricao: string; tipo: Local['tipo']; capacidade: number }

export interface DadosAta { numero: string; fornecedorId: Id; vigenciaInicio: string; vigenciaFim: string }
export interface DadosItemContrato { especieId: Id; tamanhoId: Id; tratamentoId: Id; quantidade: number; unidade: 'un' | 'm3' }
export interface DadosContrato { numero: string; ataId: Id; empresaInspetora: string; ano: number; itens: DadosItemContrato[] }
/** Item existente (com `id`) só muda de quantidade; sem `id`, é item novo. */
export interface DadosAtualizacaoContrato { empresaInspetora?: string; itens?: (DadosItemContrato & { id?: Id })[] }

export interface DadosGerarEntrega { contratoId: Id; itens: { itemContratoId: Id; fardos: number; dormentesPorFardo: number }[] }

export interface DadosNf { numero: string; serie: string; chaveAcesso: string; contratoId: Id; emissao: string; itens: { itemContratoId: Id; quantidade: number; volumeM3: number }[] }
export interface DadosDof { numero: string; validade: string; volumes: { especieId: Id; volumeM3: number }[] }
export interface DadosEntrega { nf: DadosNf; dof: DadosDof; fardosIds?: Id[] }
export interface ArquivosEntrega { xml?: File; pdf?: File }

export interface DadosOcorrencia { tipo: TipoOcorrencia; descricao: string; fardoId?: Id; fotos: File[] }
export interface DadosRecebimento {
  /** IDs lidos pelo QR ou marcados à mão. */
  fardosLidos: Id[];
  /** Ocorrências declaradas (avaria, falta, sobra): descrição e foto obrigatórias. Falta de fardo e fardo desconhecido o sistema gera. */
  ocorrencias: DadosOcorrencia[];
  localEsperaId: Id;
  /** Obrigatória se alguma espécie passar da tolerância de volume. */
  justificativaDivergencia?: string;
}

/** Resultado vindo do Inspector (veredito + índice) ou lançado à mão (resultado + categoria). */
export type DadosInspecao =
  | { origem: 'manual'; resultado: ResultadoInspecao; categoria?: Categoria; medidas?: Medidas }
  | { origem: 'inspector' | 'simulado'; veredito: VereditoInspector; indice: number; medidas?: Medidas; relatorioUrl?: string };

export interface DadosRme { destino: string; necessidadeEm: string; itens: ItemRme[] }
export interface DadosSeparacao { fardoId: Id; dormentesIds: Id[]; justificativa?: string }

// ---------- Serviços ----------

export interface Servicos {
  dashboard: {
    indicadores(): Promise<Indicadores>;
    /** "Para fazer agora" do usuário, conforme as permissões. */
    pendencias(): Promise<Pendencia[]>;
    alertas(): Promise<Alerta[]>;
  };

  fornecedores: ServicoCadastro<Fornecedor, DadosFornecedor> & { resumo(id: Id): Promise<FornecedorResumo> };
  especies: ServicoCadastro<Especie, DadosEspecie>;
  tamanhos: ServicoCadastro<Tamanho, DadosTamanho>;
  tratamentos: ServicoCadastro<Tratamento, DadosTratamento>;
  locais: ServicoCadastro<Local, DadosLocal> & { obterPorCodigo(codigo: string): Promise<Local> };
  /** As contas são criadas no painel do Supabase; aqui só perfil e situação. */
  usuarios: ServicoLista<Usuario> & { atualizar(id: Id, dados: { perfil?: Usuario['perfil']; ativo?: boolean }): Promise<Usuario> };

  atas: ServicoLista<Ata> & { criar(dados: DadosAta): Promise<Ata> };
  /** `filters.especieId` traz os contratos que têm item da espécie. */
  contratos: ServicoLista<Contrato> & {
    obter(numero: string): Promise<Contrato>;
    criar(dados: DadosContrato): Promise<Contrato>;
    atualizar(numero: string, dados: DadosAtualizacaoContrato): Promise<Contrato>;
    cancelar(numero: string, motivo: string): Promise<Contrato>;
  };

  /** Só para demonstração: faz o papel do fornecedor. */
  simulador: {
    gerarEntrega(dados: DadosGerarEntrega): Promise<Entrega>;
    etiquetas(entregaId: Id): Promise<EtiquetasEntrega>;
    /** XML fictício da NF da entrega, para testar a importação. */
    xmlNf(entregaId: Id): Promise<string>;
  };

  documentos: {
    /** Cadastra NF e DOF e cria a entrega "a caminho". */
    cadastrarEntrega(dados: DadosEntrega, arquivos?: ArquivosEntrega): Promise<Entrega>;
    listarEntregas(q?: ListQuery): Promise<Paginado<Entrega>>;
    listarNfs(q?: ListQuery): Promise<Paginado<NotaFiscal>>;
    listarDofs(q?: ListQuery): Promise<Paginado<Dof>>;
    /** Fardos emitidos do contrato, em trânsito e sem entrega (para indicar na entrega). */
    fardosSemEntrega(contratoId: Id): Promise<Fardo[]>;
    declararDof(dofId: Id): Promise<Dof>;
  };

  recebimentos: ServicoLista<Recebimento> & {
    obter(id: Id): Promise<Recebimento>;
    /** Entregas a caminho e recebidas em parte. */
    entregasACaminho(): Promise<Entrega[]>;
    receber(entregaId: Id, dados: DadosRecebimento): Promise<Recebimento>;
  };

  inspecao: {
    /** Fardos aguardando e em inspeção. */
    fila(q?: ListQuery): Promise<Paginado<Fardo>>;
    naoLocalizados(q?: ListQuery): Promise<Paginado<Dormente>>;
    obterFardo(fardoId: Id): Promise<InspecaoFardo>;
    /** `fardoId`: o fardo da tela; dormente de outro fardo é recusado ("não pertence a este fardo"). */
    registrar(dormenteId: Id, dados: DadosInspecao, fardoId?: Id): Promise<InspecaoFardo>;
    /** Modo demonstração: resultados determinísticos (cerca de 5% reprovados). */
    simularFardo(fardoId: Id): Promise<InspecaoFardo>;
    /** Guarda os aprovados no local, segrega os reprovados; dormentes não lidos ficam "não localizado" (justificativa obrigatória). */
    concluir(fardoId: Id, dados: { localId: Id; justificativa?: string }): Promise<Fardo>;
  };

  fardos: ServicoLista<Fardo> & {
    obter(id: Id): Promise<FardoDetalhe>;
    transferir(id: Id, localId: Id): Promise<Fardo>;
  };

  dormentes: ServicoLista<Dormente> & {
    obter(id: Id): Promise<FichaDormente>;
  };

  estoque: {
    porItem(): Promise<SaldoItem[]>;
    /** Fardos com saldo (em estoque e abertos). */
    porFardo(q?: ListQuery): Promise<Paginado<Fardo>>;
  };

  movimentacoes: ServicoLista<Movimentacao>;

  rme: ServicoLista<Rme> & {
    obter(numero: string): Promise<Rme>;
    abrir(dados: DadosRme): Promise<Rme>;
    iniciarSeparacao(numero: string): Promise<Rme>;
    sugerirSeparacao(numero: string): Promise<SugestaoSeparacao>;
    /** Reserva os dormentes e deixa a RME pronta; escolha diferente da sugestão exige justificativa. */
    separar(numero: string, separacao: DadosSeparacao[]): Promise<Rme>;
    /** Baixa os dormentes reservados (a baixa só acontece aqui). */
    entregar(numero: string): Promise<Rme>;
    /** Antes da entrega; libera as reservas. */
    cancelar(numero: string, motivo: string): Promise<Rme>;
  };

  parametros: {
    obter(): Promise<Parametros>;
    atualizar(dados: Partial<Omit<Parametros, 'toleranciaVolumePct'>>): Promise<Parametros>;
    /** Só no mock: volta à história inicial de demonstração. */
    reiniciarDemonstracao(): Promise<void>;
  };
}
