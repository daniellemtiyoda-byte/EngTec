# Plano de desenvolvimento · Holz Trilho v2 (rastreabilidade de dormentes por QR code)

Documento para orientar o Claude Code na reestruturação do front-end. Ele diz **o que construir, em que ordem, com quais padrões e como tudo se conecta**. A regra de negócio vem de `docs/ESPECIFICACAO-FUNCIONAL.md` (exportada do documento de especificação); este plano traduz essa especificação em arquitetura, telas e etapas.

---

## 0. Como usar este plano

1. Leia este arquivo inteiro e `docs/ESPECIFICACAO-FUNCIONAL.md` antes de escrever código.
2. Trabalhe numa branch própria: `git checkout -b v2-qrcode` (o fluxo de fork do `CLAUDE.md` continua valendo; nada vai para `upstream`).
3. Siga as **etapas da seção 13 na ordem**. Cada etapa termina com `npm run build` sem erros, uma entrada no `CHANGELOG.md` e um commit.
4. Ao fim de cada etapa, atualize o `CLAUDE.md` com o que mudou (arquitetura, rotas, regras de domínio). Na etapa 2, a seção "Regras de domínio" do `CLAUDE.md` deve ser reescrita para o modelo v2; regras antigas que deixarem de valer saem do arquivo.
5. A partir deste plano, **a especificação funcional v2 substitui o `docs/PRD.md` como fonte de verdade**. Mova o PRD antigo para `docs/arquivo/PRD-v1.md` na etapa 0.
6. Em dúvida sobre uma regra de negócio, pergunte antes de inventar. Em dúvida sobre interface, siga os padrões da seção 8.
7. Escopo continua sendo **só front-end**, com a camada de serviços `mock/` e `real/`. Tudo funciona no modo simulado (`VITE_USE_MOCK=true`).

---

## 1. Resumo das decisões de produto

| Decisão | Como fica na v2 |
| --- | --- |
| Identificação | Todo dormente tem um ID único gravado em QR na plaquinha que o fornecedor já fixa hoje |
| Formato do ID do dormente | `<contrato>-<sequência 6 dígitos>`, ex. `AR00224-01-000357` |
| Formato do ID do fardo | `<contrato>-F<sequência 3 dígitos>`, ex. `AR00224-01-F012` |
| Conteúdo do QR | Link do sistema com o ID (`<APP_URL>/#/d/<id>` e `<APP_URL>/#/f/<id>`); a câmera comum do celular abre a ficha após login |
| Quem gera o QR | O fornecedor, seguindo o padrão do contrato. No protótipo, o **Simulador do fornecedor** gera para a demonstração |
| Compra | Por **Ata de Registro de Preços** e **Contrato** (não "pedido de compra") |
| Fardos | Chegam montados pelo fornecedor; na inspeção são abertos, os reprovados saem e o fardo é fechado de novo |
| Inspeção | Sistema externo, peça a peça, grava no banco compartilhado; no protótipo é simulada |
| Lote | **Deixa de existir** como conceito de tela. Agrupamento = contrato + fardo |
| Saída | Por requisição (RME): aberta → em separação → pronta → entregue (ou cancelada) |
| Login | **Supabase Auth** (e-mail e senha) desde o início; o perfil do usuário fica numa tabela `perfis` no Supabase. Os demais dados ficam no mock até o banco ser criado |
| Ponto de partida | Código antigo de domínio, telas e mock é **removido** na etapa 0; só a infraestrutura reaproveitável fica |
| Fora do protótipo | Etiqueta de contingência, inventário, ajustes com aprovação, visão computacional, offline, RFID, Sinaflor automático |

---

## 2. Inventário do código atual: manter, adaptar, remover, criar

A arquitetura atual é boa e **deve ser aproveitada**: camada de serviços com contrato único (`services/contracts.ts`), mock e real, `ROTAS` como lista única de telas, componentes genéricos (`ListPage`, `FormModal`, `Passos`, `LinhaTempo`, `PainelAbas`, `Contador`), dicionário do domínio em `src/dominio/`. O que muda é o **domínio** (de lote para contrato e QR) e a **camada visual** (padrões de página mais fortes).

| Item atual | Ação | Observação |
| --- | --- | --- |
| `services/http.ts`, `services/index.ts`, `config/env.ts` | Manter | Acrescentar `VITE_APP_URL` (base do link do QR) |
| `services/contracts.ts`, `real/index.ts`, `endpoints.ts` | Adaptar | Novos domínios (seção 6); remover `lotes`, `volumetria`, `inventario`, `visao` |
| `services/mock/*` | Reescrever | Novo `data.ts` com a história de demonstração (seção 15); regras por módulo |
| `types/models.ts` | Reescrever | Modelo v2 (seção 5) |
| `dominio/rotulos.ts`, `opcoes.ts`, `permissoes.ts`, `parametros.ts` | Adaptar | Novas situações, permissões e parâmetros |
| `dominio/inspecao.ts` | Remover | Formação de fardos deixa de existir |
| `components/ListPage.tsx` | Adaptar | Acrescentar abas de situação com contador (`abasStatus`) e barra de filtros nova |
| `components/FormModal.tsx`, `Modal.tsx`, `Passos.tsx`, `Contador.tsx`, `LinhaTempo.tsx`, `PainelAbas.tsx`, `Toast.tsx`, `ErroTela.tsx`, `Estados.tsx`, `Badge.tsx`, `MenuAcoes.tsx`, `Codigos.tsx`, `Etapas.tsx`, `UploadModal.tsx`, `FormLinha.tsx` | Manter | `Codigos.tsx` passa a reconhecer IDs v2 |
| `components/Layout.tsx` | Adaptar | Novo topo com botão **Ler QR** e menu v2 |
| `components/NfModal.tsx`, `RecebimentoModal.tsx`, `DeclararDofModal.tsx`, `utils/nfeXml.ts` | Adaptar | Viram passos do novo assistente de recebimento |
| `components/SeparacaoModal.tsx`, `RmeModal.tsx` | Adaptar | Separação por leitura de QR |
| `components/InspectorModal.tsx` | Adaptar | Protocolo continua; código da peça passa a ser o ID v2 |
| `components/FormarFardosModal.tsx`, `FardosModal.tsx`, `RelatorioVolumetria.tsx`, `RelatoriosIbama.tsx`, `RelatorioMovimentacoes.tsx`, `Quadro.tsx` | Remover | `Quadro` pode ficar no repositório sem uso; não usar nas telas v2 |
| Páginas `Lotes`, `LoteDetalhe`, `Saldo`, `Inventario`, `VisaoComputacional`, `Relatorios` | Remover | Saldo vira visão do Estoque; indicadores vão para o Painel |
| Páginas `Patio` | Renomear | Vira `Locais` |
| Páginas `Administracao` | Renomear | Vira `Usuarios` |
| Páginas `Cadastros`, `Especies`, `Tamanhos`, `Fornecedores`, `Enderecos`, `Configuracoes`, `Dashboard`, `Estoque`, `FardoDetalhe`, `Inspecao`, `Recebimento`, `NotasFiscais`, `Movimentacoes`, `Rme`, `Login` | Adaptar | Ver especificação de cada tela (seção 9) |
| Novas | Criar | `Contratos`, `ContratoDetalhe`, `Simulador`, `EtiquetasImpressao`, `RecebimentoDetalhe`, `InspecaoFardo`, `FichaDormente`, `FornecedorDetalhe`, `SaidaDetalhe`, `LeitorQr` (componente global) |

---

## 3. Arquitetura da informação

### 3.1 Princípio

