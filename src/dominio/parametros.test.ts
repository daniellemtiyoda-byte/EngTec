import { describe, expect, it } from 'vitest';
import {
  categoriaDoIndice, diasEntre, diferencaVolumePct, foraDaTolerancia, nivelPrazo, prazoDeclaracao,
  resultadoDoVeredito, situacaoSaldo, sugerirDivisao, somarDias, unidadesDeM3, volumeM3, somarDiasUteis, diasUteisEntre, FERIADOS_PADRAO,
} from './parametros';

describe('inspeção (provisório)', () => {
  it('ATENÇÃO conta como reprovado', () => {
    expect(resultadoDoVeredito('APROVADO')).toBe('aprovado');
    expect(resultadoDoVeredito('ATENCAO')).toBe('reprovado');
    expect(resultadoDoVeredito('REJEITADO')).toBe('reprovado');
  });
  it('categoria pelos limites 80 e 50', () => {
    expect(categoriaDoIndice(100)).toBe(1);
    expect(categoriaDoIndice(80)).toBe(1);
    expect(categoriaDoIndice(79)).toBe(2);
    expect(categoriaDoIndice(50)).toBe(2);
    expect(categoriaDoIndice(49)).toBe(3);
    expect(categoriaDoIndice(70, [90, 60])).toBe(2);
  });
});

describe('volume', () => {
  it('calcula o m³ e converte para unidades arredondando para baixo', () => {
    expect(volumeM3(280, 24, 17)).toBeCloseTo(0.11424, 6);
    expect(unidadesDeM3(1, 0.11424)).toBe(8);
    expect(unidadesDeM3(2, 0.1)).toBe(20);
    expect(unidadesDeM3(1, 0)).toBe(0);
  });
  it('divergência acima de 10% fica fora da tolerância', () => {
    expect(diferencaVolumePct(10, 11)).toBeCloseTo(10);
    expect(foraDaTolerancia(diferencaVolumePct(10, 11))).toBe(false);
    expect(foraDaTolerancia(diferencaVolumePct(10, 11.2))).toBe(true);
    expect(foraDaTolerancia(diferencaVolumePct(10, 8.8))).toBe(true);
    expect(diferencaVolumePct(0, 0)).toBe(0);
    expect(diferencaVolumePct(0, 1)).toBe(Infinity);
  });
});

describe('prazo da DOF', () => {
  it('é o dia seguinte à validade', () => {
    expect(prazoDeclaracao('2026-11-30')).toBe('2026-12-01');
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(diasEntre('2026-11-06', '2026-11-09')).toBe(3);
  });
  it('níveis: vencido, crítico (1 dia), atenção (3 dias), ok', () => {
    const hoje = '2026-11-06';
    expect(nivelPrazo('2026-11-05', hoje)).toBe('vencido');
    expect(nivelPrazo('2026-11-06', hoje)).toBe('critico');
    expect(nivelPrazo('2026-11-07', hoje)).toBe('critico');
    expect(nivelPrazo('2026-11-08', hoje)).toBe('atencao');
    expect(nivelPrazo('2026-11-09', hoje)).toBe('atencao');
    expect(nivelPrazo('2026-11-10', hoje)).toBe('ok');
  });
});

describe('situação do saldo', () => {
  it('falta, ok e excesso', () => {
    expect(situacaoSaldo(5, 10, 50)).toBe('falta');
    expect(situacaoSaldo(10, 10, 50)).toBe('ok');
    expect(situacaoSaldo(51, 10, 50)).toBe('excesso');
  });
});

describe('dias úteis com feriados', () => {
  it('pula sábado, domingo e os feriados dos parâmetros', () => {
    // 2026-11-19 (quinta) + 1 dia útil: 20/11 é feriado (Consciência Negra), então cai na segunda 23/11.
    expect(somarDiasUteis('2026-11-19', 1)).toBe('2026-11-20');
    expect(somarDiasUteis('2026-11-19', 1, FERIADOS_PADRAO)).toBe('2026-11-23');
    expect(diasUteisEntre('2026-11-19', '2026-11-23', FERIADOS_PADRAO)).toBe(1);
    expect(diasUteisEntre('2026-11-23', '2026-11-19', FERIADOS_PADRAO)).toBe(-1);
  });
  it('tem os feriados nacionais, do estado e da cidade de São Paulo de 2026 e 2027', () => {
    expect(FERIADOS_PADRAO).toHaveLength(26);
    expect(FERIADOS_PADRAO.find((f) => f.data === '2026-04-03')?.nome).toBe('Sexta-feira Santa');
    expect(FERIADOS_PADRAO.find((f) => f.data === '2027-05-27')?.nome).toBe('Corpus Christi');
  });
});

describe('sugerirDivisao (divisão do total a enviar, uma carga de até 3 fardos do padrão)', () => {
  it('42 → 3 × 14, sem aviso', () => {
    expect(sugerirDivisao(42, 14)).toEqual({ fardos: 3, dormentesPorFardo: 14 });
    expect(sugerirDivisao(14, 14)).toEqual({ fardos: 1, dormentesPorFardo: 14 });
  });
  it('40 → 4 × 10, sem aviso', () => {
    expect(sugerirDivisao(40, 14)).toEqual({ fardos: 4, dormentesPorFardo: 10 });
  });
  it('41 (sem divisor bom) → 2 × 14 e os outros 13 ficam para a próxima emissão', () => {
    expect(sugerirDivisao(41, 14)).toEqual({
      fardos: 2, dormentesPorFardo: 14, aviso: 'Vão 28 dormentes em 2 fardos de 14. Os outros 13 ficam para a próxima emissão.',
    });
  });
  it('3.000 é limitado à carga: 3 × 14 e os outros 2.958 ficam', () => {
    expect(sugerirDivisao(3000, 14)).toEqual({
      fardos: 3, dormentesPorFardo: 14, aviso: 'Vão 42 dormentes em 3 fardos de 14. Os outros 2.958 ficam para a próxima emissão.',
    });
    expect(sugerirDivisao(43, 14).aviso).toContain('Os outros 1 ficam');
  });
  it('divisor na metade do padrão não avisa; abaixo dela, sim', () => {
    expect(sugerirDivisao(26, 14).aviso).toBeUndefined(); // 13 × 2
    expect(sugerirDivisao(38, 14).aviso).toBeDefined();
  });
  it('total menor que o padrão vira um fardo só; zero ou inválido não gera fardos', () => {
    expect(sugerirDivisao(9, 14)).toEqual({ fardos: 1, dormentesPorFardo: 9 });
    expect(sugerirDivisao(0, 14).fardos).toBe(0);
    expect(sugerirDivisao(NaN, 14).fardos).toBe(0);
  });
  it('o total enviado (fardos × por fardo) nunca passa do total pedido', () => {
    for (let n = 1; n <= 100; n++) { const d = sugerirDivisao(n, 14); expect(d.fardos * d.dormentesPorFardo).toBeLessThanOrEqual(n); }
  });
});
