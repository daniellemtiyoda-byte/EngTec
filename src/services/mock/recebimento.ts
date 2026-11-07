import { dataSP, justificativaPorFalta } from '../../dominio/parametros';
import type { Entrega, Id, Ocorrencia, PreviaRecebimento, Recebimento } from '../../types/models';
import type { DadosRecebimento, FaltaDormentes } from '../contracts';
import { divergenciaVolume as calcularDivergencia, dormentesDoFardo, entregaView } from './consultas';
import { exigirReentregaLiberada } from './documentos';
import { achar, anexo, registrar, falha, instante, novoId, proximoNumero, type Ctx, type EntregaReg, type Estado, type FardoReg } from './estado';
import { movimentarDormentes } from './estoque';

/**
 * Recebimento de uma entrega "a caminho" (seção 9.7 do plano). Fardo esperado e lido entra; fardo do mesmo contrato,
 * emitido e sem entrega, também entra (a entrega pode não ter indicado os fardos, regra provisória); qualquer outro
 * vira ocorrência "fardo desconhecido". Esperado e não lido gera ocorrência de falta, continua em trânsito e pode
 * ser recebido depois. Ocorrência declarada exige descrição e foto (na falta, a foto é opcional: não se fotografa o que não chegou). Divergência de volume por espécie acima da
 * tolerância não bloqueia, mas exige justificativa; quando ela vem só dos fardos que faltaram (contando-os, a DOF
 * fecha), o sistema preenche a justificativa com a lista deles e a pessoa pode complementar. A divergência é sempre
 * a acumulada da entrega: ao receber depois os fardos que faltaram, ela é recalculada. Falta declarada num fardo lido
 * informa quantos dormentes faltavam: eles saem do recebido e do volume nominal.
 */
/**
 * Análise dos fardos lidos para uma entrega, sem gravar: aceitos (esperados ou do mesmo contrato, emitidos e sem
 * entrega), desconhecidos, faltantes, divergência de volume acumulada e a justificativa automática quando a divergência
 * vem só da falta (fardos não lidos e dormentes faltando nos lidos). Usada pela prévia da revisão e pela confirmação,
 * para as duas darem o mesmo resultado.
 */
export function analisarRecebimento(e: Estado, entrega: EntregaReg, fardosLidos: Id[], faltas: FaltaDormentes[] = []) {
  const dof = achar(e.dofs, (d) => d.id === entrega.dofId, 'DOF');
  const esperados = e.fardos.filter((f) => entrega.fardosIds.includes(f.id) && !f.recebidoEm);
  const lidosIds = [...new Set(fardosLidos.map((id) => id.trim().toUpperCase()).filter(Boolean))];
  const aceitos: FardoReg[] = [];
  const desconhecidos: Id[] = [];
  for (const id of lidosIds) {
    const f = e.fardos.find((x) => x.id === id);
    const esperado = esperados.some((x) => x.id === id);
    const avulso = !!f && f.contratoId === entrega.contratoId && !f.recebidoEm && !f.entregaId;
    if (f && (esperado || avulso)) aceitos.push(f);
    else desconhecidos.push(id);
  }
  const lidos = new Set(aceitos.map((f) => f.id));
  const faltantes = esperados.filter((f) => !lidos.has(f.id));
  // Dormentes faltando nos fardos lidos (falta declarada), somados por fardo.
  const faltaPorFardo = new Map<Id, number>();
  for (const f of faltas) if (lidos.has(f.fardoId) && f.quantidade > 0) faltaPorFardo.set(f.fardoId, (faltaPorFardo.get(f.fardoId) ?? 0) + f.quantidade);
  const recebidosDaEntrega = [...e.fardos.filter((f) => f.entregaId === entrega.id && f.recebidoEm), ...aceitos];
  const divergencia = calcularDivergencia(e, dof, recebidosDaEntrega, faltaPorFardo);
  const acima = divergencia.some((d) => d.acimaTolerancia);
  // Se, contando o que faltou (fardos e dormentes), a DOF fecha dentro da tolerância, a divergência vem só da falta.
  const semFalta = new Map([...faltaPorFardo.keys()].map((id) => [id, 0]));
  const houveFalta = faltantes.length > 0 || faltaPorFardo.size > 0;
  const soPorFalta = acima && houveFalta && calcularDivergencia(e, dof, [...recebidosDaEntrega, ...faltantes], semFalta).every((d) => !d.acimaTolerancia);
  return {
    dof, esperados, aceitos, desconhecidos, faltantes, faltaPorFardo, divergencia,
    justificativaAutomatica: soPorFalta ? justificativaPorFalta(faltantes.map((f) => f.id), [...faltaPorFardo].map(([fardoId, quantidade]) => ({ fardoId, quantidade }))) : undefined,
    exigeJustificativa: acima && !soPorFalta,
  };
}

/** Faltas de dormentes das ocorrências declaradas (tipo falta, com fardo e quantidade). */
export const faltasDasOcorrencias = (ocorrencias: DadosRecebimento['ocorrencias']): FaltaDormentes[] =>
  ocorrencias.filter((o) => o.tipo === 'falta' && o.fardoId && o.quantidade).map((o) => ({ fardoId: o.fardoId!, quantidade: o.quantidade! }));

