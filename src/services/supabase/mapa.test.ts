import { describe, expect, it } from 'vitest';
import { criarDados } from '../mock/data';
import type { Estado } from '../mock/estado';
import { criarBanco, criarContas, como } from './bancoDeTeste';
import { diferencas } from './comparar';
import { deLinhas, paraLinhas, type Linhas } from './mapa';

const AGORA = new Date('2026-11-06T12:00:00-03:00');

/** O estado sem o que não vai ao banco (usuários vêm dos perfis; contadores, das sequências) e com as listas em ordem de id. */
function comparavel(e: Estado) {
  const { usuarios: _u, contadores: _c, dataBase: _d, ...resto } = JSON.parse(JSON.stringify(e)) as Estado;
  return resto;
}

describe('mapa entre o estado do app e as tabelas', () => {
  it('ida e volta: a história gravada nas tabelas volta igual', async () => {
    const e = criarDados(AGORA);
    const db = await criarBanco();
    await db.query('select public.carregar_linhas($1)', [JSON.stringify(paraLinhas(e))]);
    const contas = await criarContas(db);
    const linhas = await como(db, contas.administrador, async () => (await db.query<{ e: Linhas }>('select public.exportar_estado() as e')).rows[0].e);
    const volta = deLinhas(linhas, linhas.perfis);
    // No banco, as RMEs da demonstração são da conta do requisitante (no mock, do usuário "demo-requisitante").
    for (const r of e.rmes) r.solicitanteId = contas.requisitante;
    expect(diferencas(comparavel(volta), comparavel(e))).toEqual([]);
    expect(volta.usuarios.map((u) => u.perfil).sort()).toEqual(['administrador', 'almoxarife', 'gestor', 'requisitante']);
  }, 60_000);
});
