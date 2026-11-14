import type {
  Alerta, Ata, BalancoIbama, RecebimentoDof, CartaoPainel, Categoria, DestinacaoFinal, Evento, Inventario, InventarioDoLocal, MotivoPerda, Perda, ResultadoInventario, RetornoLeituraInventario, SaldoDofInformado, SaldoPatioEspecie, Contrato, Dof, Dormente, Emissao, EmpresaInspetora, Entrega, EtiquetasEmissao, Fardo, FardoDetalhe, FichaDormente, Fornecedor, FornecedorResumo,
  Id, Indicadores, InspecaoFardo, ItemRme, ListQuery, Local, Medidas, Movimentacao, NotaFiscal, Paginado, Parametros, RegrasAta, TipoDestino, UsoTamanho,
  Pendencia, PreviaRecebimento, Recebimento, Rme, SaldoItem, SugestaoSeparacao, Tamanho, Tratamento, Especie, TipoOcorrencia, Usuario,
  VereditoInspector, ResultadoInspecao,
} from '../types/models';

/**
 * CONTRATO ÚNICO entre as telas e os dados (seção 6 do docs/PLANO-V2.md). Implementações: services/mock (até a
 * Etapa 9) e services/supabase (Etapa 9). A autenticação fica fora daqui, em services/auth/.
 * Toda regra de negócio vale no serviço; as telas só exibem e enviam. Erros chegam como `ApiError`, com
 * mensagem segura para exibir e, quando for o caso, erros por campo.
 */
export interface ServicoLista<T> {
  listar(q?: ListQuery): Promise<Paginado<T>>;
}

/** Cadastro: nada é apagado, só inativado (e reativado, respeitando as regras de cada um). */
export interface ServicoCadastro<T, N> extends ServicoLista<T> {
  obter(id: Id): Promise<T>;
  criar(dados: N): Promise<T>;
  atualizar(id: Id, dados: Partial<N>): Promise<T>;
  inativar(id: Id): Promise<T>;
  reativar(id: Id): Promise<T>;
}

// ---------- Entradas das operações ----------

export interface DadosFornecedor { razaoSocial: string; cnpj: string; cidadeUf: string; ctfIbama: string; ctfValidade: string; especiesIds: Id[] }
export interface DadosEspecie { nomeCientifico: string; nomePopular: string }
/** `codigo`: código de material CPTM (6 dígitos). */
export interface DadosTamanho { codigo: string; comprimentoCm: number; larguraCm: number; alturaCm: number; uso: UsoTamanho; medidas: 'provisorio' | 'confirmado' }
export interface DadosTratamento { preservativo: string; empresa: string }
export interface DadosEmpresaInspetora { nome: string; cnpj?: string }
export interface DadosLocal { codigo: string; descricao: string; tipo: Local['tipo']; capacidade: number }

/** Sem `vigenciaFim`, a vigência é de 12 meses; sem `regras`, as padrão (REGRAS_ATA_PADRAO); `itens`: quantidades registradas por tamanho. */
export interface DadosAta { numero: string; fornecedorId: Id; vigenciaInicio: string; vigenciaFim?: string; regras?: Partial<RegrasAta>; itens?: { tamanhoId: Id; quantidade: number }[] }
/** Parcela do cronograma: quantidade por tamanho. Os itens do contrato são a soma das parcelas. */
export interface DadosParcela { itens: { tamanhoId: Id; quantidade: number }[] }
export interface DadosContrato { numero: string; ataId: Id; ano: number; dataAssinatura: string; gestor: string; parcelas: DadosParcela[] }
/** Novo cronograma: nenhum item pode ficar abaixo do já emitido (descontados os reprovados). */
export interface DadosAtualizacaoContrato { gestor?: string; parcelas?: DadosParcela[] }

