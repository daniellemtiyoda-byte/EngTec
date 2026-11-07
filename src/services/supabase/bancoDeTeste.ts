import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Banco de teste (só para os testes, em Node): um Postgres em memória (PGlite) com o mínimo do Supabase que as
 * migrações usam (esquema `auth` com `users` e `uid()`, os papéis `anon` e `authenticated`, esquema `storage`) e as
 * migrações de `supabase/migrations/` aplicadas em ordem. Não entra no app.
 */
const RAIZ = join(__dirname, '..', '..', '..', 'supabase');

const SUPABASE_MINIMO = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text unique, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
  alter table storage.objects enable row level security;
  grant usage on schema public, auth, storage to anon, authenticated;
`;

export const migracoes = () => readdirSync(join(RAIZ, 'migrations')).filter((f) => f.endsWith('.sql')).sort();

export async function criarBanco(opcoes: { semSeed?: boolean } = {}): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_MINIMO);
  for (const arquivo of migracoes()) {
    try {
      await db.exec(readFileSync(join(RAIZ, 'migrations', arquivo), 'utf8'));
    } catch (e) {
      throw new Error(`Migração ${arquivo}: ${(e as Error).message}`);
    }
  }
  // As permissões de tabela que o Supabase dá aos papéis (o acesso de fato é decidido pelas políticas RLS).
  await db.exec(`
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant usage, select on all sequences in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
  `);
  if (!opcoes.semSeed) await db.exec(readFileSync(join(RAIZ, 'seed.sql'), 'utf8'));
  return db;
}

/** Cria as quatro contas de demonstração (como no painel do Supabase) e devolve o id de cada perfil. */
export async function criarContas(db: PGlite): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  for (const p of ['administrador', 'almoxarife', 'gestor', 'requisitante']) {
    const r = await db.query<{ id: string }>(`insert into auth.users (email) values ($1) returning id`, [`${p}@exemplo.com`]);
    ids[p] = r.rows[0].id;
  }
  return ids;
}

/** Roda como o usuário logado (papel authenticated, auth.uid() = id), com o relógio fixo se informado. */
export async function como<T>(db: PGlite, usuarioId: string | null, fn: () => Promise<T>, agora?: string): Promise<T> {
  await db.exec(`set role ${usuarioId ? 'authenticated' : 'anon'}`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false), set_config('holz.agora', $2, false)`, [usuarioId ?? '', agora ?? '']);
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}
