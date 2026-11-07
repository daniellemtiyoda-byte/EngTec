import { env } from '../config/env';

/** Base do link nos QR e se ela serve para etiqueta de uso real (https e fora da máquina local). */
export function baseDosQr() {
  const base = env.APP_URL || `${window.location.origin}${window.location.pathname}`.replace(/\/$/, '');
  const real = /^https:\/\//.test(base) && !/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(base);
  return { base, real, configurada: !!env.APP_URL };
}
