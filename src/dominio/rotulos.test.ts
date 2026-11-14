import { describe, expect, it } from 'vitest';
import { textoDoEvento } from './rotulos';

describe('textoDoEvento', () => {
  it('troca categoria 1, 2, 3 pela letra', () => {
    expect(textoDoEvento('Inspecionado: aprovado, categoria 1')).toBe('Inspecionado: aprovado, categoria A');
    expect(textoDoEvento('aprovado, categoria 2')).toBe('aprovado, categoria B');
    expect(textoDoEvento('aprovado, categoria 3 (lançado à mão)')).toBe('aprovado, categoria C (lançado à mão)');
  });
  it('não mexe no resto', () => {
    expect(textoDoEvento('Inspecionado: reprovado')).toBe('Inspecionado: reprovado');
    expect(textoDoEvento('categoria 12 e categoria 4')).toBe('categoria 12 e categoria 4');
  });
});
