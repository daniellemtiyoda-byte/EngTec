import { dataSP } from '../../dominio/parametros';
import type {
  DiferencaInventario, Dormente, EsperadoInventario, Id, Inventario, InventarioDoLocal, ResultadoInventario, RetornoLeituraInventario,
} from '../../types/models';
import { localDoDormente } from './consultas';
import { achar, falha, instante, novoId, proximoNumero, registrar, type Ctx, type Estado } from './estado';
import { movimentarDormentes } from './estoque';

/**
 * Inventário físico por leitura de QR (IN Ibama 21/2014, art. 41: o saldo tem de ser fiel ao físico). Abre para um ou
 * mais locais guardando o que deveria estar em cada um, recebe as leituras (fardo ou dormente) e, ao fechar, trata
 * cada diferença dormente a dormente: não existe ajuste de quantidade.
 */

/** Situações em que o dormente está no pátio e, portanto, num local. */
const NO_PATIO = new Set<Dormente['situacao']>(['aguardando_inspecao', 'em_estoque', 'reservado', 'reprovado']);

const codigoLocal = (e: Estado, id?: Id) => e.locais.find((l) => l.id === id)?.codigo ?? '—';

export function abrirInventario(e: Estado, locaisIds: Id[], ctx: Ctx): Inventario {
  const ids = [...new Set(locaisIds ?? [])];
  if (!ids.length) falha(422, 'Escolha ao menos um local.', { locaisIds: 'Escolha ao menos um local.' });
  for (const id of ids) {
    const l = achar(e.locais, (x) => x.id === id, 'Local');
    if (!l.ativo) falha(422, `O local ${l.codigo} está inativo.`, { locaisIds: `O local ${l.codigo} está inativo.` });
    const outro = e.inventarios.find((i) => i.situacao === 'aberto' && i.locaisIds.includes(id));
    if (outro) falha(409, `O local ${l.codigo} já está no inventário ${outro.numero}, ainda aberto.`, { locaisIds: `${l.codigo} já está em ${outro.numero}.` });
  }
  const esperados: EsperadoInventario[] = [];
  for (const d of e.dormentes) {
    if (!NO_PATIO.has(d.situacao)) continue;
    const local = localDoDormente(e, d);
    if (local && ids.includes(local.id)) esperados.push({ dormenteId: d.id, fardoId: d.fardoId, localId: local.id });
  }
  const ano = dataSP(ctx.agora()).slice(0, 4);
  const inv: Inventario = {
    id: novoId(e, 'iv'), numero: `INV-${ano}-${String(proximoNumero(e, `inventario${ano}`, 1)).padStart(4, '0')}`,
    locaisIds: ids, esperados, leituras: [], situacao: 'aberto', abertoEm: instante(ctx), abertoPor: ctx.quem,
  };
  e.inventarios.push(inv);
  registrar(e, ctx, 'inventario', inv.id, 'criado', `Inventário aberto: ${ids.map((id) => codigoLocal(e, id)).join(', ')} (${esperados.length} dormentes esperados)`, inv.numero);
  return inv;
}

function aberto(e: Estado, id: Id): Inventario {
  const inv = achar(e.inventarios, (x) => x.id === id, 'Inventário');
  if (inv.situacao !== 'aberto') falha(409, `O inventário ${inv.numero} já foi fechado.`);
  return inv;
}

/** Dormentes que a leitura de um fardo cobre: os que estão nele no pátio (em estoque, reservados, aguardando inspeção). */
const doFardo = (e: Estado, fardoId: Id) => e.dormentes.filter((d) => d.fardoId === fardoId && d.situacao !== 'reprovado' && NO_PATIO.has(d.situacao));

