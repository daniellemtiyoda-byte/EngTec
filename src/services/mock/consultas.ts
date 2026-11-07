import {
  DIAS_RECEBIMENTO_DEFINITIVO, GARANTIA_ANOS, PRAZO_LAUDO_DIAS_UTEIS, diasEntre, dataSP, diferencaVolumePct, foraDaTolerancia, janelaParcela, liberacaoDaCura,
  nivelPrazo, nivelPrazoUteis, prazoDeclaracao, situacaoParcela, situacaoSaldo, somarAnos, somarDias, somarDiasUteis, volumeM3,
} from '../../dominio/parametros';
import type {
  Ata, Classe, Contrato, DivergenciaVolume, Dof, Dormente, Emissao, Entrega, EtiquetasEmissao, Fardo, FardoDetalhe, FichaDormente, Fornecedor, FornecedorResumo, Id, InspecaoFardo, ItemContrato,
  ItemDescrito, Local, ParcelaContrato, SaldoItem, SituacaoFardo, Tamanho,
} from '../../types/models';
import { achar, type AtaReg, type ContratoReg, type DofReg, type EmissaoReg, type EntregaReg, type Estado, type FardoReg, type FornecedorReg, type LocalReg, type TamanhoReg } from './estado';

/*
 * Campos calculados: montados na consulta, a partir do que está gravado (no Supabase, views e funções).
 * Nada aqui altera o estado.
 */

export const dormentesDoFardo = (e: Estado, fardoId: Id) => e.dormentes.filter((d) => d.fardoId === fardoId);

export function tamanhoView(t: TamanhoReg): Tamanho {
  return { ...t, volumeM3: volumeM3(t.comprimentoCm, t.larguraCm, t.alturaCm) };
}

export function fornecedorView(f: FornecedorReg, hoje: string): Fornecedor {
  return { ...f, bloqueado: f.ctfValidade < hoje };
}

/** Tamanho do item do contrato (o item é o tamanho). */
export function tamanhoDoItem(e: Estado, itemContratoId: Id): Tamanho {
  const item = achar(e.contratos.flatMap((c) => c.itens), (i) => i.id === itemContratoId, 'Item do contrato');
  return tamanhoView(achar(e.tamanhos, (x) => x.id === item.tamanhoId, 'Tamanho'));
}

type Madeira = { itemContratoId: Id; especieId: Id; tratamentoId: Id; classe: Classe; usinaTratamento: string; dataTratamento: string };

/** Descrição de um fardo ou dormente: tamanho do item e espécie, classe e tratamento (usina e data) informados pelo fornecedor. */
export function itemDescrito(e: Estado, x: Madeira): ItemDescrito {
  return {
    tamanho: tamanhoDoItem(e, x.itemContratoId),
    especie: achar(e.especies, (s) => s.id === x.especieId, 'Espécie'),
    tratamento: achar(e.tratamentos, (t) => t.id === x.tratamentoId, 'Tratamento'),
    classe: x.classe, usinaTratamento: x.usinaTratamento, dataTratamento: x.dataTratamento,
  };
}

/** Fim da cura (CCA ou CCB: 15 dias após o tratamento); sem cura, a própria data de tratamento. */
export function liberacao(e: Estado, x: { tratamentoId: Id; dataTratamento: string }): string {
  return liberacaoDaCura(x.dataTratamento, e.tratamentos.find((t) => t.id === x.tratamentoId)?.preservativo ?? '');
}

/** Volume de um dormente do item do contrato, pelo tamanho. */
export function volumeDoItem(e: Estado, itemContratoId: Id): number {
  return tamanhoDoItem(e, itemContratoId).volumeM3;
}

/** Ata com o contratado e o saldo por tamanho (contratos não cancelados) e se está vigente hoje. */
export function ataView(e: Estado, a: AtaReg, hoje: string): Ata {
  const contratos = e.contratos.filter((c) => c.ataId === a.id && c.situacao !== 'cancelado');
  return {
    ...a, vigente: a.vigenciaInicio <= hoje && hoje <= a.vigenciaFim,
    itens: a.itens.map((i) => {
      const contratado = contratos.flatMap((c) => c.itens).filter((x) => x.tamanhoId === i.tamanhoId).reduce((t, x) => t + x.quantidade, 0);
      return { ...i, contratado, saldo: i.quantidade - contratado };
    }),
  };
}

