import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { somarDias } from '../../dominio/parametros';
import { criarDados } from '../mock/data';
import type { Estado } from '../mock/estado';
import { criarBanco, criarContas, como, executarSeed } from './bancoDeTeste';
import { deLinhas, type Linhas } from './mapa';
import { diferencas } from './comparar';
import { DIA_DO_MODELO, gerarSeed, gerarSeedEmPartes } from './seed';
import type { PGlite } from '@electric-sql/pglite';

const comparavel = (e: Estado) => {
  const { usuarios: _u, contadores: _c, dataBase: _d, ...resto } = JSON.parse(JSON.stringify(e)) as Estado;
  return resto;
};

async function estadoDoBanco(db: PGlite, usuarioId: string) {
  const linhas = await como(db, usuarioId, async () => (await db.query<{ e: Linhas }>('select public.exportar_estado() as e')).rows[0].e);
  return deLinhas(linhas, linhas.perfis);
}

const lerArquivo = (arquivo: string) => readFileSync(join(__dirname, '..', '..', '..', 'supabase', arquivo), 'utf8');
const NO_DIA_DO_MODELO = `${DIA_DO_MODELO}T12:00:00-03:00`;

/** O que o mock geraria no dia (mesma hora do dia), com as RMEs da conta do requisitante. */
function mockDoDia(dia: string, requisitante: string) {
  const e = criarDados(new Date(`${dia}T12:00:00-03:00`));
  for (const r of e.rmes) r.solicitanteId = requisitante;
  return e;
}

