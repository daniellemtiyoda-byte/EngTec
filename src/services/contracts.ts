import type {
  Alerta, AtualizacaoEspecie, ContagemInventario, Documento, DivergenciaInventario, Dormente, Especie, Fardo, Fornecedor, Indicadores,
  ListQuery, LocalPatio, Lote, LoteDetalhe, Movimentacao, NotaFiscal, NovaMovimentacao, NovaNf, NovaRme, NovaSeparacao, NovoDof, NovoRecebimento, NovoTamanho,
  DofPendente, FiltroMovimentacoes, InspecaoPeca, NovaFormacaoFardos, NovaInspecaoManual, Pendencia, SugestaoFardos, LinhaSaldoIbama, OpcaoSeparacao, Paginado, ParametrosNegocio, RelatorioMovimentacoes, Rme,
  ProcessamentoImagem, Recebimento, RegistroAuditoria, Relatorio, ResultadoConexao, ResultadoRecebimento, SaldoEstoque,
  SessaoInventario, SolicitacaoExportacao, Tamanho, Transferencia, Usuario, VolumetriaLote,
} from '../types/models';

/**
 * CONTRATO ÚNICO entre as telas e o back-end.
 * Há duas implementações com a mesma interface: services/mock (dados fictícios) e services/real (HTTP).
 * Os endpoints da versão real estão em services/endpoints.ts e são PROVISÓRIOS (pendentes de confirmação).
 */
export interface ServicoLista<T> {
  listar(q?: ListQuery): Promise<Paginado<T>>;
}