/**
 * Situação do fardo, sempre derivada: antes do recebimento, em trânsito; recebido e sem conclusão da inspeção,
 * aguardando ou em inspeção (já há dormente inspecionado); concluído, pelo saldo: sem saldo, baixado; senão, em
 * estoque (o fardo aberto continua em estoque: ver `aberto` em `fardoView`).
 */
export function situacaoFardo(e: Estado, f: FardoReg, dormentes = dormentesDoFardo(e, f.id)): SituacaoFardo {
  if (!f.recebidoEm) return 'em_transito';
  if (!f.conclusaoInspecao) return dormentes.some((d) => d.situacao === 'aguardando_inspecao' && d.inspecaoId) ? 'em_inspecao' : 'aguardando_inspecao';
  const saldo = dormentes.filter((d) => d.situacao === 'em_estoque' || d.situacao === 'reservado').length;
  return saldo === 0 ? 'baixado' : 'em_estoque';
}

export function fardoView(e: Estado, f: FardoReg, hoje: string): Fardo {
  const ds = dormentesDoFardo(e, f.id);
  const emEstoque = ds.filter((d) => d.situacao === 'em_estoque').length;
  const reservados = ds.filter((d) => d.situacao === 'reservado').length;
  const saldo = emEstoque + reservados;
  // Cura: os em estoque só ficam disponíveis para separação depois da liberação.
  const fimCura = liberacao(e, f);
  const emCuraAte = emEstoque > 0 && hoje < fimCura ? fimCura : undefined;
  const disponivel = emCuraAte ? 0 : emEstoque;
  const idadeDias = f.recebidoEm ? Math.max(0, diasEntre(dataSP(new Date(f.recebidoEm)), hoje)) : undefined;
  const situacao = situacaoFardo(e, f, ds);
  const comSaldo = situacao === 'em_estoque';
  const aberto = comSaldo && ds.some((d) => d.situacao === 'baixado');
  const progressoInspecao = f.recebidoEm && !f.conclusaoInspecao ? { inspecionados: ds.filter((d) => d.inspecaoId).length, total: ds.length } : undefined;
  return { ...f, saldo, disponivel, reservados, emCuraAte, situacao, aberto, idadeDias, acimaLimiteDias: comSaldo && (idadeDias ?? 0) > e.parametros.limiteDiasEstoque, progressoInspecao };
}

export function localView(e: Estado, l: LocalReg, hoje: string): Local {
  const fardos = e.fardos.filter((f) => f.localId === l.id).map((f) => fardoView(e, f, hoje)).filter((f) => f.saldo > 0 || f.situacao === 'aguardando_inspecao' || f.situacao === 'em_inspecao');
  const noFardo = fardos.reduce((s, f) => s + (f.situacao === 'aguardando_inspecao' || f.situacao === 'em_inspecao' ? dormentesDoFardo(e, f.id).length : f.saldo), 0);
  const segregados = e.dormentes.filter((d) => d.situacao === 'reprovado' && d.localId === l.id).length;
  return { ...l, ocupacao: noFardo + segregados, fardos: fardos.length };
}

export function itemContratoView(e: Estado, contratoId: Id, item: ContratoReg['itens'][number]): ItemContrato {
  const ds = e.dormentes.filter((d) => d.itemContratoId === item.id && d.contratoId === contratoId);
  // Recebidos: os que chegaram, sem a falta declarada no recebimento dos fardos do item.
  const faltas = e.fardos.filter((f) => f.itemContratoId === item.id).reduce((t, f) => t + (f.faltaDeclarada ?? 0), 0);
  const recebidos = Math.max(0, ds.filter((d) => d.situacao !== 'emitido').length - faltas);
  // Reprovados (na segregação ou já retirados) não contam no cumprimento: o fornecedor repõe.
  const reprovados = ds.filter((d) => d.situacao === 'reprovado' || d.situacao === 'retirado').length;
  const aprovados = ds.filter((d) => ['em_estoque', 'reservado', 'baixado'].includes(d.situacao)).length;
  return { ...item, emitidos: ds.length, recebidos, aprovados, reprovados, saldoAEmitir: item.quantidade - (ds.length - reprovados) };
}

