# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projeto

Holz Trilho v2: front-end (React 18 + TypeScript + Vite) do sistema de **rastreabilidade de dormentes ferroviários de madeira por QR code** para a CPTM. Cada dormente tem um ID único gravado em QR na plaquinha que o fornecedor já fixa, e o sistema acompanha sua vida do contrato até a saída para a via. Código, identificadores, comentários e textos de UI são em português.

**Fonte de verdade:** `docs/ESPECIFICACAO-FUNCIONAL.md` (regras de negócio, glossário, perfis) e `docs/PLANO-V2.md` (arquitetura, modelo, telas, padrões visuais e etapas). Elas substituem o PRD da v1, arquivado em `docs/arquivo/PRD-v1.md` só para consulta histórica. Em conflito entre os dois, a especificação manda na regra de negócio e o plano na implementação. Em dúvida sobre uma regra de negócio, pergunte antes de inventar; em dúvida sobre interface, siga os padrões da seção 8 do plano.

**Escopo:** só front-end, com a camada de serviços simulada (`mock/`). O banco e o login entram juntos no Supabase, numa etapa própria (Etapa 10), como outra implementação da mesma camada. Não há back-end próprio; integração real com o sistema de inspeção e com o Sinaflor fica fora. É um protótipo que nunca terá dados reais: **não há banner de "modo simulado", selo de "dados simulados" nem sufixo de simulado nos toasts**; o único aviso de demonstração é o do Simulador do fornecedor.

## Fluxo de trabalho por etapas (obrigatório)

- O trabalho segue as **etapas da seção 13 do `docs/PLANO-V2.md`, na ordem e uma por vez**. Só avance para a próxima etapa quando a Dani pedir.
- Cada etapa termina com `npm run build` e `npm test` sem erros, o checklist da seção 14 do plano, uma entrada no `CHANGELOG.md`, este arquivo atualizado e um commit.
- **Etapa atual:** Etapas 0, 1 e 2 concluídas. O menu v2 está completo, cada item abre a tela "Em construção" (`pages/EmConstrucao.tsx`, com o número da etapa em que a tela entra), a vitrine `/vitrine` mostra os padrões de lista e de objeto, e o domínio, o modelo, o contrato de serviços e o mock com a história de demonstração estão prontos e testados. Próxima: Etapa 3 (cadastros e contratos). Etapas seguintes: 3 cadastros e contratos, 4 QR, 5 recebimento, 6 inspeção, 7 estoque, 8 saídas, 9 painel, 10 Supabase, 11 acabamento.
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
npm test                     # Vitest: dominio/*.test.ts e services/mock/*.test.ts
npx vitest src/services/mock/regras.test.ts -t "recebimento"   # um arquivo ou um teste pelo nome
```

ESLint não está configurado. Validar mudanças com `npm run build` e `npm test`. Os testes ficam ao lado do código (`*.test.ts`) e rodam em Node (sem navegador): nada do mock pode depender de `window` sem checar antes.

Login simulado: o usuário é o nome de um perfil (`administrador`, `almoxarife`, `gestor`, `requisitante`, sem diferença de maiúsculas e acentos; a tela de login tem atalhos) e qualquer senha entra; outro nome é recusado. A sessão fica guardada no aparelho (`localStorage`, chave `holz:sessao-demo`), como fará o Supabase Auth, e "Sair" a apaga. A vitrine (`/#/vitrine`, só administrador) é a referência visual dos padrões de página. Para testar estados da UI: `http://localhost:5173/?simular=erro` ou `?simular=vazio` (tratado em `src/services/mock/util.ts`; o parâmetro fica antes do `#`, pois o app usa `HashRouter`).

**Câmera exige HTTPS** (ou `localhost`). O app é publicado na **Vercel** (HTTPS; o `HashRouter` dispensa configuração de rotas), e a URL da Vercel é o `VITE_APP_URL` gravado nos QR. O projeto na Vercel com a URL definitiva é pré-requisito da Etapa 4; a URL é registrada aqui nessa etapa.

## Dependências

