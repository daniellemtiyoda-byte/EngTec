-- Holz Trilho v2 · 0001 · Tabelas, chaves e restrições
-- Espelha o estado do mock (src/services/mock/estado.ts): só o que é gravado. Tudo o que é calculado (saldo,
-- disponível, cura, situação do fardo e da parcela, prazos, divergência, saldo da ata) fica nas views (0004).
-- Regras garantidas aqui, no banco: IDs únicos e nunca reaproveitados (nada é apagado; o ID não muda), formatos dos
-- IDs, transições da situação do dormente e coerência entre a situação e os campos que ela exige.
-- Executar no editor SQL do Supabase, na ordem dos arquivos.

-- Relógio: o instante atual, que a carga da demonstração e os testes podem fixar (set_config('holz.agora', ...)).
-- Fora disso, é o now() do banco.
create or replace function public.agora() returns timestamptz
language sql stable as $$ select coalesce(nullif(current_setting('holz.agora', true), '')::timestamptz, now()) $$;

-- Dia de hoje em São Paulo (as datas de negócio são do fuso da CPTM).
create or replace function public.hoje() returns date
language sql stable as $$ select (public.agora() at time zone 'America/Sao_Paulo')::date $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Ids técnicos: prefixo + número (es0001, mv0042), como no mock. A carga inicial ajusta as sequências (seed.sql).
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.novo_id(prefixo text) returns text
language plpgsql volatile set search_path = public as $$
declare n bigint;
begin
  execute format('select nextval(%L)', 'public.seq_' || prefixo) into n;
  return prefixo || lpad(n::text, 4, '0');
end $$;

do $$
declare p text;
begin
  foreach p in array array['es','ta','tr','ei','lo','fo','at','ct','ic','em','en','nf','dof','ax','rc','in','mv','rm','ev','df','sd','pd','iv'] loop
    execute format('create sequence if not exists public.seq_%s', p);
  end loop;
end $$;

-- Números de documentos (NF e DOF de exemplo do Simulador, boletim, laudo, RME por ano).
create table public.sequencias (
  nome text primary key,
  valor bigint not null
);

-- ---------------------------------------------------------------------------------------------------------------
-- Cadastros
-- ---------------------------------------------------------------------------------------------------------------
create table public.especies (
  id text primary key default public.novo_id('es'),
  nome_cientifico text not null,
  nome_popular text not null,
  ativo boolean not null default true,
  constraint especies_nome_unico unique (nome_cientifico)
);

create table public.tamanhos (
  id text primary key default public.novo_id('ta'),
  codigo text not null unique check (codigo ~ '^\d{6}$'),        -- código de material CPTM
  uso text not null check (uso in ('via_corrente', 'amv')),
  comprimento_cm numeric not null check (comprimento_cm > 0),
  largura_cm numeric not null check (largura_cm > 0),
  altura_cm numeric not null check (altura_cm > 0),
  medidas text not null default 'provisorio' check (medidas in ('provisorio', 'confirmado')),
  ativo boolean not null default true
);

create table public.tratamentos (
  id text primary key default public.novo_id('tr'),
  preservativo text not null,
  empresa text not null,
  ativo boolean not null default true
);

create table public.empresas_inspetoras (
  id text primary key default public.novo_id('ei'),
  nome text not null unique,
  cnpj text unique check (cnpj is null or cnpj ~ '^\d{14}$'),
  ativo boolean not null default true
);

create table public.locais (
  id text primary key default public.novo_id('lo'),
  codigo text not null unique check (codigo ~ '^[A-Z0-9][A-Z0-9-]{0,11}$'),   -- vai no QR (LOC-código); não muda
  descricao text not null,
  tipo text not null check (tipo in ('armazenagem', 'inspecao', 'segregacao', 'expedicao')),
  capacidade integer not null check (capacidade > 0),
  ativo boolean not null default true
);

create table public.fornecedores (
  id text primary key default public.novo_id('fo'),
  razao_social text not null,
  cnpj text not null unique check (cnpj ~ '^\d{14}$'),
  cidade_uf text not null default '',
  ctf_ibama text not null default '',
  ctf_validade date,
  situacao text not null default 'ativo' check (situacao in ('ativo', 'inativo')),
  especies_ids text[] not null default '{}',
  certificados jsonb not null default '[]'
);

-- Perfis (ligados ao Supabase Auth) ficam em 0002.

