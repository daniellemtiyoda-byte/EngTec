# Plano de desenvolvimento · Holz Trilho v2 (rastreabilidade de dormentes por QR code)

Documento para orientar o Claude Code na reestruturação do front-end. Ele diz **o que construir, em que ordem, com quais padrões e como tudo se conecta**. A regra de negócio vem de `docs/ESPECIFICACAO-FUNCIONAL.md` (exportada do documento de especificação); este plano traduz essa especificação em arquitetura, telas e etapas.

---

## 0. Como usar este plano

1. Leia este arquivo inteiro e `docs/ESPECIFICACAO-FUNCIONAL.md` antes de escrever código.
2. Trabalhe na branch `v2-qrcode` (o fluxo de fork do `CLAUDE.md` continua valendo; nada vai para `upstream`).
3. Siga as **etapas da seção 13 na ordem, uma por vez**, e só avance para a próxima quando a Dani pedir. Cada etapa termina com `npm run build` sem erros, os testes passando (a partir da Etapa 2), uma entrada no `CHANGELOG.md` e um commit.
4. Ao fim de cada etapa, atualize o `CLAUDE.md` com o que mudou (arquitetura, rotas, regras de domínio); regras que deixarem de valer saem do arquivo.
5. **A especificação funcional v2 e este plano são a fonte de verdade** e substituem o PRD da v1, arquivado em `docs/arquivo/PRD-v1.md`. Em conflito, a especificação manda na regra de negócio e o plano na implementação.
6. Em dúvida sobre uma regra de negócio, pergunte antes de inventar. Em dúvida sobre interface, siga os padrões da seção 8.
7. Escopo é **só front-end**. Os dados ficam no mock (`services/mock/`) até a etapa do Supabase (Etapa 9), que cria o banco e a implementação `services/supabase/`. Não há back-end próprio.
8. É um protótipo que nunca terá dados reais: **não há banner de "modo simulado", selo de "dados simulados" nem sufixo nos toasts**. O único aviso de demonstração é o do Simulador do fornecedor (exigido pela especificação).

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
| NF e DOF | Cadastradas **antes da chegada** (XML da NF ou digitada, mais a DOF) na tela NF e DOF, o que cria a **entrega "A caminho"**; no recebimento, o almoxarife escolhe a entrega e lê os fardos. Cadastrar NF e DOF na hora do recebimento é exceção. No protótipo, o Simulador gera a entrega já com NF e DOF |
| Fardos | Chegam montados pelo fornecedor; na inspeção são abertos, os reprovados saem e o fardo é fechado de novo |
| Inspeção | Sistema externo, peça a peça, grava no banco compartilhado; no protótipo é simulada. Resultado só **aprovado** ou **reprovado** (o ATENÇÃO do Inspector conta como reprovado) e **categoria 1, 2 ou 3** pelos limites 80 e 50 do índice, ambos **provisórios**, a confirmar com o time da inspeção |
| Faltas | Fardo não lido no recebimento continua em trânsito e pode ser recebido depois; dormente não lido na inspeção fica **não localizado** (conclusão com justificativa) |
| Reprovados | Ficam segregados; a devolução ao fornecedor fica fora do protótipo. O contrato é cumprido por aprovados, então o fornecedor pode enviar reposição |
| Lote | **Deixa de existir** como conceito de tela. Agrupamento = contrato + fardo |
| Saída | Por requisição (RME): aberta → em separação → pronta → entregue (ou cancelada) |
| Login | Simulado (perfil escolhido pelo nome do usuário) até a etapa do Supabase; lá entra o **Supabase Auth** (e-mail e senha), com o perfil numa tabela `perfis` e a sessão guardada no aparelho (para o QR abrir a ficha sem novo login). A autenticação é um serviço separado da camada de dados desde a Etapa 1 |
| Banco | **Supabase**, numa etapa própria (Etapa 9) junto com o login: SQL em `supabase/migrations/`, executado pela Dani no editor SQL. Não há back-end próprio: `services/real/` (HTTP) sai nessa etapa |
| Hospedagem | **Vercel**, com HTTPS (a câmera exige); a URL da Vercel é o `VITE_APP_URL` gravado nos QR |
| Ponto de partida | Código antigo de domínio, telas e mock **foi removido** na Etapa 0; só a infraestrutura reaproveitável ficou |
| Fora do protótipo | Etiqueta de contingência, devolução dos reprovados ao fornecedor, ajustes de quantidade (o inventário trata dormente a dormente), visão computacional, offline, RFID, Sinaflor automático |

---

## 2. Ponto de partida: o que ficou da v1 depois da Etapa 0

A arquitetura da v1 foi aproveitada: camada de serviços com contrato único (`services/contracts.ts`), `ROTAS` como lista única de telas, componentes genéricos e dicionário do domínio em `src/dominio/`. O domínio da v1 (lote, formação de fardos, quarentena, conferência em duas pessoas, perda e ajuste, inventário, visão computacional, relatórios IBAMA) foi removido na Etapa 0. O app abre numa tela "Em construção".

| Item | Situação após a Etapa 0 | Próximo passo |
| --- | --- | --- |
| `services/http.ts`, `real/index.ts` | `real/` virou stub na Etapa 2 (sem back-end próprio) e `endpoints.ts` saiu | Saíram na Etapa 9 (Supabase); `ApiError` e `mensagemSegura` estão em `services/erros.ts` |
| `services/index.ts`, `contracts.ts`, `mock/index.ts`, `mock/util.ts`, `mock/data.ts` | Só com `auth` e o usuário de demonstração | Etapa 1: autenticação vira serviço separado; Etapa 2: serviços v2, regras e história de demonstração |
| `config/env.ts` | Mantido | Etapa 4: `VITE_APP_URL`; Etapa 9: variáveis do Supabase |
| `types/models.ts` | Só `Origem`, `Paginado`, `ListQuery`, `Usuario` | Etapa 2: modelo v2 (seção 5) |
| `dominio/rotulos.ts`, `opcoes.ts`, `permissoes.ts` | Só tipos, `opcoesDe()` e `admin` | Etapa 1: permissões e perfis; Etapa 2: situações e `identificacao.ts`, `parametros.ts` |
| `components/` genéricos: `ListPage`, `FormModal`, `FormLinha`, `Modal`, `Passos`, `Contador`, `LinhaTempo`, `Etapas`, `PainelAbas`, `Toast`, `ErroTela`, `Estados`, `Badge`, `MenuAcoes`, `Codigos`, `UploadModal`, `Logo`, `Icone`, `Layout` | Mantidos (`LinhaTempo` recebe eventos genéricos) | Etapa 1: `ListPage` com `AbasSituacao` e `BarraFiltros`, `Layout` v2 |
| `utils/format.ts`, `utils/nfeXml.ts`, `hooks/useAsync.ts`, `contexts/AuthContext.tsx`, `pages/Login.tsx` | Mantidos | `utils/busca.ts` reconhece IDs v2 na Etapa 4 |
| Modais da v1 de NF, recebimento, DOF, separação, RME e Inspector | Removidos; continuam em `main` e na branch `backup/v1` | Servem de base nas Etapas 5, 6 e 8 (`git show main:src/components/NfModal.tsx`) |
| Novas telas | — | `Contratos`, `ContratoDetalhe`, `Simulador`, `EtiquetasImpressao`, `Recebimentos`, `RecebimentoDetalhe`, `Documentos`, `Inspecao`, `InspecaoFardo`, `Estoque`, `FardoDetalhe`, `FichaDormente`, `Locais`, `LocalDetalhe`, `Movimentacoes`, `Saidas`, `SaidaDetalhe`, `Cadastros`, `FornecedorDetalhe`, `Usuarios`, `Configuracoes`, `Painel`, `Vitrine`, e o componente global `LeitorQr` |

---

## 3. Arquitetura da informação

### 3.1 Princípio

O menu segue a **jornada do dormente** (contrato → NF e DOF → recebimento → inspeção → estoque → saída), e cada objeto do negócio (contrato, fardo, dormente, recebimento, saída, fornecedor) tem **uma página própria** que funciona como ponto de encontro de tudo que se relaciona com ele. Listas servem para encontrar; páginas de objeto servem para entender e agir.

### 3.2 Menu (grupos e itens)

`GRUPOS_MENU = ['Início', 'Suprimento', 'Entrada', 'Estoque', 'Saída', 'Cadastros']`

| Grupo | Item do menu | Rota | Perfis |
| --- | --- | --- | --- |
| Início | Painel | `/` | Todos |
| Início | Relatórios (seção IBAMA) | `/relatorios` | Administrador, Almoxarife, Gestor (Etapa 10) |
| Suprimento | Contratos | `/contratos` | Administrador, Almoxarife, Gestor |
| Suprimento | Simulador do fornecedor (selo "Demo") | `/simulador` | Administrador, Almoxarife |
| Entrada | NF e DOF | `/documentos` | Administrador, Almoxarife, Gestor |
| Entrada | Recebimentos | `/recebimentos` | Administrador, Almoxarife, Gestor |
| Entrada | Inspeção | `/inspecao` | Administrador, Almoxarife, Gestor |
| Estoque | Estoque | `/estoque` | Todos (requisitante só a visão por item) |
| Estoque | Locais | `/locais` | Administrador, Almoxarife, Gestor |
| Estoque | Movimentações | `/movimentacoes` | Administrador, Almoxarife, Gestor |
| Estoque | Inventário | `/inventarios` | Administrador, Almoxarife (abre, lê e fecha), Gestor (vê o resultado) |
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
| `/locais/:codigo` | Página do local | Destino do QR do local; `codigo` = `A03` (ID `LOC-A03`) |
| `/vitrine` | Vitrine de componentes | Interna, só administrador, dados fixos; valida os padrões de lista e de objeto |
| `/simulador/etiquetas/:entrega` | Folha de impressão de etiquetas | Sem o Layout (só a folha), com CSS de impressão |
| `/login` | Login | Guarda o destino (ex. `/d/...`) e volta para ele após entrar |

### 3.4 Elementos globais (em toda tela)

- **Topo**: logo, busca global, botão **Ler QR** (ícone + texto no desktop, botão flutuante no celular), sino de alertas, usuário.
- **Busca global** reconhece IDs v2 e leva direto ao objeto: dormente → `/d/`, fardo → `/f/`, contrato → `/contratos/`, RME → `/saidas/`, local → `/locais/`, NF → `/documentos?q=`. Texto livre pesquisa fardos e contratos.
- **Sem avisos de dados simulados** (banner, selo ou sufixo): o protótipo nunca terá dados reais.
- **Menu lateral** recolhível por um ícone discreto no topo, ao lado do logo (sem botão no rodapé).

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
NF e DOF ──► Entrega "A caminho" ──► Recebimento
Contratos ──► Contrato ──► Fornecedor
                 ├──► Fardos (/f/) ──► Dormentes (/d/)
                 ├──► Entregas (NF e DOF) ──► Recebimentos
                 └──► Simulador (gerar entrega deste contrato)
