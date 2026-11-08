import type { Usuario } from '../../types/models';
import { ApiError } from '../erros';
import { clienteSupabase } from '../supabase/cliente';
import { usuarioDoPerfil } from '../supabase/mapa';
import type { ServicoAuth } from './contrato';

/**
 * Login pelo Supabase Auth (e-mail e senha). As contas são criadas no painel do Supabase; o perfil e a situação
 * ficam na tabela `perfis` (o administrador muda na tela Usuários). Conta inativa não entra.
 */
export function criarAuthSupabase(): ServicoAuth {
  let cache: { id: string; usuario: Usuario | null } | null = null;

  async function perfil(id: string): Promise<Usuario | null> {
    if (cache?.id === id) return cache.usuario;
    const { data, error } = await clienteSupabase().from('perfis').select('*').eq('id', id).maybeSingle();
    if (error) throw new ApiError(0, 'Não foi possível carregar o perfil. Verifique a conexão e tente novamente.');
    const u = data && data.ativo ? usuarioDoPerfil(data) : null;
    cache = { id, usuario: u };
    return u;
  }

  return {
    entrar: async ({ usuario, senha }) => {
      const sb = clienteSupabase();
      const { data, error } = await sb.auth.signInWithPassword({ email: usuario.trim(), password: senha });
      if (error || !data.user) throw new ApiError(401, 'E-mail ou senha inválidos.', { usuario: 'Confira o e-mail.' });
      cache = null;
      const u = await perfil(data.user.id);
      if (!u) {
        await sb.auth.signOut();
        throw new ApiError(403, 'Esta conta está inativa ou sem perfil. Fale com o administrador.');
      }
      return u;
    },
    sair: async () => {
      cache = null;
      await clienteSupabase().auth.signOut();
    },
    usuarioAtual: async () => {
      const { data } = await clienteSupabase().auth.getSession();
      return data.session ? perfil(data.session.user.id) : null;
    },
    aoMudarSessao: (aviso) => {
      const { data } = clienteSupabase().auth.onAuthStateChange((evento, sessao) => {
        if (evento === 'INITIAL_SESSION' || evento === 'TOKEN_REFRESHED') return;
        cache = null;
        if (!sessao) { aviso(null); return; }
        void perfil(sessao.user.id).then(aviso, () => aviso(null));
      });
      return () => data.subscription.unsubscribe();
    },
  };
}