-- ---------------------------------------------------------------------------------------------------------------
-- Suprimento: ata, contrato (itens e parcelas)
-- ---------------------------------------------------------------------------------------------------------------
create table public.atas (
  id text primary key default public.novo_id('at'),
  numero text not null unique check (numero ~ '^[A-Z]{2}\d{5}$'),
  fornecedor_id text not null references public.fornecedores(id),
  vigencia_inicio date not null,
  vigencia_fim date not null check (vigencia_fim > vigencia_inicio),
  regras jsonb not null       -- { pedidoMinimo, maxParcelas, parcelaMinima, parcelaMaxima, prazosParcelas: [[de, ate], ...] }
);

create table public.ata_itens (
  ordem integer not null default 0,         -- ordem da lista (a mesma do app)
  ata_id text not null references public.atas(id),
  tamanho_id text not null references public.tamanhos(id),
  quantidade integer not null check (quantidade > 0),
  primary key (ata_id, tamanho_id)
);

create table public.contratos (
  id text primary key default public.novo_id('ct'),
  numero text not null unique check (numero ~ '^[A-Z]{2}\d{5}-\d{2}$'),
  ata_id text not null references public.atas(id),
  ano integer not null,
  data_assinatura date not null,
  gestor text not null,
  situacao text not null default 'vigente' check (situacao in ('vigente', 'cancelado')),   -- "concluído" é calculado
  motivo_cancelamento text,
  criado_em timestamptz not null default public.agora(),
  criado_por text not null,
  -- Próximas sequências de fardo e dormente (emitidas pelo fornecedor; nunca voltam nem se repetem).
  proximo_fardo integer not null default 1 check (proximo_fardo between 1 and 1000),
  proximo_dormente integer not null default 1 check (proximo_dormente between 1 and 1000000),
  check (situacao <> 'cancelado' or motivo_cancelamento is not null)
);

create table public.contrato_itens (
  ordem integer not null default 0,         -- ordem da lista (a mesma do app)
  id text primary key default public.novo_id('ic'),
  contrato_id text not null references public.contratos(id),
  tamanho_id text not null references public.tamanhos(id),
  quantidade integer not null check (quantidade > 0),
  unique (contrato_id, tamanho_id)
);

create table public.contrato_parcelas (
  ordem integer not null default 0,         -- ordem da lista (a mesma do app)
  contrato_id text not null references public.contratos(id),
  numero integer not null check (numero between 1 and 12),
  tamanho_id text not null references public.tamanhos(id),
  quantidade integer not null check (quantidade > 0),
  primary key (contrato_id, numero, tamanho_id)
);

-- ---------------------------------------------------------------------------------------------------------------
-- Anexos (arquivos no bucket privado "anexos"; ver 0003). O objeto do anexo também vai embutido (jsonb) no documento.
-- ---------------------------------------------------------------------------------------------------------------
create table public.anexos (
  id text primary key default public.novo_id('ax'),
  nome text not null,
  tipo text not null check (tipo in ('pdf', 'xml', 'imagem')),
  caminho text,                      -- caminho no bucket: <entidade>/<id>/<arquivo>; vazio nos dados de demonstração
  enviado_em timestamptz not null default public.agora(),
  enviado_por text not null
);

-- ---------------------------------------------------------------------------------------------------------------
-- Entrada: emissão do fornecedor (Simulador), NF, DOF, entrega, fardo, dormente, recebimento, inspeção
-- ---------------------------------------------------------------------------------------------------------------
create table public.emissoes (
  id text primary key default public.novo_id('em'),
  contrato_id text not null references public.contratos(id),
  fardos_ids text[] not null,
  parcela integer not null,
  reentrega boolean not null default false,
  com_documentos boolean not null,
  boletim jsonb,
  relatorio_tecnico jsonb,
  nf jsonb not null,                 -- NF de exemplo { numero, serie, chaveAcesso, emissao, itens }
  dof jsonb not null,                -- DOF de exemplo { numero, validade, volumes }
  entrega_id text,
  criado_em timestamptz not null default public.agora(),
  criado_por text not null
);

create table public.nfs (
  id text primary key default public.novo_id('nf'),
  numero text not null,
  serie text not null,
  chave_acesso text not null unique check (chave_acesso ~ '^\d{44}$'),
  fornecedor_id text not null references public.fornecedores(id),
  contrato_id text not null references public.contratos(id),
  emissao date not null,
  entrega_id text,
  xml jsonb,
  criado_em timestamptz not null default public.agora(),
  criado_por text not null
);