/** Data (AAAA-MM-DD) do recebimento de um fardo. */
const dataDe = (iso: string) => dataSP(new Date(iso));

/**
 * Parcelas do cronograma: janela pela assinatura e pelas regras da ata; recebidos = dormentes que chegaram nas entregas
 * da parcela (sem a falta declarada); entregue quando os recebidos alcançam a quantidade (no prazo ou com atraso).
 */
export function parcelasDoContrato(e: Estado, c: ContratoReg, hoje: string): ParcelaContrato[] {
  const ata = achar(e.atas, (a) => a.id === c.ataId, 'Ata');
  return c.parcelas.map((p) => {
    const quantidade = p.itens.reduce((t, i) => t + i.quantidade, 0);
    const { inicio, fim } = janelaParcela(c.dataAssinatura, ata.regras, p.numero);
    const entregas = e.entregas.filter((x) => x.contratoId === c.id && x.parcela === p.numero).map((x) => x.id);
    const fardos = e.fardos.filter((f) => f.entregaId && entregas.includes(f.entregaId) && f.recebidoEm).sort((a, b) => a.recebidoEm!.localeCompare(b.recebidoEm!));
    let recebidos = 0;
    let entregueEm: string | undefined;
    for (const f of fardos) {
      recebidos += Math.max(0, dormentesDoFardo(e, f.id).length - (f.faltaDeclarada ?? 0));
      if (!entregueEm && recebidos >= quantidade) entregueEm = dataDe(f.recebidoEm!);
    }
    // Contrato cancelado não tem parcela atrasada: o que faltou não será mais entregue.
    const situacao = c.situacao === 'cancelado' && !entregueEm ? 'a_entregar' : situacaoParcela(quantidade, recebidos, fim, hoje, entregueEm);
    const ate = entregueEm ?? hoje;
    return { ...p, quantidade, inicio, fim, recebidos, entregueEm, situacao, diasAtraso: Math.max(0, diasEntre(fim, ate)) };
  });
}

export function contratoView(e: Estado, c: ContratoReg, hoje: string): Contrato {
  const ata = achar(e.atas, (a) => a.id === c.ataId, 'Ata');
  const itens = c.itens.map((i) => itemContratoView(e, c.id, i));
  // Concluído (PROVISÓRIO): vigente, todos os itens cumpridos por aprovados e nada pendente na entrada.
  const pendente = e.dormentes.some((d) => d.contratoId === c.id && ['emitido', 'aguardando_inspecao', 'nao_localizado'].includes(d.situacao));
  const cumprido = itens.length > 0 && itens.every((i) => i.aprovados >= i.quantidade);
  const situacao = c.situacao === 'cancelado' ? 'cancelado' : cumprido && !pendente ? 'concluido' : 'vigente';
  const parcelas = parcelasDoContrato(e, c, hoje);
  // Recebimento definitivo: 15 dias após o laudo da última entrega, com o contrato concluído e todas as entregas com laudo.
  const entregas = e.entregas.filter((x) => x.contratoId === c.id);
  const laudos = entregas.map((x) => x.laudo?.emitidoEm).filter((x): x is string => !!x).map(dataDe).sort();
  const recebimentoDefinitivoEm = situacao === 'concluido' && entregas.length && laudos.length === entregas.length ? somarDias(laudos[laudos.length - 1], DIAS_RECEBIMENTO_DEFINITIVO) : undefined;
  return {
    ...c, fornecedorId: ata.fornecedorId, itens, situacao, parcelas,
    parcelasAtrasadas: situacao === 'vigente' ? parcelas.filter((p) => p.situacao === 'atrasada').length : 0, recebimentoDefinitivoEm,
  };
}