Recebimentos ──► Recebimento ──► Fardos recebidos ──► Inspeção do fardo
Inspeção ──► Inspeção do fardo ──► Fardo (após concluir)
Estoque ──► por item ──► fardos do item ──► Fardo ──► Dormente
Locais ──► Local (/locais/) ──► fardos no local ──► Fardo
RME ──► Requisição ──► fardos/dormentes separados ──► Dormente
Ficha do dormente ──► Fardo, Local, Contrato, Fornecedor, NF, DOF, Recebimento, Inspeção, RME
```

---

## 5. Modelo de dados (TypeScript, `src/types/models.ts`)

Reescrever o arquivo. Manter `Paginado<T>`, `ListQuery`, `Origem`, `Usuario`. Todo registro que muda de estado guarda `quem` e `quando` (`criadoPor`, `criadoEm`), e toda operação que muda o estado registra um **Evento** (histórico e auditoria, tabela própria).

### 5.1 Identificação (`src/dominio/identificacao.ts`, novo)

```ts
export const RE_CONTRATO = /^[A-Z]{2}\d{5}-\d{2}$/;           // AR00224-01
export const RE_DORMENTE = /^([A-Z]{2}\d{5}-\d{2})-(\d{6})$/;  // AR00224-01-000357
export const RE_FARDO    = /^([A-Z]{2}\d{5}-\d{2})-F(\d{3})$/; // AR00224-01-F012
export const RE_RME      = /^RME-\d{4}-\d{4}$/;                 // RME-2026-0012
export const RE_LOCAL    = /^LOC-([A-Z0-9]+(?:-[A-Z0-9]+)*)$/;  // LOC-A03 (código do local: A03)

export function idDormente(contrato: string, seq: number): string; // zero-padding 6
export function idFardo(contrato: string, seq: number): string;    // zero-padding 3
export function lerCodigo(texto: string): { tipo: 'dormente' | 'fardo' | 'contrato' | 'rme' | 'local'; id: string } | null;
// lerCodigo aceita o ID puro ou o link completo do QR (extrai o ID do final de /#/d/<id>, /#/f/<id> ou /#/locais/<código>)
export function linkQr(tipo: 'dormente' | 'fardo' | 'local', id: string): string; // usa VITE_APP_URL
// local: ID LOC-A03, link <APP_URL>/#/locais/A03
```

Formatos de ata e contrato são provisórios (ver perguntas em aberto); toda validação passa por estas funções, nunca regex espalhada pelas telas. `identificacao.ts` tem testes no Vitest (`identificacao.test.ts`) com exemplos válidos e inválidos de cada formato.

### 5.2 Cadastros

```ts
interface Fornecedor { id; razaoSocial; cnpj; cidadeUf; ctfIbama: string; ctfValidade: string;
  situacao: 'ativo' | 'inativo' /* manual */; bloqueado: boolean /* calculado: CTF vencido pela validade */;
  especiesIds: string[]; certificados: Anexo[] }
interface Especie { id; nomeCientifico; nomePopular; ativo: boolean }   // a classe não é da espécie: é do fardo e do dormente
// Tamanho = item de compra da CPTM, pelo código de material (006234 = 2,80 m). Todos com 240 × 170 mm.
interface Tamanho { id; codigo /* 6 dígitos */; uso: 'via_corrente' | 'amv'; comprimentoCm; larguraCm; alturaCm; volumeM3 /* calculado */; medidas: 'provisorio' | 'confirmado' }
interface Tratamento { id; preservativo: string /* CCA */; empresa: string }
interface EmpresaInspetora { id; nome /* IPT, UFV (acreditadas pelo INMETRO) */; cnpj?: string; ativo: boolean }   // vem do Boletim de Inspeção
interface Local { id; codigo /* A03; ID do QR = LOC-A03 */; descricao; tipo: 'armazenagem' | 'inspecao' | 'segregacao' | 'expedicao'; capacidade: number /* dormentes */; ocupacao /* calculada */; ativo: boolean }
interface NivelEstoque { classe: 1 | 2; tamanhoId; minimo: number; maximo: number }   // em Configurações (por classe e tamanho)
interface Anexo { id; nome; tipo: 'pdf' | 'xml' | 'imagem'; url; enviadoEm; enviadoPor }
```

### 5.3 Suprimento

```ts
// Conforme os documentos reais da CPTM (Ata AR00224 e contratos AR00224-01, -02 e -03): não existe AF; cada pedido é um contrato sob a ata.
interface RegrasAta { pedidoMinimo /* 6.000 */; maxParcelas /* 6 */; parcelaMinima /* 3.000 */; parcelaMaxima /* 6.000 */;
  prazosParcelas: [de, ate][] /* dias da assinatura: [0,90], [91,120], [121,150], [151,180], [181,210], [211,240] */ }
interface Ata { id; numero /* AR00224 */; fornecedorId; vigenciaInicio; vigenciaFim /* padrão: 12 meses */; regras: RegrasAta /* padrão REGRAS_ATA_PADRAO */;
  itens: { tamanhoId; quantidade /* registrada */; contratado; saldo /* calculados */ }[]; vigente /* calculado */ }
interface Contrato { id; numero /* AR00224-01 */; ataId /* o fornecedor vem da ata */; ano: number; dataAssinatura; gestor;
  situacao: 'vigente' | 'concluido' | 'cancelado'; itens: ItemContrato[]; parcelas: ParcelaContrato[]; criadoEm; criadoPor;
  parcelasAtrasadas /* calculado */; recebimentoDefinitivoEm? /* calculado: 15 dias após o laudo da última entrega */ }
interface ParcelaContrato { numero; itens: { tamanhoId; quantidade }[];
  // calculados: janela pela assinatura e pelas regras da ata; recebidos nas entregas da parcela; situação
  quantidade; inicio; fim; recebidos; entregueEm?; situacao: 'a_entregar' | 'atrasada' | 'entregue' | 'entregue_com_atraso'; diasAtraso }
// Item do contrato = tamanho. O contrato não define espécie, classe nem tratamento.
interface ItemContrato { id; tamanhoId; quantidade: number /* unidades, soma das parcelas */;
  // calculados pelo serviço:
  emitidos: number; recebidos: number; aprovados: number; reprovados: number;
  saldoAEmitir: number /* = quantidade - (emitidos - reprovados) */ }
```

O contrato é cumprido por dormentes **aprovados**: o fornecedor pode emitir reposição dos reprovados, e o limite de emissão é `emitidos - reprovados <= quantidade`.

**Regras da ata (validadas no serviço).** Total do contrato no mínimo o pedido mínimo; de 1 ao máximo de parcelas; cada parcela, somando os tamanhos, entre a mínima e a máxima; com quantidades registradas na ata, cada tamanho dentro do saldo dela; assinatura dentro da vigência; fornecedor liberado. A parcela fica **atrasada** quando passa do fim da janela sem que os recebidos alcancem a quantidade; **entregue com atraso** quando alcançam depois. Toda entrega (NF e DOF, Simulador) é vinculada a uma parcela.

### 5.4 Fardo e dormente (dois níveis)

```ts
type SituacaoFardo = 'em_transito' | 'aguardando_inspecao' | 'em_inspecao' | 'em_estoque' | 'baixado';
// O fardo aberto (algum dormente já saiu numa RME) continua em estoque: `aberto: boolean` é calculado e aparece como
// selo secundário "Aberto" ao lado de "Em estoque".
interface Fardo { id /* AR00224-01-F012 */; contratoId; itemContratoId /* = tamanho */; entregaId?: string /* definida ao entrar numa entrega */; quantidadeInicial: number;
  especieId; classe: 1 | 2; tratamentoId /* informados pelo fornecedor: Boletim de Inspeção e plaquinha */;
  usinaTratamento; dataTratamento /* marcação exigida: usina e mês/ano de impregnação; conta a cura */;
  reservados; emCuraAte? /* calculados: CCA ou CCB, 15 dias do tratamento */;
  reprovacao?: { dormentesIds; comunicarAte /* 5 dias úteis */; retirarAte /* 15 dias úteis */; comunicadoEm?; retiradoEm? };
  saldo: number /* calculado: saldo físico = dormentes em_estoque + reservado */;
  disponivel: number /* calculado: dormentes em_estoque (livres para nova saída) */;
  localId?: string; situacao: SituacaoFardo;
  conclusaoInspecao?: { quando; quem; justificativa? /* obrigatória com não localizados */; naoLocalizados: string[] };
  recebidoEm?: string; idadeDias?: number /* calculado */ }

type SituacaoDormente = 'emitido' | 'aguardando_inspecao' | 'em_estoque' | 'reservado' | 'baixado' | 'reprovado' | 'retirado' | 'nao_localizado' | 'perdido';
interface Dormente { id /* AR00224-01-000357 */; contratoId; itemContratoId; fardoId: string; especieId; classe; tratamentoId; usinaTratamento; dataTratamento /* do próprio dormente */;
  situacao: SituacaoDormente; categoria?: number; medidas?: { comprimentoCm; larguraCm; alturaCm };
  inspecaoId?: string; rmeNumero?: string }

// Histórico e auditoria: uma tabela só de inclusão. As linhas do tempo da ficha, do fardo, do contrato e da RME vêm dela.
interface Evento { id; tipo: 'criado' | 'alterado' | 'inativado' | 'reativado' | 'cancelado' | 'emitido' | 'recebido' | 'inspecionado'
  | 'guardado' | 'transferido' | 'reservado' | 'baixado' | 'segregado' | 'nao_localizado' | 'ocorrencia' | 'declarado' | 'laudo'
  | 'comunicado' | 'retirado' | 'lancado' | 'informado';
  entidade: 'fardo' | 'dormente' | 'contrato' | 'ata' | 'entrega' | 'rme' | 'fornecedor' | 'cadastro' | 'local' | 'parametros' | 'usuario' | 'saldo_dof';
  entidadeId; descricao: string; referencia?: string; quem; quando }
```

Invariantes (garantidas no serviço, nunca na tela):
- `fardo.saldo` (saldo físico) é sempre o número de dormentes `em_estoque` + `reservado` daquele fardo, que ainda estão fisicamente nele; `fardo.disponivel` é só os `em_estoque`. Sugestão e separação de RME usam o disponível.
- Um dormente pertence a exatamente um fardo; reprovado sai do fardo (`fardoId` mantido como origem, situação `reprovado`, local de segregação).
- Dormente não lido quando o fardo é concluído na inspeção fica `nao_localizado` (fora do saldo); se for encontrado, é inspecionado e segue o fluxo normal.
- Fardo esperado e não lido no recebimento continua `em_transito` e pode ser recebido depois.
- Um ID nunca é reaproveitado nem apagado.
- Os invariantes têm testes no Vitest sobre as regras do mock (`mock/*.test.ts`).

### 5.5 Entrada

```ts
// Entrega: o que o fornecedor envia de uma vez (uma NF, uma DOF e os seus fardos). Nasce "a caminho" no
// cadastro de NF e DOF (ou no Simulador) e é consumida pelo Recebimento.
interface Entrega { id; contratoId; nfId; dofId; fardosIds: string[] /* esperados; pode começar vazia */;
  situacao: 'a_caminho' | 'recebida_parcial' | 'recebida'; origem: 'cadastro' | 'simulador' | 'recebimento';
  criadoEm; criadoPor }
interface NotaFiscal { id; numero; chaveAcesso; fornecedorId; contratoId; emissao; entregaId; xml?: Anexo;
  itens: { itemContratoId; quantidade: number; volumeM3: number }[] }
interface Dof { id; numero; nfId; validade: string; volumes: { especieId; volumeM3 }[]; pdf?: Anexo;
  declarado?: { quando; quem }; prazoDeclaracao /* calculado: dia seguinte à validade */;
  nivelPrazo: 'ok' | 'atencao' | 'critico' | 'vencido' /* calculado */ }