create table public.nf_itens (
  ordem integer not null default 0,         -- ordem da lista (a mesma do app)
  nf_id text not null references public.nfs(id),
  item_contrato_id text not null references public.contrato_itens(id),
  quantidade integer not null check (quantidade > 0),
  volume_m3 numeric not null check (volume_m3 > 0),
  primary key (nf_id, item_contrato_id)
);

create table public.dofs (
  id text primary key default public.novo_id('dof'),
  numero text not null unique,
  nf_id text not null references public.nfs(id),
  validade date not null,
  pdf jsonb,
  declarado_em timestamptz,          -- declarada no Sinaflor (uma vez só)
  declarado_por text,
  check ((declarado_em is null) = (declarado_por is null))
);

create table public.dof_volumes (
  ordem integer not null default 0,         -- ordem da lista (a mesma do app)
  dof_id text not null references public.dofs(id),
  especie_id text not null references public.especies(id),
  volume_m3 numeric not null check (volume_m3 > 0),
  primary key (dof_id, especie_id)
);

create table public.entregas (
  id text primary key default public.novo_id('en'),
  contrato_id text not null references public.contratos(id),
  nf_id text not null unique references public.nfs(id),
  dof_id text not null unique references public.dofs(id),
  fardos_ids text[] not null default '{}',       -- fardos esperados
  parcela integer not null,
  reentrega boolean not null default false,
  situacao text not null default 'a_caminho' check (situacao in ('a_caminho', 'recebida_parcial', 'recebida')),
  origem text not null check (origem in ('cadastro', 'simulador', 'recebimento')),
  boletim jsonb,                     -- Boletim de Inspeção { numero, data, empresaInspetoraId, itens, arquivo }
  relatorio_tecnico jsonb,           -- { numero, data, arquivo }
  laudo jsonb,                       -- Laudo Técnico { numero, emitidoEm, emitidoPor, aprovados, reprovados }
  criado_em timestamptz not null default public.agora(),
  criado_por text not null
);
create unique index entregas_laudo_numero on public.entregas ((laudo->>'numero')) where laudo is not null;
alter table public.emissoes add constraint emissoes_entrega_fk foreign key (entrega_id) references public.entregas(id);
alter table public.nfs add constraint nfs_entrega_fk foreign key (entrega_id) references public.entregas(id);

create table public.fardos (
  id text primary key check (id ~ '^[A-Z]{2}\d{5}-\d{2}-F\d{3}$'),      -- <contrato>-F<3 dígitos>
  contrato_id text not null references public.contratos(id),
  item_contrato_id text not null references public.contrato_itens(id),
  especie_id text not null references public.especies(id),
  classe smallint not null check (classe in (1, 2)),
  tratamento_id text not null references public.tratamentos(id),
  usina_tratamento text not null,
  data_tratamento date not null,
  emissao_id text references public.emissoes(id),
  quantidade_inicial integer not null check (quantidade_inicial > 0),
  entrega_id text references public.entregas(id),
  recebido_em timestamptz,
  local_id text references public.locais(id),
  falta_declarada integer check (falta_declarada > 0),
  -- Conclusão da inspeção
  conclusao_em timestamptz,
  conclusao_por text,
  conclusao_justificativa text,
  nao_localizados text[] not null default '{}',
  -- Reprovação (comunicação ao fornecedor e retirada)
  reprovados_ids text[],
  comunicar_ate date,
  retirar_ate date,
  comunicado_em timestamptz,
  comunicado_por text,
  retirado_em timestamptz,
  retirado_por text,
  check (conclusao_em is null or recebido_em is not null),
  check (cardinality(nao_localizados) = 0 or conclusao_justificativa is not null),
  check (retirado_em is null or comunicado_em is not null)
);

