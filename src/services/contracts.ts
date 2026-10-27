import type {
  Alerta, AtualizacaoEspecie, ContagemInventario, Documento, DivergenciaInventario, Especie, Fornecedor, Indicadores,
  ListQuery, LocalPatio, Lote, Movimentacao, NovaConferencia, NovaMovimentacao, NovoLote, NovoTamanho, Paginado,
  ProcessamentoImagem, Recebimento, RegistroAuditoria, Relatorio, ResultadoConexao, SaldoEstoque,
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
  documentos: ServicoLista<Documento> & {
    importar(arquivo: File): Promise<Documento>;
  };
  recebimentos: ServicoLista<Recebimento> & {
    registrarConferencia(d: NovaConferencia): Promise<Recebimento>;
  };
  lotes: ServicoLista<Lote> & { cadastrar(d: NovoLote): Promise<Lote> };
  estoque: ServicoLista<SaldoEstoque>;
  movimentacoes: ServicoLista<Movimentacao> & {
    registrar(d: NovaMovimentacao): Promise<Movimentacao>;
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
