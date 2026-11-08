import type { Permissao } from '../../dominio/permissoes';
import type { Usuario } from '../../types/models';
import type { Servicos } from '../contracts';
import { ApiError, avisarSessaoExpirada } from '../erros';
import type { Estado } from '../mock/estado';
import { montarServicos } from '../montagem';
import { deLinhas, type Linhas } from './mapa';

/**
 * Serviços sobre o Supabase. Leitura: `exportar_estado()` (tudo o que o usuário pode ler, numa chamada) vira o mesmo
 * `Estado` do modo simulado, e as telas usam as mesmas consultas. Escrita: a função do banco de cada operação
 * (supabase/migrations/0005_operacoes.sql), que confere a permissão, valida as regras e grava numa transação só.
 * O acesso ao banco fica atrás de `Banco`: supabase-js no app, PGlite nos testes.
 */
export interface Banco {
  /** Chama uma função do banco com argumentos nomeados e devolve o JSON; erro vira ApiError (`erroDoBanco`). */
  rpc<T>(nome: string, args?: Record<string, unknown>): Promise<T>;
  /** Envia um arquivo ao bucket privado "anexos" (caminho <entidade>/<id>/<arquivo>). */
  enviar(caminho: string, arquivo: File): Promise<void>;
}

export interface OpcoesSupabase {
  banco: Banco;
  usuarioAtual: () => Promise<Usuario | null>;
  agora?: () => Date;
  /** Por quanto tempo uma leitura reaproveita o estado carregado (padrão 3 s; os testes usam 0). */
  cacheMs?: number;
}

/**
 * Erro do banco → ApiError. As funções levantam o erro de regra com o código P0<status> e o DETAIL em JSON
 * ({ status, campos }) (`falhar` em 0002); o resto (falha de rede, restrição inesperada) vira mensagem genérica.
 */
export function erroDoBanco(e: { code?: string; message?: string; details?: string | null; detail?: string | null }): ApiError {
  const m = /^P0(\d{3})$/.exec(e.code ?? '');
  if (m) {
    if (m[1] === '401') avisarSessaoExpirada();
    let campos: Record<string, string> | undefined;
    try { campos = (JSON.parse(e.details ?? e.detail ?? '{}') as { campos?: Record<string, string> | null }).campos ?? undefined; } catch { /* sem campos */ }
    return new ApiError(Number(m[1]), e.message ?? 'Operação recusada.', campos);
  }
  if (e.code === 'PGRST301' || e.code === '42501') {
    avisarSessaoExpirada();
    return new ApiError(401, 'Sessão expirada ou não autenticada. Entre novamente.');
  }
  console.error('Erro do banco:', e);
  return new ApiError(500, 'Não foi possível concluir a operação. Tente novamente.');
}

const tipoDoAnexo = (f: File) => (f.type === 'application/pdf' ? 'pdf' : /xml/.test(f.type) || f.name.toLowerCase().endsWith('.xml') ? 'xml' : 'imagem');
const nomeSeguro = (nome: string) => nome.normalize('NFD').replace(/[^\w.-]+/g, '_').slice(-80);

export function criarServicosSupabase(op: OpcoesSupabase): Servicos {
  const { banco } = op;
  const agora = op.agora ?? (() => new Date());
  const cacheMs = op.cacheMs ?? 3000;
  let carga: { quando: number; usuario: string; estado: Promise<Estado> } | null = null;

  async function sessao(): Promise<Usuario> {
    const u = await op.usuarioAtual();
    if (!u) throw new ApiError(401, 'Sessão expirada ou não autenticada. Entre novamente.');
    return u;
  }

  /** O estado do banco (o que o usuário pode ler), reaproveitado por `cacheMs` e recarregado depois de cada escrita. */
  function estado(u: Usuario): Promise<Estado> {
    if (carga && carga.usuario === u.id && Date.now() - carga.quando <= cacheMs) return carga.estado;
    const nova = banco.rpc<Linhas>('exportar_estado').then((L) => deLinhas(L, L.perfis ?? []));
    carga = { quando: Date.now(), usuario: u.id, estado: nova };
    nova.catch(() => { if (carga?.estado === nova) carga = null; });
    return nova;
  }

  return montarServicos({
    agora,
    ler: async (fn) => {
      const u = await sessao();
      return structuredClone(fn(await estado(u), u));
    },
    // A permissão é conferida pela função do banco (a tela só esconde o botão).
    escrever: async <K, T>(_p: Permissao[] | null, o: { nome: string; args: Record<string, unknown> }, _regra: unknown, resposta: (e: Estado, k: K, u: Usuario) => T) => {
      const u = await sessao();
      const k = await banco.rpc<K>(o.nome, o.args);
      carga = null;
      return structuredClone(resposta(await estado(u), k, u));
    },
    anexos: async (arquivos, pasta) => {
      const saida: Record<string, unknown> = {};
      for (const [chave, f] of Object.entries(arquivos)) {
        if (!f) continue;
        const caminho = `${pasta}/${crypto.randomUUID()}/${nomeSeguro(f.name)}`;
        await banco.enviar(caminho, f);
        saida[chave] = { nome: f.name, tipo: tipoDoAnexo(f), caminho };
      }
      return saida;
    },
    reiniciarDemonstracao: async () => {
      await sessao();
      await banco.rpc('reiniciar_demonstracao');
      carga = null;
    },
  });
}