create table public.dormentes (
  id text primary key check (id ~ '^[A-Z]{2}\d{5}-\d{2}-\d{6}$'),        -- <contrato>-<6 dígitos>
  contrato_id text not null references public.contratos(id),
  item_contrato_id text not null references public.contrato_itens(id),
  fardo_id text not null references public.fardos(id),
  especie_id text not null references public.especies(id),
  classe smallint not null check (classe in (1, 2)),
  tratamento_id text not null references public.tratamentos(id),
  usina_tratamento text not null,
  data_tratamento date not null,
  situacao text not null default 'emitido' check (situacao in (
    'emitido', 'aguardando_inspecao', 'em_estoque', 'reservado', 'baixado', 'reprovado', 'retirado', 'nao_localizado', 'perdido')),
  inspecao_id text,
  categoria smallint check (categoria between 1 and 3),
  comprimento_cm numeric check (comprimento_cm > 0),
  largura_cm numeric check (largura_cm > 0),
  altura_cm numeric check (altura_cm > 0),
  rme_numero text,
  local_id text references public.locais(id),
  -- Coerência entre a situação e o que ela exige (o saldo é sempre contado a partir daqui, nunca gravado à parte).
  check (situacao not in ('reservado', 'baixado') or rme_numero is not null),
  check (situacao <> 'reprovado' or local_id is not null),
  check (situacao <> 'retirado' or local_id is null),
  check (situacao <> 'em_estoque' or inspecao_id is not null),
  check ((comprimento_cm is null) = (largura_cm is null) and (largura_cm is null) = (altura_cm is null))
);
create index dormentes_fardo on public.dormentes (fardo_id);
create index dormentes_situacao on public.dormentes (situacao);

create table public.recebimentos (
  id text primary key default public.novo_id('rc'),
  entrega_id text not null references public.entregas(id),
  nf_id text not null references public.nfs(id),
  dof_id text not null references public.dofs(id),
  recebido_em timestamptz not null default public.agora(),
  recebido_por text not null,
  canhoto jsonb,
  fardos_esperados text[] not null default '{}',
  fardos_lidos text[] not null default '{}',
  conforme boolean not null,
  ocorrencias jsonb not null default '[]',
  divergencia_volume jsonb not null default '[]',   -- a do momento do recebimento (a atual é calculada)
  justificativa_divergencia text,
  justificativa_automatica boolean not null default false,
  local_espera_id text not null references public.locais(id)
);

create table public.inspecoes (
  id text primary key default public.novo_id('in'),
  dormente_id text not null references public.dormentes(id),
  fardo_id text not null references public.fardos(id),
  resultado text not null check (resultado in ('aprovado', 'reprovado')),
  categoria smallint check (categoria between 1 and 3),
  indice numeric,
  veredito text,
  comprimento_cm numeric,
  largura_cm numeric,
  altura_cm numeric,
  inspetor text not null,
  inspecionado_em timestamptz not null default public.agora(),
  origem text not null check (origem in ('inspector', 'manual', 'simulado')),
  relatorio_url text,
  check (resultado <> 'aprovado' or categoria is not null)
);
create index inspecoes_dormente on public.inspecoes (dormente_id, inspecionado_em desc);
alter table public.dormentes add constraint dormentes_inspecao_fk foreign key (inspecao_id) references public.inspecoes(id);

-- ---------------------------------------------------------------------------------------------------------------
-- Estoque e saída
-- ---------------------------------------------------------------------------------------------------------------
create table public.movimentacoes (
  id text primary key default public.novo_id('mv'),
  tipo text not null check (tipo in ('guarda', 'transferencia', 'segregacao', 'saida', 'retirada')),
  fardo_id text not null references public.fardos(id),
  dormentes_ids text[],
  quantidade integer not null check (quantidade > 0),
  de_local_id text references public.locais(id),
  para_local_id text references public.locais(id),
  quando timestamptz not null default public.agora(),
  quem text not null,
  referencia text
);
create index movimentacoes_fardo on public.movimentacoes (fardo_id, quando);

create table public.rmes (
  id text primary key default public.novo_id('rm'),
  numero text not null unique check (numero ~ '^RME-\d{4}-\d{4}$'),
  solicitante_id uuid,               -- perfis.id (referência criada em 0002)
  solicitante_nome text not null,
  destino text not null,
  tipo_destino text not null check (tipo_destino in ('principal_pesado', 'principal_medio', 'desvio', 'patio')),
  necessidade_em date not null,
  situacao text not null default 'aberta' check (situacao in ('aberta', 'em_separacao', 'pronta', 'entregue', 'cancelada')),
  motivo_cancelamento text,
  criado_em timestamptz not null default public.agora(),
  check (situacao <> 'cancelada' or motivo_cancelamento is not null)
);

