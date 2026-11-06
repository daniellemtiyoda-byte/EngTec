import { sequenciaDe } from '../../dominio/identificacao';
import { categoriaDoIndice, resultadoDoVeredito } from '../../dominio/parametros';
import type { Categoria, Id, Inspecao, ResultadoInspecao, VereditoInspector } from '../../types/models';
import type { DadosInspecao } from '../contracts';
import { dormentesDoFardo, itemDescrito } from './consultas';
import { achar, evento, falha, instante, novoId, type Ctx, type Estado } from './estado';
import { localDeSegregacao, movimentarDormentes } from './estoque';

/*
 * Inspeção peça a peça (seção 9.10 do plano). O resultado vem do Inspector (veredito + índice), da simulação ou é
 * lançado à mão. Enquanto o fardo não é concluído, o dormente continua "aguardando inspeção" com a inspeção
 * registrada; a conclusão guarda os aprovados, segrega os reprovados e marca os não lidos como "não localizado".
 * Dormente não localizado encontrado depois é inspecionado e já segue o fluxo (estoque ou segregação).
 */

const rotuloResultado = (r: ResultadoInspecao, c?: Categoria) => (r === 'aprovado' ? `aprovado, categoria ${c}` : 'reprovado');

export function registrarInspecao(e: Estado, dormenteId: Id, dados: DadosInspecao, ctx: Ctx, fardoId?: Id): Inspecao {
  const d = e.dormentes.find((x) => x.id === dormenteId.trim().toUpperCase());
  if (!d) falha(404, `Dormente ${dormenteId} não encontrado.`, { dormenteId: 'ID não encontrado.' });
  if (fardoId && d.fardoId !== fardoId) falha(409, `O dormente ${d.id} não pertence a este fardo (é do ${d.fardoId}).`, { dormenteId: 'Não pertence a este fardo.' });
  if (d.situacao === 'emitido') falha(409, `O dormente ${d.id} ainda não foi recebido.`);
  if (d.situacao !== 'aguardando_inspecao' && d.situacao !== 'nao_localizado') falha(409, `O dormente ${d.id} já foi inspecionado e o fardo concluído.`);

  let resultado: ResultadoInspecao;
  let categoria: Categoria | undefined;
  let veredito: VereditoInspector | undefined;
  let indice: number | undefined;
  if (dados.origem === 'manual') {
    resultado = dados.resultado;
    if (resultado === 'aprovado' && !dados.categoria) falha(422, 'Informe a categoria do dormente aprovado.', { categoria: 'Categoria obrigatória para aprovado.' });
    categoria = resultado === 'aprovado' ? dados.categoria : undefined;
  } else {
    if (!(dados.indice >= 0 && dados.indice <= 100)) falha(422, 'Índice da inspeção fora de 0 a 100.', { indice: 'De 0 a 100.' });
    veredito = dados.veredito;
    indice = dados.indice;
    resultado = resultadoDoVeredito(veredito);
    categoria = resultado === 'aprovado' ? categoriaDoIndice(indice, e.parametros.limitesCategoria) : undefined;
  }

  const insp: Inspecao = {
    id: novoId(e, 'in'), dormenteId: d.id, fardoId: d.fardoId, resultado, categoria, indice, veredito, medidas: dados.medidas,
    inspetor: dados.origem === 'manual' ? ctx.quem : dados.origem === 'simulado' ? 'Inspeção simulada' : 'Railway Edge Inspector',
    inspecionadoEm: instante(ctx), origem: dados.origem, relatorioUrl: dados.origem === 'manual' ? undefined : dados.relatorioUrl,
  };
  e.inspecoes.push(insp);
  const tardia = d.situacao === 'nao_localizado';
  d.inspecaoId = insp.id;
  d.categoria = categoria;
  d.medidas = dados.medidas ?? d.medidas;
  d.historico.push(evento(ctx, 'inspecionado', `Inspecionado: ${rotuloResultado(resultado, categoria)}${dados.origem === 'manual' ? ' (lançado à mão)' : ''}`));

  if (tardia) {
    // Encontrado depois da conclusão do fardo: segue o fluxo na hora.
    const f = achar(e.fardos, (x) => x.id === d.fardoId, 'Fardo');
    if (resultado === 'aprovado') {
      const local = e.locais.find((l) => l.id === f.localId);
      movimentarDormentes(e, [d.id], 'em_estoque', { evento: { tipo: 'guardado', descricao: `Encontrado e guardado no fardo ${f.id}${local ? ` em ${local.codigo}` : ''}` } }, ctx);
    } else {
      segregar(e, f.id, [d.id], f.localId, ctx);
    }
  }
  return insp;
}

