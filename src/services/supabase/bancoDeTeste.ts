import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PERFIS_LISTA, type Perfil } from '../../dominio/permissoes';
import { nomeDemo } from '../mock/data';
import { erroDoBanco, type Banco } from './index';

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
  -- O Supabase dá aos papéis acesso a tudo o que for criado em public (quem decide são as políticas RLS e as funções);
  -- as migrações tiram o que não deve ficar aberto (revoke).
  alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;
  alter default privileges in schema public grant usage, select on sequences to anon, authenticated;
  alter default privileges in schema public grant execute on functions to anon, authenticated;
`;

export const migracoes = () => readdirSync(join(RAIZ, 'migrations')).filter((f) => f.endsWith('.sql')).sort();

/**
 * Banco com as migrações aplicadas (sem o seed: ele exige as contas de demonstração; ver `executarSeed`).
 * `antesDasMigracoes` roda no banco ainda vazio, como um projeto do Supabase que já tem contas no Auth.
 */
export async function criarBanco(opcoes: { antesDasMigracoes?: (db: PGlite) => Promise<void> } = {}): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_MINIMO);
  await opcoes.antesDasMigracoes?.(db);
  for (const arquivo of migracoes()) {
    try {
      await db.exec(readFileSync(join(RAIZ, 'migrations', arquivo), 'utf8'));
    } catch (e) {
      throw new Error(`Migração ${arquivo}: ${(e as Error).message}`);
    }
  }
  return db;
}

/** Executa supabase/seed.sql (ou seed_1.sql, seed_2.sql) como no editor SQL. */
export async function executarSeed(db: PGlite, arquivo = 'seed.sql') {
  await db.exec(readFileSync(join(RAIZ, arquivo), 'utf8'));
}

/**
 * Cria as quatro contas de demonstração (como no painel do Supabase: o gatilho cria o perfil) e as liga aos perfis,
 * com os nomes da demonstração, como o seed.sql faz. Devolve o id de cada uma.
 */
export async function criarContas(db: PGlite): Promise<Record<Perfil, string>> {
  const ids = {} as Record<Perfil, string>;
  for (const p of PERFIS_LISTA) {
    const r = await db.query<{ id: string }>(`insert into auth.users (email) values ($1) returning id`, [`${p}@example.com`]);
    ids[p] = r.rows[0].id;
    await db.query('update public.perfis set perfil = $1, nome = $2 where id = $3', [p, nomeDemo(p), ids[p]]);
  }
  await db.query(`update public.rmes set solicitante_id = $1 where solicitante_id is null`, [ids.requisitante]);
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

/**
 * `Banco` sobre o PGlite, para os testes rodarem a implementação do Supabase: chama a função como o PostgREST faz
 * (argumentos nomeados, convertidos pelo tipo do parâmetro), como o usuário logado e com o relógio fixo.
 */
export function bancoPglite(db: PGlite, usuarioId: () => string | null, agora: () => Date): Banco {
  const tipos = new Map<string, Map<string, string>>();
  async function parametros(nome: string) {
    let t = tipos.get(nome);
    if (!t) {
      const r = await db.query<{ nomes: string[] | null; tipos: string }>(
        `select proargnames as nomes, array_to_string(array(select format_type(x, null) from unnest(proargtypes) x), ',') as tipos
         from pg_proc where proname = $1 and pronamespace = 'public'::regnamespace`, [nome]);
      if (!r.rows.length) throw new Error(`Função ${nome} não existe no banco.`);
      const ns = r.rows[0].nomes ?? [];
      const ts = r.rows[0].tipos ? r.rows[0].tipos.split(',') : [];
      t = new Map(ts.map((tipo, i) => [ns[i], tipo]));
      tipos.set(nome, t);
    }
    return t;
  }
  return {
    async rpc<T>(nome: string, args: Record<string, unknown> = {}) {
      const t = await parametros(nome);
      const valores: string[] = [];
      const expr = Object.entries(args).map(([k, v]) => {
        const tipo = t.get(k);
        if (!tipo) throw new Error(`A função ${nome} não tem o parâmetro ${k}.`);
        valores.push(JSON.stringify(v ?? null));
        const n = `$${valores.length}::jsonb`;
        const valor = tipo === 'jsonb' ? n : tipo.endsWith('[]') ? `array(select jsonb_array_elements_text(${n}))::${tipo}` : `(${n} #>> '{}')::${tipo}`;
        return `${k} => ${valor}`;
      });
      try {
        return await como(db, usuarioId(), async () => (await db.query<{ r: T }>(`select public.${nome}(${expr.join(', ')}) as r`, valores)).rows[0].r, agora().toISOString());
      } catch (e) {
        const x = e as { code?: string; message?: string; detail?: string };
        if (/^P0\d{3}$/.test(x.code ?? '')) throw erroDoBanco(x);
        throw e;
      }
    },
    async enviar() { /* armazenamento fora dos testes */ },
  };
}