export function dofView(e: Estado, d: DofReg, hoje: string): Dof {
  const prazo = prazoDeclaracao(d.validade);
  const nf = achar(e.nfs, (n) => n.id === d.nfId, 'NF');
  const entrega = e.entregas.find((x) => x.id === nf.entregaId);
  return {
    ...d, nfNumero: nf.numero, fornecedorId: nf.fornecedorId, contratoId: nf.contratoId, entregaId: nf.entregaId,
    situacaoDeclaracao: d.declarado ? 'declarado' : 'a_declarar',
    podeDeclarar: !d.declarado && !!entrega && entrega.situacao !== 'a_caminho',
    prazoDeclaracao: prazo, diasParaPrazo: diasEntre(hoje, prazo),
    nivelPrazo: d.declarado ? 'ok' : nivelPrazo(prazo, hoje, e.parametros.alertaDofDias),
  };
}

/** Volume real de um dormente pelas medidas da inspeção; sem medidas, o volume do tamanho. */
function volumeMedido(e: Estado, d: Dormente): number {
  if (d.medidas) return volumeM3(d.medidas.comprimentoCm, d.medidas.larguraCm, d.medidas.alturaCm);
  return tamanhoDoItem(e, d.itemContratoId).volumeM3;
}

const arredondar = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Divergência de volume por espécie (regra da IN Ibama): DOF × volume nominal (dormentes recebidos × volume do tamanho,
 * descontada a falta declarada) e, quando todos os fardos recebidos da espécie já tiveram a inspeção concluída, DOF ×
 * volume medido (medidas reais dos aprovados e reprovados). A divergência oficial usa o medido quando existe.
 * `faltas` sobrepõe a falta declarada dos fardos (recebimento ainda não gravado).
 */
export function divergenciaVolume(e: Estado, dof: DofReg, fardos: FardoReg[], faltas: Map<Id, number> = new Map()): DivergenciaVolume[] {
  const nominal = new Map<Id, number>();
  const medido = new Map<Id, number>();
  const tudoInspecionado = new Map<Id, boolean>();
  const estimados = new Map<Id, number>();
  for (const f of fardos) {
    const tamanho = tamanhoDoItem(e, f.itemContratoId);
    const especieId = f.especieId;
    const falta = faltas.get(f.id) ?? f.faltaDeclarada ?? 0;
    nominal.set(especieId, (nominal.get(especieId) ?? 0) + Math.max(0, dormentesDoFardo(e, f.id).length - falta) * tamanho.volumeM3);
    tudoInspecionado.set(especieId, (tudoInspecionado.get(especieId) ?? true) && !!f.conclusaoInspecao);
    const inspecionados = dormentesDoFardo(e, f.id).filter((x) => ['em_estoque', 'reservado', 'baixado', 'reprovado'].includes(x.situacao));
    medido.set(especieId, (medido.get(especieId) ?? 0) + inspecionados.reduce((t, x) => t + volumeMedido(e, x), 0));
    estimados.set(especieId, (estimados.get(especieId) ?? 0) + inspecionados.filter((x) => !x.medidas).length);
  }
  const especies = new Set([...dof.volumes.map((v) => v.especieId), ...nominal.keys()]);
  return [...especies].map((especieId) => {
    const documentalM3 = dof.volumes.find((v) => v.especieId === especieId)?.volumeM3 ?? 0;
    const nominalM3 = arredondar(nominal.get(especieId) ?? 0);
    const medidoM3 = tudoInspecionado.get(especieId) ? arredondar(medido.get(especieId) ?? 0) : undefined;
    const base = medidoM3 !== undefined ? 'medido' as const : 'nominal' as const;
    const percentual = diferencaVolumePct(documentalM3, medidoM3 ?? nominalM3);
    return {
      especieId, documentalM3, nominalM3, medidoM3, base,
      estimados: medidoM3 !== undefined && estimados.get(especieId) ? estimados.get(especieId) : undefined,
      percentual: Number.isFinite(percentual) ? Math.round(percentual * 10) / 10 : percentual, acimaTolerancia: foraDaTolerancia(percentual),
    };
  });
}

