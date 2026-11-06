import {
  diasEntre, dataSP, nivelPrazo, prazoDeclaracao, situacaoSaldo, volumeM3,
} from '../../dominio/parametros';
import type {
  Contrato, Dof, Dormente, Entrega, EtiquetasEntrega, Fardo, FardoDetalhe, FichaDormente, Fornecedor, Id, InspecaoFardo, ItemContrato,
  ItemDescrito, Local, SaldoItem, SituacaoFardo, Tamanho,
} from '../../types/models';
import { achar, type ContratoReg, type DofReg, type EntregaReg, type Estado, type FardoReg, type FornecedorReg, type LocalReg, type TamanhoReg } from './estado';

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

export function itemDescrito(e: Estado, itemContratoId: Id): ItemDescrito {
  const item = achar(e.contratos.flatMap((c) => c.itens), (i) => i.id === itemContratoId, 'Item do contrato');
  return {
    especie: achar(e.especies, (x) => x.id === item.especieId, 'Espécie'),
    tamanho: tamanhoView(achar(e.tamanhos, (x) => x.id === item.tamanhoId, 'Tamanho')),
    tratamento: achar(e.tratamentos, (x) => x.id === item.tratamentoId, 'Tratamento'),
  };
}

/** Volume de um dormente do item do contrato, pelo tamanho. */
export function volumeDoItem(e: Estado, itemContratoId: Id): number {
  return itemDescrito(e, itemContratoId).tamanho.volumeM3;
}

/**
 * Situação do fardo, sempre derivada: antes do recebimento, em trânsito; recebido e sem conclusão da inspeção,
 * aguardando ou em inspeção (já há dormente inspecionado); concluído, pelo saldo: sem saldo, baixado; com dormente
 * que já saiu numa RME, aberto; senão, em estoque.
 */
export function situacaoFardo(e: Estado, f: FardoReg, dormentes = dormentesDoFardo(e, f.id)): SituacaoFardo {
  if (!f.recebidoEm) return 'em_transito';
  if (!f.conclusaoInspecao) return dormentes.some((d) => d.situacao === 'aguardando_inspecao' && d.inspecaoId) ? 'em_inspecao' : 'aguardando_inspecao';
  const saldo = dormentes.filter((d) => d.situacao === 'em_estoque' || d.situacao === 'reservado').length;
  if (saldo === 0) return 'baixado';
  return dormentes.some((d) => d.situacao === 'baixado') ? 'aberto' : 'em_estoque';
}

export function fardoView(e: Estado, f: FardoReg, hoje: string): Fardo {
  const ds = dormentesDoFardo(e, f.id);
  const disponivel = ds.filter((d) => d.situacao === 'em_estoque').length;
  const saldo = disponivel + ds.filter((d) => d.situacao === 'reservado').length;
  const idadeDias = f.recebidoEm ? Math.max(0, diasEntre(dataSP(new Date(f.recebidoEm)), hoje)) : undefined;
  const situacao = situacaoFardo(e, f, ds);
  const comSaldo = situacao === 'em_estoque' || situacao === 'aberto';
  return { ...f, saldo, disponivel, situacao, idadeDias, acimaLimiteDias: comSaldo && (idadeDias ?? 0) > e.parametros.limiteDiasEstoque };
}

export function localView(e: Estado, l: LocalReg, hoje: string): Local {
  const fardos = e.fardos.filter((f) => f.localId === l.id).map((f) => fardoView(e, f, hoje)).filter((f) => f.saldo > 0 || f.situacao === 'aguardando_inspecao' || f.situacao === 'em_inspecao');
  const noFardo = fardos.reduce((s, f) => s + (f.situacao === 'aguardando_inspecao' || f.situacao === 'em_inspecao' ? dormentesDoFardo(e, f.id).length : f.saldo), 0);
  const segregados = e.dormentes.filter((d) => d.situacao === 'reprovado' && d.localId === l.id).length;
  return { ...l, ocupacao: noFardo + segregados, fardos: fardos.length };
}

