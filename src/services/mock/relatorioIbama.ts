import { TOLERANCIA_FECHAMENTO_M3, diasEntre, somarDias } from '../../dominio/parametros';
import type { BalancoEspecie, BalancoIbama, DestinacaoFinal, Id, RecebimentoDof, SituacaoRecebimentoDof } from '../../types/models';
import { divergenciaVolume, dormentesDoFardo, tamanhoDoItem, volumeMedido } from './consultas';
import type { Estado } from './estado';
import { saldoPatio } from './ibama';

/**
 * Leituras dos Relatórios do IBAMA (IN Ibama 21/2014) calculadas sobre o estado, sem gravar nada e sem tabela nova:
 * valem para o mock e para o Supabase (as duas fontes montam as leituras sobre o mesmo `Estado`).
 */

const arredondar = (v: number) => Math.round(v * 1000) / 1000;
const dia = (instante?: string) => (instante ?? '').slice(0, 10);

/** Recebimentos de DOF (art. 51): uma linha por DOF e espécie. Vencidas e pendentes primeiro (as mais atrasadas antes). */
export function recebimentosDof(e: Estado, hoje: string, de?: string, ate?: string): RecebimentoDof[] {
  const linhas: RecebimentoDof[] = [];
  for (const dof of e.dofs) {
    const nf = e.nfs.find((n) => n.id === dof.nfId);
    const entrega = nf && e.entregas.find((x) => x.id === nf.entregaId);
    if (!nf || !entrega) continue;
    const fardos = e.fardos.filter((f) => entrega.fardosIds.includes(f.id));
    const recebidaEm = e.recebimentos.filter((r) => r.entregaId === entrega.id).map((r) => r.recebidoEm).sort()[0];
    // Data de referência do período: o recebimento (a emissão da NF, se a entrega ainda não chegou).
    const ref = dia(recebidaEm) || nf.emissao.slice(0, 10);
    if ((de && ref < de) || (ate && ref > ate)) continue;
    const prazo = somarDias(dof.validade, 1);
    const divergencias = divergenciaVolume(e, dof, fardos);
    const especies = new Set([...dof.volumes.map((v) => v.especieId), ...fardos.map((f) => f.especieId)]);
    for (const especieId of especies) {
      const dosFardos = fardos.filter((f) => f.especieId === especieId);
      const recebidos = dosFardos.filter((f) => f.recebidoEm);
      const pecas = recebidos.reduce((t, f) => t + Math.max(0, dormentesDoFardo(e, f.id).length - (f.faltaDeclarada ?? 0)), 0);
      const dv = divergencias.find((x) => x.especieId === especieId);
      const chegou = recebidos.length > 0;
      const declaradoEm = dof.declarado ? dia(dof.declarado.quando) : undefined;
      let situacao: SituacaoRecebimentoDof;
      let diasAtraso: number | undefined;
      if (declaradoEm) {
        situacao = declaradoEm <= prazo ? 'no_prazo' : 'declarada_atraso';
        if (situacao === 'declarada_atraso') diasAtraso = diasEntre(prazo, declaradoEm);
      } else if (hoje > prazo) {
        situacao = 'vencida';
        diasAtraso = diasEntre(prazo, hoje);
      } else situacao = 'pendente';
      linhas.push({
        id: `${dof.id}|${especieId}`, dofId: dof.id, dofNumero: dof.numero, nfId: nf.id, nfNumero: nf.numero, entregaId: entrega.id, fornecedorId: nf.fornecedorId,
        especieId, tamanhosIds: [...new Set(dosFardos.map((f) => tamanhoDoItem(e, f.itemContratoId).id))],
        quantidade: pecas, documentalM3: dv?.documentalM3 ?? dof.volumes.find((v) => v.especieId === especieId)?.volumeM3 ?? 0,
        recebidoM3: chegou && dv ? (dv.medidoM3 ?? dv.nominalM3) : undefined, base: chegou && dv ? dv.base : undefined,
        divergenciaPct: chegou && dv && Number.isFinite(dv.percentual) ? dv.percentual : undefined,
        acimaTolerancia: chegou && !!dv && dv.acimaTolerancia,
        validade: dof.validade, prazoDeclaracao: prazo, recebidoEm: recebidaEm, declaradoEm: dof.declarado?.quando, declaradoPor: dof.declarado?.quem, situacao, diasAtraso,
      });
    }
  }
  const ordem: Record<SituacaoRecebimentoDof, number> = { vencida: 0, pendente: 1, declarada_atraso: 2, no_prazo: 3 };
  return linhas.sort((a, b) => ordem[a.situacao] - ordem[b.situacao]
    || (a.situacao === 'vencida' || a.situacao === 'pendente' ? a.prazoDeclaracao.localeCompare(b.prazoDeclaracao) : (b.declaradoEm ?? '').localeCompare(a.declaradoEm ?? ''))
    || a.dofNumero.localeCompare(b.dofNumero) || a.especieId.localeCompare(b.especieId));
}

/**
 * Balanço por espécie (art. 41) no período [de, ate]: saldo inicial (o que estava no pátio antes de `de`; sem `de`,
 * zero) + entradas (dormentes dos fardos recebidos) − destinações (RMEs entregues, art. 56) − perdas (art. 42) −
 * retiradas de reprovados pelo fornecedor = saldo final. Quando o período termina hoje, compara com o físico do pátio.
 * Tudo vem de datas já gravadas: recebimento do fardo, entrega da RME, perda e retirada do fardo reprovado.
 */