export function entregaView(e: Estado, en: EntregaReg, hoje: string): Entrega {
  const nf = achar(e.nfs, (n) => n.id === en.nfId, 'NF');
  const dof = dofView(e, achar(e.dofs, (d) => d.id === en.dofId, 'DOF'), hoje);
  const fardos = e.fardos.filter((f) => en.fardosIds.includes(f.id));
  const recebidos = fardos.filter((f) => f.recebidoEm);
  const dofReg = achar(e.dofs, (d) => d.id === en.dofId, 'DOF');
  // Laudo: 20 dias úteis contados da entrega (o primeiro recebimento provisório).
  const recebidaEm = e.recebimentos.filter((r) => r.entregaId === en.id).map((r) => r.recebidoEm).sort()[0];
  const prazoLaudo = recebidaEm ? somarDiasUteis(dataDe(recebidaEm), PRAZO_LAUDO_DIAS_UTEIS) : undefined;
  const inspecionada = en.situacao === 'recebida' && fardos.every((f) => f.conclusaoInspecao);
  return {
    ...en, nfNumero: nf.numero, fornecedorId: nf.fornecedorId,
    recebidaEm, prazoLaudo,
    nivelPrazoLaudo: prazoLaudo && !en.laudo ? nivelPrazoUteis(prazoLaudo, hoje, e.parametros.alertaLaudoDias) : undefined,
    podeEmitirLaudo: inspecionada && !en.laudo,
    divergenciaVolume: recebidos.length ? divergenciaVolume(e, dofReg, recebidos) : [],
    etapa: en.situacao !== 'recebida' ? 'a_caminho' : !inspecionada ? 'aguardando_inspecao' : en.laudo ? 'concluida' : 'aguardando_laudo',
    comOcorrencia: e.recebimentos.some((r) => r.entregaId === en.id && r.ocorrencias.length > 0),
    recebimentosIds: e.recebimentos.filter((r) => r.entregaId === en.id).map((r) => r.id),
    fardosRecebidos: fardos.filter((f) => f.recebidoEm).map((f) => f.id),
    dormentes: fardos.reduce((s, f) => s + dormentesDoFardo(e, f.id).length, 0),
    prazoDeclaracao: dof.prazoDeclaracao, nivelPrazo: dof.nivelPrazo,
  };
}

/**
 * Saldo por classe + tamanho (o item de estoque): disponível, aguardando inspeção, reservado e não localizado, contra
 * o mínimo e o máximo; a espécie é detalhe (disponível por espécie).
 */
export function saldoPorItem(e: Estado, hoje: string): SaldoItem[] {
  const mapa = new Map<string, SaldoItem>();
  const linha = (classe: Classe, tamanhoId: Id) => {
    const k = `${classe}|${tamanhoId}`;
    let s = mapa.get(k);
    if (!s) {
      const nivel = e.parametros.niveis.find((n) => n.classe === classe && n.tamanhoId === tamanhoId);
      const uso = e.tamanhos.find((t) => t.id === tamanhoId)?.uso ?? 'via_corrente';
      s = { id: k, classe, tamanhoId, uso, emEstoque: 0, emCura: 0, aguardandoInspecao: 0, reservado: 0, naoLocalizado: 0, minimo: nivel?.minimo ?? 0, maximo: nivel?.maximo ?? 0, situacao: 'ok', especies: [] };
      mapa.set(k, s);
    }
    return s;
  };
  for (const n of e.parametros.niveis) linha(n.classe, n.tamanhoId);
  const tamanhoDe = new Map(e.contratos.flatMap((c) => c.itens).map((i) => [i.id, i.tamanhoId]));
  for (const d of e.dormentes) {
    const tamanhoId = tamanhoDe.get(d.itemContratoId);
    if (!tamanhoId) continue;
    const s = linha(d.classe, tamanhoId);
    const fimCura = d.situacao === 'em_estoque' ? liberacao(e, d) : '';
    if (d.situacao === 'em_estoque' && hoje < fimCura) {
      s.emCura++;
      if (!s.liberacaoCura || fimCura < s.liberacaoCura) s.liberacaoCura = fimCura;
    } else if (d.situacao === 'em_estoque') {
      s.emEstoque++;
      const esp = s.especies.find((x) => x.especieId === d.especieId);
      if (esp) esp.emEstoque++; else s.especies.push({ especieId: d.especieId, emEstoque: 1 });
    } else if (d.situacao === 'aguardando_inspecao') s.aguardandoInspecao++;
    else if (d.situacao === 'reservado') s.reservado++;
    else if (d.situacao === 'nao_localizado') s.naoLocalizado++;
  }
  // Item sem nível definido em Configurações fica "ok" (mínimo e máximo 0 = não definido).
  const temNivel = (s: SaldoItem) => e.parametros.niveis.some((n) => n.classe === s.classe && n.tamanhoId === s.tamanhoId);
  return [...mapa.values()].map((s) => ({
    ...s, especies: s.especies.sort((a, b) => b.emEstoque - a.emEstoque), situacao: temNivel(s) ? situacaoSaldo(s.emEstoque, s.minimo, s.maximo) : 'ok',
  }));
}

