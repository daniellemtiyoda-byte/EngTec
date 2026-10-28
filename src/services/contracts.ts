import type {
  Alerta, AtualizacaoEspecie, ContagemInventario, Documento, DivergenciaInventario, Especie, Fardo, Fornecedor, Indicadores,
  ListQuery, LocalPatio, Lote, Movimentacao, NotaFiscal, NovaMovimentacao, NovaNf, NovaRme, NovaSeparacao, NovoDof, NovoRecebimento, NovoTamanho,
  OpcaoSeparacao, Paginado, Rme,
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
  };
  fornecedores: ServicoLista<Fornecedor>;
  documentos: ServicoLista<Documento>;
  notas: ServicoLista<NotaFiscal> & {
    /** `xml`: arquivo da NF-e importada, guardado junto do registro (RF02). Chave de acesso repetida é recusada. */
    cadastrar(d: NovaNf, xml?: File): Promise<NotaFiscal>;
    /** Um DOF por NF no MVP, com o PDF anexo. Volume por espécie, como no documento. */
    cadastrarDof(nfId: string, d: NovoDof, pdf: File): Promise<NotaFiscal>;
  };
  recebimentos: ServicoLista<Recebimento> & {
    /** Recusado sem DOF. Cria um lote por espécie e tamanho e os fardos, todos aguardando inspeção. */
    confirmar(d: NovoRecebimento, fotos: File[]): Promise<ResultadoRecebimento>;
  };
  /** Lotes só são criados pelo recebimento: não há cadastro manual. */
  lotes: ServicoLista<Lote>;
  fardos: ServicoLista<Fardo>;
  estoque: ServicoLista<SaldoEstoque>;
  movimentacoes: ServicoLista<Movimentacao> & {
    /** Só transferência: entrada vem do recebimento e saída da RME. */
    registrar(d: NovaMovimentacao): Promise<Movimentacao>;
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
