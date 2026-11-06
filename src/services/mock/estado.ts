import { dataSP } from '../../dominio/parametros';
import type {
  Anexo, Ata, Contrato, Dof, Dormente, EmpresaInspetora, Entrega, Especie, Evento, Fardo, Fornecedor, Id, Inspecao, ItemContrato, Local,
  Movimentacao, NotaFiscal, Parametros, Recebimento, Rme, Tamanho, Tratamento, Usuario,
} from '../../types/models';
import { ApiError } from '../http';

/*
 * Estado do mock: o que um banco guardaria. Os campos calculados dos modelos NÃO ficam aqui; `consultas.ts` os monta.
 * Todo o estado é JSON simples, para ir inteiro ao localStorage.
 */
export type FornecedorReg = Omit<Fornecedor, 'bloqueado'>;
export type TamanhoReg = Omit<Tamanho, 'volumeM3'>;
export type LocalReg = Omit<Local, 'ocupacao' | 'fardos'>;
export type ItemContratoReg = Pick<ItemContrato, 'id' | 'especieId' | 'tamanhoId' | 'tratamentoId' | 'quantidade'>;
export type ContratoReg = Omit<Contrato, 'fornecedorId' | 'itens' | 'situacao'> & { situacao: 'vigente' | 'cancelado'; itens: ItemContratoReg[] };
export type FardoReg = Omit<Fardo, 'saldo' | 'disponivel' | 'situacao' | 'idadeDias' | 'acimaLimiteDias'>;
export type DofReg = Omit<Dof, 'prazoDeclaracao' | 'diasParaPrazo' | 'nivelPrazo'>;
export type EntregaReg = Omit<Entrega, 'nfNumero' | 'fornecedorId' | 'fardosRecebidos' | 'dormentes' | 'prazoDeclaracao' | 'nivelPrazo' | 'divergenciaVolume'>;

export interface Estado {
  /** Muda quando o formato do estado muda: estado salvo de outra versão é descartado e a demonstração recomeça. */
  versao: number;
  /** Data (AAAA-MM-DD) em que a história de demonstração foi gerada; as datas da história são relativas a ela. */
  dataBase: string;
  usuarios: Usuario[];
  fornecedores: FornecedorReg[];
  especies: Especie[];
  tamanhos: TamanhoReg[];
  tratamentos: Tratamento[];
  empresasInspetoras: EmpresaInspetora[];
  locais: LocalReg[];
  atas: Ata[];
  contratos: ContratoReg[];
  fardos: FardoReg[];
  dormentes: Dormente[];
  nfs: NotaFiscal[];
  dofs: DofReg[];
  entregas: EntregaReg[];
  recebimentos: Recebimento[];
  inspecoes: Inspecao[];
  movimentacoes: Movimentacao[];
  rmes: Rme[];
  parametros: Parametros;
  /** Próximo número de cada sequência interna (ids técnicos, números de NF e DOF). */
  contadores: Record<string, number>;
}

export const VERSAO_ESTADO = 3;

/** Contexto de cada operação: o relógio (injetável, para a história e os testes serem determinísticos) e quem faz. */
export interface Ctx { agora: () => Date; quem: string }

export const instante = (ctx: Ctx) => ctx.agora().toISOString();
export const hoje = (ctx: Ctx) => dataSP(ctx.agora());

/** Id técnico sequencial com prefixo (nf0001, mv0042...). Determinístico: depende só da ordem das operações. */
export function novoId(e: Estado, prefixo: string): Id {
  const n = (e.contadores[prefixo] ?? 0) + 1;
  e.contadores[prefixo] = n;
  return `${prefixo}${String(n).padStart(4, '0')}`;
}

/** Próximo número de uma sequência que começa em `inicio` (números de NF, DOF). */
export function proximoNumero(e: Estado, nome: string, inicio: number): number {
  const n = Math.max(e.contadores[nome] ?? inicio - 1, inicio - 1) + 1;
  e.contadores[nome] = n;
  return n;
}

export const evento = (ctx: Ctx, tipo: Evento['tipo'], descricao: string, referencia?: string): Evento =>
  ({ quando: instante(ctx), quem: ctx.quem, tipo, descricao, referencia });

export function anexo(e: Estado, ctx: Ctx, arquivo: File | { name: string } | undefined, tipo: Anexo['tipo']): Anexo | undefined {
  if (!arquivo) return undefined;
  return { id: novoId(e, 'ax'), nome: arquivo.name, tipo, enviadoEm: instante(ctx), enviadoPor: ctx.quem };
}

/** Erro de regra com mensagem para a tela e, opcionalmente, erros por campo. */
export function falha(status: number, mensagem: string, campos?: Record<string, string>): never {
  throw new ApiError(status, mensagem, campos);
}

export function achar<T>(lista: T[], pred: (x: T) => boolean, oQue: string): T {
  const x = lista.find(pred);
  if (!x) falha(404, `${oQue} não encontrado.`);
  return x;
}