O menu segue a **jornada do dormente** (contrato → recebimento → inspeção → estoque → saída), e cada objeto do negócio (contrato, fardo, dormente, recebimento, saída, fornecedor) tem **uma página própria** que funciona como ponto de encontro de tudo que se relaciona com ele. Listas servem para encontrar; páginas de objeto servem para entender e agir.

### 3.2 Menu (grupos e itens)

`GRUPOS_MENU = ['Início', 'Suprimento', 'Entrada', 'Estoque', 'Saída', 'Cadastros']`

| Grupo | Item do menu | Rota | Perfis |
| --- | --- | --- | --- |
| Início | Painel | `/` | Todos |
| Suprimento | Contratos | `/contratos` | Administrador, Almoxarife, Gestor |
| Suprimento | Simulador do fornecedor (selo "Demo") | `/simulador` | Administrador, Almoxarife |
| Entrada | Recebimentos | `/recebimentos` | Administrador, Almoxarife, Gestor |
| Entrada | Inspeção | `/inspecao` | Administrador, Almoxarife, Gestor |
| Entrada | NF e DOF | `/documentos` | Administrador, Almoxarife, Gestor |
| Estoque | Estoque | `/estoque` | Todos (requisitante só a visão por item) |
| Estoque | Locais | `/locais` | Administrador, Almoxarife, Gestor |
| Estoque | Movimentações | `/movimentacoes` | Administrador, Almoxarife, Gestor |
| Saída | Requisições (RME) | `/saidas` | Todos |
| Cadastros | Cadastros | `/cadastros` | Administrador (edita), Almoxarife e Gestor (consultam) |
| Cadastros | Usuários | `/usuarios` | Administrador |
| Cadastros | Configurações | `/configuracoes` | Administrador |

### 3.3 Rotas fora do menu (páginas de objeto e utilitárias)

| Rota | Tela | Observação |
| --- | --- | --- |
| `/contratos/:numero` | Página do contrato | `numero` = `AR00224-01` |
| `/fornecedores/:id` | Página do fornecedor | |
| `/recebimentos/:id` | Página do recebimento | |
| `/inspecao/:fardo` | Inspeção de um fardo | |
| `/f/:id` | Página do fardo | Destino do QR do fardo; `/fardos/:id` redireciona para cá |
| `/d/:id` | Ficha do dormente | Destino do QR do dormente; tela mobile-first |
| `/saidas/:numero` | Página da requisição | |
| `/simulador/etiquetas/:remessa` | Folha de impressão de etiquetas | Sem o Layout (só a folha), com CSS de impressão |
| `/login` | Login | Guarda o destino (ex. `/d/...`) e volta para ele após entrar |

### 3.4 Elementos globais (em toda tela)

- **Topo**: logo, busca global, botão **Ler QR** (ícone + texto no desktop, botão flutuante no celular), sino de alertas, usuário.
- **Busca global** reconhece IDs v2 e leva direto ao objeto: dormente → `/d/`, fardo → `/f/`, contrato → `/contratos/`, RME → `/saidas/`, NF → `/documentos?q=`. Texto livre pesquisa fardos e contratos.
- **Selo "Dados simulados"** continua no modo mock.

---

## 4. Navegação e integração entre telas

Regras que valem para todas as telas. O objetivo é que **nenhuma informação fique isolada nem duplicada**.

1. **Todo código é um link.** Qualquer ID de dormente, fardo, contrato, NF, recebimento ou RME exibido em tabela, cartão ou texto usa `<CodigoLink codigo={…} />`, que resolve a rota por `rotaDoCodigo()` em `utils/busca.ts`. Nada de texto solto.
2. **Cada dado tem um dono.** O dado é editado só na tela do seu dono e apenas exibido (com link) nas outras. Ex.: espécie e tamanho pertencem ao item do contrato; a ficha do dormente mostra, mas não edita.
3. **Páginas de objeto têm a seção "Relacionados"** com links para os objetos ligados (contrato ↔ fardos ↔ dormentes ↔ NF ↔ recebimento ↔ inspeção ↔ saída).
4. **Indicador leva à lista filtrada.** Todo número do Painel e dos cabeçalhos de objeto é clicável e abre a lista já filtrada pelo endereço (`/estoque?situacao=abaixo_minimo`).
5. **Estado na URL.** Busca, filtros, aba de situação e aba da página de objeto ficam no endereço (`?q=`, `?situacao=`, `?aba=`). Voltar do navegador devolve a lista como estava.
6. **Migalhas (breadcrumb)** nas páginas de objeto: `Estoque › Fardo AR00224-01-F012 › Dormente …`, montadas a partir da origem real do objeto, não do histórico de navegação.
7. **Ação no contexto.** A próxima ação do fluxo aparece onde o objeto está: o fardo "aguardando inspeção" mostra **Inspecionar** na própria página; a RME "aberta" mostra **Separar**. Não obrigar o usuário a ir ao menu para agir.
8. **Leitor de QR único.** O mesmo componente `LeitorQr` serve à navegação (lê e abre a ficha) e aos assistentes (lê e devolve o ID ao passo em curso). Ver seção 10.
9. **Retorno após ação.** Depois de concluir um assistente, a tela abre a página do objeto criado ou alterado, com toast de sucesso só após a resposta do serviço.

### 4.1 Mapa de relacionamento entre telas

```
Painel ──► listas filtradas (Estoque, Recebimentos, NF e DOF, RME)
Contratos ──► Contrato ──► Fornecedor
                 ├──► Fardos (/f/) ──► Dormentes (/d/)
                 ├──► NFs / Recebimentos ──► DOF
                 └──► Simulador (gerar remessa deste contrato)
Recebimentos ──► Recebimento ──► Fardos recebidos ──► Inspeção do fardo
Inspeção ──► Inspeção do fardo ──► Fardo (após concluir)
Estoque ──► por item ──► fardos do item ──► Fardo ──► Dormente
Locais ──► fardos no local ──► Fardo
RME ──► Requisição ──► fardos/dormentes separados ──► Dormente
Ficha do dormente ──► Fardo, Local, Contrato, Fornecedor, NF, DOF, Recebimento, Inspeção, RME
```

---

## 5. Modelo de dados (TypeScript, `src/types/models.ts`)

Reescrever o arquivo. Manter `Paginado<T>`, `ListQuery`, `Origem`, `Usuario`. Todo registro que muda de estado guarda `quem` e `quando` (`criadoPor`, `criadoEm`, e eventos em `historico`).

### 5.1 Identificação (`src/dominio/identificacao.ts`, novo)

```ts
export const RE_CONTRATO = /^[A-Z]{2}\d{5}-\d{2}$/;           // AR00224-01
export const RE_DORMENTE = /^([A-Z]{2}\d{5}-\d{2})-(\d{6})$/;  // AR00224-01-000357
export const RE_FARDO    = /^([A-Z]{2}\d{5}-\d{2})-F(\d{3})$/; // AR00224-01-F012
export const RE_RME      = /^RME-\d{4}-\d{4}$/;                 // RME-2026-0012

export function idDormente(contrato: string, seq: number): string; // zero-padding 6
export function idFardo(contrato: string, seq: number): string;    // zero-padding 3
export function lerCodigo(texto: string): { tipo: 'dormente' | 'fardo' | 'contrato' | 'rme' | 'local'; id: string } | null;
// lerCodigo aceita o ID puro ou o link completo do QR (extrai o ID do final de /#/d/<id> ou /#/f/<id>)
export function linkQr(tipo: 'dormente' | 'fardo' | 'local', id: string): string; // usa VITE_APP_URL
```

Formatos de ata e contrato são provisórios (ver perguntas em aberto); toda validação passa por estas funções, nunca regex espalhada pelas telas.

### 5.2 Cadastros

