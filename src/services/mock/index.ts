import type { Servicos } from '../contracts';
import type { Documento, Indicadores, Lote, Movimentacao, ProcessamentoImagem, Recebimento, SessaoInventario, Usuario } from '../../types/models';
import { ApiError } from '../http';
import * as D from './data';
import { atraso, paginar, simularRede } from './util';

let sessao: Usuario | null = null; // apenas em memória: nada de credenciais no armazenamento do navegador
let seq = 1000;
const novoId = (p: string) => `${p}${++seq}`;

export function criarServicosSimulados(): Servicos {
  return {
    auth: {
      entrar: async ({ usuario, senha }) => {
        await atraso(500);
        if (!usuario.trim() || !senha) throw new ApiError(401, 'Usuário ou senha inválidos.');
        sessao = D.usuarioDemo;
        return sessao;
      },
      usuarioAtual: async () => { await atraso(150); return sessao; },
      sair: async () => { await atraso(150); sessao = null; },
    },
    dashboard: {
      indicadores: async (): Promise<Indicadores> => {
        await simularRede();
        const s = D.saldos;
        const soma = (f: (x: (typeof s)[number]) => number) => s.reduce((a, x) => a + f(x), 0);
        const porClasse = (c: 'primeira' | 'segunda') => D.saldos.filter((x) => x.classe === c).reduce((a, x) => a + x.disponivel, 0);
        const meses = ['Jun', 'Jul', 'Ago', 'Set', 'Out'];
        return {
          disponivel: soma((x) => x.disponivel), bloqueado: soma((x) => x.bloqueado), emAnalise: soma((x) => x.emAnalise), divergente: soma((x) => x.divergente),
          metrosLineares: soma((x) => x.metrosLineares), volumeDocumentalM3: D.lotes.reduce((a, l) => a + l.volumeDocumentalM3, 0), volumeCalculadoM3: soma((x) => x.volumeM3),
          recebimentosPendentes: D.recebimentos.filter((r) => r.status === 'pendente').length,
          inventariosAbertos: D.sessoesInventario.filter((x) => x.estado !== 'aprovado' && x.estado !== 'rejeitado').length,
          recebimentosPorMes: meses.map((m, i) => ({ rotulo: m, valor: [4, 6, 5, 7, 3][i] })),
          estoquePorClasse: [{ rotulo: '1ª classe', valor: porClasse('primeira') }, { rotulo: '2ª classe', valor: porClasse('segunda') }],
          origem: 'simulado',
        };
      },
      alertas: async () => {
        await atraso(250);
        return [
          { id: 'al1', nivel: 'critico' as const, titulo: 'Divergência volumétrica acima de 5%', descricao: 'Lotes com volume documental diferente do calculado.', link: '/volumetria' },
          { id: 'al2', nivel: 'atencao' as const, titulo: 'Recebimentos aguardando aprovação', descricao: 'Conferências pendentes de decisão.', link: '/recebimento' },
          { id: 'al3', nivel: 'atencao' as const, titulo: 'Ajuste de inventário pendente de aprovação', descricao: 'O saldo oficial só muda após a aprovação.', link: '/inventario' },
          { id: 'al4', nivel: 'info' as const, titulo: 'Dados simulados em uso', descricao: 'Esta instalação está em modo de demonstração.', link: '/configuracoes' },
        ];
      },
    },
    fornecedores: { listar: (q) => paginar(D.fornecedores, q) },
    documentos: {
      listar: (q) => paginar(D.documentos, q),
      importar: async (arquivo) => {
        await atraso(700);
        const d: Documento = { id: novoId('d'), tipo: 'NF-e', numero: arquivo.name.slice(0, 20), fornecedor: '(a identificar na importação)', emissao: new Date().toISOString(), quantidade: 0, volumeDocumentalM3: 0, status: 'pendente' };
        D.documentos.unshift(d);
        return d;
      },
    },
    recebimentos: {
      listar: (q) => paginar(D.recebimentos, q),
      registrarConferencia: async (c) => {
        await atraso(600);
        const lote = D.lotes.find((l) => l.codigo.toLowerCase() === c.loteCodigo.trim().toLowerCase());
        if (!lote) throw new ApiError(404, 'Lote não encontrado.', { loteCodigo: 'Lote inexistente.' });
        const r: Recebimento = {
          id: novoId('r'), loteCodigo: lote.codigo, fornecedor: lote.fornecedor, documento: c.documentoNumero, recebidoEm: new Date().toISOString(),
          quantidadeDocumental: lote.quantidade, quantidadeConferida: c.quantidadeConferida, divergencia: c.quantidadeConferida - lote.quantidade,
          metrosLinearesDocumentais: lote.metrosLineares, metrosLinearesConferidos: c.quantidadeConferida * lote.comprimentoM, status: 'pendente', conferente: D.usuarioDemo.nome,
        };
        D.recebimentos.unshift(r);
        return r;
      },
    },
    lotes: {
      listar: (q) => paginar(D.lotes, q),
      cadastrar: async (n) => {
        await atraso(600);
        if (D.lotes.some((l) => l.codigo === n.codigo)) throw new ApiError(409, 'Já existe um lote com este código.', { codigo: 'Código já utilizado.' });
        const f = D.fornecedores.find((x) => x.id === n.fornecedorId);
        const e = D.especies.find((x) => x.id === n.especieId);
        const calc = n.quantidade * n.comprimentoM * n.larguraM * n.espessuraM;
        const l: Lote = {
          id: novoId('l'), codigo: n.codigo, fornecedor: f?.razaoSocial ?? '—', especieDocumental: e?.nomePopular ?? '—', classe: n.classe, categoria: n.categoria,
          quantidade: n.quantidade, comprimentoM: n.comprimentoM, larguraM: n.larguraM, espessuraM: n.espessuraM, metrosLineares: n.quantidade * n.comprimentoM,
          volumeDocumentalM3: 0, volumeCalculadoM3: calc, recebidoEm: new Date().toISOString(), status: 'pendente', estoqueStatus: 'em_analise', local: 'A definir',
        };
        D.lotes.unshift(l);
        return l;
      },
    },
    estoque: { listar: (q) => paginar(D.saldos, q) },
    movimentacoes: {
      listar: (q) => paginar(D.movimentacoes, q),
      registrar: async (n) => {
        await atraso(600);
        const lote = D.lotes.find((l) => l.codigo.toLowerCase() === n.loteCodigo.trim().toLowerCase());
        if (!lote) throw new ApiError(404, 'Lote não encontrado.', { loteCodigo: 'Lote inexistente.' });
        if (lote.estoqueStatus === 'bloqueado') throw new ApiError(409, 'Lote bloqueado: movimentação não permitida.');
        const m: Movimentacao = { id: novoId('m'), tipo: n.tipo, loteCodigo: lote.codigo, quantidade: n.quantidade, origem: n.origem || '—', destino: n.destino || '—', dataHora: new Date().toISOString(), usuario: D.usuarioDemo.nome, status: 'pendente' };
        D.movimentacoes.unshift(m);
        return m;
      },
    },
    inventario: {
      listar: (q) => paginar(D.sessoesInventario, q),
      criarSessao: async (d) => {
        await atraso(500);
        const s: SessaoInventario = { id: novoId('i'), descricao: d.descricao, local: d.local, abertaEm: new Date().toISOString(), estado: 'em_contagem', itensContados: 0, divergencias: 0, ajuste: 'nao_aplicavel' };
        D.sessoesInventario.unshift(s);
        return s;
      },
      registrarContagem: async (id, itens) => {
        await atraso(500);
        const s = D.sessoesInventario.find((x) => x.id === id);
        if (!s) throw new ApiError(404, 'Sessão não encontrada.');
        s.itensContados += itens.length;
        return s;
      },
      divergencias: (id, q) => paginar(D.divergenciasInventario.filter((x) => x.sessaoId === id), q),
    },
    visao: {
      listar: (q) => paginar(D.processamentos, q),
      enviarImagem: async (arquivo) => {
        await atraso(700);
        const p: ProcessamentoImagem = { id: novoId('p'), arquivo: arquivo.name.slice(0, 60), enviadoEm: new Date().toISOString(), estado: 'na_fila', revisao: 'nao_aplicavel' };
        D.processamentos.unshift(p);
        return p;
      },
    },
    patio: { listar: (q) => paginar(D.locaisPatio, q), transferencias: { listar: (q) => paginar(D.transferencias, q) } },
    relatorios: {
      listar: (q) => paginar(D.relatorios, q),
      solicitarExportacao: async (relatorioId, formato) => { await atraso(500); return { id: novoId('x'), relatorioId, formato, estado: 'solicitada' as const }; },
    },
    auditoria: { listar: (q) => paginar(D.auditoria, q) },
    especies: { listar: (q) => paginar(D.especies, q) },
    volumetria: { listar: (q) => paginar(D.volumetria, q) },
    usuarios: { listar: (q) => paginar(D.usuarios, q) },
    sistema: { testarConexao: async () => { await atraso(300); return { ok: true, mensagem: 'Modo simulado: nenhuma conexão real foi testada.', simulado: true }; } },
  };
}
