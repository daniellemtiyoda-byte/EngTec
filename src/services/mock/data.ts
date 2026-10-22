import type {
  DivergenciaInventario, Documento, Especie, Fornecedor, LocalPatio, Lote, Movimentacao, ProcessamentoImagem,
  Recebimento, RegistroAuditoria, Relatorio, SaldoEstoque, SessaoInventario, StatusEstoque, StatusRegistro,
  Transferencia, Usuario, VolumetriaLote,
} from '../../types/models';

// DADOS FICTÍCIOS para desenvolvimento. Nenhum valor aqui representa estoque, fornecedores ou documentos reais.
// Gerados dentro de uma função para o build com API real poder descartar este módulo inteiro.
export function criarDados() {

  const usuarioDemo: Usuario = {
    id: 'u1', nome: 'Usuário de Demonstração', email: 'demo@exemplo.invalid', perfil: 'Administrador (simulado)',
    permissoes: ['lotes:cadastrar', 'recebimento:registrar', 'movimentacoes:registrar', 'inventario:criar', 'documentos:importar', 'visao:enviar', 'relatorios:exportar', 'admin'],
    ativo: true, ultimoAcesso: '2026-10-09T10:15:00-03:00',
  };

  const fornecedores: Fornecedor[] = [
    { id: 'f1', razaoSocial: 'Madeireira Exemplo A Ltda.', cnpj: '00.000.000/0001-01', cidadeUf: 'Cidade A/SP', documentosVigentes: 4, status: 'aprovado' },
    { id: 'f2', razaoSocial: 'Florestal Exemplo B S.A.', cnpj: '00.000.000/0001-02', cidadeUf: 'Cidade B/MS', documentosVigentes: 3, status: 'aprovado' },
    { id: 'f3', razaoSocial: 'Reflorestadora Exemplo C Ltda.', cnpj: '00.000.000/0001-03', cidadeUf: 'Cidade C/MG', documentosVigentes: 1, status: 'pendente' },
    { id: 'f4', razaoSocial: 'Serraria Exemplo D ME', cnpj: '00.000.000/0001-04', cidadeUf: 'Cidade D/PR', documentosVigentes: 0, status: 'bloqueado' },
  ];

  const especies: Especie[] = [
    { id: 'e1', nomePopular: 'Eucalipto', nomeCientifico: 'Eucalyptus sp.', lotesAtivos: 0, status: 'aprovado' },
    { id: 'e2', nomePopular: 'Aroeira', nomeCientifico: 'Myracrodruon urundeuva', lotesAtivos: 0, status: 'aprovado' },
    { id: 'e3', nomePopular: 'Angico', nomeCientifico: 'Anadenanthera sp.', lotesAtivos: 0, status: 'aprovado' },
    { id: 'e4', nomePopular: 'Maçaranduba', nomeCientifico: 'Manilkara sp.', lotesAtivos: 0, status: 'pendente' },
    { id: 'e5', nomePopular: 'Ipê', nomeCientifico: 'Handroanthus sp.', lotesAtivos: 0, status: 'bloqueado' },
  ];

  const locais = ['Quadra 1 / Baia 01', 'Quadra 1 / Baia 02', 'Quadra 2 / Baia 01', 'Quadra 2 / Baia 02', 'Quadra 3 / Baia 01'];
  const statusPorIdx: StatusRegistro[] = ['aprovado', 'aprovado', 'pendente', 'bloqueado', 'aprovado'];
  const deltas = [0, 0.01, -0.02, 0, 0.08];

  const lotes: Lote[] = Array.from({ length: 30 }, (_, i) => {
    const quantidade = 200 + ((i * 37) % 400);
    const comprimentoM = i % 4 === 0 ? 2.0 : 2.8;
    const larguraM = 0.24;
    const espessuraM = 0.17;
    const calc = quantidade * comprimentoM * larguraM * espessuraM;
    const doc = calc * (1 + deltas[i % 5]);
    const status = statusPorIdx[i % 5];
    const divergente = Math.abs(doc - calc) / calc > 0.05;
    const estoqueStatus: StatusEstoque = status === 'aprovado' ? (divergente ? 'divergente' : 'disponivel') : status === 'pendente' ? 'em_analise' : 'bloqueado';
    return {
      id: `l${i + 1}`,
      codigo: `LT-2026-${String(i + 1).padStart(4, '0')}`,
      fornecedor: fornecedores[i % 4].razaoSocial,
      especieDocumental: especies[i % 5].nomePopular,
      classe: i % 3 === 0 ? 'segunda' : 'primeira',
      categoria: i % 2 ? 'A' : 'B',
      quantidade, comprimentoM, larguraM, espessuraM,
      metrosLineares: quantidade * comprimentoM,
      volumeDocumentalM3: doc,
      volumeCalculadoM3: calc,
      recebidoEm: new Date(Date.UTC(2026, 5 + (i % 4), 1 + ((i * 3) % 27), 12)).toISOString(),
      status, estoqueStatus, local: locais[i % 5],
    };
  });

  for (const e of especies) e.lotesAtivos = lotes.filter((l) => l.especieDocumental === e.nomePopular).length;

  const recebimentos: Recebimento[] = lotes.slice(0, 18).map((l, i) => {
    const falta = i % 6 === 3 ? 7 : 0;
    return {
      id: `r${i + 1}`, loteCodigo: l.codigo, fornecedor: l.fornecedor, documento: `NF ${1000 + i}`,
      recebidoEm: l.recebidoEm, quantidadeDocumental: l.quantidade, quantidadeConferida: l.quantidade - falta,
      divergencia: -falta, metrosLinearesDocumentais: l.metrosLineares, metrosLinearesConferidos: (l.quantidade - falta) * l.comprimentoM,
      status: l.status, conferente: ['Conferente 1', 'Conferente 2'][i % 2],
    };
  });

  const saldos: SaldoEstoque[] = lotes.map((l) => ({
    id: `s${l.id}`, loteCodigo: l.codigo, especieDocumental: l.especieDocumental, classe: l.classe, categoria: l.categoria,
    disponivel: l.estoqueStatus === 'disponivel' ? l.quantidade : 0,
    bloqueado: l.estoqueStatus === 'bloqueado' ? l.quantidade : 0,
    emAnalise: l.estoqueStatus === 'em_analise' ? l.quantidade : 0,
    divergente: l.estoqueStatus === 'divergente' ? l.quantidade : 0,
    metrosLineares: l.metrosLineares, volumeM3: l.volumeCalculadoM3, local: l.local,
  }));

  const documentos: Documento[] = Array.from({ length: 20 }, (_, i) => {
    const l = lotes[i];
    return {
      id: `d${i + 1}`, tipo: (['NF-e', 'DOF', 'Romaneio', 'Laudo'] as const)[i % 4], numero: `${2000 + i}`,
      fornecedor: l.fornecedor, emissao: l.recebidoEm, quantidade: l.quantidade, volumeDocumentalM3: l.volumeDocumentalM3,
      status: statusPorIdx[i % 5],
    };
  });

  const movimentacoes: Movimentacao[] = Array.from({ length: 25 }, (_, i) => {
    const tipo = (['entrada', 'saida', 'transferencia'] as const)[i % 3];
    return {
      id: `m${i + 1}`, tipo, loteCodigo: lotes[i].codigo, quantidade: 20 + ((i * 13) % 120),
      origem: tipo === 'entrada' ? 'Recebimento' : locais[i % 5], destino: tipo === 'saida' ? 'Expedição' : locais[(i + 1) % 5],
      dataHora: new Date(Date.UTC(2026, 8, 1 + (i % 28), 13, (i * 7) % 60)).toISOString(),
      usuario: 'Usuário de Demonstração', status: i % 7 === 0 ? 'pendente' : 'aprovado',
    };
  });

  const sessoesInventario: SessaoInventario[] = [
    { id: 'i1', descricao: 'Contagem mensal – Quadra 1', local: 'Quadra 1', abertaEm: '2026-10-01T09:00:00-03:00', estado: 'aguardando_aprovacao', itensContados: 12, divergencias: 3, ajuste: 'pendente_aprovacao' },
    { id: 'i2', descricao: 'Contagem mensal – Quadra 2', local: 'Quadra 2', abertaEm: '2026-10-05T09:00:00-03:00', estado: 'em_contagem', itensContados: 4, divergencias: 0, ajuste: 'nao_aplicavel' },
    { id: 'i3', descricao: 'Contagem de setembro – Quadra 3', local: 'Quadra 3', abertaEm: '2026-09-02T09:00:00-03:00', estado: 'aprovado', itensContados: 9, divergencias: 1, ajuste: 'aprovado' },
  ];

  const divergenciasInventario: DivergenciaInventario[] = [
    { id: 'dv1', sessaoId: 'i1', loteCodigo: lotes[2].codigo, saldoSistema: 300, contagem: 292, diferenca: -8 },
    { id: 'dv2', sessaoId: 'i1', loteCodigo: lotes[5].codigo, saldoSistema: 410, contagem: 410, diferenca: 0 },
  ];

  const processamentos: ProcessamentoImagem[] = [
    { id: 'p1', arquivo: 'baia01_foto1.jpg', enviadoEm: '2026-10-08T14:20:00-03:00', estado: 'concluido', contagemEstimada: 312, confianca: 0.87, revisao: 'pendente' },
    { id: 'p2', arquivo: 'baia02_foto1.jpg', enviadoEm: '2026-10-08T14:25:00-03:00', estado: 'concluido', contagemEstimada: 188, confianca: 0.62, revisao: 'revisado' },
    { id: 'p3', arquivo: 'baia03_foto2.jpg', enviadoEm: '2026-10-09T08:05:00-03:00', estado: 'processando', revisao: 'nao_aplicavel' },
    { id: 'p4', arquivo: 'baia04_foto1.png', enviadoEm: '2026-10-09T08:10:00-03:00', estado: 'falha', revisao: 'nao_aplicavel' },
  ];

  const locaisPatio: LocalPatio[] = locais.map((c, i) => ({
    id: `lp${i + 1}`, codigo: c, descricao: `Área de armazenamento ${i + 1}`, capacidade: 3000, ocupacao: [2100, 1450, 2890, 600, 0][i],
    status: (['liberado', 'liberado', 'em_inventario', 'liberado', 'bloqueado'] as const)[i],
  }));

  const transferencias: Transferencia[] = Array.from({ length: 8 }, (_, i) => ({
    id: `t${i + 1}`, loteCodigo: lotes[i].codigo, quantidade: 40 + i * 10, de: locais[i % 5], para: locais[(i + 2) % 5],
    dataHora: new Date(Date.UTC(2026, 8, 10 + i, 15, 0)).toISOString(), status: i % 4 === 0 ? 'pendente' : 'aprovado',
  }));

  const volumetria: VolumetriaLote[] = lotes.map((l) => {
    const dif = l.volumeDocumentalM3 - l.volumeCalculadoM3;
    const pct = (dif / l.volumeCalculadoM3) * 100;
    return { id: `v${l.id}`, loteCodigo: l.codigo, volumeDocumentalM3: l.volumeDocumentalM3, volumeCalculadoM3: l.volumeCalculadoM3, diferencaM3: dif, diferencaPct: pct, situacao: Math.abs(pct) > 5 ? 'divergente' : 'conforme' };
  });

  const relatorios: Relatorio[] = [
    { id: 'rel1', nome: 'Posição de estoque', descricao: 'Saldos por lote, classe e categoria', formatos: ['csv', 'xlsx', 'pdf'] },
    { id: 'rel2', nome: 'Divergências de recebimento', descricao: 'Documento x conferência', formatos: ['csv', 'pdf'] },
    { id: 'rel3', nome: 'Controle volumétrico', descricao: 'Volume documental x calculado', formatos: ['xlsx', 'pdf'] },
    { id: 'rel4', nome: 'Movimentações do período', descricao: 'Entradas, saídas e transferências', formatos: ['csv', 'xlsx'] },
  ];

  const auditoria: RegistroAuditoria[] = Array.from({ length: 22 }, (_, i) => ({
    id: `a${i + 1}`, dataHora: new Date(Date.UTC(2026, 9, 1 + (i % 8), 12, (i * 11) % 60)).toISOString(), usuario: i % 2 ? 'Usuário de Demonstração' : 'Conferente 1',
    acao: ['Consulta', 'Cadastro', 'Conferência', 'Movimentação'][i % 4], entidade: ['Lote', 'Recebimento', 'Estoque', 'Inventário'][i % 4], detalhe: `Registro simulado ${i + 1}`,
  }));

  const usuarios: Usuario[] = [
    usuarioDemo,
    { id: 'u2', nome: 'Conferente 1', email: 'conferente1@exemplo.invalid', perfil: 'Conferente', permissoes: ['recebimento:registrar'], ativo: true, ultimoAcesso: '2026-10-08T17:40:00-03:00' },
    { id: 'u3', nome: 'Analista de Estoque', email: 'estoque@exemplo.invalid', perfil: 'Analista', permissoes: ['movimentacoes:registrar'], ativo: true, ultimoAcesso: '2026-10-07T09:12:00-03:00' },
    { id: 'u4', nome: 'Usuário Inativo', email: 'inativo@exemplo.invalid', perfil: 'Consulta', permissoes: [], ativo: false },
  ];

  return { usuarioDemo, fornecedores, especies, lotes, recebimentos, saldos, documentos, movimentacoes, sessoesInventario, divergenciasInventario, processamentos, locaisPatio, transferencias, volumetria, relatorios, auditoria, usuarios };
}

export type DadosSimulados = ReturnType<typeof criarDados>;
