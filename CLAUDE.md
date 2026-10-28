# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projeto

Holz Trilho: front-end (React 18 + TypeScript + Vite, sem outras dependências de runtime além de react-router-dom) de um sistema de gestão de dormentes ferroviários de madeira. **Escopo é só front-end**: back-end, persistência, autenticação real e visão computacional são de outros integrantes e não existem neste repositório. Código, identificadores, comentários e textos de UI são em português.

**O PRD em `docs/PRD.md` é a fonte de verdade do produto** (glossário, regras de negócio, requisitos RF01–RF34, telas com critérios de aceite e dados iniciais). Ideias da interface que já existia são aproveitadas quando não contradizem o PRD; em conflito, vale o PRD. Em dúvida sobre uma regra de negócio, pergunte antes de inventar. Construa primeiro os requisitos marcados como Essencial.

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
cp .env.example .env.local   # o exemplo traz VITE_USE_MOCK=true; sem a variável, o app usa a API real
npm run dev                  # http://localhost:5173
npm run typecheck            # tsc --noEmit
npm run build                # typecheck + vite build em dist/
```

Não há testes automatizados nem ESLint configurados (os comentários `eslint-disable` no código são residuais). Validar mudanças com `npm run build`.

No modo simulado qualquer usuário/senha preenchidos entram. Para testar estados da UI: `http://localhost:5173/?simular=erro` ou `?simular=vazio` (tratado em `src/services/mock/util.ts`; o parâmetro fica antes do `#`, pois o app usa `HashRouter`). Para testar a importação de NF-e, use o XML fictício `docs/exemplos/nfe-exemplo.xml` (CNPJ de um fornecedor do mock, chave válida e DOF citado em `infCpl`).

## Arquitetura

**Camada de serviços com duas implementações da mesma interface.** As telas importam apenas `servicos` de `src/services/index.ts`, que escolhe entre `mock/` e `real/` conforme `VITE_USE_MOCK` (só `"true"` explícito liga o mock). A comparação é feita direto em `import.meta.env` e os dados fictícios são gerados dentro de `criarDados()` em `mock/data.ts`, para o Vite descartar o mock no build com API real — não colocar código executado no topo dos módulos de `mock/`. O contrato único é a interface `Servicos` em `src/services/contracts.ts`; os modelos ficam em `src/types/models.ts`. Ao adicionar uma operação, é preciso atualizar contrato, mock, real e `endpoints.ts` juntos — as telas não devem conhecer HTTP.

- `services/endpoints.ts`: todos os caminhos de API são **provisórios** (`estado: 'pendente de confirmação'`), nomeados pelo front. Só marcar `confirmado` após validar com a documentação do back-end (checklist em `docs/CONTRATOS-API.md`).
- `services/real/index.ts`: espera listas no formato `{ items, total, page, pageSize }`; nomes de parâmetros de consulta (`pagina`, `tamanho`, `busca`, `ordenarPor`, `ordem`) também são provisórios. Operações com arquivo (NF + XML, DOF + PDF, recebimento + fotos) vão em multipart por `enviarComArquivos`: JSON no campo `dados` e os arquivos em campos próprios (`xml`, `pdf`, `fotos`), formato também provisório.
- `services/http.ts`: único ponto de `fetch`. Usa cookie de sessão (`credentials: 'include'`) e envia `X-Requested-With` em toda chamada (força preflight de CORS, proteção contra CSRF), converte falhas em `ApiError` com mensagem segura para exibir (use `mensagemSegura(e)` na UI), lê `campos` do corpo de erro como erros por campo, e em 401 dispara o evento `sgd:nao-autenticado`, que o `AuthContext` escuta para derrubar a sessão.
- `services/mock/`: dados fictícios em memória (mutações alteram os arrays de `data.ts`); `paginar()` implementa busca/filtro/ordenação/paginação no cliente. Respostas simuladas trazem `origem: 'simulado'`, que a UI usa para exibir o selo "Dados simulados". As regras do recebimento ficam em `mock/recebimento.ts` (`receber()`), usado tanto pelo serviço quanto por `data.ts` para gerar os lotes e fardos iniciais a partir das NFs fictícias: lotes nunca são inventados à parte.