interface Recebimento { id; entregaId; nfId; dofId; recebidoEm; recebidoPor; fardosEsperados: string[]; fardosLidos: string[];
  conforme: boolean; ocorrencias: { tipo: 'avaria' | 'falta' | 'sobra' | 'fardo_desconhecido'; descricao; fardoId?;
    quantidade? /* falta declarada: dormentes que faltam no fardo lido */; fotos: Anexo[] }[];
  divergenciaVolume: { especieId; documentalM3; nominalM3; medidoM3?; base: 'nominal' | 'medido'; percentual; acimaTolerancia: boolean }[];
  localEsperaId: string }
// Fardo ganha `emissaoId` (emissão do fornecedor) e `faltaDeclarada` (dormentes que faltavam, declarados no recebimento).
// Emissão do fornecedor (no protótipo, o Simulador): os fardos com QR e a NF e a DOF que acompanham o material.
interface Emissao { id; contratoId; fardosIds: string[]; nf: { numero; serie; chaveAcesso; emissao; itens };
  dof: { numero; validade; volumes }; comDocumentos: boolean; entregaId? /* ligada pela chave de acesso */;
  situacao: 'aguardando_documentos' | 'a_caminho' | 'recebida_parcial' | 'recebida' /* calculado */ }
interface Inspecao { id; dormenteId; fardoId; resultado: 'aprovado' | 'reprovado'; categoria?: 1 | 2 | 3;
  indice?: number /* 0 a 100, vindo do Inspector */; veredito?: 'APROVADO' | 'ATENCAO' | 'REJEITADO' /* original do Inspector */;
  medidas: { comprimentoCm; larguraCm; alturaCm }; inspetor; inspecionadoEm; origem: 'inspector' | 'simulado' | 'manual';
  relatorioUrl?: string }
```

**Entrega e fardos esperados.** No cadastro de NF e DOF, o usuário pode indicar quais fardos vêm na entrega (fardos já emitidos do contrato, em trânsito e sem entrega). Se não indicar, a entrega começa sem fardos esperados e, no recebimento, todo fardo lido que seja do mesmo contrato, emitido e sem entrega passa a fazer parte dela; fardo de outro contrato, de outra entrega ou com ID inexistente vira ocorrência "fardo desconhecido". A entrega fica `recebida_parcial` enquanto houver fardo esperado dela ainda em trânsito (falta no recebimento). Regra **provisória** (o fornecedor real ainda não informa os fardos da NF ao sistema). Fardos e dormentes sempre existem antes da leitura: são emitidos pelo fornecedor (no protótipo, pelo Simulador).

**Volume nominal e medido.** O volume da DOF é digitado do documento, nunca copiado da NF. A comparação por espécie usa o **volume nominal** (dormentes recebidos × volume do tamanho, descontada a falta de dormentes declarada no recebimento) até a inspeção; quando todos os fardos recebidos da espécie têm a inspeção concluída, passa a usar o **volume medido** (soma das medidas reais dos aprovados e reprovados; dormente lançado à mão sem medidas conta pelo volume do tamanho e a tela mostra quantos, ex. "inclui 3 estimados"). A divergência oficial é a do medido; antes dela, a tela marca a diferença como provisória.

**Falta de dormentes.** Ocorrência de falta declarada num fardo lido informa a quantidade de dormentes que faltam; ela sai do recebido do item e do volume nominal, e entra na justificativa automática quando explica a divergência. Na conclusão da inspeção, os não lidos que cabem nessa falta já têm justificativa (a do sistema, se a pessoa não escrever outra).

Regras **provisórias**, a confirmar com o time da inspeção (ficam em `dominio/parametros.ts` e nos parâmetros, nunca espalhadas): veredito APROVADO → `aprovado`; ATENÇÃO e REJEITADO → `reprovado`. Categoria pelo índice: ≥ 80 → 1, ≥ 50 → 2, abaixo → 3 (limites `limitesCategoria`). Vale a inspeção mais recente do dormente.

**Documentos e recebimento em duas fases.** Além de NF (XML) e DOF, a entrega aceita o **Boletim de Inspeção** (número, data, empresa inspetora acreditada pelo INMETRO e, por tamanho, espécies e quantidades aprovadas) e o **Relatório Técnico** do lote, como anexos. O recebimento é **provisório** na chegada (leitura dos fardos e canhoto da NF assinado, foto opcional); o **Laudo Técnico** de aprovação é emitido depois da inspeção de toda a entrega, com prazo de **20 dias úteis** da entrega; o **recebimento definitivo** do contrato acontece 15 dias após o laudo da última entrega. Etapas da entrega: a caminho → aguardando inspeção → **aguardando laudo** → concluída.

**Reprovados.** Ao concluir a inspeção do fardo, o sistema registra a comunicação ao fornecedor (a enviar em até 5 dias úteis) e o prazo de retirada (15 dias úteis); retirados, os dormentes ficam **"retirado pelo fornecedor"** (movimentação `retirada`). Uma **reentrega** (reposição de reprovados, marcada no cadastro da entrega) só é aceita depois da retirada dos reprovados do contrato.

**Garantia.** 5 anos a partir da entrega (recebimento do fardo), mostrada na ficha do dormente.

**Regras técnicas dos dormentes de madeira** (referência: PIM-14 do DNIT e NBR 7511; a Especificação Técnica CPTM AD1956-4 prevalece quando for obtida):
- **Marcação já exigida:** cada dormente já sai do fornecedor marcado (gravação a fogo ou chapa metálica) com a usina de tratamento e o mês e ano de impregnação. A proposta do sistema **acrescenta o código QR** a essa marcação; ela não a substitui. Fardo e dormente guardam a **usina de tratamento** e a **data de tratamento** (a marcação mostra mês e ano; o dia conta a cura), e a ficha do dormente mostra os dois.
- **Classe** (1ª ou 2ª, NBR 7511): vem do laudo / Boletim de Inspeção de cada lote, **nunca de uma tabela fixa por espécie** (as fontes divergem).
- **Cura:** dormentes tratados com **CCA ou CCB** só ficam disponíveis para separação **15 dias após a data de tratamento**. Antes disso aparecem "em cura" no estoque, com a data de liberação; não entram na sugestão nem na separação.
- **Classe pelo destino da RME:** o requisitante informa o tipo de destino (linha principal de tráfego pesado, linha principal de tráfego médio, desvio ou pátio). O sistema sugere a classe mínima (**1ª para tráfego pesado; 2ª aceita nos demais**) e, se a separação usar classe inferior à sugerida, avisa e pede justificativa.

**Modelo fechado (antes do Supabase).** Entidades gravadas, que viram tabelas: Usuário (perfil), Fornecedor, Espécie, Tamanho, Tratamento, Empresa inspetora, Local, Ata (com regras e itens registrados), Contrato (com itens e parcelas), Emissão do fornecedor (Simulador), Fardo (com marcação, conclusão da inspeção e reprovação), Dormente, NF (com itens), DOF (com volumes por espécie), Entrega (com boletim, relatório técnico e laudo), Recebimento (com ocorrências e canhoto), Inspeção, Movimentação, RME (com itens e separação), Evento, Destinação final, Saldo informado do DOF, Perda, Inventário (com o esperado, as leituras e o resultado), Parâmetros (com níveis de estoque e feriados) e Anexo. Tudo o mais (saldo, disponível, em cura, situação do fardo e da parcela, prazos, divergência de volume, saldo da ata, garantia) é calculado: no Supabase, views e funções.

### 5.6 Estoque e saída

```ts
// Item de estoque = classe + tamanho; a espécie é detalhe.
interface SaldoItem { id /* classe|tamanho */; classe; tamanhoId; uso; emEstoque /* disponível, fora da cura */; emCura; liberacaoCura?; aguardandoInspecao; reservado; naoLocalizado; minimo; maximo;
  situacao: 'falta' | 'ok' | 'excesso' /* calculado */; especies: { especieId; emEstoque }[] }
interface Movimentacao { id; tipo: 'guarda' | 'transferencia' | 'segregacao' | 'saida'; fardoId; dormentesIds?: string[];
  deLocalId?; paraLocalId?; quando; quem; referencia?: string }
type SituacaoRme = 'aberta' | 'em_separacao' | 'pronta' | 'entregue' | 'cancelada';
interface Rme { id; numero /* RME-2026-0012 */; solicitanteId; destino: string /* obra ou trecho */;
  tipoDestino: 'principal_pesado' | 'principal_medio' | 'desvio' | 'patio' /* sugere a classe mínima */; necessidadeEm: string;
  itens: { tamanhoId; classe /* obrigatórios */; categoriaMinima? /* padrão: qualquer aprovado */; especieId?; quantidade }[]; separacao?: { fardoId; dormentesIds: string[]; seguiuSugestao: boolean; justificativa?; justificativaClasse? /* classe abaixo da sugerida */ }[];
  situacao: SituacaoRme }

// IBAMA (IN Ibama 21/2014)
// Gerada na entrega da RME, uma por espécie: o volume a lançar como "Destinação Final" no sistema DOF (baixa o saldo virtual).
interface DestinacaoFinal { id; rmeId; rmeNumero; especieId; quantidade; volumeM3 /* medido; sem medidas, o do tamanho */; entregueEm; lancadoEm?; lancadoPor? }
// Registro periódico do saldo que aparece no sistema DOF, por espécie.
interface SaldoDofInformado { id; data; itens: { especieId; volumeM3 }[]; observacao?; quem; quando }
// Perda (art. 42): o gestor transforma o não localizado em perdido; sai do saldo físico e fica a comunicar ao IBAMA.
interface Perda { id; dormenteId; fardoId; contratoId; especieId; tamanhoId; volumeM3; motivo: 'extravio' | 'avaria' | 'incendio' | 'intemperie' | 'outro'; descricao?; quando; quem; comunicadoEm?; comunicadoPor? }
// Inventário físico por leitura de QR (art. 41): o que deveria estar em cada local, as leituras e o resultado (dormente a dormente).
interface Inventario { id; numero /* INV-2026-0001 */; locaisIds; esperados: { dormenteId; fardoId; localId }[];
  leituras: { tipo: 'fardo' | 'dormente'; id; localId; quando; quem }[]; situacao: 'aberto' | 'fechado'; abertoEm; abertoPor; fechadoEm?; fechadoPor?;
  resultado?: { porLocal: { localId; esperados; conferidos; percentual; diferencas }[]; esperados; conferidos; percentual;
    diferencas: { grupo: 'local_errado' | 'nao_encontrado' | 'inesperado'; tipo: 'fardo' | 'dormente'; id; fardoId; localId?; lidoEmId?; quantidade; motivo; justificativa? }[] } }
