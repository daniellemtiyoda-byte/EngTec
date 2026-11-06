# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projeto

Holz Trilho v2: front-end (React 18 + TypeScript + Vite) do sistema de **rastreabilidade de dormentes ferroviários de madeira por QR code** para a CPTM. Cada dormente tem um ID único gravado em QR na plaquinha que o fornecedor já fixa, e o sistema acompanha sua vida do contrato até a saída para a via. Código, identificadores, comentários e textos de UI são em português.

**Fonte de verdade:** `docs/ESPECIFICACAO-FUNCIONAL.md` (regras de negócio, glossário, perfis) e `docs/PLANO-V2.md` (arquitetura, modelo, telas, padrões visuais e etapas). Elas substituem o PRD da v1, arquivado em `docs/arquivo/PRD-v1.md` só para consulta histórica. Em conflito entre os dois, a especificação manda na regra de negócio e o plano na implementação. Em dúvida sobre uma regra de negócio, pergunte antes de inventar; em dúvida sobre interface, siga os padrões da seção 8 do plano.

**Escopo:** só front-end, com a camada de serviços simulada (`mock/`). O banco e o login entram juntos no Supabase, numa etapa própria (Etapa 10), como outra implementação da mesma camada. Não há back-end próprio; integração real com o sistema de inspeção e com o Sinaflor fica fora. É um protótipo que nunca terá dados reais: **não há banner de "modo simulado", selo de "dados simulados" nem sufixo de simulado nos toasts**; o único aviso de demonstração é o do Simulador do fornecedor.

## Fluxo de trabalho por etapas (obrigatório)

- O trabalho segue as **etapas da seção 13 do `docs/PLANO-V2.md`, na ordem e uma por vez**. Só avance para a próxima etapa quando a Dani pedir.
- Cada etapa termina com `npm run build` sem erros, o checklist da seção 14 do plano, uma entrada no `CHANGELOG.md`, este arquivo atualizado e um commit.
- **Etapa atual:** Etapa 0 concluída (documentação no lugar, limpeza do código v1 e revisão das decisões em plano e especificação). O app abre numa tela "Em construção" (`pages/EmConstrucao.tsx`). Próxima: Etapa 1 (fundação visual, casca, perfis e vitrine). Etapas seguintes: 2 domínio e testes, 3 cadastros e contratos, 4 QR, 5 recebimento, 6 inspeção, 7 estoque, 8 saídas, 9 painel, 10 Supabase, 11 acabamento.
- Código da v1 removido (telas, mock, modais de NF, recebimento, separação, Inspector) continua no histórico: `git show main:src/components/NfModal.tsx` ou a branch `backup/v1`. Ao adaptar um deles numa etapa, parta de lá em vez de reescrever do zero.

## Registro de alterações e manutenção deste arquivo (obrigatório)

- **Toda alteração feita no projeto deve ser registrada em `CHANGELOG.md`**, na seção `## [Não publicado]` do topo, no mesmo commit da alteração: data (AAAA-MM-DD), o que mudou, por quê e os arquivos principais afetados. Use as categorias Adicionado / Alterado / Corrigido / Removido.
- **Este CLAUDE.md deve estar sempre atualizado com o sistema.** Sempre que uma mudança alterar comandos, arquitetura, contratos de serviço, variáveis de ambiente, dependências, fluxo de trabalho ou regras de domínio descritos aqui, atualize este arquivo no mesmo commit. Uma informação desatualizada aqui é tratada como bug.

## Fluxo Git (fork)

- `origin` = fork pessoal (`daniellemtiyoda-byte/EngTec`); `upstream` = projeto original do grupo (`kailanyapereira/EngTec`).
- O push para `upstream` está bloqueado localmente (`pushurl = BLOQUEADO`) de propósito. Nunca enviar direto ao original: as alterações vão para o fork e chegam ao original só por Pull Request (`gh pr create --repo kailanyapereira/EngTec`), quando a Dani pedir.
- A v2 é desenvolvida na branch `v2-qrcode`. Para trazer o que o grupo já aceitou: `git pull upstream main`.

## Comandos

```bash
npm install
cp .env.example .env.local   # o exemplo traz VITE_USE_MOCK=true; sem a variável, o app usa a API real
npm run dev                  # http://localhost:5173
npm run typecheck            # tsc --noEmit
npm run build                # typecheck + vite build em dist/
```

ESLint não está configurado. Validar mudanças com `npm run build`. O Vitest entra na Etapa 2 (`npm test`), para `dominio/identificacao.ts` e as regras do mock.

No modo simulado qualquer usuário e senha entram como administrador; na Etapa 1 o nome digitado passa a escolher o perfil (`administrador`, `almoxarife`, `gestor`, `requisitante`). Para testar estados da UI: `http://localhost:5173/?simular=erro` ou `?simular=vazio` (tratado em `src/services/mock/util.ts`; o parâmetro fica antes do `#`, pois o app usa `HashRouter`).

