import { idRme, RE_RME } from '../../dominio/identificacao';
import { classeInferior, classeSugerida } from '../../dominio/parametros';
import type { Classe, Dormente, Id, ItemRme, Rme, SeparacaoFardo, SugestaoSeparacao, Usuario } from '../../types/models';
import type { DadosRme, DadosSeparacao } from '../contracts';
import { dormentesDoFardo, fardoView } from './consultas';
import { gerarDestinacoes } from './ibama';
import { achar, falha, hoje, instante, novoId, registrar, type Ctx, type Estado } from './estado';
import { devolverDaExpedicao, movimentarDormentes } from './estoque';

/*
 * Saída por requisição (seção 9.17 do plano): aberta → em separação → pronta → entregue (ou cancelada antes da
 * entrega). A separação só reserva; a baixa acontece na entrega.
 */

const DATA = /^\d{4}-\d{2}-\d{2}$/;

export const acharRme = (e: Estado, numero: string) => achar(e.rmes, (r) => r.numero === numero, `RME ${numero}`);

export function abrirRme(e: Estado, dados: DadosRme, solicitante: Usuario, ctx: Ctx): Rme {
  const campos: Record<string, string> = {};
  if (!dados.destino?.trim()) campos.destino = 'Informe a obra ou o trecho.';
  if (!['principal_pesado', 'principal_medio', 'desvio', 'patio'].includes(dados.tipoDestino)) campos.tipoDestino = 'Escolha o tipo de destino.';
  if (!DATA.test(dados.necessidadeEm ?? '')) campos.necessidadeEm = 'Informe a data de necessidade.';
  else if (dados.necessidadeEm < hoje(ctx)) campos.necessidadeEm = 'A data de necessidade já passou.';
  if (!dados.itens?.length) campos.itens = 'Informe ao menos um item.';
  const vistos = new Set<string>();
  dados.itens?.forEach((i, n) => {
    const k = chaveItem(i);
    if (!e.tamanhos.some((x) => x.id === i.tamanhoId)) campos[`itens.${n}`] = 'Escolha o tamanho.';
    else if (i.classe !== 1 && i.classe !== 2) campos[`itens.${n}`] = 'Escolha a classe (1ª ou 2ª).';
    else if (i.categoriaMinima !== undefined && ![1, 2, 3].includes(i.categoriaMinima)) campos[`itens.${n}`] = 'Categoria mínima A, B ou C (ou qualquer aprovado).';
    else if (i.especieId && !e.especies.some((x) => x.id === i.especieId)) campos[`itens.${n}`] = 'Espécie não encontrada.';
    else if (vistos.has(k)) campos[`itens.${n}`] = 'Tamanho e classe repetidos: some as quantidades numa linha.';
    else if (!Number.isInteger(i.quantidade) || i.quantidade <= 0) campos[`itens.${n}`] = 'Quantidade em unidades, maior que zero.';
    vistos.add(k);
  });
  if (Object.keys(campos).length) falha(422, 'Confira os dados da requisição.', campos);
  const ano = ctx.agora().getFullYear();
  const seq = e.rmes.map((r) => RE_RME.exec(r.numero)).filter((m) => m && Number(m[1]) === ano).reduce((max, m) => Math.max(max, Number(m![2])), 0) + 1;
  const rme: Rme = {
    id: novoId(e, 'rm'), numero: idRme(ano, seq), solicitanteId: solicitante.id, solicitanteNome: solicitante.nome,
    destino: dados.destino.trim(), tipoDestino: dados.tipoDestino, necessidadeEm: dados.necessidadeEm,
    itens: dados.itens.map((i) => ({ tamanhoId: i.tamanhoId, classe: i.classe, categoriaMinima: i.categoriaMinima || undefined, especieId: i.especieId || undefined, quantidade: i.quantidade })),
    situacao: 'aberta', criadoEm: instante(ctx),
  };
  e.rmes.push(rme);
  registrar(e, ctx, 'rme', rme.id, 'criado', `RME aberta para ${rme.destino}`, rme.numero);
  return rme;
}

