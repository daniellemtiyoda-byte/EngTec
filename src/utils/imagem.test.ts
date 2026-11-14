import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reduzirParaJpeg } from './imagem';

/** Cria um File com o tamanho informado (em bytes). */
function mkFile(name: string, type: string, size = 100): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe('reduzirParaJpeg', () => {
  it('rejeita tipo inválido antes de qualquer API de imagem', async () => {
    const f = mkFile('documento.pdf', 'application/pdf');
    await expect(reduzirParaJpeg(f, 10)).rejects.toThrow('Formato não permitido');
  });

  it('aceita HEIC pelo tipo MIME', async () => {
    // createImageBitmap indisponível no Node → cai no fallback
    const f = mkFile('foto.heic', 'image/heic', 500 * 1024); // 500 KB
    const resultado = await reduzirParaJpeg(f, 10);
    expect(resultado).toBe(f); // fallback: original
  });

  it('aceita HEIC pela extensão quando o tipo MIME está vazio', async () => {
    const f = mkFile('foto.heic', '', 500 * 1024);
    const resultado = await reduzirParaJpeg(f, 10);
    expect(resultado).toBe(f);
  });

  describe('fallback: createImageBitmap falha (ex.: HEIC no Chrome/Windows)', () => {
    beforeEach(() => {
      vi.stubGlobal('createImageBitmap', () => Promise.reject(new Error('não suportado')));
    });
    afterEach(() => vi.unstubAllGlobals());

    it('devolve o original quando está dentro do limite', async () => {
      const f = mkFile('canhoto.heic', 'image/heic', 500 * 1024); // 500 KB < 1 MB
      const resultado = await reduzirParaJpeg(f, 1);
      expect(resultado).toBe(f);
    });

    it('rejeita com mensagem clara quando o original excede o limite', async () => {
      const f = mkFile('enorme.heic', 'image/heic', 2 * 1024 * 1024 + 1); // > 2 MB
      await expect(reduzirParaJpeg(f, 2)).rejects.toThrow('excede 2 MB');
    });
  });

  describe('caminho feliz: createImageBitmap e canvas disponíveis', () => {
    const mockClose = vi.fn();
    const mockDraw = vi.fn();

    function stubCanvas(blobOk = true) {
      const mockBlob = new Blob([new Uint8Array(10)], { type: 'image/jpeg' });
      const mockCanvas = {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: mockDraw }),
        toBlob: (cb: (b: Blob | null) => void) => cb(blobOk ? mockBlob : null),
      };
      vi.stubGlobal('document', {
        createElement: (tag: string) => (tag === 'canvas' ? mockCanvas : (globalThis as Record<string, unknown>).document),
      });
    }

    beforeEach(() => {
      vi.stubGlobal('createImageBitmap', (f: Blob) =>
        Promise.resolve({ width: 2400, height: 1800, close: mockClose, _src: f }),
      );
    });

    afterEach(() => vi.unstubAllGlobals());

    it('reduz imagem grande e devolve JPEG com nome trocado', async () => {
      stubCanvas();
      const f = mkFile('foto.png', 'image/png', 1000);
      const resultado = await reduzirParaJpeg(f, 10);
      expect(resultado.type).toBe('image/jpeg');
      expect(resultado.name).toBe('foto.jpg');
      expect(mockClose).toHaveBeenCalled();
    });

    it('IMG_1234.HEIC vira IMG_1234.jpg com type image/jpeg', async () => {
      stubCanvas();
      const f = mkFile('IMG_1234.HEIC', 'image/heic', 1000);
      const resultado = await reduzirParaJpeg(f, 10);
      expect(resultado.type).toBe('image/jpeg');
      expect(resultado.name).toBe('IMG_1234.jpg');
    });

    it('usa canvas com o tamanho proporcional ao lado maior (1600 px)', async () => {
      stubCanvas();
      // 2400×1800 → 1600×1200
      let w = 0, h = 0;
      const mockBlob = new Blob([new Uint8Array(10)], { type: 'image/jpeg' });
      vi.stubGlobal('document', {
        createElement: (tag: string) => {
          if (tag !== 'canvas') return undefined;
          const c = { width: 0, height: 0, getContext: () => ({ drawImage: mockDraw }), toBlob: (cb: (b: Blob | null) => void) => { w = c.width; h = c.height; cb(mockBlob); } };
          return c;
        },
      });
      await reduzirParaJpeg(mkFile('f.jpg', 'image/jpeg'), 10);
      expect(w).toBe(1600);
      expect(h).toBe(1200);
    });

    it('não reduz imagem que já cabe em 1600 px', async () => {
      vi.stubGlobal('createImageBitmap', () =>
        Promise.resolve({ width: 800, height: 600, close: mockClose }),
      );
      let w = 0, h = 0;
      const mockBlob = new Blob([new Uint8Array(10)], { type: 'image/jpeg' });
      vi.stubGlobal('document', {
        createElement: (tag: string) => {
          if (tag !== 'canvas') return undefined;
          const c = { width: 0, height: 0, getContext: () => ({ drawImage: mockDraw }), toBlob: (cb: (b: Blob | null) => void) => { w = c.width; h = c.height; cb(mockBlob); } };
          return c;
        },
      });
      await reduzirParaJpeg(mkFile('f.jpg', 'image/jpeg'), 10);
      expect(w).toBe(800);
      expect(h).toBe(600);
    });

    it('cai no fallback quando toBlob falha (canvas devolve null)', async () => {
      stubCanvas(false);
      const f = mkFile('foto.jpg', 'image/jpeg', 500 * 1024);
      const resultado = await reduzirParaJpeg(f, 10);
      expect(resultado).toBe(f); // fallback: original dentro do limite
    });
  });
});
