-- =============================================================================
-- Holz Trilho — Banco (Supabase / PostgreSQL 15+)
-- Migração 1/4: tipos, tabelas, restrições e índices
--
-- Espelha src/types/models.ts. O front lê pelas views da migração 3 (colunas
-- em camelCase, no formato dos modelos) e escreve pelas funções (RPC) da
-- migração 2; a RLS da migração 4 impede escrita direta nas tabelas de fluxo.
-- Nada de fluxo é apagado: cancelamento e rejeição viram estado + motivo.
-- =============================================================================

create extension if not exists pgcrypto;

create type origem_nf          as enum ('manual', 'xml');
create type etapa_inspecao     as enum ('aguardando', 'em_inspecao', 'concluida');
create type resultado_peca     as enum ('aprovado', 'quarentena', 'reprovado');
create type veredito_inspector as enum ('APROVADO', 'ATENCAO', 'REJEITADO');
create type origem_inspecao    as enum ('inspector', 'manual');
create type estado_dormente    as enum ('sem_fardo', 'em_estoque', 'baixado');
create type estado_fardo       as enum ('fechado', 'aberto', 'baixado');
create type status_rme         as enum ('aberta', 'em_separacao', 'conferida', 'entregue', 'cancelada');
create type urgencia_rme       as enum ('normal', 'urgente');
create type tipo_movimentacao  as enum ('entrada', 'saida', 'transferencia', 'perda', 'ajuste');
create type status_registro    as enum ('aprovado', 'pendente', 'bloqueado', 'rejeitado');
create type motivo_perda       as enum ('avaria', 'incendio', 'intemperie', 'furto', 'outro');

-- ---------------------------------------------------------------------------
-- Usuários, papéis e permissões (login = Supabase Auth)
-- ---------------------------------------------------------------------------
create table perfis (
  id            uuid primary key references auth.users (id) on delete cascade,
  nome          text not null,
  email         text,
  ativo         boolean not null default true,
  ultimo_acesso timestamptz,
  criado_em     timestamptz not null default now()
);

create table papeis (
  codigo text primary key,
  nome   text not null
);

create table permissoes (           -- mesmos códigos de src/dominio/permissoes.ts
  codigo    text primary key,
  descricao text not null
);

create table papel_permissoes (
  papel     text not null references papeis (codigo) on delete cascade,
  permissao text not null references permissoes (codigo) on delete cascade,
  primary key (papel, permissao)
);

create table usuario_papeis (
  usuario_id uuid not null references perfis (id) on delete cascade,
  papel      text not null references papeis (codigo),
  primary key (usuario_id, papel)
);

