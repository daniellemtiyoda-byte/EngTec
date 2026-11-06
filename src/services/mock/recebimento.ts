import { justificativaPorFalta } from '../../dominio/parametros';
import type { Id, Ocorrencia, Recebimento } from '../../types/models';
import type { DadosRecebimento } from '../contracts';
import { divergenciaVolume as calcularDivergencia, dormentesDoFardo } from './consultas';
import { achar, anexo, evento, falha, instante, novoId, type Ctx, type Estado, type FardoReg } from './estado';
import { movimentarDormentes } from './estoque';

/**
 * Recebimento de uma entrega "a caminho" (seção 9.7 do plano). Fardo esperado e lido entra; fardo do mesmo contrato,
 * emitido e sem entrega, também entra (a entrega pode não ter indicado os fardos, regra provisória); qualquer outro
 * vira ocorrência "fardo desconhecido". Esperado e não lido gera ocorrência de falta, continua em trânsito e pode
 * ser recebido depois. Ocorrência declarada exige descrição e foto. Divergência de volume por espécie acima da
 * tolerância não bloqueia, mas exige justificativa; quando ela vem só dos fardos que faltaram (contando-os, a DOF
 * fecha), o sistema preenche a justificativa com a lista deles e a pessoa pode complementar. A divergência é sempre
 * a acumulada da entrega: ao receber depois os fardos que faltaram, ela é recalculada.
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

  // Divergência de volume por espécie: DOF × tudo o que já chegou desta entrega (acumulada).
  const recebidosDaEntrega = [...e.fardos.filter((f) => f.entregaId === entrega.id && f.recebidoEm), ...aceitos];
  const divergenciaVolume = calcularDivergencia(e, dof, recebidosDaEntrega);
  const lidosAgora = new Set(aceitos.map((f) => f.id));
  const faltantes = esperados.filter((f) => !lidosAgora.has(f.id));
  const informada = dados.justificativaDivergencia?.trim() ?? '';
  let justificativaDivergencia: string | undefined;
  let justificativaAutomatica = false;
  if (divergenciaVolume.some((d) => d.acimaTolerancia)) {
    // Se, contando os fardos que faltaram, a DOF fecha dentro da tolerância, a divergência vem só da falta deles.
    const soPorFalta = faltantes.length > 0 && calcularDivergencia(e, dof, [...recebidosDaEntrega, ...faltantes]).every((d) => !d.acimaTolerancia);
    if (soPorFalta) {
      const automatica = justificativaPorFalta(faltantes.map((f) => f.id));
      const complemento = informada.startsWith(automatica) ? informada.slice(automatica.length).trim() : informada;
      justificativaDivergencia = complemento ? `${automatica} ${complemento}` : automatica;
      justificativaAutomatica = true;
    } else if (!informada) {
      falha(422, 'A divergência de volume passa de 10% em alguma espécie (IN Ibama): informe a justificativa.', { justificativaDivergencia: 'Justificativa obrigatória.' });
    } else {
      justificativaDivergencia = informada;
    }
  } else if (informada) {
    justificativaDivergencia = informada;
  }

  // Ocorrências: as declaradas e as que o sistema gera (falta de fardo esperado e fardo desconhecido).
  const lidos = lidosAgora;
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
    ocorrencias, divergenciaVolume, justificativaDivergencia, justificativaAutomatica, localEsperaId: local.id,
  };
  e.recebimentos.push(rec);
  return rec;
}