```ts
interface Fornecedor { id; razaoSocial; cnpj; cidadeUf; ctfIbama: string; ctfValidade: string;
  situacao: 'ativo' | 'bloqueado' | 'inativo'; especiesIds: string[]; certificados: Anexo[] }
interface Especie { id; nomeCientifico; nomePopular; classe?: string; ativo: boolean }
interface Tamanho { id; codigo; comprimentoCm; larguraCm; alturaCm; volumeM3 /* calculado */; medidas: 'provisorio' | 'confirmado' }
interface Tratamento { id; preservativo: string /* CCA */; empresa: string /* Granoski */ }
interface Local { id; codigo; descricao; tipo: 'armazenagem' | 'inspecao' | 'segregacao' | 'expedicao'; capacidade: number /* dormentes */; ocupacao /* calculada */; ativo: boolean }
interface NivelEstoque { especieId; tamanhoId; minimo: number; maximo: number }   // em Configurações
interface Anexo { id; nome; tipo: 'pdf' | 'xml' | 'imagem'; url; enviadoEm; enviadoPor }
```

### 5.3 Suprimento

```ts
interface Ata { id; numero /* AR00224 */; fornecedorId; vigenciaInicio; vigenciaFim }
interface Contrato { id; numero /* AR00224-01 */; ataId; fornecedorId; empresaInspetora: string; ano: number;
  situacao: 'vigente' | 'concluido' | 'cancelado'; itens: ItemContrato[]; criadoEm; criadoPor }
interface ItemContrato { id; especieId; tamanhoId; tratamentoId; quantidade: number /* unidades */;
  // calculados pelo serviço:
  emitidos: number; recebidos: number; aprovados: number; reprovados: number }
interface Remessa { id; contratoId; nfNumero; criadoEm; fardosIds: string[]; situacao: 'em_transito' | 'recebida' }
```

`Remessa` representa o que o fornecedor envia de uma vez (uma NF). No protótipo é criada pelo Simulador e consumida pelo Recebimento.

### 5.4 Fardo e dormente (dois níveis)

```ts
type SituacaoFardo = 'em_transito' | 'aguardando_inspecao' | 'em_inspecao' | 'em_estoque' | 'aberto' | 'baixado';
interface Fardo { id /* AR00224-01-F012 */; contratoId; itemContratoId; remessaId; quantidadeInicial: number;
  saldo: number /* calculado = dormentes em_estoque */; localId?: string; situacao: SituacaoFardo;
  recebidoEm?: string; idadeDias?: number /* calculado */; historico: Evento[] }

type SituacaoDormente = 'emitido' | 'aguardando_inspecao' | 'em_estoque' | 'reservado' | 'baixado' | 'reprovado';
interface Dormente { id /* AR00224-01-000357 */; contratoId; itemContratoId; fardoId: string;
  situacao: SituacaoDormente; categoria?: number; medidas?: { comprimentoCm; larguraCm; alturaCm };
  inspecaoId?: string; rmeNumero?: string; historico: Evento[] }

interface Evento { quando; quem; tipo: 'emitido' | 'recebido' | 'inspecionado' | 'guardado' | 'transferido'
  | 'reservado' | 'baixado' | 'segregado' | 'cancelado'; descricao: string; referencia?: string }
```

Invariantes (garantidas no serviço, nunca na tela):
- `fardo.saldo` é sempre o número de dormentes `em_estoque` ou `reservado` daquele fardo.
- Um dormente pertence a exatamente um fardo; reprovado sai do fardo (`fardoId` mantido como origem, situação `reprovado`, local de segregação).
- Um ID nunca é reaproveitado nem apagado.

### 5.5 Entrada

```ts
interface NotaFiscal { id; numero; chaveAcesso; fornecedorId; contratoId; emissao; remessaId?; xml?: Anexo;
  itens: { itemContratoId; quantidade: number; volumeM3: number }[] }
interface Dof { id; numero; nfId; validade: string; volumes: { especieId; volumeM3 }[]; pdf?: Anexo;
  declarado?: { quando; quem }; prazoDeclaracao /* calculado: dia seguinte à validade */;
  nivelPrazo: 'ok' | 'atencao' | 'critico' | 'vencido' /* calculado */ }
interface Recebimento { id; nfId; dofId; recebidoEm; recebidoPor; fardosEsperados: string[]; fardosLidos: string[];
  conforme: boolean; ocorrencias: { tipo: 'avaria' | 'falta' | 'sobra' | 'fardo_desconhecido'; descricao; fotos: Anexo[] }[];
  divergenciaVolume: { especieId; documentalM3; calculadoM3; percentual; acimaTolerancia: boolean }[];
  localEsperaId: string }
interface Inspecao { id; dormenteId; fardoId; resultado: 'aprovado' | 'reprovado'; categoria?: number;
  medidas: { comprimentoCm; larguraCm; alturaCm }; inspetor; inspecionadoEm; origem: 'inspector' | 'simulado';
  relatorioUrl?: string }
```

### 5.6 Estoque e saída

```ts
interface SaldoItem { especieId; tamanhoId; emEstoque; aguardandoInspecao; reservado; minimo; maximo;
  situacao: 'falta' | 'ok' | 'excesso' /* calculado */ }
interface Movimentacao { id; tipo: 'guarda' | 'transferencia' | 'segregacao' | 'saida'; fardoId; dormentesIds?: string[];
  deLocalId?; paraLocalId?; quando; quem; referencia?: string }
type SituacaoRme = 'aberta' | 'em_separacao' | 'pronta' | 'entregue' | 'cancelada';
interface Rme { id; numero /* RME-2026-0012 */; solicitante; destino: string /* obra ou trecho */; necessidadeEm: string;
  itens: { especieId; tamanhoId; quantidade }[]; separacao?: { fardoId; dormentesIds: string[]; seguiuSugestao: boolean; justificativa? }[];
  situacao: SituacaoRme; historico: Evento[] }
```

### 5.7 Parâmetros (`servicos.parametros`, editados em Configurações)

`limiteDiasEstoque` (provisório 120), `alertaDofDias` ([3, 1]), `toleranciaVolumePct` (10, regra IBAMA, só leitura), `dormentesPorFardoPadrao` (sugestão do simulador), `niveis: NivelEstoque[]`, `modoDemonstracao` (mostra o Simulador).

---

## 6. Camada de serviços

Manter o padrão: telas importam só `servicos`; contrato em `contracts.ts`; mock e real implementam a mesma interface; `endpoints.ts` com caminhos provisórios. Ao criar uma operação, atualizar contrato, mock, real e endpoints juntos.

| Serviço | Operações principais |
| --- | --- |
| `auth` | manter |
| `dashboard` | `indicadores()`, `pendencias()` (por perfil), `alertas()` |
| `fornecedores`, `especies`, `tamanhos`, `tratamentos`, `locais`, `usuarios` | `listar`, `obter`, `criar`, `atualizar`, `inativar` |
| `contratos` | `listar`, `obter(numero)`, `criar`, `atualizar`, `cancelar` |
| `simulador` | `gerarRemessa({ contratoId, itens: [{ itemContratoId, fardos, dormentesPorFardo }] })` → cria fardos `em_transito`, dormentes `emitido`, NF e DOF de exemplo; `etiquetas(remessaId)` |
| `recebimentos` | `listar`, `obter`, `remessasACaminho()`, `receber(dados, arquivos)` |
| `documentos` | `listarNfs`, `listarDofs`, `declararDof(id)`, `importarXml` (validação no front com `utils/nfeXml.ts`) |
| `inspecao` | `fila()`, `obterFardo(id)`, `registrar(dormenteId, resultado)`, `simularFardo(id)`, `concluir(fardoId, localId)` |
| `fardos` | `listar`, `obter(id)`, `transferir(id, localId)` |
| `dormentes` | `listar`, `obter(id)` (devolve a ficha completa já montada, seção 9.12) |
| `estoque` | `porItem()`, `porFardo(q)` |
| `movimentacoes` | `listar` |
| `rme` | `listar`, `obter`, `abrir`, `sugerirSeparacao(numero)`, `separar`, `entregar`, `cancelar` |
| `parametros` | `obter`, `atualizar` |