create table public.rme_itens (
  rme_id text not null references public.rmes(id),
  ordem integer not null,
  tamanho_id text not null references public.tamanhos(id),
  classe smallint not null check (classe in (1, 2)),
  categoria_minima smallint check (categoria_minima between 1 and 3),
  especie_id text references public.especies(id),
  quantidade integer not null check (quantidade > 0),
  primary key (rme_id, ordem),
  unique (rme_id, tamanho_id, classe)
);

create table public.rme_separacao (
  ordem integer not null default 0,         -- ordem da lista (a mesma do app)
  rme_id text not null references public.rmes(id),
  fardo_id text not null references public.fardos(id),
  dormentes_ids text[] not null check (cardinality(dormentes_ids) > 0),
  seguiu_sugestao boolean not null,
  justificativa text,
  justificativa_classe text,
  primary key (rme_id, fardo_id),
  check (seguiu_sugestao or justificativa is not null)
);

-- ---------------------------------------------------------------------------------------------------------------
-- Histórico e auditoria, IBAMA, parâmetros
-- ---------------------------------------------------------------------------------------------------------------
create table public.eventos (
  id text primary key default public.novo_id('ev'),
  tipo text not null,
  entidade text not null,
  entidade_id text not null,
  descricao text not null,
  referencia text,
  quem text not null,
  quando timestamptz not null default public.agora()
);
create index eventos_entidade on public.eventos (entidade, entidade_id, quando);

create table public.destinacoes (
  id text primary key default public.novo_id('df'),
  rme_id text not null references public.rmes(id),
  rme_numero text not null,
  especie_id text not null references public.especies(id),
  quantidade integer not null check (quantidade > 0),
  volume_m3 numeric not null check (volume_m3 > 0),
  entregue_em timestamptz not null,
  lancado_em timestamptz,
  lancado_por text,
  unique (rme_id, especie_id),
  check ((lancado_em is null) = (lancado_por is null))
);

create table public.saldos_dof (
  id text primary key default public.novo_id('sd'),
  data date not null,
  observacao text,
  quem text not null,
  quando timestamptz not null default public.agora()
);

create table public.saldos_dof_itens (
  ordem integer not null default 0,         -- ordem da lista (a mesma do app)
  saldo_id text not null references public.saldos_dof(id),
  especie_id text not null references public.especies(id),
  volume_m3 numeric not null check (volume_m3 >= 0),
  primary key (saldo_id, especie_id)
);

create table public.perdas (
  id text primary key default public.novo_id('pd'),
  dormente_id text not null unique references public.dormentes(id),
  fardo_id text not null references public.fardos(id),
  contrato_id text not null references public.contratos(id),
  especie_id text not null references public.especies(id),
  tamanho_id text not null references public.tamanhos(id),
  volume_m3 numeric not null,
  motivo text not null check (motivo in ('extravio', 'avaria', 'incendio', 'intemperie', 'outro')),
  descricao text,
  quando timestamptz not null default public.agora(),
  quem text not null,
  comunicado_em timestamptz,
  comunicado_por text,
  check (motivo <> 'outro' or descricao is not null),
  check ((comunicado_em is null) = (comunicado_por is null))
);

-- Inventário físico por leitura de QR (IN Ibama 21/2014, art. 41). Não existe ajuste de quantidade: o fechamento
-- (função fechar_inventario, 0006) trata cada diferença dormente a dormente.
create table public.inventarios (
  id text primary key default public.novo_id('iv'),
  numero text not null unique check (numero ~ '^INV-\d{4}-\d{4}$'),
  locais_ids text[] not null check (cardinality(locais_ids) > 0),
  situacao text not null default 'aberto' check (situacao in ('aberto', 'fechado')),
  aberto_em timestamptz not null default public.agora(),
  aberto_por text not null,
  fechado_em timestamptz,
  fechado_por text,
  -- Totais gravados no fechamento: localizados (em qualquer local do inventário; os relatórios do IBAMA usam este)
  -- e no lugar certo (no local esperado).
  esperados_total integer,
  localizados_total integer,
  no_lugar_certo_total integer,
  percentual_localizados numeric,
  percentual_no_lugar_certo numeric,
  check ((situacao = 'fechado') = (fechado_em is not null))
);

