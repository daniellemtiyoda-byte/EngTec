import type {
  DivergenciaInventario, Documento, Especie, Fardo, Fornecedor, ItemNf, LocalPatio, Lote, Movimentacao, NotaFiscal, ProcessamentoImagem,
  ParametrosNegocio, Recebimento, RegistroAuditoria, Relatorio, Rme, SaldoEstoque, SessaoInventario, Tamanho, Transferencia, Usuario, VolumetriaLote,
} from '../../types/models';
import { sugerirFardos } from '../../dominio/parametros';
import { chaveComDigito } from '../../utils/nfeXml';
import { receber } from './recebimento';
import { abrirRme, cancelarRme, conferirRme, entregarRme, opcoesSeparacao, separarRme } from './rme';
import { decidirMovimentacao, registrarPerdaAjuste } from './ajustes';
import { hojeSP, somarDias, volumeDormenteM3 } from './util';

// DADOS FICTÍCIOS para desenvolvimento. Nenhum valor aqui representa estoque, fornecedores ou documentos reais.
// Gerados dentro de uma função para o build com API real poder descartar este módulo inteiro.
export function criarDados() {

  const usuarioDemo: Usuario = {
    id: 'u1', nome: 'Usuário de Demonstração', email: 'demo@exemplo.invalid', perfil: 'Administrador (simulado)',
    permissoes: ['recebimento:registrar', 'movimentacoes:registrar', 'inventario:criar', 'cadastros:editar', 'nf:cadastrar', 'dof:declarar', 'movimentacoes:aprovar', 'rme:abrir', 'rme:separar', 'rme:conferir', 'visao:enviar', 'relatorios:exportar', 'admin'],
    ativo: true, ultimoAcesso: '2026-10-09T10:15:00-03:00',
  };

  // Perfis do PRD para testar o menu e as ações de cada papel: no login simulado, o usuário digitado escolhe o perfil.
  // Os nomes são os mesmos que aparecem nos registros fictícios (separação, conferência...).
  const perfisDemo: Record<string, Usuario> = {
    almoxarife: {
      id: 'u-alm', nome: 'Almoxarife 1', email: 'almoxarife@exemplo.invalid', perfil: 'Almoxarife (simulado)', ativo: true,
      permissoes: ['nf:cadastrar', 'dof:declarar', 'recebimento:registrar', 'rme:separar', 'movimentacoes:registrar', 'relatorios:exportar'],
    },
    operador: {
      id: 'u-op', nome: 'Operador de Pátio 1', email: 'operador@exemplo.invalid', perfil: 'Operador de pátio (simulado)', ativo: true,
      permissoes: ['movimentacoes:registrar', 'inventario:criar'],
    },
    supervisor: {
      id: 'u-sup', nome: 'Supervisor de Conferência 1', email: 'supervisor@exemplo.invalid', perfil: 'Supervisor de conferência (simulado)', ativo: true,
      permissoes: ['rme:conferir', 'movimentacoes:aprovar', 'relatorios:exportar'],
    },
    requisitante: {
      id: 'u-req', nome: 'Requisitante (Via Permanente)', email: 'requisitante@exemplo.invalid', perfil: 'Requisitante (simulado)', ativo: true,
      permissoes: ['rme:abrir'],
    },
    gestor: {
      id: 'u-ges', nome: 'Gestor 1', email: 'gestor@exemplo.invalid', perfil: 'Gestor (simulado)', ativo: true,
      permissoes: ['movimentacoes:aprovar', 'relatorios:exportar'],
    },
  };

  const fornecedores: Fornecedor[] = [
    { id: 'f1', razaoSocial: 'Madeireira Exemplo A Ltda.', cnpj: '00.000.000/0001-01', cidadeUf: 'Cidade A/SP', documentosVigentes: 4, status: 'aprovado' },
    { id: 'f2', razaoSocial: 'Florestal Exemplo B S.A.', cnpj: '00.000.000/0001-02', cidadeUf: 'Cidade B/MS', documentosVigentes: 3, status: 'aprovado' },
    { id: 'f3', razaoSocial: 'Reflorestadora Exemplo C Ltda.', cnpj: '00.000.000/0001-03', cidadeUf: 'Cidade C/MG', documentosVigentes: 1, status: 'pendente' },
    { id: 'f4', razaoSocial: 'Serraria Exemplo D ME', cnpj: '00.000.000/0001-04', cidadeUf: 'Cidade D/PR', documentosVigentes: 0, status: 'bloqueado' },
  ];

  // Lista de espécies da RME atual (PRD, "Dados iniciais"). Classe "a definir" fica sem valor; 19 a 21 são de AMV.
  const listaEspecies: [string, string?, string?][] = [
    ['Apuleia leiocarpa'], ['Apuleia molaris'], ['Aspidosperma polyneuron'], ['Bowdichia brasiliensis ou Bowdichia spp'],
    ['Bowdichia nitida'], ['Bowdichia racemosa'], ['Dialium guianense', '1ª', 'Classe conforme plaqueta'], ['Diplotropis purpurea'],
    ['Dipteryx odorata'], ['Dipteryx spp.'], ['Enterolobium schomburgkii'], ['Goupia glabra'], ['Hymenaea courbaril'],
    ['Hymenaea intermedia'], ['Hymenolobium petraeum ou Hymenolobium spp'], ['Mezilaurus itauba'], ['Ocotea neesiana'],
    ['Tabebuia serratifolia'], ['Angelim Vermelho', undefined, 'Promap'], ['Coimal', undefined, 'Dormentes antigos'],
    ['Veneer', undefined, 'Dormentes antigos'], ['Astronium graveolens'],
  ];
  const especies: Especie[] = listaEspecies.map(([nomeCientifico, classe, observacao], i) => ({
    id: `e${i + 1}`, numero: i + 1, nomeCientifico, classe, observacao, uso: i >= 18 && i <= 20 ? 'AMV' : 'via', lotesAtivos: 0,
  }));

  // Medidas PROVISÓRIAS (só o comprimento de 2,80 m foi visto na plaqueta); editáveis no cadastro de tamanhos.
  const tamanhos: Tamanho[] = ([['T1', 24, 17, 280], ['T2', 22, 16, 200], ['T3', 24, 17, 400]] as const).map(([codigo, l, a, c], i) => ({
    id: `t${i + 1}`, codigo, larguraCm: l, alturaCm: a, comprimentoCm: c, volumeM3: volumeDormenteM3(l, a, c), medidas: 'provisorio',
  }));

  // Parâmetros de negócio como ficam guardados no servidor. Valores PROVISÓRIOS, editáveis em Configurações.
  const parametros: ParametrosNegocio = { limiteIdadeDias: 120, alertaDofCriticoDias: 1, alertaDofAtencaoDias: 3, provisorio: true };

  const locais = ['Quadra 1 / Baia 01', 'Quadra 1 / Baia 02', 'Quadra 2 / Baia 01', 'Quadra 2 / Baia 02', 'Quadra 3 / Baia 01'];
  const dia = (n: number) => new Date(Date.UTC(2026, 5, 1 + n, 15)).toISOString();
  let seq = 0;
  const novoId = (p: string) => `${p}${++seq}`;

  const lotes: Lote[] = [];
  const fardos: Fardo[] = [];
  const saldos: SaldoEstoque[] = [];
  const volumetria: VolumetriaLote[] = [];
  const recebimentos: Recebimento[] = [];
  const movimentacoes: Movimentacao[] = [];

  // NFs fictícias: as 12 primeiras já recebidas, a 13ª com DOF aguardando recebimento e a 14ª sem DOF.
  // Desvio do volume do DOF em relação ao da NF: a 4ª passa da tolerância de 10%.
  const desvios = [0, 0.03, -0.02, 0.14, 0.05, -0.04, 0.01, 0, 0.02, -0.06, 0.04, 0, 0.02, 0];
  const notas: NotaFiscal[] = desvios.map((desvio, i) => {
    const f = fornecedores[i % 3];
    const numero = String(1000 + i);
    const emissao = dia(i * 9).slice(0, 10);
    const itens: ItemNf[] = Array.from({ length: 1 + (i % 3) }, (_, j) => {
      const e = especies[(i * 3 + j * 7) % especies.length];
      const t = tamanhos[(i + j) % tamanhos.length];
      return {
        id: `nf${i + 1}-i${j + 1}`, descricao: `Dormente de madeira ${t.codigo}`, especieId: e.id, especie: e.nomeCientifico,
        tamanhoId: t.id, tamanho: t.codigo, quantidade: 14 * (4 + ((i + j) % 6)) + (j % 2 ? 6 : 0),
      };
    });
    const xml = i % 2 === 0;
    const nf: NotaFiscal = {
      id: `nf${i + 1}`, numero, serie: '1', fornecedorId: f.id, fornecedor: f.razaoSocial, emissao, origem: xml ? 'xml' : 'manual', xmlAnexado: xml,
      chaveAcesso: xml ? chaveComDigito(`35${emissao.slice(2, 4)}${emissao.slice(5, 7)}${f.cnpj.replace(/\D/g, '')}55001${numero.padStart(9, '0')}1${String(i + 1).padStart(8, '0')}`) : undefined,
      itens, quantidadeTotal: itens.reduce((a, x) => a + x.quantidade, 0), situacao: 'aguardando_dof',
    };
    if (i < 13) {
      const porEspecie = new Map<string, number>();
      for (const it of itens) porEspecie.set(it.especieId, (porEspecie.get(it.especieId) ?? 0) + it.quantidade * (tamanhos.find((t) => t.id === it.tamanhoId)?.volumeM3 ?? 0));
      const volumes = [...porEspecie].map(([especieId, v]) => ({ especieId, especie: especies.find((e) => e.id === especieId)!.nomeCientifico, volumeM3: v * (1 + desvio) }));
      const dofNumero = String(2600100 + i);
      // As recebidas 9 a 12 seguem pendentes no Sinaflor, com prazos variados em relação a hoje (vencido, 1, 3 e 10 dias).
      const validade = i >= 8 && i < 12 ? somarDias(hojeSP(), [-3, 0, 2, 9][i - 8]) : dia(i * 9 + 10).slice(0, 10);
      nf.dof = {
        numero: dofNumero, codigoControle: `EX${String(i + 1).padStart(2, '0')}.0000.0000.0000`, validade, volumes,
        volumeTotalM3: volumes.reduce((a, v) => a + v.volumeM3, 0), arquivoPdf: `dof_${dofNumero}.pdf`,
        declaracao: i < 8 ? 'declarado' : 'pendente', prazoDeclaracao: somarDias(validade, 1),
        ...(i < 8 ? { declaradoPor: 'Almoxarife 1', declaradoEm: dia(i * 9 + 3) } : {}),
      };
      nf.situacao = 'aguardando_recebimento';
      if (xml) nf.dofSugerido = dofNumero;
    }
    return nf;
  });

  // As NFs recebidas passam pela mesma regra do serviço, que cria lotes, fardos, saldos, volumetria e movimentações.
  const base = { especies, tamanhos, lotes, fardos, saldos, volumetria, recebimentos, movimentacoes };
  notas.slice(0, 12).forEach((nf, i) => {
    const itens = nf.itens.map((it, j) => {
      const fs = sugerirFardos(it.quantidade);
      if (i === 5 && j === 0) fs[fs.length - 1] -= 3; // falta de 3 dormentes: divergência com a NF, com fotos
      return { itemId: it.id, fardos: fs };
    });
    receber(base, nf, {
      nfId: nf.id, itens, avaria: i === 8, observacao: i === 8 ? 'Dois dormentes com a ponta lascada.' : undefined,
      justificativa: i === 3 ? 'Carga conferida com o fornecedor; diferença comunicada ao órgão ambiental.' : undefined,
    }, { quando: dia(i * 9 + 2), usuario: ['Conferente 1', 'Conferente 2'][i % 2], fotos: i === 5 || i === 8 ? 2 : 0, novoId });
  });

  // Resultado simulado da inspeção dos lotes mais antigos (os das duas últimas NFs recebidas seguem aguardando).
  const ultimasNfs = new Set(notas.slice(10, 12).map((n) => n.numero));
  lotes.forEach((l, k) => {
    if (ultimasNfs.has(l.nfNumero)) return;
    const resultado = k % 7 === 3 ? 'quarentena' : k % 7 === 5 ? 'reprovado' : 'aprovado';
    l.inspecao = resultado;
    l.categoria = 1 + (k % 3);
    l.local = locais[k % locais.length];
    const s = saldos.find((x) => x.loteCodigo === l.codigo)!;
    Object.assign(s, { categoria: l.categoria, local: l.local });
    for (const f of fardos) if (f.loteCodigo === l.codigo) f.local = l.local;
    if (l.estoqueStatus === 'divergente') return; // fora da separação até ser liberado
    l.status = resultado === 'aprovado' ? 'aprovado' : 'bloqueado';
    l.estoqueStatus = resultado === 'aprovado' ? 'disponivel' : 'bloqueado';
    Object.assign(s, { emAnalise: 0, disponivel: resultado === 'aprovado' ? l.quantidade : 0, bloqueado: resultado === 'aprovado' ? 0 : l.quantidade });
  });

  for (const [i, l] of lotes.filter((x) => x.inspecao === 'aprovado').slice(0, 8).entries()) {
    movimentacoes.unshift({
      id: novoId('m'), tipo: 'transferencia', loteCodigo: l.codigo, especie: l.especieDocumental, quantidade: 14 * (1 + (i % 3)), origem: l.local, destino: locais[(i + 1) % locais.length],
      dataHora: dia(112 + i), usuario: 'Usuário de Demonstração', status: i % 4 === 0 ? 'pendente' : 'aprovado',
    });
  }

  // RMEs fictícias, uma em cada status, pela mesma regra do serviço. Grupos espécie + tamanho com saldo disponível, do mais antigo.
  const rmes: Rme[] = [];
  const baseRme = { especies, tamanhos, lotes, fardos, saldos, movimentacoes, rmes };
  const grupos = [...new Map([...lotes].reverse().filter((l) => l.estoqueStatus === 'disponivel').map((l) => [`${l.especieDocumental}|${l.tamanho}`, l]))]
    .map(([, l]) => ({ especieId: especies.find((e) => e.nomeCientifico === l.especieDocumental)!.id, tamanhoId: tamanhos.find((t) => t.codigo === l.tamanho)!.id }));
  const pessoa = { requisitante: 'Requisitante (Via Permanente)', almoxarife: 'Almoxarife 1', supervisor: 'Supervisor de Conferência 1' };
  const ctx = (n: number, usuario: string) => ({ quando: dia(n), usuario, novoId });
  const sugerida = (r: Rme) => ({ itens: opcoesSeparacao(baseRme, r).filter((o) => o.sugerido > 0).map((o) => ({ itemId: o.itemId, fardoCodigo: o.fardoCodigo, quantidade: o.sugerido })) });
  const nova = (n: number, destinatario: string, itens: [number, number][], urgencia: 'normal' | 'urgente' = 'normal', limite = n + 45) => abrirRme(baseRme, {
    destinatario, urgencia, dataLimite: dia(limite).slice(0, 10), itens: itens.map(([g, quantidade]) => ({ ...grupos[g % grupos.length], quantidade })),
  }, ctx(n, pessoa.requisitante));

  // Entregue: tira 8 de um fardo de 14, que fica aberto com saldo 6.
  const r1 = nova(118, 'Manutenção da Via Permanente – Linha 10', [[0, 8]]);
  separarRme(baseRme, r1, sugerida(r1), ctx(119, pessoa.almoxarife));
  conferirRme(r1, { aprovada: true }, ctx(119, pessoa.supervisor));
  entregarRme(baseRme, r1, ctx(120, pessoa.almoxarife));
  // Conferida, aguardando a entrega.
  const r2 = nova(124, 'Manutenção da Via Permanente – Linha 12', [[1, 20]]);
  separarRme(baseRme, r2, sugerida(r2), ctx(125, pessoa.almoxarife));
  conferirRme(r2, { aprovada: true }, ctx(125, pessoa.supervisor));
  // Em separação: a sugestão começa pelo fardo aberto da RME entregue.
  const r3 = nova(128, 'Obras – Pátio Presidente Altino', [[0, 10]], 'urgente');
  separarRme(baseRme, r3, sugerida(r3), ctx(129, pessoa.almoxarife));
  // Cancelada.
  const r4 = nova(126, 'Manutenção da Via Permanente – Linha 11', [[2, 14]]);
  cancelarRme(r4, 'Serviço reprogramado pela manutenção.', ctx(127, pessoa.requisitante));
  // Abertas: uma urgente com dois itens e uma com data limite vencida.
  nova(140, 'Manutenção da Via Permanente – Linha 13', [[2, 30], [3, 14]], 'urgente', 160);
  nova(130, 'Manutenção da Via Permanente – Linha 10', [[3, 6]], 'normal', 140);

  // Perdas e ajustes fictícios em fardos fechados fora de RME: um aprovado, dois pendentes e um rejeitado.
  const reservados = new Set(rmes.flatMap((r) => r.separacao?.itens.map((s) => s.fardoCodigo) ?? []));
  const livres = fardos.filter((f) => f.estado === 'fechado' && !reservados.has(f.codigo) && lotes.find((l) => l.codigo === f.loteCodigo)?.estoqueStatus === 'disponivel');
  const baseAjustes = { ...baseRme };
  const operador = 'Operador de Pátio 1';
  const p1 = registrarPerdaAjuste(baseAjustes, { tipo: 'perda', fardoCodigo: livres[0].codigo, quantidade: 2, motivoPerda: 'avaria', motivo: 'Dois dormentes quebrados na movimentação com a empilhadeira.' }, ctx(131, operador));
  decidirMovimentacao(baseAjustes, p1, { aprovada: true }, ctx(132, pessoa.supervisor));
  registrarPerdaAjuste(baseAjustes, { tipo: 'perda', fardoCodigo: livres[1].codigo, quantidade: 3, motivoPerda: 'intemperie', motivo: 'Dormentes rachados após temporal; aguardam vistoria.' }, ctx(141, operador));
  registrarPerdaAjuste(baseAjustes, { tipo: 'ajuste', fardoCodigo: livres[2].codigo, quantidade: 1, motivo: 'Contagem física encontrou um dormente a mais no fardo.' }, ctx(142, operador));
  const a2 = registrarPerdaAjuste(baseAjustes, { tipo: 'ajuste', fardoCodigo: livres[3].codigo, quantidade: -2, motivo: 'Contagem física com dois dormentes a menos.' }, ctx(135, operador));
  decidirMovimentacao(baseAjustes, a2, { aprovada: false, motivo: 'Recontagem confirmou o saldo do sistema.' }, ctx(136, pessoa.supervisor));

  const documentos: Documento[] = Array.from({ length: 20 }, (_, i) => {
    const l = lotes[i % lotes.length];
    return {
      id: `d${i + 1}`, tipo: (['NF-e', 'DOF', 'Romaneio', 'Laudo'] as const)[i % 4], numero: `${2000 + i}`,
      fornecedor: l.fornecedor, emissao: l.recebidoEm, quantidade: l.quantidade, volumeDocumentalM3: l.volumeDocumentalM3,
      status: (['aprovado', 'aprovado', 'pendente', 'bloqueado', 'aprovado'] as const)[i % 5],
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

  const relatorios: Relatorio[] = [
    { id: 'rel1', nome: 'Posição de estoque', descricao: 'Saldos por lote, classe e categoria', formatos: ['csv', 'xlsx', 'pdf'] },
    { id: 'rel2', nome: 'Divergências de recebimento', descricao: 'NF e DOF x conferência', formatos: ['csv', 'pdf'] },
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

  return { parametros, perfisDemo, usuarioDemo, fornecedores, especies, tamanhos, notas, lotes, fardos, rmes, recebimentos, saldos, documentos, movimentacoes, sessoesInventario, divergenciasInventario, processamentos, locaisPatio, transferencias, volumetria, relatorios, auditoria, usuarios };
}

export type DadosSimulados = ReturnType<typeof criarDados>;