export function lerNoInventario(e: Estado, id: Id, leitura: { tipo: 'fardo' | 'dormente'; id: Id; localId: Id }, ctx: Ctx): RetornoLeituraInventario {
  const inv = aberto(e, id);
  if (!inv.locaisIds.includes(leitura.localId)) falha(422, 'Este local não está no inventário.', { localId: 'Escolha um local do inventário.' });
  const codigo = leitura.id?.trim().toUpperCase();
  const existe = leitura.tipo === 'fardo' ? e.fardos.some((f) => f.id === codigo) : e.dormentes.some((d) => d.id === codigo);
  if (!existe) falha(404, `${leitura.tipo === 'fardo' ? 'Fardo' : 'Dormente'} ${codigo} não encontrado no sistema. Confira a etiqueta.`);
  const repetido = inv.leituras.some((l) => l.tipo === leitura.tipo && l.id === codigo && l.localId === leitura.localId);
  inv.leituras.push({ tipo: leitura.tipo, id: codigo, localId: leitura.localId, quando: instante(ctx), quem: ctx.quem });
  const aqui = codigoLocal(e, leitura.localId);
  if (repetido) return { situacao: 'repetido', mensagem: `${codigo} já tinha sido lido em ${aqui}.`, quantidade: 0 };

  const esperado = (dId: Id) => inv.esperados.find((x) => x.dormenteId === dId);
  if (leitura.tipo === 'fardo') {
    const ds = doFardo(e, codigo);
    if (!ds.length) return { situacao: 'inesperado', mensagem: `Fardo ${codigo} sem dormentes no pátio: confira e justifique no fechamento.`, quantidade: 0 };
    const de = esperado(ds[0].id)?.localId ?? localDoDormente(e, ds[0])?.id;
    if (de === leitura.localId) return { situacao: 'conferido', mensagem: `Fardo ${codigo}: ${ds.length} dormente(s) conferidos.`, quantidade: ds.length };
    return { situacao: 'local_errado', mensagem: `Fardo ${codigo} deveria estar em ${codigoLocal(e, de)}: será transferido para ${aqui} no fechamento.`, quantidade: ds.length };
  }
  const d = e.dormentes.find((x) => x.id === codigo)!;
  const esp = esperado(d.id);
  if (esp && esp.localId === leitura.localId) return { situacao: 'conferido', mensagem: `Dormente ${codigo} conferido.`, quantidade: 1 };
  if (esp && d.situacao === 'reprovado') return { situacao: 'local_errado', mensagem: `Reprovado ${codigo} deveria estar em ${codigoLocal(e, esp.localId)}: o local será corrigido no fechamento.`, quantidade: 1 };
  return { situacao: 'inesperado', mensagem: `Dormente ${codigo} não era esperado em ${aqui} (${motivoInesperado(e, d)}): justifique no fechamento.`, quantidade: 1 };
}

function motivoInesperado(e: Estado, d: Dormente): string {
  switch (d.situacao) {
    case 'baixado': return `baixado na ${d.rmeNumero ?? 'RME'}`;
    case 'perdido': return 'registrado como perdido';
    case 'retirado': return 'retirado pelo fornecedor';
    case 'nao_localizado': return 'estava não localizado: inspecione para voltar ao fluxo';
    case 'emitido': return 'o fardo ainda não foi recebido';
    default: return `é do fardo ${d.fardoId}, que está em ${codigoLocal(e, localDoDormente(e, d)?.id)}`;
  }
}

/**
 * O resultado do inventário (o mesmo na prévia e no fechamento). Onde cada dormente foi visto: a última leitura dele ou
 * do seu fardo. Conferido: lido no local esperado. Local errado: o fardo lido (pelo QR do fardo, ou todos os seus
 * dormentes lidos) noutro local do inventário, ou o reprovado lido noutro local. Não encontrado: esperado e não lido.
 * Inesperado: lido onde não era esperado (baixado, perdido, retirado, não localizado, em trânsito ou de outro fardo).
 */