**Câmera exige HTTPS** (ou `localhost`). O app é publicado na **Vercel** (HTTPS; o `HashRouter` dispensa configuração de rotas), e a URL da Vercel é o `VITE_APP_URL` gravado nos QR. O projeto na Vercel com a URL definitiva é pré-requisito da Etapa 4; a URL é registrada aqui nessa etapa.

## Dependências

Runtime: `react`, `react-dom`, `react-router-dom` e, como exceções justificadas no plano, só estas três (ainda não instaladas; entram na etapa em que são usadas):
- `qrcode` (Etapa 4): gera o QR com `toDataURL()`, exibido em `<img>`.
- `jsqr` (Etapa 4): lê o QR de quadros da câmera num `<canvas>` quando o navegador não tem `BarcodeDetector`.
- `@supabase/supabase-js` (Etapa 10): login pelo Supabase Auth e a implementação `services/supabase/`.

Desenvolvimento: `vitest` (Etapa 2) e `@types/qrcode` (Etapa 4). Qualquer outra dependência precisa ser combinada antes.

## Arquitetura (o que ficou da v1)

**Camada de serviços com implementações da mesma interface.** As telas importam apenas `servicos` de `src/services/index.ts`, que escolhe entre `mock/` e `real/` conforme `VITE_USE_MOCK` (só `"true"` explícito liga o mock). A comparação é feita direto em `import.meta.env` e os dados fictícios são gerados dentro de `criarDados()` em `mock/data.ts`, para o Vite descartar o mock no build sem ele: não colocar código executado no topo dos módulos de `mock/`. O contrato único é a interface `Servicos` em `src/services/contracts.ts` (hoje só `auth`); os modelos ficam em `src/types/models.ts` (hoje `Origem`, `Paginado`, `ListQuery`, `Usuario`). Ao adicionar uma operação, atualizar contrato, mock, real e `endpoints.ts` juntos; as telas não conhecem HTTP nem Supabase.

- `services/http.ts`: único ponto de `fetch` da implementação `real/`. Converte falhas em `ApiError` com mensagem segura para exibir (use `mensagemSegura(e)` na UI), lê `campos` do corpo de erro como erros por campo e, em 401, dispara `sgd:nao-autenticado`, que o `AuthContext` escuta para derrubar a sessão.
- `services/endpoints.ts`: caminhos **provisórios** (`estado: 'pendente de confirmação'`); `real/index.ts` tem os auxiliares de lista paginada (`{ items, total, page, pageSize }`) e de envio multipart (`enviarComArquivos`).
- `services/mock/util.ts`: `paginar()` (busca, filtro, ordenação e paginação no cliente), `simularRede()` (`?simular=`), datas no fuso de São Paulo.
- **Supabase (Etapa 10):** entra como implementação `services/supabase/`, escolhida por variável de ambiente (`VITE_FONTE_DADOS=mock|supabase`), sem mudar telas. Claude escreve o SQL em `supabase/migrations/` (tabela `perfis`, tabelas dos dados, views dos campos calculados, funções das operações que mudam várias tabelas, políticas RLS por perfil e a carga da história de demonstração com os mesmos IDs do mock) e a Dani executa no editor SQL do Supabase. Nessa etapa saem `services/real/`, `http.ts` e `endpoints.ts`, e `ApiError`/`mensagemSegura()` vão para `services/erros.ts`. Por isso os tipos de `models.ts` são pensados como tabelas: `id` próprio, vínculos por id (`contratoId`, `fardoId`) e campos calculados marcados como tal.

**Rotas e menu:** `src/rotas.tsx` (`ROTAS`) é a lista única das telas protegidas; `App.tsx` gera as rotas e `Layout.tsx` gera o menu a partir dela. Tela nova = uma linha em `ROTAS`; grupo novo = um item em `GRUPOS_MENU` (os grupos v2 entram na Etapa 1: Início, Suprimento, Entrada, Estoque, Saída, Cadastros). `permissoes` (basta uma) esconde a tela do menu e, pelo endereço, mostra "sem permissão" (`ExigePermissao`, só UX); `foraDoMenu` deixa a rota só por link (páginas de objeto). `HashRouter`, para hospedagem estática. Todas as rotas exceto `/login` ficam sob `RotaProtegida`, que sem sessão redireciona ao login guardando caminho + parâmetros: é isso que faz o QR (`/#/d/<id>`) abrir a ficha depois do login.

