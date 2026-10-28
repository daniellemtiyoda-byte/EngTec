export type MetodoHttp = 'GET' | 'POST' | 'PATCH';

export interface EndpointProvisorio {
  modulo: string;
  operacao: string;
  metodo: MetodoHttp;
  caminho: string; // {id} é substituído por parâmetro
  estado: 'pendente de confirmação' | 'confirmado';
}

/**
 * TODOS os endpoints abaixo são PROVISÓRIOS: foram nomeados pelo front-end para permitir
 * a integração incremental. Substitua pelos valores da documentação do back-end e mude o
 * estado para 'confirmado' somente depois de validar (campos, autenticação, permissões, códigos de erro).
 */
const P = 'pendente de confirmação' as const;

export const ENDPOINTS = {
  'auth.entrar': { modulo: 'Autenticação', operacao: 'Iniciar sessão', metodo: 'POST', caminho: '/auth/login', estado: P },
  'auth.usuarioAtual': { modulo: 'Autenticação', operacao: 'Usuário conectado', metodo: 'GET', caminho: '/auth/me', estado: P },
  'auth.sair': { modulo: 'Autenticação', operacao: 'Encerrar sessão', metodo: 'POST', caminho: '/auth/logout', estado: P },
  'dashboard.indicadores': { modulo: 'Dashboard', operacao: 'Indicadores', metodo: 'GET', caminho: '/dashboard/indicadores', estado: P },
  'dashboard.alertas': { modulo: 'Dashboard', operacao: 'Alertas', metodo: 'GET', caminho: '/dashboard/alertas', estado: P },
  'fornecedores.listar': { modulo: 'Fornecedores', operacao: 'Listar', metodo: 'GET', caminho: '/fornecedores', estado: P },
  'documentos.listar': { modulo: 'Documentos', operacao: 'Listar', metodo: 'GET', caminho: '/documentos', estado: P },
  'notas.listar': { modulo: 'NF e DOF', operacao: 'Listar notas fiscais', metodo: 'GET', caminho: '/notas-fiscais', estado: P },
  'notas.cadastrar': { modulo: 'NF e DOF', operacao: 'Cadastrar NF (multipart: dados + xml)', metodo: 'POST', caminho: '/notas-fiscais', estado: P },
  'notas.declararDof': { modulo: 'NF e DOF', operacao: 'Marcar DOF como declarado no Sinaflor', metodo: 'POST', caminho: '/notas-fiscais/{id}/dof/declaracao', estado: P },
  'notas.cadastrarDof': { modulo: 'NF e DOF', operacao: 'Cadastrar DOF da NF (multipart: dados + pdf)', metodo: 'POST', caminho: '/notas-fiscais/{id}/dof', estado: P },
  'recebimentos.listar': { modulo: 'Recebimento', operacao: 'Listar conferências', metodo: 'GET', caminho: '/recebimentos', estado: P },
  'recebimentos.confirmar': { modulo: 'Recebimento', operacao: 'Confirmar recebimento (multipart: dados + fotos)', metodo: 'POST', caminho: '/recebimentos', estado: P },
  'lotes.listar': { modulo: 'Lotes', operacao: 'Listar', metodo: 'GET', caminho: '/lotes', estado: P },
  'fardos.listar': { modulo: 'Fardos', operacao: 'Listar', metodo: 'GET', caminho: '/fardos', estado: P },
  'estoque.listar': { modulo: 'Estoque', operacao: 'Consultar saldos', metodo: 'GET', caminho: '/estoque/saldos', estado: P },
  'movimentacoes.listar': { modulo: 'Movimentações', operacao: 'Listar', metodo: 'GET', caminho: '/movimentacoes', estado: P },
  'movimentacoes.registrar': { modulo: 'Movimentações', operacao: 'Registrar', metodo: 'POST', caminho: '/movimentacoes', estado: P },
  'movimentacoes.decidir': { modulo: 'Movimentações', operacao: 'Aprovar ou rejeitar perda/ajuste', metodo: 'POST', caminho: '/movimentacoes/{id}/decisao', estado: P },
  'rme.listar': { modulo: 'RME', operacao: 'Listar', metodo: 'GET', caminho: '/rmes', estado: P },
  'rme.abrir': { modulo: 'RME', operacao: 'Abrir', metodo: 'POST', caminho: '/rmes', estado: P },
  'rme.opcoesSeparacao': { modulo: 'RME', operacao: 'Fardos elegíveis e sugestão FIFO', metodo: 'GET', caminho: '/rmes/{id}/opcoes-separacao', estado: P },
  'rme.separar': { modulo: 'RME', operacao: 'Registrar separação', metodo: 'POST', caminho: '/rmes/{id}/separacao', estado: P },
  'rme.conferir': { modulo: 'RME', operacao: 'Conferência do supervisor', metodo: 'POST', caminho: '/rmes/{id}/conferencia', estado: P },
  'rme.entregar': { modulo: 'RME', operacao: 'Confirmar entrega (baixa)', metodo: 'POST', caminho: '/rmes/{id}/entrega', estado: P },
  'rme.cancelar': { modulo: 'RME', operacao: 'Cancelar', metodo: 'POST', caminho: '/rmes/{id}/cancelamento', estado: P },
  'inventario.listar': { modulo: 'Inventário', operacao: 'Listar sessões', metodo: 'GET', caminho: '/inventarios', estado: P },
  'inventario.criarSessao': { modulo: 'Inventário', operacao: 'Criar sessão', metodo: 'POST', caminho: '/inventarios', estado: P },
  'inventario.registrarContagem': { modulo: 'Inventário', operacao: 'Registrar contagem', metodo: 'POST', caminho: '/inventarios/{id}/contagens', estado: P },
  'inventario.divergencias': { modulo: 'Inventário', operacao: 'Consultar divergências', metodo: 'GET', caminho: '/inventarios/{id}/divergencias', estado: P },
  'visao.listar': { modulo: 'Visão computacional', operacao: 'Listar processamentos', metodo: 'GET', caminho: '/visao-computacional/processamentos', estado: P },
  'visao.enviarImagem': { modulo: 'Visão computacional', operacao: 'Enviar imagem', metodo: 'POST', caminho: '/visao-computacional/imagens', estado: P },
  'patio.listar': { modulo: 'Pátio', operacao: 'Listar localizações', metodo: 'GET', caminho: '/patio/locais', estado: P },
  'patio.transferencias': { modulo: 'Pátio', operacao: 'Listar transferências', metodo: 'GET', caminho: '/patio/transferencias', estado: P },
  'relatorios.listar': { modulo: 'Relatórios', operacao: 'Listar', metodo: 'GET', caminho: '/relatorios', estado: P },
  'relatorios.saldoIbama': { modulo: 'Relatórios', operacao: 'Saldo em m³ por espécie e dimensão (IBAMA)', metodo: 'GET', caminho: '/relatorios/ibama/saldo', estado: P },
  'relatorios.dofsPendentes': { modulo: 'Relatórios', operacao: 'DOFs pendentes de declaração', metodo: 'GET', caminho: '/relatorios/ibama/dofs-pendentes', estado: P },
  'relatorios.movimentacoes': { modulo: 'Relatórios', operacao: 'Movimentações do período', metodo: 'GET', caminho: '/relatorios/movimentacoes', estado: P },
  'parametros.obter': { modulo: 'Configurações', operacao: 'Parâmetros de negócio', metodo: 'GET', caminho: '/parametros', estado: P },
  'parametros.atualizar': { modulo: 'Configurações', operacao: 'Atualizar parâmetros', metodo: 'PATCH', caminho: '/parametros', estado: P },
  'relatorios.exportar': { modulo: 'Relatórios', operacao: 'Solicitar exportação', metodo: 'POST', caminho: '/relatorios/{id}/exportacoes', estado: P },
  'auditoria.listar': { modulo: 'Auditoria', operacao: 'Consultar histórico', metodo: 'GET', caminho: '/auditoria', estado: P },
  'especies.listar': { modulo: 'Espécies', operacao: 'Listar', metodo: 'GET', caminho: '/especies', estado: P },
  'especies.atualizar': { modulo: 'Espécies', operacao: 'Atualizar classe e uso', metodo: 'PATCH', caminho: '/especies/{id}', estado: P },
  'tamanhos.listar': { modulo: 'Tamanhos', operacao: 'Listar', metodo: 'GET', caminho: '/tamanhos', estado: P },
  'tamanhos.cadastrar': { modulo: 'Tamanhos', operacao: 'Cadastrar', metodo: 'POST', caminho: '/tamanhos', estado: P },
  'tamanhos.atualizar': { modulo: 'Tamanhos', operacao: 'Atualizar medidas', metodo: 'PATCH', caminho: '/tamanhos/{id}', estado: P },
  'volumetria.listar': { modulo: 'Controle volumétrico', operacao: 'Listar por lote', metodo: 'GET', caminho: '/volumetria/lotes', estado: P },
  'usuarios.listar': { modulo: 'Administração', operacao: 'Listar usuários', metodo: 'GET', caminho: '/usuarios', estado: P },
  'sistema.saude': { modulo: 'Sistema', operacao: 'Teste de conexão', metodo: 'GET', caminho: '/saude', estado: P },
} satisfies Record<string, EndpointProvisorio>;

export type ChaveEndpoint = keyof typeof ENDPOINTS;
export const LISTA_ENDPOINTS: EndpointProvisorio[] = Object.values(ENDPOINTS);