export function analisarInventario(e: Estado, inv: Inventario, justificativas: Record<string, string> = {}): ResultadoInventario {
  const visto = new Map<Id, Id>();               // dormente → local onde foi visto
  const viaFardo = new Map<Id, Id>();             // fardo → local onde o QR do fardo foi lido
  const individual = new Map<Id, Id>();           // dormente lido pelo próprio QR → local
  const fardosSemSaldo: { id: Id; localId: Id }[] = [];
  for (const l of inv.leituras) {
    if (l.tipo === 'fardo') {
      const ds = doFardo(e, l.id);
      if (!ds.length && !fardosSemSaldo.some((x) => x.id === l.id)) fardosSemSaldo.push({ id: l.id, localId: l.localId });
      viaFardo.set(l.id, l.localId);
      for (const d of ds) visto.set(d.id, l.localId);
    } else {
      visto.set(l.id, l.localId);
      individual.set(l.id, l.localId);
    }
  }
  // Os esperados que continuam no pátio (o que saiu por uma operação durante o inventário não conta).
  const esperados = inv.esperados.filter((x) => NO_PATIO.has(e.dormentes.find((d) => d.id === x.dormenteId)?.situacao ?? 'baixado'));
  const espPorId = new Map(esperados.map((x) => [x.dormenteId, x]));
  const diferencas: DiferencaInventario[] = [];
  const conferidos = new Set<Id>();
  const movidos = new Map<Id, { de: Id; para: Id; quantidade: number }>();   // fardo → correção

  // Fardo em local errado: o fardo lido (QR do fardo) noutro local, ou todos os seus dormentes esperados lidos noutro
  // local único. Vale também para o fardo esperado fora dos locais do inventário, quando o QR do fardo é lido.
  const fardos = new Set([...esperados.map((x) => x.fardoId), ...viaFardo.keys()]);
  for (const fardoId of fardos) {
    const ds = doFardo(e, fardoId);
    if (!ds.length) continue;
    const de = espPorId.get(ds[0].id)?.localId ?? localDoDormente(e, ds[0])?.id;
    const locaisVistos = new Set(ds.map((d) => visto.get(d.id)).filter((x): x is Id => !!x));
    const para = viaFardo.get(fardoId) ?? (locaisVistos.size === 1 && ds.every((d) => visto.has(d.id)) ? [...locaisVistos][0] : undefined);
    if (para && de && para !== de) movidos.set(fardoId, { de, para, quantidade: ds.length });
  }
  for (const [fardoId, m] of movidos) {
    diferencas.push({ grupo: 'local_errado', tipo: 'fardo', id: fardoId, fardoId, localId: m.de, lidoEmId: m.para, quantidade: m.quantidade, motivo: `Lido em ${codigoLocal(e, m.para)}; estava registrado em ${codigoLocal(e, m.de)}.` });
    for (const d of doFardo(e, fardoId)) conferidos.add(d.id);
  }

  for (const x of esperados) {
    if (conferidos.has(x.dormenteId)) continue;
    const d = e.dormentes.find((y) => y.id === x.dormenteId)!;
    const onde = visto.get(x.dormenteId);
    if (onde === x.localId) { conferidos.add(x.dormenteId); continue; }
    if (onde && d.situacao === 'reprovado') {
      diferencas.push({ grupo: 'local_errado', tipo: 'dormente', id: d.id, fardoId: d.fardoId, localId: x.localId, lidoEmId: onde, quantidade: 1, motivo: `Reprovado lido em ${codigoLocal(e, onde)}; estava registrado em ${codigoLocal(e, x.localId)}.` });
      conferidos.add(d.id);
      continue;
    }
    if (!onde) {
      diferencas.push({ grupo: 'nao_encontrado', tipo: 'dormente', id: d.id, fardoId: d.fardoId, localId: x.localId, quantidade: 1, motivo: `Esperado em ${codigoLocal(e, x.localId)} e não lido.${d.situacao === 'reservado' ? ` Estava reservado para a ${d.rmeNumero}.` : ''}` });
    }
  }

  // Inesperados: lidos onde não eram esperados (e não explicados pela correção de local do fardo).
  const inesperado = (tipo: 'fardo' | 'dormente', id: Id, fardoId: Id, lidoEmId: Id, motivo: string) => {
    const justificativa = justificativas[`${tipo}:${id}`]?.trim();
    diferencas.push({ grupo: 'inesperado', tipo, id, fardoId, lidoEmId, quantidade: 1, motivo, justificativa: justificativa || undefined });
  };
  for (const [dId, onde] of individual) {
    if (conferidos.has(dId)) continue;
    const d = e.dormentes.find((x) => x.id === dId)!;
    const esp = espPorId.get(dId);
    if (esp && esp.localId === onde) continue;
    inesperado('dormente', dId, d.fardoId, onde, `Lido em ${codigoLocal(e, onde)}: ${motivoInesperado(e, d)}.`);
  }
  for (const f of fardosSemSaldo) inesperado('fardo', f.id, f.id, f.localId, `Fardo lido em ${codigoLocal(e, f.localId)} sem dormentes no pátio (baixado, perdido ou não recebido).`);

  // Localizados: achados em qualquer local do inventário. No lugar certo: lidos no local esperado (sem correção).
  const pct = (n: number, de: number) => (de ? Math.round((n / de) * 1000) / 10 : 100);
  const porLocal = inv.locaisIds.map((localId) => {
    const doLocal = esperados.filter((x) => x.localId === localId);
    const localizados = doLocal.filter((x) => visto.has(x.dormenteId)).length;
    const noLugarCerto = doLocal.filter((x) => conferidos.has(x.dormenteId) && !movidos.has(x.fardoId) && !diferencas.some((d) => d.tipo === 'dormente' && d.id === x.dormenteId)).length;
    const dif = diferencas.filter((d) => d.localId === localId || (d.grupo === 'inesperado' && d.lidoEmId === localId)).length;
    return {
      localId, esperados: doLocal.length, localizados, noLugarCerto,
      percentualLocalizados: pct(localizados, doLocal.length), percentualNoLugarCerto: pct(noLugarCerto, doLocal.length), diferencas: dif,
    };
  });
  const localizados = porLocal.reduce((s, l) => s + l.localizados, 0);
  const noLugarCerto = porLocal.reduce((s, l) => s + l.noLugarCerto, 0);
  return {
    porLocal, esperados: esperados.length, localizados, noLugarCerto,
    percentualLocalizados: pct(localizados, esperados.length), percentualNoLugarCerto: pct(noLugarCerto, esperados.length), diferencas,
  };
}

