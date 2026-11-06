import { describe, expect, it } from 'vitest';
import { contratoView, dofView, entregaView, fardoView, saldoPorItem } from './consultas';
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

  it('tem cadastros, atas e contratos como no plano', () => {
    expect(e.fornecedores).toHaveLength(3);
    expect(e.especies).toHaveLength(4);
    expect(e.tamanhos).toHaveLength(2);
    expect(e.tratamentos).toHaveLength(2);
    expect(e.empresasInspetoras.map((x) => x.nome)).toEqual(['UFV', 'Inspetora Exemplo Ltda.']);
    expect(e.locais.map((l) => l.tipo).sort()).toEqual(['armazenagem', 'armazenagem', 'armazenagem', 'armazenagem', 'armazenagem', 'expedicao', 'inspecao', 'segregacao']);
    expect(e.atas).toHaveLength(2);
    expect(e.contratos.map((c) => contratoView(e, c).situacao)).toEqual(['vigente', 'concluido', 'vigente', 'vigente']);
    expect(e.fornecedores.filter((f) => f.ctfValidade < HOJE)).toHaveLength(1);
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
    const inspecionados = e.dormentes.filter((d) => ['em_estoque', 'reservado', 'baixado', 'reprovado'].includes(d.situacao));
    const reprovados = e.dormentes.filter((d) => d.situacao === 'reprovado').length;
    expect(reprovados / inspecionados.length).toBeGreaterThan(0.03);
    expect(reprovados / inspecionados.length).toBeLessThan(0.08);
    expect(e.dormentes.filter((d) => d.situacao === 'nao_localizado')).toHaveLength(2);
    const c2 = contratoView(e, e.contratos[1]);
    expect(c2.itens[0].emitidos).toBe(30);
    expect(c2.itens[0].aprovados).toBe(28);
  });

  it('tem 1 fardo acima do limite de dias, 1 item em falta e 1 em excesso', () => {
    const parados = e.fardos.map((f) => fardoView(e, f, HOJE)).filter((f) => f.acimaLimiteDias);
    expect(parados.map((f) => f.id)).toEqual(['AR00224-01-F001']);
    const saldo = saldoPorItem(e);
    expect(saldo.filter((s) => s.situacao === 'falta')).toHaveLength(1);
    expect(saldo.filter((s) => s.situacao === 'excesso')).toHaveLength(1);
  });

  it('tem as DOFs: 1 vencida, 1 em 1 dia, 1 em 3 dias e as demais declaradas', () => {
    const niveis = e.dofs.map((d) => dofView(e, d, HOJE)).map((d) => (d.declarado ? 'declarada' : d.nivelPrazo)).sort();
    expect(niveis).toEqual(['atencao', 'critico', 'declarada', 'declarada', 'declarada', 'declarada', 'declarada', 'vencido']);
  });

  it('tem as RMEs em cada situação, com fardo aberto pela saída', () => {
    const conta = (s: string) => e.rmes.filter((r) => r.situacao === s).length;
    expect([conta('aberta'), conta('em_separacao'), conta('pronta'), conta('entregue'), conta('cancelada')]).toEqual([1, 1, 1, 3, 1]);
    expect(e.fardos.map((f) => fardoView(e, f, HOJE)).some((f) => f.situacao === 'aberto')).toBe(true);
    expect(e.rmes.map((r) => r.numero)).toEqual(['RME-2026-0001', 'RME-2026-0002', 'RME-2026-0003', 'RME-2026-0004', 'RME-2026-0005', 'RME-2026-0006', 'RME-2026-0007']);
  });
});
