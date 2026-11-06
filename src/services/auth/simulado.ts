import { PERFIS, PERFIS_LISTA, type Perfil } from '../../dominio/permissoes';
import type { Usuario } from '../../types/models';
import { ApiError } from '../http';
import type { ServicoAuth } from './contrato';

const CHAVE = 'holz:sessao-demo';

/** Nome sem acento e sem maiúsculas: "Almoxarife" e "almoxarife" escolhem o mesmo perfil. */
const normalizar = (t: string) => t.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function usuarioDo(perfil: Perfil): Usuario {
  const { rotulo, permissoes } = PERFIS[perfil];
  return { id: `demo-${perfil}`, nome: `${rotulo} (demonstração)`, email: `${perfil}@exemplo.invalid`, perfil, permissoes, ativo: true };
}

// A sessão fica guardada no aparelho, como fará o Supabase Auth; sem armazenamento disponível, vale só até recarregar.
function lerSessao(): Perfil | null {
  try {
    const v = localStorage.getItem(CHAVE);
    return v && (PERFIS_LISTA as string[]).includes(v) ? (v as Perfil) : null;
  } catch { return null; }
}
function gravarSessao(perfil: Perfil | null) {
  try { if (perfil) localStorage.setItem(CHAVE, perfil); else localStorage.removeItem(CHAVE); } catch { /* sem armazenamento */ }
}

const espera = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Login simulado: o nome do usuário escolhe o perfil e qualquer senha entra. Nenhuma autenticação real é feita. */
export function criarAuthSimulado(): ServicoAuth {
  let atual: Perfil | null = lerSessao();
  return {
    entrar: async ({ usuario, senha }) => {
      await espera(400);
      const perfil = PERFIS_LISTA.find((p) => p === normalizar(usuario));
      if (!perfil || !senha) {
        throw new ApiError(401, `Usuário ou senha inválidos. Na demonstração, use um destes usuários: ${PERFIS_LISTA.join(', ')}.`, perfil ? undefined : { usuario: 'Use o nome de um perfil.' });
      }
      atual = perfil;
      gravarSessao(perfil);
      return usuarioDo(perfil);
    },
    sair: async () => { atual = null; gravarSessao(null); },
    usuarioAtual: async () => (atual ? usuarioDo(atual) : null),
    aoMudarSessao: (aviso) => {
      // Outra aba entrou ou saiu: acompanha, para todas as abas do aparelho verem a mesma sessão.
      const aoArmazenar = (e: StorageEvent) => {
        if (e.key !== CHAVE) return;
        atual = lerSessao();
        aviso(atual ? usuarioDo(atual) : null);
      };
      window.addEventListener('storage', aoArmazenar);
      return () => window.removeEventListener('storage', aoArmazenar);
    },
  };
}
