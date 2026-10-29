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
  // Vários campos: ordenarPor=a,b&ordem=desc,asc (mesma posição).
  const ordenarPor = q.sortBy ?? q.sort?.map((s) => s.campo).join(',');
  const ordem = q.sortBy ? q.sortDir : q.sort?.map((s) => s.dir).join(',');
  return { pagina: q.page ?? 1, tamanho: q.pageSize ?? 10, busca: q.search, ordenarPor, ordem, ...(q.filters ?? {}) };
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

/** Multipart com os dados em JSON no campo `dados` e os arquivos nos campos indicados (formato provisório). */
function enviarComArquivos<T>(k: ChaveEndpoint, dados: unknown, arquivos: Record<string, File[]>, id?: string) {
  const f = new FormData();
  f.append('dados', JSON.stringify(dados));
  for (const [campo, lista] of Object.entries(arquivos)) for (const a of lista) f.append(campo, a);
  return http<T>(caminho(k, id), { metodo: 'POST', formulario: f });
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
      pendencias: () => http(caminho('dashboard.pendencias')),
    },
    fornecedores: servicoLista('fornecedores.listar'),
    documentos: servicoLista('documentos.listar'),
    notas: {
      ...servicoLista('notas.listar'),
      cadastrar: (d, xml) => enviarComArquivos('notas.cadastrar', d, { xml: xml ? [xml] : [] }),
      cadastrarDof: (nfId, d, pdf) => enviarComArquivos('notas.cadastrarDof', d, { pdf: [pdf] }, nfId),
      declararDof: (nfId) => post('notas.declararDof', undefined, nfId),
    },
    recebimentos: { ...servicoLista('recebimentos.listar'), confirmar: (d, fotos) => enviarComArquivos('recebimentos.confirmar', d, { fotos }) },
    lotes: { ...servicoLista('lotes.listar'), obter: (codigo) => http(caminho('lotes.obter', codigo)) },
    fardos: servicoLista('fardos.listar'),
    estoque: servicoLista('estoque.listar'),
    movimentacoes: {
      ...servicoLista('movimentacoes.listar'),
      registrar: (d) => post('movimentacoes.registrar', d),
      decidir: (id, d) => post('movimentacoes.decidir', d, id),
    },
    rme: {
      ...servicoLista('rme.listar'),
      abrir: (d) => post('rme.abrir', d),
      opcoesSeparacao: (id) => http(caminho('rme.opcoesSeparacao', id)),
      separar: (id, d) => post('rme.separar', d, id),
      conferir: (id, d) => post('rme.conferir', d, id),
      entregar: (id) => post('rme.entregar', undefined, id),
      cancelar: (id, motivo) => post('rme.cancelar', { motivo }, id),
    },
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
      saldoIbama: () => http(caminho('relatorios.saldoIbama')),
      dofsPendentes: () => http(caminho('relatorios.dofsPendentes')),
      movimentacoesPeriodo: (f) => http(caminho('relatorios.movimentacoes'), { query: { ...f } }),
    },
    parametros: {
      obter: () => http(caminho('parametros.obter')),
      atualizar: (d) => http(caminho('parametros.atualizar'), { metodo: 'PATCH', corpo: d }),
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