/** `comDocumentos`: com NF e DOF já cadastradas (entrega a caminho); sem, só os fardos (a CPTM cadastra NF e DOF pelo XML). */
/** `reentrega`: reposição de reprovados (só aceita depois da retirada deles). */
export interface DadosEmissao { contratoId: Id; parcela: number; reentrega?: boolean; comDocumentos: boolean; itens: { itemContratoId: Id; fardos: number; dormentesPorFardo: number }[] }

export interface DadosNf { numero: string; serie: string; chaveAcesso: string; contratoId: Id; emissao: string; itens: { itemContratoId: Id; quantidade: number; volumeM3: number }[] }
export interface DadosDof { numero: string; validade: string; volumes: { especieId: Id; volumeM3: number }[] }
export interface DadosBoletim { numero: string; data: string; empresaInspetoraId: Id; itens: { tamanhoId: Id; especieId: Id; quantidade: number }[] }
export interface DadosRelatorioTecnico { numero: string; data: string }
/** `origem: 'recebimento'`: cadastro feito na hora do recebimento (exceção). `parcela`: do cronograma do contrato. */
export interface DadosEntrega {
  nf: DadosNf; dof: DadosDof; parcela: number; fardosIds?: Id[]; origem?: 'cadastro' | 'recebimento';
  /** Reposição de reprovados: só é aceita depois da retirada dos reprovados do contrato. */
  reentrega?: boolean;
  boletim?: DadosBoletim; relatorioTecnico?: DadosRelatorioTecnico;
}
export interface ArquivosEntrega { xml?: File; pdf?: File; boletim?: File; relatorio?: File }

/** Falta declarada: `fardoId` e `quantidade` (dormentes que faltavam no fardo) obrigatórios. */
export interface DadosOcorrencia { tipo: TipoOcorrencia; descricao: string; fardoId?: Id; quantidade?: number; fotos: File[] }
/** Falta de dormentes num fardo lido (entra no recebido e no volume nominal). */
export interface FaltaDormentes { fardoId: Id; quantidade: number }
export interface DadosRecebimento {
  /** IDs lidos pelo QR ou marcados à mão. */
  fardosLidos: Id[];
  /** Ocorrências declaradas (avaria, falta, sobra): descrição e foto obrigatórias. Falta de fardo e fardo desconhecido o sistema gera. */
  ocorrencias: DadosOcorrencia[];
  localEsperaId: Id;
  /** Obrigatória se alguma espécie passar da tolerância de volume. */
  justificativaDivergencia?: string;
  /** Foto do canhoto da NF assinado (recebimento provisório; opcional). */
  canhoto?: File;
}

/** Resultado vindo do Inspector (veredito + índice) ou lançado à mão (resultado + categoria). */
export type DadosInspecao =
  | { origem: 'manual'; resultado: ResultadoInspecao; categoria?: Categoria; medidas?: Medidas }
  | { origem: 'inspector' | 'simulado'; veredito: VereditoInspector; indice: number; medidas?: Medidas; relatorioUrl?: string };

export interface DadosRme { destino: string; tipoDestino: TipoDestino; necessidadeEm: string; itens: ItemRme[] }
/** `justificativaClasse`: obrigatória quando o fardo é de classe inferior à sugerida para o tipo de destino. */
export interface DadosSeparacao { fardoId: Id; dormentesIds: Id[]; justificativa?: string; justificativaClasse?: string }

// ---------- Serviços ----------

export interface Servicos {
  dashboard: {
    indicadores(): Promise<Indicadores>;
    /** Cartões do Painel conforme as permissões; cada valor é o total da lista que o link abre. */
    cartoes(): Promise<CartaoPainel[]>;
    /** "Para fazer agora" do usuário, conforme as permissões. */
    pendencias(): Promise<Pendencia[]>;
    alertas(): Promise<Alerta[]>;
  };