/**
 * Fecha o inventário (numa escrita só): corrige o local errado por transferência automática (com evento), passa os não
 * encontrados a "não localizado" (seguem o fluxo de perda; o reservado sai da separação da RME, que volta a "em
 * separação" para completar; as demais reservas ficam) e grava os inesperados com a justificativa, obrigatória.
 */
export function fecharInventario(e: Estado, id: Id, justificativas: Record<string, string>, ctx: Ctx): Inventario {
  const inv = aberto(e, id);
  const r = analisarInventario(e, inv, justificativas ?? {});
  const faltando = r.diferencas.filter((d) => d.grupo === 'inesperado' && !d.justificativa);
  if (faltando.length) {
    falha(422, `Justifique ${faltando.length === 1 ? 'o item inesperado' : `os ${faltando.length} itens inesperados`} antes de fechar.`,
      Object.fromEntries(faltando.map((d) => [`${d.tipo}:${d.id}`, 'Justificativa obrigatória.'])));
  }
  const ref = inv.numero;
  for (const d of r.diferencas) {
    if (d.grupo === 'local_errado' && d.tipo === 'fardo') {
      const f = achar(e.fardos, (x) => x.id === d.fardoId, 'Fardo');
      const ds = doFardo(e, f.id);
      const descricao = `Corrigido no inventário ${ref}: estava registrado em ${codigoLocal(e, d.localId)}, lido em ${codigoLocal(e, d.lidoEmId)}`;
      e.movimentacoes.push({ id: novoId(e, 'mv'), tipo: 'transferencia', fardoId: f.id, dormentesIds: ds.map((x) => x.id), quantidade: ds.length, deLocalId: f.localId, paraLocalId: d.lidoEmId, quando: instante(ctx), quem: ctx.quem, referencia: ref });
      f.localId = d.lidoEmId;
      registrar(e, ctx, 'fardo', f.id, 'transferido', descricao, ref);
      for (const x of ds) registrar(e, ctx, 'dormente', x.id, 'transferido', descricao, ref);
    } else if (d.grupo === 'local_errado') {
      const x = achar(e.dormentes, (y) => y.id === d.id, 'Dormente');
      e.movimentacoes.push({ id: novoId(e, 'mv'), tipo: 'transferencia', fardoId: x.fardoId, dormentesIds: [x.id], quantidade: 1, deLocalId: x.localId, paraLocalId: d.lidoEmId, quando: instante(ctx), quem: ctx.quem, referencia: ref });
      x.localId = d.lidoEmId;
      registrar(e, ctx, 'dormente', x.id, 'transferido', `Corrigido no inventário ${ref}: reprovado lido em ${codigoLocal(e, d.lidoEmId)}`, ref);
    } else if (d.grupo === 'nao_encontrado') {
      const x = achar(e.dormentes, (y) => y.id === d.id, 'Dormente');
      const rme = x.situacao === 'reservado' ? e.rmes.find((y) => y.numero === x.rmeNumero) : undefined;
      movimentarDormentes(e, [x.id], 'nao_localizado', { evento: { tipo: 'nao_localizado', descricao: `Não encontrado no inventário ${ref} (${codigoLocal(e, d.localId)})`, referencia: ref } }, ctx);
      // Reservado não encontrado: só ele sai da separação; as demais reservas ficam (e o fardo na expedição também).
      // A RME volta a "em separação" para completar a quantidade que falta.
      if (rme?.separacao) {
        rme.separacao = rme.separacao.map((l) => ({ ...l, dormentesIds: l.dormentesIds.filter((y) => y !== x.id) })).filter((l) => l.dormentesIds.length);
        if (rme.situacao === 'pronta') rme.situacao = 'em_separacao';
        const faltam = rme.itens.reduce((s, i) => s + i.quantidade, 0) - rme.separacao.reduce((s, l) => s + l.dormentesIds.length, 0);
        registrar(e, ctx, 'rme', rme.id, 'alterado', `Dormente ${x.id} não encontrado no inventário ${ref}: saiu da separação; faltam ${faltam} para completar`, ref);
      }
    } else {
      registrar(e, ctx, d.tipo === 'fardo' ? 'fardo' : 'dormente', d.id, 'ocorrencia', `Inesperado no inventário ${ref}: ${d.motivo} Justificativa: ${d.justificativa}`, ref);
    }
  }
  inv.situacao = 'fechado';
  inv.fechadoEm = instante(ctx);
  inv.fechadoPor = ctx.quem;
  inv.resultado = r;
  const n = (g: string) => r.diferencas.filter((d) => d.grupo === g).length;
  registrar(e, ctx, 'inventario', inv.id, 'fechado', `Inventário fechado: ${r.localizados} de ${r.esperados} localizados (${r.percentualLocalizados}%), ${r.noLugarCerto} no lugar certo (${r.percentualNoLugarCerto}%); ${n('local_errado')} em local errado, ${n('nao_encontrado')} não encontrado(s), ${n('inesperado')} inesperado(s)`, ref);
  return inv;
}