**Persistência e futuro banco (Supabase).** A interface é construída inteira sobre o mock e só depois o banco é criado no Supabase. Para isso funcionar sem retrabalho:
- O mock passa a **guardar o estado no `localStorage`** (com `try/catch`), para os dados sobreviverem ao recarregar a página, e ganha um botão **Reiniciar dados de demonstração** em Configurações.
- A história inicial (`data.ts`) é **determinística**: os mesmos IDs sempre, sem `Math.random()` nem datas soltas (datas relativas a uma data-base fixa). Assim, etiquetas impressas com antecedência abrem a ficha certa em qualquer aparelho.
- O Supabase entra depois como **uma terceira implementação** da mesma interface (`services/supabase/`), escolhida por variável de ambiente, sem mudar nenhuma tela. Os tipos de `models.ts` devem ser pensados como tabelas: cada entidade com `id` próprio, vínculos por id (`contratoId`, `fardoId`), campos calculados marcados como tal (viram views ou consultas).
- Enquanto não houver banco, cada aparelho tem seus próprios dados. A demonstração que usa computador e celular juntos só funciona depois do Supabase.

Regras no mock, um módulo por assunto (como hoje): `mock/simulador.ts`, `mock/recebimento.ts`, `mock/inspecao.ts`, `mock/estoque.ts` (única porta de mudança de saldo: `movimentarDormentes()`), `mock/rme.ts`. `data.ts` gera a história inicial **chamando essas regras**, nunca montando registros à mão.

---

## 7. Identidade visual

### 7.1 Direção

Sistema corporativo com a robustez de um SAP, mas mais limpo: **estrutura forte, pouca decoração, informação densa e bem hierarquizada**. A referência de padrões de página é o SAP Fiori (lista com filtros, página de objeto, assistente, painel), simplificada: menos campos por tela, ações principais sempre visíveis, nada escondido em menus de segundo nível.

Manter a paleta atual (azul-marinho + laranja de destaque), que já transmite seriedade e combina com a CPTM. Ajustar para tokens nomeados por função.

### 7.2 Tokens (`src/styles/tokens.css`, importado no início de `styles.css`)

| Grupo | Tokens | Uso |
| --- | --- | --- |
| Marca | `--cor-shell: #0f2142`, `--cor-menu: #13294b`, `--cor-primaria: #25518f`, `--cor-primaria-clara: #e3ebf7` | Topo, menu, links, foco de seleção |
| Ação | `--cor-acao: #d96500`, `--cor-acao-hover: #b45309` | Só o botão principal da tela |
| Semântica | `--ok #187a43 / --ok-fundo #e1f4e8`, `--atencao #b45309 / #fff1e0`, `--critico #bf2121 / #fde6e6`, `--info #25518f / #e3ebf7`, `--neutro #5b6673 / #eceff3` | Badges, alertas, indicadores |
| Superfície | `--fundo #f5f7f9`, `--superficie #fff`, `--borda #dde2e8`, `--borda-forte #c3cad3` | Página, cartões, tabelas |
| Texto | `--texto #1c2430`, `--texto-2 #5b6673`, `--texto-inverso #fff` | |
| Tipografia | `--fonte: system-ui, 'Segoe UI', Roboto, Arial`; `--fonte-mono: ui-monospace, 'Cascadia Mono', Consolas, monospace`; escala `12 / 13 / 14 / 16 / 20 / 24` | IDs sempre em `--fonte-mono` |
| Espaço | múltiplos de 4: `4, 8, 12, 16, 24, 32` | |
| Raio | `--raio: 6px`, `--raio-grande: 10px` | |
| Sombra | `--sombra-1: 0 1px 2px rgba(15,33,66,.08)`, `--sombra-2: 0 8px 24px rgba(15,33,66,.18)` | Cartões e camadas flutuantes |
| Densidade | linha de tabela 40px no desktop, alvo de toque 44px no celular | |

Regras: cor semântica sempre acompanha texto ou ícone (nunca só cor); o laranja aparece **uma vez por tela** (ação principal); números alinhados à direita com `tabular-nums`; IDs em fonte mono com cópia ao clicar no ícone.

### 7.3 Componentes visuais novos ou revistos

| Componente | Descrição |
| --- | --- |
| `CabecalhoPagina` | Título, subtítulo (contagem ou descrição), migalhas, ações à direita (uma principal) |
| `CabecalhoObjeto` | ID em mono e grande, badge de situação, 3 a 6 fatos-chave (`FatoChave`: rótulo, valor, link opcional), barra de ações |
| `AbasSecao` | Abas da página de objeto, sincronizadas com `?aba=` |
| `AbasSituacao` | Abas com contador acima das listas (ex. Abertas 4 · Em separação 2 · Entregues 31) |
| `BarraFiltros` | Busca + até 4 filtros + chips removíveis + "Limpar tudo" (extrair do `ListPage`) |
| `CartaoIndicador` | Número grande, rótulo, variação ou alerta, clicável para a lista filtrada |
| `Relacionados` | Lista de links para objetos ligados, com ícone por tipo |
| `IdCodigo` | ID em mono + botão copiar + link (`CodigoLink` usa por dentro) |
| `BarraProgresso` | Contratado x recebido x aprovado (contratos e itens) |
| `EtiquetaQr` | Desenho da plaquinha com QR, para tela e impressão |
| `LeitorQr` | Camada de leitura pela câmera, com entrada manual |
| `SeloDemo` | Selo laranja tracejado "Demonstração" para o Simulador |

Ícones: ampliar `components/Icone.tsx` com `qr`, `scan`, `contrato`, `fabrica`, `impressora`, `etiqueta`, `local`, `copiar`, `seta-direita`.

---

## 8. Padrões de página (usar sempre um destes)

### 8.1 Lista (List Report)

```
[Migalhas]
Título                                   [Ação secundária] [Ação principal]
Subtítulo (n registros)
[Abas de situação com contador]
[Busca] [Filtro] [Filtro] [Filtro]   chips ativos · Limpar tudo   [Colunas]
┌ Tabela (até 7 colunas; 1ª coluna = ID/link) ─────────── [Próxima ação] [⋯] ┐
└──────────────────────────────────────────────────────────────────────────┘
Paginação
```
Base: `ListPage` atual + `AbasSituacao` + `BarraFiltros`. No celular vira cartões (já existe).

### 8.2 Página de objeto (Object Page)

```
[Migalhas]
AR00224-01-F012  [Em estoque]                        [Transferir] [Imprimir] [⋯]
Saldo 13/14 · Local A-03 · Idade 42 dias · Contrato AR00224-01 · Item Dialium 2,80 m
[Resumo] [Dormentes] [Origem] [Histórico]
┌ conteúdo da aba ───────────────────────┐  ┌ Relacionados ┐
└────────────────────────────────────────┘  └──────────────┘
```
Fatos-chave são links. A aba Histórico usa `LinhaTempo`.

### 8.3 Assistente (Wizard)

Base: `ProgressoPassos`. Cada passo valida antes de avançar; o último é sempre "Revisar e confirmar" com o resumo do que vai acontecer; erro do servidor volta ao passo do campo. No celular ocupa a tela inteira com botões fixos no rodapé (já existe em `Modal largo`).

### 8.4 Painel (Overview)