// Calculado: saldo físico do pátio por espécie e tamanho × último saldo informado (alerta acima de 10%, art. 41).
interface SaldoPatioEspecie { especieId; quantidade; fisicoM3; porTamanho: { tamanhoId; quantidade; volumeM3 }[]; naoLocalizados: { quantidade; volumeM3 } /* à parte */; informadoM3?; informadoEm?; diferencaPct?; acimaTolerancia }
```

O **nível de estoque** (`SaldoItem.situacao`) compara o mínimo e o máximo com o **disponível somado ao que está em cura**: item abaixo do mínimo só por causa da cura não é falta e não gera alerta de reposição. A tela mostra a parte em cura separada, com a data de liberação.

### 5.7 Parâmetros (`servicos.parametros`, editados em Configurações)

`limiteDiasEstoque` (provisório 120), `alertaDofDias` ([3, 1]), `toleranciaVolumePct` (10, regra IBAMA, só leitura), `limitesCategoria` ([80, 50], provisório), `dormentesPorFardoPadrao` (14, sugestão do simulador), `niveis: NivelEstoque[]`, `modoDemonstracao` (mostra o Simulador), `feriados: Feriado[]` (`{ data, nome, abrangencia: 'nacional' | 'estadual' | 'municipal' }`, fora dos dias úteis do prazo do laudo e da comunicação e retirada de reprovados; os dados iniciais trazem os feriados nacionais e os do estado e da cidade de São Paulo de 2026 e 2027).

---

## 6. Camada de serviços

Manter o padrão: telas importam só `servicos`; contrato em `contracts.ts`; cada implementação (mock e, na Etapa 9, Supabase) implementa a mesma interface. Ao criar uma operação, atualizar contrato e todas as implementações juntos.

**Autenticação separada da camada de dados.** Desde a Etapa 1, a autenticação é um serviço à parte (`services/auth/`: contrato `ServicoAuth` com `entrar`, `sair`, `usuarioAtual` e `aoMudarSessao`), usado só pelo `AuthContext`. As telas usam apenas `useAuth()` e `pode()`. Até a Etapa 9 a implementação é a simulada: o nome digitado escolhe o perfil (`administrador`, `almoxarife`, `gestor`, `requisitante`; qualquer senha). Na Etapa 9 entra a implementação do Supabase Auth (e-mail e senha, perfil lido da tabela `perfis`, sessão guardada no aparelho pelo padrão do `supabase-js`), sem mexer nas telas.

| Serviço | Operações principais |
| --- | --- |
| `dashboard` | `indicadores()`, `pendencias()` (por perfil), `alertas()` |
| `fornecedores`, `especies`, `tamanhos`, `tratamentos`, `empresasInspetoras`, `locais` | `listar`, `obter`, `criar`, `atualizar`, `inativar`, `reativar` (`locais.obter(codigo)` para a página do local) |
| `usuarios` | `listar`, `atualizar` (só perfil e situação; as contas são criadas no painel do Supabase) |
| `contratos` | `listar`, `obter(numero)`, `criar`, `atualizar`, `cancelar`; `atas`: `listar`, `criar` |
| `simulador` | `emitir({ contratoId, comDocumentos, itens: [{ itemContratoId, fardos, dormentesPorFardo }] })` → cria a emissão, fardos `em_transito`, dormentes `emitido` e NF e DOF de exemplo; com documentos, também a entrega `a_caminho` (como se tivesse sido cadastrada em NF e DOF); recusa acima do `saldoAEmitir`; `listar`, `etiquetas(emissaoId)`, `xmlNf(emissaoId)` |
| `recebimentos` | `listar`, `obter`, `entregasACaminho()` (inclui as parciais, com os fardos que faltam), `previa(entregaId, fardosLidos, faltas?)` (a mesma análise da confirmação, sem gravar), `receber(entregaId, dados, arquivos)` |
| `documentos` | `cadastrarEntrega({ nf, dof, fardosIds? }, arquivos)` (permissão `nf:cadastrar`: administrador e almoxarife) → cria NF, DOF e a entrega `a_caminho` (chave repetida recusada, sem DOF não cadastra); `listarEntregas`, `listarNfs`, `listarDofs`, `fardosSemEntrega(contratoId)`, `declararDof(id)`; leitura do XML no front com `utils/nfeXml.ts` |
| `inspecao` | `fila()`, `naoLocalizados()`, `obterFardo(id)`, `registrar(dormenteId, resultado)` (aceita dormente `nao_localizado` encontrado depois), `simularFardo(id)`, `concluir(fardoId, localId, justificativa?)` (justificativa do sistema quando os não lidos cabem na falta declarada) |
| `fardos` | `listar`, `obter(id)`, `transferir(id, localId)` |
| `dormentes` | `listar`, `obter(id)` (devolve a ficha completa já montada, seção 9.13) |
| `estoque` | `porItem(q)` (paginado; filtros espécie, tamanho e situação; busca pelos nomes), `porFardo(q)` (filtros espécie, tamanho, local, situação e `acimaLimite`) |
| `movimentacoes` | `listar` (filtros tipo, `periodo` em dias e `localId` de ou para) |
| `rme` | `listar`, `obter`, `abrir`, `iniciarSeparacao(numero)`, `sugerirSeparacao(numero)`, `separar`, `entregar`, `cancelar` |
| `eventos` | `listar` (filtros `entidade`, `entidadeId` e `tipo`; do mais recente ao mais antigo) |
| `inventarios` | `listar` (filtro `situacao`), `obter`, `abrir(locaisIds)`, `ler(id, { tipo, id, localId })` (retorno na hora: conferido, local errado, inesperado, repetido), `previa(id)`, `fechar(id, justificativas)`; abrir, ler e fechar exigem `estoque:movimentar` |
| `ibama` | `destinacoes(q)` (filtros `lancado`, `especieId`, `de`, `ate`), `marcarLancado(id)`, `saldosInformados(q)`, `informarSaldo({ data, itens, observacao? })`, `saldoPatio()`, `registrarPerda(dormenteId, { motivo, descricao? })` (`painel:gestao`), `perdas(q)` (filtros `comunicado`, `especieId`, `de`, `ate`), `marcarPerdaComunicada(id)` (`painel:gestao` ou `dof:declarar`), `inventarioPorLocal()` (último inventário fechado de cada local); lançar e informar exigem `dof:declarar` |
| `parametros` | `obter`, `atualizar`, `reiniciarDemonstracao()` (só no mock) |

**Mock (até a Etapa 9).**
- Guarda o estado no **`localStorage`** (com `try/catch`), para os dados sobreviverem ao recarregar a página; **Reiniciar dados de demonstração** em Configurações volta à história inicial.
- A história inicial (`data.ts`) é **determinística**: os mesmos IDs sempre, sem `Math.random()` nem datas soltas (datas relativas a uma data-base fixa). Inclui uma **entrega "a caminho" pronta, com IDs fixos**, para computador e celular partirem do mesmo estado e as etiquetas poderem ser impressas com antecedência (seção 15).
- Regras num módulo por assunto: `mock/simulador.ts`, `mock/recebimento.ts`, `mock/inspecao.ts`, `mock/estoque.ts` (única porta de mudança de saldo: `movimentarDormentes()`), `mock/rme.ts`. `data.ts` gera a história **chamando essas regras**, nunca montando registros à mão. As regras e os invariantes da seção 5.4 têm testes no Vitest.
- Entregas geradas no Simulador ou cadastradas depois do início ficam só no aparelho onde foram criadas.

**Supabase (Etapa 9).**
- SQL em `supabase/migrations/` (numerado, um arquivo por mudança): tabela `perfis` ligada a `auth.users`, tabelas dos dados a partir de `models.ts` (campos calculados viram views ou funções), políticas RLS por perfil e a carga da história de demonstração com os mesmos IDs do mock. Claude escreve; a Dani executa no editor SQL do Supabase.
- Implementação `services/supabase/` da mesma interface, escolhida por variável de ambiente (`VITE_FONTE_DADOS=mock|supabase`), e o Supabase Auth no serviço de autenticação. Regras que mudam várias tabelas juntas (receber, concluir inspeção, separar, entregar) viram funções no banco (`rpc`), para valerem no servidor.
- Sai `services/real/` (HTTP), com `http.ts` e `endpoints.ts`; `ApiError` e `mensagemSegura()` vão para `services/erros.ts`.
- A chave pública (`anon`) do Supabase pode ir no `.env`; o acesso é controlado pelas políticas RLS. A chave de serviço nunca vai para o front.

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
| `SeloDemo` | Selo laranja tracejado "Demonstração" para o Simulador (único aviso de demonstração do sistema) |

Ícones: ampliar `components/Icone.tsx` com `qr`, `scan`, `contrato`, `fabrica`, `impressora`, `etiqueta`, `local`, `copiar`, `seta-direita`.

Menu lateral: recolhível por um ícone discreto no topo, ao lado do logo; não há botão "Recolher menu" no rodapé.

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
Até a Etapa 9, login simulado: o nome do usuário escolhe o perfil (`administrador`, `almoxarife`, `gestor`, `requisitante`; qualquer senha). Na Etapa 9, e-mail e senha pelo Supabase Auth, com a sessão guardada no aparelho (o QR abre a ficha sem novo login enquanto a sessão valer). Após login, voltar ao destino guardado, inclusive `/d/:id` vindo de um QR.
- Aceite: abrir `/#/d/AR00224-01-000001` sem sessão leva ao login e, após entrar, abre a ficha.

### 9.2 Painel (`/`) · padrão Painel
- **Taxa de reprovação na inspeção da CPTM por empresa inspetora**: reprovados sobre inspecionados dos dormentes de cada contrato, agrupados pela empresa inspetora do contrato (mostra se a inspeção do fornecedor antes da entrega está funcionando). Para administrador e gestor.
- **Indicadores** (clicáveis): Em estoque (dormentes) · Aguardando inspeção · Itens abaixo do mínimo · Fardos acima do limite de dias · DOFs a declarar · RMEs abertas · **Parcelas atrasadas** · **Laudos perto do prazo e vencidos** · **Reprovados aguardando retirada**.
- **Pontualidade por fornecedor**: parcelas entregues no prazo × com atraso × atrasadas.
- **Via corrente × AMV**: estoque e indicadores separados pelo uso do tamanho.
- **Reposição**: item (classe + tamanho) abaixo do mínimo mostra o saldo na ata vigente e o atalho **Novo contrato** (`/contratos?novo=1`).
- **Para fazer agora** por perfil: almoxarife (entregas a receber, fardos a inspecionar, fardos a guardar, RMEs a separar e entregar, DOFs a declarar); gestor (itens em falta ou excesso, fardos parados, taxa de reprovação alta, dormentes não localizados); requisitante (suas RMEs e situação); administrador (contratos perto do fim, fornecedores com CTF vencendo).
- **Estoque por item**: gráfico de barras horizontais por classe + tamanho, com marcas de mínimo e máximo (cor só reforça o rótulo falta/ok/excesso).
- **Entregas dos contratos**: `BarraProgresso` por contrato vigente.
- **Alertas**: lista curta com link.
- Aceite: cada número do Painel abre a lista filtrada correspondente.

### 9.3 Contratos (`/contratos`) · padrão Lista
- Abas: Vigentes · Concluídos · Cancelados.
- Colunas: Contrato (link) · Ata · Fornecedor (link) · Itens · Entregue (`BarraProgresso` recebido/contratado) · Vigência · Situação.
- Filtros: fornecedor, espécie, ano.
- Ação principal: **Novo contrato** (modal largo `ContratoModal`: ata (selecionar ou criar; o fornecedor é escolhido na ata e o contrato o herda, sem digitar de novo), número, empresa inspetora (seleção do cadastro, só as ativas), ano, itens em linhas: espécie, tamanho, tratamento, quantidade e unidade (un ou m³). Em m³ o sistema mostra a conversão em unidades pelo volume do tamanho, arredondada para baixo, e grava em unidades).
- Aceite: não deixa salvar item com espécie que o fornecedor não fornece; fornecedor inativo ou bloqueado (CTF vencido, calculado pela validade) não aparece ao criar ata ou contrato.

