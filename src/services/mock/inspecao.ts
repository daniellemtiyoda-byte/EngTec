import { chaveGrupo as chave, ORDEM_RESULTADO as ORDEM, rotuloGrupo } from '../../dominio/inspecao';
import { sugerirFardos } from '../../dominio/parametros';
import type {
  Categoria, Dormente, Fardo, FardoSugerido, InspecaoPeca, Lote, NovaFormacaoFardos, NovaInspecaoManual, ParametrosNegocio, ResultadoPeca, SugestaoFardos,
  VereditoInspector,
} from '../../types/models';
import { ApiError } from '../http';
import { fardoLiberado, recalcularSaldo, type BaseSaldo } from './estoque';

/** O que a inspeção lê e altera nos dados simulados. */
export interface BaseInspecao extends BaseSaldo {
  inspecoes: InspecaoPeca[];
  parametros: ParametrosNegocio;
}

/** Divide as peças de um grupo em fardos, na ordem da sequência, com as quantidades da sugestão (até 14). */
function distribuir(g: FardoSugerido): FardoSugerido[] {
  let i = 0;
  return sugerirFardos(g.dormentes.length).map((q) => {
    const dormentes = g.dormentes.slice(i, i + q);
    i += q;
    return { ...g, quantidade: q, dormentes };
  });
}

interface Contexto {
  quando: string;
  usuario: string;
  novoId: (prefixo: string) => string;
}

/** Mapeamento PROVISÓRIO do veredito do Inspector para o resultado do PRD (a confirmar com o grupo). */
export const resultadoDoVeredito = (v: VereditoInspector): ResultadoPeca => ({ APROVADO: 'aprovado', ATENCAO: 'quarentena', REJEITADO: 'reprovado' } as const)[v];

/** Categoria pelo índice 0–100 do Inspector, com os limites guardados no servidor (provisórios). */
export const categoriaDoIndice = (indice: number, p: ParametrosNegocio): Categoria =>
  indice >= p.categoria1IndiceMin ? 1 : indice >= p.categoria2IndiceMin ? 2 : 3;

/** Código da peça no Inspector: lote + sequência, ex. LT26-0042-0007. */
export const codigoPeca = (loteCodigo: string, sequencia: number) => `${loteCodigo}-${String(sequencia).padStart(4, '0')}`;
const PECA = /^(LT\d{2}-\d{4})-(\d{4})$/i;

function acharLote(B: BaseInspecao, codigo: string) {
  const l = B.lotes.find((x) => x.codigo.toLowerCase() === codigo.trim().toLowerCase());
  if (!l) throw new ApiError(404, `Lote ${codigo} não encontrado.`);
  return l;
}

function exigirAberta(l: Lote) {
  if (l.etapaInspecao === 'concluida') throw new ApiError(409, `A inspeção do lote ${l.codigo} já foi concluída e os fardos já foram formados.`);
}

/** Registra a peça (vale a inspeção mais recente: a anterior fica no histórico) e marca o lote como em inspeção. */
function registrar(B: BaseInspecao, l: Lote, p: Omit<InspecaoPeca, 'vigente' | 'codigoPeca' | 'loteCodigo'>) {
  for (const x of B.inspecoes) if (x.loteCodigo === l.codigo && x.sequencia === p.sequencia) x.vigente = false;
  const peca: InspecaoPeca = { ...p, codigoPeca: codigoPeca(l.codigo, p.sequencia), loteCodigo: l.codigo, vigente: true };
  B.inspecoes.unshift(peca);
  l.etapaInspecao = 'em_inspecao';
  return peca;
}

/**
 * Inspeção vinda do Inspector. No modo real é o servidor que faz isto ao ler o banco do Inspector
 * (ver docs/INTEGRACAO-INSPECAO.md); aqui serve para gerar os dados iniciais pela mesma regra.
 */
export function receberDoInspector(
  B: BaseInspecao,
  d: { codigoPeca: string; veredito: VereditoInspector; indice: number; inspetor: string; estacao?: string; quando: string },
  novoId: (prefixo: string) => string,
) {
  const m = PECA.exec(d.codigoPeca.trim());
  if (!m) throw new ApiError(422, `Código de peça fora do padrão: ${d.codigoPeca}.`);
  const l = acharLote(B, m[1]);
  exigirAberta(l);
  const id = novoId('ip');
  return registrar(B, l, {
    id, sequencia: Number(m[2]), resultado: resultadoDoVeredito(d.veredito), veredito: d.veredito, indice: d.indice,
    categoria: categoriaDoIndice(d.indice, B.parametros), inspetor: d.inspetor, estacao: d.estacao, inspecionadoEm: d.quando,
    relatorioUrl: `https://inspecao.exemplo.invalid/relatorios/${id}.pdf`, origem: 'inspector',
  });
}

