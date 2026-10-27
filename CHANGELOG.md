# Registro de alterações

Todas as alterações do projeto são registradas aqui, da mais recente para a mais antiga.
Formato: data (AAAA-MM-DD), o que mudou, por quê e arquivos principais. Categorias: Adicionado / Alterado / Corrigido / Removido.

## [Não publicado]

### Adicionado
- 2026-10-27: `docs/PRD.md` com o PRD do sistema (glossário, regras, requisitos, telas e dados iniciais), que passa a ser a fonte de verdade do produto.

### Alterado
- 2026-10-27: `CLAUDE.md` alinhado ao PRD: termos do glossário (fardo), classe pela espécie e categoria numérica, lote e fardo automáticos, saída só por RME com FIFO e conferência, inspeção externa simulada. `.gitignore` passa a ignorar `inspecao/` e `doc_senac/` (binários e PDFs grandes).
- 2026-10-27: `DocumentosLista` saiu de `pages/Documentos.tsx` para `components/DocumentosLista.tsx`, porque Fornecedores importava de outra página (contra a regra de organização). Sem mudança de comportamento. `src/components/DocumentosLista.tsx`, `src/pages/Documentos.tsx`, `src/pages/Fornecedores.tsx`.

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
