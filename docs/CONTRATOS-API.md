# Contratos de integração (PROVISÓRIOS)

> **Estado: pendente de confirmação.** Nenhum endpoint abaixo foi confirmado pelo responsável pelo back-end.
> Eles foram nomeados pelo front-end só para permitir integração incremental. Fonte única no código:
> `src/services/endpoints.ts` (também listados em Configurações → Contratos de API).

## Como o front-end usa os contratos

- As telas só conhecem a interface `Servicos` (`src/services/contracts.ts`).
- `VITE_USE_MOCK=true` usa `src/services/mock` (dados fictícios); `false` usa `src/services/real` (HTTP).
- Toda chamada HTTP passa por `src/services/http.ts` (URL base, cookies de sessão, tratamento de erros).
- Listas esperam: `{ items: T[], total: number, page: number, pageSize: number }`.
  Parâmetros provisórios de consulta: `pagina`, `tamanho`, `busca`, `ordenarPor`, `ordem` (`asc|desc`) e filtros por nome de campo.
- Erros esperados (provisório): corpo JSON `{ "mensagem": "texto seguro", "campos": { "campo": "mensagem" } }`.
  O front nunca exibe stack traces; em 401 limpa a sessão local.

## Endpoints provisórios

| Módulo | Operação | Método | Caminho |
|---|---|---|---|
| Autenticação | Iniciar sessão | POST | /auth/login |
| Autenticação | Usuário conectado | GET | /auth/me |
| Autenticação | Encerrar sessão | POST | /auth/logout |
| Dashboard | Indicadores | GET | /dashboard/indicadores |
| Dashboard | Alertas | GET | /dashboard/alertas |
| Fornecedores | Listar | GET | /fornecedores |
| Documentos | Listar | GET | /documentos |
| Documentos | Importar (multipart, campo `arquivo`) | POST | /documentos/importacoes |
| Recebimento | Listar conferências | GET | /recebimentos |
| Recebimento | Registrar conferência | POST | /recebimentos/conferencias |
| Lotes | Listar / Cadastrar | GET / POST | /lotes |
| Estoque | Consultar saldos | GET | /estoque/saldos |
| Movimentações | Listar / Registrar | GET / POST | /movimentacoes |
| Inventário | Listar sessões / Criar sessão | GET / POST | /inventarios |
| Inventário | Registrar contagem | POST | /inventarios/{id}/contagens |
| Inventário | Consultar divergências | GET | /inventarios/{id}/divergencias |
| Visão computacional | Listar processamentos | GET | /visao-computacional/processamentos |
| Visão computacional | Enviar imagem (multipart, campo `arquivo`) | POST | /visao-computacional/imagens |
| Pátio | Localizações | GET | /patio/locais |
| Pátio | Transferências | GET | /patio/transferencias |
| Relatórios | Listar | GET | /relatorios |
| Relatórios | Solicitar exportação | POST | /relatorios/{id}/exportacoes |
| Auditoria | Consultar histórico | GET | /auditoria |
| Espécies | Listar | GET | /especies |
| Controle volumétrico | Listar por lote | GET | /volumetria/lotes |
| Administração | Listar usuários | GET | /usuarios |
| Sistema | Teste de conexão | GET | /saude |

Os modelos de dados esperados estão em `src/types/models.ts`.

## Checklist para pedir ao responsável pelo back-end (por módulo)

1. Endpoints e métodos HTTP reais.
2. Campos de entrada/saída, tipos e formatos (datas ISO 8601? decimais como número ou texto?).
3. Mecanismo de autenticação aprovado (cookie de sessão `HttpOnly` é o que o front assume; confirmar CORS e `credentials`).
4. Permissões por operação (nomes das permissões usados em `pode('...')`: `lotes:cadastrar`, `recebimento:registrar`, `movimentacoes:registrar`, `inventario:criar`, `documentos:importar`, `visao:enviar`, `relatorios:exportar`, `admin`).
5. Códigos de resposta e formato dos erros (incluindo erros por campo).
6. Exemplos de sucesso e de erro.
7. Regras de negócio decididas no servidor: tolerância volumétrica, estados de aprovação, fluxo de aprovação de ajustes de inventário, formatos/tamanhos de upload.
8. Para visão computacional: campos `confianca`, `revisao` e como o resultado é disponibilizado (polling ou notificação).
9. Para relatórios: como o arquivo gerado é baixado (URL assinada, endpoint próprio?).

## Pontos em aberto

- Pesquisa global: hoje redireciona para a lista de lotes com `?q=`. Definir se existirá endpoint de busca global.
- Administração de usuários/permissões: tela é só leitura até haver contrato.
- Visualização de documentos: usa `urlVisualizacao` quando o serviço informar (somente http/https).
- Registro de contagem de inventário e consulta de divergências: serviços prontos, sem tela dedicada ainda.
