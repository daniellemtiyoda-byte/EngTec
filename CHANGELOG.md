# Registro de alterações

Todas as alterações do projeto são registradas aqui, da mais recente para a mais antiga.
Formato: data (AAAA-MM-DD), o que mudou, por quê e arquivos principais. Categorias: Adicionado / Alterado / Corrigido / Removido.

## [Não publicado]

### Adicionado
- 2026-10-27: tela **NF e DOF** (RF01, RF02, RF29): cadastro de NF manual ou pela importação do XML da NF-e, que preenche número, série, chave, emissão, fornecedor (pelo CNPJ) e itens, e sugere o número do DOF citado nas informações complementares. Espécie e tamanho de cada item são escolhidos pelo usuário. Chave de acesso conferida (44 dígitos e dígito verificador) e bloqueada se repetida. Cadastro do DOF (um por NF) com número, código de controle, validade, volume por espécie e PDF. `src/pages/NotasFiscais.tsx`, `src/components/NfModal.tsx`, `src/utils/nfeXml.ts`, `docs/exemplos/nfe-exemplo.xml`.
- 2026-10-27: **recebimento a partir da NF** (RF03, RF04, RF07, RF31): só com DOF; quantidade de cada fardo (sugestão de 14), conferida = soma dos fardos; fotos obrigatórias com divergência ou avaria; prévia do volume recebido x DOF por espécie. Acima de 10%: aviso crítico, confirmação, justificativa obrigatória, alerta, e lotes "Com divergência". Ao confirmar, o sistema cria um lote por espécie e tamanho (`LT26-0042`) e os fardos (`LT26-0042-F03`), todos aguardando inspeção, com movimentação de entrada, saldo e controle volumétrico (volume do DOF da espécie distribuído entre os lotes pelo volume calculado). `src/components/RecebimentoModal.tsx`, `src/pages/Recebimento.tsx`, `src/services/mock/recebimento.ts`, `src/dominio/parametros.ts`.
- 2026-10-27: fardos do lote e **impressão de etiquetas** pelo navegador (código, espécie, classe, tamanho, quantidade). `src/components/FardosModal.tsx`, `src/styles.css`.
- 2026-10-27: contrato `notas` (listar, cadastrar, cadastrarDof), `recebimentos.confirmar`, `fardos.listar` e envio multipart com `dados` em JSON. `FormModal` ganha campo `arquivo`; `Modal` ganha a opção `largo`; validação de arquivo unificada em `arquivoInvalido()`. `src/services/*`, `src/components/FormModal.tsx`, `src/components/Modal.tsx`, `src/utils/format.ts`.
- 2026-10-27: tela **Tamanhos** (RF27): cadastro e edição de largura, altura e comprimento em cm, com volume por dormente em m³ calculado pelo sistema e selo "Provisório" até a confirmação da CPTM. Dados iniciais T1 24×17×280, T2 22×16×200 e T3 24×17×400 cm, todos provisórios. Contrato `tamanhos` (listar, cadastrar, atualizar), endpoints `/tamanhos` e `PATCH` em `http.ts`. `src/pages/Tamanhos.tsx`, `src/rotas.tsx`, `src/services/*`.
- 2026-10-27: edição de classe e uso da espécie (`especies.atualizar`, `PATCH /especies/{id}`) e permissão `cadastros:editar`. `FormModal` aceita `iniciais` para formulários de edição. `src/pages/Especies.tsx`, `src/components/FormModal.tsx`, `src/dominio/permissoes.ts`.
- 2026-10-27: `docs/PRD.md` com o PRD do sistema (glossário, regras, requisitos, telas e dados iniciais), que passa a ser a fonte de verdade do produto.

### Alterado
- 2026-10-27: dados simulados passam a nascer de 14 NFs fictícias (12 recebidas pela mesma regra do serviço, uma com DOF aguardando recebimento e uma sem DOF); lotes e fardos não são mais gerados à parte. Alertas do mock calculados a partir dos dados (divergência de volume, NF sem DOF, NF a receber). Lote ganha NF, DOF, tamanho e fardos; `espessuraM` vira `alturaM`. Permissão `documentos:importar` vira `nf:cadastrar`. Menu "Importar documentos" vira "NF e DOF"; a lista genérica de documentos fica só na aba de Fornecedores. `src/services/mock/data.ts`, `src/types/models.ts`, `src/rotas.tsx`, `src/components/DocumentosLista.tsx`.
- 2026-10-27: classe e categoria seguem o PRD. Classe passa a vir da espécie (texto, ex. "1ª"); categoria passa a ser numérica (1, 2, 3, provisório) e vem da inspeção. As duas aparecem em colunas separadas e sempre com o nome do campo ("Classe 1ª", "Categoria 2", ou "a definir"). Lote ganha o resultado da inspeção. Recebimento e cadastro de lote não pedem mais classe nem categoria: lote novo fica "Aguardando inspeção" com "Categoria a definir". `src/types/models.ts`, `src/utils/format.ts`, `src/dominio/`, `src/pages/Lotes.tsx`, `src/pages/Estoque.tsx`, `src/pages/Recebimento.tsx`.
- 2026-10-27: cadastro de espécies com as 22 espécies da RME (PRD, "Dados iniciais"), com nº, nome científico, classe (só Dialium guianense tem classe 1ª; as demais "a definir") e uso (19 a 21 AMV, demais via corrida). Sai o nome popular inventado. Menu "Espécies vegetais" passa a "Espécies". `src/services/mock/data.ts`, `src/pages/Especies.tsx`.
- 2026-10-27: `CLAUDE.md` alinhado ao PRD: termos do glossário (fardo), classe pela espécie e categoria numérica, lote e fardo automáticos, saída só por RME com FIFO e conferência, inspeção externa simulada. `.gitignore` passa a ignorar `inspecao/` e `doc_senac/` (binários e PDFs grandes).
- 2026-10-27: `DocumentosLista` saiu de `pages/Documentos.tsx` para `components/DocumentosLista.tsx`, porque Fornecedores importava de outra página (contra a regra de organização). Sem mudança de comportamento. `src/components/DocumentosLista.tsx`, `src/pages/Documentos.tsx`, `src/pages/Fornecedores.tsx`.

