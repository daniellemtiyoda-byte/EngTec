import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Permissao } from '../dominio/permissoes';
import { autenticacao } from '../services/auth';
import type { Usuario } from '../types/models';

interface AuthCtx {
  usuario: Usuario | null;
  carregando: boolean;
  entrar: (usuario: string, senha: string) => Promise<void>;
  sair: () => Promise<void>;
  /** Apenas conveniência de UX. O servidor DEVE validar cada permissão. */
  pode: (permissao: Permissao) => boolean;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    autenticacao.usuarioAtual().then(setUsuario).catch(() => setUsuario(null)).finally(() => setCarregando(false));
    const cancelar = autenticacao.aoMudarSessao(setUsuario);
    const aoExpirar = () => setUsuario(null);
    window.addEventListener('sgd:nao-autenticado', aoExpirar);
    return () => { cancelar(); window.removeEventListener('sgd:nao-autenticado', aoExpirar); };
  }, []);

  const entrar = useCallback(async (u: string, s: string) => setUsuario(await autenticacao.entrar({ usuario: u, senha: s })), []);
  const sair = useCallback(async () => {
    try { await autenticacao.sair(); } finally { setUsuario(null); }
  }, []);
  const pode = useCallback((p: Permissao) => !!usuario?.permissoes.includes(p), [usuario]);

  // useMemo: sem ele, todo componente que usa useAuth renderiza de novo a cada renderização do provider.
  const valor = useMemo(() => ({ usuario, carregando, entrar, sair, pode }), [usuario, carregando, entrar, sair, pode]);
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth fora do AuthProvider');
  return c;
}
