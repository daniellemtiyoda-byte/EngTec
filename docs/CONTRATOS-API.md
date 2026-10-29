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
| Dashboard | Pendências do usuário logado ("Para fazer agora") | GET | /dashboard/pendencias |
| Fornecedores | Listar | GET | /fornecedores |
| Documentos | Listar (só leitura) | GET | /documentos |
| NF e DOF | Listar notas fiscais | GET | /notas-fiscais |
| NF e DOF | Cadastrar NF (multipart: `dados` em JSON + `xml` opcional) | POST | /notas-fiscais |
| NF e DOF | Cadastrar DOF da NF (multipart: `dados` em JSON + `pdf`) | POST | /notas-fiscais/{id}/dof |
| NF e DOF | Marcar DOF como declarado no Sinaflor | POST | /notas-fiscais/{id}/dof/declaracao |
| Recebimento | Listar | GET | /recebimentos |
| Recebimento | Confirmar (multipart: `dados` em JSON + `fotos`, várias) → `{ recebimento, lotes }` | POST | /recebimentos |
| Lotes | Listar (lotes só nascem do recebimento) | GET | /lotes |
| Lotes | Detalhe pelo código: `{ lote, fardos, inspecoes, nf, recebimento, historico }` | GET | /lotes/{id} |
| Inspeção | Resumo das inspeções vigentes e sugestão de fardos → `SugestaoFardos` | GET | /lotes/{id}/sugestao-fardos |
| Inspeção | Concluir a inspeção e formar os fardos (`NovaFormacaoFardos`) → detalhe do lote | POST | /lotes/{id}/fardos |
| Inspeção | Listar inspeções por peça (filtro `loteCodigo`) | GET | /inspecoes |
| Inspeção | Lançar resultado manual (`{ quantidade, resultado, categoria? }`) → peças criadas | POST | /lotes/{id}/inspecoes |
| Fardos | Listar (filtro `loteCodigo`) | GET | /fardos |
| Fardos | Listar dormentes (filtros `loteCodigo`, `fardoCodigo`, `estado`) | GET | /dormentes |
| Estoque | Consultar saldos | GET | /estoque/saldos |
| Movimentações | Listar / Registrar (`transferencia`, `perda` ou `ajuste`; perda e ajuste por `fardoCodigo`, com `dormentes` e `motivo`) | GET / POST | /movimentacoes |
| Movimentações | Aprovar ou rejeitar perda/ajuste (`{ aprovada, motivo? }`) | POST | /movimentacoes/{id}/decisao |
| RME | Listar / Abrir | GET / POST | /rmes |
| RME | Fardos elegíveis e sugestão FIFO | GET | /rmes/{id}/opcoes-separacao |
| RME | Registrar separação (`{ itens: [{ itemId, fardoCodigo, quantidade, dormentes }], justificativa? }`) | POST | /rmes/{id}/separacao |
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
4. Permissões por operação (nomes das permissões usados em `pode('...')`: `nf:cadastrar`, `inspecao:concluir`, `dof:declarar`, `movimentacoes:aprovar`, `rme:abrir`, `rme:separar`, `rme:conferir`, `recebimento:registrar`, `movimentacoes:registrar`, `inventario:criar`, `cadastros:editar`, `visao:enviar`, `relatorios:exportar`, `admin`).
5. Códigos de resposta e formato dos erros (incluindo erros por campo).
6. Exemplos de sucesso e de erro.
7. Regras de negócio decididas no servidor: tolerância volumétrica, estados de aprovação, fluxo de aprovação de ajustes de inventário, formatos/tamanhos de upload.
8. Para a inspeção: ver `docs/INTEGRACAO-INSPECAO.md` (leitura do banco do Inspector, mapeamento, códigos não vinculados).
9. Para visão computacional: campos `confianca`, `revisao` e como o resultado é disponibilizado (polling ou notificação).
10. Para relatórios: como o arquivo gerado é baixado (URL assinada, endpoint próprio?).

## Pontos em aberto

- Ordenação por vários campos: `ordenarPor=emAndamento,emissao&ordem=desc,desc` (mesma posição). NF e RME devolvem `emAndamento` (calculado: NF com DOF ainda não declarado ou etapa anterior; RME não entregue nem cancelada) e o servidor precisa ordenar e filtrar por ele (`emAndamento=false` traz o histórico mostrado embaixo dos quadros).