Runtime: `react`, `react-dom`, `react-router-dom` e, como exceções justificadas no plano, só estas três (ainda não instaladas; entram na etapa em que são usadas):
- `qrcode` (Etapa 4): gera o QR com `toDataURL()`, exibido em `<img>`.
- `jsqr` (Etapa 4): lê o QR de quadros da câmera num `<canvas>` quando o navegador não tem `BarcodeDetector`.
- `@supabase/supabase-js` (Etapa 10): login pelo Supabase Auth e a implementação `services/supabase/`.

Desenvolvimento: `vitest` (instalado) e `@types/qrcode` (Etapa 4). Qualquer outra dependência precisa ser combinada antes.

## Arquitetura

**Camada de serviços com implementações da mesma interface.** As telas importam apenas `servicos` de `src/services/index.ts`, que escolhe entre `mock/` e `real/` conforme `VITE_USE_MOCK` (só `"true"` explícito liga o mock). A comparação é feita direto em `import.meta.env` e os dados fictícios são gerados dentro de `criarDados()` em `mock/data.ts`, para o Vite descartar o mock no build sem ele: não colocar código executado no topo dos módulos de `mock/`. O contrato único é a interface `Servicos` em `src/services/contracts.ts` (todos os serviços da seção 6 do plano, com os tipos de entrada `Dados*`); os modelos ficam em `src/types/models.ts` (modelo v2 da seção 5, pensado como tabelas, campos calculados marcados). Ao adicionar uma operação, atualizar contrato e mock juntos (e o Supabase, a partir da Etapa 10); as telas não conhecem HTTP nem Supabase.

**Autenticação separada da camada de dados:** `services/auth/` (`contrato.ts` com `ServicoAuth`: `entrar`, `sair`, `usuarioAtual`, `aoMudarSessao`; `simulado.ts`; `index.ts` exporta `autenticacao`). Só o `AuthContext` usa esse serviço; as telas usam `useAuth()`. Na Etapa 10 entra a implementação do Supabase Auth ao lado da simulada, sem mexer nas telas.

- `services/real/index.ts`: **stub**. Não há back-end próprio; sem `VITE_USE_MOCK=true`, toda operação devolve um `ApiError` avisando para usar o modo simulado. Sai na Etapa 10 (com `http.ts`). `endpoints.ts` foi removido na Etapa 2.
- `services/http.ts`: `ApiError` (usado por todas as implementações) e o `fetch` antigo, sem uso. Converte falhas em `ApiError` com mensagem segura para exibir (use `mensagemSegura(e)` na UI), lê `campos` do corpo de erro como erros por campo e, em 401, dispara `sgd:nao-autenticado`, que o `AuthContext` escuta para derrubar a sessão. O login simulado também lança `ApiError` (401, com erro no campo `usuario`).
- **Supabase (Etapa 10):** entra como implementação `services/supabase/`, escolhida por variável de ambiente (`VITE_FONTE_DADOS=mock|supabase`), sem mudar telas. Claude escreve o SQL em `supabase/migrations/` (tabela `perfis`, tabelas dos dados, views dos campos calculados, funções das operações que mudam várias tabelas, políticas RLS por perfil e a carga da história de demonstração com os mesmos IDs do mock) e a Dani executa no editor SQL do Supabase. Nessa etapa saem `services/real/` e `http.ts`, e `ApiError`/`mensagemSegura()` vão para `services/erros.ts`. Por isso os tipos de `models.ts` são pensados como tabelas: `id` próprio, vínculos por id (`contratoId`, `fardoId`) e campos calculados marcados como tal.

**Rotas e menu:** `src/rotas.tsx` (`ROTAS`) é a lista única das telas protegidas; `App.tsx` gera as rotas e `Layout.tsx` gera o menu a partir dela. Tela nova = uma linha em `ROTAS`; grupo novo = um item em `GRUPOS_MENU` (Início, Suprimento, Entrada, Estoque, Saída, Cadastros, seção 3.2 do plano). Telas que ainda não existem usam `emConstrucao(titulo, etapa)` em `rotas.tsx`; ao construir a tela, troque pela página de verdade. `permissoes` (basta uma) esconde a tela do menu e, pelo endereço, mostra "sem permissão" (`ExigePermissao`, só UX); as telas de leitura da operação usam `operacao:consultar`. `foraDoMenu` deixa a rota só por link (páginas de objeto, `/vitrine`); `demo` põe o selo "Demo" no item do menu (Simulador). `HashRouter`, para hospedagem estática. Todas as rotas exceto `/login` ficam sob `RotaProtegida`, que sem sessão redireciona ao login guardando caminho + parâmetros: é isso que faz o QR (`/#/d/<id>`) abrir a ficha depois do login.

