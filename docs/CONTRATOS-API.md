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
| Documentos | Listar (só leitura) | GET | /documentos |
| NF e DOF | Listar notas fiscais | GET | /notas-fiscais |
| NF e DOF | Cadastrar NF (multipart: `dados` em JSON + `xml` opcional) | POST | /notas-fiscais |
| NF e DOF | Cadastrar DOF da NF (multipart: `dados` em JSON + `pdf`) | POST | /notas-fiscais/{id}/dof |
| NF e DOF | Marcar DOF como declarado no Sinaflor | POST | /notas-fiscais/{id}/dof/declaracao |
| Recebimento | Listar | GET | /recebimentos |
| Recebimento | Confirmar (multipart: `dados` em JSON + `fotos`, várias) → `{ recebimento, lotes, fardos }` | POST | /recebimentos |
| Lotes | Listar (lotes só nascem do recebimento) | GET | /lotes |
| Lotes | Detalhe pelo código: `{ lote, fardos, nf, recebimento, historico }` | GET | /lotes/{id} |
| Fardos | Listar (filtro `loteCodigo`) | GET | /fardos |
| Estoque | Consultar saldos | GET | /estoque/saldos |
| Movimentações | Listar / Registrar (`transferencia`, `perda` ou `ajuste`; perda e ajuste por `fardoCodigo`, com `motivo`) | GET / POST | /movimentacoes |
| Movimentações | Aprovar ou rejeitar perda/ajuste (`{ aprovada, motivo? }`) | POST | /movimentacoes/{id}/decisao |
| RME | Listar / Abrir | GET / POST | /rmes |
| RME | Fardos elegíveis e sugestão FIFO | GET | /rmes/{id}/opcoes-separacao |
| RME | Registrar separação (`{ itens: [{ itemId, fardoCodigo, quantidade }], justificativa? }`) | POST | /rmes/{id}/separacao |
| RME | Conferência (`{ aprovada, motivo? }`; `aprovada: false` devolve para separação) | POST | /rmes/{id}/conferencia |
| RME | Confirmar entrega (dá a baixa) | POST | /rmes/{id}/entrega |
| RME | Cancelar (`{ motivo }`) | POST | /rmes/{id}/cancelamento |
| Inventário | Listar sessões / Criar sessão | GET / POST | /inventarios |
| Inventário | Registrar contagem | POST | /inventarios/{id}/contagens |
| Inventário | Consultar divergências | GET | /inventarios/{id}/divergencias |
| Visão computacional | Listar processamentos | GET | /visao-computacional/processamentos |
| Visão computacional | Enviar imagem (multipart, campo `arquivo`) | POST | /visao-computacional/imagens |
| Pátio | Localizações | GET | /patio/locais |
| Pátio | Transferências | GET | /patio/transferencias |
| Relatórios | Listar | GET | /relatorios |
| Relatórios | Solicitar exportação | POST | /relatorios/{id}/exportacoes |
| Relatórios | Saldo em m³ por espécie e dimensão (IBAMA) | GET | /relatorios/ibama/saldo |
| Relatórios | DOFs pendentes de declaração, com prazo e nível | GET | /relatorios/ibama/dofs-pendentes |
| Relatórios | Movimentações do período (`de`, `ate`, `especie`, `tipo`, `usuario`) → `{ linhas, totais }` | GET | /relatorios/movimentacoes |
| Configurações | Parâmetros de negócio / atualizar | GET / PATCH | /parametros |
| Auditoria | Consultar histórico | GET | /auditoria |
| Espécies | Listar | GET | /especies |
| Espécies | Atualizar classe e uso (`{ classe: string \| null, uso: 'via' \| 'AMV' }`) | PATCH | /especies/{id} |
| Tamanhos | Listar / Cadastrar | GET / POST | /tamanhos |
| Tamanhos | Atualizar medidas | PATCH | /tamanhos/{id} |
| Controle volumétrico | Listar por lote | GET | /volumetria/lotes |
| Administração | Listar usuários | GET | /usuarios |
| Sistema | Teste de conexão | GET | /saude |

Os modelos de dados esperados estão em `src/types/models.ts`.

## Checklist para pedir ao responsável pelo back-end (por módulo)

1. Endpoints e métodos HTTP reais.
2. Campos de entrada/saída, tipos e formatos (datas ISO 8601? decimais como número ou texto?).
3. Mecanismo de autenticação aprovado (cookie de sessão `HttpOnly` é o que o front assume; confirmar CORS e `credentials`).
   - O front envia `X-Requested-With: XMLHttpRequest` em **toda** chamada: o CORS precisa permitir esse cabeçalho (`Access-Control-Allow-Headers`).
   - Proteção contra CSRF no servidor: cookie com `SameSite=Lax` ou `Strict` e, de preferência, rejeitar requisições sem o cabeçalho acima ou usar token anti-CSRF.
   - O campo `mensagem` dos erros é exibido ao usuário como veio: deve ser texto seguro, sem detalhes internos (stack trace, SQL, caminhos).