export function iniciarSeparacao(e: Estado, numero: string, ctx: Ctx): Rme {
  const r = acharRme(e, numero);
  if (r.situacao === 'em_separacao') return r;
  if (r.situacao !== 'aberta') falha(409, `A RME ${r.numero} não está aberta.`);
  r.situacao = 'em_separacao';
  registrar(e, ctx, 'rme', r.id, 'reservado', 'Separação iniciada');
  return r;
}

/** Um item de RME por tamanho + classe: é por eles que o fardo se liga ao item. */
const chaveItem = (i: { tamanhoId: Id; classe: Classe }) => `${i.tamanhoId}|${i.classe}`;

/** Tamanho (pelo item do contrato) e classe de um fardo. */
function itemDoFardo(e: Estado, fardoId: Id) {
  const f = achar(e.fardos, (x) => x.id === fardoId, `Fardo ${fardoId}`);
  const item = achar(e.contratos.flatMap((c) => c.itens), (i) => i.id === f.itemContratoId, 'Item do contrato');
  return { fardo: f, tamanhoId: item.tamanhoId, classe: f.classe };
}

/** O dormente atende o item: espécie (se pedida) e categoria até a mínima pedida (1 é a melhor; sem mínima, qualquer aprovado). */
const atende = (d: Dormente, it: ItemRme) => (!it.especieId || d.especieId === it.especieId) && (!it.categoriaMinima || (d.categoria ?? 9) <= it.categoriaMinima);

/**
 * Sugestão: fardos do tamanho e da classe pedidos (qualquer espécie, se a RME não pedir uma), abertos primeiro (do mais
 * antigo ao mais novo), depois os demais do mais antigo ao mais novo, só com dormentes disponíveis (em estoque, sem
 * reserva) que atendam à categoria mínima; dentro do fardo, as menores sequências.
 */
export function sugerirSeparacao(e: Estado, numero: string, ctx: Ctx): SugestaoSeparacao {
  const r = acharRme(e, numero);
  const dia = hoje(ctx);
  const candidatos = e.fardos.map((f) => fardoView(e, f, dia)).filter((f) => f.situacao === 'em_estoque' && f.disponivel > 0);
  return {
    itens: r.itens.map((item) => {
      // Separação anterior (ex. um reservado não encontrado no inventário saiu): sugere só o que falta.
      const jaSeparados = jaReservados(e, r, item);
      const it = { ...item, quantidade: Math.max(0, item.quantidade - jaSeparados) };
      const doItem = candidatos
        .filter((f) => { const i = itemDoFardo(e, f.id); return i.tamanhoId === it.tamanhoId && i.classe === it.classe && (!it.especieId || f.especieId === it.especieId); })
        .sort((a, b) => Number(b.aberto) - Number(a.aberto) || (a.recebidoEm ?? '').localeCompare(b.recebidoEm ?? '') || a.id.localeCompare(b.id));
      const livresDo = (id: Id) => dormentesDoFardo(e, id).filter((d) => d.situacao === 'em_estoque' && atende(d, it)).map((d) => d.id).sort();
      let falta = it.quantidade;
      const fardos: SugestaoSeparacao['itens'][number]['fardos'] = [];
      for (const f of doItem) {
        if (falta <= 0) break;
        const pega = livresDo(f.id).slice(0, falta);
        fardos.push({ fardoId: f.id, dormentesIds: pega, aberto: f.aberto, idadeDias: f.idadeDias, localId: f.localId });
        falta -= pega.length;
      }
      const candidatosDoItem = doItem.map((f) => ({ fardoId: f.id, dormentesIds: livresDo(f.id), aberto: f.aberto, idadeDias: f.idadeDias, localId: f.localId })).filter((f) => f.dormentesIds.length);
      return { ...it, jaSeparados, fardos: fardos.filter((f) => f.dormentesIds.length), candidatos: candidatosDoItem, faltam: Math.max(0, falta) };
    }),
  };
}

/** Dormentes já reservados para o item nesta RME (separação anterior, mantida quando a RME volta a "em separação"). */
function jaReservados(e: Estado, r: Rme, item: ItemRme): number {
  return (r.separacao ?? []).flatMap((l) => l.dormentesIds).filter((id) => {
    const d = e.dormentes.find((x) => x.id === id);
    if (!d || d.situacao !== 'reservado') return false;
    const i = itemDoFardo(e, d.fardoId);
    return i.tamanhoId === item.tamanhoId && i.classe === item.classe;
  }).length;
}

