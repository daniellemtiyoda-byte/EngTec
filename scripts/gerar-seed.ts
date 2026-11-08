// Gera supabase/seed.sql (e o plano B em duas partes, seed_1.sql e seed_2.sql) a partir da história de demonstração
// do mock: npm run seed
import { writeFileSync } from 'node:fs';
import { gerarSeed, gerarSeedEmPartes } from '../src/services/supabase/seed';

const gravar = (arquivo: string, conteudo: string) => writeFileSync(new URL(`../supabase/${arquivo}`, import.meta.url), conteudo, 'utf8');
gravar('seed.sql', gerarSeed());
const [parte1, parte2] = gerarSeedEmPartes();
gravar('seed_1.sql', parte1);
gravar('seed_2.sql', parte2);
console.log('supabase/seed.sql, seed_1.sql e seed_2.sql gerados.');
