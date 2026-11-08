import { PERFIS_LISTA } from '../../dominio/permissoes';
import { criarDados, nomeDemo } from '../mock/data';
import { paraLinhas } from './mapa';

/**
 * Conteúdo do supabase/seed.sql: o modelo da história de demonstração (a mesma do modo simulado, gerada pelas regras
 * do app num dia fixo), os perfis das quatro contas de demonstração e a carga com as datas do dia em que é executado.
 * Plano B, para o editor SQL que recusar o arquivo inteiro: o mesmo conteúdo em seed_1.sql e seed_2.sql (o modelo
 * dividido pelas coleções). Gerados por `npm run seed`; o teste seed.test.ts confere que estão em dia com o mock.
 */
export const DIA_DO_MODELO = '2026-11-06';
export const emailDemo = (p: string) => `${p}@example.com`;

const CONTAS = PERFIS_LISTA.map(emailDemo).join(', ');

function modelo(): Record<string, unknown> {
  const linhas = paraLinhas(criarDados(new Date(`${DIA_DO_MODELO}T12:00:00-03:00`))) as unknown as Record<string, unknown>;
  if (JSON.stringify(linhas).includes('$modelo$')) throw new Error('O modelo não pode conter o delimitador $modelo$.');
  return linhas;
}

/**
 * Divide o modelo em duas partes de tamanho parecido, na ordem em que está: as listas grandes (eventos, dormentes)
 * ficam com o começo numa parte e o resto na outra; a parte 2 junta as listas à parte 1 na mesma ordem.
 */
function dividir(linhas: Record<string, unknown>): [Record<string, unknown>, Record<string, unknown>] {
  const metade = JSON.stringify(linhas).length / 2;
  const a: Record<string, unknown> = {};
  const b: Record<string, unknown> = {};
  let tamanho = 0;
  for (const [chave, valor] of Object.entries(linhas)) {
    if (tamanho >= metade) b[chave] = valor;
    else if (!Array.isArray(valor)) {
      a[chave] = valor;
      tamanho += JSON.stringify(valor).length;
    } else {
      const inicio: unknown[] = [];
      let i = 0;
      for (; i < valor.length && tamanho < metade; i++) {
        inicio.push(valor[i]);
        tamanho += JSON.stringify(valor[i]).length + 1;
      }
      a[chave] = inicio;
      if (i < valor.length) b[chave] = valor.slice(i);
    }
  }
  return [a, b];
}

const inserirModelo = (linhas: Record<string, unknown>) => `insert into public.demonstracao (id, data_base, linhas)
values (1, '${DIA_DO_MODELO}', $modelo$${JSON.stringify(linhas)}$modelo$::jsonb)
on conflict (id) do update set data_base = excluded.data_base, linhas = excluded.linhas;
`;

/** Liga as contas de demonstração aos perfis (para se faltar alguma) e grava os dados. */
function contasECarga(): string {
  const valores = PERFIS_LISTA.map((p) => `  ('${emailDemo(p)}', '${p}', '${nomeDemo(p)}')`).join(',\n');
  return `-- Contas criadas antes das migrações (ex.: projeto reaproveitado) ganham o perfil que faltar.
select public.criar_perfis_das_contas();

update public.perfis p set perfil = v.perfil, nome = v.nome
from (values
${valores}
) as v(email, perfil, nome)
where p.email = v.email;

do $$
declare
  v_faltam text;
begin
  select string_agg(v.email, ', ' order by v.ordem) into v_faltam
  from (values
${PERFIS_LISTA.map((p, i) => `    (${i + 1}, '${emailDemo(p)}', '${p}')`).join(',\n')}
  ) as v(ordem, email, perfil)
  where not exists (select 1 from public.perfis p where p.email = v.email and p.perfil = v.perfil);
  if v_faltam is not null then
    raise exception 'Conta de demonstração não encontrada em Authentication › Users: %. Crie a conta (Add user, com Auto Confirm User) e execute o seed de novo.', v_faltam;
  end if;
end $$;

select public.carregar_demonstracao();
`;
}

export function gerarSeed(): string {
  return `-- Holz Trilho v2 · seed.sql · Dados de demonstração (GERADO por \`npm run seed\`; não editar à mão)
-- Executar no editor SQL do Supabase DEPOIS das migrações e DEPOIS de criar as quatro contas de demonstração em
-- Authentication › Users (${CONTAS}).
-- 1. Guarda o modelo da história (as datas são de ${DIA_DO_MODELO}; a carga as desloca para o dia em que roda).
-- 2. Liga as contas de demonstração aos perfis, com os nomes usados no histórico; para se faltar alguma.
-- 3. Grava os dados (apaga os dados anteriores; contas e perfis ficam).
-- Pode ser executado de novo a qualquer momento; "Reiniciar dados de demonstração" (Configurações) faz o passo 3.
-- Se o editor SQL recusar o tamanho deste arquivo, execute seed_1.sql e depois seed_2.sql (o mesmo conteúdo).

${inserirModelo(modelo())}
${contasECarga()}`;
}

/** O mesmo que o seed.sql, em dois arquivos: seed_1.sql e seed_2.sql, executados nessa ordem. */
export function gerarSeedEmPartes(): [string, string] {
  const [a, b] = dividir(modelo());
  // A lista dividida tem de estar só com a parte 1: assim o seed_2.sql não junta duas vezes a mesma parte.
  const cortadas = Object.keys(b).filter((k) => k in a).map((k) => ` and jsonb_array_length(linhas->'${k}') = ${(a[k] as unknown[]).length}`).join('');
  const parte1 = `-- Holz Trilho v2 · seed_1.sql · Dados de demonstração, parte 1 de 2 (GERADO por \`npm run seed\`; não editar à mão)
-- Plano B do seed.sql, para o editor SQL que recusar o arquivo inteiro: execute este e depois o seed_2.sql.
-- Guarda a primeira parte do modelo da história.

${inserirModelo(a)}`;
  const parte2 = `-- Holz Trilho v2 · seed_2.sql · Dados de demonstração, parte 2 de 2 (GERADO por \`npm run seed\`; não editar à mão)
-- Execute depois do seed_1.sql. Completa o modelo, liga as contas de demonstração (${CONTAS})
-- aos perfis e grava os dados, como o seed.sql.

do $$
begin
  if not exists (select 1 from public.demonstracao where id = 1 and data_base = '${DIA_DO_MODELO}' and linhas ?& array[${Object.keys(a).map((k) => `'${k}'`).join(', ')}]${cortadas}) then
    raise exception 'Execute antes o seed_1.sql (primeira parte do modelo da demonstração). Se o seed_2.sql já foi executado, execute os dois de novo, nessa ordem.';
  end if;
end $$;

-- Junta a parte 2: as listas continuam as da parte 1; o resto entra como está.
update public.demonstracao d set linhas = d.linhas || (
  select jsonb_object_agg(k, case when jsonb_typeof(d.linhas->k) = 'array' then (d.linhas->k) || v else v end)
  from jsonb_each($modelo$${JSON.stringify(b)}$modelo$::jsonb) as parte(k, v)
)
where id = 1;

${contasECarga()}`;
  return [parte1, parte2];
}
