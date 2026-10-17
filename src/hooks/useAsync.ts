import { useEffect, useState, type DependencyList } from 'react';

export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList) {
  const [estado, setEstado] = useState<{ dados?: T; carregando: boolean; erro?: Error }>({ carregando: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let vivo = true;
    setEstado((s) => ({ ...s, carregando: true, erro: undefined }));
    fn()
      .then((d) => vivo && setEstado({ dados: d, carregando: false }))
      .catch((e) => vivo && setEstado({ carregando: false, erro: e instanceof Error ? e : new Error('Erro desconhecido') }));
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { ...estado, recarregar: () => setTick((t) => t + 1) };
}

export function useDebounced<T>(valor: T, ms = 300): T {
  const [v, setV] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setV(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return v;
}
