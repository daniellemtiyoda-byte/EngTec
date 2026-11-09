import type { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Perfil } from '../../dominio/permissoes';
import { criarBanco, criarContas, como, executarSeed } from './bancoDeTeste';

/** As funções que o app chama pelo `rpc`, lidas do código: `op('…')` e `cadastro(…, '…')` da montagem e `rpc('…')`. */
function funcoesDoApp(): string[] {
  const ler = (arquivo: string) => readFileSync(join(__dirname, '..', arquivo), 'utf8');
  const montagem = ler('montagem.ts');
  const supabase = ler(join('supabase', 'index.ts'));
  const nomes = [
    ...[...montagem.matchAll(/op\('([a-z_]+)'/g)].map((m) => m[1]),
    ...[...montagem.matchAll(/cadastro\('[a-z_]+', '([a-z_]+)'/g)].map((m) => m[1]),
    ...[...supabase.matchAll(/rpc(?:<[^>]+>)?\('([a-z_]+)'/g)].map((m) => m[1]),
  ];
  return [...new Set(nomes)].sort();
}

/**
 * As funções que rodam como o usuário a partir das políticas, das views e das funções do app que são security
 * invoker (as definer rodam como o dono e param a busca). Gatilhos ficam de fora.
 */
async function auxiliaresComoUsuario(db: PGlite, doApp: string[]): Promise<string[]> {
  const fs = (await db.query<{ nome: string; definer: boolean; fonte: string; gatilho: boolean }>(
    `select proname as nome, prosecdef as definer, prosrc as fonte, prorettype = 'trigger'::regtype as gatilho
     from pg_proc where pronamespace = 'public'::regnamespace`)).rows;
  const politicas = (await db.query<{ t: string }>(`select coalesce(qual, '') || ' ' || coalesce(with_check, '') as t from pg_policies`)).rows.map((r) => r.t);
  const views = (await db.query<{ t: string }>(`select definition as t from pg_views where schemaname = 'public'`)).rows.map((r) => r.t);
  const chamadas = (texto: string) => fs.filter((f) => !f.gatilho && new RegExp(`(^|[^a-z_])${f.nome}\\s*\\(`).test(texto)).map((f) => f.nome);
  const fila = [...chamadas([...politicas, ...views].join(' ')), ...doApp.filter((n) => fs.some((f) => f.nome === n && !f.definer))];
  const vistas = new Set<string>();
  while (fila.length) {
    const nome = fila.pop()!;
    if (vistas.has(nome)) continue;
    vistas.add(nome);
    const f = fs.find((x) => x.nome === nome);
    if (f && !f.definer) fila.push(...chamadas(f.fonte));
  }
  return [...vistas].filter((n) => !doApp.includes(n)).sort();
}

describe('privilégios (0008): segunda camada, além da RLS', () => {
  let db: PGlite;
  let contas: Record<Perfil, string>;
  beforeAll(async () => {
    db = await criarBanco();
    contas = await criarContas(db);
    await db.query(`select set_config('holz.agora', $1, false)`, ['2026-11-06T12:00:00-03:00']);
    await executarSeed(db);
  }, 120_000);

  it('anon não tem nenhum privilégio no public: não lê tabela nem view e não executa função', async () => {
    const abertos = await db.query<{ o: string }>(`
      select c.oid::regclass::text as o from pg_class c
       where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'S')
         and (has_table_privilege('anon', c.oid, 'select, insert, update, delete, truncate, references, trigger')
              or (c.relkind = 'S' and has_sequence_privilege('anon', c.oid, 'usage, select, update')))
      union all
      select p.oid::regprocedure::text from pg_proc p
       where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'execute')`);
    expect(abertos.rows.map((r) => r.o)).toEqual([]);
    await expect(como(db, null, () => db.query('select count(*) from public.fardos'))).rejects.toThrow(/permission denied/);
    await expect(como(db, null, () => db.query('select count(*) from public.v_fardos'))).rejects.toThrow(/permission denied/);
    await expect(como(db, null, () => db.query('select public.exportar_estado()'))).rejects.toThrow(/permission denied/);
    await expect(como(db, null, () => db.query(`select public.pode('admin')`))).rejects.toThrow(/permission denied/);
  });

  it('authenticated só lê: nenhuma tabela aceita insert, update ou delete direto, nem pelo administrador', async () => {
    const gravaveis = await db.query<{ o: string }>(`
      select c.oid::regclass::text as o from pg_class c
       where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'S')
         and (has_table_privilege('authenticated', c.oid, 'insert, update, delete, truncate, references, trigger')
              or (c.relkind = 'S' and has_sequence_privilege('authenticated', c.oid, 'usage, update')))`);
    expect(gravaveis.rows.map((r) => r.o)).toEqual([]);
    const adm = contas.administrador;
    await expect(como(db, adm, () => db.query(`insert into public.especies (nome_cientifico, nome_popular) values ('X', 'X')`))).rejects.toThrow(/permission denied/);
    await expect(como(db, adm, () => db.query(`update public.especies set nome_popular = 'X'`))).rejects.toThrow(/permission denied/);
    await expect(como(db, adm, () => db.query(`delete from public.eventos`))).rejects.toThrow(/permission denied/);
    await expect(como(db, adm, () => db.query(`update public.perfis set perfil = 'administrador' where id = $1`, [contas.requisitante]))).rejects.toThrow(/permission denied/);
    // Leitura direta continua (a tela de login lê o próprio perfil).
    const p = await como(db, contas.requisitante, () => db.query<{ perfil: string }>('select perfil from public.perfis where id = $1', [contas.requisitante]));
    expect(p.rows[0].perfil).toBe('requisitante');
  });

  it('authenticated executa só as funções que o app chama e as auxiliares que elas, as views e as políticas usam', async () => {
    const doApp = funcoesDoApp();
    expect(doApp).toContain('exportar_estado');
    expect(doApp.length).toBeGreaterThan(30);
    const auxiliares = await auxiliaresComoUsuario(db, doApp);
    const liberadas = await db.query<{ nome: string }>(`
      select distinct proname as nome from pg_proc
       where pronamespace = 'public'::regnamespace and has_function_privilege('authenticated', oid, 'execute') order by 1`);
    expect(liberadas.rows.map((r) => r.nome)).toEqual([...doApp, ...auxiliares].sort());
    // As internas continuam fechadas.
    for (const interna of ['carregar_demonstracao()', 'registrar_evento(text,text,text,text,text)', 'movimentar_dormentes(text[],text,text,text,text,text,text)', 'previa_inventario(text)']) {
      const r = await db.query<{ ok: boolean }>(`select has_function_privilege('authenticated', '${interna}', 'execute') as ok`);
      expect({ interna, ok: r.rows[0].ok }).toEqual({ interna, ok: false });
    }
  });

  it('ativo(), pode() e as políticas do Storage continuam valendo', async () => {
    const especies = (id: string) => como(db, id, async () => (await db.query<{ n: number }>('select count(*)::int as n from public.especies')).rows[0].n);
    expect(await especies(contas.gestor)).toBeGreaterThan(0);
    expect(await como(db, contas.almoxarife, async () => (await db.query<{ ok: boolean }>(`select public.pode('estoque:movimentar') as ok`)).rows[0].ok)).toBe(true);
    expect(await como(db, contas.gestor, async () => (await db.query<{ ok: boolean }>(`select public.pode('estoque:movimentar') as ok`)).rows[0].ok)).toBe(false);
    // Storage: o almoxarife envia ao bucket anexos; o requisitante não envia nem vê; o gestor vê.
    await como(db, contas.almoxarife, () => db.query(`insert into storage.objects (bucket_id, name, owner) values ('anexos', 'entregas/x/dof.pdf', $1)`, [contas.almoxarife]));
    await expect(como(db, contas.requisitante, () => db.query(`insert into storage.objects (bucket_id, name) values ('anexos', 'entregas/x/outro.pdf')`))).rejects.toThrow(/row-level security/);
    const anexos = (id: string) => como(db, id, async () => (await db.query<{ n: number }>(`select count(*)::int as n from storage.objects where bucket_id = 'anexos'`)).rows[0].n);
    expect(await anexos(contas.gestor)).toBe(1);
    expect(await anexos(contas.requisitante)).toBe(0);
    // Conta inativa não lê nada.
    await db.query('update public.perfis set ativo = false where id = $1', [contas.gestor]);
    expect(await especies(contas.gestor)).toBe(0);
    await db.query('update public.perfis set ativo = true where id = $1', [contas.gestor]);
  });

  it('tabela, sequência e função criadas depois não ficam abertas a anon nem gravaveis por authenticated', async () => {
    await db.exec(`
      create table public.depois (id serial primary key, x text);
      create function public.funcao_depois() returns int language sql as $$ select 1 $$;`);
    const r = await db.query<Record<string, boolean>>(`select
      has_table_privilege('anon', 'public.depois', 'select') as anon_le,
      has_table_privilege('authenticated', 'public.depois', 'select') as auth_le,
      has_table_privilege('authenticated', 'public.depois', 'insert, update, delete') as auth_grava,
      has_sequence_privilege('anon', 'public.depois_id_seq', 'usage') as anon_seq,
      has_function_privilege('anon', 'public.funcao_depois()', 'execute') as anon_executa`);
    expect(r.rows[0]).toEqual({ anon_le: false, auth_le: true, auth_grava: false, anon_seq: false, anon_executa: false });
  });
});
