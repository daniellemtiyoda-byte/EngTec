import { RE_DORMENTE, RE_FARDO, sequenciaDe } from '../../dominio/identificacao';
import { contratoView, fardoView } from './consultas';
import type { Estado } from './estado';

/**
 * Invariantes do modelo (seção 5.4 do plano), conferidos nos testes depois de cada fluxo. Devolve a lista de
 * violações (vazia = tudo certo). Usado só pelos testes; não entra no app.
 */
export function violacoes(e: Estado, hoje: string): string[] {
  const erros: string[] = [];
  const v = (cond: boolean, msg: string) => { if (!cond) erros.push(msg); };

  const ids = new Set<string>();
  for (const x of [...e.fardos, ...e.dormentes]) { v(!ids.has(x.id), `ID repetido: ${x.id}`); ids.add(x.id); }
  for (const f of e.fardos) v(RE_FARDO.test(f.id), `Fardo com ID fora do formato: ${f.id}`);
  for (const d of e.dormentes) v(RE_DORMENTE.test(d.id), `Dormente com ID fora do formato: ${d.id}`);

  // Sequências de cada contrato sem buracos: IDs nunca reaproveitados nem apagados.
  for (const c of e.contratos) {
    for (const lista of [e.fardos, e.dormentes]) {
      const seqs = lista.filter((x) => x.contratoId === c.id).map((x) => sequenciaDe(x.id) ?? 0).sort((a, b) => a - b);
      seqs.forEach((s, i) => v(s === i + 1, `Sequência com buraco no contrato ${c.numero}: esperado ${i + 1}, achado ${s}`));
    }
    for (const i of contratoView(e, c).itens) v(i.emitidos - i.reprovados <= i.quantidade, `Item ${i.id} do ${c.numero} passou do contratado`);
  }

  const fardoDe = new Map(e.fardos.map((f) => [f.id, f]));
  for (const d of e.dormentes) {
    const f = fardoDe.get(d.fardoId);
    if (!f) { erros.push(`Dormente ${d.id} sem fardo`); continue; }
    v(f.contratoId === d.contratoId && f.itemContratoId === d.itemContratoId, `Dormente ${d.id} com contrato/item diferente do fardo`);
    v((d.situacao === 'emitido') === !f.recebidoEm, `Dormente ${d.id} (${d.situacao}) incoerente com o recebimento do fardo ${f.id}`);
    if (['em_estoque', 'reservado', 'baixado', 'reprovado', 'nao_localizado'].includes(d.situacao)) v(!!f.conclusaoInspecao, `Dormente ${d.id} (${d.situacao}) num fardo sem inspeção concluída`);
    if (d.situacao === 'aguardando_inspecao') v(!f.conclusaoInspecao, `Dormente ${d.id} aguardando inspeção num fardo concluído`);
    if (d.situacao === 'reprovado') v(e.locais.find((l) => l.id === d.localId)?.tipo === 'segregacao', `Reprovado ${d.id} fora da segregação`);
    if (d.situacao === 'nao_localizado') v(!!f.conclusaoInspecao?.naoLocalizados.includes(d.id) && !!f.conclusaoInspecao.justificativa, `Não localizado ${d.id} sem registro na conclusão do fardo`);
    if (d.situacao === 'reservado') v(e.rmes.find((r) => r.numero === d.rmeNumero)?.situacao === 'pronta', `Reservado ${d.id} sem RME pronta`);
    if (d.situacao === 'baixado') v(e.rmes.find((r) => r.numero === d.rmeNumero)?.situacao === 'entregue', `Baixado ${d.id} sem RME entregue`);
  }

  for (const f of e.fardos) {
    const fv = fardoView(e, f, hoje);
    const noFardo = e.dormentes.filter((d) => d.fardoId === f.id);
    v(fv.saldo === noFardo.filter((d) => d.situacao === 'em_estoque' || d.situacao === 'reservado').length, `Saldo do fardo ${f.id} diferente dos dormentes`);
    v(fv.disponivel === noFardo.filter((d) => d.situacao === 'em_estoque').length, `Disponível do fardo ${f.id} diferente dos dormentes`);
    v(fv.saldo <= f.quantidadeInicial && noFardo.length === f.quantidadeInicial, `Fardo ${f.id} com quantidade incoerente`);
    if (f.entregaId) v(!!e.entregas.find((en) => en.id === f.entregaId)?.fardosIds.includes(f.id), `Fardo ${f.id} fora da lista da sua entrega`);
  }

  for (const r of e.rmes) {
    const separados = (r.separacao ?? []).flatMap((s) => s.dormentesIds);
    const esperada = r.situacao === 'pronta' ? 'reservado' : r.situacao === 'entregue' ? 'baixado' : null;
    if (esperada) v(separados.every((id) => e.dormentes.find((d) => d.id === id)?.situacao === esperada), `RME ${r.numero} (${r.situacao}) com dormentes fora de "${esperada}"`);
    if (r.situacao === 'pronta' || r.situacao === 'entregue') v(r.itens.reduce((s, i) => s + i.quantidade, 0) === separados.length, `RME ${r.numero} separada com quantidade diferente da pedida`);
  }

  for (const en of e.entregas) {
    const fardos = e.fardos.filter((f) => en.fardosIds.includes(f.id));
    const todos = fardos.length > 0 && fardos.every((f) => f.recebidoEm);
    const algum = fardos.some((f) => f.recebidoEm);
    const esperada = todos ? 'recebida' : algum ? 'recebida_parcial' : 'a_caminho';
    v(en.situacao === esperada, `Entrega ${en.id} em "${en.situacao}", esperado "${esperada}"`);
  }
  return erros;
}
