import type { Usuario } from '../../types/models';

/**
 * Autenticação, separada da camada de dados (`Servicos`): só o `AuthContext` usa este serviço, e as telas
 * usam `useAuth()`. Implementações: simulada (até a Etapa 9) e Supabase Auth (Etapa 9), com a mesma interface.
 */
export interface ServicoAuth {
  /** `usuario`: no simulado, o nome do perfil; no Supabase, o e-mail. */
  entrar(c: { usuario: string; senha: string }): Promise<Usuario>;
  sair(): Promise<void>;
  /** Sessão guardada no aparelho (ou null). */
  usuarioAtual(): Promise<Usuario | null>;
  /** Avisa quando a sessão muda fora desta tela (outra aba, expiração). Devolve a função que cancela o aviso. */
  aoMudarSessao(aviso: (u: Usuario | null) => void): () => void;
}