/**
 * Separa: reserva os dormentes e deixa a RME pronta. A quantidade de cada item (somada ao que já estava reservado,
 * quando a separação é completada) tem de bater com a pedida. Trocar dormentes dentro do fardo sugerido não pede
 * justificativa; trocar de fardo ou mudar a quantidade do fardo pede.
 */
export function separarRme(e: Estado, numero: string, separacao: DadosSeparacao[], ctx: Ctx): Rme {
  const r = acharRme(e, numero);
  if (r.situacao !== 'aberta' && r.situacao !== 'em_separacao') falha(409, `A RME ${r.numero} não está aberta para separação.`);
  if (!separacao.length) falha(422, 'Informe os dormentes separados.', { separacao: 'Nada separado.' });
  const sugestao = sugerirSeparacao(e, numero, ctx);
  const sugerida = classeSugerida(r.tipoDestino);
  const dia = hoje(ctx);
  const sugeridoPorFardo = new Map(sugestao.itens.flatMap((i) => i.fardos).map((f) => [f.fardoId, f.dormentesIds.length]));

  const campos: Record<string, string> = {};
  const usados = new Set<Id>();
  const totalPorItem = new Map<string, number>();
  const linhas: SeparacaoFardo[] = separacao.map((s, n) => {
    const { fardo, tamanhoId, classe } = itemDoFardo(e, s.fardoId);
    const k = chaveItem({ tamanhoId, classe });
    const it = r.itens.find((i) => chaveItem(i) === k);
    if (!it) campos[`separacao.${n}`] = `O fardo ${fardo.id} não é do tamanho e da classe de um item desta RME.`;
    const emCura = fardoView(e, fardo, dia).emCuraAte;
    if (emCura) campos[`separacao.${n}`] = `O fardo ${fardo.id} está em cura até ${emCura}: ainda não pode ser separado.`;
    // Classe inferior à sugerida para o tipo de destino: aceita com justificativa.
    const abaixo = classeInferior(classe, sugerida);
    if (abaixo && !s.justificativaClasse?.trim()) campos[`separacao.${n}`] = `O fardo ${fardo.id} é de ${classe}ª classe, abaixo da ${sugerida}ª sugerida para o destino: informe a justificativa.`;
    const ids = [...new Set(s.dormentesIds.map((x) => x.trim().toUpperCase()))];
    if (!ids.length) campos[`separacao.${n}`] = `Nenhum dormente do fardo ${fardo.id}.`;
    for (const id of ids) {
      const d = e.dormentes.find((x) => x.id === id);
      if (!d || d.fardoId !== fardo.id) campos[`separacao.${n}`] = `O dormente ${id} não é do fardo ${fardo.id}.`;
      else if (d.situacao !== 'em_estoque') campos[`separacao.${n}`] = `O dormente ${id} não está disponível (${d.situacao}).`;
      else if (it && !atende(d, it)) campos[`separacao.${n}`] = `O dormente ${id} não atende ao item (espécie ou categoria mínima).`;
      else if (usados.has(id)) campos[`separacao.${n}`] = `O dormente ${id} aparece duas vezes.`;
      usados.add(id);
    }
    totalPorItem.set(k, (totalPorItem.get(k) ?? 0) + ids.length);
    const seguiuSugestao = sugeridoPorFardo.get(fardo.id) === ids.length;
    if (!seguiuSugestao && !s.justificativa?.trim()) campos[`separacao.${n}`] = `O fardo ${fardo.id} difere da sugestão: informe a justificativa.`;
    return {
      fardoId: fardo.id, dormentesIds: ids, seguiuSugestao, justificativa: seguiuSugestao ? undefined : s.justificativa?.trim(),
      justificativaClasse: abaixo ? s.justificativaClasse?.trim() : undefined,
    };
  });
  r.itens.forEach((i, n) => {
    const total = (totalPorItem.get(chaveItem(i)) ?? 0) + jaReservados(e, r, i);
    if (total !== i.quantidade) campos[`itens.${n}`] = `Separados ${total} de ${i.quantidade}: a quantidade tem de bater com a pedida.`;
  });
  if (Object.keys(campos).length) falha(422, 'Confira a separação.', campos);

  for (const l of linhas) {
    movimentarDormentes(e, l.dormentesIds, 'reservado', { rmeNumero: r.numero, evento: { tipo: 'reservado', descricao: `Reservado para a ${r.numero} (${r.destino})`, referencia: r.numero } }, ctx);
  }
  // Completar: as linhas novas somam-se às da separação anterior (mesmo fardo, mesma linha).
  const anterior = r.separacao ?? [];
  const juntas = [...anterior.map((l) => ({ ...l, dormentesIds: [...l.dormentesIds] }))];
  for (const l of linhas) {
    const mesma = juntas.find((x) => x.fardoId === l.fardoId);
    if (mesma) {
      mesma.dormentesIds.push(...l.dormentesIds);
      mesma.seguiuSugestao = mesma.seguiuSugestao && l.seguiuSugestao;
      mesma.justificativa = [mesma.justificativa, l.justificativa].filter(Boolean).join(' · ') || undefined;
      mesma.justificativaClasse = mesma.justificativaClasse ?? l.justificativaClasse;
    } else juntas.push(l);
  }
  r.separacao = juntas;
  r.situacao = 'pronta';
  registrar(e, ctx, 'rme', r.id, 'reservado', `${anterior.length ? 'Separação completada' : 'Separação concluída'}: ${usados.size} dormentes reservados${linhas.some((l) => !l.seguiuSugestao) ? ' (com troca de fardo justificada)' : ''}`);
  return r;
}