**Dicionário do domínio (`src/dominio/`):** `rotulos.ts` tem o rótulo e a cor (`Tom`) de cada estado (`STATUS_REGISTRO`, `ESTADO_INVENTARIO`, etc.), `opcoes.ts` tem as opções de filtro/select (`STATUS_OPCOES`, `CLASSE_OPCOES`… e `opcoesDe(mapa)`), `permissoes.ts` tem o tipo `Permissao`, `parametros.ts` tem os parâmetros de negócio do PRD (tolerância de volume de 10%, 14 dormentes por fardo como sugestão) e as funções de prévia usadas pelas telas e pelo mock (`diferencaVolumePct`, `foraDaTolerancia`, `sugerirFardos`); no modo real a regra vale no servidor. Badges de estado usam `<BadgeDe mapa={…} valor={…} />`. Não definir mapas de rótulos nem opções dentro das páginas, e páginas não importam constantes de outras páginas.

**Rotas e menu:** `src/rotas.tsx` (`ROTAS`) é a lista única das telas protegidas; `App.tsx` gera as rotas e `Layout.tsx` gera o menu a partir dela. Tela nova = uma linha em `ROTAS`.

**Componentes genéricos que quase todas as telas usam:**
- `ListPage` recebe `listar(q: ListQuery)`, `colunas`, `filtros`, `acoesLinha` e cuida de busca com debounce, filtros, ordenação, paginação e estados carregando/erro/vazio. Para forçar recarga após uma mutação, a tela incrementa um contador e passa em `recarregar`. Em `Coluna<T>`, coluna `ordenavel` exige `chave` que seja campo real do modelo (vai como `sortBy`).
- `FormModal` gera formulários a partir de uma lista de `Campo`, com validação básica, `validar` entre campos e `confirmacao` opcional (abre `ConfirmModal` em operações críticas). Para edição, `iniciais` preenche o formulário ao abrir. Campo `tipo: 'arquivo'` (com `extensoes`, `multiplo`) entrega os arquivos no segundo argumento de `aoEnviar(valores, arquivos)`. Formulários com listas (itens da NF, fardos) são modais próprios (`NfModal`, `RecebimentoModal`) sobre `Modal largo`. Os valores chegam a `aoEnviar` como **strings**; a tela converte para os tipos do modelo. Números **sempre** com `paraNumero(texto, inteiro)` de `utils/format.ts` — a mesma função que o `FormModal` usa na validação (aceita `1.000`, `2,8`, `1.234,5`); nunca `Number()` direto.
- `ErroTela` (Error Boundary) envolve o `<Outlet />` do Layout: uma tela que quebra mostra um aviso sem derrubar o app.
- Alertas são buscados uma vez no `AlertasProvider` (montado em `RotaProtegida`) e lidos com `useAlertas()` pelo sino e pelo Dashboard. Links vindos da API passam por `linkInterno()`.
- Arquivos são validados no navegador por `arquivoInvalido(f, extensoes)` (`utils/format.ts`: extensão, `VITE_UPLOAD_MAX_MB`, arquivo vazio), usado por `UploadModal`, `FormModal` e os modais de NF e recebimento.
- `utils/nfeXml.ts` lê o XML da NF-e com `DOMParser` (modo XML, sem executar nada) só para preencher o formulário; `chaveAcessoValida()` confere os 44 dígitos e o dígito verificador. O servidor recebe o arquivo e valida de novo.
- `useAsync(fn, deps)` em `hooks/useAsync.ts` é o padrão para carregar dados fora de listas.

**Autenticação/permissões:** `AuthContext` mantém o usuário só em memória (sem `localStorage`, de propósito). `pode(p: Permissao)` e `RotaProtegida` são apenas UX — o servidor deve validar. Permissão nova entra em `dominio/permissoes.ts` (e em `usuarioDemo`, em `mock/data.ts`, para aparecer no modo simulado).