Linha de `CartaoIndicador` → "Para fazer agora" (pendências do perfil, cada uma com botão de ação) → gráficos e alertas. Conteúdo muda por perfil.

### 8.5 Ficha rápida (mobile-first)

Usada só em `/d/:id`. Uma coluna, cartões empilhados, texto grande, ações grandes no rodapé. É a tela que o funcionário abre no pátio ao apontar a câmera.

---

## 9. Especificação tela a tela

Para cada tela: rota, objetivo, padrão, conteúdo, ações, ligações e critérios de aceite. Todas têm estados carregando, vazio e erro (`Estados.tsx`), e respeitam permissões (`pode()`).

### 9.1 Login (`/login`)
Manter. Perfis demo: `administrador`, `almoxarife`, `gestor`, `requisitante` (qualquer senha). Após login, voltar ao destino guardado, inclusive `/d/:id` vindo de um QR.
- Aceite: abrir `/#/d/AR00224-01-000001` sem sessão leva ao login e, após entrar, abre a ficha.

### 9.2 Painel (`/`) · padrão Painel
- **Indicadores** (clicáveis): Em estoque (dormentes) · Aguardando inspeção · Itens abaixo do mínimo · Fardos acima do limite de dias · DOFs a declarar · RMEs abertas.
- **Para fazer agora** por perfil: almoxarife (remessas a receber, fardos a inspecionar, fardos a guardar, RMEs a separar e entregar, DOFs a declarar); gestor (itens em falta ou excesso, fardos parados, taxa de reprovação alta); requisitante (suas RMEs e situação); administrador (contratos perto do fim, fornecedores com CTF vencendo).
- **Estoque por item**: gráfico de barras horizontais por espécie + tamanho, com marcas de mínimo e máximo (cor só reforça o rótulo falta/ok/excesso).
- **Entregas dos contratos**: `BarraProgresso` por contrato vigente.
- **Alertas**: lista curta com link.
- Aceite: cada número do Painel abre a lista filtrada correspondente.

### 9.3 Contratos (`/contratos`) · padrão Lista
- Abas: Vigentes · Concluídos · Cancelados.
- Colunas: Contrato (link) · Ata · Fornecedor (link) · Itens · Entregue (`BarraProgresso` recebido/contratado) · Vigência · Situação.
- Filtros: fornecedor, espécie, ano.
- Ação principal: **Novo contrato** (modal largo `ContratoModal`: ata (selecionar ou criar), número, fornecedor, empresa inspetora, ano, itens em linhas: espécie, tamanho, tratamento, quantidade e unidade (un ou m³). Em m³ o sistema mostra a conversão em unidades pelo volume do tamanho, arredondada para baixo, e grava em unidades).
- Aceite: não deixa salvar item com espécie que o fornecedor não fornece; fornecedor bloqueado não aparece.

### 9.4 Página do contrato (`/contratos/:numero`) · padrão Objeto
- Cabeçalho: número, situação, fatos-chave (Fornecedor, Ata, Contratado, Recebido, Aprovado, Reprovado).
- Abas: **Itens** (por item: contratado, emitidos, recebidos, aprovados, reprovados, saldo a entregar, barra de progresso) · **Fardos** (lista filtrada por contrato) · **Notas e recebimentos** · **Histórico**.
- Ações: Editar, Cancelar, **Gerar remessa no simulador** (só com modo demonstração).
- Relacionados: fornecedor, ata, NFs, recebimentos.

### 9.5 Simulador do fornecedor (`/simulador`) · padrão Assistente + Lista
- Aviso fixo no topo (não recolhível): "Demonstração. Na operação real, o fornecedor grava o QR na plaquinha seguindo o padrão do contrato."
- Assistente **Gerar remessa**: 1) contrato · 2) itens e quantidades (fardos e dormentes por fardo, padrão do parâmetro; mostra saldo a emitir do item e bloqueia acima dele) · 3) revisar e confirmar.
- Ao confirmar: cria fardos `em_transito`, dormentes `emitido` com IDs sequenciais, uma NF e um DOF de exemplo coerentes com o volume, e a remessa `em_transito`.
- Lista abaixo: remessas geradas (NF, contrato, fardos, dormentes, situação) com ações **Imprimir etiquetas** e **Baixar XML da NF** (XML fictício para testar a importação).
- Aceite: nenhuma sequência se repete entre remessas do mesmo contrato; o total emitido nunca passa do contratado.

### 9.6 Folha de etiquetas (`/simulador/etiquetas/:remessa`)
- Sem Layout. Grade de `EtiquetaQr` para impressão em A4: primeiro a etiqueta do fardo, depois as dos dormentes daquele fardo.
- Etiqueta do dormente (proporção da plaquinha do contrato): QR à esquerda, à direita o ID em mono e grande, contrato, espécie e comprimento. Etiqueta do fardo: maior, com "FARDO", ID, item e quantidade.
- Usar o texto "CPTM" no cabeçalho, não o arquivo do logo (só usar logo se a CPTM fornecer).
- CSS `@media print`: margens, quebra de página sem cortar etiqueta, botão Imprimir escondido.
- Aceite: a etiqueta impressa é lida pela câmera do celular e abre a ficha.

### 9.7 Recebimentos (`/recebimentos`) · padrão Lista
- Abas: **A caminho** (remessas em trânsito) · Aguardando inspeção · Concluídos · Com ocorrência.
- Colunas: NF · Fornecedor · Contrato · Fardos · Dormentes · Prazo DOF (badge) · Situação.
- Ação na linha "A caminho": **Receber** (abre o assistente com a remessa já escolhida). Ação principal da tela: **Receber sem remessa** (NF por XML ou digitada).
- **Assistente de recebimento** (`RecebimentoAssistente`):
  1. **Documentos**: NF (da remessa, por XML com `utils/nfeXml.ts` ou digitada; chave repetida é recusada) e DOF (número, validade, volume por espécie, PDF). Sem DOF não avança.
  2. **Leitura dos fardos**: lista dos fardos esperados com caixa de checagem; botão **Ler QR** em modo contínuo marca cada fardo lido; fardo lido que não é da remessa vira ocorrência "fardo desconhecido"; também dá para marcar à mão.
  3. **Conferência**: conforme ou com ocorrência (avaria, falta, sobra); ocorrência exige descrição e foto.
  4. **Local de espera**: local do tipo inspeção (sugerido o com mais espaço).
  5. **Revisar e confirmar**: resumo, divergência de volume por espécie (acima de 10% mostra aviso crítico e pede justificativa, não bloqueia).
- Resultado: fardos e dormentes lidos passam a `aguardando_inspecao`; abre a página do recebimento.

### 9.8 Página do recebimento (`/recebimentos/:id`) · padrão Objeto
- Fatos-chave: NF, DOF, contrato, fardos (lidos/esperados), recebido em, por.
- Abas: Fardos (com situação e link para inspeção) · Documentos (NF, XML, DOF, PDF, volume documental x calculado) · Ocorrências (fotos) · Histórico.
- Ação: **Marcar DOF como declarado no Sinaflor** (com confirmação; registra quem e quando).

### 9.9 NF e DOF (`/documentos`) · padrão Lista
- Abas: DOFs a declarar · Declarados · Todas as NFs.
- Colunas DOF: DOF · NF · Fornecedor · Validade · Prazo de declaração · Nível (crítico, atenção, ok) · Declarado em.
- Ação na linha: **Declarar**. Ordenação padrão: prazo mais próximo primeiro.