  fornecedores: ServicoCadastro<Fornecedor, DadosFornecedor> & { resumo(id: Id): Promise<FornecedorResumo> };
  especies: ServicoCadastro<Especie, DadosEspecie>;
  tamanhos: ServicoCadastro<Tamanho, DadosTamanho>;
  tratamentos: ServicoCadastro<Tratamento, DadosTratamento>;
  empresasInspetoras: ServicoCadastro<EmpresaInspetora, DadosEmpresaInspetora>;
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
  simulador: ServicoLista<Emissao> & {
    emitir(dados: DadosEmissao): Promise<Emissao>;
    etiquetas(emissaoId: Id): Promise<EtiquetasEmissao>;
    /** XML fictício da NF da emissão, para a importação em NF e DOF. */
    xmlNf(emissaoId: Id): Promise<string>;
  };

  documentos: {
    /** Cadastra NF e DOF e cria a entrega "a caminho". */
    cadastrarEntrega(dados: DadosEntrega, arquivos?: ArquivosEntrega): Promise<Entrega>;
    /** `filters.etapa`: a_caminho, aguardando_inspecao, concluida ou com_ocorrencia (aba de Recebimentos). */
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
    /** Prévia da revisão: aceitos, desconhecidos, faltas, divergência de volume e justificativa automática. Não grava nada. */
    previa(entregaId: Id, fardosLidos: Id[], faltas?: FaltaDormentes[]): Promise<PreviaRecebimento>;
    receber(entregaId: Id, dados: DadosRecebimento): Promise<Recebimento>;
    /** Laudo Técnico de aprovação: toda a entrega recebida e inspecionada (prazo de 20 dias úteis da entrega). */
    emitirLaudo(entregaId: Id): Promise<Entrega>;
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
    /** Fardos com reprovados ainda não retirados (comunicação e retirada pelo fornecedor). */
    reprovados(q?: ListQuery): Promise<Paginado<Fardo>>;
    registrarComunicacao(fardoId: Id): Promise<Fardo>;
    /** Os reprovados do fardo passam a "retirado pelo fornecedor" e saem da segregação. */
    registrarRetirada(fardoId: Id): Promise<Fardo>;
  };

  /** `filters.noLocal`: fardos que estão no local (sem os baixados). */
  fardos: ServicoLista<Fardo> & {
    obter(id: Id): Promise<FardoDetalhe>;
    /** Expedição só recebe o fardo com todos os dormentes reservados para uma RME pronta. */
    transferir(id: Id, localId: Id): Promise<Fardo>;
  };

  dormentes: ServicoLista<Dormente> & {
    obter(id: Id): Promise<FichaDormente>;
  };

  estoque: {
    /** Saldo por classe e tamanho; filtros `classe`, `tamanhoId`, `uso` e `situacao`; a busca olha o código e as espécies. */
    porItem(q?: ListQuery): Promise<Paginado<SaldoItem>>;
    /**
     * Fardos em estoque (com saldo; os baixados saem). `aberto` ("true"/"false") separa completos e abertos. Filtros
     * além dos campos do fardo: `especieId` e `tamanhoId` (pelo item do contrato) e `acimaLimite` ("sim").
     */
    porFardo(q?: ListQuery): Promise<Paginado<Fardo>>;
  };

  /** Filtros além dos campos: `periodo` (últimos 7, 30 ou 90 dias) e `localId` (de ou para o local). */
  movimentacoes: ServicoLista<Movimentacao>;

  /** Histórico e auditoria. Filtros `entidade` e `entidadeId`; do mais recente ao mais antigo. */
  eventos: ServicoLista<Evento>;

  rme: ServicoLista<Rme> & {
    obter(numero: string): Promise<Rme>;
    abrir(dados: DadosRme): Promise<Rme>;
    iniciarSeparacao(numero: string): Promise<Rme>;
    sugerirSeparacao(numero: string): Promise<SugestaoSeparacao>;
    /** Reserva os dormentes e deixa a RME pronta; escolha diferente da sugestão exige justificativa. */
    separar(numero: string, separacao: DadosSeparacao[]): Promise<Rme>;
    /** Baixa os dormentes reservados (a baixa só acontece aqui). */
    entregar(numero: string): Promise<Rme>;
    /** Antes da entrega; libera as reservas e devolve à origem o fardo que estava na expedição. */
    cancelar(numero: string, motivo: string): Promise<Rme>;
  };