**Identidade visual:** tokens em `src/styles/tokens.css` (seção 7.2 do plano: `--cor-shell`, `--cor-menu`, `--cor-primaria`, `--cor-acao`, semânticas `--ok`/`--atencao`/`--critico`/`--info`/`--neutro` com `-fundo`, `--fundo`, `--superficie`, `--borda`, `--texto`, `--texto-2`, `--fonte-mono`, escala `--fs-*`, espaços `--esp-*`, `--raio`, `--sombra-*`, `--alvo-toque` 44 px e `--alvo-campo` 48 px), importado no início de `styles.css`. CSS novo usa só os tokens, sem cor solta. IDs sempre em `--fonte-mono` (`.codigo`, `.mono`); números à direita com `tabular-nums` (`.al-right`).

**Componentes da casca v2** (Etapa 1; exemplos de uso na vitrine, `pages/Vitrine.tsx`):
- `Cabecalhos.tsx`: `CabecalhoPagina` (título, subtítulo, `migalhas`, ações com no máximo uma `btn-pri`, `selo`), `CabecalhoObjeto` (tipo + ID grande em mono com copiar, situação, `fatos` com `FatoChave` (rótulo, valor, `para` opcional) e ações; `nivel={2}` quando aparece dentro de outra página) e `Migalhas` (montadas pela origem do objeto). `PageHeader` não existe mais.
- `Abas.tsx`: `AbasSecao` (abas da página de objeto com o painel da aba ativa) e `AbasSituacao` (com contador, acima das listas), com teclado (setas, Home, End); `useAbaNoEndereco(valores, param = 'aba')` guarda a aba no endereço, e a primeira aba não aparece nele.
- `BarraFiltros.tsx`: busca, até 4 filtros, chips removíveis e "Limpar tudo" (extraída do `ListPage`, que a usa por dentro).
- `Indicadores.tsx`: `CartaoIndicador` (número grande, `para` leva à lista filtrada) e `BarraProgresso` (contratado x recebido x aprovado, com o texto dos números).
- `Relacionados.tsx`, `IdCodigo.tsx` (ID em mono, link opcional e botão copiar; `CodigoLink` usa por dentro; nas tabelas e nos cartões de lista o copiar só aparece ao passar o mouse na linha ou com foco, e some em telas de toque; no cabeçalho de objeto e na ficha do dormente fica sempre visível), `SeloDemo` (em `Badge.tsx`, o único aviso de demonstração), `RodapeAcoes.tsx` (ações das telas de campo, fixas no rodapé no celular).
- `EntradaCodigo.tsx`: o que o botão "Ler QR" abre até a Etapa 4 (digitar o código; reconhecido por `rotaDoCodigo()`). Na Etapa 4 vira o `LeitorQr`.

**Layout:** topo com o botão **Ler QR** (no celular vira botão flutuante), nome e perfil do usuário e Sair; busca global volta na Etapa 4 e o sino de alertas na Etapa 9. No celular (`useTelaPequena()`, ≤ 760 px), quem tem `estoque:movimentar` (almoxarife) vê a **navegação inferior de campo** (Início, Ler QR, Estoque, RME) no lugar do botão flutuante; o menu completo continua na gaveta.

**Componentes genéricos mantidos** (base dos padrões de página da seção 8 do plano): `ListPage` (busca com debounce, filtros e busca no endereço, chips, ordenação, paginação, colunas opcionais, cartões no celular, ação `principal` como `btn-acao` e o resto no `MenuAcoes`; `abasSituacao` põe as abas de situação acima da barra de filtros e manda a aba ativa como filtro, guardada no endereço; `migalhas`; `subnivel` para título h2 dentro de outra página; sem `descricao`, o subtítulo mostra a contagem; coluna com `quebrar` pode quebrar linha para a tabela caber), `FormModal` (formulário a partir de `Campo[]`, `validarCampos()`, confirmação, arquivos) e `FormLinha` (inclusão em linha), `Modal`/`ConfirmModal` (`largo` ocupa a tela no celular), `ProgressoPassos` (`Passos.tsx`, assistentes: o último passo é sempre "Revisar e confirmar"), `Contador` (−/+), `LinhaTempo` (eventos genéricos `EventoLinhaTempo`), `Etapas`, `PainelAbas`, `Toast`, `ErroTela` (Error Boundary em volta do `<Outlet />`), `Estados` (carregando, vazio, erro, `Aviso`, `ComoFunciona`), `Badge`/`BadgeDe`, `CodigoLink` (`Codigos.tsx`, rota por `rotaDoCodigo()` de `utils/busca.ts`, que só reconhece os IDs v2 a partir da Etapa 4), `UploadModal`, `Logo`, `Icone`. `useAsync(fn, deps)` é o padrão para carregar dados fora de listas.

