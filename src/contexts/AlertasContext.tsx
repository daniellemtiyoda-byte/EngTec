import { createContext, useContext, type ReactNode } from 'react';
import { useAsync } from '../hooks/useAsync';
import { servicos } from '../services';
import type { Alerta } from '../types/models';

interface AlertasCtx { dados?: Alerta[]; carregando: boolean; erro?: Error; recarregar: () => void }

const Ctx = createContext<AlertasCtx | null>(null);

/** Busca os alertas uma vez por sessão do Layout e compartilha entre o sino de notificações e o Dashboard. */
export function AlertasProvider({ children }: { children: ReactNode }) {
  const alertas = useAsync(() => servicos.dashboard.alertas(), []);
  return <Ctx.Provider value={alertas}>{children}</Ctx.Provider>;
}

export function useAlertas() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAlertas fora do AlertasProvider');
  return c;
}