### 9.4 Página do contrato (`/contratos/:numero`) · padrão Objeto
- Cabeçalho: número, situação, fatos-chave (Fornecedor (da ata), Ata, Contratado, Recebido, Aprovado, Reprovado).
- Abas: **Itens** (por item: contratado, emitidos, recebidos, aprovados, reprovados, saldo a emitir, barra de progresso) · **Fardos** (lista filtrada por contrato) · **Entregas** (NF, DOF, situação e recebimento) · **Histórico**.
- Ações: Editar, Cancelar, **Gerar entrega no simulador** (só com modo demonstração).
- Relacionados: fornecedor, ata, NFs, recebimentos.

### 9.5 Simulador do fornecedor (`/simulador`) · padrão Assistente + Lista
- Aviso fixo no topo (não recolhível): "Demonstração. Na operação real, o fornecedor grava o QR na plaquinha seguindo o padrão do contrato."
- Assistente **Emitir fardos**: 1) contrato · 2) itens e quantidades (fardos e dormentes por fardo, padrão do parâmetro; mostra o saldo a emitir do item, `quantidade - (emitidos - reprovados)`, e bloqueia acima dele: reposição de reprovados é permitida) · 3) revisar e confirmar, escolhendo **Com NF e DOF já cadastradas** ou **Gerar só os fardos (sem NF e DOF)**.
- Ao confirmar: cria a emissão, fardos `em_transito` e dormentes `emitido` com IDs sequenciais, e uma NF e uma DOF de exemplo coerentes com o volume. Com documentos, a entrega `a_caminho` já nasce cadastrada; só os fardos, a emissão fica "Aguardando NF e DOF" até a CPTM cadastrar NF e DOF importando o XML (a entrega se liga à emissão pela chave de acesso, e os fardos da emissão viram os esperados). Assim se demonstra o fluxo completo: fornecedor emite → CPTM cadastra NF e DOF → almoxarife recebe.
- Lista abaixo: emissões (NF, contrato, fardos, dormentes, situação) com ações **Imprimir etiquetas**, **Baixar XML da NF** e **Ver DOF** (número, validade e volume por espécie, para digitar no cadastro).
- Aceite: nenhuma sequência se repete entre entregas do mesmo contrato; emitidos menos reprovados nunca passa do contratado.

### 9.6 Folha de etiquetas (`/simulador/etiquetas/:emissao`)
- Sem Layout, só com `simulador:usar`. Grade de `EtiquetaQr` para impressão em A4: primeiro a etiqueta do fardo, depois as dos dormentes daquele fardo. **Etiquetas:** fardo e dormente só são impressos pelo Simulador do fornecedor (o fornecedor é quem grava o QR na plaquinha); o QR dos locais só em Cadastros › Locais, para o administrador. A reimpressão de etiqueta danificada (contingência) é melhoria futura.
- Etiqueta do dormente (proporção da plaquinha do contrato): QR à esquerda, à direita o ID em mono e grande, contrato, espécie e comprimento. Etiqueta do fardo: maior, com "FARDO", ID, item e quantidade.
- Usar o texto "CPTM" no cabeçalho, não o arquivo do logo (só usar logo se a CPTM fornecer).
- CSS `@media print`: margens, quebra de página sem cortar etiqueta, botão Imprimir escondido.
- Aceite: a etiqueta impressa é lida pela câmera do celular e abre a ficha.

### 9.7 Recebimentos (`/recebimentos`) · padrão Lista
- Abas: **A caminho** (entregas cadastradas em NF e DOF ainda não recebidas, inclusive as recebidas em parte, com os fardos que faltam) · Aguardando inspeção · Concluídos · Com ocorrência.
- Colunas: NF · Fornecedor · Contrato · Fardos · Dormentes · Prazo DOF (badge) · Situação.
- Ação na linha "A caminho": **Receber** (abre o assistente com a entrega já escolhida). Ação principal da tela: **Receber** (abre o assistente no passo 1).
- **Assistente de recebimento** (`RecebimentoAssistente`):
  1. **Escolher a entrega**: lista das entregas "A caminho" (NF, fornecedor, contrato, fardos esperados, prazo da DOF), com busca pela NF. Exceção: **Cadastrar NF e DOF agora**, para material que chegou sem cadastro prévio; abre os mesmos passos do cadastro de NF e DOF (9.9) e volta com a entrega criada (origem `recebimento`).
  2. **Leitura dos fardos**: lista dos fardos esperados com caixa de checagem; botão **Ler QR** em modo contínuo marca cada fardo lido; fardo lido do mesmo contrato, emitido e sem entrega entra na entrega; fardo de outro contrato, de outra entrega ou desconhecido vira ocorrência "fardo desconhecido"; também dá para marcar à mão. Fardo esperado e não lido gera ocorrência de **falta** automática, continua `em_transito` e pode ser recebido depois (a entrega fica `recebida_parcial` e continua em "A caminho" com os fardos que faltam).
  3. **Conferência**: conforme ou com ocorrência (avaria, falta, sobra); ocorrência exige descrição, e foto na avaria e na sobra (na falta a foto é opcional: não se fotografa o que não chegou). Falta declarada exige o fardo lido e a **quantidade de dormentes faltando**, que sai do recebido e do volume nominal.
  4. **Local de espera**: local do tipo inspeção (sugerido o com mais espaço).
  5. **Revisar e confirmar** (prévia do serviço, `recebimentos.previa`): resumo, divergência de volume por espécie com DOF, volume nominal e volume medido (este só depois da inspeção; até lá a diferença é marcada como provisória; acima de 10% mostra aviso crítico e pede justificativa, não bloqueia). Se a divergência vem só do que faltou (fardos não lidos e dormentes faltando; contando-os, a DOF fecha), o campo já vem preenchido com a lista deles (`justificativaPorFalta` em `dominio/parametros.ts`) e a pessoa pode complementar. A divergência é sempre a acumulada da entrega: quando os fardos que faltaram são recebidos, ela é recalculada (`entrega.divergenciaVolume`).
- Resultado: fardos e dormentes lidos passam a `aguardando_inspecao`; os não lidos continuam `em_transito`; abre a página do recebimento.

### 9.8 Página do recebimento (`/recebimentos/:id`) · padrão Objeto
- Fatos-chave: NF, DOF, contrato, fardos (lidos/esperados), recebido em, por.
- Abas: Fardos (com situação e link para inspeção) · Documentos (NF, XML, DOF, PDF, volume documental × nominal × medido) · Ocorrências (fotos e a quantidade da falta) · Histórico.
- Ação: **Marcar DOF como declarado no Sinaflor** (com confirmação; registra quem e quando).

### 9.9 NF e DOF (`/documentos`) · padrão Lista + Assistente
Primeiro item do grupo Entrada: é onde a entrega nasce, antes da chegada do material, e onde fica o controle de prazo e a declaração no Sinaflor.
- Ação principal: **Cadastrar NF e DOF** (assistente `EntregaAssistente`):
  1. **NF**: importar o XML (lido no navegador por `utils/nfeXml.ts`, sem executar nada) ou digitar; chave de acesso repetida é recusada; contrato (do fornecedor da NF) e itens com quantidade e volume.
  2. **DOF**: número, validade, volume por espécie e PDF. Sem DOF não avança. O volume por espécie começa **vazio e é obrigatório**, digitado do documento (nunca preenchido pela NF), para a comparação com o recebido ter sentido.
  3. **Fardos da entrega** (opcional): fardos já emitidos do contrato, em trânsito e sem entrega; pode ficar em branco (seção 5.5).
  4. **Revisar e confirmar**: resumo e o prazo de declaração calculado.
  - Resultado: NF, DOF e a entrega "A caminho", que aparece em Recebimentos.
- Abas: **A caminho** (entregas cadastradas e não recebidas) · DOFs a declarar · Declarados · Todas as NFs.
- Colunas DOF: DOF · NF · Fornecedor · Validade · Prazo de declaração · Nível (crítico, atenção, ok) · Declarado em. Colunas das entregas: NF · Fornecedor · Contrato · Fardos esperados · Prazo DOF · Situação.
- Ações na linha: **Declarar** (DOF, com confirmação; registra quem e quando; só depois que algum fardo da entrega foi recebido, porque a declaração confirma o recebimento) e **Receber** (entrega a caminho, abre o assistente de recebimento com ela escolhida). Ordenação padrão: prazo mais próximo primeiro.
- Aceite: cadastrar NF por XML e DOF cria a entrega "A caminho"; a mesma chave de acesso de novo é recusada.

### 9.10 Inspeção (`/inspecao`) e Inspeção do fardo (`/inspecao/:fardo`)
- **Fila** (padrão Lista): fardos `aguardando_inspecao` e `em_inspecao` com progresso (x de N dormentes inspecionados), contrato, item, local de espera, há quantos dias. Ação: **Inspecionar**. Aba **Não localizados**: dormentes que ficaram `nao_localizado` (pendência do gestor), com ação **Inspecionar** quando o dormente for encontrado.
- **Inspeção do fardo** (tela de trabalho, duas colunas):
  - Esquerda: lista dos dormentes do fardo com situação (pendente, aprovado, reprovado, não localizado) e categoria.
  - Direita: último dormente lido em destaque (ID, resultado, categoria, medidas); botões **Abrir no Inspector** (protocolo atual), **Simular inspeção do fardo** (modo demonstração: gera resultados determinísticos, com ~5% reprovados) e **Registrar à mão** (ler QR + Aprovado ou Reprovado + categoria 1, 2 ou 3).
  - Resultado só aprovado ou reprovado; o ATENÇÃO do Inspector conta como reprovado; categoria pelo índice com os limites 80 e 50 (provisório, seção 5.5).
  - ID lido que não pertence ao fardo vira pendência visível ("não pertence a este fardo").
  - **Registrar à mão** (tela de campo, seção 11.1): leitor em modo contínuo; ao ler, a câmera encolhe e aparecem os botões grandes **Aprovado** e **Reprovado**; Aprovado pede a categoria (1, 2 ou 3) em botões; gravado o resultado, o leitor volta a ler o próximo. Dormente já inspecionado pode ser lido de novo (vale o mais recente). Também é o caminho para inspecionar o não localizado encontrado depois (`?dormente=` abre o leitor com ele).
  - **Concluir inspeção**: escolhe o local de guarda (lido por QR do local ou selecionado). Com todos inspecionados, conclui direto; com dormentes não lidos (falta ou QR ilegível), mostra quantos e quais e pede **justificativa obrigatória**, e esses dormentes ficam `nao_localizado`. Se os não lidos cabem na falta declarada no recebimento, a justificativa já vem preenchida. Aprovados ficam `em_estoque` no fardo, que vai para o local; reprovados vão para `reprovado` no local de segregação. Gera movimentações `guarda` e `segregacao`.
- Aceite: o saldo do fardo após concluir é igual ao número de aprovados; não localizados aparecem na fila e nas pendências do gestor.

### 9.11 Estoque (`/estoque`) · padrão Lista com duas visões
- Alternar **Por item** | **Por fardo** (`?visao=`).
- Por item: Espécie · Tamanho · Em estoque (disponível) · Aguardando inspeção · Reservado · Mínimo · Máximo · Situação (falta, ok, excesso). Falta e excesso usam o disponível. Clique na linha → visão por fardo filtrada pelo item.
- Por fardo: Fardo (link) · Item · Contrato · Local · Saldo (físico) · Disponível · Idade (dias, com alerta acima do limite) · Situação. Ordenação padrão: mais antigos primeiro.
- Filtros: espécie, tamanho, local, situação, contrato, "acima do limite de dias".
- Ação principal: **Transferir fardo** (ler QR do fardo → ler QR ou escolher local).
- Por item: "Ver fardos" na linha abre a visão por fardo filtrada pelo item. Por fardo (só fardos em estoque; os baixados saem desta tela e continuam na busca e na página do contrato): abas Todos · Completos · Abertos, situação "Em estoque" com o selo "Aberto" no fardo incompleto e, quando há reservados, "N reservados" na linha, embaixo do disponível; filtros espécie, tamanho, local e idade; o contrato pela pesquisa (o ID do fardo começa por ele). O requisitante vê só a visão por item.
- **Transferir fardo** (`TransferirFardo`, tela de campo): ler o QR do fardo; com fardo em estoque, o leitor do QR do local abre sozinho; escolher o local na lista ou digitar o ID ficam como alternativa; confirmação em tela cheia no celular ("A-03 → A-05"). Também na página do fardo e em Movimentações.

