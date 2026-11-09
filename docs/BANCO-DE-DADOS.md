# Banco de dados no Supabase (v2)

Banco PostgreSQL no Supabase que o front usa direto pela implementação `src/services/supabase/` (a outra fonte de
dados é o modo simulado, `src/services/mock/`; a escolha é por `VITE_FONTE_DADOS`). As regras de negócio são as mesmas
do modo simulado e valem no banco: o front esconder botões é só UX.

> A primeira versão do banco no Supabase, sobre o modelo da v1 (por lote), foi feita pelo **Erik** (branch `main`,
> `supabase/migrations/20261107000001` a `…0004`, com este mesmo formato de documento). A v2 refez o banco sobre o
> modelo novo (contrato + fardo + dormente), reaproveitando o projeto do Supabase que ele criou.

| Arquivo | Conteúdo |
|---|---|
| `supabase/migrations/0001_tabelas.sql` | tabelas dos dados (uma por entidade gravada, listas filhas com a coluna `ordem`), ids técnicos com prefixo (`public.novo_id`), relógio `public.agora()` e `public.hoje()` (fuso de São Paulo) e os gatilhos: nada se apaga, ID fixo, transições do dormente, código do local |
| `supabase/migrations/0002_perfis_e_politicas.sql` | tabela `perfis` ligada ao Supabase Auth (gatilho `ao_criar_conta` e `criar_perfis_das_contas`), permissões de cada perfil (iguais às de `src/dominio/permissoes.ts`), RLS só de leitura para quem está ativo, `falhar`, `exigir` e `registrar_evento` |
| `supabase/migrations/0003_armazenamento.sql` | bucket **privado** `anexos` (até 10 MB, só os tipos aceitos pelo app) e as políticas de leitura e envio |
| `supabase/migrations/0004_consultas.sql` | campos calculados: dias úteis com feriados, prazos e níveis, cura, volume, chave da NF-e; views `v_fardos`, `v_contrato_itens`, `v_contratos`, `v_ata_itens`, `v_locais`, `v_dofs`, `v_entregas`, `v_estoque_por_item`; `exportar_estado()` |
| `supabase/migrations/0005_operacoes.sql` | uma função `security definer` por operação do app, com as mesmas regras, mensagens e eventos do modo simulado, numa transação só |
| `supabase/migrations/0006_inventario.sql` | inventário físico por leitura de QR: abrir, ler, prévia e fechar |
| `supabase/migrations/0007_demonstracao.sql` | modelo da demonstração, `deslocar_datas`, `carregar_demonstracao` (datas do dia em que roda) e `reiniciar_demonstracao` (só administrador) |
| `supabase/migrations/0008_privilegios.sql` | privilégios explícitos, segunda camada além da RLS (ideia do banco do Erik): `anon` sem nada; `authenticated` só com `select` nas tabelas e views e `execute` só nas funções que o app chama e nas auxiliares de leitura das views e das políticas; objetos criados depois não ficam abertos a `anon` |
| `supabase/seed.sql` | **gerado** por `npm run seed`: o modelo da história de demonstração (a mesma do modo simulado, mesmos IDs), a ligação das contas `<perfil>@example.com` aos perfis e a carga |
| `supabase/seed_1.sql`, `seed_2.sql` | plano B, o mesmo conteúdo do `seed.sql` em duas partes, para o editor SQL que recusar os ~530 KB do arquivo inteiro |

## Como aplicar

No projeto do Supabase (o mesmo da v1), nesta ordem:

1. **Desligar o cadastro aberto:** Authentication › Sign In / Providers › desmarque **Allow new users to sign up**.
   As contas são criadas só pelo painel.
2. **Limpar o banco da v1** (só porque o projeto já foi usado pela v1): **SQL Editor › New query**, cole e rode o
   `reset.sql` do Erik (está no `main`; não faz parte da v2, vai aqui só como instrução):

   ```sql
   drop trigger if exists auth_novo_usuario on auth.users;
   drop policy if exists "holz: leitura" on storage.objects;
   drop policy if exists "holz: envio" on storage.objects;

   drop schema if exists public cascade;
   create schema public;

   grant usage on schema public to postgres, anon, authenticated, service_role;
   grant all on schema public to postgres, service_role;
   alter default privileges in schema public grant all on tables    to postgres, anon, authenticated, service_role;
   alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role;
   alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;
   ```

   Ele apaga as tabelas, o gatilho e as políticas de Storage da v1. As contas do Auth e os buckets antigos ficam.
3. **Migrações:** no SQL Editor, um arquivo por vez, em ordem: `0001_tabelas.sql` a `0008_privilegios.sql`. Cada
   um deve terminar sem erro. A `0002` já cria o perfil (requisitante) das contas que existiam no Auth.
4. **Contas de demonstração:** Authentication › Users › **Add user › Create new user**, com **Auto Confirm User**
   marcado: `administrador@example.com`, `almoxarife@example.com`, `gestor@example.com`, `requisitante@example.com`
   (senha à escolha).
5. **Carga:** no SQL Editor, `supabase/seed.sql`. Ele liga as quatro contas aos perfis e grava os dados com as datas
   do dia. Se faltar alguma conta, ele para e diz qual e-mail não foi encontrado em Authentication › Users: crie a
   conta e rode de novo. Se o editor recusar o tamanho do arquivo, rode `seed_1.sql` e depois `seed_2.sql`.