**Componentes genéricos mantidos** (base dos padrões de página da seção 8 do plano): `ListPage` (busca com debounce, filtros e busca no endereço, chips, ordenação, paginação, colunas opcionais, cartões no celular, ação `principal` como `btn-acao` e o resto no `MenuAcoes`), `FormModal` (formulário a partir de `Campo[]`, `validarCampos()`, confirmação, arquivos) e `FormLinha` (inclusão em linha), `Modal`/`ConfirmModal` (`largo` ocupa a tela no celular), `ProgressoPassos` (`Passos.tsx`, assistentes: o último passo é sempre "Revisar e confirmar"), `Contador` (−/+), `LinhaTempo` (eventos genéricos `EventoLinhaTempo`), `Etapas`, `PainelAbas`, `Toast`, `ErroTela` (Error Boundary em volta do `<Outlet />`), `Estados` (carregando, vazio, erro, `Aviso`, `ComoFunciona`, `PageHeader`), `Badge`/`BadgeDe`, `CodigoLink` (`Codigos.tsx`, rota por `rotaDoCodigo()` de `utils/busca.ts`, que só reconhece os IDs v2 a partir da Etapa 4), `UploadModal`, `Logo`, `Icone`. `useAsync(fn, deps)` é o padrão para carregar dados fora de listas.

**Utilitários:** `utils/format.ts` (formatação; números digitados **sempre** com `paraNumero(texto, inteiro)`, nunca `Number()` direto; `arquivoInvalido()`, `urlSegura()`, `linkInterno()`); `utils/nfeXml.ts` (lê o XML da NF-e com `DOMParser`, sem executar nada, e confere a chave de acesso com `chaveAcessoValida()`; usado no recebimento da Etapa 5, com o XML fictício `docs/exemplos/nfe-exemplo.xml`).

**Dicionário do domínio (`src/dominio/`):** `rotulos.ts` (tipo `Tom`, mapas `Rotulos<K>` de rótulo e cor por estado), `opcoes.ts` (`opcoesDe(mapa)`), `permissoes.ts` (tipo `Permissao`; hoje só `admin`). Na Etapa 2 entram `identificacao.ts` (formatos de ID, `lerCodigo()`, `linkQr()`), os mapas de situação v2 e as permissões granulares. Paleta semântica: verde = disponível/concluído, azul = em andamento, laranja = atenção, vermelho = bloqueio ou prazo vencido, cinza = encerrado/neutro. Não definir mapas de rótulos nem opções dentro das páginas.

**Menu lateral:** recolhível pelo ícone discreto no topo, ao lado do logo (`.recolher` dentro de `.marca` no `Layout`); não há botão no rodapé.

**Autenticação:** `AuthContext` com `entrar`, `sair` e `pode(p: Permissao)`; `pode()` e `RotaProtegida` são só UX, quem valida são as políticas RLS do Supabase (Etapa 10). Na Etapa 1 a autenticação vira um serviço separado da camada de dados (`services/auth/`), usado só pelo `AuthContext`, com a implementação simulada (nome do usuário escolhe o perfil; hoje a sessão simulada fica em memória). Na Etapa 10 entra a implementação do **Supabase Auth** (e-mail e senha), com o perfil numa tabela `perfis` e a **sessão guardada no aparelho** (padrão do `supabase-js`), para o QR abrir a ficha sem novo login. As contas são criadas no painel do Supabase; a tela Usuários só lista e edita perfil e situação. Perfis e permissões granulares estão na seção 12 do plano.

## Modelo v2: contrato, fardo e dormente com QR

Resumo para orientar o código; o detalhe está na especificação (seções 2 a 5) e no plano (seção 5). A seção de regras é reescrita em detalhe na Etapa 2.