### 9.12 Página do fardo (`/f/:id`) · padrão Objeto
- Fatos-chave: Saldo/inicial (físico: em estoque + reservados) · Disponível · Local · Idade · Contrato · Item · Recebido em.
- Abas: **Dormentes** (ID, situação, categoria, comprimento medido) · **Origem** (contrato, fornecedor, NF, DOF, recebimento, inspeção) · **Movimentações** · **Histórico**.
- Ações por situação: aguardando inspeção → **Inspecionar**; em estoque → **Transferir**. Sem impressão de etiqueta (só o Simulador imprime as de fardo e dormente). No celular, as ações ficam no rodapé fixo e as tabelas das abas viram cartões.

### 9.13 Ficha do dormente (`/d/:id`) · padrão Ficha rápida
- Topo: ID grande em mono, badge de situação, espécie (nome científico + popular), classe, tamanho, tratamento.
- Cartão **Onde está**: fardo (link), local, desde quando. Se baixado: RME e destino. Se não localizado: aviso com a justificativa da conclusão e, para o almoxarife, a ação **Inspecionar agora**.
- Cartão **Inspeção**: resultado, categoria, medidas, inspetor, data, link do relatório (`urlSegura()`).
- Cartão **Origem**: contrato, ata, fornecedor, empresa inspetora, NF, DOF, recebido em.
- Cartão **Linha do tempo**: eventos do dormente (`LinhaTempo`).
- Rodapé de ações por perfil e situação (ex. almoxarife: "Ver fardo", "Transferir fardo"; reservado: "Ver RME").
- ID inexistente: tela "ID não encontrado" com o código lido, opção de digitar de novo e de ler outro QR.
- Aceite: abre em menos de 1 s no mock, legível num celular de 360 px sem rolagem horizontal.

### 9.14 Leitor de QR (componente global `LeitorQr`)
Ver seção 10. Aberto pelo botão do topo, pela busca e pelos assistentes.

### 9.15 Locais (`/locais`) e Página do local (`/locais/:codigo`)
- Visão **Mapa**: grade de cartões por local (código, tipo, barra de ocupação dormentes/capacidade, número de fardos); cores por tipo e ocupação com texto.
- Visão **Lista**: Código · Tipo · Descrição · Fardos · Ocupação · Situação.
- Clique no local → **Página do local** (padrão Objeto): fatos-chave (tipo, capacidade, ocupação, fardos), lista dos fardos no local (link para cada fardo e para o Estoque por fardo filtrado pelo local) e **Imprimir QR do local**. É o destino do QR do local.
- QR do local: ID `LOC-<código>` (ex. `LOC-A03`), link `<APP_URL>/#/locais/A03`; validação por `RE_LOCAL` em `identificacao.ts`.
- Ação: **Gerenciar locais** (leva a Cadastros › Locais; só para quem edita cadastros). O QR dos locais é impresso só em **Cadastros › Locais** (administrador): **Imprimir QR dos locais** e, na linha, **Imprimir QR** de um local (`/cadastros/locais/etiquetas`, sem o Layout, `?local=` imprime um só).
- Ocupação em texto e cor: "Quase cheio" a partir de 85% e "Lotado" a 100%. Página do local: **Ver no estoque** (visão por fardo filtrada pelo local).

### 9.16 Movimentações (`/movimentacoes`) · padrão Lista
- Colunas: Quando · Tipo · Fardo · Dormentes (quantidade) · De · Para · Quem · Referência (RME, recebimento).
- Filtros: tipo, período (7, 30 ou 90 dias), local (de ou para); o fardo e a RME pela pesquisa. Ação principal: **Transferir fardo**.

### 9.16a Inventário (`/inventarios`) e Inventário em andamento (`/inventarios/:id`) · Lista + tela de campo

Inventário físico por leitura de QR (IN Ibama 21/2014, art. 41: o saldo tem de ser fiel ao físico). Não existe ajuste de quantidade: toda diferença é tratada dormente a dormente.
- **Lista** (`operacao:consultar`): abas Abertos · Fechados; ação principal **Abrir inventário** (`estoque:movimentar`): escolhe um ou mais locais; o sistema guarda o que deveria estar em cada um (dormente a dormente: aguardando inspeção, em estoque, reservados e reprovados segregados). Um local só pode estar num inventário aberto de cada vez.
- **Tela de campo** (seção 11.1, celular primeiro): o local que está sendo conferido (lista ou leitura do QR do local); **Ler QR** em modo contínuo (`LeitorQr` com a lista dos fardos esperados no local e o contador "x de y conferidos" embaixo da câmera); cada leitura responde na hora: conferido, local errado (será transferido no fechamento), inesperado (justificar no fechamento) ou repetido. O QR do fardo confere todos os seus dormentes; o do dormente, só ele (fardo aberto, reprovados).
- **Revisar e fechar**: o resultado em grupos, por local (esperados, conferidos, %) e as diferenças: **conferidos**; **em local errado** (fardo lido noutro local, ou todos os seus dormentes lidos noutro local único; reprovado lido noutra segregação) → corrigidos por **transferência automática** com evento; **não encontrados** → passam a **"não localizado"** e seguem o fluxo de perda (o reservado não encontrado desfaz a separação da RME, que volta a "em separação"); **inesperados** (dormente baixado, perdido, retirado, não localizado, em trânsito ou de outro fardo lido no local; fardo sem dormentes no pátio) → **justificativa obrigatória**, gravada com o evento. Fecha com quem e quando.
- **Fechado**: o resultado; o gestor vê e trata os não localizados (Inspeção › Não localizados: inspecionar se aparecer ou registrar a perda).
- Permissões: o almoxarife abre, lê e fecha (`estoque:movimentar`); todos com `operacao:consultar` veem o resultado.
- A página do local mostra o **último inventário** (data); `Local.ultimoInventarioEm` é calculado.

### 9.17 Requisições (`/saidas`) e Página da RME (`/saidas/:numero`)
- Lista: abas Abertas · Em separação · Prontas · Entregues · Canceladas. Colunas: RME · Solicitante · Destino · Itens · Necessidade em · Situação.
- **Nova RME** (requisitante): destino (obra ou trecho), data de necessidade, itens (espécie, tamanho, quantidade, mostrando o disponível).
- **Separar** (almoxarife, assistente): 1) sugestão de fardos (abertos primeiro, depois os mais antigos), só com dormentes disponíveis (em estoque, não reservados); 2) leitura dos QR dos dormentes ou "fardo inteiro"; escolha diferente da sugestão pede justificativa; quantidade tem de bater com a pedida; 3) revisar e confirmar → dormentes `reservado` (continuam no saldo físico do fardo, saem do disponível), RME `pronta`.
- **Entregar**: confirma a entrega → dormentes `baixado`, fardos com sobra continuam em estoque e ficam abertos, zerados `baixado`; gera movimentações `saida`.
- **Expedição**: o local de expedição só aceita o fardo com todos os dormentes reservados para uma RME **pronta** ("Levar para a expedição" na página da RME, com leitura do QR do local); transferir outro fardo para a expedição é recusado com a explicação. Separação parcial deixa o fardo no local atual até a entrega. Cancelar a RME devolve à origem (o local de onde saiu) o fardo que estiver na expedição.
- **Separar** como tela de campo (seção 11.1): cada leitura risca o dormente; dormente fora da sugestão é aceito com aviso laranja na hora (troca no mesmo fardo sem justificativa; troca de fardo pede justificativa na revisão); dormente de outro item, reservado ou fora do estoque é recusado; o QR do fardo separa o fardo inteiro quando cabe no que falta do item.
- **Cancelar** antes da entrega libera as reservas.
- Página da RME: fatos-chave (solicitante, destino, itens, situação), abas Itens (pedida × separada) · Separação (fardos e dormentes com link, local, "fardo inteiro", "na expedição", sugestão seguida ou a justificativa) · Histórico. Ações por situação: Separar, Entregar, Cancelar RME (com motivo).
- Nova RME: pedir acima do disponível é permitido com aviso; a separação só fecha com a quantidade inteira.

### 9.18 Cadastros (`/cadastros?aba=`) · `PainelAbas` (manter o padrão atual)
- Abas: Espécies · Tamanhos · Tratamentos · Fornecedores · Empresas inspetoras (nome, CNPJ opcional, ativa ou inativa) · Locais.
- **Reativar** cadastro inativado, com confirmação e as regras de cada um: o fornecedor reativado continua bloqueado se o CTF estiver vencido; o local volta com o mesmo código e QR.
- Inclusão em linha (`FormLinha`), edição em `FormModal`, nada é apagado (inativar). O fornecedor é incluído por modal ("Novo fornecedor"), porque tem campos demais para a linha, inclusive as espécies que fornece.
- Fornecedor: razão social, CNPJ, cidade/UF, CTF IBAMA e validade, espécies que fornece (seleção múltipla), certificados (anexos). Linha leva à **Página do fornecedor** (`/fornecedores/:id`): contratos, entregas, taxa de reprovação, certificados.

### 9.19 Usuários (`/usuarios`) e Configurações (`/configuracoes`)
- Usuários: lista (nome, e-mail, perfil, situação) e edita só perfil e situação. As contas são criadas no painel do Supabase (Etapa 9); até lá a lista mostra os quatro perfis de demonstração.
- Configurações: parâmetros da seção 5.7, com a tabela de **níveis de estoque** (mínimo e máximo por espécie + tamanho) editável, o interruptor **Modo demonstração** e, só no mock, **Reiniciar dados de demonstração**.

### 9.21 Relatórios (`/relatorios`) · seção IBAMA (Etapa 10)

Item de menu **Relatórios** (grupo Início, depois do Painel), com a seção **IBAMA** (IN Ibama 21/2014; reaproveita a "Prestação de contas ao IBAMA" do PRD da v1). O sistema não substitui o sistema DOF nem o Sinaflor: organiza o que a CPTM precisa lançar e conferir lá. Todos os relatórios têm **filtro de período**, **exportação em CSV** e **versão para impressão** (`@media print`, como as folhas de etiquetas). Perfis: administrador, almoxarife e gestor (`operacao:consultar`); as ações exigem `dof:declarar`.