export function previaRecebimento(e: Estado, entregaId: Id, fardosLidos: Id[], faltas: FaltaDormentes[] = []): PreviaRecebimento {
  const entrega = achar(e.entregas, (x) => x.id === entregaId, 'Entrega');
  const a = analisarRecebimento(e, entrega, fardosLidos, faltas);
  return {
    aceitos: a.aceitos.map((f) => f.id), desconhecidos: a.desconhecidos, faltantes: a.faltantes.map((f) => f.id),
    dormentes: a.aceitos.reduce((s, f) => s + Math.max(0, dormentesDoFardo(e, f.id).length - (a.faltaPorFardo.get(f.id) ?? 0)), 0),
    divergenciaVolume: a.divergencia, justificativaAutomatica: a.justificativaAutomatica, exigeJustificativa: a.exigeJustificativa,
  };
}

export function receber(e: Estado, entregaId: Id, dados: DadosRecebimento, ctx: Ctx): Recebimento {
  const entrega = achar(e.entregas, (x) => x.id === entregaId, 'Entrega');
  if (entrega.situacao === 'recebida') falha(409, 'Esta entrega já foi recebida por completo.');
  const nf = achar(e.nfs, (n) => n.id === entrega.nfId, 'NF');
  const dof = achar(e.dofs, (d) => d.id === entrega.dofId, 'DOF');
  const local = e.locais.find((l) => l.id === dados.localEsperaId);
  if (!local || !local.ativo || local.tipo !== 'inspecao') falha(422, 'Escolha o local de espera da inspeção.', { localEsperaId: 'Escolha um local ativo do tipo inspeção.' });
  // Reentrega (reposição) só depois da retirada dos reprovados do contrato.
  if (entrega.reentrega) exigirReentregaLiberada(e, entrega.contratoId);

  const { esperados, aceitos, desconhecidos, faltantes, faltaPorFardo, divergencia: divergenciaVolume, justificativaAutomatica: automatica, exigeJustificativa } =
    analisarRecebimento(e, entrega, dados.fardosLidos, faltasDasOcorrencias(dados.ocorrencias));
  if (!aceitos.length) falha(422, 'Nenhum fardo desta entrega foi lido.', { fardosLidos: 'Leia o QR de ao menos um fardo da entrega.' });

  const campos: Record<string, string> = {};
  const aceitosIds = new Set(aceitos.map((f) => f.id));
  dados.ocorrencias.forEach((o, n) => {
    if (o.tipo === 'falta') {
      const total = o.fardoId ? dormentesDoFardo(e, o.fardoId).length : 0;
      if (!o.fardoId || !aceitosIds.has(o.fardoId)) { campos[`ocorrencias.${n}`] = 'Na falta, escolha o fardo lido em que faltam dormentes.'; return; }
      if (!Number.isInteger(o.quantidade) || (o.quantidade ?? 0) < 1 || (o.quantidade ?? 0) > total) { campos[`ocorrencias.${n}`] = `Informe quantos dormentes faltam no fardo (de 1 a ${total}).`; return; }
    }
    if (!o.descricao?.trim()) campos[`ocorrencias.${n}`] = 'Descreva a ocorrência.';
    else if (o.tipo !== 'falta' && !o.fotos?.length) campos[`ocorrencias.${n}`] = 'A ocorrência exige ao menos uma foto.';
  });
  for (const [fardoId, q] of faltaPorFardo) {
    if (q > dormentesDoFardo(e, fardoId).length) campos.ocorrencias = `A falta declarada no fardo ${fardoId} passa da quantidade de dormentes dele.`;
  }
  if (Object.keys(campos).length) falha(422, 'Complete as ocorrências: descrição sempre; foto na avaria e na sobra; na falta, o fardo e a quantidade.', campos);

  // Justificativa: automática quando a divergência vem só dos fardos que faltaram (a pessoa pode complementar).
  const lidosAgora = new Set(aceitos.map((f) => f.id));
  const informada = dados.justificativaDivergencia?.trim() ?? '';
  let justificativaDivergencia: string | undefined = informada || undefined;
  let justificativaAutomatica = false;
  if (automatica) {
    const complemento = informada.startsWith(automatica) ? informada.slice(automatica.length).trim() : informada;
    justificativaDivergencia = complemento ? `${automatica} ${complemento}` : automatica;
    justificativaAutomatica = true;
  } else if (exigeJustificativa && !informada) {
    falha(422, 'A divergência de volume passa de 10% em alguma espécie (IN Ibama): informe a justificativa.', { justificativaDivergencia: 'Justificativa obrigatória.' });
  }

  // Ocorrências: as declaradas e as que o sistema gera (falta de fardo esperado e fardo desconhecido).
  const lidos = lidosAgora;
  const ocorrencias: Ocorrencia[] = [
    ...dados.ocorrencias.map((o) => ({
      tipo: o.tipo, descricao: o.descricao.trim(), fardoId: o.fardoId, quantidade: o.tipo === 'falta' ? o.quantidade : undefined, automatica: false,
      fotos: o.fotos.map((f) => anexo(e, ctx, f, 'imagem')!),
    })),
    ...faltantes.map((f) => ({ tipo: 'falta' as const, descricao: `Fardo ${f.id} não foi lido; continua em trânsito.`, fardoId: f.id, automatica: true, fotos: [] })),
    ...desconhecidos.map((id) => ({ tipo: 'fardo_desconhecido' as const, descricao: `Fardo ${id} lido não pertence a esta entrega.`, fardoId: id, automatica: true, fotos: [] })),
  ];

  const recebimentoId = novoId(e, 'rc');
  const ref = `NF ${nf.numero}`;
  for (const f of aceitos) {
    if (!f.entregaId) { f.entregaId = entrega.id; entrega.fardosIds.push(f.id); }
    f.recebidoEm = instante(ctx);
    f.localId = local.id;
    if (faltaPorFardo.get(f.id)) f.faltaDeclarada = faltaPorFardo.get(f.id);
    registrar(e, ctx, 'fardo', f.id, 'recebido', `Recebido na ${ref}, aguardando inspeção em ${local.codigo}`, ref);
    const ids = dormentesDoFardo(e, f.id).filter((d) => d.situacao === 'emitido').map((d) => d.id);
    movimentarDormentes(e, ids, 'aguardando_inspecao', { evento: { tipo: 'recebido', descricao: `Recebido na ${ref} (fardo ${f.id})`, referencia: ref } }, ctx);
  }
  for (const o of ocorrencias.filter((x) => x.fardoId && lidos.has(x.fardoId))) {
    registrar(e, ctx, 'fardo', o.fardoId!, 'ocorrencia', `Ocorrência no recebimento: ${o.descricao}`, ref);
  }
  entrega.situacao = e.fardos.filter((f) => entrega.fardosIds.includes(f.id)).every((f) => f.recebidoEm) ? 'recebida' : 'recebida_parcial';

  const rec: Recebimento = {
    id: recebimentoId, entregaId: entrega.id, nfId: nf.id, dofId: dof.id, recebidoEm: instante(ctx), recebidoPor: ctx.quem,
    canhoto: anexo(e, ctx, dados.canhoto, 'imagem'),
    fardosEsperados: esperados.map((f) => f.id), fardosLidos: aceitos.map((f) => f.id), conforme: ocorrencias.length === 0,
    ocorrencias, divergenciaVolume, justificativaDivergencia, justificativaAutomatica, localEsperaId: local.id,
  };
  e.recebimentos.push(rec);
  registrar(e, ctx, 'entrega', entrega.id, 'recebido', `Recebimento provisório: ${aceitos.length} fardo(s) em ${local.codigo}${ocorrencias.length ? `, ${ocorrencias.length} ocorrência(s)` : ''}`, ref);
  return rec;
}

