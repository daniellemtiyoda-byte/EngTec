import { describe, expect, it } from 'vitest';
import {
  RE_ATA, RE_CONTRATO, RE_DORMENTE, RE_FARDO, RE_LOCAL, RE_RME,
  contratoDe, idDormente, idFardo, idLocal, idRme, lerCodigo, linkQr, rotaDoObjeto, sequenciaDe,
} from './identificacao';

describe('formatos de ID', () => {
  it.each([
    [RE_ATA, 'AR00224', true], [RE_ATA, 'AR224', false], [RE_ATA, 'ar00224', false],
    [RE_CONTRATO, 'AR00224-01', true], [RE_CONTRATO, 'AR224-01', false], [RE_CONTRATO, 'AR00224-1', false],
    [RE_DORMENTE, 'AR00224-01-000357', true], [RE_DORMENTE, 'AR00224-01-357', false], [RE_DORMENTE, 'AR00224-01-0003570', false],
    [RE_FARDO, 'AR00224-01-F012', true], [RE_FARDO, 'AR00224-01-F12', false], [RE_FARDO, 'AR00224-01-f012', false],
    [RE_RME, 'RME-2026-0012', true], [RE_RME, 'RME26-0012', false],
    [RE_LOCAL, 'LOC-A03', true], [RE_LOCAL, 'LOC-A-03', true], [RE_LOCAL, 'LOC-', false], [RE_LOCAL, 'LOC-a 03', false],
  ])('%s com %s → %s', (re, texto, valido) => {
    expect(re.test(texto)).toBe(valido);
  });
});

describe('geração de IDs', () => {
  it('completa com zeros', () => {
    expect(idDormente('AR00224-01', 357)).toBe('AR00224-01-000357');
    expect(idFardo('AR00224-01', 12)).toBe('AR00224-01-F012');
    expect(idRme(2026, 12)).toBe('RME-2026-0012');
    expect(idLocal(' a03 ')).toBe('LOC-A03');
  });
  it('recusa sequência fora do intervalo e contrato inválido', () => {
    expect(() => idDormente('AR00224-01', 0)).toThrow();
    expect(() => idDormente('AR00224-01', 1_000_000)).toThrow();
    expect(() => idFardo('AR00224-01', 1000)).toThrow();
    expect(() => idFardo('AR224-01', 1)).toThrow();
    expect(() => idLocal('A 03')).toThrow();
  });
  it('extrai sequência e contrato', () => {
    expect(sequenciaDe('AR00224-01-000357')).toBe(357);
    expect(sequenciaDe('AR00224-01-F012')).toBe(12);
    expect(sequenciaDe('RME-2026-0012')).toBeNull();
    expect(contratoDe('AR00224-01-F012')).toBe('AR00224-01');
  });
});

describe('lerCodigo', () => {
  it('aceita o ID puro, com espaços e em minúsculas', () => {
    expect(lerCodigo(' ar00224-01-000357 ')).toEqual({ tipo: 'dormente', id: 'AR00224-01-000357' });
    expect(lerCodigo('AR00224-01-F012')).toEqual({ tipo: 'fardo', id: 'AR00224-01-F012' });
    expect(lerCodigo('AR00224-01')).toEqual({ tipo: 'contrato', id: 'AR00224-01' });
    expect(lerCodigo('RME-2026-0012')).toEqual({ tipo: 'rme', id: 'RME-2026-0012' });
    expect(lerCodigo('LOC-A03')).toEqual({ tipo: 'local', id: 'LOC-A03' });
  });
  it('aceita o link completo do QR', () => {
    expect(lerCodigo('https://holz.exemplo/#/d/AR00224-01-000357')).toEqual({ tipo: 'dormente', id: 'AR00224-01-000357' });
    expect(lerCodigo('https://holz.exemplo/#/f/AR00224-01-F012?x=1')).toEqual({ tipo: 'fardo', id: 'AR00224-01-F012' });
    expect(lerCodigo('https://holz.exemplo/#/locais/A03')).toEqual({ tipo: 'local', id: 'LOC-A03' });
  });
  it('recusa o que não é do sistema', () => {
    expect(lerCodigo('')).toBeNull();
    expect(lerCodigo('https://outro.exemplo/pagina')).toBeNull();
    expect(lerCodigo('https://holz.exemplo/#/d/LT26-0042-0007')).toBeNull();
    expect(lerCodigo('https://holz.exemplo/#/f/AR00224-01-000357')).toBeNull();
    expect(lerCodigo('LT26-0042')).toBeNull();
    expect(lerCodigo('https://holz.exemplo/#/d/%E0%A4%A')).toBeNull();
  });
});

describe('rotas e links', () => {
  it('leva cada código à página do objeto', () => {
    expect(rotaDoObjeto({ tipo: 'dormente', id: 'AR00224-01-000357' })).toBe('/d/AR00224-01-000357');
    expect(rotaDoObjeto({ tipo: 'local', id: 'LOC-A03' })).toBe('/locais/A03');
    expect(rotaDoObjeto({ tipo: 'rme', id: 'RME-2026-0012' })).toBe('/saidas/RME-2026-0012');
  });
  it('monta o link do QR e o leitor devolve o mesmo ID', () => {
    const link = linkQr('dormente', 'AR00224-01-000357', 'https://holz.exemplo/');
    expect(link).toBe('https://holz.exemplo/#/d/AR00224-01-000357');
    expect(lerCodigo(link)).toEqual({ tipo: 'dormente', id: 'AR00224-01-000357' });
    expect(lerCodigo(linkQr('local', 'LOC-A-03', 'https://holz.exemplo'))).toEqual({ tipo: 'local', id: 'LOC-A-03' });
  });
});