### 9.10 Inspeção (`/inspecao`) e Inspeção do fardo (`/inspecao/:fardo`)
- **Fila** (padrão Lista): fardos `aguardando_inspecao` e `em_inspecao` com progresso (x de N dormentes inspecionados), contrato, item, local de espera, há quantos dias. Ação: **Inspecionar**.
- **Inspeção do fardo** (tela de trabalho, duas colunas):
  - Esquerda: lista dos dormentes do fardo com situação (pendente, aprovado, reprovado) e categoria.
  - Direita: último dormente lido em destaque (ID, resultado, categoria, medidas); botões **Abrir no Inspector** (protocolo atual), **Simular inspeção do fardo** (modo demonstração: gera resultados determinísticos, com ~5% reprovados) e **Registrar à mão** (ler QR + resultado).
  - ID lido que não pertence ao fardo vira pendência visível ("não pertence a este fardo").
  - **Concluir inspeção** (habilitado com todos inspecionados): escolhe o local de guarda (lido por QR do local ou selecionado); aprovados ficam `em_estoque` no fardo, que vai para o local; reprovados vão para `reprovado` no local de segregação. Gera movimentações `guarda` e `segregacao`.
- Aceite: o saldo do fardo após concluir é igual ao número de aprovados.

### 9.11 Estoque (`/estoque`) · padrão Lista com duas visões
- Alternar **Por item** | **Por fardo** (`?visao=`).
- Por item: Espécie · Tamanho · Em estoque · Aguardando inspeção · Reservado · Mínimo · Máximo · Situação (falta, ok, excesso). Clique na linha → visão por fardo filtrada pelo item.
- Por fardo: Fardo (link) · Item · Contrato · Local · Saldo · Idade (dias, com alerta acima do limite) · Situação. Ordenação padrão: mais antigos primeiro.
- Filtros: espécie, tamanho, local, situação, contrato, "acima do limite de dias".
- Ação principal: **Transferir fardo** (ler QR do fardo → ler QR ou escolher local).

### 9.12 Página do fardo (`/f/:id`) · padrão Objeto
- Fatos-chave: Saldo/inicial · Local · Idade · Contrato · Item · Recebido em.
- Abas: **Dormentes** (ID, situação, categoria, comprimento medido) · **Origem** (contrato, fornecedor, NF, DOF, recebimento, inspeção) · **Movimentações** · **Histórico**.
- Ações por situação: aguardando inspeção → **Inspecionar**; em estoque/aberto → **Transferir**, **Imprimir etiqueta do fardo**.

### 9.13 Ficha do dormente (`/d/:id`) · padrão Ficha rápida
- Topo: ID grande em mono, badge de situação, espécie (nome científico + popular), classe, tamanho, tratamento.
- Cartão **Onde está**: fardo (link), local, desde quando. Se baixado: RME e destino.
- Cartão **Inspeção**: resultado, categoria, medidas, inspetor, data, link do relatório (`urlSegura()`).
- Cartão **Origem**: contrato, ata, fornecedor, empresa inspetora, NF, DOF, recebido em.
- Cartão **Linha do tempo**: eventos do dormente (`LinhaTempo`).
- Rodapé de ações por perfil e situação (ex. almoxarife: "Ver fardo", "Transferir fardo"; reservado: "Ver RME").
- ID inexistente: tela "ID não encontrado" com o código lido, opção de digitar de novo e de ler outro QR.
- Aceite: abre em menos de 1 s no mock, legível num celular de 360 px sem rolagem horizontal.

### 9.14 Leitor de QR (componente global `LeitorQr`)
Ver seção 10. Aberto pelo botão do topo, pela busca e pelos assistentes.

### 9.15 Locais (`/locais`) · padrão Lista + mapa
- Visão **Mapa**: grade de cartões por local (código, tipo, barra de ocupação dormentes/capacidade, número de fardos); cores por tipo e ocupação com texto.
- Visão **Lista**: Código · Tipo · Descrição · Fardos · Ocupação · Situação.
- Clique no local → Estoque por fardo filtrado pelo local.
- Ação: **Imprimir QR dos locais** (etiqueta de endereço, para guarda por leitura).

### 9.16 Movimentações (`/movimentacoes`) · padrão Lista
- Colunas: Quando · Tipo · Fardo · Dormentes (quantidade) · De · Para · Quem · Referência (RME, recebimento).
- Filtros: tipo, período, local, fardo. Ação principal: **Transferir fardo**.

### 9.17 Requisições (`/saidas`) e Página da RME (`/saidas/:numero`)
- Lista: abas Abertas · Em separação · Prontas · Entregues · Canceladas. Colunas: RME · Solicitante · Destino · Itens · Necessidade em · Situação.
- **Nova RME** (requisitante): destino (obra ou trecho), data de necessidade, itens (espécie, tamanho, quantidade, mostrando o disponível).
- **Separar** (almoxarife, assistente): 1) sugestão de fardos (abertos primeiro, depois os mais antigos), só aprovados e em estoque; 2) leitura dos QR dos dormentes ou "fardo inteiro"; escolha diferente da sugestão pede justificativa; quantidade tem de bater com a pedida; 3) revisar e confirmar → dormentes `reservado`, RME `pronta`.
- **Entregar**: confirma a entrega → dormentes `baixado`, fardos com sobra ficam `aberto`, zerados `baixado`; gera movimentações `saida`.
- **Cancelar** antes da entrega libera as reservas.
- Página da RME: fatos-chave (solicitante, destino, itens, situação), abas Itens · Separação (fardos e dormentes com link) · Histórico.

### 9.18 Cadastros (`/cadastros?aba=`) · `PainelAbas` (manter o padrão atual)
- Abas: Espécies · Tamanhos · Tratamentos · Fornecedores · Locais.
- Inclusão em linha (`FormLinha`), edição em `FormModal`, nada é apagado (inativar).
- Fornecedor: razão social, CNPJ, cidade/UF, CTF IBAMA e validade, espécies que fornece (seleção múltipla), certificados (anexos). Linha leva à **Página do fornecedor** (`/fornecedores/:id`): contratos, entregas, taxa de reprovação, certificados.

### 9.19 Usuários (`/usuarios`) e Configurações (`/configuracoes`)
- Usuários: nome, e-mail, perfil, ativo.
- Configurações: parâmetros da seção 5.7, com a tabela de **níveis de estoque** (mínimo e máximo por espécie + tamanho) editável e o interruptor **Modo demonstração**.

---

## 10. QR code: geração, leitura e impressão

### 10.1 Bibliotecas (exceção justificada à regra de "sem dependências")

| Uso | Biblioteca | Motivo |
| --- | --- | --- |
| Gerar QR | `qrcode` | Pequena, sem dependências de UI; gerar com `toDataURL()` e exibir em `<img>` (proibido `dangerouslySetInnerHTML`) |
| Ler QR | API nativa `BarcodeDetector` quando existir; senão `jsqr` lendo quadros da câmera num `<canvas>` | Funciona em Android/Chrome e nos demais navegadores |

Registrar no `CLAUDE.md` que estas são as únicas dependências de runtime além de React e react-router-dom.

### 10.2 Conteúdo e correção de erro
- Conteúdo: `linkQr('dormente', id)` = `${VITE_APP_URL}/#/d/${id}`. Nível de correção **M**, margem de 2 módulos.
- O leitor aceita link completo **ou** ID puro (`lerCodigo()`), para funcionar com plaquinhas antigas digitadas à mão e com outros leitores.

### 10.3 Componente `LeitorQr`
- Abre em camada sobre a tela, com vídeo da câmera traseira (`facingMode: 'environment'`), moldura de mira e lanterna quando disponível.
- Modos: `navegar` (lê e vai para o objeto) e `capturar` (lê e devolve `{tipo, id}` ao chamador; com `continuo` mantém aberto e lista o que já foi lido, com vibração curta a cada leitura).
- Sempre oferece **Digitar código** como alternativa e mostra mensagem clara quando não há permissão de câmera.
- Lê só códigos reconhecidos por `lerCodigo()`; outros mostram "QR não pertence ao sistema".

