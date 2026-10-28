import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAsync } from '../hooks/useAsync';
import { servicos } from '../services';
import type { Alerta } from '../types/models';

interface AlertasCtx { dados?: Alerta[]; carregando: boolean; erro?: Error; recarregar: () => void }

const Ctx = createContext<AlertasCtx | null>(null);

/**
 * Busca os alertas uma vez por sessão do Layout e compartilha entre o sino de notificações e o Dashboard.
 * `filtro` deixa de fora o que o perfil não pode abrir (o Layout passa a regra das rotas).
 */
export function AlertasProvider({ children, filtro }: { children: ReactNode; filtro?: (a: Alerta) => boolean }) {
  const alertas = useAsync(() => servicos.dashboard.alertas(), []);
  const { dados, carregando, erro, recarregar } = alertas;
  const valor = useMemo(() => ({ carregando, erro, recarregar, dados: filtro && dados ? dados.filter(filtro) : dados }), [dados, carregando, erro, recarregar, filtro]);
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useAlertas() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAlertas fora do AlertasProvider');
  return c;
}