**Utilitários:** `utils/format.ts` (formatação; números digitados **sempre** com `paraNumero(texto, inteiro)`, nunca `Number()` direto; `arquivoInvalido()`, `urlSegura()`, `linkInterno()`); `utils/nfeXml.ts` (lê o XML da NF-e com `DOMParser`, sem executar nada, e confere a chave de acesso com `chaveAcessoValida()` e o CNPJ com `mesmoCnpj()`; usado no cadastro de NF e DOF da Etapa 5, com o XML fictício `docs/exemplos/nfe-exemplo.xml` ou o gerado pelo Simulador).

**Dicionário do domínio (`src/dominio/`):**
- `identificacao.ts`: formatos de ID (`RE_ATA`, `RE_CONTRATO`, `RE_DORMENTE`, `RE_FARDO`, `RE_RME`, `RE_LOCAL`, `RE_CODIGO_LOCAL`), geração (`idDormente`, `idFardo`, `idRme`, `idLocal`), `sequenciaDe`, `contratoDe`, `lerCodigo(texto)` (ID puro ou link do QR; devolve `{ tipo, id }` ou null), `rotaDoObjeto` e `linkQr(tipo, id)` (base `VITE_APP_URL` ou o endereço aberto). `utils/busca.ts` (`rotaDoCodigo`, usado por `CodigoLink` e pela entrada de código) só passa a usá-los na Etapa 4, quando as rotas `/d/`, `/f/` e `/locais/` existirem.
- `parametros.ts`: regras fixas e cálculos de prévia, usados pelas telas e pelo mock (`TOLERANCIA_VOLUME_PCT` 10, `resultadoDoVeredito`, `categoriaDoIndice`, `volumeM3`, `unidadesDeM3`, `diferencaVolumePct`, `foraDaTolerancia`, `prazoDeclaracao`, `nivelPrazo`, `situacaoSaldo`, datas `somarDias`, `diasEntre`, `dataSP`) e os padrões dos parâmetros editáveis. Valores que a CPTM ou o time da inspeção vão definir ficam em `servicos.parametros`, nunca como constante nas telas.
- `rotulos.ts`: tipo `Tom` e os mapas de rótulo e cor (`SITUACAO_DORMENTE`, `SITUACAO_FARDO`, `SITUACAO_ENTREGA`, `SITUACAO_CONTRATO`, `SITUACAO_RME`, `RESULTADO_INSPECAO`, `NIVEL_PRAZO`, `SITUACAO_SALDO`, `SITUACAO_CADASTRO`, `TIPO_LOCAL`, `TIPO_MOVIMENTACAO`, `TIPO_OCORRENCIA`, `NIVEL_ALERTA`), mais `rotuloClasse` e `rotuloCategoria`. Badges: `<BadgeDe mapa={SITUACAO_FARDO} valor={f.situacao} />`.
- `opcoes.ts`: `opcoesDe(mapa)` e as opções de filtro e select prontas (`SITUACAO_FARDO_OPCOES`, `CATEGORIA_OPCOES`, `UNIDADE_ITEM_OPCOES`…).
- `permissoes.ts`: as 12 permissões granulares, o tipo `Perfil` e `PERFIS` (rótulo e permissões de cada um dos quatro perfis, tabela da seção 12 do plano); nenhuma tela testa o perfil, só as permissões.

Paleta semântica: verde = disponível/concluído, azul = em andamento, laranja = atenção, vermelho = bloqueio ou prazo vencido, cinza = encerrado/neutro. Não definir mapas de rótulos nem opções dentro das páginas (a vitrine é a única exceção, com dados de exemplo).

