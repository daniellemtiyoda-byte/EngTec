import { describe, expect, it } from 'vitest';
import { criarBanco, migracoes } from './bancoDeTeste';

describe('migrações do Supabase (PGlite)', () => {
  it('aplicam em ordem, sem erro', async () => {
    expect(migracoes().length).toBeGreaterThan(0);
    const db = await criarBanco();
    const t = await db.query<{ n: number }>(`select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`);
    expect(t.rows[0].n).toBeGreaterThan(30);
  }, 60_000);
});