| Relatório | O que mostra | Norma | Serviço |
| --- | --- | --- | --- |
| 1. Saldo do pátio | Volume em m³ por espécie (nome científico) e tamanho dos dormentes no pátio (aguardando inspeção, em estoque, reservados, reprovados ainda não retirados e não localizados; **os não localizados aparecem à parte**, para explicar diferenças em vistoria; o perdido sai do saldo), comparado com o último saldo informado do DOF, com a diferença e alerta acima de 10%; ação **Informar saldo do DOF** | art. 41 | `ibama.saldoPatio()`, `ibama.informarSaldo()`, `ibama.saldosInformados()` |
| 2. Destinação final | Volume por espécie das RMEs entregues no período, lançado ou não no DOF, com a ação **Marcar como lançado no DOF** e alerta para as pendências | baixa do saldo virtual | `ibama.destinacoes()`, `ibama.marcarLancado()` |
| 3. DOFs a declarar | Atalho para a aba já existente em NF e DOF (`/documentos?aba=a_declarar`) | art. 51 | `dof` |
| 4. Divergências de volume | DOF × volume medido na inspeção (nominal enquanto não há medido), por entrega e espécie, com a justificativa | art. 53 | `entrega.divergenciaVolume` |
| 5. Inventário para vistoria | Fardos por local e espécie, com quantidade, m³, NF e DOF de origem, e **quando cada local foi conferido pela última vez** (inventário) | art. 65 | `estoque.porFardo` + documentos + `ibama.inventarioPorLocal()` |
| 6. Movimento anual | Entradas (recebimentos) e saídas (destinação final) por espécie e volume no ano | relatório anual (obrigatoriedade a confirmar com a CPTM) | movimentações + destinações |
| 7. Perdas a comunicar ao IBAMA | Dormentes perdidos (o gestor transforma um "não localizado" em "perdido", com motivo: extravio, avaria, incêndio, intempérie ou outro, com descrição), por espécie e volume, com a ação **Marcar como comunicado ao órgão** (quem e quando) | art. 42 | `ibama.registrarPerda()`, `ibama.perdas()`, `ibama.marcarPerdaComunicada()` |
| 8. Inventários (conferência física) | Por local: data do último inventário, percentual conferido e as diferenças encontradas (local errado, não encontrados, inesperados), com link para o resultado | art. 41 | `ibama.inventarioPorLocal()`, `inventarios` |

Alertas no Painel (Etapa 10): saldo do pátio acima de 10% do informado, destinação final pendente de lançamento, perdas a comunicar, saldo do DOF sem atualização há mais de 30 dias e local sem inventário há mais de 90 dias (provisório). O Saldo do pátio mostra também a data do último inventário de cada local.

**Perdas.** Na aba Não localizados da Inspeção, o gestor (`painel:gestao`) tem **Registrar perda** (motivo obrigatório; "outro" exige descrição; confirmação, sem desfazer). O dormente passa a `perdido` (evento `perdido`), sai do saldo físico e entra no relatório 7; a ficha mostra o motivo e se já foi comunicado. Marcar como comunicado: gestor ou quem declara DOF.

### 9.20 Vitrine (`/vitrine`)
- Interna: fora do menu, só administrador (`admin`). Dados fixos no próprio arquivo, sem serviço.
- Mostra um exemplo do padrão Lista (cabeçalho, abas de situação, barra de filtros, tabela com ação na linha, cartões no celular) e um do padrão Objeto (cabeçalho do objeto com fatos-chave, abas, relacionados, linha do tempo), mais os componentes visuais da seção 7.3.
- Serve para validar a casca na Etapa 1 e como referência visual nas etapas seguintes; não é uma tela do produto.

---

## 10. QR code: geração, leitura e impressão

### 10.1 Bibliotecas (exceção justificada à regra de "sem dependências")

| Uso | Biblioteca | Motivo |
| --- | --- | --- |
| Gerar QR | `qrcode` | Pequena, sem dependências de UI; gerar com `toDataURL()` e exibir em `<img>` (proibido `dangerouslySetInnerHTML`) |
| Ler QR | API nativa `BarcodeDetector` quando existir; senão `jsqr` lendo quadros da câmera num `<canvas>` | Funciona em Android/Chrome e nos demais navegadores |
| Login e banco | `@supabase/supabase-js` | Cliente oficial do Supabase (Auth e dados); entra na Etapa 9 |

Dependências de desenvolvimento: `@types/qrcode` (tipos do `qrcode`, Etapa 4) e `vitest` (testes de `identificacao.ts` e das regras do mock, Etapa 2). Registrar no `CLAUDE.md` que estas são as únicas dependências de runtime além de React e react-router-dom.

### 10.2 Conteúdo e correção de erro
- Conteúdo: `linkQr('dormente', id)` = `${VITE_APP_URL}/#/d/${id}`. Nível de correção **M**, margem de 2 módulos.
- O leitor aceita link completo **ou** ID puro (`lerCodigo()`), para funcionar com plaquinhas antigas digitadas à mão e com outros leitores.

### 10.3 Componente `LeitorQr`
- Abre em camada sobre a tela, com vídeo da câmera traseira (`facingMode: 'environment'`), moldura de mira e lanterna quando disponível.
- Modos: `navegar` (lê e vai para o objeto) e `capturar` (lê e devolve `{tipo, id}` ao chamador; com `continuo` mantém aberto e lista o que já foi lido, com vibração curta a cada leitura).
- Sempre oferece **Digitar código** como alternativa e mostra mensagem clara quando não há permissão de câmera.
- Lê só códigos reconhecidos por `lerCodigo()`; outros mostram "QR não pertence ao sistema".

### 10.4 Câmera exige HTTPS: hospedagem na Vercel
O navegador só libera a câmera em `https` ou `localhost`. O app é publicado na **Vercel** (HTTPS; o `HashRouter` dispensa configuração de rotas no servidor), e a URL da Vercel é o `VITE_APP_URL`, gravado no link de cada QR. **Pré-requisito da Etapa 4**: projeto na Vercel ligado ao fork, com a URL definitiva, antes de imprimir qualquer etiqueta (etiqueta com `localhost` não abre no celular). Documentar a URL e as variáveis no `CLAUDE.md`.

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

**Início de campo.** No celular, o almoxarife não vê o painel completo. Ao entrar, ele encontra o botão **Ler QR** grande no topo e, logo abaixo, as tarefas do dia em cartões com contagem e ação direta, como "Receber 1 entrega", "Inspecionar 2 fardos", "Guardar 3 fardos" e "Separar RME-2026-0012". O painel completo continua acessível pelo menu. Implementar como uma variação do `Dashboard` escolhida por perfil e largura de tela (`useTelaPequena()`), não como rota separada.

**Regras das telas de campo**
- Ação principal sempre no **rodapé fixo**, ao alcance do polegar; nada importante só no topo da tela.
- Alvos de toque de no mínimo 48 px nas telas de campo (acima dos 44 px do resto do sistema), com espaço entre botões para uso com luva.
- Texto mínimo de 16 px e IDs em 18 px ou mais, legíveis sob sol; contraste alto, sem cinza claro sobre branco em informação importante.
- Leitura contínua: depois de cada leitura, a câmera continua aberta, com vibração curta e som opcional de confirmação, e o último item lido aparece em destaque por 2 segundos.
- Erros de leitura em linguagem direta ("Este fardo não é desta entrega") com a ação para resolver na mesma tela.
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
- **Permissões granulares** (nomes provisórios, entram na Etapa 1): `admin`, `operacao:consultar`, `cadastros:editar`, `contratos:editar`, `simulador:usar`, `nf:cadastrar`, `recebimento:registrar`, `dof:declarar`, `inspecao:operar`, `estoque:movimentar`, `rme:abrir`, `rme:separar`, `painel:gestao`. Perfil = conjunto de permissões, não regra no código. `operacao:consultar` dá acesso de leitura às telas de suprimento, entrada, estoque e cadastros.

| Perfil | Permissões |
| --- | --- |
| Administrador | `admin`, `operacao:consultar`, `cadastros:editar`, `contratos:editar`, `simulador:usar`, `nf:cadastrar`, `painel:gestao` |
| Almoxarife | `operacao:consultar`, `simulador:usar`, `nf:cadastrar`, `recebimento:registrar`, `dof:declarar`, `inspecao:operar`, `estoque:movimentar`, `rme:separar` |
| Gestor | `operacao:consultar`, `painel:gestao` |
| Requisitante | `rme:abrir` |
- **Modo demonstração** como parâmetro: o Simulador e os botões "Simular" somem quando desligado, sem remover código.
- **Pontos de extensão já previstos** (não implementar agora): etiqueta de contingência no `LeitorQr` (ID não encontrado → gerar), RFID como outra fonte para `lerCodigo()` (o inventário por leitura de QR já entrou, seção 9.16a).

---

## 13. Etapas de implementação

Cada etapa: build sem erros, testes passando (a partir da Etapa 2), `CHANGELOG.md` atualizado, `CLAUDE.md` atualizado quando aplicável, um commit com mensagem clara. Não pular etapas: cada uma depende das anteriores. Uma etapa por vez, e a próxima só começa quando a Dani pedir.

### Etapa 0 · Preparação e limpeza (concluída)
- Branch `v2-qrcode`. PRD, contratos de API e integração com a inspeção da v1 em `docs/arquivo/`; especificação e plano em `docs/`.
- Código de domínio da v1 removido (telas, mock, modais, componentes de relatório e quadro); ficou só a infraestrutura da seção 2. O app abre numa tela "Em construção".
- `CLAUDE.md` reescrito para a v2.
- Revisão das decisões (2026-11-05): plano e especificação sem contradições; sem avisos de dados simulados; botão de recolher o menu no topo.
- Ajuste (2026-11-06): NF e DOF cadastradas antes da chegada criam a entrega "A caminho"; o recebimento começa escolhendo a entrega.

### Etapa 1 · Fundação visual, casca, perfis e vitrine (concluída)
- `styles/tokens.css` e ajuste de `styles.css` para os tokens.
- Componentes: `CabecalhoPagina`, `CabecalhoObjeto`, `FatoChave`, `AbasSecao`, `AbasSituacao`, `BarraFiltros` (extraída do `ListPage`), `CartaoIndicador`, `Relacionados`, `IdCodigo`, `BarraProgresso`, `SeloDemo`, `RodapeAcoes` (rodapé fixo das telas de campo, seção 11.1); ícones novos.
- Permissões granulares e os quatro perfis da seção 12 em `dominio/permissoes.ts`; login simulado com escolha de perfil pelo nome.
- Autenticação como serviço separado da camada de dados (`services/auth/`, seção 6), com a implementação simulada.
- `Layout`: topo com botão Ler QR (por enquanto abre entrada manual), menu com `GRUPOS_MENU` v2 e **todos os itens da seção 3.2**, cada um levando ao "Em construção", com as permissões de cada perfil; navegação inferior do almoxarife no celular e `useTelaPequena()`.
- Vitrine `/vitrine` (seção 9.20).
- Pronto quando: cada perfil vê o seu menu; a vitrine mostra os padrões de lista e de objeto funcionando no desktop e em 360 px.

### Etapa 2 · Domínio, modelo, serviços e testes (concluída)
- `vitest` como dependência de desenvolvimento e `npm test`.
- `identificacao.ts` (dormente, fardo, contrato, RME, local) com testes.
- `models.ts` v2, `rotulos.ts`, `opcoes.ts`, `parametros.ts` (tolerância de volume, regras provisórias da inspeção).
- `contracts.ts` v2 e mock reescrito: módulos de regra, persistência no `localStorage`, reinício da demonstração e o `data.ts` da história de demonstração (seção 15), com a entrega "a caminho" de IDs fixos. Testes dos invariantes da seção 5.4 e das regras de recebimento, inspeção (inclusive não localizados), simulador (limite com reposição) e RME.
- Reescrever a seção de regras de domínio do `CLAUDE.md`.
- Pronto quando: build e testes passam, o mock gera a história completa e consistente.