**Menu lateral:** compacto no computador (tokens `--lateral` 240 px, `--lateral-min`, `--menu-item-altura` 36 px, `--menu-item-fonte` 14 px, `--menu-icone` 18 px; títulos dos grupos em 11 px maiúsculos e linha fina entre os grupos); na gaveta do celular os itens voltam a 44 px (`--alvo-toque`). Recolhível pelo ícone discreto no topo, ao lado do logo (`.recolher` dentro de `.marca` no `Layout`); recolhido mostra só os ícones.

**Autenticação:** `AuthContext` com `entrar`, `sair` e `pode(p: Permissao)`; `pode()` e `RotaProtegida` são só UX, quem valida são as políticas RLS do Supabase (Etapa 10). A autenticação é um serviço separado da camada de dados (`services/auth/`), usado só pelo `AuthContext`, que também acompanha `aoMudarSessao` (outra aba entrou ou saiu). Hoje a implementação é a simulada (nome do usuário escolhe o perfil; sessão no `localStorage`). `Usuario` tem `perfil: Perfil` e `permissoes: Permissao[]`. Na Etapa 10 entra a implementação do **Supabase Auth** (e-mail e senha), com o perfil numa tabela `perfis` e a **sessão guardada no aparelho** (padrão do `supabase-js`), para o QR abrir a ficha sem novo login. As contas são criadas no painel do Supabase; a tela Usuários só lista e edita perfil e situação. Perfis e permissões granulares estão na seção 12 do plano.

## Regras de domínio (v2)

O detalhe está na especificação (seções 2 a 5) e no plano (seções 5, 6 e 9). Toda regra vale no serviço (hoje o mock; na Etapa 10, o banco), nunca só na tela.

**Identificação e termos**
- **Não existe lote**: o agrupamento é **contrato + fardo**. Termos da interface: os do glossário (fardo, dormente, entrega, contrato, ata, RME, DOF, classe, categoria, local). Nunca "lote", "pallet", "amarrado" nem "remessa".
- IDs: dormente `<contrato>-<6 dígitos>` (`AR00224-01-000357`), fardo `<contrato>-F<3 dígitos>` (`AR00224-01-F012`), RME `RME-<ano>-<4 dígitos>`, local `LOC-<código>` (`LOC-A03`, rota `/locais/A03`). Sequências por contrato, nunca repetidas nem reaproveitadas; IDs de dormente e fardo são emitidos pelo fornecedor (no protótipo, pelo Simulador). Formatos de ata e contrato provisórios (`AA00000`, `AA00000-00`).
- QR: link do sistema com o ID (`<VITE_APP_URL>/#/d/<id>`, `/#/f/<id>`, `/#/locais/<código>`); o leitor aceita o link ou o ID puro.

**Cadastros e suprimento**
- Nada é apagado, só inativado. Volume do tamanho sempre calculado (medidas provisórias até a CPTM confirmar). Código do local não muda depois de criado (está no QR impresso) e local com dormentes não é inativado.
- Fornecedor: CNPJ com 14 dígitos e único; `bloqueado` calculado (CTF vencido pela validade): não entra em nova ata nem contrato.
- O contrato herda o fornecedor da ata (não é gravado de novo) e começa pelo número dela (`AR00224-01` na ata `AR00224`). Item: espécie que o fornecedor fornece, tamanho, tratamento e quantidade em unidades; informado em m³, converte pelo volume do tamanho e arredonda para baixo. Item existente só muda de quantidade, nunca abaixo do emitido menos reprovados.
- Situação do contrato: vigente ou cancelado (gravado); **concluído é calculado** (todos os itens cumpridos por aprovados e nada pendente na entrada) — regra provisória.
- O contrato é cumprido por **aprovados**: `saldoAEmitir = quantidade − (emitidos − reprovados)`; o Simulador pode emitir reposição até esse limite.