4. Permissões por operação (nomes das permissões usados em `pode('...')`: `nf:cadastrar`, `dof:declarar`, `movimentacoes:aprovar`, `rme:abrir`, `rme:separar`, `rme:conferir`, `recebimento:registrar`, `movimentacoes:registrar`, `inventario:criar`, `cadastros:editar`, `visao:enviar`, `relatorios:exportar`, `admin`).
5. Códigos de resposta e formato dos erros (incluindo erros por campo).
6. Exemplos de sucesso e de erro.
7. Regras de negócio decididas no servidor: tolerância volumétrica, estados de aprovação, fluxo de aprovação de ajustes de inventário, formatos/tamanhos de upload.
8. Para visão computacional: campos `confianca`, `revisao` e como o resultado é disponibilizado (polling ou notificação).
9. Para relatórios: como o arquivo gerado é baixado (URL assinada, endpoint próprio?).

## Pontos em aberto

- Detalhe do lote (`GET /lotes/{codigo}`): `historico` em ordem cronológica, com `tipo` (`nf`, `recebimento`, `declaracao` ou o tipo da movimentação), `titulo`, `detalhe`, `usuario`, `referencia` (ex. `NF 1000`, `RME26-0001`) e `status`. 404 quando o código não existe. Quando a inspeção (Etapa 3) e a armazenagem existirem, entram como eventos também.
- Perfis: o menu de cada perfil é montado a partir de `permissoes` do usuário (`/auth/me`). Confirmar com o back-end a lista de permissões de cada perfil do PRD (almoxarife, operador de pátio, supervisor, requisitante, gestor, administrador).

- Parâmetros (`GET/PATCH /parametros`): `{ limiteIdadeDias, alertaDofCriticoDias, alertaDofAtencaoDias, provisorio }`. O servidor usa os valores para calcular `idadeDias`/`acimaLimiteIdade` de lotes e saldos, o `nivel` dos DOFs pendentes, os alertas e os indicadores. Definir quem pode editar (o front exige `admin`).
- DOF: `prazoDeclaracao` = validade + 1 dia (IN Ibama 21/2014, art. 51). A declaração só é aceita para NF recebida; o servidor grava `declaradoPor` e `declaradoEm`.
- Perda e ajuste: ficam `pendente` até a decisão; aprovar altera o saldo do fardo (zerado → `baixado`, com sobra → `aberto`), do lote e do estoque; rejeitar exige motivo e deixa `status: 'rejeitado'`. O servidor deve recusar quem registrou e a retirada de dormentes reservados em RME.
- Indicadores do dashboard: `fifoPct`, `idadeMediaDias` (ponderada pelo saldo), `lotesAcimaLimite`, `divergenciaInventarioPct`, `rastreabilidadePct` (lotes com NF, DOF e todas as saídas registradas), `rmesNoSistema`, `dofsPendentes`, `lotesAguardandoInspecao`, `saldoM3PorEspecie`.

- RME: o servidor deve recusar a conferência feita pelo mesmo usuário que separou (regra das duas pessoas; o mock aceita para demonstração). Reserva: o que está separado em RME `em_separacao` ou `conferida` não aparece como disponível em outra RME. Sugestão: fardos abertos primeiro (do mais antigo), depois fechados por FIFO de lote; só lotes `inspecao: 'aprovado'` e `estoqueStatus: 'disponivel'`. Separação fora da sugestão exige `justificativa` (erro por campo). A entrega gera uma movimentação `saida` por fardo, com `referencia` = número da RME. Confirmação de recebimento pelo requisitante fica para depois.

- NF: o servidor recusa chave de acesso repetida (409, campo `chaveAcesso`) e NF repetida do mesmo fornecedor (mesmo número e série, 409, campo `numero`). Confirmar se o XML é validado (assinatura, schema) e guardado no servidor.
- DOF: um por NF no MVP; volumes por espécie (`[{ especieId, volumeM3 }]`). Erros por campo usam `vol_<especieId>`.
- Recebimento: `dados` = `{ nfId, itens: [{ itemId, fardos: number[] }], avaria, observacao?, justificativa? }`. O servidor cria um lote por espécie + tamanho (código `LTaa-NNNN` sequencial por ano) e os fardos (`<lote>-Fnn`), aplica as regras de fotos (divergência de quantidade ou avaria) e de justificativa (divergência de volume por espécie acima de 10%) e devolve erros por campo `item-<itemId>`, `fotos`, `justificativa`. Lotes de recebimento acima da tolerância ficam `estoqueStatus: 'divergente'`. Falta combinar como o lote é liberado depois.

- Tamanhos: o servidor calcula `volumeM3` (largura × altura × comprimento em cm ÷ 1.000.000) e o devolve em listar/cadastrar/atualizar; o front não envia volume. Medidas chegam com `medidas: 'provisorio' | 'confirmado'`.
- Classe e categoria: `classe` (texto, ex. "1ª") vem da espécie; `categoria` (número) vem da inspeção. Ausentes = "a definir". Lote e saldo trazem os dois já resolvidos, mais `inspecao` (`aguardando`, `aprovado`, `reprovado`, `quarentena`).

- Pesquisa global: hoje redireciona para a lista de lotes com `?q=`. Definir se existirá endpoint de busca global.
- Administração de usuários/permissões: tela é só leitura até haver contrato.
- Visualização de documentos: usa `urlVisualizacao` quando o serviço informar (somente http/https).
- Registro de contagem de inventário e consulta de divergências: serviços prontos, sem tela dedicada ainda.