/** Local onde o dormente está: o do fardo ou, se reprovado, o de segregação. */
export function localDoDormente(e: Estado, d: Dormente): LocalReg | undefined {
  const id = d.situacao === 'reprovado' ? d.localId : ['em_estoque', 'reservado', 'aguardando_inspecao'].includes(d.situacao) ? e.fardos.find((f) => f.id === d.fardoId)?.localId : undefined;
  return id ? e.locais.find((l) => l.id === id) : undefined;
}

// ---------- Visões montadas para as páginas de objeto ----------

export function fardoDetalhe(e: Estado, id: Id, hoje: string): FardoDetalhe {
  const reg = achar(e.fardos, (f) => f.id === id.trim().toUpperCase(), `Fardo ${id}`);
  const contrato = contratoView(e, achar(e.contratos, (c) => c.id === reg.contratoId, 'Contrato'), hoje);
  const entrega = e.entregas.find((x) => x.id === reg.entregaId);
  const local = e.locais.find((l) => l.id === reg.localId);
  return {
    fardo: fardoView(e, reg, hoje), contrato, item: itemDescrito(e, reg),
    local: local && localView(e, local, hoje),
    dormentes: dormentesDoFardo(e, reg.id),
    entrega: entrega && entregaView(e, entrega, hoje),
    nf: entrega && e.nfs.find((n) => n.id === entrega.nfId),
    dof: entrega && dofView(e, achar(e.dofs, (d) => d.id === entrega.dofId, 'DOF'), hoje),
    recebimento: e.recebimentos.find((r) => r.fardosLidos.includes(reg.id)),
    movimentacoes: e.movimentacoes.filter((m) => m.fardoId === reg.id),
  };
}

export function fichaDormente(e: Estado, id: Id, hoje: string): FichaDormente {
  const d = achar(e.dormentes, (x) => x.id === id.trim().toUpperCase(), `Dormente ${id}`);
  const det = fardoDetalhe(e, d.fardoId, hoje);
  const ata = ataView(e, achar(e.atas, (a) => a.id === det.contrato.ataId, 'Ata'), hoje);
  const local = localDoDormente(e, d);
  // Desde quando está no local: a última chegada registrada (recebido, guardado, transferido ou segregado).
  const chegadas = d.situacao === 'reprovado' ? d.historico.filter((h) => h.tipo === 'segregado') : det.fardo.historico.filter((h) => ['recebido', 'guardado', 'transferido'].includes(h.tipo));
  const entrega = e.entregas.find((x) => x.id === det.fardo.entregaId);
  return {
    dormente: d, fardo: det.fardo, local: local && localView(e, local, hoje), localDesde: local ? chegadas[chegadas.length - 1]?.quando : undefined,
    contrato: det.contrato, ata, fornecedor: fornecedorView(achar(e.fornecedores, (f) => f.id === ata.fornecedorId, 'Fornecedor'), hoje),
    item: itemDescrito(e, d), nf: det.nf, dof: det.dof, recebimento: det.recebimento,
    inspecao: e.inspecoes.find((i) => i.id === d.inspecaoId),
    rme: d.rmeNumero ? e.rmes.find((r) => r.numero === d.rmeNumero) : undefined,
    empresaInspetora: entrega?.boletim ? e.empresasInspetoras.find((x) => x.id === entrega.boletim!.empresaInspetoraId) : undefined,
    garantiaAte: det.fardo.recebidoEm ? somarAnos(dataDe(det.fardo.recebidoEm), GARANTIA_ANOS) : undefined,
  };
}