/** Entrega: baixa os dormentes reservados; o fardo com sobra fica aberto e o zerado, baixado. */
export function entregarRme(e: Estado, numero: string, ctx: Ctx): Rme {
  const r = acharRme(e, numero);
  if (r.situacao !== 'pronta' || !r.separacao) falha(409, `A RME ${r.numero} não está pronta para entrega.`);
  for (const l of r.separacao) {
    const f = achar(e.fardos, (x) => x.id === l.fardoId, 'Fardo');
    movimentarDormentes(e, l.dormentesIds, 'baixado', { rmeNumero: r.numero, evento: { tipo: 'baixado', descricao: `Entregue para ${r.destino}`, referencia: r.numero } }, ctx);
    e.movimentacoes.push({ id: novoId(e, 'mv'), tipo: 'saida', fardoId: f.id, dormentesIds: [...l.dormentesIds], quantidade: l.dormentesIds.length, deLocalId: f.localId, quando: instante(ctx), quem: ctx.quem, referencia: r.numero });
    registrar(e, ctx, 'fardo', f.id, 'baixado', `${l.dormentesIds.length} dormente(s) entregues para ${r.destino}`, r.numero);
  }
  r.situacao = 'entregue';
  registrar(e, ctx, 'rme', r.id, 'baixado', `Entregue para ${r.destino}`);
  gerarDestinacoes(e, r.id, ctx);
  return r;
}

/** Cancela antes da entrega: libera as reservas e devolve à origem o fardo que já estava na expedição. */
export function cancelarRme(e: Estado, numero: string, motivo: string, ctx: Ctx): Rme {
  const r = acharRme(e, numero);
  if (r.situacao === 'entregue' || r.situacao === 'cancelada') falha(409, `A RME ${r.numero} já foi ${r.situacao === 'entregue' ? 'entregue' : 'cancelada'}.`);
  if (!motivo?.trim()) falha(422, 'Informe o motivo do cancelamento.', { motivo: 'Motivo obrigatório.' });
  for (const l of r.separacao ?? []) devolverDaExpedicao(e, l.fardoId, r.numero, ctx);
  const reservados = (r.separacao ?? []).flatMap((l) => l.dormentesIds);
  if (reservados.length) movimentarDormentes(e, reservados, 'em_estoque', { evento: { tipo: 'cancelado', descricao: `Reserva liberada: ${r.numero} cancelada`, referencia: r.numero } }, ctx);
  r.situacao = 'cancelada';
  r.motivoCancelamento = motivo.trim();
  registrar(e, ctx, 'rme', r.id, 'cancelado', `Cancelada: ${motivo.trim()}`);
  return r;
}