/** Último inventário fechado de cada local ativo (relatórios do IBAMA e Inventário para vistoria). */
export function inventarioPorLocal(e: Estado): InventarioDoLocal[] {
  const fechados = e.inventarios.filter((i) => i.situacao === 'fechado' && i.resultado).sort((a, b) => b.fechadoEm!.localeCompare(a.fechadoEm!));
  return e.locais.filter((l) => l.ativo).map((l) => {
    const inv = fechados.find((i) => i.locaisIds.includes(l.id));
    const r = inv?.resultado?.porLocal.find((x) => x.localId === l.id);
    const difs = inv?.resultado?.diferencas.filter((d) => d.localId === l.id || (d.grupo === 'inesperado' && d.lidoEmId === l.id)) ?? [];
    return {
      localId: l.id, inventarioId: inv?.id, numero: inv?.numero, fechadoEm: inv?.fechadoEm,
      esperados: r?.esperados ?? 0, localizados: r?.localizados ?? 0, noLugarCerto: r?.noLugarCerto ?? 0,
      percentualLocalizados: r?.percentualLocalizados, percentualNoLugarCerto: r?.percentualNoLugarCerto,
      localErrado: difs.filter((d) => d.grupo === 'local_errado').length,
      naoEncontrados: difs.filter((d) => d.grupo === 'nao_encontrado').length,
      inesperados: difs.filter((d) => d.grupo === 'inesperado').length,
    };
  });
}