-- Parâmetros da CPTM (editados em Configurações; nunca constantes no código)
create table parametros (
  chave          text primary key,
  valor          numeric not null,
  descricao      text not null,
  provisorio     boolean not null default true,
  editavel       boolean not null default true,   -- false = regra fixa do PRD (tolerância do Ibama, 14 por fardo)
  atualizado_por uuid references perfis (id),
  atualizado_em  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Cadastros
-- ---------------------------------------------------------------------------
create table fornecedores (
  id           uuid primary key default gen_random_uuid(),
  razao_social text not null,
  cnpj         char(14) not null unique check (cnpj ~ '^[0-9]{14}$'),
  cidade_uf    text not null default '',
  status       status_registro not null default 'aprovado' check (status <> 'rejeitado'),
  criado_em    timestamptz not null default now()
);

create table especies (
  id              uuid primary key default gen_random_uuid(),
  numero          integer not null unique check (numero > 0),   -- posição na lista de espécies da RME
  nome_cientifico text not null unique,
  classe          text,                                        -- null = "a definir"
  observacao      text,
  uso             text not null default 'via' check (uso in ('via', 'AMV'))
);

create table tamanhos (
  id             uuid primary key default gen_random_uuid(),
  codigo         text not null,
  largura_cm     numeric(7,2) not null check (largura_cm > 0),
  altura_cm      numeric(7,2) not null check (altura_cm > 0),
  comprimento_cm numeric(7,2) not null check (comprimento_cm > 0),
  -- volume de UM dormente, sempre calculado pelo sistema
  volume_m3      numeric(12,6) generated always as (largura_cm * altura_cm * comprimento_cm / 1000000) stored,
  medidas        text not null default 'provisorio' check (medidas in ('provisorio', 'confirmado'))
);
create unique index tamanhos_codigo_unico on tamanhos (lower(codigo));

-- Endereços do pátio (tela Pátio); fardos e lotes guardam o endereço como texto
create table locais_patio (
  id         uuid primary key default gen_random_uuid(),
  codigo     text not null unique,
  descricao  text not null default '',
  capacidade integer not null default 0 check (capacidade >= 0),
  status     text not null default 'liberado' check (status in ('liberado', 'bloqueado', 'em_inventario'))
);

-- Metadados de arquivos (o conteúdo fica no Supabase Storage)
create table arquivos (
  id            uuid primary key default gen_random_uuid(),
  bucket        text not null,
  caminho       text not null,
  nome_original text not null,
  mime          text,
  tamanho_bytes bigint,
  enviado_por   uuid references perfis (id),
  enviado_em    timestamptz not null default now(),
  unique (bucket, caminho)
);

-- ---------------------------------------------------------------------------
-- Entrada: NF → DOF → recebimento
-- ---------------------------------------------------------------------------
create table notas_fiscais (
  id             uuid primary key default gen_random_uuid(),
  numero         text not null,
  serie          text not null default '1',
  chave_acesso   char(44) unique,                -- repetida é recusada
  fornecedor_id  uuid not null references fornecedores (id),
  emissao        date not null,
  origem         origem_nf not null default 'manual',
  xml_arquivo_id uuid references arquivos (id),
  dof_sugerido   text,                           -- DOF citado em infCpl do XML
  criado_por     uuid references perfis (id),
  criado_em      timestamptz not null default now(),
  unique (fornecedor_id, numero, serie)
);

create table nf_itens (
  id          uuid primary key default gen_random_uuid(),
  nf_id       uuid not null references notas_fiscais (id) on delete cascade,
  ordem       smallint not null,
  descricao   text not null default '',
  especie_id  uuid not null references especies (id),
  tamanho_id  uuid not null references tamanhos (id),
  quantidade  integer not null check (quantidade > 0),   -- em unidades
  unique (nf_id, ordem)
);

create table dofs (
  id               uuid primary key default gen_random_uuid(),
  nf_id            uuid not null unique references notas_fiscais (id),  -- um DOF por NF no MVP
  numero           text not null,
  codigo_controle  text not null,
  validade         date not null,
  -- art. 51: declarar no Sinaflor até o dia seguinte ao fim da validade
  prazo_declaracao date generated always as (validade + 1) stored,
  pdf_arquivo_id   uuid not null references arquivos (id),
  declarado_em     timestamptz,
  declarado_por    uuid references perfis (id),
  criado_por       uuid references perfis (id),
  criado_em        timestamptz not null default now()
);
create unique index dofs_codigo_controle_unico on dofs (lower(codigo_controle));

create table dof_volumes (                         -- volume do DOF por espécie, como no documento
  dof_id     uuid not null references dofs (id) on delete cascade,
  especie_id uuid not null references especies (id),
  volume_m3  numeric(12,4) not null check (volume_m3 > 0),
  primary key (dof_id, especie_id)
);

create table recebimentos (
  id                     uuid primary key default gen_random_uuid(),
  nf_id                  uuid not null unique references notas_fiscais (id),
  recebido_em            timestamptz not null default now(),
  recebido_por           uuid not null references perfis (id),
  avaria                 boolean not null default false,
  observacao             text,
  justificativa          text,
  divergencia_quantidade boolean not null default false,
  divergencia_volume_pct numeric(8,2) not null default 0,  -- maior diferença (com sinal) entre as espécies
  acima_tolerancia       boolean not null default false,
  check (not acima_tolerancia or length(trim(coalesce(justificativa, ''))) > 0)
);

create table recebimento_itens (
  recebimento_id uuid not null references recebimentos (id) on delete cascade,
  nf_item_id     uuid not null references nf_itens (id),
  quantidade     integer not null check (quantidade > 0),
  primary key (recebimento_id, nf_item_id)
);

create table recebimento_fotos (
  recebimento_id uuid not null references recebimentos (id) on delete cascade,
  arquivo_id     uuid not null references arquivos (id),
  primary key (recebimento_id, arquivo_id)
);

create table recebimento_volumes (
  recebimento_id     uuid not null references recebimentos (id) on delete cascade,
  especie_id         uuid not null references especies (id),
  volume_dof_m3      numeric(12,4) not null,
  volume_recebido_m3 numeric(12,4) not null,
  diferenca_pct      numeric(8,2) not null,
  primary key (recebimento_id, especie_id)
);

-- ---------------------------------------------------------------------------
-- Lotes, dormentes, inspeções e fardos
-- ---------------------------------------------------------------------------
create table lote_sequencias (ano smallint primary key, ultimo integer not null default 0);

create table lotes (
  id                    uuid primary key default gen_random_uuid(),
  codigo                text not null unique check (codigo ~ '^LT[0-9]{2}-[0-9]{4,}$'),
  ano                   smallint not null,
  sequencia             integer not null,
  nf_id                 uuid not null references notas_fiscais (id),
  recebimento_id        uuid not null references recebimentos (id),
  especie_id            uuid not null references especies (id),
  tamanho_id            uuid not null references tamanhos (id),
  quantidade            integer not null check (quantidade > 0),
  volume_calculado_m3   numeric(12,4) not null,
  volume_documental_m3  numeric(12,4) not null default 0,
  etapa_inspecao        etapa_inspecao not null default 'aguardando',
  inspecao_concluida_em timestamptz,
  inspecao_concluida_por uuid references perfis (id),
  divergente            boolean not null default false,   -- divergência de volume: fora da separação
  local                 text not null default 'A definir',
  recebido_em           timestamptz not null,
  unique (ano, sequencia),
  unique (recebimento_id, especie_id, tamanho_id)
);

create table fardos (
  id                 uuid primary key default gen_random_uuid(),
  lote_id            uuid not null references lotes (id),
  sequencia          smallint not null check (sequencia > 0),
  codigo             text not null unique,
  quantidade_inicial integer not null check (quantidade_inicial > 0),
  saldo              integer not null default 0 check (saldo >= 0),   -- = dormentes em estoque (gatilho)
  estado             estado_fardo not null default 'fechado',
  local              text not null,
  resultado          resultado_peca not null,
  categoria          smallint,
  motivo_bloqueio    text,
  formado_em         timestamptz not null default now(),
  formado_por        uuid references perfis (id),
  unique (lote_id, sequencia),
  check (resultado = 'aprovado' or categoria is null)
);

create table dormentes (                 -- uma linha por peça; o código é o da etiqueta (LT26-0042-0007)
  id                    uuid primary key default gen_random_uuid(),
  lote_id               uuid not null references lotes (id),
  sequencia             integer not null check (sequencia > 0),
  codigo                text not null unique,
  fardo_id              uuid references fardos (id),
  estado                estado_dormente not null default 'sem_fardo',
  inspecao_vigente_id   uuid,
  baixa_tipo            text check (baixa_tipo in ('saida', 'perda', 'ajuste')),
  baixa_referencia      text,
  baixa_em              timestamptz,
  baixa_por             uuid references perfis (id),
  unique (lote_id, sequencia),
  check ((estado = 'sem_fardo') = (fardo_id is null)),
  check ((estado = 'baixado') = (baixa_tipo is not null))
);

create table inspecoes (                 -- vale a mais recente de cada peça
  id              uuid primary key default gen_random_uuid(),
  dormente_id     uuid not null references dormentes (id),
  resultado       resultado_peca not null,
  veredito        veredito_inspector,
  indice          numeric(5,2) check (indice between 0 and 100),
  categoria       smallint,
  inspetor        text not null,
  estacao         text,
  inspecionado_em timestamptz not null default now(),
  relatorio_url   text check (relatorio_url is null or relatorio_url ~* '^https?://'),
  origem          origem_inspecao not null,
  id_externo      text unique,             -- id no banco do Inspector (idempotência)
  lancado_por     uuid references perfis (id),
  registrado_em   timestamptz not null default now(),
  check (origem = 'inspector' or lancado_por is not null)
);
alter table dormentes add constraint dormentes_inspecao_fk foreign key (inspecao_vigente_id) references inspecoes (id);

-- ---------------------------------------------------------------------------
-- RME (aberta → em separação → conferida → entregue | cancelada)
-- ---------------------------------------------------------------------------
create table rme_sequencias (ano smallint primary key, ultimo integer not null default 0);

create table rmes (
  id                  uuid primary key default gen_random_uuid(),
  numero              text not null unique,
  requisitante_id     uuid not null references perfis (id),
  destinatario        text not null,
  urgencia            urgencia_rme not null default 'normal',
  data_limite         date not null,
  observacao          text,
  aberta_em           timestamptz not null default now(),
  status              status_rme not null default 'aberta',
  supervisor_id       uuid references perfis (id),
  conferida_em        timestamptz,
  entregue_por        uuid references perfis (id),
  entregue_em         timestamptz,
  motivo_cancelamento text,
  check (status <> 'cancelada' or motivo_cancelamento is not null)
);

create table rme_itens (
  id                  uuid primary key default gen_random_uuid(),
  rme_id              uuid not null references rmes (id) on delete cascade,
  ordem               smallint not null,
  especie_id          uuid not null references especies (id),
  tamanho_id          uuid not null references tamanhos (id),
  quantidade          integer not null check (quantidade > 0),
  quantidade_entregue integer not null default 0,
  unique (rme_id, especie_id, tamanho_id)
);

create table rme_separacoes (            -- a vigente é a ativa; devolvidas ficam como histórico
  id              uuid primary key default gen_random_uuid(),
  rme_id          uuid not null references rmes (id) on delete cascade,
  seguiu_sugestao boolean not null,
  justificativa   text,
  almoxarife_id   uuid not null references perfis (id),
  separada_em     timestamptz not null default now(),
  ativa           boolean not null default true,
  check (seguiu_sugestao or length(trim(coalesce(justificativa, ''))) > 0)
);
create unique index rme_separacao_ativa on rme_separacoes (rme_id) where ativa;

create table rme_separacao_itens (
  separacao_id uuid not null references rme_separacoes (id) on delete cascade,
  item_id      uuid not null references rme_itens (id),
  fardo_id     uuid not null references fardos (id),
  quantidade   integer not null check (quantidade > 0),
  dormentes    text[] not null,
  saldo_fardo  integer not null,
  primary key (separacao_id, item_id, fardo_id)
);

-- Reserva: dormente separado em RME ainda não entregue (um por vez)
create table rme_reservas (
  dormente_id  uuid primary key references dormentes (id),
  rme_id       uuid not null references rmes (id),
  separacao_id uuid not null references rme_separacoes (id)
);

create table rme_eventos (
  id         bigint generated always as identity primary key,
  rme_id     uuid not null references rmes (id) on delete cascade,
  quando     timestamptz not null default now(),
  usuario_id uuid references perfis (id),
  acao       text not null,
  detalhe    text
);

-- ---------------------------------------------------------------------------
-- Movimentações
-- ---------------------------------------------------------------------------
create table movimentacoes (
  id              uuid primary key default gen_random_uuid(),
  tipo            tipo_movimentacao not null,
  lote_id         uuid not null references lotes (id),
  fardo_id        uuid references fardos (id),
  referencia      text,                       -- "NF 1000" (entrada) ou "RME26-0001" (saída)
  quantidade      integer not null check (quantidade <> 0),   -- negativa só no ajuste que retira
  origem          text not null default '—',
  destino         text not null default '—',
  data_hora       timestamptz not null default now(),
  usuario_id      uuid references perfis (id),
  status          status_registro not null default 'pendente',
  motivo_perda    motivo_perda,
  motivo          text,
  decidido_por    uuid references perfis (id),
  decidido_em     timestamptz,
  motivo_rejeicao text,
  check (tipo = 'ajuste' or quantidade > 0),
  check (tipo not in ('perda', 'ajuste') or length(trim(coalesce(motivo, ''))) > 0),
  check (status <> 'rejeitado' or length(trim(coalesce(motivo_rejeicao, ''))) > 0),
  -- quem registrou não decide (o mock aceita para demonstração; o banco não)
  check (decidido_por is null or usuario_id is null or decidido_por <> usuario_id or tipo in ('entrada', 'saida'))
);

create table movimentacao_dormentes (
  movimentacao_id uuid not null references movimentacoes (id) on delete cascade,
  dormente_id     uuid not null references dormentes (id),
  primary key (movimentacao_id, dormente_id)
);

-- ---------------------------------------------------------------------------
-- Inventário, visão computacional, exportações (fora do MVP, já persistidos)
-- ---------------------------------------------------------------------------
create table sessoes_inventario (
  id         uuid primary key default gen_random_uuid(),
  descricao  text not null,
  local      text not null,
  aberta_em  timestamptz not null default now(),
  aberta_por uuid references perfis (id),
  estado     text not null default 'em_contagem' check (estado in ('em_contagem', 'aguardando_aprovacao', 'aprovado', 'rejeitado')),
  ajuste     text not null default 'nao_aplicavel' check (ajuste in ('nao_aplicavel', 'pendente_aprovacao', 'aprovado'))
);

create table inventario_contagens (
  id            uuid primary key default gen_random_uuid(),
  sessao_id     uuid not null references sessoes_inventario (id) on delete cascade,
  lote_id       uuid not null references lotes (id),
  saldo_sistema integer not null,
  contagem      integer not null check (contagem >= 0),
  contado_por   uuid references perfis (id),
  contado_em    timestamptz not null default now(),
  unique (sessao_id, lote_id)
);

create table processamentos_imagem (     -- contagem por imagem: estimativa, nunca altera saldo
  id                uuid primary key default gen_random_uuid(),
  arquivo_id        uuid not null references arquivos (id),
  enviado_em        timestamptz not null default now(),
  enviado_por       uuid references perfis (id),
  estado            text not null default 'na_fila' check (estado in ('na_fila', 'processando', 'concluido', 'falha')),
  contagem_estimada integer,
  confianca         numeric(4,3) check (confianca between 0 and 1),
  revisao           text not null default 'nao_aplicavel' check (revisao in ('pendente', 'revisado', 'rejeitado', 'nao_aplicavel'))
);

create table exportacoes (
  id            uuid primary key default gen_random_uuid(),
  relatorio_id  text not null,
  formato       text not null,
  estado        text not null default 'solicitada' check (estado in ('solicitada', 'em_geracao', 'pronta', 'falha')),
  solicitada_por uuid references perfis (id),
  solicitada_em timestamptz not null default now()
);

create table auditoria (
  id          bigint generated always as identity primary key,
  tabela      text not null,
  registro_id text,
  acao        text not null,
  usuario_id  uuid,
  em          timestamptz not null default now(),
  antes       jsonb,
  depois      jsonb
);

-- ---------------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------------
create index on nf_itens (nf_id);
create index on notas_fiscais (emissao desc);
create index on lotes (nf_id);
create index on lotes (especie_id, tamanho_id);
create index on lotes (etapa_inspecao);
create index on dormentes (fardo_id, estado);
create index on dormentes (lote_id, estado);
create index on inspecoes (dormente_id, inspecionado_em desc);
create index on fardos (lote_id);
create index on rmes (status, aberta_em desc);
create index on rme_itens (rme_id);
create index on rme_separacao_itens (fardo_id);
create index on rme_reservas (rme_id);
create index on rme_eventos (rme_id, quando);
create index on movimentacoes (lote_id, data_hora);
create index on movimentacoes (fardo_id, data_hora);
create index on movimentacoes (status) where status = 'pendente';
create index on movimentacao_dormentes (dormente_id);
create index on auditoria (em desc);