6. **Testar no computador:** configure o `.env.local` (abaixo), rode `npm run dev` e entre com uma das contas.
7. **Vercel:** em Settings › Environment Variables, cadastre `VITE_FONTE_DADOS=supabase`, `VITE_SUPABASE_URL` e
   `VITE_SUPABASE_ANON_KEY` (o `VITE_APP_URL` já está lá) e publique de novo (Deployments › Redeploy): as variáveis
   `VITE_` entram no build.

**Pela CLI:** `supabase link --project-ref <id>` e `supabase db push` aplicam as migrações (os passos 1, 2, 4 e 5
continuam pelo painel). Não misture os dois caminhos no mesmo banco: se a v1 foi aplicada pela CLI, o histórico de
migrações dela continua em `supabase_migrations.schema_migrations` e o `db push` vai acusar as versões do Erik; use o
SQL Editor.

**Depois:** "Reiniciar dados de demonstração" (Configurações, administrador) recarrega os dados com as datas do dia,
sem apagar contas nem perfis. Para mudar a história, rode `npm run seed` e execute o `seed.sql` novo.

## Contas e perfis

- Toda conta do Auth ganha uma linha em `perfis` com o perfil de menor acesso, **requisitante** (nome = parte do
  e-mail antes do @, ou o `nome` dos metadados). Conta nova, pelo gatilho `ao_criar_conta`; conta que já existia
  antes das migrações, pela `criar_perfis_das_contas()` (na `0002` e de novo no seed).
- **As contas antigas da v1 entram como requisitante e ativas**: podem entrar no app e abrir RMEs. Para tirá-las,
  inative na tela Usuários (administrador) ou no SQL Editor:
  `update public.perfis set ativo = false where email not like '%@example.com';`
- O perfil é mudado na tela **Usuários** (administrador) ou no SQL Editor:
  `update public.perfis set perfil = 'almoxarife' where email = 'fulano@exemplo.com';`
  Perfis: `administrador`, `almoxarife`, `gestor`, `requisitante` (permissões na seção 12 do plano).
- Conta inativa não entra. Nenhum perfil é apagado.
- **Buckets antigos** da v1 (`nfe-xml`, `dof-pdf`, `recebimento-fotos`, `visao-imagens`) não são usados pela v2 e
  podem ser apagados em Storage (esvazie cada um antes). A v2 usa só o `anexos`.

## Front

No `.env.local` (e as mesmas variáveis na Vercel):

```
VITE_FONTE_DADOS=supabase
VITE_SUPABASE_URL=https://<id-do-projeto>.supabase.co
VITE_SUPABASE_ANON_KEY=<chave "anon public">
```

Os dois valores ficam em **Project Settings › API**. A chave `anon` é pública por definição (quem protege os dados
são as funções e as políticas do banco); a `service_role` e a senha do banco nunca vão para o `.env` nem para o
repositório. Reinicie o `npm run dev`. O login é por e-mail e senha; a sessão fica guardada no aparelho (o QR abre a
ficha sem novo login) e "Sair" a apaga. Sem `VITE_FONTE_DADOS`, o app volta ao modo simulado.

## Como o front lê e grava

- **Leitura:** `rpc('exportar_estado')` devolve, numa chamada, tudo o que o usuário pode ler (com RLS). O front monta
  o mesmo estado do modo simulado e calcula as telas com as mesmas consultas; reaproveita por 3 s e recarrega depois
  de cada escrita.
- **Escrita:** `rpc('<função>', argumentos)`, uma função por operação (nomes em `src/services/montagem.ts`). A função
  confere a permissão, valida as regras, grava numa transação só e registra os eventos. Não há política de inclusão,
  alteração nem exclusão nas tabelas: o acesso direto é só de leitura.
- **Privilégios (0008), segunda camada:** mesmo que uma política RLS falte, `anon` não tem nenhum privilégio no
  `public` e `authenticated` só tem `select` nas tabelas e views. O `execute` vai só às funções que o app chama e às
  auxiliares que rodam como o usuário (as das views, das políticas e da `exportar_estado`: `ativo`, `pode`, `agora`,
  `hoje`, `dia_sp`, `dia_util`, `somar_dias_uteis`, `nivel_prazo`, `liberacao_cura`). As internas ficam fechadas.
  **Função nova:** se o app a chama, `grant execute ... to authenticated` na migração dela; se é interna, `revoke`
  (o padrão do Supabase abre função nova a `authenticated`). O teste `privilegios.test.ts` confere a lista contra o
  código do app.
- **Erros de regra:** código `P0<status>` com DETAIL `{ status, campos }`, convertido em `ApiError` (mesma mensagem e
  mesmos campos do modo simulado).
- **Arquivos:** enviados antes ao bucket `anexos` (`<pasta>/<uuid>/<arquivo>`); a função recebe `{ nome, tipo,
  caminho }`. Para abrir, o app pede um link temporário de 1 h.

## Testes

`npm test` aplica as migrações num Postgres em memória (PGlite, com o mínimo do Supabase) e roda a mesma suíte de
regras do modo simulado contra as funções do banco, as views × as consultas do app, o mapa ida e volta e a carga:
os privilégios (anon sem nada, authenticated só leitura, funções liberadas = as do app), o seed em dia com a história, o banco igual ao que o modo simulado geraria em cada um de 15 dias seguidos, as contas
que já existiam antes das migrações, a parada quando falta uma conta de demonstração e o plano B em duas partes.

## Pendências

- Integração com o sistema de inspeção e com o Sinaflor: fora do protótipo.
- Parâmetros editáveis (Etapa 11); Painel, alertas e Relatórios do IBAMA (Etapa 10).
- Medidas dos tamanhos, limites da inspeção e prazos seguem provisórios até a CPTM confirmar.