describe('carga da demonstração (seed.sql)', () => {
  it('o seed.sql e as duas partes do plano B estão em dia com a história do modo simulado (npm run seed)', () => {
    expect(lerArquivo('seed.sql')).toBe(gerarSeed());
    const [parte1, parte2] = gerarSeedEmPartes();
    expect(lerArquivo('seed_1.sql')).toBe(parte1);
    expect(lerArquivo('seed_2.sql')).toBe(parte2);
  });

  it('as datas acompanham o dia em que a carga é executada: o banco fica igual ao que o mock geraria naquele dia', async () => {
    const db = await criarBanco();
    const contas = await criarContas(db);
    // No dia do modelo e nos 14 dias seguintes (fins de semana, o feriado de 15/11 num domingo e o de 20/11 numa sexta).
    for (let n = 0; n <= 14; n++) {
      const dia = somarDias(DIA_DO_MODELO, n);
      await db.query(`select set_config('holz.agora', $1, false)`, [`${dia}T12:00:00-03:00`]);
      if (n === 0) await executarSeed(db);
      else await db.query('select public.carregar_demonstracao()');
      const banco = await estadoDoBanco(db, contas.administrador);
      expect({ dia, diferencas: diferencas(comparavel(banco), comparavel(mockDoDia(dia, contas.requisitante))) }).toEqual({ dia, diferencas: [] });
    }
  }, 300_000);

  it('reiniciar a demonstração: só o administrador; contas e perfis ficam', async () => {
    const db = await criarBanco();
    const contas = await criarContas(db);
    await db.query(`select set_config('holz.agora', $1, false)`, [`${DIA_DO_MODELO}T12:00:00-03:00`]);
    await executarSeed(db);
    await expect(como(db, contas.almoxarife, () => db.query('select public.reiniciar_demonstracao()'))).rejects.toThrow(/permissão/);
    await db.query(`insert into public.especies (nome_cientifico, nome_popular) values ('Teste', 'Teste')`);
    await como(db, contas.administrador, () => db.query('select public.reiniciar_demonstracao()'));
    const e = await estadoDoBanco(db, contas.administrador);
    expect(e.especies.some((x) => x.nomePopular === 'Teste')).toBe(false);
    expect(e.usuarios.find((u) => u.id === contas.administrador)?.nome).toBe('Administrador (demonstração)');
    expect(e.rmes.every((r) => r.solicitanteId === contas.requisitante)).toBe(true);
  }, 120_000);

  it('projeto reaproveitado: contas que já existiam no Auth antes das migrações ganham perfil, e o seed liga as de demonstração', async () => {
    const db = await criarBanco({
      antesDasMigracoes: async (d) => {
        await d.query(`insert into auth.users (email, raw_user_meta_data) values ('pessoa.v1@example.com', '{"nome": "Pessoa da v1"}')`);
        for (const p of ['administrador', 'almoxarife', 'gestor', 'requisitante']) await d.query('insert into auth.users (email) values ($1)', [`${p}@example.com`]);
      },
    });
    const perfis = async () => (await db.query<{ email: string; nome: string; perfil: string }>('select email, nome, perfil from public.perfis order by email')).rows;
    expect(await perfis()).toEqual([
      { email: 'administrador@example.com', nome: 'administrador', perfil: 'requisitante' },
      { email: 'almoxarife@example.com', nome: 'almoxarife', perfil: 'requisitante' },
      { email: 'gestor@example.com', nome: 'gestor', perfil: 'requisitante' },
      { email: 'pessoa.v1@example.com', nome: 'Pessoa da v1', perfil: 'requisitante' },
      { email: 'requisitante@example.com', nome: 'requisitante', perfil: 'requisitante' },
    ]);
    // Conta sem perfil (gatilho desligado quando foi criada): o seed cria antes de ligar.
    await db.exec('alter table auth.users disable trigger ao_criar_conta');
    await db.query(`delete from public.perfis where email = 'gestor@example.com'`);
    await db.exec('alter table auth.users enable trigger ao_criar_conta');

    await db.query(`select set_config('holz.agora', $1, false)`, [NO_DIA_DO_MODELO]);
    await executarSeed(db);
    expect(await perfis()).toEqual([
      { email: 'administrador@example.com', nome: 'Administrador (demonstração)', perfil: 'administrador' },
      { email: 'almoxarife@example.com', nome: 'Almoxarife (demonstração)', perfil: 'almoxarife' },
      { email: 'gestor@example.com', nome: 'Gestor (demonstração)', perfil: 'gestor' },
      { email: 'pessoa.v1@example.com', nome: 'Pessoa da v1', perfil: 'requisitante' },
      { email: 'requisitante@example.com', nome: 'Requisitante (demonstração)', perfil: 'requisitante' },
    ]);
    const semSolicitante = await db.query<{ n: number }>('select count(*)::int as n from public.rmes where solicitante_id is null');
    expect(semSolicitante.rows[0].n).toBe(0);
  }, 120_000);

  it('o seed para com mensagem quando falta uma conta de demonstração, e a carga sem o requisitante também', async () => {
    const db = await criarBanco();
    for (const p of ['administrador', 'almoxarife', 'requisitante']) await db.query('insert into auth.users (email) values ($1)', [`${p}@example.com`]);
    await db.query(`select set_config('holz.agora', $1, false)`, [NO_DIA_DO_MODELO]);
    await expect(executarSeed(db)).rejects.toThrow('Conta de demonstração não encontrada em Authentication › Users: gestor@example.com.');
    const rmes = await db.query<{ n: number }>('select count(*)::int as n from public.rmes');
    expect(rmes.rows[0].n).toBe(0);

    // Sem o requisitante, carregar_demonstracao não deixa as RMEs sem solicitante.
    await db.query(`delete from public.perfis where email = 'requisitante@example.com'`);
    await executarSeed(db, 'seed_1.sql');
    await expect(db.query('select public.carregar_demonstracao()')).rejects.toThrow('A conta requisitante@example.com não foi encontrada em Authentication › Users.');
  }, 120_000);

  it('plano B: seed_1.sql e seed_2.sql dão o mesmo banco que o seed.sql; o seed_2.sql sozinho ou repetido é recusado', async () => {
    const db = await criarBanco();
    const contas = await criarContas(db);
    await db.query(`select set_config('holz.agora', $1, false)`, [NO_DIA_DO_MODELO]);
    await expect(executarSeed(db, 'seed_2.sql')).rejects.toThrow('Execute antes o seed_1.sql');
    await executarSeed(db, 'seed_1.sql');
    await executarSeed(db, 'seed_2.sql');
    const modelo = await db.query<{ linhas: unknown }>('select linhas from public.demonstracao where id = 1');
    expect(modelo.rows[0].linhas).toEqual(JSON.parse(lerArquivo('seed.sql').split('$modelo$')[1]));
    const banco = await estadoDoBanco(db, contas.administrador);
    expect(diferencas(comparavel(banco), comparavel(mockDoDia(DIA_DO_MODELO, contas.requisitante)))).toEqual([]);
    await expect(executarSeed(db, 'seed_2.sql')).rejects.toThrow('Execute antes o seed_1.sql');
  }, 120_000);
});
