# Holz Trilho — Front-end

Gestão de dormentes ferroviários de madeira.

Interface web (React + TypeScript + Vite) do sistema de rastreabilidade de dormentes de madeira por QR code (versão 2).
**Escopo:** front-end com duas fontes de dados: o modo simulado (dados no navegador) e o Supabase (banco e login), escolhidas por `VITE_FONTE_DADOS`. Publicação na Vercel.

> ⚠️ **Estado atual:** em reestruturação para a v2. O app abre numa tela "Em construção" e as telas voltam etapa a etapa,
> conforme `docs/PLANO-V2.md`. Regras de negócio: `docs/ESPECIFICACAO-FUNCIONAL.md`. A versão 1 (por lote) está em `docs/arquivo/`.

## Executar

Requer Node.js 18+.

```bash
npm install
cp .env.example .env.local   # ajuste se necessário
npm run dev                  # http://localhost:5173
npm run build                # typecheck + build em dist/
npm test                     # testes (Vitest): domínio e regras no modo simulado e no banco (PGlite)
```

Login de demonstração: use como usuário `administrador`, `almoxarife`, `gestor` ou `requisitante` e qualquer senha (nenhuma autenticação real).
A vitrine de componentes fica em `http://localhost:5173/#/vitrine` (só administrador).
Para testar estados de erro/vazio: `http://localhost:5173/?simular=erro` ou `?simular=vazio`.

## Logo

O logo do Holz Trilho ainda está em desenvolvimento. Quando estiver pronto, coloque o arquivo em `public/assets/logo.svg`
(veja `public/assets/LEIA-ME.txt`). Sem o arquivo, a barra lateral e o login mostram o monograma "HT" no mesmo tamanho.

## Publicar na Vercel (QR code no celular)

A câmera do celular só funciona em endereço com https. Na Vercel, importe o fork e escolha a branch `v2-qrcode`, com:
build `npm run build`, saída `dist` e as variáveis `VITE_APP_URL` (a URL do projeto na Vercel, com `https://`, sem barra no
fim) e, para usar o banco, `VITE_FONTE_DADOS=supabase`, `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (sem elas, modo simulado). O `VITE_APP_URL` vai gravado em cada QR: confira antes de imprimir etiquetas.

## Variáveis de ambiente (`.env.local`)

| Variável | Função |
|---|---|
| `VITE_FONTE_DADOS` | `supabase` = banco e login do Supabase; ausente ou `mock` = modo simulado (dados no navegador) |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | projeto do Supabase (a chave anon é pública; a service_role nunca) |
| `VITE_LOGO_URL` | caminho do arquivo do logo |
| `VITE_UPLOAD_MAX_MB` | limite de upload no navegador (o servidor valida de novo) |
| `VITE_APP_URL` | base do link gravado nos QR (a URL da Vercel, com https) |

Tudo com prefixo `VITE_` vai para o navegador: **nunca** coloque senhas, chaves ou credenciais da fornecedora.

## Estrutura

```
src/
  config/env.ts            variáveis de ambiente
  rotas.tsx                lista única das telas: gera rotas e menu
  dominio/                 rótulos/cores dos estados, opções de filtro, permissões
  types/models.ts          modelos de dados
  services/
    contracts.ts           interface única `Servicos`
    montagem.ts            os serviços sobre um "motor" de dados (mesmas consultas para as duas fontes)
    erros.ts               ApiError e mensagens seguras
    mock/                  dados e regras do modo simulado
    supabase/              motor do Supabase (funções do banco), mapa estado ↔ tabelas, testes no PGlite
    auth/                  login simulado e Supabase Auth
    index.ts               escolhe mock ou supabase (VITE_FONTE_DADOS)
  components/              Layout, ListPage (tabela/filtros/paginação), FormModal, Modal, UploadModal, assistentes, estados, toasts
  contexts/                autenticação
  pages/                   Login e a tela provisória "Em construção"
docs/ESPECIFICACAO-FUNCIONAL.md  regras de negócio da v2 (fonte de verdade)
docs/PLANO-V2.md           plano de desenvolvimento por etapas
docs/arquivo/              documentos da v1 (PRD, contratos de API, integração com a inspeção)
```

## Banco (Supabase)

O SQL fica em `supabase/migrations/` (executado em ordem no editor SQL do Supabase) e a carga da demonstração em
`supabase/seed.sql` (gerada por `npm run seed` a partir da história do modo simulado; as datas são deslocadas para o dia
em que é executada). Toda escrita passa por uma função do banco com as mesmas regras do modo simulado; os testes rodam as
mesmas regras nos dois, com o banco num Postgres em memória (PGlite). Detalhes de cada arquivo, contas e perfis em
[`docs/BANCO-DE-DADOS.md`](docs/BANCO-DE-DADOS.md).

Passo a passo no projeto do Supabase (o mesmo da v1, que já tem contas no Auth):

1. Desligar o cadastro aberto: Authentication › Sign In / Providers › **Allow new users to sign up** desmarcado.
2. Banco já usado pela v1: rodar no SQL Editor o `reset.sql` do Erik (o texto está em `docs/BANCO-DE-DADOS.md`), que
   apaga o esquema `public`, o gatilho e as políticas de Storage da v1. Contas e buckets antigos ficam.
3. Rodar no SQL Editor as migrações `0001` a `0008`, um arquivo por vez, em ordem.
4. Criar as quatro contas em Authentication › Users › Add user, com **Auto Confirm User**: `administrador@example.com`,
   `almoxarife@example.com`, `gestor@example.com` e `requisitante@example.com`.
5. Rodar `supabase/seed.sql` (se o editor recusar o tamanho, `seed_1.sql` e depois `seed_2.sql`). Se faltar alguma
   conta, ele para e diz qual.
6. Configurar o `.env.local` (`VITE_FONTE_DADOS=supabase`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) e testar com
   `npm run dev`.
7. Cadastrar as mesmas três variáveis na Vercel e publicar de novo.

As contas antigas da v1 entram como **requisitante** (ativas; inative na tela Usuários se não forem usar). Os buckets
antigos (`nfe-xml`, `dof-pdf`, `recebimento-fotos`, `visao-imagens`) não são usados pela v2 e podem ser apagados em
Storage.

## Regras respeitadas pela interface

- Mensagens de sucesso só após a resposta do serviço. É um protótipo sem dados reais, então não há avisos de dados simulados.
- Botões ocultos e rotas protegidas são só UX; no Supabase, quem valida são as políticas e as funções do banco.
- As regras de negócio da v2 estão em `docs/ESPECIFICACAO-FUNCIONAL.md` e entram no código a partir da Etapa 2 do plano.

## Segurança

Sem `dangerouslySetInnerHTML`; URLs de documentos só http/https; erros sem detalhes técnicos; uploads restritos por extensão e tamanho;
sessão guardada no aparelho (para o QR abrir a ficha sem novo login; "Sair" a apaga); use HTTPS nos ambientes implantados.

## Pendências conhecidas

- Telas da v2 (ver as etapas em `docs/PLANO-V2.md`).
- Executar a Etapa 9 no projeto do Supabase e testar o app com `VITE_FONTE_DADOS=supabase`.
- Testes automatizados.
