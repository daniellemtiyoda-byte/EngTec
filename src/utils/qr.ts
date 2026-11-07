import { env } from '../config/env';

/**
 * Base do link nos QR e se ela serve para etiqueta de uso real: a URL configurada (VITE_APP_URL, a da Vercel:
 * https://holz-trilho.vercel.app) que não seja da máquina local; sem configuração, só um endereço https fora dela.
 */
export function baseDosQr() {
  const base = env.APP_URL || `${window.location.origin}${window.location.pathname}`.replace(/\/$/, '');
  const local = /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(base);
  const real = !local && (!!env.APP_URL || /^https:\/\//.test(base));
  return { base, real, configurada: !!env.APP_URL };
}
