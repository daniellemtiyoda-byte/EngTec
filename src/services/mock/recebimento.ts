import { diferencaVolumePct, foraDaTolerancia } from '../../dominio/parametros';
import type { DivergenciaVolume, Id, Ocorrencia, Recebimento } from '../../types/models';
import type { DadosRecebimento } from '../contracts';
import { dormentesDoFardo, itemDescrito } from './consultas';
import { achar, anexo, evento, falha, instante, novoId, type Ctx, type Estado, type FardoReg } from './estado';
import { movimentarDormentes } from './estoque';

/**
 * Recebimento de uma entrega "a caminho" (seção 9.7 do plano). Fardo esperado e lido entra; fardo do mesmo contrato,
 * emitido e sem entrega, também entra (a entrega pode não ter indicado os fardos, regra provisória); qualquer outro
 * vira ocorrência "fardo desconhecido". Esperado e não lido gera ocorrência de falta, continua em trânsito e pode
 * ser recebido depois. Ocorrência declarada exige descrição e foto. Divergência de volume por espécie acima da
 * tolerância não bloqueia, mas exige justificativa.
 */
export function receber(e: Estado, entregaId: Id, dados: DadosRecebimento, ctx: Ctx): Recebimento {
  const entrega = achar(e.entregas, (x) => x.id === entregaId, 'Entrega');
  if (entrega.situacao === 'recebida') falha(409, 'Esta entrega já foi recebida por completo.');
  const nf = achar(e.nfs, (n) => n.id === entrega.nfId, 'NF');
  const dof = achar(e.dofs, (d) => d.id === entrega.dofId, 'DOF');

  const local = e.locais.find((l) => l.id === dados.localEsperaId);
  if (!local || !local.ativo || local.tipo !== 'inspecao') falha(422, 'Escolha o local de espera da inspeção.', { localEsperaId: 'Escolha um local ativo do tipo inspeção.' });

  const esperados = e.fardos.filter((f) => entrega.fardosIds.includes(f.id) && !f.recebidoEm);
  const lidosIds = [...new Set(dados.fardosLidos.map((id) => id.trim().toUpperCase()).filter(Boolean))];
  const aceitos: FardoReg[] = [];
  const desconhecidos: Id[] = [];
  for (const id of lidosIds) {
    const f = e.fardos.find((x) => x.id === id);
    const esperado = esperados.some((x) => x.id === id);
    const avulso = !!f && f.contratoId === entrega.contratoId && !f.recebidoEm && !f.entregaId;
    if (f && (esperado || avulso)) aceitos.push(f);
    else desconhecidos.push(id);
  }
  if (!aceitos.length) falha(422, 'Nenhum fardo desta entrega foi lido.', { fardosLidos: 'Leia o QR de ao menos um fardo da entrega.' });

  const campos: Record<string, string> = {};
  dados.ocorrencias.forEach((o, n) => {
    if (!o.descricao?.trim()) campos[`ocorrencias.${n}`] = 'Descreva a ocorrência.';
    else if (!o.fotos?.length) campos[`ocorrencias.${n}`] = 'A ocorrência exige ao menos uma foto.';
  });
  if (Object.keys(campos).length) falha(422, 'Complete as ocorrências: descrição e foto são obrigatórias.', campos);

  // Divergência de volume por espécie: DOF da espécie × volume calculado de tudo o que já chegou desta entrega.
  const recebidosDaEntrega = [...e.fardos.filter((f) => f.entregaId === entrega.id && f.recebidoEm), ...aceitos];
  const calculado = new Map<Id, number>();
  for (const f of recebidosDaEntrega) {
    const d = itemDescrito(e, f.itemContratoId);
    calculado.set(d.especie.id, (calculado.get(d.especie.id) ?? 0) + dormentesDoFardo(e, f.id).length * d.tamanho.volumeM3);
  }
  const especies = new Set([...dof.volumes.map((v) => v.especieId), ...calculado.keys()]);
  const divergenciaVolume: DivergenciaVolume[] = [...especies].map((especieId) => {
    const documentalM3 = dof.volumes.find((v) => v.especieId === especieId)?.volumeM3 ?? 0;
    const calculadoM3 = Math.round((calculado.get(especieId) ?? 0) * 1000) / 1000;
    const percentual = diferencaVolumePct(documentalM3, calculadoM3);
    return { especieId, documentalM3, calculadoM3, percentual: Number.isFinite(percentual) ? Math.round(percentual * 10) / 10 : percentual, acimaTolerancia: foraDaTolerancia(percentual) };
  });
  if (divergenciaVolume.some((d) => d.acimaTolerancia) && !dados.justificativaDivergencia?.trim()) {
    falha(422, 'A divergência de volume passa de 10% em alguma espécie (IN Ibama): informe a justificativa.', { justificativaDivergencia: 'Justificativa obrigatória.' });
  }

  // Ocorrências: as declaradas e as que o sistema gera (falta de fardo esperado e fardo desconhecido).
  const lidos = new Set(aceitos.map((f) => f.id));
  const ocorrencias: Ocorrencia[] = [
    ...dados.ocorrencias.map((o) => ({
      tipo: o.tipo, descricao: o.descricao.trim(), fardoId: o.fardoId, automatica: false,
      fotos: o.fotos.map((f) => anexo(e, ctx, f, 'imagem')!),
    })),
    ...esperados.filter((f) => !lidos.has(f.id)).map((f) => ({ tipo: 'falta' as const, descricao: `Fardo ${f.id} não foi lido; continua em trânsito.`, fardoId: f.id, automatica: true, fotos: [] })),
    ...desconhecidos.map((id) => ({ tipo: 'fardo_desconhecido' as const, descricao: `Fardo ${id} lido não pertence a esta entrega.`, fardoId: id, automatica: true, fotos: [] })),
  ];

  const recebimentoId = novoId(e, 'rc');
  const ref = `NF ${nf.numero}`;
  for (const f of aceitos) {
    if (!f.entregaId) { f.entregaId = entrega.id; entrega.fardosIds.push(f.id); }
    f.recebidoEm = instante(ctx);
    f.localId = local.id;
    f.historico.push(evento(ctx, 'recebido', `Recebido na ${ref}, aguardando inspeção em ${local.codigo}`, ref));
    const ids = dormentesDoFardo(e, f.id).filter((d) => d.situacao === 'emitido').map((d) => d.id);
    movimentarDormentes(e, ids, 'aguardando_inspecao', { evento: { tipo: 'recebido', descricao: `Recebido na ${ref} (fardo ${f.id})`, referencia: ref } }, ctx);
  }
  for (const o of ocorrencias.filter((x) => x.fardoId && lidos.has(x.fardoId))) {
    e.fardos.find((f) => f.id === o.fardoId)?.historico.push(evento(ctx, 'ocorrencia', `Ocorrência no recebimento: ${o.descricao}`, ref));
  }
  entrega.situacao = e.fardos.filter((f) => entrega.fardosIds.includes(f.id)).every((f) => f.recebidoEm) ? 'recebida' : 'recebida_parcial';

  const rec: Recebimento = {
    id: recebimentoId, entregaId: entrega.id, nfId: nf.id, dofId: dof.id, recebidoEm: instante(ctx), recebidoPor: ctx.quem,
    fardosEsperados: esperados.map((f) => f.id), fardosLidos: aceitos.map((f) => f.id), conforme: ocorrencias.length === 0,
    ocorrencias, divergenciaVolume, justificativaDivergencia: dados.justificativaDivergencia?.trim() || undefined, localEsperaId: local.id,
  };
  e.recebimentos.push(rec);
  return rec;
}
