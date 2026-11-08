import type { PGlite } from '@electric-sql/pglite';
import { PERFIS, type Perfil } from '../../dominio/permissoes';
import type { Usuario } from '../../types/models';
import { nomeDemo } from '../mock/data';
import { violacoes } from '../mock/invariantes';
import { AGORA, regrasDosServicos } from '../regras.suite';
import { bancoPglite, criarBanco, criarContas, como, executarSeed } from './bancoDeTeste';
import { criarServicosSupabase } from './index';
import { deLinhas, type Linhas } from './mapa';

/*
 * As mesmas regras do modo simulado, agora pelas funções do banco: Postgres em memória (PGlite) com as migrações e a
 * carga da demonstração no dia dos testes. Cada teste parte de uma cópia do banco modelo.
 */
let modelo: Promise<{ db: PGlite; contas: Record<Perfil, string> }> | null = null;
function bancoModelo() {
  modelo ??= (async () => {
    const db = await criarBanco();
    const contas = await criarContas(db);
    await db.query(`select set_config('holz.agora', $1, false)`, [AGORA.toISOString()]);
    await executarSeed(db);
    return { db, contas };
  })();
  return modelo;
}

regrasDosServicos(async (perfil = 'almoxarife') => {
  const { db: base, contas } = await bancoModelo();
  const db = (await base.clone()) as PGlite;
  let atual: Perfil | null = perfil;
  const usuario = (p: Perfil): Usuario => ({ id: contas[p], nome: nomeDemo(p), email: `${p}@example.com`, perfil: p, permissoes: [...PERFIS[p].permissoes], ativo: true });
  const banco = bancoPglite(db, () => (atual ? contas[atual] : null), () => AGORA);
  const s = criarServicosSupabase({ banco, usuarioAtual: async () => (atual ? usuario(atual) : null), agora: () => AGORA, cacheMs: 0 });
  return {
    s,
    como: (p) => { atual = p; },
    invariantes: async () => {
      const L = await como(db, contas.administrador, async () => (await db.query<{ e: Linhas }>('select public.exportar_estado() as e')).rows[0].e);
      return violacoes(deLinhas(L, L.perfis), '2026-11-06');
    },
  };
}, 120_000);