/**
 * Laudo Técnico de aprovação (recebimento em duas fases): emitido depois que toda a entrega foi recebida e
 * inspecionada, com o total de aprovados e reprovados. Prazo: 20 dias úteis da entrega (alerta, não bloqueio).
 */
export function emitirLaudo(e: Estado, entregaId: Id, ctx: Ctx): Entrega {
  const en = achar(e.entregas, (x) => x.id === entregaId, 'Entrega');
  const v = entregaView(e, en, dataSP(ctx.agora()));
  if (en.laudo) falha(409, `O laudo desta entrega já foi emitido (${en.laudo.numero}).`);
  if (!v.podeEmitirLaudo) falha(409, 'O laudo só é emitido depois que todos os fardos da entrega foram recebidos e inspecionados.');
  const ds = e.dormentes.filter((d) => en.fardosIds.includes(d.fardoId));
  const reprovados = ds.filter((d) => d.situacao === 'reprovado' || d.situacao === 'retirado').length;
  const aprovados = ds.filter((d) => ['em_estoque', 'reservado', 'baixado'].includes(d.situacao)).length;
  const ano = dataSP(ctx.agora()).slice(0, 4);
  en.laudo = { numero: `LT-${ano}-${String(proximoNumero(e, 'numeroLaudo', 1)).padStart(4, '0')}`, emitidoEm: instante(ctx), emitidoPor: ctx.quem, aprovados, reprovados };
  const nf = e.nfs.find((n) => n.id === en.nfId);
  registrar(e, ctx, 'entrega', en.id, 'laudo', `Laudo Técnico ${en.laudo.numero} emitido: ${aprovados} aprovados, ${reprovados} reprovados`, en.laudo.numero);
  registrar(e, ctx, 'contrato', en.contratoId, 'laudo', `Laudo Técnico ${en.laudo.numero} da NF ${nf?.numero ?? ''}`, en.laudo.numero);
  for (const f of e.fardos.filter((x) => en.fardosIds.includes(x.id))) registrar(e, ctx, 'fardo', f.id, 'laudo', `Laudo Técnico ${en.laudo.numero} emitido`, nf ? `NF ${nf.numero}` : undefined);
  return entregaView(e, en, dataSP(ctx.agora()));
}