export function itemContratoView(e: Estado, contratoId: Id, item: ContratoReg['itens'][number]): ItemContrato {
  const ds = e.dormentes.filter((d) => d.itemContratoId === item.id && d.contratoId === contratoId);
  const recebidos = ds.filter((d) => d.situacao !== 'emitido').length;
  const reprovados = ds.filter((d) => d.situacao === 'reprovado').length;
  const aprovados = ds.filter((d) => ['em_estoque', 'reservado', 'baixado'].includes(d.situacao)).length;
  return { ...item, emitidos: ds.length, recebidos, aprovados, reprovados, saldoAEmitir: item.quantidade - (ds.length - reprovados) };
}

export function contratoView(e: Estado, c: ContratoReg): Contrato {
  const ata = achar(e.atas, (a) => a.id === c.ataId, 'Ata');
  const itens = c.itens.map((i) => itemContratoView(e, c.id, i));
  // Concluído (PROVISÓRIO): vigente, todos os itens cumpridos por aprovados e nada pendente na entrada.
  const pendente = e.dormentes.some((d) => d.contratoId === c.id && ['emitido', 'aguardando_inspecao', 'nao_localizado'].includes(d.situacao));
  const cumprido = itens.length > 0 && itens.every((i) => i.aprovados >= i.quantidade);
  const situacao = c.situacao === 'cancelado' ? 'cancelado' : cumprido && !pendente ? 'concluido' : 'vigente';
  return { ...c, fornecedorId: ata.fornecedorId, itens, situacao };
}

export function dofView(e: Estado, d: DofReg, hoje: string): Dof {
  const prazo = prazoDeclaracao(d.validade);
  return {
    ...d, prazoDeclaracao: prazo, diasParaPrazo: diasEntre(hoje, prazo),
    nivelPrazo: d.declarado ? 'ok' : nivelPrazo(prazo, hoje, e.parametros.alertaDofDias),
  };
}

export function entregaView(e: Estado, en: EntregaReg, hoje: string): Entrega {
  const nf = achar(e.nfs, (n) => n.id === en.nfId, 'NF');
  const dof = dofView(e, achar(e.dofs, (d) => d.id === en.dofId, 'DOF'), hoje);
  const fardos = e.fardos.filter((f) => en.fardosIds.includes(f.id));
  return {
    ...en, nfNumero: nf.numero, fornecedorId: nf.fornecedorId,
    fardosRecebidos: fardos.filter((f) => f.recebidoEm).map((f) => f.id),
    dormentes: fardos.reduce((s, f) => s + dormentesDoFardo(e, f.id).length, 0),
    prazoDeclaracao: dof.prazoDeclaracao, nivelPrazo: dof.nivelPrazo,
  };
}

/** Saldo por espécie + tamanho: disponível, aguardando inspeção, reservado e não localizado, contra o mínimo e o máximo. */
export function saldoPorItem(e: Estado): SaldoItem[] {
  const chave = (especieId: Id, tamanhoId: Id) => `${especieId}|${tamanhoId}`;
  const itemDe = new Map(e.contratos.flatMap((c) => c.itens).map((i) => [i.id, i]));
  const mapa = new Map<string, SaldoItem>();
  const linha = (especieId: Id, tamanhoId: Id) => {
    const k = chave(especieId, tamanhoId);
    let s = mapa.get(k);
    if (!s) {
      const nivel = e.parametros.niveis.find((n) => n.especieId === especieId && n.tamanhoId === tamanhoId);
      s = { especieId, tamanhoId, emEstoque: 0, aguardandoInspecao: 0, reservado: 0, naoLocalizado: 0, minimo: nivel?.minimo ?? 0, maximo: nivel?.maximo ?? 0, situacao: 'ok' };
      mapa.set(k, s);
    }
    return s;
  };
  for (const n of e.parametros.niveis) linha(n.especieId, n.tamanhoId);
  for (const d of e.dormentes) {
    const item = itemDe.get(d.itemContratoId);
    if (!item) continue;
    const s = linha(item.especieId, item.tamanhoId);
    if (d.situacao === 'em_estoque') s.emEstoque++;
    else if (d.situacao === 'aguardando_inspecao') s.aguardandoInspecao++;
    else if (d.situacao === 'reservado') s.reservado++;
    else if (d.situacao === 'nao_localizado') s.naoLocalizado++;
  }
  // Item sem nível definido em Configurações fica "ok" (mínimo e máximo 0 = não definido).
  const temNivel = (s: SaldoItem) => e.parametros.niveis.some((n) => n.especieId === s.especieId && n.tamanhoId === s.tamanhoId);
  return [...mapa.values()].map((s) => ({ ...s, situacao: temNivel(s) ? situacaoSaldo(s.emEstoque, s.minimo, s.maximo) : 'ok' }));
}

