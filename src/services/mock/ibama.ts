import { diferencaVolumePct, foraDaTolerancia } from '../../dominio/parametros';
import type { DadosSaldoDof } from '../contracts';
import type { DestinacaoFinal, Id, SaldoDofInformado, SaldoPatioEspecie } from '../../types/models';
import { tamanhoDoItem, volumeMedido } from './consultas';
import { achar, falha, instante, novoId, registrar, type Ctx, type Estado } from './estado';

/**
 * Prestação de contas ao IBAMA (IN Ibama 21/2014). O sistema não substitui o sistema DOF: guarda o que a CPTM precisa
 * lançar lá (destinação final das RMEs entregues) e o saldo que aparece lá, para comparar com o físico do pátio.
 */

const arredondar = (v: number) => Math.round(v * 1000) / 1000;

/** Dormentes que estão fisicamente no pátio (entraram no saldo do DOF e ainda não saíram). */
const NO_PATIO = new Set(['aguardando_inspecao', 'em_estoque', 'reservado', 'reprovado', 'nao_localizado']);

/** Na entrega da RME, uma destinação final por espécie, com o volume (medido ou, sem medidas, o do tamanho). */
export function gerarDestinacoes(e: Estado, rmeId: Id, ctx: Ctx) {
  const r = achar(e.rmes, (x) => x.id === rmeId, 'RME');
  const porEspecie = new Map<Id, { quantidade: number; volumeM3: number }>();
  for (const id of (r.separacao ?? []).flatMap((l) => l.dormentesIds)) {
    const d = achar(e.dormentes, (x) => x.id === id, 'Dormente');
    const v = porEspecie.get(d.especieId) ?? { quantidade: 0, volumeM3: 0 };
    porEspecie.set(d.especieId, { quantidade: v.quantidade + 1, volumeM3: v.volumeM3 + volumeMedido(e, d) });
  }
  for (const [especieId, v] of porEspecie) {
    e.destinacoes.push({ id: novoId(e, 'df'), rmeId: r.id, rmeNumero: r.numero, especieId, quantidade: v.quantidade, volumeM3: arredondar(v.volumeM3), entregueEm: instante(ctx) });
  }
}

/** Marca a destinação final como lançada no sistema DOF (uma vez só). */
export function marcarDestinacaoLancada(e: Estado, id: Id, ctx: Ctx): DestinacaoFinal {
  const d = achar(e.destinacoes, (x) => x.id === id, 'Destinação final');
  if (d.lancadoEm) falha(409, `Esta destinação já foi lançada no DOF em ${d.lancadoEm.slice(0, 10)}.`);
  d.lancadoEm = instante(ctx);
  d.lancadoPor = ctx.quem;
  const especie = e.especies.find((x) => x.id === d.especieId)?.nomeCientifico ?? '';
  registrar(e, ctx, 'rme', d.rmeId, 'lancado', `Destinação final lançada no DOF: ${d.volumeM3.toLocaleString('pt-BR')} m³ de ${especie}`, d.rmeNumero);
  return d;
}

/** Registra o saldo que aparece no sistema DOF, por espécie, numa data. */
export function informarSaldoDof(e: Estado, dados: DadosSaldoDof, ctx: Ctx): SaldoDofInformado {
  const erros: Record<string, string> = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dados.data ?? '')) erros.data = 'Informe a data do saldo.';
  else if (dados.data > instante(ctx).slice(0, 10)) erros.data = 'A data não pode ser futura.';
  if (!dados.itens?.length) erros.itens = 'Informe o saldo de ao menos uma espécie.';
  const vistas = new Set<Id>();
  (dados.itens ?? []).forEach((i, n) => {
    if (!e.especies.some((x) => x.id === i.especieId)) erros[`itens.${n}`] = 'Espécie inválida.';
    else if (vistas.has(i.especieId)) erros[`itens.${n}`] = 'Espécie repetida.';
    else if (!(i.volumeM3 >= 0) || !Number.isFinite(i.volumeM3)) erros[`itens.${n}`] = 'Volume inválido.';
    vistas.add(i.especieId);
  });
  if (Object.keys(erros).length) falha(422, 'Confira o saldo informado.', erros);
  const s: SaldoDofInformado = {
    id: novoId(e, 'sd'), data: dados.data, itens: dados.itens.map((i) => ({ especieId: i.especieId, volumeM3: arredondar(i.volumeM3) })),
    observacao: dados.observacao?.trim() || undefined, quem: ctx.quem, quando: instante(ctx),
  };
  e.saldosDof.push(s);
  registrar(e, ctx, 'saldo_dof', s.id, 'informado', `Saldo do DOF de ${s.data} informado (${s.itens.length} espécie(s))`);
  return s;
}

/** Saldo do pátio em m³ por espécie e tamanho, comparado com o último saldo informado do DOF (art. 41: tolerância de 10%). */
export function saldoPatio(e: Estado): SaldoPatioEspecie[] {
  const mapa = new Map<Id, SaldoPatioEspecie>();
  for (const d of e.dormentes.filter((x) => NO_PATIO.has(x.situacao))) {
    const tamanho = tamanhoDoItem(e, d.itemContratoId);
    const s = mapa.get(d.especieId) ?? { especieId: d.especieId, quantidade: 0, fisicoM3: 0, porTamanho: [], acimaTolerancia: false };
    const vol = volumeMedido(e, d);
    s.quantidade++;
    s.fisicoM3 += vol;
    const t = s.porTamanho.find((x) => x.tamanhoId === tamanho.id);
    if (t) { t.quantidade++; t.volumeM3 += vol; } else s.porTamanho.push({ tamanhoId: tamanho.id, quantidade: 1, volumeM3: vol });
    mapa.set(d.especieId, s);
  }
  const ultimo = [...e.saldosDof].sort((a, b) => b.data.localeCompare(a.data) || b.quando.localeCompare(a.quando))[0];
  for (const i of ultimo?.itens ?? []) if (!mapa.has(i.especieId)) mapa.set(i.especieId, { especieId: i.especieId, quantidade: 0, fisicoM3: 0, porTamanho: [], acimaTolerancia: false });
  return [...mapa.values()].map((s) => {
    const informado = ultimo?.itens.find((i) => i.especieId === s.especieId);
    const fisicoM3 = arredondar(s.fisicoM3);
    const pct = informado ? diferencaVolumePct(informado.volumeM3, fisicoM3) : undefined;
    return {
      ...s, fisicoM3, porTamanho: s.porTamanho.map((t) => ({ ...t, volumeM3: arredondar(t.volumeM3) })),
      informadoM3: informado?.volumeM3, informadoEm: informado ? ultimo.data : undefined,
      diferencaPct: pct === undefined ? undefined : Number.isFinite(pct) ? Math.round(pct * 10) / 10 : pct,
      acimaTolerancia: pct !== undefined && foraDaTolerancia(pct),
    };
  });
}
