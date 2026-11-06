import { describe, expect, it } from 'vitest';
import { destinoBusca, rotaDoCodigo } from './busca';

describe('rotaDoCodigo', () => {
  it('leva cada ID ao seu objeto, inclusive pelo link do QR', () => {
    expect(rotaDoCodigo('AR00224-01-000071')).toBe('/d/AR00224-01-000071');
    expect(rotaDoCodigo('https://holz.exemplo/#/d/AR00224-01-000071')).toBe('/d/AR00224-01-000071');
    expect(rotaDoCodigo('ar00224-01-f006')).toBe('/f/AR00224-01-F006');
    expect(rotaDoCodigo('AR00224-01')).toBe('/contratos/AR00224-01');
    expect(rotaDoCodigo('LOC-A-01')).toBe('/locais/A-01');
    expect(rotaDoCodigo('RME-2026-0004')).toBe('/saidas?q=RME-2026-0004');
    expect(rotaDoCodigo('LT26-0042')).toBeNull();
  });
});

describe('destinoBusca', () => {
  it('código vai ao objeto, número de NF a NF e DOF, texto livre aos contratos', () => {
    expect(destinoBusca(' AR00224-01-F001 ')).toBe('/f/AR00224-01-F001');
    expect(destinoBusca('4507')).toBe('/documentos?q=4507');
    expect(destinoBusca('NF 4507')).toBe('/documentos?q=4507');
    expect(destinoBusca('Madeireira')).toBe('/contratos?q=Madeireira');
  });
});