- Lote: `listar` e `obter` devolvem `situacao` (`disponivel`, `aguardando_inspecao`, `quarentena`, `reprovado`, `divergente`, `bloqueado`, `sem_saldo`), calculada na consulta nesta ordem de prioridade: sem saldo, divergência, inspeção não concluída (fardos ainda não formados), algum fardo liberado com saldo (disponível), fardos em quarentena, reprovados, bloqueado; filtrável por `situacao`. Também devolve `etapaInspecao` (`aguardando`, `em_inspecao`, `concluida`, filtrável), `pecasInspecionadas` (calculado), `unidadesSemFardo`, `inspecaoConcluidaEm` e `inspecaoConcluidaPor`.
- Pendências (`GET /dashboard/pendencias`): lista `{ id, nivel, titulo, quantidade, descricao?, exemplos?: [{ codigo, texto }], acao: { rotulo, link } }` já filtrada pelas permissões do usuário da sessão (ex.: almoxarife recebe "RMEs para separar", supervisor "RMEs para conferir"). Os links usam filtros de lista no endereço (`/rme?status=aberta`).
- NF: `listar` devolve `etapa` (`aguardando_dof`, `aguardando_recebimento`, `declarar`, `concluida`) e, na etapa `declarar`, `diasParaPrazo` e `nivelPrazo`, calculados na consulta; o filtro `etapa` alimenta as colunas do quadro de Entrada. Para não carregar listas inteiras só para os contadores das colunas, o front usa `total` de cada consulta paginada.

- Detalhe do lote (`GET /lotes/{codigo}`): `historico` em ordem cronológica, com `tipo` (`nf`, `recebimento`, `declaracao`, `inspecao` ou o tipo da movimentação), `titulo`, `detalhe`, `usuario`, `referencia` (ex. `NF 1000`, `RME26-0001`) e `status`. 404 quando o código não existe. A conclusão da inspeção entra como evento `inspecao` (quem formou os fardos e o resumo por resultado). `inspecoes` traz as peças do lote, as vigentes primeiro. Quando a armazenagem existir, entra como evento também.
- Perfis: o menu de cada perfil é montado a partir de `permissoes` do usuário (`/auth/me`). Confirmar com o back-end a lista de permissões de cada perfil do PRD (almoxarife, operador de pátio, supervisor, requisitante, gestor, administrador).

- Parâmetros (`GET/PATCH /parametros`): `{ limiteIdadeDias, alertaDofCriticoDias, alertaDofAtencaoDias, categoria1IndiceMin, categoria2IndiceMin, provisorio }`. Os dois últimos convertem o índice 0–100 do Inspector em categoria (provisórios: 80 e 50). O servidor usa os valores para calcular `idadeDias`/`acimaLimiteIdade` de lotes e saldos, o `nivel` dos DOFs pendentes, os alertas e os indicadores. Definir quem pode editar (o front exige `admin`).
- DOF: `prazoDeclaracao` = validade + 1 dia (IN Ibama 21/2014, art. 51). A declaração só é aceita para NF recebida; o servidor grava `declaradoPor` e `declaradoEm`.
- Perda e ajuste: ficam `pendente` até a decisão; aprovar altera o saldo do fardo (zerado → `baixado`, com sobra → `aberto`), do lote e do estoque; rejeitar exige motivo e deixa `status: 'rejeitado'`. O servidor deve recusar quem registrou e a retirada de dormentes reservados em RME.
- Indicadores do dashboard: `fifoPct`, `idadeMediaDias` (ponderada pelo saldo), `lotesAcimaLimite`, `divergenciaInventarioPct`, `rastreabilidadePct` (lotes com NF, DOF e todas as saídas registradas), `rmesNoSistema`, `dofsPendentes`, `lotesAguardandoInspecao`, `saldoM3PorEspecie`.

- RME: o servidor deve recusar a conferência feita pelo mesmo usuário que separou (regra das duas pessoas; o mock aceita para demonstração). Reserva: o que está separado em RME `em_separacao` ou `conferida` não aparece como disponível em outra RME. Sugestão: fardos abertos primeiro (do mais antigo), depois fechados por FIFO de lote; só fardos com `resultado: 'aprovado'` e sem `motivoBloqueio`, de lotes com inspeção concluída e `estoqueStatus: 'disponivel'`. Separação fora da sugestão exige `justificativa` (erro por campo). A entrega gera uma movimentação `saida` por fardo, com `referencia` = número da RME. Confirmação de recebimento pelo requisitante fica para depois.