function segregar(e: Estado, fardoId: Id, ids: Id[], deLocalId: Id | undefined, ctx: Ctx) {
  if (!ids.length) return;
  const seg = localDeSegregacao(e, ctx);
  movimentarDormentes(e, ids, 'reprovado', { localId: seg.id, evento: { tipo: 'segregado', descricao: `Reprovado na inspeção, segregado em ${seg.codigo}` } }, ctx);
  e.movimentacoes.push({ id: novoId(e, 'mv'), tipo: 'segregacao', fardoId, dormentesIds: ids, quantidade: ids.length, deLocalId, paraLocalId: seg.id, quando: instante(ctx), quem: ctx.quem });
}

function exigirEmInspecao(e: Estado, fardoId: Id) {
  const f = achar(e.fardos, (x) => x.id === fardoId, 'Fardo');
  if (!f.recebidoEm) falha(409, `O fardo ${f.id} ainda não foi recebido.`);
  if (f.conclusaoInspecao) falha(409, `A inspeção do fardo ${f.id} já foi concluída.`);
  return f;
}

/**
 * Simulação determinística do Inspector para os dormentes ainda sem inspeção: cerca de 5% reprovados
 * (sequência terminada em 7 a cada 20), índice e medidas calculados pela sequência.
 */
export function simularFardo(e: Estado, fardoId: Id, ctx: Ctx) {
  const f = exigirEmInspecao(e, fardoId);
  const t = itemDescrito(e, f.itemContratoId).tamanho;
  for (const d of dormentesDoFardo(e, f.id).filter((x) => x.situacao === 'aguardando_inspecao' && !x.inspecaoId)) {
    const seq = sequenciaDe(d.id) ?? 0;
    const reprovado = seq % 20 === 7;
    const veredito: VereditoInspector = reprovado ? (seq % 40 === 7 ? 'ATENCAO' : 'REJEITADO') : 'APROVADO';
    const indice = reprovado ? 20 + (seq % 30) : 50 + ((seq * 37) % 51);
    const medidas = { comprimentoCm: t.comprimentoCm + ((seq % 3) - 1), larguraCm: t.larguraCm, alturaCm: t.alturaCm };
    registrarInspecao(e, d.id, { origem: 'simulado', veredito, indice, medidas }, ctx, f.id);
  }
}

/** Conclui a inspeção do fardo e guarda no local. Dormentes não lidos exigem justificativa e ficam "não localizado". */
export function concluirInspecao(e: Estado, fardoId: Id, dados: { localId: Id; justificativa?: string }, ctx: Ctx) {
  const f = exigirEmInspecao(e, fardoId);
  const local = e.locais.find((l) => l.id === dados.localId);
  if (!local || !local.ativo || local.tipo !== 'armazenagem') falha(422, 'Escolha o local de guarda.', { localId: 'Escolha um local ativo de armazenagem.' });
  const aguardando = dormentesDoFardo(e, f.id).filter((d) => d.situacao === 'aguardando_inspecao');
  const resultadoDe = (inspecaoId?: Id) => e.inspecoes.find((i) => i.id === inspecaoId)?.resultado;
  const aprovados = aguardando.filter((d) => resultadoDe(d.inspecaoId) === 'aprovado').map((d) => d.id);
  const reprovados = aguardando.filter((d) => resultadoDe(d.inspecaoId) === 'reprovado').map((d) => d.id);
  const naoLidos = aguardando.filter((d) => !d.inspecaoId).map((d) => d.id);
  const justificativa = dados.justificativa?.trim();
  if (naoLidos.length && !justificativa) {
    falha(422, `${naoLidos.length} dormente(s) não foram lidos. Para concluir assim, informe a justificativa: eles ficarão como não localizados.`, { justificativa: 'Justificativa obrigatória com dormentes não lidos.' });
  }

  const espera = f.localId;
  if (aprovados.length) {
    movimentarDormentes(e, aprovados, 'em_estoque', { evento: { tipo: 'guardado', descricao: `Aprovado e guardado no fardo ${f.id} em ${local.codigo}` } }, ctx);
    e.movimentacoes.push({ id: novoId(e, 'mv'), tipo: 'guarda', fardoId: f.id, dormentesIds: aprovados, quantidade: aprovados.length, deLocalId: espera, paraLocalId: local.id, quando: instante(ctx), quem: ctx.quem });
  }
  segregar(e, f.id, reprovados, espera, ctx);
  if (naoLidos.length) {
    movimentarDormentes(e, naoLidos, 'nao_localizado', { evento: { tipo: 'nao_localizado', descricao: `Não lido na inspeção do fardo ${f.id}: ${justificativa}` } }, ctx);
  }
  f.localId = local.id;
  f.conclusaoInspecao = { quando: instante(ctx), quem: ctx.quem, justificativa: naoLidos.length ? justificativa : undefined, naoLocalizados: naoLidos };
  f.historico.push(evento(ctx, 'inspecionado', `Inspeção concluída: ${aprovados.length} aprovados, ${reprovados.length} reprovados${naoLidos.length ? `, ${naoLidos.length} não localizados` : ''}`));
  f.historico.push(evento(ctx, 'guardado', `Guardado em ${local.codigo}`));
  return f;
}