### 10.4 Câmera exige HTTPS
O navegador só libera a câmera em `https` ou `localhost`. Para testar no celular e para a apresentação, publicar o `dist/` em hospedagem estática com HTTPS (o `HashRouter` já dispensa configuração de servidor) ou usar `vite --host` com certificado local. Documentar o caminho escolhido no `CLAUDE.md`.

---

## 11. Usabilidade, acessibilidade e responsividade

- **Prioridade da informação**: em cada tela, o que decide a próxima ação aparece primeiro (situação, saldo, prazo); detalhes vão para abas.
- **Uma ação principal por tela** (laranja); próxima ação na linha em azul (`btn-acao`); o resto no menu "⋯".
- **Linguagem do usuário**: termos do glossário (fardo, dormente, contrato, RME, DOF); nada de "registro", "entidade" ou "item" genérico na interface.
- **Formulários**: rótulo acima do campo, obrigatórios marcados, erro ao lado do campo, números com `paraNumero()`.
- **Confirmação** só em ações irreversíveis (concluir inspeção, entregar RME, declarar DOF, cancelar).
- **Celular** (≤ 760 px): menu vira gaveta, botão Ler QR flutuante, tabelas viram cartões, assistentes em tela cheia, alvos de 44 px.
- **Acessibilidade**: contraste AA, foco visível (já existe), `aria-live` nos toasts e no leitor, nada transmitido só por cor, navegação por teclado em tabelas e abas.
- **Desempenho percebido**: esqueletos de carregamento (já existem), sem bloqueio da tela inteira durante buscas.

### 11.1 Telas de campo: celular primeiro

Quem usa a câmera trabalha no pátio, com o celular numa mão e às vezes luva na outra. Para essas pessoas o celular é a ferramenta principal, não uma versão reduzida do desktop. As telas abaixo são **desenhadas primeiro para 360 a 430 px** e só depois ajustadas para o computador.

| Tela de campo | Quem usa | O que muda no celular |
| --- | --- | --- |
| Início do almoxarife (`/` no celular) | Almoxarife | Ver "Início de campo" abaixo |
| Ficha do dormente (`/d/:id`) | Todos | Já é mobile-first (8.5) |
| Assistente de recebimento, passo "Leitura dos fardos" | Almoxarife | Câmera ocupa a metade de cima; lista dos fardos esperados embaixo, marcando cada leitura; contador "8 de 12 lidos" fixo |
| Inspeção do fardo, "Registrar à mão" | Almoxarife | Ler QR → dois botões grandes **Aprovado** e **Reprovado** → categoria → próxima leitura, sem sair da câmera |
| Transferir fardo | Almoxarife | Dois toques de leitura: QR do fardo, depois QR do local; confirmação em tela cheia |
| Separação da RME | Almoxarife | Lista do que falta separar por fardo; cada leitura risca o dormente; aviso imediato se o dormente lido não estiver na sugestão |
| Página do fardo (`/f/:id`) | Almoxarife | Fatos-chave em grade 2 x 2, ações no rodapé fixo |

**Início de campo.** No celular, o almoxarife não vê o painel completo. Ao entrar, ele encontra o botão **Ler QR** grande no topo e, logo abaixo, as tarefas do dia em cartões com contagem e ação direta, como "Receber 1 remessa", "Inspecionar 2 fardos", "Guardar 3 fardos" e "Separar RME-2026-0012". O painel completo continua acessível pelo menu. Implementar como uma variação do `Dashboard` escolhida por perfil e largura de tela (`useTelaPequena()`), não como rota separada.

**Regras das telas de campo**
- Ação principal sempre no **rodapé fixo**, ao alcance do polegar; nada importante só no topo da tela.
- Alvos de toque de no mínimo 48 px nas telas de campo (acima dos 44 px do resto do sistema), com espaço entre botões para uso com luva.
- Texto mínimo de 16 px e IDs em 18 px ou mais, legíveis sob sol; contraste alto, sem cinza claro sobre branco em informação importante.
- Leitura contínua: depois de cada leitura, a câmera continua aberta, com vibração curta e som opcional de confirmação, e o último item lido aparece em destaque por 2 segundos.
- Erros de leitura em linguagem direta ("Este fardo não é desta remessa") com a ação para resolver na mesma tela.
- Nenhuma tabela larga: no celular, tudo vira cartão ou lista de uma coluna.
- Sem digitação obrigatória quando houver QR; digitar fica como alternativa.
- Rede instável: manter o que já foi lido no estado da tela se uma chamada falhar, com botão **Tentar de novo**, sem perder as leituras (offline completo continua fora do escopo).
- Navegação inferior no celular para o almoxarife, com quatro itens fixos (Início, Ler QR, Estoque, RME); o menu completo continua na gaveta.

**Como testar.** Toda tela de campo é testada num celular real, pelo endereço HTTPS, com a câmera traseira e etiquetas impressas, além do modo de dispositivo do navegador. O roteiro de demonstração (seção 16) é feito do início ao fim no celular.

---

## 12. Escalabilidade

- **Camada de serviços como fronteira**: nenhuma tela conhece HTTP; trocar mock por API real é configuração. Integrações futuras (portal real do fornecedor, Inspector, Sinaflor) entram como serviços novos com a mesma interface.
- **Domínio centralizado**: IDs (`identificacao.ts`), rótulos e cores (`rotulos.ts`), opções (`opcoes.ts`), permissões (`permissoes.ts`) e parâmetros ficam em `src/dominio/`. Mudar o formato do ID ou acrescentar uma situação é editar um arquivo.
- **Telas por configuração**: nova tela = uma linha em `ROTAS`; novo módulo de menu = um grupo em `GRUPOS_MENU`.
- **Permissões granulares** (nomes provisórios): `admin`, `cadastros:editar`, `contratos:editar`, `simulador:usar`, `recebimento:registrar`, `dof:declarar`, `inspecao:operar`, `estoque:movimentar`, `rme:abrir`, `rme:separar`, `painel:gestao`. Perfil = conjunto de permissões, não regra no código.
- **Modo demonstração** como parâmetro: o Simulador e os botões "Simular" somem quando desligado, sem remover código.
- **Pontos de extensão já previstos** (não implementar agora): etiqueta de contingência no `LeitorQr` (ID não encontrado → gerar), inventário por leitura de QR, RFID como outra fonte para `lerCodigo()`.

---

## 13. Etapas de implementação

Cada etapa: build sem erros, `CHANGELOG.md` atualizado, `CLAUDE.md` atualizado quando aplicável, um commit com mensagem clara. Não pular etapas: cada uma depende das anteriores.

### Etapa 0 · Preparação
- Branch `v2-qrcode`. Mover `docs/PRD.md` para `docs/arquivo/PRD-v1.md`. Salvar `docs/ESPECIFICACAO-FUNCIONAL.md` e este plano em `docs/PLANO-V2.md`.
- Atualizar o topo do `CLAUDE.md`: fonte de verdade passa a ser a especificação v2 + este plano.
- Pronto quando: documentação no lugar, build ainda passa.

### Etapa 1 · Fundação visual e casca
- `styles/tokens.css` e ajuste de `styles.css` para os tokens.
- Componentes: `CabecalhoPagina`, `CabecalhoObjeto`, `FatoChave`, `AbasSecao`, `AbasSituacao`, `BarraFiltros` (extraída do `ListPage`), `CartaoIndicador`, `Relacionados`, `IdCodigo`, `BarraProgresso`, `SeloDemo`; ícones novos.
- `Layout`: topo com botão Ler QR (por enquanto abre entrada manual), menu com `GRUPOS_MENU` v2, navegação inferior do almoxarife no celular e `useTelaPequena()`.
- Rodapé fixo de ações para telas de campo (`RodapeAcoes`), seguindo a seção 11.1.
- Pronto quando: telas atuais continuam funcionando com a nova casca; um exemplo de cada padrão (lista e objeto) usa os componentes novos.