/** Local onde o dormente está: o do fardo ou, se reprovado, o de segregação. */
export function localDoDormente(e: Estado, d: Dormente): LocalReg | undefined {
  const id = d.situacao === 'reprovado' ? d.localId : ['em_estoque', 'reservado', 'aguardando_inspecao'].includes(d.situacao) ? e.fardos.find((f) => f.id === d.fardoId)?.localId : undefined;
  return id ? e.locais.find((l) => l.id === id) : undefined;
}

// ---------- Visões montadas para as páginas de objeto ----------

export function fardoDetalhe(e: Estado, id: Id, hoje: string): FardoDetalhe {
  const reg = achar(e.fardos, (f) => f.id === id.trim().toUpperCase(), `Fardo ${id}`);
  const contrato = contratoView(e, achar(e.contratos, (c) => c.id === reg.contratoId, 'Contrato'));
  const entrega = e.entregas.find((x) => x.id === reg.entregaId);
  const local = e.locais.find((l) => l.id === reg.localId);
  return {
    fardo: fardoView(e, reg, hoje), contrato, item: itemDescrito(e, reg.itemContratoId),
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
  const ata = achar(e.atas, (a) => a.id === det.contrato.ataId, 'Ata');
  const local = localDoDormente(e, d);
  // Desde quando está no local: a última chegada registrada (recebido, guardado, transferido ou segregado).
  const chegadas = d.situacao === 'reprovado' ? d.historico.filter((h) => h.tipo === 'segregado') : det.fardo.historico.filter((h) => ['recebido', 'guardado', 'transferido'].includes(h.tipo));
  return {
    dormente: d, fardo: det.fardo, local: local && localView(e, local, hoje), localDesde: local ? chegadas[chegadas.length - 1]?.quando : undefined,
    contrato: det.contrato, ata, fornecedor: fornecedorView(achar(e.fornecedores, (f) => f.id === ata.fornecedorId, 'Fornecedor'), hoje),
    item: det.item, nf: det.nf, dof: det.dof, recebimento: det.recebimento,
    inspecao: e.inspecoes.find((i) => i.id === d.inspecaoId),
    rme: d.rmeNumero ? e.rmes.find((r) => r.numero === d.rmeNumero) : undefined,
  };
}

export function inspecaoFardo(e: Estado, fardoId: Id, hoje: string): InspecaoFardo {
  const reg = achar(e.fardos, (f) => f.id === fardoId.trim().toUpperCase(), `Fardo ${fardoId}`);
  const dormentes = dormentesDoFardo(e, reg.id).map((d) => ({ ...d, inspecao: e.inspecoes.find((i) => i.id === d.inspecaoId) }));
  const local = e.locais.find((l) => l.id === reg.localId);
  const inspecionados = dormentes.filter((d) => d.inspecao).length;
  return {
    fardo: fardoView(e, reg, hoje), item: itemDescrito(e, reg.itemContratoId), local: local && localView(e, local, hoje),
    dormentes, inspecionados, pendentes: dormentes.filter((d) => d.situacao === 'aguardando_inspecao' && !d.inspecao).length,
  };
}

export function etiquetasEntrega(e: Estado, entregaId: Id, hoje: string): EtiquetasEntrega {
  const en = achar(e.entregas, (x) => x.id === entregaId, 'Entrega');
  return {
    entrega: entregaView(e, en, hoje),
    contrato: contratoView(e, achar(e.contratos, (c) => c.id === en.contratoId, 'Contrato')),
    fardos: e.fardos.filter((f) => en.fardosIds.includes(f.id)).map((f) => ({
      fardo: fardoView(e, f, hoje), item: itemDescrito(e, f.itemContratoId), dormentesIds: dormentesDoFardo(e, f.id).map((d) => d.id),
    })),
  };
}
