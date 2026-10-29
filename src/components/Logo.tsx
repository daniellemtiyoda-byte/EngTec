import { useState } from 'react';
import { env } from '../config/env';

/**
 * Logo do Holz Trilho. O arquivo definitivo vai em public/assets/logo.svg (veja LEIA-ME.txt na pasta);
 * enquanto ele não existe, aparece o monograma "HT" no mesmo tamanho, para o layout não mudar quando o logo chegar.
 */
export function Logo({ tamanho = 'pequeno' }: { tamanho?: 'pequeno' | 'medio' }) {
  const [falhou, setFalhou] = useState(false);
  if (falhou) return <span className={`logo logo-${tamanho} logo-monograma`} role="img" aria-label="Holz Trilho">HT</span>;
  return <img className={`logo logo-${tamanho}`} src={env.LOGO_URL} alt="Holz Trilho" onError={() => setFalhou(true)} />;
}