- NF: o servidor recusa chave de acesso repetida (409, campo `chaveAcesso`) e NF repetida do mesmo fornecedor (mesmo número e série, 409, campo `numero`). Confirmar se o XML é validado (assinatura, schema) e guardado no servidor.
- DOF: um por NF no MVP; volumes por espécie (`[{ especieId, volumeM3 }]`). Erros por campo usam `vol_<especieId>`.
- Recebimento: `dados` = `{ nfId, itens: [{ itemId, quantidade }], avaria, observacao?, justificativa? }`. O servidor cria um lote por espécie + tamanho (código `LTaa-NNNN` sequencial por ano), em unidades e sem fardos (`etapaInspecao: 'aguardando'`, tudo em `emAnalise`), aplica as regras de fotos (divergência de quantidade ou avaria) e de justificativa (divergência de volume por espécie acima de 10%) e devolve erros por campo `item-<itemId>`, `fotos`, `justificativa`. Lotes de recebimento acima da tolerância ficam `estoqueStatus: 'divergente'`. Falta combinar como o lote é liberado depois.
- Rastreio por dormente: `Dormente` = `{ codigo (lote + sequência), loteCodigo, sequencia, fardoCodigo, resultado, categoria?, estado: 'em_estoque' | 'baixado', baixa?: { tipo: 'saida' | 'perda' | 'ajuste', referencia?, quando, usuario } }`, criado na formação dos fardos. O saldo de um fardo é sempre o número de dormentes em estoque nele. `GET /lotes/{codigo}` devolve `dormentes` do lote.
- Separação: cada item traz `dormentes` (códigos, tantos quanto `quantidade`), livres no fardo; `opcoes-separacao` devolve `dormentesDisponiveis` e `dormentesSugeridos` (as primeiras sequências livres). Reserva por peça. `seguiuSugestao` compara fardos e quantidades, não as peças escolhidas dentro do fardo. A entrega baixa exatamente esses dormentes e a movimentação `saida` leva `dormentes`.
- Perda e ajuste: `dormentes` obrigatório (um código por peça; `quantidade` = número de peças, negativa no ajuste que retira). Perda e ajuste negativo exigem peças em estoque no fardo; ajuste positivo só aceita peças do lote com baixa por perda ou ajuste, que voltam ao fardo. A aprovação recusa peça reservada em RME. Erro por campo `dormentes`.
- Formação de fardos (`POST /lotes/{id}/fardos`): `{ fardos: [{ resultado, categoria?, quantidade, dormentes, divergente? }], local, motivoDivergencia? }`; cada peça inspecionada em exatamente um fardo do seu grupo (erro por campo `fardos`), `quantidade` = número de `dormentes`. A sugestão (`sugestao-fardos`) traz os `dormentes` de cada grupo e de cada fardo sugerido. O servidor recusa (409) se faltar peça sem resultado ou houver peça com sequência acima da quantidade do lote; recusa (422, campo `fardos`) se a soma por grupo (resultado + categoria das aprovadas) não bater com as peças inspecionadas; exige `local` e, com algum `divergente`, `motivoDivergencia`. Gera os códigos `<lote>-Fnn` na ordem enviada. Fardo aprovado e não divergente vai para `disponivel`; os demais para `bloqueado` (o saldo do lote não muda). O lote fica `etapaInspecao: 'concluida'`, com `inspecao` resumida e `categoria` = a de mais peças aprovadas. Fardo ganha `resultado`, `categoria?`, `motivoBloqueio?`, `formadoEm`, `formadoPor`.
- Lançamento manual (`POST /lotes/{id}/inspecoes`): só antes da conclusão; ocupa as primeiras sequências do lote ainda sem resultado; `categoria` obrigatória para `aprovado`; grava o usuário como inspetor e `origem: 'manual'`.

- Tamanhos: o servidor calcula `volumeM3` (largura × altura × comprimento em cm ÷ 1.000.000) e o devolve em listar/cadastrar/atualizar; o front não envia volume. Medidas chegam com `medidas: 'provisorio' | 'confirmado'`.
- Classe e categoria: `classe` (texto, ex. "1ª") vem da espécie; `categoria` (número) vem da inspeção. Ausentes = "a definir". Lote e saldo trazem os dois já resolvidos, mais `inspecao` (`aguardando`, `aprovado`, `reprovado`, `quarentena`). Com a inspeção por peça, a categoria de verdade é a de cada fardo; a do lote é só a predominante.

- Pesquisa global: hoje redireciona para a lista de lotes com `?q=`. Definir se existirá endpoint de busca global.
- Administração de usuários/permissões: tela é só leitura até haver contrato.
- Visualização de documentos: usa `urlVisualizacao` quando o serviço informar (somente http/https).
- Registro de contagem de inventário e consulta de divergências: serviços prontos, sem tela dedicada ainda.
