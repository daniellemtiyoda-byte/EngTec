import { useEffect, useState } from 'react';

/** Mesmo limite do CSS (≤ 760 px): celular. Telas de campo e a navegação inferior mudam por aqui. */
const CONSULTA = '(max-width: 760px)';

const atual = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(CONSULTA).matches;

export function useTelaPequena(): boolean {
  const [pequena, setPequena] = useState(atual);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const m = window.matchMedia(CONSULTA);
    const aoMudar = () => setPequena(m.matches);
    aoMudar();
    m.addEventListener('change', aoMudar);
    return () => m.removeEventListener('change', aoMudar);
  }, []);
  return pequena;
}