**Entrada: NF e DOF, recebimento, inspeção**
- **Entrega**: o que o fornecedor envia de uma vez (uma NF, uma DOF e os fardos). NF (XML ou digitada) e DOF são cadastradas **antes da chegada** (`documentos.cadastrarEntrega`), criando a entrega "a caminho". Validações: chave de acesso com 44 dígitos, dígito verificador válido, **do CNPJ do fornecedor do contrato** e não repetida; itens do contrato; DOF obrigatória, não repetida, com volume por espécie do contrato. Fardos esperados são opcionais no cadastro. O Simulador cria a entrega com NF e DOF de exemplo (origem `simulador`); cadastrar na hora do recebimento é exceção (origem `recebimento`).
- DOF: prazo de declaração no Sinaflor = dia seguinte à validade; nível vencido / crítico (até 1 dia) / atenção (até 3 dias) / ok, com a antecedência dos parâmetros; declarada uma vez, com quem e quando.
- **Recebimento** (`recebimentos.receber`): local de espera do tipo inspeção. Fardo esperado lido entra; fardo do mesmo contrato, emitido e sem entrega também entra (provisório); qualquer outro vira ocorrência automática "fardo desconhecido". Esperado e não lido gera ocorrência automática de **falta**, continua em trânsito e pode ser recebido depois (entrega `recebida_parcial`). Ocorrência declarada (avaria, falta, sobra) exige descrição e foto. Divergência de volume por espécie (DOF × tudo o que já chegou da entrega) acima de 10% não bloqueia, mas exige justificativa. Recebidos: fardo com `recebidoEm` e local de espera, dormentes "aguardando inspeção".
- **Inspeção**: resultado só aprovado ou reprovado (ATENÇÃO do Inspector = reprovado) e categoria 1, 2 ou 3 pelo índice com os limites dos parâmetros (80 e 50) — ambos **provisórios**. Lançamento à mão exige categoria para aprovado. Dormente de outro fardo é recusado ("não pertence a este fardo"). Vale a inspeção mais recente. Enquanto o fardo não é concluído, o dormente segue "aguardando inspeção" com a inspeção registrada (fardo "em inspeção"). Simulação determinística: reprova a sequência com resto 7 na divisão por 20 (~5%).
- **Concluir a inspeção**: local de guarda do tipo armazenagem; aprovados ficam em estoque no fardo, que vai para o local (movimentação `guarda`); reprovados vão para o local de segregação (movimentação `segregacao`); dormentes não lidos exigem **justificativa** e ficam "não localizado" (pendência do gestor). Não localizado encontrado depois é inspecionado e segue o fluxo na hora.

**Estoque e saída**
- Situação do dormente: emitido, aguardando inspeção, em estoque, reservado, baixado, reprovado, não localizado. Toda mudança passa por `movimentarDormentes()` (`mock/estoque.ts`), que só aceita as transições permitidas.
- Situação do fardo é **sempre calculada**: em trânsito (sem recebimento), aguardando ou em inspeção (sem conclusão), depois baixado (sem saldo), aberto (algum dormente saiu numa RME) ou em estoque.
- **Saldo físico** do fardo = em estoque + reservados (ainda estão nele); **disponível** = só em estoque. Idade = dias desde o recebimento; acima de `limiteDiasEstoque` (provisório 120) gera alerta. Saldo por item compara o disponível com o mínimo e o máximo de `parametros.niveis` (sem nível = ok).
- Transferência: só fardo em estoque ou aberto, para local ativo de armazenagem ou expedição, diferente do atual; gera movimentação e evento nos dormentes.
- **RME**: aberta → em separação → pronta → entregue, ou cancelada antes da entrega. Sugestão: fardos **abertos primeiro** (do mais antigo ao mais novo), depois os demais do mais antigo ao mais novo, só com disponível; dentro do fardo, as menores sequências. Separar **reserva** os dormentes; a quantidade de cada item tem de bater com a pedida; trocar de fardo ou mudar a quantidade do fardo em relação à sugestão exige justificativa (`seguiuSugestao`), trocar dormentes dentro do fardo não. **Entregar baixa** (movimentação `saida` por fardo). Cancelar exige motivo e libera as reservas; o requisitante cancela só as que abriu, o almoxarife qualquer uma.

## Mock (`services/mock/`)