  /**
   * Inventário físico por leitura de QR. Abrir, ler e fechar: `estoque:movimentar` (almoxarife); a leitura dos
   * resultados é de todos. Filtro `situacao` (aberto, fechado).
   */
  inventarios: ServicoLista<Inventario> & {
    obter(id: Id): Promise<Inventario>;
    abrir(locaisIds: Id[]): Promise<Inventario>;
    /** Lê o QR de um fardo ou dormente no local que está sendo conferido. */
    ler(id: Id, leitura: { tipo: 'fardo' | 'dormente'; id: Id; localId: Id }): Promise<RetornoLeituraInventario>;
    /** O resultado que o fechamento vai gravar, sem gravar. */
    previa(id: Id): Promise<ResultadoInventario>;
    /** Fecha: corrige o local errado (transferência), marca os não encontrados como não localizados e grava os inesperados com a justificativa (`<tipo>:<id>`). */
    fechar(id: Id, justificativas: Record<string, string>): Promise<Inventario>;
  };

  /** Prestação de contas ao IBAMA (IN Ibama 21/2014). Lançar e informar exigem `dof:declarar`. */
  ibama: {
    /** Destinação final das RMEs entregues. Filtros `lancado` ("sim"/"nao"), `especieId`, `de` e `ate` (data da entrega). */
    destinacoes(q?: ListQuery): Promise<Paginado<DestinacaoFinal>>;
    marcarLancado(id: Id): Promise<DestinacaoFinal>;
    /** Saldos informados do DOF, do mais recente ao mais antigo. */
    saldosInformados(q?: ListQuery): Promise<Paginado<SaldoDofInformado>>;
    informarSaldo(dados: DadosSaldoDof): Promise<SaldoDofInformado>;
    /** Saldo do pátio em m³ por espécie e tamanho × último saldo informado (com os não localizados à parte). */
    saldoPatio(): Promise<SaldoPatioEspecie[]>;
    /** Gestor: dormente não localizado vira perdido (motivo obrigatório; "outro" exige descrição). */
    registrarPerda(dormenteId: Id, dados: DadosPerda): Promise<Perda>;
    /** Perdas a comunicar ao IBAMA. Filtros `comunicado` ("sim"/"nao"), `especieId`, `de` e `ate` (data da perda). */
    perdas(q?: ListQuery): Promise<Paginado<Perda>>;
    /** Marca a perda como comunicada ao órgão (gestor ou quem declara DOF). */
    marcarPerdaComunicada(id: Id): Promise<Perda>;
    /** Último inventário fechado de cada local ativo: data, percentual conferido e diferenças. */
    inventarioPorLocal(): Promise<InventarioDoLocal[]>;
    /** Recebimentos de DOF (art. 51), uma linha por DOF e espécie, vencidas e pendentes primeiro. Período `de`/`ate` pela data do recebimento. Cálculo sobre o estado, sem gravar. */
    recebimentosDof(filtro?: { de?: string; ate?: string }): Promise<RecebimentoDof[]>;
    /** Balanço por espécie no período (art. 41): inicial + entradas − destinações − perdas − retiradas = final, comparado com o físico quando o período termina hoje. */
    balanco(filtro?: { de?: string; ate?: string }): Promise<BalancoIbama>;
  };

  parametros: {
    obter(): Promise<Parametros>;
    atualizar(dados: Partial<Omit<Parametros, 'toleranciaVolumePct'>>): Promise<Parametros>;
    /** Só no mock: volta à história inicial de demonstração. */
    reiniciarDemonstracao(): Promise<void>;
  };
}

export interface DadosSaldoDof {
  data: string;
  itens: { especieId: Id; volumeM3: number }[];
  observacao?: string;
}

export interface DadosPerda {
  motivo: MotivoPerda;
  descricao?: string;
}
