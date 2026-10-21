# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projeto

Holz Trilho: front-end (React 18 + TypeScript + Vite, sem outras dependências de runtime além de react-router-dom) de um sistema de gestão de dormentes ferroviários de madeira. **Escopo é só front-end**: back-end, persistência, autenticação real e visão computacional são de outros integrantes e não existem neste repositório. Código, identificadores, comentários e textos de UI são em português.

## Registro de alterações e manutenção deste arquivo (obrigatório)

- **Toda alteração feita no projeto deve ser registrada em `CHANGELOG.md`**, na seção `## [Não publicado]` do topo, no mesmo commit da alteração: data (AAAA-MM-DD), o que mudou, por quê e os arquivos principais afetados. Use as categorias Adicionado / Alterado / Corrigido / Removido.
- **Este CLAUDE.md deve estar sempre atualizado com o sistema.** Sempre que uma mudança alterar comandos, arquitetura, contratos de serviço, variáveis de ambiente, fluxo de trabalho ou regras de domínio descritos aqui, atualize este arquivo no mesmo commit. Uma informação desatualizada aqui é tratada como bug.

## Fluxo Git (fork)

- `origin` = fork pessoal (`daniellemtiyoda-byte/EngTec`); `upstream` = projeto original do grupo (`kailanyapereira/EngTec`).
- O push para `upstream` está bloqueado localmente (`pushurl = BLOQUEADO`) de propósito. Nunca enviar direto ao original: as alterações vão para o fork e chegam ao original só por Pull Request (`gh pr create --repo kailanyapereira/EngTec`), após aceitação do grupo.
- Para trazer o que o grupo já aceitou: `git pull upstream main`.

## Comandos

```bash
npm install
cp .env.example .env.local   # VITE_USE_MOCK=true por padrão
npm run dev                  # http://localhost:5173
npm run typecheck            # tsc --noEmit
npm run build                # typecheck + vite build em dist/
```

Não há testes automatizados nem ESLint configurados (os comentários `eslint-disable` no código são residuais). Validar mudanças com `npm run build`.

No modo simulado qualquer usuário/senha preenchidos entram. Para testar estados da UI: `http://localhost:5173/?simular=erro` ou `?simular=vazio` (tratado em `src/services/mock/util.ts`; o parâmetro fica antes do `#`, pois o app usa `HashRouter`).

## Arquitetura

**Camada de serviços com duas implementações da mesma interface.** As telas importam apenas `servicos` de `src/services/index.ts`, que escolhe entre `mock/` e `real/` conforme `VITE_USE_MOCK`. O contrato único é a interface `Servicos` em `src/services/contracts.ts`; os modelos ficam em `src/types/models.ts`. Ao adicionar uma operação, é preciso atualizar contrato, mock, real e `endpoints.ts` juntos — as telas não devem conhecer HTTP.

- `services/endpoints.ts`: todos os caminhos de API são **provisórios** (`estado: 'pendente de confirmação'`), nomeados pelo front. Só marcar `confirmado` após validar com a documentação do back-end (checklist em `docs/CONTRATOS-API.md`).
- `services/real/index.ts`: espera listas no formato `{ items, total, page, pageSize }`; nomes de parâmetros de consulta (`pagina`, `tamanho`, `busca`, `ordenarPor`, `ordem`) também são provisórios.
- `services/http.ts`: único ponto de `fetch`. Usa cookie de sessão (`credentials: 'include'`), converte falhas em `ApiError` com mensagem segura para exibir (use `mensagemSegura(e)` na UI), lê `campos` do corpo de erro como erros por campo, e em 401 dispara o evento `sgd:nao-autenticado`, que o `AuthContext` escuta para derrubar a sessão.
- `services/mock/`: dados fictícios em memória (mutações alteram os arrays de `data.ts`); `paginar()` implementa busca/filtro/ordenação/paginação no cliente. Respostas simuladas trazem `origem: 'simulado'`, que a UI usa para exibir o selo "Dados simulados".

**Componentes genéricos que quase todas as telas usam:**
- `ListPage` recebe `listar(q: ListQuery)`, `colunas`, `filtros`, `acoesLinha` e cuida de busca com debounce, filtros, ordenação, paginação e estados carregando/erro/vazio. Para forçar recarga após uma mutação, a tela incrementa um contador e passa em `recarregar`.
- `FormModal` gera formulários a partir de uma lista de `Campo`, com validação básica, `validar` entre campos e `confirmacao` opcional (abre `ConfirmModal` em operações críticas). Os valores chegam a `aoEnviar` como **strings**; a tela converte para os tipos do modelo.
- `UploadModal` valida extensão/tamanho (`VITE_UPLOAD_MAX_MB`) no navegador.
- `useAsync(fn, deps)` em `hooks/useAsync.ts` é o padrão para carregar dados fora de listas.

**Autenticação/permissões:** `AuthContext` mantém o usuário só em memória (sem `localStorage`, de propósito). `pode('modulo:acao')` e `RotaProtegida` são apenas UX — o servidor deve validar. Permissões usadas estão em `usuarioDemo` em `mock/data.ts`.

**Roteamento:** `HashRouter` em `App.tsx`, para funcionar em hospedagem estática sem rewrite. Todas as rotas exceto `/login` ficam sob `RotaProtegida`, que renderiza o `Layout` (sidebar com os grupos de navegação, busca global que leva a `/lotes?q=`, notificações).

## Regras de domínio e de interface a preservar

- Classe (1ª/2ª) é separada da categoria visual (A/B); metragem linear, volume documental e volume calculado são colunas distintas.
- Estoque distingue disponível × em análise × bloqueado × com divergência.
- Ajustes de inventário aparecem como pendentes até a aprovação; movimentações só alteram saldo após confirmação do sistema responsável.
- Contagem por imagem (visão computacional) é estimativa, mostra confiança/revisão e não altera saldo; espécie não é identificada por imagem.
- Mensagens de sucesso só após a resposta do serviço; em modo simulado, anexar `SUFIXO_SIMULADO` (de `config/env.ts`) ao texto do toast.
- Segurança: não usar `dangerouslySetInnerHTML`; URLs vindas da API passam por `urlSegura()` (só http/https); tudo com prefixo `VITE_` vai para o navegador, então nunca colocar segredos em `.env*`.
- Bandeira de SP: não é desenhada pelo código; o arquivo oficial deve ser colocado em `public/assets/bandeira-sp.svg` (sem ele, `BandeiraSP` mostra um espaço reservado). Veja `public/assets/LEIA-ME.txt`.
