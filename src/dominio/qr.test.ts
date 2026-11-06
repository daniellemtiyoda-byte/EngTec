import jsQR from 'jsqr';
import QRCode from 'qrcode';
import { describe, expect, it } from 'vitest';
import { lerCodigo, linkQr } from './identificacao';

/** Desenha a matriz do QR em pixels (RGBA), com a margem de 2 módulos usada nas etiquetas. */
function imagemDoQr(texto: string, escala = 4, margem = 2) {
  const qr = QRCode.create(texto, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const lado = (n + margem * 2) * escala;
  const px = new Uint8ClampedArray(lado * lado * 4).fill(255);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!qr.modules.get(y, x)) continue;
      for (let dy = 0; dy < escala; dy++) {
        for (let dx = 0; dx < escala; dx++) {
          const i = (((y + margem) * escala + dy) * lado + (x + margem) * escala + dx) * 4;
          px[i] = px[i + 1] = px[i + 2] = 0;
        }
      }
    }
  }
  return { px, lado };
}

describe('QR das etiquetas', () => {
  it.each([
    ['dormente', 'AR00224-01-000071'],
    ['fardo', 'AR00224-01-F006'],
    ['local', 'LOC-A-03'],
  ] as const)('o QR de %s é lido e devolve o mesmo ID', (tipo, id) => {
    const link = linkQr(tipo, id, 'https://holz-trilho.vercel.app');
    const { px, lado } = imagemDoQr(link);
    const lido = jsQR(px, lado, lado);
    expect(lido?.data).toBe(link);
    expect(lerCodigo(lido!.data)).toEqual({ tipo, id });
  });
});