**Roteamento:** `HashRouter` em `App.tsx`, para funcionar em hospedagem estática sem rewrite. Todas as rotas exceto `/login` ficam sob `RotaProtegida`, que renderiza o `Layout` (sidebar com os grupos de navegação, busca global que leva a `/lotes?q=`, notificações). Sem sessão, redireciona ao login guardando caminho + parâmetros para voltar depois.

## Regras de domínio e de interface a preservar

- Use exatamente os termos do glossário do PRD: **fardo** (nunca "pallet" ou "amarrado"), lote, RME, DOF, classe, categoria.
- **Classe** depende da espécie (cadastro de espécies, ex. "1ª"); **categoria** é numérica (1, 2, 3...) e vem do estado do dormente. São campos diferentes e sempre aparecem com o nome do campo ("Classe 1ª", "Categoria 2"). As duas chegam do projeto de inspeção, mas também podem ser lançadas manualmente, registrando quem lançou.
- Fluxo de entrada: NF (manual ou XML, chave de acesso repetida é recusada) → DOF (um por NF no MVP, com PDF, volume **por espécie** como no documento) → recebimento. Sem DOF não há recebimento.
- No recebimento o usuário informa a quantidade de cada fardo; a conferida é a soma. Divergência de quantidade com a NF (em qualquer item) ou avaria exige fotos.
- Divergência de volume é comparada **por espécie** (soma dos lotes da espécie x volume do DOF da espécie). Acima de 10% não bloqueia: aviso crítico, confirmação, justificativa obrigatória e alerta; os lotes desse recebimento ficam "Com divergência", fora da separação até serem liberados. O volume documental de cada lote é o volume do DOF da espécie distribuído entre os lotes dela, proporcional ao volume calculado.
- Lote = NF + espécie + tamanho, criado **automaticamente** ao confirmar o recebimento (nunca digitado; não há cadastro manual de lote), com código sequencial por ano (`LT26-0042`) e status "aguardando inspeção". Fardo tem código gerado a partir do lote (ex. `LT26-0042-F03`), só com dados que não mudam depois do recebimento; saída parcial deixa o fardo "aberto" com o saldo restante.
- Medidas dos tamanhos (T1, T2, T3) e classes das espécies vêm do cadastro (no modo simulado, de `mock/data.ts`), nunca de constantes nas telas; enquanto não confirmadas pela CPTM aparecem como "Provisório" ou "a definir".
- Volume em m³ é sempre calculado pelo sistema a partir de largura, altura e comprimento do tamanho; volume documental (NF/DOF) e volume calculado são colunas distintas, e divergência acima de 10% gera alerta (regra do IBAMA).
- Saída de estoque só por RME: separação com sugestão FIFO (lote mais antigo, priorizando fardos abertos; pular exige justificativa) e baixa só após aprovação do supervisor.
- Material aguardando inspeção, em quarentena ou reprovado não fica disponível para separação. O sistema de inspeção é externo: no front, simular o retorno dele com lançamento manual.
- O MVP não usa QR Code nem modo offline; as entradas são manuais (exceto a importação do XML da NF-e).
- Estoque distingue disponível × em análise × bloqueado × com divergência.
- Ajustes de inventário aparecem como pendentes até a aprovação; movimentações só alteram saldo após confirmação do sistema responsável.
- Contagem por imagem (visão computacional) é estimativa, mostra confiança/revisão e não altera saldo; espécie não é identificada por imagem.
- Mensagens de sucesso só após a resposta do serviço; em modo simulado, anexar `SUFIXO_SIMULADO` (de `config/env.ts`) ao texto do toast.
- Segurança: não usar `dangerouslySetInnerHTML`; URLs externas vindas da API passam por `urlSegura()` (só http/https) e links internos por `linkInterno()`; tudo com prefixo `VITE_` vai para o navegador, então nunca colocar segredos em `.env*`.
- Bandeira de SP: não é desenhada pelo código; o arquivo oficial deve ser colocado em `public/assets/bandeira-sp.svg` (sem ele, `BandeiraSP` mostra um espaço reservado). Veja `public/assets/LEIA-ME.txt`.