### Removido
- 2026-10-27: cadastro manual de lote (`lotes.cadastrar`, permissão `lotes:cadastrar`): o lote nunca é digitado. Também saem a conferência avulsa por código de lote (`recebimentos.registrarConferencia`), a importação genérica de documentos (`documentos.importar`) e a tela `pages/Documentos.tsx`.

### Corrigido
- 2026-10-22: modo simulado só liga com `VITE_USE_MOCK=true` explícito; antes, variável ausente liberava o login de demonstração com perfil de administrador. `src/config/env.ts`, `src/services/index.ts`.
- 2026-10-22: conversão de números unificada em `paraNumero()`: `1.000` era enviado como 1 e `5,0` como `NaN`. Validação e envio usam a mesma função. `src/utils/format.ts`, `FormModal`, Lotes, Movimentações, Recebimento.
- 2026-10-22: links de alertas e notificações vindos da API passam por `linkInterno()` (bloqueia `//site` e `/\site`, open redirect). `Layout`, Dashboard.
- 2026-10-22: Pátio não mostra mais `NaN%` com capacidade 0; login volta à tela anterior com os parâmetros (`?q=`).
- 2026-10-22: `ListPage` fazia duas requisições ao mudar busca/filtro fora da página 1 e podia ficar numa página inexistente após recarregar.

### Segurança
- 2026-10-22: cabeçalho `X-Requested-With` em toda chamada HTTP (preflight de CORS também nos envios de arquivo, contra CSRF). Requisitos do back-end registrados em `docs/CONTRATOS-API.md`. `src/services/http.ts`.
- 2026-10-22: dados fictícios gerados dentro de `criarDados()`; o build com API real não leva mais nenhum dado de demonstração. `src/services/mock/`.

### Alterado
- 2026-10-22: dicionário do domínio em `src/dominio/` (rótulos e cores dos estados, opções de filtro, permissões tipadas); páginas não importam mais constantes de outras páginas; novo `BadgeDe`.
- 2026-10-22: `src/rotas.tsx` como lista única das telas, usada para gerar rotas (`App.tsx`) e menu (`Layout.tsx`).
- 2026-10-22: `Coluna<T>` exige que colunas ordenáveis usem um campo real do modelo.
- 2026-10-22: alertas buscados uma vez (`AlertasContext`) e compartilhados entre o sino e o Dashboard; formatadores numéricos reaproveitados; `useMemo` no `AuthContext`.
- 2026-10-22: acessibilidade: foco preso no modal, IDs únicos (`useId`) em modais, formulários e buscas, notificações fecham com Esc/clique fora, toasts de erro com `role="alert"`.
- 2026-10-22: README, `CLAUDE.md` e `docs/CONTRATOS-API.md` atualizados com as mudanças acima.

### Adicionado
- 2026-10-22: `ErroTela` (Error Boundary): uma tela que quebra mostra um aviso sem derrubar o app. `src/components/ErroTela.tsx`.
- 2026-10-22: `Estoque` avisa quando os totais não carregam (antes o erro era ignorado).
- 2026-10-21: `CLAUDE.md` com comandos, arquitetura e regras do projeto, para orientar o Claude Code. Inclui a regra de registrar toda alteração neste arquivo e manter o `CLAUDE.md` atualizado.
- 2026-10-21: `CHANGELOG.md` (este arquivo) para registrar as alterações do projeto.

### Alterado
- 2026-10-21: `package-lock.json`: o npm removeu as marcações `"peer": true` (diferença de versão do npm; sem efeito nas dependências instaladas).
- 2026-10-21: fluxo de trabalho com fork pessoal (`daniellemtiyoda-byte/EngTec`); alterações chegam ao original (`kailanyapereira/EngTec`) só por Pull Request.

## Histórico anterior

- `1ea4056` Primeiro Commit
- `3cb8986` teste