export function inspecaoFardo(e: Estado, fardoId: Id, hoje: string): InspecaoFardo {
  const reg = achar(e.fardos, (f) => f.id === fardoId.trim().toUpperCase(), `Fardo ${fardoId}`);
  const dormentes = dormentesDoFardo(e, reg.id).map((d) => ({ ...d, inspecao: e.inspecoes.find((i) => i.id === d.inspecaoId) }));
  const local = e.locais.find((l) => l.id === reg.localId);
  const inspecionados = dormentes.filter((d) => d.inspecao).length;
  return {
    fardo: fardoView(e, reg, hoje), item: itemDescrito(e, reg), local: local && localView(e, local, hoje),
    dormentes, inspecionados, pendentes: dormentes.filter((d) => d.situacao === 'aguardando_inspecao' && !d.inspecao).length,
    faltaDeclarada: reg.faltaDeclarada, justificativaSugerida: reg.faltaDeclarada ? justificativaDaFalta(reg.faltaDeclarada) : undefined,
  };
}

export function emissaoView(e: Estado, em: EmissaoReg): Emissao {
  const entrega = e.entregas.find((x) => x.id === em.entregaId);
  return {
    ...em, dormentes: e.dormentes.filter((d) => em.fardosIds.includes(d.fardoId)).length,
    situacao: entrega ? entrega.situacao : 'aguardando_documentos',
  };
}

export function etiquetasEmissao(e: Estado, emissaoId: Id, hoje: string): EtiquetasEmissao {
  const em = achar(e.emissoes, (x) => x.id === emissaoId, 'Emissão');
  return {
    emissao: emissaoView(e, em),
    contrato: contratoView(e, achar(e.contratos, (c) => c.id === em.contratoId, 'Contrato'), hoje),
    fardos: e.fardos.filter((f) => em.fardosIds.includes(f.id)).map((f) => ({
      fardo: fardoView(e, f, hoje), item: itemDescrito(e, f), dormentesIds: dormentesDoFardo(e, f.id).map((d) => d.id),
    })),
  };
}

/** Página do fornecedor: atas, contratos e taxa de reprovação por espécie (reprovados ÷ inspecionados). */
export function resumoFornecedor(e: Estado, id: Id, hoje: string): FornecedorResumo {
  const f = achar(e.fornecedores, (x) => x.id === id, 'Fornecedor');
  const atas = e.atas.filter((a) => a.fornecedorId === f.id);
  const contratos = e.contratos.filter((c) => atas.some((a) => a.id === c.ataId)).map((c) => contratoView(e, c, hoje));
  const doFornecedor = new Set(contratos.map((c) => c.id));
  const porEspecie = new Map<Id, { inspecionados: number; reprovados: number }>();
  for (const d of e.dormentes) {
    if (!doFornecedor.has(d.contratoId) || !['em_estoque', 'reservado', 'baixado', 'reprovado', 'retirado'].includes(d.situacao)) continue;
    const t = porEspecie.get(d.especieId) ?? { inspecionados: 0, reprovados: 0 };
    t.inspecionados++;
    if (d.situacao === 'reprovado' || d.situacao === 'retirado') t.reprovados++;
    porEspecie.set(d.especieId, t);
  }
  return {
    fornecedor: fornecedorView(f, hoje), atas: atas.map((a) => ataView(e, a, hoje)), contratos,
    reprovacao: [...porEspecie].map(([especieId, t]) => ({ especieId, ...t, percentual: Math.round((t.reprovados / t.inspecionados) * 1000) / 10 })),
  };
}

/** Justificativa usada quando os dormentes não lidos na inspeção cabem na falta declarada no recebimento. */
export const justificativaDaFalta = (n: number) => `Falta de ${n} ${n === 1 ? 'dormente declarada' : 'dormentes declarada'} no recebimento do fardo.`;