-- O que deveria estar em cada local na abertura (dormente a dormente).
create table public.inventario_esperados (
  ordem integer not null default 0,         -- ordem da lista (a mesma do app)
  inventario_id text not null references public.inventarios(id),
  dormente_id text not null references public.dormentes(id),
  fardo_id text not null references public.fardos(id),
  local_id text not null references public.locais(id),
  primary key (inventario_id, dormente_id)
);

create table public.inventario_leituras (
  inventario_id text not null references public.inventarios(id),
  ordem bigint generated always as identity,
  tipo text not null check (tipo in ('fardo', 'dormente')),
  item_id text not null,
  local_id text not null references public.locais(id),
  quando timestamptz not null default public.agora(),
  quem text not null,
  primary key (inventario_id, ordem)
);

-- Resultado gravado no fechamento.
create table public.inventario_locais (
  inventario_id text not null references public.inventarios(id),
  local_id text not null references public.locais(id),
  esperados integer not null,
  localizados integer not null,
  no_lugar_certo integer not null,
  percentual_localizados numeric not null,
  percentual_no_lugar_certo numeric not null,
  diferencas integer not null,
  primary key (inventario_id, local_id)
);

create table public.inventario_diferencas (
  ordem integer not null default 0,         -- ordem da lista (a mesma do app)
  inventario_id text not null references public.inventarios(id),
  grupo text not null check (grupo in ('local_errado', 'nao_encontrado', 'inesperado')),
  tipo text not null check (tipo in ('fardo', 'dormente')),
  item_id text not null,
  fardo_id text not null,
  local_id text references public.locais(id),        -- onde deveria estar
  lido_em_id text references public.locais(id),      -- onde foi lido
  quantidade integer not null check (quantidade > 0),
  motivo text not null,
  justificativa text,
  primary key (inventario_id, grupo, tipo, item_id),
  check (grupo <> 'inesperado' or justificativa is not null)
);

-- Uma linha só (id = 1).
create table public.parametros (
  id smallint primary key default 1 check (id = 1),
  limite_dias_estoque integer not null default 120,
  alerta_dof_dias integer[] not null default '{3,1}',
  tolerancia_volume_pct numeric not null default 10,
  limites_categoria integer[] not null default '{80,50}',
  dormentes_por_fardo_padrao integer not null default 14,
  alerta_laudo_dias integer[] not null default '{5,2}',
  modo_demonstracao boolean not null default true
);

create table public.niveis_estoque (
  ordem integer not null default 0,         -- ordem da lista (a mesma do app)
  classe smallint not null check (classe in (1, 2)),
  tamanho_id text not null references public.tamanhos(id),
  minimo integer not null check (minimo >= 0),
  maximo integer not null check (maximo >= minimo),
  primary key (classe, tamanho_id)
);

create table public.feriados (
  data date primary key,
  nome text not null,
  abrangencia text not null check (abrangencia in ('nacional', 'estadual', 'municipal'))
);

-- ---------------------------------------------------------------------------------------------------------------
-- Gatilhos de integridade
-- ---------------------------------------------------------------------------------------------------------------

-- Nada é apagado: só inativado. Vale para todas as tabelas de dados (o histórico, inclusive).
create or replace function public.impedir_exclusao() returns trigger
language plpgsql as $$
begin
  raise exception 'Registros não são apagados (tabela %): use a inativação.', tg_table_name using errcode = 'P0409';
end $$;