- **Não existe mais lote** (NF + espécie + tamanho, `LT26-0042`): o agrupamento é **contrato + fardo**. Compra por **Ata de Registro de Preços** (`AR00224`) e **Contrato** (`AR00224-01`), com itens (espécie, tamanho, tratamento, quantidade em unidades; informado em m³, converte pelo volume do tamanho e arredonda para baixo).
- **IDs:** dormente `<contrato>-<sequência de 6 dígitos>` (`AR00224-01-000357`), fardo `<contrato>-F<3 dígitos>` (`AR00224-01-F012`), RME `RME-2026-0012`. Gerados pelo fornecedor (no protótipo, pelo **Simulador do fornecedor**), nunca repetidos nem reaproveitados. Toda validação passa por `dominio/identificacao.ts`, nunca regex espalhada pelas telas.
- **QR:** link do sistema com o ID (`<VITE_APP_URL>/#/d/<id>` e `/#/f/<id>`), lido pela câmera comum do celular; o leitor do sistema (`LeitorQr`) aceita o link ou o ID puro.
- **Local:** ID `LOC-<código>` (`LOC-A03`), QR com o link `/#/locais/A03`, rota `/locais/:codigo`.
- **Ata e contrato:** o contrato herda o fornecedor da ata (não é gravado de novo). Fornecedor com CTF vencido fica bloqueado automaticamente, calculado pela validade.
- **Dois níveis:** o fardo chega montado; na inspeção é aberto, os reprovados saem e ele é fechado de novo só com os aprovados. Situações do dormente: emitido, aguardando inspeção, em estoque, reservado, baixado, reprovado, não localizado. Do fardo: em trânsito, aguardando inspeção, em inspeção, em estoque, aberto, baixado.
- **Saldo:** saldo físico do fardo = dormentes em estoque + reservados (ainda estão nele); disponível para nova saída = só em estoque. Calculado sempre no serviço, e toda mudança de saldo passa por uma única função do mock (`movimentarDormentes()` em `mock/estoque.ts`). Um dormente pertence a exatamente um fardo.
- **Faltas:** fardo esperado e não lido no recebimento continua em trânsito (recebimento concluído com ocorrência de falta; o fardo pode ser recebido depois). Na inspeção, o fardo pode ser concluído com dormentes não lidos, com justificativa obrigatória: eles ficam "não localizado", viram pendência do gestor e podem ser inspecionados depois.
- **Inspeção (provisório, a confirmar com o time da inspeção):** resultado só aprovado ou reprovado (ATENÇÃO do Inspector = reprovado); categoria 1, 2 ou 3 pelos limites 80 e 50 do índice. Ficam em `dominio/parametros.ts` e nos parâmetros, nunca espalhados.
- **Reprovados** ficam segregados (devolução ao fornecedor fora do protótipo). O contrato é cumprido por aprovados: o simulador pode emitir reposição, com o limite `emitidos - reprovados <= contratado`.
- Jornada: contrato → fornecedor grava o QR → recebimento (NF, DOF, leitura dos fardos) → inspeção peça a peça (sistema externo; no protótipo, simulada) → estoque no local → saída por RME (aberta → em separação → pronta → entregue, ou cancelada; a separação reserva, a baixa só na entrega). Sem DOF não há recebimento; chave de NF repetida é recusada; divergência de volume por espécie acima de 10% gera alerta (IN Ibama), sem bloquear.
- Termos da interface: os do glossário da especificação (fardo, dormente, contrato, ata, RME, DOF, classe, categoria, local). Nunca "lote", "pallet" ou "amarrado".

## Mock

- Persistência no **`localStorage`** (sempre com `try/catch`), para os dados sobreviverem ao recarregar, e botão **Reiniciar dados de demonstração** em Configurações.
- História inicial **determinística**: mesmos IDs sempre, sem `Math.random()` nem datas soltas (datas relativas a uma data-base fixa), para etiquetas impressas com antecedência abrirem a ficha certa. Inclui uma **remessa "a caminho" com IDs fixos**, para computador e celular partirem do mesmo estado (os IDs ficam documentados aqui na Etapa 2).
- Regras num módulo por assunto (`mock/simulador.ts`, `recebimento.ts`, `inspecao.ts`, `estoque.ts`, `rme.ts`); `data.ts` gera a história **chamando essas regras**, nunca montando registros à mão. Regras e invariantes têm testes no Vitest.
- Sem banco, cada aparelho tem os seus dados: remessas geradas no Simulador ficam só no aparelho onde foram geradas até a Etapa 10.

## Regras de interface a preservar

- Mensagens de sucesso só após a resposta do serviço, sem sufixo nem aviso de dados simulados.
- Uma ação principal (laranja, `btn-pri`) por tela; próxima ação na linha em azul (`btn-acao`); o resto no menu "⋯". Todo ID exibido é link (`CodigoLink`) e em fonte mono. Busca, filtros, abas e visão ficam no endereço.
- Telas de campo (ficha do dormente, leituras de QR) são desenhadas primeiro para o celular (seção 11.1 do plano).
- Segurança: não usar `dangerouslySetInnerHTML` (o QR é `<img>` com data URL); URLs externas vindas da API passam por `urlSegura()` (só http/https) e links internos por `linkInterno()`; tudo com prefixo `VITE_` vai para o navegador, então nunca colocar segredos em `.env*` (a chave pública do Supabase pode ir, e o acesso é controlado pelas políticas do banco).
- Logo: o arquivo definitivo vai em `public/assets/logo.svg` (`VITE_LOGO_URL`); sem ele, `Logo` mostra o monograma "HT". Nas etiquetas de impressão, o texto "CPTM", não um logo.
- `PROTOCOLO_INSPECTOR` (`config/env.ts`) continua fixo no código para abrir o sistema de inspeção na Etapa 6; a proposta de integração da v1 está em `docs/arquivo/INTEGRACAO-INSPECAO.md`.