### Etapa 2 · Domínio, modelo e serviços
- `identificacao.ts` com testes manuais documentados (exemplos válidos e inválidos no comentário).
- `models.ts` v2, `rotulos.ts`, `opcoes.ts`, `permissoes.ts`, `parametros.ts`.
- `contracts.ts`, `endpoints.ts`, `real/index.ts` v2; mock reescrito com os módulos de regra e o `data.ts` da história de demonstração (seção 15).
- Remover páginas, componentes e serviços marcados como "Remover" na seção 2; rotas antigas saem de `ROTAS`. Telas que ainda não existem na v2 ficam como página "Em construção" para o build passar.
- Reescrever a seção de regras de domínio do `CLAUDE.md`.
- Pronto quando: build passa, mock gera a história completa e consistente (invariantes da seção 5.4).

### Etapa 3 · Cadastros e Contratos
- Cadastros (5 abas), Página do fornecedor, Contratos (lista, `ContratoModal`, página do contrato).
- Pronto quando: é possível criar fornecedor, espécie, tamanho, tratamento, local e um contrato com itens (inclusive em m³ convertido).

### Etapa 4 · QR code: ficha, leitor, simulador e etiquetas
- Dependências `qrcode` e `jsqr`; `LeitorQr`; `EtiquetaQr`; rotas `/d/:id` e `/f/:id`.
- Ficha do dormente completa (lê do mock todos os vínculos).
- Simulador (assistente + lista de remessas) e folha de etiquetas com CSS de impressão.
- Busca global e `CodigoLink` reconhecendo IDs v2.
- Pronto quando: gerar uma remessa, imprimir, apontar a câmera do celular (via HTTPS) e abrir a ficha.

### Etapa 5 · Recebimento, NF e DOF
- Lista de recebimentos com "A caminho", assistente de recebimento com leitura contínua dos fardos, página do recebimento, tela NF e DOF com declaração.
- Pronto quando: a remessa gerada no simulador é recebida lendo os QR dos fardos e os dormentes passam a "aguardando inspeção".

### Etapa 6 · Inspeção
- Fila, tela de inspeção do fardo, simulação, registro manual, conclusão com guarda e segregação.
- Pronto quando: fardo inspecionado fica em estoque no local escolhido, reprovados segregados, ficha do dormente mostra a inspeção.

### Etapa 7 · Estoque, fardo, locais e movimentações
- Estoque (por item e por fardo), página do fardo, Locais (mapa e lista, QR dos locais), Movimentações, transferência por leitura.
- Pronto quando: transferir um fardo lendo o QR do fardo e do local atualiza estoque, local, movimentações e a ficha dos dormentes.

### Etapa 8 · Saídas (RME)
- Lista, nova RME, separação com sugestão e leitura, entrega, cancelamento, página da RME.
- Pronto quando: uma RME entregue baixa os dormentes certos, o fardo fica aberto com o saldo restante e a ficha mostra o destino.

### Etapa 9 · Painel e alertas
- Indicadores por perfil, "Para fazer agora", gráfico de estoque por item com mínimo e máximo, entregas dos contratos, alertas (DOF, falta/excesso, idade). "Início de campo" do almoxarife no celular (seção 11.1).
- Pronto quando: todo número leva à lista filtrada e cada perfil vê só o que lhe cabe.

### Etapa 10 · Acabamento e demonstração
- Revisão de responsividade (360 px), acessibilidade, estados vazios e de erro em todas as telas.
- Configurações (parâmetros, níveis, modo demonstração) e Usuários.
- Roteiro de demonstração (seção 16) executado do início ao fim no celular e no computador.
- `CLAUDE.md` e `CHANGELOG.md` finais; abrir PR no fork.

---

## 14. Checklist de qualidade (rodar ao fim de cada etapa)

- [ ] `npm run build` sem erros nem avisos de tipo
- [ ] Nenhuma regra de negócio dentro de página (está no serviço ou em `src/dominio/`)
- [ ] Todo ID exibido é link (`CodigoLink`) e em fonte mono
- [ ] Busca, filtros, abas e visão estão no endereço
- [ ] Estados carregando, vazio e erro testados (`?simular=erro`, `?simular=vazio`)
- [ ] Tela usável em 360 px e no desktop
- [ ] Telas de campo testadas num celular real, com câmera e etiqueta impressa (seção 11.1)
- [ ] Uma única ação principal (laranja) por tela
- [ ] Mensagem de sucesso só após a resposta do serviço, com sufixo de simulado no mock
- [ ] Permissões: perfil sem acesso não vê a tela no menu e recebe "sem permissão" pelo endereço
- [ ] `CHANGELOG.md` e, se for o caso, `CLAUDE.md` atualizados

---

## 15. Dados de demonstração (`mock/data.ts`)

Montar uma história coerente, gerada pelas regras do mock, para que todas as telas tenham conteúdo realista. Nomes de fornecedores fictícios.

- 2 fornecedores (um ativo com CTF válido, um com CTF vencendo em 20 dias), 4 espécies, 2 tamanhos (2,00 m e 2,80 m, medidas provisórias), 2 tratamentos, 8 locais (5 armazenagem, 1 inspeção, 1 segregação, 1 expedição).
- 2 atas e 3 contratos vigentes, um concluído.
- Remessas em todas as fases: 1 a caminho, 1 recebida aguardando inspeção, 1 em inspeção pela metade, várias concluídas.
- ~200 dormentes com situações variadas; ~5% reprovados; 1 fardo acima do limite de dias; 1 item abaixo do mínimo e 1 acima do máximo.
- DOFs: 1 vencido sem declaração, 1 vencendo em 1 dia, 1 em 3 dias, os demais declarados.
- RMEs: 1 aberta, 1 em separação, 1 pronta, 3 entregues (uma deixou fardo aberto), 1 cancelada.

---

## 16. Roteiro de demonstração (o que a banca vai ver)

1. Login como **administrador**: Painel com indicadores e alertas.
2. Abrir um contrato e mostrar entregas por item.
3. **Simulador do fornecedor**: gerar uma remessa e imprimir as etiquetas (já impressas e coladas em peças de madeira).
4. Login como **almoxarife** no celular: **Receber** a remessa lendo os QR dos fardos.
5. **Inspeção**: simular a inspeção do fardo, concluir e guardar lendo o QR do local.
6. Apontar a **câmera comum do celular** para um dormente: a ficha abre com origem, inspeção, local e histórico.
7. Login como **requisitante**: abrir uma RME. Como **almoxarife**: separar lendo os QR e entregar.
8. Voltar à ficha do mesmo dormente: agora mostra a saída e o destino. Fechar no Painel com o estoque atualizado.

---

## 17. Perguntas em aberto (não bloqueiam o início)

| Pergunta | Valor provisório no protótipo |
| --- | --- |
| Formato oficial de ata e contrato | `AA00000` e `AA00000-00`, como na plaquinha atual |
| Localização vai até a área ou até a posição do fardo? | Local = área com código (ex. A-03); posição fica para depois |
| Mínimo e máximo por item | Valores fictícios nos dados de demonstração |
| Limite de dias em estoque | 120 dias |
| Quantos dormentes por fardo o fornecedor monta | Parâmetro, padrão 14 |
| Tamanho final do QR na plaquinha | QR na plaquinha do contrato (a menor), a validar com a CPTM |
| Quem abre a RME na prática | Perfil requisitante |
