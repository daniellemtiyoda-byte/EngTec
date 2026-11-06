# Holz Trilho — Front-end

Gestão de dormentes ferroviários de madeira.

Interface web (React + TypeScript + Vite) do sistema de rastreabilidade de dormentes de madeira por QR code (versão 2).
**Escopo:** apenas front-end, com a camada de serviços simulada; o banco e o login no Supabase entram numa etapa própria, perto do fim. Publicação na Vercel.

> ⚠️ **Estado atual:** em reestruturação para a v2. O app abre numa tela "Em construção" e as telas voltam etapa a etapa,
> conforme `docs/PLANO-V2.md`. Regras de negócio: `docs/ESPECIFICACAO-FUNCIONAL.md`. A versão 1 (por lote) está em `docs/arquivo/`.

## Executar

Requer Node.js 18+.

```bash
npm install
cp .env.example .env.local   # ajuste se necessário
npm run dev                  # http://localhost:5173
npm run build                # typecheck + build em dist/
npm test                     # testes (Vitest) do domínio e das regras do mock
```

Login de demonstração: use como usuário `administrador`, `almoxarife`, `gestor` ou `requisitante` e qualquer senha (nenhuma autenticação real).
A vitrine de componentes fica em `http://localhost:5173/#/vitrine` (só administrador).
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
  components/              Layout, ListPage (tabela/filtros/paginação), FormModal, Modal, UploadModal, assistentes, estados, toasts
  contexts/                autenticação
  pages/                   Login e a tela provisória "Em construção"
docs/ESPECIFICACAO-FUNCIONAL.md  regras de negócio da v2 (fonte de verdade)
docs/PLANO-V2.md           plano de desenvolvimento por etapas
docs/arquivo/              documentos da v1 (PRD, contratos de API, integração com a inspeção)
```

## Integrar um módulo real

1. Receba a documentação da API do responsável (o checklist da v1 está em `docs/arquivo/CONTRATOS-API.md`).
2. Ajuste caminhos em `src/services/endpoints.ts` e, se preciso, parâmetros/conversão em `src/services/real/index.ts`.
3. Marque o endpoint como `confirmado`, defina `VITE_USE_MOCK=false` e `VITE_API_URL`.
4. As telas não mudam: elas dependem só da interface `Servicos`.

## Regras respeitadas pela interface

- Mensagens de sucesso só após a resposta do serviço. É um protótipo sem dados reais, então não há avisos de dados simulados.
- Botões ocultos e rotas protegidas são só UX; o servidor deve validar permissões.
- As regras de negócio da v2 estão em `docs/ESPECIFICACAO-FUNCIONAL.md` e entram no código a partir da Etapa 2 do plano.

## Segurança

Sem `dangerouslySetInnerHTML`; URLs de documentos só http/https; erros sem detalhes técnicos; uploads restritos por extensão e tamanho;
sessão apenas em memória (sem `localStorage`); use HTTPS nos ambientes implantados.

## Pendências conhecidas

- Telas da v2 (ver as etapas em `docs/PLANO-V2.md`).
- Banco e login reais pelo Supabase.
- Testes automatizados.
