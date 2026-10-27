import type { ListQuery, Paginado } from '../../types/models';
import type { Servicos, ServicoLista } from '../contracts';
import { ENDPOINTS, type ChaveEndpoint } from '../endpoints';
import { ApiError, http } from '../http';

/**
 * Implementação REAL (HTTP). Os caminhos vêm de endpoints.ts e são PROVISÓRIOS.
 * Ao receber a documentação do back-end, ajuste endpoints.ts e, se os formatos divergirem, `consulta`/`lista` abaixo.
 */
const caminho = (k: ChaveEndpoint, id?: string) => ENDPOINTS[k].caminho.replace('{id}', encodeURIComponent(id ?? ''));

function consulta(q: ListQuery = {}) {
  // Nomes de parâmetros provisórios (pendentes de confirmação com o back-end).
  return { pagina: q.page ?? 1, tamanho: q.pageSize ?? 10, busca: q.search, ordenarPor: q.sortBy, ordem: q.sortDir, ...(q.filters ?? {}) };
}

async function lista<T>(k: ChaveEndpoint, q?: ListQuery, id?: string): Promise<Paginado<T>> {
  const r = await http<{ items?: T[]; total?: number; page?: number; pageSize?: number }>(caminho(k, id), { query: consulta(q) });
  if (!r || !Array.isArray(r.items)) throw new ApiError(200, 'Resposta inesperada do servidor.');
  return { items: r.items, total: r.total ?? r.items.length, page: r.page ?? q?.page ?? 1, pageSize: r.pageSize ?? q?.pageSize ?? 10, origem: 'api' };
}

const servicoLista = <T,>(k: ChaveEndpoint): ServicoLista<T> => ({ listar: (q) => lista<T>(k, q) });
const post = <T,>(k: ChaveEndpoint, corpo?: unknown, id?: string) => http<T>(caminho(k, id), { metodo: 'POST', corpo });
const patch = <T,>(k: ChaveEndpoint, id: string, corpo: unknown) => http<T>(caminho(k, id), { metodo: 'PATCH', corpo });

function enviarArquivo<T>(k: ChaveEndpoint, arquivo: File) {
  const f = new FormData();
  f.append('arquivo', arquivo);
  return http<T>(caminho(k), { metodo: 'POST', formulario: f });
}

export function criarServicosReais(): Servicos {
  return {
    auth: {
      entrar: (c) => post('auth.entrar', c),
      usuarioAtual: async () => {
        try { return await http(caminho('auth.usuarioAtual')); }
        catch (e) { if (e instanceof ApiError && e.status === 401) return null; throw e; }
      },
      sair: () => post('auth.sair'),
    },
    dashboard: {
      indicadores: async () => ({ ...(await http<any>(caminho('dashboard.indicadores'))), origem: 'api' as const }),
      alertas: () => http(caminho('dashboard.alertas')),
    },
    fornecedores: servicoLista('fornecedores.listar'),
    documentos: { ...servicoLista('documentos.listar'), importar: (a) => enviarArquivo('documentos.importar', a) },
    recebimentos: { ...servicoLista('recebimentos.listar'), registrarConferencia: (d) => post('recebimentos.registrar', d) },
    lotes: { ...servicoLista('lotes.listar'), cadastrar: (d) => post('lotes.cadastrar', d) },
    estoque: servicoLista('estoque.listar'),
    movimentacoes: { ...servicoLista('movimentacoes.listar'), registrar: (d) => post('movimentacoes.registrar', d) },
    inventario: {
      ...servicoLista('inventario.listar'),
      criarSessao: (d) => post('inventario.criarSessao', d),
      registrarContagem: (id, itens) => post('inventario.registrarContagem', { itens }, id),
      divergencias: (id, q) => lista('inventario.divergencias', q, id),
    },
    visao: { ...servicoLista('visao.listar'), enviarImagem: (a) => enviarArquivo('visao.enviarImagem', a) },
    patio: { ...servicoLista('patio.listar'), transferencias: servicoLista('patio.transferencias') },
    relatorios: {
      ...servicoLista('relatorios.listar'),
      solicitarExportacao: (id, formato) => post('relatorios.exportar', { formato }, id),
    },
    auditoria: servicoLista('auditoria.listar'),
    especies: { ...servicoLista('especies.listar'), atualizar: (id, d) => patch('especies.atualizar', id, d) },
    tamanhos: {
      ...servicoLista('tamanhos.listar'),
      cadastrar: (d) => post('tamanhos.cadastrar', d),
      atualizar: (id, d) => patch('tamanhos.atualizar', id, d),
    },
    volumetria: servicoLista('volumetria.listar'),
    usuarios: servicoLista('usuarios.listar'),
    sistema: {
      testarConexao: async () => {
        try {
          await http(caminho('sistema.saude'));
          return { ok: true, mensagem: 'Servidor respondeu ao teste de conexão.', simulado: false };
        } catch (e) {
          return { ok: false, mensagem: e instanceof ApiError ? e.message : 'Falha na conexão.', simulado: false };
        }
      },
    },
  };
}
