import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { servicos } from '../services';
import type { Usuario } from '../types/models';

interface AuthCtx {
  usuario: Usuario | null;
  carregando: boolean;
  entrar: (usuario: string, senha: string) => Promise<void>;
  sair: () => Promise<void>;
  /** Apenas conveniência de UX. O servidor DEVE validar cada permissão. */
  pode: (permissao: string) => boolean;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    servicos.auth.usuarioAtual().then(setUsuario).catch(() => setUsuario(null)).finally(() => setCarregando(false));
    const aoExpirar = () => setUsuario(null);
    window.addEventListener('sgd:nao-autenticado', aoExpirar);
    return () => window.removeEventListener('sgd:nao-autenticado', aoExpirar);
  }, []);

  const entrar = useCallback(async (u: string, s: string) => setUsuario(await servicos.auth.entrar({ usuario: u, senha: s })), []);
  const sair = useCallback(async () => {
    try { await servicos.auth.sair(); } finally { setUsuario(null); }
  }, []);
  const pode = useCallback((p: string) => !!usuario?.permissoes.includes(p), [usuario]);

  return <Ctx.Provider value={{ usuario, carregando, entrar, sair, pode }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth fora do AuthProvider');
  return c;
}