export const vigentes = (B: BaseInspecao, loteCodigo: string) => B.inspecoes.filter((x) => x.loteCodigo === loteCodigo && x.vigente);

/** RF06 sem o Inspector: N peças com o mesmo resultado, nas primeiras posições do lote ainda sem resultado. */
export function lancarManual(B: BaseInspecao, loteCodigo: string, n: NovaInspecaoManual, ctx: Contexto) {
  const l = acharLote(B, loteCodigo);
  exigirAberta(l);
  if (!ORDEM.includes(n.resultado)) throw new ApiError(422, 'Resultado inválido.', { resultado: 'Escolha o resultado.' });
  if (n.resultado === 'aprovado' && (!Number.isInteger(n.categoria) || n.categoria! < 1)) throw new ApiError(422, 'Peça aprovada precisa de categoria.', { categoria: 'Escolha a categoria.' });
  const feitas = new Set(vigentes(B, l.codigo).map((x) => x.sequencia));
  const livres = Array.from({ length: l.quantidade }, (_, i) => i + 1).filter((s) => !feitas.has(s));
  if (!Number.isInteger(n.quantidade) || n.quantidade < 1) throw new ApiError(422, 'Quantidade inválida.', { quantidade: 'Inteiro, mínimo 1.' });
  if (n.quantidade > livres.length) throw new ApiError(422, `Só restam ${livres.length} peça(s) sem resultado neste lote.`, { quantidade: `Máximo ${livres.length}.` });
  return livres.slice(0, n.quantidade).map((sequencia) => registrar(B, l, {
    id: ctx.novoId('ip'), sequencia, resultado: n.resultado, categoria: n.resultado === 'aprovado' ? n.categoria : undefined,
    inspetor: ctx.usuario, inspecionadoEm: ctx.quando, origem: 'manual',
  }));
}

export function sugestaoFardos(B: BaseInspecao, loteCodigo: string): SugestaoFardos {
  const l = acharLote(B, loteCodigo);
  const pecas = vigentes(B, l.codigo);
  const dentro = pecas.filter((p) => p.sequencia <= l.quantidade);
  const grupos = new Map<string, FardoSugerido>();
  for (const p of [...dentro].sort((a, b) => a.sequencia - b.sequencia)) {
    const g: FardoSugerido = { resultado: p.resultado, categoria: p.resultado === 'aprovado' ? p.categoria : undefined, quantidade: 0, dormentes: [] };
    const k = chave(g);
    const x = grupos.get(k) ?? grupos.set(k, g).get(k)!;
    x.quantidade += 1;
    x.dormentes.push(p.codigoPeca);
  }
  const lista = [...grupos.values()].sort((a, b) => ORDEM.indexOf(a.resultado) - ORDEM.indexOf(b.resultado) || (a.categoria ?? 0) - (b.categoria ?? 0));
  return {
    loteCodigo: l.codigo, quantidadeLote: l.quantidade, pecasInspecionadas: dentro.length, semResultado: l.quantidade - dentro.length,
    excedentes: pecas.length - dentro.length, grupos: lista,
    fardos: lista.flatMap(distribuir),
  };
}

/**
 * Conclusão da inspeção: forma os fardos confirmados pelo almoxarife. Cada peça inspecionada vai em exatamente um fardo
 * do seu grupo (resultado e categoria) e nenhuma unidade fica sem resultado. Cria um dormente por peça, ligado ao fardo.
 * O saldo do lote não muda: as unidades só passam a estar em fardos, liberados (aprovados) ou segregados.
 */
