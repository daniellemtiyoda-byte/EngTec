# Holz Trilho — Front-end

Gestão de dormentes ferroviários de madeira.

Interface web (React + TypeScript + Vite) do sistema de gestão de dormentes de madeira.
**Escopo:** apenas front-end. Back-end, persistência, autenticação real e visão computacional são de outros integrantes.

> ⚠️ **Estado atual:** navegável com **dados simulados**. Nada aqui indica que o sistema completo esteja operacional:
> back-end, persistência, autenticação e visão computacional continuam pendentes.

## Executar

Requer Node.js 18+.

```bash
npm install
cp .env.example .env.local   # ajuste se necessário
npm run dev                  # http://localhost:5173
npm run build                # typecheck + build em dist/
```

No modo simulado qualquer usuário/senha preenchidos entram (nenhuma autenticação real).
Para testar estados de erro/vazio: `http://localhost:5173/?simular=erro` ou `?simular=vazio`.

## Logo

O logo do Holz Trilho ainda está em desenvolvimento. Quando estiver pronto, coloque o arquivo em `public/assets/logo.svg`
(veja `public/assets/LEIA-ME.txt`). Sem o arquivo, a barra lateral e o login mostram o monograma "HT" no mesmo tamanho.

## Variáveis de ambiente (`.env.local`)

| Variável | Função |
|---|---|
| `VITE_API_URL` | URL base do back-end (sem barra final) |
| `VITE_USE_MOCK` | `true` = serviços simulados; ausente ou qualquer outro valor = API real (falha segura) |
| `VITE_LOGO_URL` | caminho do arquivo do logo |
| `VITE_UPLOAD_MAX_MB` | limite de upload no navegador (o servidor valida de novo) |

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
    endpoints.ts           endpoints PROVISÓRIOS (pendentes de confirmação)
    http.ts                único ponto de HTTP + tratamento de erros
    real/                  implementação HTTP
    mock/                  dados e serviços simulados
    index.ts               escolhe mock ou real
  components/              Layout, ListPage (tabela/filtros/paginação), FormModal, Modal, UploadModal, gráficos, estados, toasts
  contexts/                autenticação (somente memória)
  pages/                   16 telas
docs/CONTRATOS-API.md      contratos e checklist para o back-end
```

## Integrar um módulo real

1. Receba a documentação da API do responsável (checklist em `docs/CONTRATOS-API.md`).
2. Ajuste caminhos em `src/services/endpoints.ts` e, se preciso, parâmetros/conversão em `src/services/real/index.ts`.
3. Marque o endpoint como `confirmado`, defina `VITE_USE_MOCK=false` e `VITE_API_URL`.
4. As telas não mudam: elas dependem só da interface `Servicos`.

## Regras respeitadas pela interface

- Classe (1ª/2ª) separada da categoria visual (A/B); metragem linear, volume documental e volume calculado em colunas distintas.
- Estoque disponível × em análise × bloqueado × com divergência.
- Ajustes de inventário aparecem como pendentes até a aprovação.
- Contagem por imagem é estimativa, mostra confiança/revisão e não altera saldo; espécie não é identificada por imagem.
- Mensagens de sucesso só após a resposta do serviço; dados simulados identificados (faixa, etiqueta e selo "Simulado").
- Botões ocultos e rotas protegidas são só UX; o servidor deve validar permissões.

## Segurança

Sem `dangerouslySetInnerHTML`; URLs de documentos só http/https; erros sem detalhes técnicos; uploads restritos por extensão e tamanho;
sessão apenas em memória (sem `localStorage`); use HTTPS nos ambientes implantados.

## Pendências conhecidas

- Back-end, autenticação e visão computacional reais (não existem neste repositório).
- Tela dedicada de registro de contagem/divergências do inventário (serviços prontos).
- Administração de usuários somente leitura.
- Testes automatizados.
