import { dataSP } from '../../dominio/parametros';
import type { Permissao } from '../../dominio/permissoes';
import type { Usuario } from '../../types/models';
import { autenticacao } from '../auth';
import type { Servicos } from '../contracts';
import { ApiError } from '../erros';
import { ataView, contratoView, dofView, emissaoView, entregaView, fardoDetalhe, fornecedorView, localView, saldoPorItem } from './consultas';
import { criarDados } from './data';
import { type Estado } from './estado';
import { armazenamentoPadrao, carregar, salvar, type Armazenamento } from './persistencia';
import { simularRede } from './util';
import { montarServicos } from '../montagem';

export interface OpcoesMock {
  /** Quem está logado (padrão: o login simulado). */
  usuarioAtual?: () => Promise<Usuario | null>;
  /** Relógio (padrão: agora). Os testes fixam a data. */
  agora?: () => Date;
  /** Onde guardar o estado (padrão: localStorage; null = só memória). */
  armazenamento?: Armazenamento | null;
  /** Espera de rede simulada em ms (padrão 250; testes usam 0). */
  atrasoMs?: number;
}

/**
 * Serviços simulados: o motor do mock para `montarServicos` (../montagem.ts). Regras em um módulo por assunto
 * (cadastros, simulador, documentos, recebimento, inspeção, estoque, rme, painel) e campos calculados em consultas.ts.
 * Aqui só a ligação: sessão e permissões (como as funções do banco fazem), escrita atômica e persistência.
 */
/** Monta as visões que as telas usam; lança erro se algum registro salvo não serve mais (campo ou data inválidos). */
function conferirVisoes(e: Estado, hoje: string) {
  for (const x of e.fornecedores) fornecedorView(x, hoje);
  for (const x of e.atas) ataView(e, x, hoje);
  for (const x of e.contratos) contratoView(e, x, hoje);
  for (const x of e.fardos) fardoDetalhe(e, x.id, hoje);
  for (const d of e.dormentes) if (!d.dataTratamento || Number.isNaN(Date.parse(d.dataTratamento))) throw new Error('dormente sem marcação');
  for (const x of e.locais) localView(e, x, hoje);
  for (const x of e.dofs) dofView(e, x, hoje);
  for (const x of e.entregas) entregaView(e, x, hoje);
  for (const x of e.emissoes) emissaoView(e, x);
  for (const s of saldoPorItem(e, hoje)) if (s.liberacaoCura) new Date(s.liberacaoCura).toISOString();
  for (const x of [...e.rmes, ...e.fardos.filter((f) => f.recebidoEm)]) new Date('criadoEm' in x ? x.criadoEm : x.recebidoEm!).toISOString();
}

export function criarServicosSimulados(op: OpcoesMock = {}): Servicos {
  const agora = op.agora ?? (() => new Date());
  const armazenamento = op.armazenamento === undefined ? armazenamentoPadrao() : op.armazenamento;
  const usuarioAtual = op.usuarioAtual ?? (() => autenticacao.usuarioAtual());
  const atraso = op.atrasoMs ?? 250;
  const dia = () => dataSP(agora());

  // Estado salvo de outra versão, de formato diferente ou que não monta as visões das telas é descartado: a demonstração
  // é recriada e nenhuma tela quebra por dado antigo guardado no navegador.
  const novo = criarDados(agora());
  let estado: Estado = carregar(armazenamento, novo, (e) => conferirVisoes(e, dia())) ?? novo;
  salvar(armazenamento, estado);

  async function sessao(permissoes?: Permissao[]): Promise<Usuario> {
    await simularRede(atraso);
    const u = await usuarioAtual();
    if (!u) throw new ApiError(401, 'Sessão expirada ou não autenticada. Entre novamente.');
    if (permissoes && !permissoes.some((p) => u.permissoes.includes(p))) throw new ApiError(403, 'Você não tem permissão para executar esta operação.');
    return u;
  }

  return montarServicos({
    agora,
    /** Leitura: o resultado sai como cópia, para a tela nunca alterar o estado por engano. */
    ler: async (fn) => {
      const u = await sessao();
      return structuredClone(fn(estado, u));
    },
    /** Escrita atômica: a regra roda numa cópia do estado, que só substitui o original se terminar sem erro. */
    escrever: async (permissoes, _op, regra, resposta) => {
      const u = await sessao(permissoes ?? undefined);
      const copia = structuredClone(estado);
      const k = regra(copia, { agora, quem: u.nome }, u);
      estado = copia;
      salvar(armazenamento, estado);
      return structuredClone(resposta(estado, k, u));
    },
    // No mock, a regra usa o próprio arquivo (só o nome é guardado).
    anexos: async () => ({}),
    reiniciarDemonstracao: async () => {
      await sessao(['admin']);
      estado = criarDados(agora());
      salvar(armazenamento, estado);
    },
  });
}