-- O ID não muda depois de criado (está impresso no QR ou referenciado em outros registros).
create or replace function public.impedir_troca_de_id() returns trigger
language plpgsql as $$
begin
  if new.id is distinct from old.id then
    raise exception 'O ID % não pode ser alterado.', old.id using errcode = 'P0409';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['especies','tamanhos','tratamentos','empresas_inspetoras','locais','fornecedores','atas','contratos','contrato_itens',
    'anexos','emissoes','nfs','dofs','entregas','fardos','dormentes','recebimentos','inspecoes','movimentacoes','rmes','eventos','destinacoes',
    'saldos_dof','perdas','inventarios'] loop
    execute format('create trigger %I before delete on public.%I for each row execute function public.impedir_exclusao()', t || '_sem_exclusao', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.impedir_troca_de_id()', t || '_id_fixo', t);
  end loop;
  foreach t in array array['ata_itens','contrato_parcelas','nf_itens','dof_volumes','rme_itens','rme_separacao','saldos_dof_itens',
    'inventario_esperados','inventario_leituras','inventario_locais','inventario_diferencas'] loop
    execute format('create trigger %I before delete on public.%I for each row execute function public.impedir_exclusao()', t || '_sem_exclusao', t);
  end loop;
end $$;

-- Os itens e as parcelas do contrato são trocados pelo novo cronograma (0005, atualizar_contrato) e as linhas de
-- separação, pelo cancelamento: essas funções desligam a trava só durante a própria transação.
create or replace function public.impedir_exclusao_salvo_liberada() returns trigger
language plpgsql as $$
begin
  if current_setting('holz.permitir_troca', true) = 'sim' then return old; end if;
  raise exception 'Registros não são apagados (tabela %).', tg_table_name using errcode = 'P0409';
end $$;
drop trigger contrato_parcelas_sem_exclusao on public.contrato_parcelas;
create trigger contrato_parcelas_sem_exclusao before delete on public.contrato_parcelas for each row execute function public.impedir_exclusao_salvo_liberada();
drop trigger rme_separacao_sem_exclusao on public.rme_separacao;
create trigger rme_separacao_sem_exclusao before delete on public.rme_separacao for each row execute function public.impedir_exclusao_salvo_liberada();

-- Evento é só de inclusão: não se altera.
create or replace function public.impedir_alteracao() returns trigger
language plpgsql as $$
begin
  raise exception 'O histórico não é alterado.' using errcode = 'P0409';
end $$;
create trigger eventos_so_inclusao before update on public.eventos for each row execute function public.impedir_alteracao();

-- O código do local não muda (está no QR impresso); local com dormentes não é inativado.
create or replace function public.validar_local() returns trigger
language plpgsql as $$
begin
  if new.codigo <> old.codigo then
    raise exception 'O código do local não muda depois de criado (está no QR).' using errcode = 'P0422';
  end if;
  if old.ativo and not new.ativo and exists (
    select 1 from public.fardos f join public.dormentes d on d.fardo_id = f.id
    where f.local_id = old.id and d.situacao in ('aguardando_inspecao', 'em_estoque', 'reservado')
    union all select 1 from public.dormentes d where d.local_id = old.id and d.situacao = 'reprovado'
  ) then
    raise exception 'O local % tem dormentes e não pode ser inativado.', old.codigo using errcode = 'P0409';
  end if;
  return new;
end $$;
create trigger locais_validar before update on public.locais for each row execute function public.validar_local();

-- O ID do fardo e do dormente começa pelo número do contrato.
create or replace function public.validar_id_do_contrato() returns trigger
language plpgsql as $$
declare num text;
begin
  select numero into num from public.contratos where id = new.contrato_id;
  if left(new.id, length(num) + 1) <> num || '-' then
    raise exception 'O ID % não pertence ao contrato %.', new.id, num using errcode = 'P0422';
  end if;
  return new;
end $$;
create trigger fardos_id_contrato before insert on public.fardos for each row execute function public.validar_id_do_contrato();
create trigger dormentes_id_contrato before insert on public.dormentes for each row execute function public.validar_id_do_contrato();

-- Transições permitidas da situação do dormente (as mesmas de movimentarDormentes() no mock).
create or replace function public.validar_transicao_dormente() returns trigger
language plpgsql as $$
declare permitidas text[];
begin
  if new.situacao = old.situacao then return new; end if;
  permitidas := case old.situacao
    when 'emitido' then array['aguardando_inspecao']
    when 'aguardando_inspecao' then array['em_estoque', 'reprovado', 'nao_localizado']
    when 'nao_localizado' then array['em_estoque', 'reprovado', 'perdido']
    when 'em_estoque' then array['reservado', 'nao_localizado']          -- não encontrado no inventário
    when 'reservado' then array['em_estoque', 'baixado', 'nao_localizado']
    when 'reprovado' then array['retirado', 'nao_localizado']
    else array[]::text[] end;
  if not new.situacao = any(permitidas) then
    raise exception 'O dormente % não pode passar de "%" para "%".', old.id, old.situacao, new.situacao using errcode = 'P0409';
  end if;
  if new.fardo_id <> old.fardo_id then
    raise exception 'O dormente % não muda de fardo.', old.id using errcode = 'P0409';
  end if;
  return new;
end $$;
create trigger dormentes_transicao before update on public.dormentes for each row execute function public.validar_transicao_dormente();
