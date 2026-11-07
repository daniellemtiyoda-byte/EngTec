import { describe, expect, it } from 'vitest';
import { ataView, contratoView, dofView, entregaView, fardoView, saldoPorItem } from './consultas';
import { criarDados } from './data';
import { violacoes } from './invariantes';

/** História de demonstração (seção 15 do plano), gerada numa data fixa. */
const AGORA = new Date('2026-11-06T12:00:00-03:00');
const HOJE = '2026-11-06';
const e = criarDados(AGORA);

describe('história de demonstração', () => {
  it('respeita todos os invariantes do modelo', () => {
    expect(violacoes(e, HOJE)).toEqual([]);
  });

  it('o verificador acusa estado quebrado', () => {
    const quebrado = criarDados(AGORA);
    quebrado.dormentes.find((d) => d.situacao === 'em_estoque')!.situacao = 'reservado';
    quebrado.dormentes.push({ ...quebrado.dormentes[0] });
    quebrado.entregas.find((x) => x.situacao === 'a_caminho')!.situacao = 'recebida';
    const erros = violacoes(quebrado, HOJE);
    expect(erros.some((x) => x.startsWith('ID repetido'))).toBe(true);
    expect(erros.some((x) => x.includes('sem RME pronta'))).toBe(true);
    expect(erros.some((x) => x.startsWith('Entrega'))).toBe(true);
  });

  it('é determinística: mesmos IDs em qualquer dia', () => {
    expect(JSON.stringify(criarDados(AGORA))).toBe(JSON.stringify(e));
    const outroDia = criarDados(new Date('2027-03-15T08:00:00-03:00'));
    expect(outroDia.dormentes.map((d) => d.id)).toEqual(e.dormentes.map((d) => d.id));
    expect(outroDia.fardos.map((f) => f.id)).toEqual(e.fardos.map((f) => f.id));
  });

  it('tem a entrega "a caminho" com os IDs fixos documentados', () => {
    const aCaminho = e.entregas.filter((x) => x.situacao === 'a_caminho');
    expect(aCaminho).toHaveLength(1);
    expect(aCaminho[0].fardosIds).toEqual(['AR00224-01-F006', 'AR00224-01-F007', 'AR00224-01-F008']);
    const dormentes = e.dormentes.filter((d) => aCaminho[0].fardosIds.includes(d.fardoId)).map((d) => d.id);
    expect(dormentes[0]).toBe('AR00224-01-000071');
    expect(dormentes[dormentes.length - 1]).toBe('AR00224-01-000112');
    expect(dormentes).toHaveLength(42);
    expect(entregaView(e, aCaminho[0], HOJE).nivelPrazo).toBe('atencao');
  });

  it('tem cadastros, atas e contratos como no plano (itens reais da CPTM)', () => {
    expect(e.fornecedores).toHaveLength(3);
    expect(e.especies).toHaveLength(4);
    // 12 itens de compra (código de material CPTM), 240 × 170 mm; só o 2,80 m é de via corrente.
    expect(e.tamanhos.map((t) => t.codigo)).toEqual(['006234', '006219', '006220', '006221', '006222', '006223', '006224', '006225', '006226', '006227', '006228', '006231']);
    expect(e.tamanhos.every((t) => t.larguraCm === 24 && t.alturaCm === 17)).toBe(true);
    expect(e.tamanhos.filter((t) => t.uso === 'via_corrente').map((t) => t.comprimentoCm)).toEqual([280]);
    expect(e.tratamentos).toHaveLength(2);
    expect(e.empresasInspetoras.map((x) => x.nome)).toEqual(['IPT', 'UFV']);
    expect(e.locais.map((l) => l.tipo).sort()).toEqual(['armazenagem', 'armazenagem', 'armazenagem', 'armazenagem', 'armazenagem', 'expedicao', 'inspecao', 'segregacao']);
    expect(e.atas.map((a) => a.numero)).toEqual(['AR00224', 'AR00311']);
    expect(e.atas[0].regras).toMatchObject({ pedidoMinimo: 6000, maxParcelas: 6, parcelaMinima: 3000, parcelaMaxima: 6000 });
    expect(e.atas.every((a) => ataView(e, a, HOJE).vigente)).toBe(true);
    const contratos = e.contratos.map((c) => contratoView(e, c, HOJE));
    expect(contratos.map((c) => `${c.numero}:${c.situacao}`)).toEqual([
      'AR00311-02:concluido', 'AR00311-01:vigente', 'AR00224-01:vigente', 'AR00224-02:vigente', 'AR00311-03:vigente', 'AR00224-03:vigente',
    ]);
    expect(e.fornecedores.filter((f) => f.ctfValidade < HOJE)).toHaveLength(1);
    // Pessoas fictícias: nenhum gestor com nome de documento real.
    expect(e.contratos.every((c) => c.gestor.startsWith('Gestor Exemplo'))).toBe(true);
  });

  it('tem o cronograma: AR00224-01 no prazo, um único atraso proposital e o recebimento definitivo do contrato concluído', () => {
    const [c5, c3, c1] = e.contratos.map((c) => contratoView(e, c, HOJE));
    expect(c1.parcelas.map((p) => p.situacao)).toEqual(['a_entregar', 'a_entregar']);
    expect(c3.parcelas.map((p) => p.situacao)).toEqual(['entregue_com_atraso', 'atrasada']);
    expect(e.contratos.reduce((t, c) => t + contratoView(e, c, HOJE).parcelasAtrasadas, 0)).toBe(1);
    expect(c5.parcelas[0].situacao).toBe('entregue');
    expect(c5.recebimentoDefinitivoEm).toBe('2026-07-09');
    expect(e.entregas.every((x) => c5.id !== x.contratoId || x.laudo)).toBe(true);
  });

  it('tem espécie, classe e tratamento por fardo e dormente, e laudos em todas as fases', () => {
    expect(e.fardos.every((f) => e.dormentes.filter((d) => d.fardoId === f.id).every((d) => d.especieId === f.especieId && d.classe === f.classe && d.tratamentoId === f.tratamentoId))).toBe(true);
    expect(new Set(e.fardos.map((f) => f.especieId)).size).toBeGreaterThan(2);
    expect(e.fardos.some((f) => f.classe === 2)).toBe(true);
    const etapas = e.entregas.map((x) => entregaView(e, x, HOJE)).map((x) => `${x.etapa}${x.nivelPrazoLaudo ? `:${x.nivelPrazoLaudo}` : ''}`);
    expect(etapas.filter((x) => x === 'concluida')).toHaveLength(4);
    expect(etapas).toContain('aguardando_laudo:vencido');
    expect(e.entregas.filter((x) => x.reentrega)).toHaveLength(1);
    expect(e.entregas.filter((x) => x.boletim && x.relatorioTecnico)).toHaveLength(e.entregas.length);
  });

  it('tem reprovados retirados e aguardando retirada', () => {
    expect(e.dormentes.filter((d) => d.situacao === 'retirado')).toHaveLength(6);
    const aguardando = e.fardos.filter((f) => f.reprovacao && !f.reprovacao.retiradoEm);
    expect(aguardando.filter((f) => f.reprovacao!.comunicadoEm).length).toBeGreaterThan(0);
    expect(aguardando.filter((f) => !f.reprovacao!.comunicadoEm).length).toBeGreaterThan(0);
  });

  it('declarou só DOFs de entregas já recebidas', () => {
    expect(e.dofs.filter((d) => d.declarado).every((d) => e.entregas.find((x) => x.dofId === d.id)?.situacao !== 'a_caminho')).toBe(true);
  });

  it('tem entregas em todas as fases', () => {
    const situacoes = e.fardos.map((f) => fardoView(e, f, HOJE).situacao);
    expect(situacoes.filter((s) => s === 'em_transito')).toHaveLength(4); // 3 da entrega a caminho + 1 da recebida em parte
    expect(situacoes.filter((s) => s === 'aguardando_inspecao')).toHaveLength(2);
    expect(situacoes.filter((s) => s === 'em_inspecao')).toHaveLength(1);
    expect(e.entregas.filter((x) => x.situacao === 'recebida_parcial')).toHaveLength(1);
  });

  it('tem ~5% de reprovados, uma reposição e 2 não localizados', () => {
    const inspecionados = e.dormentes.filter((d) => ['em_estoque', 'reservado', 'baixado', 'reprovado', 'retirado'].includes(d.situacao));
    const reprovados = e.dormentes.filter((d) => d.situacao === 'reprovado' || d.situacao === 'retirado').length;
    expect(reprovados / inspecionados.length).toBeGreaterThan(0.03);
    expect(reprovados / inspecionados.length).toBeLessThan(0.08);
    expect(e.dormentes.filter((d) => d.situacao === 'nao_localizado')).toHaveLength(2);
    expect(e.dormentes.filter((d) => d.situacao === 'perdido')).toHaveLength(1);
    expect(e.perdas.filter((p) => !p.comunicadoEm)).toHaveLength(1);
    const c2 = contratoView(e, e.contratos[0], HOJE);
    expect(c2.itens[0].emitidos).toBe(30);
    expect(c2.itens[0].aprovados).toBe(28);
  });

  it('tem fardos acima do limite de dias, em cura, 1 item em falta e 1 em excesso', () => {
    const fardos = e.fardos.map((f) => fardoView(e, f, HOJE));
    expect(fardos.filter((f) => f.acimaLimiteDias).map((f) => f.id)).toEqual(['AR00311-02-F002', 'AR00311-02-F003']);
    // Em cura (CCA/CCB: 15 dias do tratamento): saldo físico, mas nada disponível, até a liberação.
    const emCura = fardos.filter((f) => f.emCuraAte);
    expect(emCura.map((f) => f.id)).toEqual(['AR00224-02-F001', 'AR00224-02-F002']);
    expect(emCura.every((f) => f.disponivel === 0 && f.saldo > 0 && f.emCuraAte! > HOJE)).toBe(true);
    expect(e.fardos.every((f) => f.usinaTratamento && f.dataTratamento)).toBe(true);
    const saldo = saldoPorItem(e, HOJE);
    expect(saldo.some((s) => s.emCura > 0 && !!s.liberacaoCura)).toBe(true);
    expect(saldo.filter((s) => s.situacao === 'falta')).toHaveLength(1);
    expect(saldo.filter((s) => s.situacao === 'excesso')).toHaveLength(1);
  });

  it('tem as DOFs: 1 vencida, 1 em 1 dia, 1 em 3 dias e as demais declaradas', () => {
    const niveis = e.dofs.map((d) => dofView(e, d, HOJE)).map((d) => (d.declarado ? 'declarada' : d.nivelPrazo)).sort();
    expect(niveis).toEqual(['atencao', 'critico', 'declarada', 'declarada', 'declarada', 'declarada', 'declarada', 'declarada', 'vencido']);
  });

  it('tem as RMEs em cada situação, com fardo aberto pela saída', () => {
    const conta = (s: string) => e.rmes.filter((r) => r.situacao === s).length;
    expect([conta('aberta'), conta('em_separacao'), conta('pronta'), conta('entregue'), conta('cancelada')]).toEqual([1, 1, 1, 3, 1]);
    expect(e.fardos.map((f) => fardoView(e, f, HOJE)).some((f) => f.situacao === 'em_estoque' && f.aberto)).toBe(true);
    expect(e.rmes.map((r) => r.numero)).toEqual(['RME-2026-0001', 'RME-2026-0002', 'RME-2026-0003', 'RME-2026-0004', 'RME-2026-0005', 'RME-2026-0006', 'RME-2026-0007']);
  });
});