export function balancoPorEspecie(e: Estado, hoje: string, de?: string, ate?: string): BalancoIbama {
  const fim = ate && ate < hoje ? ate : hoje;
  type Soma = { m3: number; pecas: number };
  type Eventos = { entradas: Soma; destinacoes: Soma; perdas: Soma; retiradas: Soma };
  const vazio = (): Eventos => ({ entradas: { m3: 0, pecas: 0 }, destinacoes: { m3: 0, pecas: 0 }, perdas: { m3: 0, pecas: 0 }, retiradas: { m3: 0, pecas: 0 } });
  // Lançamentos datados, cada um num dia: depois se separam em antes do período e dentro dele.
  const lancamentos: { especieId: Id; data: string; tipo: keyof Eventos; m3: number; pecas: number }[] = [];
  const fardosPorId = new Map(e.fardos.map((f) => [f.id, f]));
  for (const d of e.dormentes) {
    const f = fardosPorId.get(d.fardoId);
    if (!f?.recebidoEm || d.situacao === 'emitido') continue;
    const m3 = volumeMedido(e, d);
    lancamentos.push({ especieId: d.especieId, data: dia(f.recebidoEm), tipo: 'entradas', m3, pecas: 1 });
    if (d.situacao === 'retirado' && f.reprovacao?.retiradoEm) lancamentos.push({ especieId: d.especieId, data: dia(f.reprovacao.retiradoEm), tipo: 'retiradas', m3, pecas: 1 });
  }
  for (const x of e.destinacoes) lancamentos.push({ especieId: x.especieId, data: dia(x.entregueEm), tipo: 'destinacoes', m3: x.volumeM3, pecas: x.quantidade });
  for (const p of e.perdas) lancamentos.push({ especieId: p.especieId, data: dia(p.quando), tipo: 'perdas', m3: p.volumeM3, pecas: 1 });

  const antes = new Map<Id, Eventos>();
  const dentro = new Map<Id, Eventos>();
  const de_ = (m: Map<Id, Eventos>, id: Id) => { if (!m.has(id)) m.set(id, vazio()); return m.get(id)!; };
  for (const l of lancamentos) {
    if (l.data > fim) continue;
    const alvo = de && l.data < de ? antes : dentro;
    const s = de_(alvo, l.especieId)[l.tipo];
    s.m3 += l.m3;
    s.pecas += l.pecas;
  }
  const saldoAte = (v?: Eventos) => (v ? { m3: v.entradas.m3 - v.destinacoes.m3 - v.perdas.m3 - v.retiradas.m3, pecas: v.entradas.pecas - v.destinacoes.pecas - v.perdas.pecas - v.retiradas.pecas } : { m3: 0, pecas: 0 });

  const comparaFisico = !ate || ate >= hoje;
  const fisico = new Map(saldoPatio(e).map((s) => [s.especieId, s]));
  const ids = new Set<Id>([...antes.keys(), ...dentro.keys(), ...(comparaFisico ? [...fisico.keys()] : [])]);
  const especies = [...ids].map((especieId): BalancoEspecie => {
    const ini = saldoAte(antes.get(especieId));
    const ev = dentro.get(especieId) ?? vazio();
    const fin = { m3: ini.m3 + ev.entradas.m3 - ev.destinacoes.m3 - ev.perdas.m3 - ev.retiradas.m3, pecas: ini.pecas + ev.entradas.pecas - ev.destinacoes.pecas - ev.perdas.pecas - ev.retiradas.pecas };
    const b: BalancoEspecie = {
      especieId, inicialM3: arredondar(ini.m3), inicialPecas: ini.pecas,
      entradasM3: arredondar(ev.entradas.m3), entradasPecas: ev.entradas.pecas,
      destinacoesM3: arredondar(ev.destinacoes.m3), destinacoesPecas: ev.destinacoes.pecas,
      perdasM3: arredondar(ev.perdas.m3), perdasPecas: ev.perdas.pecas,
      retiradasM3: arredondar(ev.retiradas.m3), retiradasPecas: ev.retiradas.pecas,
      finalM3: arredondar(fin.m3), finalPecas: fin.pecas,
    };
    if (comparaFisico) {
      const f = fisico.get(especieId);
      b.fisicoM3 = f?.fisicoM3 ?? 0;
      b.fisicoPecas = f?.quantidade ?? 0;
      b.diferencaM3 = arredondar(b.fisicoM3 - b.finalM3);
      b.diferencaPecas = b.fisicoPecas - b.finalPecas;
      b.fecha = b.diferencaPecas === 0 && Math.abs(b.diferencaM3) <= TOLERANCIA_FECHAMENTO_M3;
    }
    return b;
  });
  return { de: de || undefined, ate: fim, comparaFisico, especies };
}

/** Destinação com o que dá para tirar da RME sem banco: tamanhos, prazo de lançamento (dia seguinte à entrega, art. 56) e atraso. */
export function destinacaoDetalhada(e: Estado, d: DestinacaoFinal, hoje: string): DestinacaoFinal {
  const rme = e.rmes.find((r) => r.id === d.rmeId);
  const tamanhos = new Set<Id>();
  for (const id of (rme?.separacao ?? []).flatMap((l) => l.dormentesIds)) {
    const dor = e.dormentes.find((x) => x.id === id);
    if (dor && dor.especieId === d.especieId) tamanhos.add(tamanhoDoItem(e, dor.itemContratoId).id);
  }
  const prazoLancamento = somarDias(dia(d.entregueEm), 1);
  const ate = d.lancadoEm ? dia(d.lancadoEm) : hoje;
  return { ...d, tamanhosIds: [...tamanhos], prazoLancamento, diasAtraso: Math.max(0, diasEntre(prazoLancamento, ate)) };
}
