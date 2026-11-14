import { describe, expect, it } from 'vitest';
import { traduzirErroStorage } from './cliente';

describe('traduzirErroStorage', () => {
  it('traduz tamanho excedido', () => {
    expect(traduzirErroStorage('The object exceeded the maximum allowed size', 'nf.pdf'))
      .toBe('nf.pdf é maior que o limite permitido.');
    expect(traduzirErroStorage('Payload Too Large', 'foto.jpg'))
      .toBe('foto.jpg é maior que o limite permitido.');
    expect(traduzirErroStorage('file is too large', 'arquivo.png'))
      .toBe('arquivo.png é maior que o limite permitido.');
  });

  it('traduz tipo MIME não aceito', () => {
    expect(traduzirErroStorage('mime type application/x-rar is not supported', 'backup.rar'))
      .toBe('Tipo de arquivo não permitido: backup.rar.');
    expect(traduzirErroStorage('invalid mime type', 'doc.exe'))
      .toBe('Tipo de arquivo não permitido: doc.exe.');
  });

  it('usa mensagem genérica para outros erros (sem mensagem técnica inglesa)', () => {
    const r = traduzirErroStorage('Unexpected server error occurred', 'foto.jpg');
    expect(r).toContain('foto.jpg');
    expect(r).toContain('Tente novamente');
    expect(r).not.toContain('server error');
    expect(r).not.toContain('occurred');
  });

  it('inclui código quando a mensagem é só um código curto', () => {
    expect(traduzirErroStorage('STORAGE_ERROR', 'foto.jpg')).toContain('(código STORAGE_ERROR)');
  });
});
