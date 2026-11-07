import type { Servicos, ServicoLista } from '../contracts';
import type {
  Alerta, DofPendente, Especie, FardoDetalhe, Indicadores, InspecaoPeca, LinhaSaldoIbama, Lote, LoteDetalhe, Movimentacao, NotaFiscal,
  ParametrosNegocio, Pendencia, ProcessamentoImagem, Recebimento, RelatorioMovimentacoes, Rme, SessaoInventario, SolicitacaoExportacao,
  SugestaoFardos, Tamanho, Usuario, OpcaoSeparacao,
} from '../../types/models';
import { ApiError } from '../http';
import { auth, enviarArquivo, linhas, lista, rpc, uma } from './cliente';

/**
 * Implementação SUPABASE da interface `Servicos`: lê pelas views v_* e grava pelas funções do banco
 * (supabase/migrations). As regras de negócio valem no banco, as mesmas de services/mock.
 * Mapa view/função ↔ serviço: docs/BANCO-DE-DADOS.md.
 */
const view = <T,>(nome: string): ServicoLista<T> => ({ listar: (q) => lista<T>(nome, q) });

export function criarServicosSupabase(): Servicos {
  const nota = (id: string) => uma<NotaFiscal>('v_notas', 'id', id);
  const rme = (id: string) => uma<Rme>('v_rmes', 'id', id);
  const mov = (id: string) => uma<Movimentacao>('v_movimentacoes', 'id', id);
  const lote = (codigo: string) => rpc<LoteDetalhe>('lote_obter', { p_codigo: codigo });

  const servicos: Servicos = {
    auth: {
      entrar: async ({ usuario, senha }) => {
        const email = usuario.trim();
        if (!email.includes('@') || !senha) throw new ApiError(401, 'Entre com o e-mail cadastrado e a senha.');
        await auth.entrar(email, senha);
        try {
          return await rpc<Usuario>('meu_usuario');
        } catch (e) {
          auth.esquecer();
          throw e;
        }
      },
      usuarioAtual: async () => (auth.logado() ? rpc<Usuario>('meu_usuario') : null),
      sair: () => auth.sair(),
    },
    dashboard: {
      indicadores: async () => ({ ...(await rpc<Omit<Indicadores, 'origem'>>('ui_indicadores')), origem: 'api' as const }),
      alertas: () => rpc<Alerta[]>('ui_alertas'),
      pendencias: () => rpc<Pendencia[]>('ui_pendencias'),
    },
    fornecedores: view('v_fornecedores'),
    documentos: view('v_documentos'),
    notas: {
      ...view<NotaFiscal>('v_notas'),
      cadastrar: async (d, xml) => {
        const arquivo = xml ? await enviarArquivo('nfe-xml', xml) : null;
        return nota(await rpc<string>('nf_cadastrar', { p: d, p_xml: arquivo }));
      },
      cadastrarDof: async (nfId, d, pdf) => {
        const arquivo = await enviarArquivo('dof-pdf', pdf);
        await rpc('nf_cadastrar_dof', { p_nf: nfId, p: d, p_pdf: arquivo });
        return nota(nfId);
      },
      declararDof: async (nfId) => { await rpc('nf_declarar_dof', { p_nf: nfId }); return nota(nfId); },
    },
    recebimentos: {
      ...view<Recebimento>('v_recebimentos'),
      confirmar: async (d, fotos) => {
        const ids: string[] = [];
        for (const f of fotos) ids.push(await enviarArquivo('recebimento-fotos', f));
        const id = await rpc<string>('recebimento_confirmar', { p: d, p_fotos: ids });
        const recebimento = await uma<Recebimento>('v_recebimentos', 'id', id);
        const lotes = recebimento.lotes.length ? await linhas<Lote>('v_lotes', 'codigo', recebimento.lotes) : [];
        return { recebimento, lotes: lotes.sort((a, b) => a.codigo.localeCompare(b.codigo)) };
      },
    },
    lotes: {
      ...view<Lote>('v_lotes'),
      obter: lote,
      sugestaoFardos: (codigo) => rpc<SugestaoFardos>('lote_sugestao_fardos', { p_codigo: codigo }),
      formarFardos: async (codigo, d) => { await rpc('lote_formar_fardos', { p_codigo: codigo, p: d }); return lote(codigo); },
    },
    inspecoes: {
      ...view<InspecaoPeca>('v_inspecoes'),
      lancar: async (loteCodigo, d) => {
        const ids = (await rpc<string[]>('inspecao_lancar', { p_lote: loteCodigo, p: d })) ?? [];
        const lancadas = ids.length ? await linhas<InspecaoPeca>('v_inspecoes', 'id', ids) : [];
        return lancadas.sort((a, b) => a.sequencia - b.sequencia);
      },
    },
    fardos: { ...view('v_fardos'), obter: (codigo) => rpc<FardoDetalhe>('fardo_obter', { p_codigo: codigo }) },
    estoque: view('v_saldos'),
    dormentes: view('v_dormentes'),
    movimentacoes: {
      ...view<Movimentacao>('v_movimentacoes'),
      registrar: async (d) => mov(await rpc<string>('mov_registrar', { p: d })),
      decidir: async (id, d) => { await rpc('mov_decidir', { p_id: id, p_aprovada: d.aprovada, p_motivo: d.motivo ?? null }); return mov(id); },
    },
    rme: {
      ...view<Rme>('v_rmes'),
      abrir: async (d) => rme(await rpc<string>('rme_abrir', { p: d })),
      opcoesSeparacao: (id) => rpc<OpcaoSeparacao[]>('rme_opcoes', { p_rme: id }),
      separar: async (id, d) => { await rpc('rme_separar', { p_rme: id, p: d }); return rme(id); },
      conferir: async (id, d) => { await rpc('rme_conferir', { p_rme: id, p_aprovada: d.aprovada, p_motivo: d.motivo ?? null }); return rme(id); },
      entregar: async (id) => { await rpc('rme_entregar', { p_rme: id }); return rme(id); },
      cancelar: async (id, motivo) => { await rpc('rme_cancelar', { p_rme: id, p_motivo: motivo }); return rme(id); },
    },
    inventario: {
      ...view<SessaoInventario>('v_sessoes_inventario'),
      criarSessao: async (d) => uma<SessaoInventario>('v_sessoes_inventario', 'id', await rpc<string>('inventario_criar', { p: d })),
      registrarContagem: async (id, itens) => {
        await rpc('inventario_contagem', { p_sessao: id, p_itens: itens });
        return uma<SessaoInventario>('v_sessoes_inventario', 'id', id);
      },
      divergencias: (id, q) => lista('v_divergencias_inventario', q, { sessaoId: id }),
    },
    visao: {
      ...view<ProcessamentoImagem>('v_processamentos'),
      enviarImagem: async (arquivo) => {
        const id = await rpc<string>('visao_enviar', { p_arquivo: await enviarArquivo('visao-imagens', arquivo) });
        return uma<ProcessamentoImagem>('v_processamentos', 'id', id);
      },
    },
    patio: { ...view('v_locais_patio'), transferencias: view('v_transferencias') },
    relatorios: {
      ...view('v_relatorios'),
      solicitarExportacao: (relatorioId, formato) => rpc<SolicitacaoExportacao>('exportacao_solicitar', { p_relatorio: relatorioId, p_formato: formato }),
      saldoIbama: () => rpc<LinhaSaldoIbama[]>('rel_saldo_ibama'),
      dofsPendentes: () => rpc<DofPendente[]>('rel_dofs_pendentes'),
      movimentacoesPeriodo: (f) => rpc<RelatorioMovimentacoes>('rel_movimentacoes', { p: f }),
    },
    parametros: {
      obter: () => rpc<ParametrosNegocio>('parametros_obter'),
      atualizar: (d) => rpc<ParametrosNegocio>('parametros_atualizar', { p: d }),
    },
    auditoria: view('v_auditoria'),
    especies: {
      ...view<Especie>('v_especies'),
      atualizar: async (id, d) => { await rpc('especie_atualizar', { p_id: id, p: d }); return uma<Especie>('v_especies', 'id', id); },
    },
    tamanhos: {
      ...view<Tamanho>('v_tamanhos'),
      cadastrar: async (d) => uma<Tamanho>('v_tamanhos', 'id', await rpc<string>('tamanho_salvar', { p_id: null, p: d })),
      atualizar: async (id, d) => { await rpc('tamanho_salvar', { p_id: id, p: d }); return uma<Tamanho>('v_tamanhos', 'id', id); },
    },
    volumetria: view('v_volumetria'),
    usuarios: view('v_usuarios'),
    sistema: {
      testarConexao: async () => {
        try {
          await lista('v_tamanhos', { pageSize: 1 });
          return { ok: true, mensagem: 'O Supabase respondeu ao teste de conexão.', simulado: false };
        } catch (e) {
          return { ok: false, mensagem: e instanceof ApiError ? e.message : 'Falha na conexão.', simulado: false };
        }
      },
    },
  };
  return servicos;
}
