import { describe, expect, it } from 'vitest';
import type { Contrato, ItemContrato } from '../types/models';
import { avisoSequenciaContrato, gestorSugerido, maiorSequenciaDaAta, proximoNumeroContrato, tamanhosDaParcela } from './contratos';

const c = (numero: string, dataAssinatura: string, gestor: string) => ({ numero, dataAssinatura, gestor });

describe('próxima sequência do contrato', () => {
  it('maior sequência + 1, contando cancelados e fora de ordem', () => {
    const lista = [c('AR00224-01', '2026-01-10', 'A'), c('AR00224-03', '2026-03-10', 'B'), c('AR00224-02', '2026-02-10', 'C')];
    expect(maiorSequenciaDaAta(lista)).toBe(3);
    expect(proximoNumeroContrato('AR00224', lista)).toBe('AR00224-04');
  });
  it('ata sem contratos começa em 01', () => expect(proximoNumeroContrato('AR00300', [])).toBe('AR00300-01'));
  it('aviso só quando pula a sequência', () => {
    const lista = [c('AR00224-01', '2026-01-10', 'A'), c('AR00224-02', '2026-02-10', 'B')];
    expect(avisoSequenciaContrato('AR00224-03', 'AR00224', lista)).toBeUndefined();
    expect(avisoSequenciaContrato('AR00224-02', 'AR00224', lista)).toBeUndefined();
    expect(avisoSequenciaContrato('AR00224-05', 'AR00224', lista)).toMatch(/seria 03.*2 sequências/);
    expect(avisoSequenciaContrato('AR00224-04', 'AR00224', lista)).toMatch(/uma sequência/);
    expect(avisoSequenciaContrato('AR00224-', 'AR00224', lista)).toBeUndefined();
  });
});

describe('gestor sugerido', () => {
  it('o do contrato de assinatura mais recente, não o de maior número', () => {
    const lista = [c('AR00224-01', '2026-01-10', 'Antigo'), c('AR00224-03', '2026-03-10', 'Recente'), c('AR00224-02', '2026-02-10', 'Meio')];
    expect(gestorSugerido(lista)).toBe('Recente');
    expect(gestorSugerido([c('AR00224-01', '2026-05-01', 'X'), c('AR00224-02', '2026-01-01', 'Y')])).toBe('X');
  });
  it('mesma data: a maior sequência; sem contratos: vazio', () => {
    expect(gestorSugerido([c('AR00224-01', '2026-05-01', 'X'), c('AR00224-02', '2026-05-01', 'Y')])).toBe('Y');
    expect(gestorSugerido([])).toBe('');
  });
});

describe('tamanhos da parcela', () => {
  const item = (id: string, tamanhoId: string, saldoAEmitir: number) => ({ id, tamanhoId, saldoAEmitir }) as ItemContrato;
  const contrato = {
    itens: [item('i1', 't1', 100), item('i2', 't2', 40), item('i3', 't3', 7)],
    parcelas: [
      { numero: 1, itens: [{ tamanhoId: 't1', quantidade: 50 }, { tamanhoId: 't2', quantidade: 20 }] },
      { numero: 2, itens: [{ tamanhoId: 't3', quantidade: 7 }] },
    ],
  } as Pick<Contrato, 'itens' | 'parcelas'>;
  it('só os itens da parcela, com o saldo de cada um', () => {
    expect(tamanhosDaParcela(contrato, '1').map((x) => [x.item.id, x.saldo])).toEqual([['i1', 100], ['i2', 40]]);
    expect(tamanhosDaParcela(contrato, 2).map((x) => x.item.id)).toEqual(['i3']);
  });
  it('sem parcela ou contrato: vazio', () => {
    expect(tamanhosDaParcela(contrato, '')).toEqual([]);
    expect(tamanhosDaParcela(undefined, '1')).toEqual([]);
  });
});