export interface Servicos {
  auth: {
    entrar(c: { usuario: string; senha: string }): Promise<Usuario>;
    usuarioAtual(): Promise<Usuario | null>;
    sair(): Promise<void>;
  };
  dashboard: {
    indicadores(): Promise<Indicadores>;
    alertas(): Promise<Alerta[]>;
    /** "Para fazer agora" do usuário logado (tela inicial por papel). */
    pendencias(): Promise<Pendencia[]>;
  };
  fornecedores: ServicoLista<Fornecedor>;
  documentos: ServicoLista<Documento>;
  notas: ServicoLista<NotaFiscal> & {
    /** `xml`: arquivo da NF-e importada, guardado junto do registro (RF02). Chave de acesso repetida é recusada. */
    cadastrar(d: NovaNf, xml?: File): Promise<NotaFiscal>;
    /** Um DOF por NF no MVP, com o PDF anexo. Volume por espécie, como no documento. */
    cadastrarDof(nfId: string, d: NovoDof, pdf: File): Promise<NotaFiscal>;
    /** Registra a declaração do recebimento no Sinaflor (feita no sistema do IBAMA). Só depois do recebimento da NF. */
    declararDof(nfId: string): Promise<NotaFiscal>;
  };
  recebimentos: ServicoLista<Recebimento> & {
    /** Recusado sem DOF. Cria um lote por espécie e tamanho, em unidades e aguardando inspeção (os fardos vêm depois). */
    confirmar(d: NovoRecebimento, fotos: File[]): Promise<ResultadoRecebimento>;
  };
  /** Lotes só são criados pelo recebimento: não há cadastro manual. */
  lotes: ServicoLista<Lote> & {
    /** Detalhe pelo código (ex. LT26-0042): fardos, NF, DOF, recebimento e linha do tempo. 404 se não existir. */
    obter(codigo: string): Promise<LoteDetalhe>;
    /** Resumo das inspeções vigentes do lote e a sugestão de fardos (um grupo por resultado e categoria, até 14 por fardo). */
    sugestaoFardos(codigo: string): Promise<SugestaoFardos>;
    /**
     * Conclui a inspeção: forma os fardos confirmados pelo almoxarife. A soma por grupo tem de bater com as peças
     * inspecionadas e nenhuma unidade pode ficar sem resultado. Fardo aprovado fica disponível; os demais, segregados.
     */
    formarFardos(codigo: string, d: NovaFormacaoFardos): Promise<LoteDetalhe>;
  };
  /**
   * Inspeções por peça. As do sistema de inspeção chegam sozinhas pelo servidor (integração banco a banco, ver
   * docs/INTEGRACAO-INSPECAO.md) e nada muda no estoque até `lotes.formarFardos`.
   */
  inspecoes: ServicoLista<InspecaoPeca> & {
    /** Lançamento manual (RF06 sem o Inspector), registrando quem lançou. Só antes da conclusão da inspeção do lote. */
    lancar(loteCodigo: string, d: NovaInspecaoManual): Promise<InspecaoPeca[]>;
  };
  fardos: ServicoLista<Fardo>;
  /** Dormentes individuais (rastreio por peça), criados na formação dos fardos. Filtros: `loteCodigo`, `fardoCodigo`, `estado`. */
  dormentes: ServicoLista<Dormente>;
  estoque: ServicoLista<SaldoEstoque>;
  movimentacoes: ServicoLista<Movimentacao> & {
    /** Transferência, perda ou ajuste. Perda e ajuste ficam pendentes e não alteram o saldo até a aprovação. */
    registrar(d: NovaMovimentacao): Promise<Movimentacao>;
    /** Aprovação de perda ou ajuste (supervisor/gestor); rejeitar exige motivo. Nada é apagado. */
    decidir(id: string, d: { aprovada: boolean; motivo?: string }): Promise<Movimentacao>;
  };
  /** RME: única forma de saída do estoque. Quem confere não pode ser quem separou (validado no servidor). */
  rme: ServicoLista<Rme> & {
    abrir(d: NovaRme): Promise<Rme>;
    /** Fardos elegíveis por item, já na ordem da sugestão e com a quantidade sugerida. */
    opcoesSeparacao(id: string): Promise<OpcaoSeparacao[]>;
    separar(id: string, d: NovaSeparacao): Promise<Rme>;
    /** `aprovada: false` devolve para separação; o motivo é obrigatório. */
    conferir(id: string, d: { aprovada: boolean; motivo?: string }): Promise<Rme>;
    /** Confirma a entrega e dá a baixa nos fardos separados. */
    entregar(id: string): Promise<Rme>;
    cancelar(id: string, motivo: string): Promise<Rme>;
  };
  inventario: ServicoLista<SessaoInventario> & {
    criarSessao(d: { descricao: string; local: string }): Promise<SessaoInventario>;
    registrarContagem(sessaoId: string, itens: ContagemInventario[]): Promise<SessaoInventario>;
    divergencias(sessaoId: string, q?: ListQuery): Promise<Paginado<DivergenciaInventario>>;
  };
  visao: ServicoLista<ProcessamentoImagem> & {
    enviarImagem(arquivo: File): Promise<ProcessamentoImagem>;
  };
  patio: ServicoLista<LocalPatio> & { transferencias: ServicoLista<Transferencia> };
  relatorios: ServicoLista<Relatorio> & {
    solicitarExportacao(relatorioId: string, formato: string): Promise<SolicitacaoExportacao>;
    /** Saldo físico em m³ por espécie (nome científico) e dimensão, para conferir com o DOF (RF32). */
    saldoIbama(): Promise<LinhaSaldoIbama[]>;
    /** DOFs de NFs recebidas pendentes de declaração no Sinaflor, com o prazo (RF30). */
    dofsPendentes(): Promise<DofPendente[]>;
    movimentacoesPeriodo(f: FiltroMovimentacoes): Promise<RelatorioMovimentacoes>;
  };
  parametros: {
    obter(): Promise<ParametrosNegocio>;
    atualizar(d: Omit<ParametrosNegocio, 'provisorio'>): Promise<ParametrosNegocio>;
  };
  auditoria: ServicoLista<RegistroAuditoria>;
  especies: ServicoLista<Especie> & { atualizar(id: string, d: AtualizacaoEspecie): Promise<Especie> };
  tamanhos: ServicoLista<Tamanho> & {
    cadastrar(d: NovoTamanho): Promise<Tamanho>;
    atualizar(id: string, d: NovoTamanho): Promise<Tamanho>;
  };
  volumetria: ServicoLista<VolumetriaLote>;
  usuarios: ServicoLista<Usuario>;
  sistema: { testarConexao(): Promise<ResultadoConexao> };
}