- **Módulos:** `estado.ts` (o que um banco guardaria: tipos `*Reg` sem os campos calculados, `Ctx` com relógio e autor, `novoId`, `falha`), `consultas.ts` (todos os campos calculados e as visões das páginas de objeto: `fardoView`, `contratoView`, `dofView`, `entregaView`, `saldoPorItem`, `fichaDormente`, `fardoDetalhe`, `inspecaoFardo`, `etiquetasEntrega`), regras em `cadastros.ts`, `simulador.ts`, `documentos.ts`, `recebimento.ts`, `inspecao.ts`, `estoque.ts`, `rme.ts`, `painel.ts`; `util.ts` (`paginar`, `simularRede`, `?simular=`); `persistencia.ts`; `index.ts` (liga tudo); `invariantes.ts` (só para os testes).
- **`index.ts`:** cada operação confere a sessão e as permissões (401 sem sessão, 403 sem permissão, como as políticas do banco farão); leituras devolvem cópias; **escritas são atômicas** (a regra roda numa cópia do estado, que só substitui o original sem erro) e salvam no `localStorage` (chave `holz:demo:estado`; estado de outra `VERSAO_ESTADO` é descartado). `criarServicosSimulados({ usuarioAtual, agora, armazenamento, atrasoMs })` deixa os testes fixarem o relógio, o usuário e o armazenamento.
- **História de demonstração** (`data.ts`, seção 15 do plano): gerada **chamando as regras**, determinística (mesmos IDs sempre) e com datas relativas ao dia em que é criada (`dataBase`), para os prazos e idades fazerem sentido em qualquer dia; "Reiniciar dados de demonstração" (`parametros.reiniciarDemonstracao`) a recria. Tem 3 fornecedores (um com CTF vencendo em 20 dias, um bloqueado), 4 espécies, 2 tamanhos, 2 tratamentos, 8 locais, 2 atas, 4 contratos (AR00224-02 concluído, com reposição de reprovados), entregas em todas as fases, 254 dormentes, 2 não localizados, 1 fardo acima do limite (AR00224-01-F001), 1 item em falta (Jatobá T200) e 1 em excesso (Jataipeba T280), DOFs vencida, em 1 dia e em 3 dias, e 7 RMEs (1 aberta, 1 em separação, 1 pronta, 3 entregues, 1 cancelada).
- **IDs fixos da entrega "a caminho"** (para imprimir as etiquetas com antecedência; conferidos nos testes): contrato AR00224-01, fardos **AR00224-01-F006** e **F007** (Jataipeba T280, dormentes **000071 a 000098**) e **AR00224-01-F008** (Maçaranduba T200, dormentes **000099 a 000112**).
- **Testes:** `historia.test.ts` (a história bate com o plano e respeita os invariantes), `regras.test.ts` (cada fluxo pelos serviços, conferindo os invariantes do estado salvo no fim). Regra nova = teste novo.
- Sem banco, cada aparelho tem os seus dados: entregas geradas ou cadastradas depois do início ficam só no aparelho onde foram criadas até a Etapa 10.
- Usuários do mock (`estado.usuarios`) espelham os quatro perfis do login simulado (`demo-<perfil>`); mudar o perfil na tela Usuários não muda o login simulado.

## Regras de interface a preservar

- Mensagens de sucesso só após a resposta do serviço, sem sufixo nem aviso de dados simulados.
- Uma ação principal (laranja, `btn-pri`) por tela; próxima ação na linha em azul (`btn-acao`); o resto no menu "⋯". Todo ID exibido é link (`CodigoLink`) e em fonte mono. Busca, filtros, abas e visão ficam no endereço.
- Telas de campo (ficha do dormente, leituras de QR) são desenhadas primeiro para o celular (seção 11.1 do plano).
- Segurança: não usar `dangerouslySetInnerHTML` (o QR é `<img>` com data URL); URLs externas vindas da API passam por `urlSegura()` (só http/https) e links internos por `linkInterno()`; tudo com prefixo `VITE_` vai para o navegador, então nunca colocar segredos em `.env*` (a chave pública do Supabase pode ir, e o acesso é controlado pelas políticas do banco).
- Logo: o arquivo definitivo vai em `public/assets/logo.svg` (`VITE_LOGO_URL`); sem ele, `Logo` mostra o monograma "HT". Nas etiquetas de impressão, o texto "CPTM", não um logo.
- `PROTOCOLO_INSPECTOR` (`config/env.ts`) continua fixo no código para abrir o sistema de inspeção na Etapa 6; a proposta de integração da v1 está em `docs/arquivo/INTEGRACAO-INSPECAO.md`.