### Etapa 3 · Cadastros e Contratos (concluída)
- Cadastros (6 abas, com reativar), Página do fornecedor, Contratos (lista, `ContratoModal` com ata e fornecedor herdado, página do contrato).
- Pronto quando: é possível criar fornecedor, espécie, tamanho, tratamento, local e um contrato com itens (inclusive em m³ convertido); fornecedor com CTF vencido aparece bloqueado.

### Etapa 4 · QR code: ficha, leitor, simulador e etiquetas (concluída; falta o teste no celular pela URL da Vercel)
- **Pré-requisito:** projeto na Vercel com HTTPS e a URL definitiva no `VITE_APP_URL` (seção 10.4).
- Dependências `qrcode`, `jsqr` e `@types/qrcode`; `LeitorQr`; `EtiquetaQr`; rotas `/d/:id`, `/f/:id` e `/locais/:codigo`.
- Ficha do dormente completa (lê do mock todos os vínculos).
- Simulador (assistente + lista de entregas) e folha de etiquetas com CSS de impressão, inclusive da entrega "a caminho" fixa.
- Busca global e `CodigoLink` reconhecendo IDs v2.
- Pronto quando: imprimir as etiquetas da entrega fixa, apontar a câmera do celular (pela URL da Vercel) e abrir a ficha.

### Etapa 5 · NF e DOF, e Recebimento (concluída)
- Tela NF e DOF com o cadastro da entrega (XML ou digitada, DOF, fardos opcionais), abas de entregas e DOFs, controle de prazo e declaração no Sinaflor.
- Lista de recebimentos com "A caminho", assistente de recebimento começando por "Escolher a entrega" (com a exceção de cadastrar NF e DOF na hora), leitura contínua dos fardos e falta de fardo, página do recebimento.
- Pronto quando: importar o XML de uma NF e cadastrar a DOF cria a entrega "A caminho"; a entrega é recebida lendo os QR dos fardos, os dormentes passam a "aguardando inspeção" e um fardo não lido pode ser recebido depois.

### Etapa 6 · Inspeção (concluída)
- Fila (com não localizados), tela de inspeção do fardo, simulação, registro manual, conclusão com guarda, segregação e justificativa.
- Pronto quando: fardo inspecionado fica em estoque no local escolhido, reprovados segregados, não lidos ficam não localizados, ficha do dormente mostra a inspeção.

### Etapa 7 · Estoque, fardo, locais e movimentações (concluída)
- Estoque (por item e por fardo), página do fardo, Locais (mapa, lista e página do local, QR dos locais), Movimentações, transferência por leitura.
- Pronto quando: transferir um fardo lendo o QR do fardo e do local atualiza estoque, local, movimentações e a ficha dos dormentes.

### Etapa 8 · Saídas (RME) (concluída)
- Lista, nova RME, separação com sugestão e leitura, entrega, cancelamento, página da RME.
- Pronto quando: uma RME entregue baixa os dormentes certos, o fardo fica aberto com o saldo restante e a ficha mostra o destino.

### Etapa 9 · Supabase: banco e login (logo depois do modelo fechado)
- `supabase/migrations/`: tabela `perfis`, tabelas dos dados, views dos campos calculados, funções das operações que mudam várias tabelas, políticas RLS por perfil e a carga da história de demonstração com os mesmos IDs do mock. Claude escreve; a Dani executa no editor SQL. As contas são criadas no painel do Supabase.
- `@supabase/supabase-js`; implementação `services/supabase/`; Supabase Auth no serviço de autenticação (sessão guardada no aparelho); `VITE_FONTE_DADOS`, `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (também na Vercel).
- Remover `services/real/`, `http.ts` e `endpoints.ts`; erros em `services/erros.ts`. Usuários lista e edita perfil e situação.
- Pronto quando: computador e celular veem os mesmos dados; uma entrega gerada no computador é recebida no celular; cada perfil só lê e grava o que as políticas permitem.

### Etapa 10 · Painel e alertas
- Indicadores por perfil, taxa de reprovação por empresa inspetora, "Para fazer agora", gráfico de estoque por item com mínimo e máximo, entregas dos contratos, alertas (DOF, falta/excesso, idade, não localizados). "Início de campo" do almoxarife no celular (seção 11.1).
- Já preparado no serviço desde o modelo real: parcelas atrasadas, laudos perto do prazo e vencidos, reprovados aguardando retirada, pontualidade por fornecedor, via corrente × AMV e a reposição (saldo na ata vigente e "Novo contrato").
- **Relatórios** com a seção IBAMA (seção 9.21): saldo do pátio, destinação final, DOFs a declarar, divergências de volume, inventário para vistoria e movimento anual, com período, CSV e impressão. O modelo e os serviços (`ibama`) já existem desde o modelo fechado.
- Pronto quando: todo número leva à lista filtrada e cada perfil vê só o que lhe cabe.

### Etapa 11 · Acabamento e demonstração
- Revisão de responsividade (360 px), acessibilidade, estados vazios e de erro em todas as telas.
- Configurações (parâmetros, níveis, modo demonstração) e Usuários revisados.
- Roteiro de demonstração (seção 16) executado do início ao fim no celular e no computador, com o Supabase.
- `CLAUDE.md` e `CHANGELOG.md` finais; abrir PR no fork.

---

## 14. Checklist de qualidade (rodar ao fim de cada etapa)

- [ ] `npm run build` sem erros nem avisos de tipo
- [ ] `npm test` passando (a partir da Etapa 2)
- [ ] Nenhuma regra de negócio dentro de página (está no serviço ou em `src/dominio/`)
- [ ] Todo ID exibido é link (`CodigoLink`) e em fonte mono
- [ ] Busca, filtros, abas e visão estão no endereço
- [ ] Estados carregando, vazio e erro testados (`?simular=erro`, `?simular=vazio`)
- [ ] Tela usável em 360 px e no desktop
- [ ] Telas de campo testadas num celular real, com câmera e etiqueta impressa (seção 11.1)
- [ ] Uma única ação principal (laranja) por tela
- [ ] Mensagem de sucesso só após a resposta do serviço; nenhum aviso de dados simulados
- [ ] Permissões: perfil sem acesso não vê a tela no menu e recebe "sem permissão" pelo endereço
- [ ] `CHANGELOG.md` e, se for o caso, `CLAUDE.md` atualizados

---

### Melhorias futuras registradas
- **Etiqueta de contingência**: reimprimir a etiqueta de um dormente ou fardo com QR danificado ou ilegível (hoje só o Simulador imprime etiquetas de fardo e dormente).
- **RME por jogo de dormentes de AMV**: pedir o conjunto completo de um travessão de determinada geometria (os tamanhos de 3,00 a 5,40 m nas quantidades do jogo), em vez de tamanho por tamanho.
- **Movimentação física parcial**: levar para a expedição só os dormentes separados de um fardo (sem o fardo inteiro), com rastreio do local de cada dormente. Hoje a separação parcial fica no local do fardo até a entrega.

## 15. Dados de demonstração (`mock/data.ts`)

Montar uma história coerente, gerada pelas regras do mock, para que todas as telas tenham conteúdo realista. Nomes de fornecedores fictícios.

- 3 fornecedores (um com CTF válido, um com CTF vencendo em 20 dias e um com CTF vencido, bloqueado automaticamente), 4 espécies, os **12 tamanhos reais** da CPTM (006234 a 006231, 240 × 170 mm; 2,80 m via corrente, 3,00 a 5,40 m AMV), 2 tratamentos, empresas inspetoras IPT e UFV, 8 locais (5 armazenagem, 1 inspeção, 1 segregação, 1 expedição). Pessoas (gestores) com nomes fictícios.
- Ata AR00224 com as regras dos documentos (contratos AR00224-01, -02 e -03, com assinatura recente e parcelas no prazo; os poucos fardos da demonstração não completam 3.000 dormentes) e ata AR00311 (fictícia) com regras reduzidas, para mostrar um contrato pequeno concluído com laudos, reposição de reprovados e recebimento definitivo.
- Espécie, classe e tratamento por fardo, atribuídos pelo Simulador; Boletim de Inspeção e Relatório Técnico em todas as entregas; laudos emitidos, a emitir no prazo e vencido; reprovados retirados, com comunicação atrasada e com retirada atrasada; um único atraso proposital de parcela (2ª do AR00311-01); fardos em cura (AR00224-02); RMEs com os quatro tipos de destino.
- Entregas em todas as fases: **1 a caminho com IDs fixos** (contrato, fardos e dormentes documentados em `data.ts` e no `CLAUDE.md`, para imprimir as etiquetas com antecedência e para computador e celular partirem do mesmo estado), 1 recebida em parte (um fardo ainda em trânsito), 1 recebida aguardando inspeção, 1 em inspeção pela metade, várias concluídas.
- ~200 dormentes com situações variadas; ~5% reprovados (com uma reposição emitida); 2 dormentes não localizados num fardo concluído com justificativa; 1 fardo acima do limite de dias; 1 item abaixo do mínimo e 1 acima do máximo.
- DOFs: 1 vencido sem declaração, 1 vencendo em 1 dia, 1 em 3 dias, os demais declarados.
- RMEs: 1 aberta, 1 em separação, 1 pronta, 3 entregues (uma deixou fardo aberto), 1 cancelada.

---

## 16. Roteiro de demonstração (o que a banca vai ver)

Executado na Etapa 11, já com o Supabase, para computador e celular compartilharem os dados. Antes dele, o mesmo roteiro funciona com a entrega "a caminho" fixa no lugar da gerada no passo 3.

1. Login como **administrador**: Painel com indicadores e alertas.
2. Abrir um contrato e mostrar entregas por item.
3. **Simulador do fornecedor**: gerar uma entrega (com NF e DOF) e imprimir as etiquetas (já impressas e coladas em peças de madeira). Mostrar a entrega "A caminho" em NF e DOF, com o prazo da DOF.
4. Login como **almoxarife** no celular: **Receber**, escolher a entrega e ler os QR dos fardos.
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
| Fardos esperados da entrega | Opcionais no cadastro; sem eles, o recebimento aceita fardos do mesmo contrato emitidos e sem entrega |
| Quem pode cancelar a RME | O requisitante que abriu e o almoxarife, antes da entrega |
| ATENÇÃO do Inspector | Conta como reprovado (a confirmar com o time da inspeção) |
| Categorias e limites do índice | 1, 2 e 3, com limites 80 e 50 (a confirmar com o time da inspeção) |
| Nome popular de *Dialium guianense* | "Jataipeba" (a confirmar com a CPTM) |
| Padrão da plaquinha de identificação e lista de espécies aceitas por classe | Obter a Especificação Técnica CPTM **AD1956-4**; no protótipo, o fornecedor informa espécie e classe por fardo e qualquer espécie que ele fornece é aceita |
| Classe mínima por tipo de destino e prazo de cura | 1ª para linha principal de tráfego pesado, 2ª nos demais; cura de 15 dias para CCA e CCB (PIM-14 do DNIT e NBR 7511), até a AD1956-4 |
| Feriados no cálculo de dias úteis (laudo, comunicação e retirada de reprovados) | Lista editável nos parâmetros, com os feriados nacionais, do estado e da cidade de São Paulo de 2026 e 2027 (Carnaval, ponto facultativo, fora); confirmar o calendário da CPTM |
| Relatório anual ao IBAMA e destinação dos reprovados retirados | Confirmar se a CPTM entrega relatório anual (RAPP) e como os reprovados devolvidos ao fornecedor saem do saldo do DOF |