export function formarFardos(B: BaseInspecao & { dormentes: Dormente[] }, loteCodigo: string, n: NovaFormacaoFardos, ctx: Contexto): Fardo[] {
  const l = acharLote(B, loteCodigo);
  exigirAberta(l);
  const s = sugestaoFardos(B, l.codigo);
  if (s.excedentes > 0) throw new ApiError(409, `Há ${s.excedentes} inspeção(ões) com sequência acima da quantidade do lote: confira os códigos das peças no Inspector.`);
  if (s.semResultado > 0) throw new ApiError(409, `Faltam ${s.semResultado} unidade(s) sem resultado. Aguarde o Inspector ou lance o resultado manualmente.`);

  const erros: Record<string, string> = {};
  if (!n.fardos.length) erros.fardos = 'Informe os fardos.';
  if (n.fardos.some((f) => !f.dormentes?.length)) erros.fardos = 'Cada fardo precisa ter ao menos 1 dormente.';
  // Cada peça do grupo em exatamente um fardo do mesmo grupo.
  const usados = new Map<string, number>();
  for (const f of n.fardos) for (const d of f.dormentes ?? []) usados.set(d, (usados.get(d) ?? 0) + 1);
  for (const g of s.grupos) {
    const noGrupo = new Set(n.fardos.filter((f) => chave(f) === chave(g)).flatMap((f) => f.dormentes ?? []));
    const faltam = g.dormentes.filter((d) => !noGrupo.has(d));
    if (faltam.length) erros.fardos = `${rotuloGrupo(g)}: ${faltam.length} peça(s) fora dos fardos (ex.: ${faltam[0]}).`;
    const alheias = [...noGrupo].filter((d) => !g.dormentes.includes(d));
    if (alheias.length) erros.fardos = `${rotuloGrupo(g)}: a peça ${alheias[0]} não é deste grupo.`;
  }
  const repetida = [...usados].find(([, v]) => v > 1);
  if (repetida) erros.fardos = `A peça ${repetida[0]} está em mais de um fardo.`;
  if (n.fardos.some((f) => !s.grupos.some((g) => chave(g) === chave(f)))) erros.fardos = 'Há fardo de um resultado ou categoria que não existe nas inspeções.';
  if (!n.local.trim()) erros.local = 'Informe onde os fardos foram montados.';
  const divergente = n.fardos.some((f) => f.divergente);
  if (divergente && !n.motivoDivergencia?.trim()) erros.motivoDivergencia = 'Descreva a divergência de espécie ou tamanho.';
  if (Object.keys(erros).length) throw new ApiError(422, 'Confira os fardos.', erros);

  const local = n.local.trim();
  const fardos: Fardo[] = n.fardos.map((f, i) => ({
    id: ctx.novoId('fd'), codigo: `${l.codigo}-F${String(i + 1).padStart(2, '0')}`, loteCodigo: l.codigo, sequencia: i + 1,
    quantidadeInicial: f.dormentes.length, saldo: f.dormentes.length, estado: 'fechado', local,
    resultado: f.resultado, categoria: f.resultado === 'aprovado' ? f.categoria : undefined,
    motivoBloqueio: f.divergente ? `Espécie/tamanho divergente: ${n.motivoDivergencia!.trim()}` : undefined,
    formadoEm: ctx.quando, formadoPor: ctx.usuario,
  }));
  B.fardos.unshift(...fardos);
  const vig = new Map(vigentes(B, l.codigo).map((x) => [x.codigoPeca, x]));
  n.fardos.forEach((f, i) => {
    for (const codigo of f.dormentes) {
      const p = vig.get(codigo)!;
      B.dormentes.push({
        id: ctx.novoId('dm'), codigo, loteCodigo: l.codigo, sequencia: p.sequencia, fardoCodigo: fardos[i].codigo,
        resultado: p.resultado, categoria: p.categoria, estado: 'em_estoque',
      });
    }
  });

  // Resumo do lote: aprovado se algum fardo saiu liberado; a categoria do lote é a que tem mais peças aprovadas.
  const liberados = fardos.filter(fardoLiberado);
  const porCategoria = new Map<number, number>();
  for (const f of liberados) if (f.categoria) porCategoria.set(f.categoria, (porCategoria.get(f.categoria) ?? 0) + f.quantidadeInicial);
  Object.assign(l, {
    fardos: fardos.length, unidadesSemFardo: 0, etapaInspecao: 'concluida', local, inspecaoConcluidaEm: ctx.quando, inspecaoConcluidaPor: ctx.usuario,
    inspecao: liberados.length ? 'aprovado' : fardos.some((f) => f.resultado === 'quarentena') ? 'quarentena' : 'reprovado',
    categoria: [...porCategoria].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0],
  });
  if (l.estoqueStatus !== 'divergente') {
    l.estoqueStatus = liberados.length ? 'disponivel' : 'bloqueado';
    l.status = liberados.length ? 'aprovado' : 'bloqueado';
  }
  recalcularSaldo(B, l);
  return fardos;
}
