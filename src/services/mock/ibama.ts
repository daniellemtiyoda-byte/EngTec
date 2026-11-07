import { diferencaVolumePct, foraDaTolerancia } from '../../dominio/parametros';
import type { DadosPerda, DadosSaldoDof } from '../contracts';
import type { DestinacaoFinal, Id, MotivoPerda, Perda, SaldoDofInformado, SaldoPatioEspecie } from '../../types/models';
import { tamanhoDoItem, volumeMedido } from './consultas';
import { achar, falha, instante, novoId, registrar, type Ctx, type Estado } from './estado';
import { movimentarDormentes } from './estoque';

/**
 * Prestação de contas ao IBAMA (IN Ibama 21/2014). O sistema não substitui o sistema DOF: guarda o que a CPTM precisa
 * lançar lá (destinação final das RMEs entregues) e o saldo que aparece lá, para comparar com o físico do pátio.
 */

const arredondar = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Dormentes que estão no saldo físico do pátio (entraram no saldo do DOF e ainda não saíram). Os não localizados
 * continuam nele, mostrados à parte; o perdido sai (vai para as perdas a comunicar).
 */
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
    const s = mapa.get(d.especieId) ?? { especieId: d.especieId, quantidade: 0, fisicoM3: 0, porTamanho: [], naoLocalizados: { quantidade: 0, volumeM3: 0 }, acimaTolerancia: false };
    const vol = volumeMedido(e, d);
    if (d.situacao === 'nao_localizado') { s.naoLocalizados.quantidade++; s.naoLocalizados.volumeM3 += vol; }
    s.quantidade++;
    s.fisicoM3 += vol;
    const t = s.porTamanho.find((x) => x.tamanhoId === tamanho.id);
    if (t) { t.quantidade++; t.volumeM3 += vol; } else s.porTamanho.push({ tamanhoId: tamanho.id, quantidade: 1, volumeM3: vol });
    mapa.set(d.especieId, s);
  }
  const ultimo = [...e.saldosDof].sort((a, b) => b.data.localeCompare(a.data) || b.quando.localeCompare(a.quando))[0];
  for (const i of ultimo?.itens ?? []) if (!mapa.has(i.especieId)) mapa.set(i.especieId, { especieId: i.especieId, quantidade: 0, fisicoM3: 0, porTamanho: [], naoLocalizados: { quantidade: 0, volumeM3: 0 }, acimaTolerancia: false });
  return [...mapa.values()].map((s) => {
    const informado = ultimo?.itens.find((i) => i.especieId === s.especieId);
    const fisicoM3 = arredondar(s.fisicoM3);
    const pct = informado ? diferencaVolumePct(informado.volumeM3, fisicoM3) : undefined;
    return {
      ...s, fisicoM3, porTamanho: s.porTamanho.map((t) => ({ ...t, volumeM3: arredondar(t.volumeM3) })),
      naoLocalizados: { ...s.naoLocalizados, volumeM3: arredondar(s.naoLocalizados.volumeM3) },
      informadoM3: informado?.volumeM3, informadoEm: informado ? ultimo.data : undefined,
      diferencaPct: pct === undefined ? undefined : Number.isFinite(pct) ? Math.round(pct * 10) / 10 : pct,
      acimaTolerancia: pct !== undefined && foraDaTolerancia(pct),
    };
  });
}

const MOTIVOS: MotivoPerda[] = ['extravio', 'avaria', 'incendio', 'intemperie', 'outro'];
const ROTULO_MOTIVO: Record<MotivoPerda, string> = { extravio: 'extravio', avaria: 'avaria', incendio: 'incêndio', intemperie: 'intempérie', outro: 'outro' };

/** Perdas (art. 42): só o dormente não localizado vira perdido; sai do saldo físico e fica a comunicar ao IBAMA. */
export function registrarPerda(e: Estado, dormenteId: Id, dados: DadosPerda, ctx: Ctx): Perda {
  const d = achar(e.dormentes, (x) => x.id === dormenteId, `Dormente ${dormenteId}`);
  if (d.situacao !== 'nao_localizado') falha(409, `Só um dormente não localizado pode ser registrado como perdido (o ${d.id} está "${d.situacao}").`);
  const descricao = dados.descricao?.trim();
  if (!MOTIVOS.includes(dados.motivo)) falha(422, 'Informe o motivo da perda.', { motivo: 'Motivo obrigatório.' });
  if (dados.motivo === 'outro' && !descricao) falha(422, 'Descreva o motivo da perda.', { descricao: 'Obrigatória quando o motivo é "outro".' });
  const tamanho = tamanhoDoItem(e, d.itemContratoId);
  movimentarDormentes(e, [d.id], 'perdido', { evento: { tipo: 'perdido', descricao: `Perda registrada (${ROTULO_MOTIVO[dados.motivo]})${descricao ? `: ${descricao}` : ''}`, referencia: d.fardoId } }, ctx);
  const p: Perda = {
    id: novoId(e, 'pd'), dormenteId: d.id, fardoId: d.fardoId, contratoId: d.contratoId, especieId: d.especieId, tamanhoId: tamanho.id,
    volumeM3: arredondar(tamanho.volumeM3), motivo: dados.motivo, descricao: descricao || undefined, quando: instante(ctx), quem: ctx.quem,
  };
  e.perdas.push(p);
  return p;
}

/** Marca a perda como comunicada ao órgão (uma vez só). */
export function marcarPerdaComunicada(e: Estado, id: Id, ctx: Ctx): Perda {
  const p = achar(e.perdas, (x) => x.id === id, 'Perda');
  if (p.comunicadoEm) falha(409, `Esta perda já foi comunicada ao IBAMA em ${p.comunicadoEm.slice(0, 10)}.`);
  p.comunicadoEm = instante(ctx);
  p.comunicadoPor = ctx.quem;
  registrar(e, ctx, 'dormente', p.dormenteId, 'comunicado', 'Perda comunicada ao IBAMA', p.fardoId);
  return p;
}
