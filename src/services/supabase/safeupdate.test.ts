import { describe, expect, it } from 'vitest';
import { criarBanco } from './bancoDeTeste';
import { comandosSemWhere } from './safeupdate';

describe('pg_safeupdate: UPDATE e DELETE sem WHERE', () => {
  it('o analisador acha o que o pg_safeupdate recusaria', () => {
    const recusados = [
      `begin update public.emissoes set nf = jsonb_set(nf, '{a}', to_jsonb(1)); end`,
      `begin delete from public.feriados; end`,
      `begin delete from _sugestao; end`,
      `begin if x then update t set a = 1; end if; end`,
      `begin update t set a = (select b from u where u.id = t.id); end`,          // o WHERE é da subconsulta
      `begin execute format('update public.%I set ativo = $1', p_tabela) using v; end`,
      `begin execute 'delete from ' || quote_ident(t); end`,
      `begin with x as (delete from t returning *) select count(*) from x; end`,
    ];
    for (const sql of recusados) expect(comandosSemWhere(sql), sql).toHaveLength(1);

    const aceitos = [
      `begin update t set a = 1 where true; end`,
      `begin delete from public.feriados where true; end`,
      `begin update public.t x set a = 1 where x.id = p_id; end`,
      `begin execute format('update public.%I set ativo = $1 where id = $2', p_tabela) using a, b; end`,
      `begin insert into s values (1) on conflict (n) do update set v = s.v + 1; end`,
      `begin select * into r from t where id = 1 for update; if tg_op = 'UPDATE' then return new; end if; end`,
      `begin -- update t set a = 1;\n /* delete from t; */ raise notice 'update t set a = 1 sem where?'; end`,
      `begin execute 'truncate public.t'; end`,                                    // TRUNCATE passa
    ];
    for (const sql of aceitos) expect(comandosSemWhere(sql), sql).toEqual([]);
  });

  it('nenhuma função do banco (versão final, depois de todas as migrações) tem UPDATE ou DELETE sem WHERE', async () => {
    const db = await criarBanco();
    const fs = (await db.query<{ nome: string; fonte: string }>(
      `select p.oid::regprocedure::text as nome, p.prosrc as fonte from pg_proc p
       where p.pronamespace = 'public'::regnamespace and p.prolang in (select oid from pg_language where lanname in ('plpgsql', 'sql'))`,
    )).rows;
    expect(fs.length).toBeGreaterThan(50);
    const problemas = fs.flatMap((f) => comandosSemWhere(f.fonte).map((c) => `${f.nome}: ${c}`));
    expect(problemas, 'use "where true" (ou o WHERE real): o PostgREST do Supabase recusa com o código 21000').toEqual([]);
  }, 60_000);
});
