-- Holz Trilho v2 · 0002 · Perfis (Supabase Auth) e políticas RLS
-- As contas são criadas no painel do Supabase (Authentication › Users). Cada conta nova ganha uma linha em `perfis`
-- (gatilho abaixo) com o perfil de menor acesso (requisitante); o administrador muda o perfil na tela Usuários, e a
-- carga inicial (seed.sql) liga as quatro contas de demonstração aos seus perfis pelo e-mail.
-- As permissões são as mesmas de src/dominio/permissoes.ts. A tela só esconde botões; quem garante é o banco:
--   · leitura: qualquer usuário ativo com sessão (como o mock);
--   · escrita: nunca direto nas tabelas, só pelas funções do banco (0005, 0006), que conferem a permissão, validam
--     as regras, gravam numa transação só e registram os eventos (histórico e auditoria). Não há política de
--     inclusão, alteração nem exclusão: sem elas, o acesso direto às tabelas é só de leitura.

create table public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text not null unique,
  perfil text not null default 'requisitante' check (perfil in ('administrador', 'almoxarife', 'gestor', 'requisitante')),
  ativo boolean not null default true,
  criado_em timestamptz not null default public.agora()
);
alter table public.rmes add constraint rmes_solicitante_fk foreign key (solicitante_id) references public.perfis(id);

-- Conta criada no Supabase Auth → perfil (nome = parte do e-mail antes do @, até o administrador ajustar).
create or replace function public.ao_criar_conta() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (id, nome, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)), new.email)
  on conflict (id) do nothing;
  return new;
end $$;
create trigger ao_criar_conta after insert on auth.users for each row execute function public.ao_criar_conta();

-- Contas que já existiam no Auth antes desta migração (ex.: projeto do Supabase reaproveitado da v1) não passaram
-- pelo gatilho: ganham o perfil agora, com a mesma regra. O seed.sql chama de novo, antes de ligar as contas de
-- demonstração. Devolve quantos perfis criou.
create or replace function public.criar_perfis_das_contas() returns integer
language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  insert into public.perfis (id, nome, email)
  select u.id, coalesce(u.raw_user_meta_data->>'nome', split_part(u.email, '@', 1)), u.email
  from auth.users u where u.email is not null
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
select public.criar_perfis_das_contas();

-- Permissões de cada perfil (tabela da seção 12 do plano; igual a PERFIS em src/dominio/permissoes.ts).
create or replace function public.permissoes_do_perfil(p text) returns text[]
language sql immutable as $$
  select case p
    when 'administrador' then array['admin', 'operacao:consultar', 'cadastros:editar', 'contratos:editar', 'simulador:usar', 'nf:cadastrar', 'painel:gestao']
    when 'almoxarife' then array['operacao:consultar', 'simulador:usar', 'nf:cadastrar', 'recebimento:registrar', 'dof:declarar', 'inspecao:operar', 'estoque:movimentar', 'rme:separar']
    when 'gestor' then array['operacao:consultar', 'painel:gestao']
    when 'requisitante' then array['rme:abrir']
    else array[]::text[] end
$$;

-- Perfil de quem está logado (só se a conta estiver ativa).
create or replace function public.perfil_atual() returns public.perfis
language sql stable security definer set search_path = public as $$
  select * from public.perfis where id = auth.uid() and ativo
$$;

create or replace function public.ativo() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = auth.uid() and ativo)
$$;

-- Tem alguma das permissões?
create or replace function public.pode(variadic ps text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = auth.uid() and ativo and public.permissoes_do_perfil(perfil) && ps)
$$;

-- Nome de quem faz a operação (vai em criado_por, quem, eventos).
create or replace function public.quem() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select nome from public.perfis where id = auth.uid()), 'sistema')
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- RLS: liga em todas as tabelas e dá a leitura a quem está ativo.
-- ---------------------------------------------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['sequencias','especies','tamanhos','tratamentos','empresas_inspetoras','locais','fornecedores','atas','ata_itens',
    'contratos','contrato_itens','contrato_parcelas','anexos','emissoes','nfs','nf_itens','dofs','dof_volumes','entregas','fardos','dormentes',
    'recebimentos','inspecoes','movimentacoes','rmes','rme_itens','rme_separacao','eventos','destinacoes','saldos_dof','saldos_dof_itens',
    'perdas','parametros','niveis_estoque','feriados','inventarios','inventario_esperados','inventario_leituras','inventario_locais',
    'inventario_diferencas'] loop
    execute format('alter table public.%I enable row level security', t);
    if t <> 'sequencias' then
      execute format('create policy %I on public.%I for select to authenticated using (public.ativo())', t || '_ler', t);
    end if;
  end loop;
end $$;

-- Perfis: cada um lê o seu; o administrador lê todos (e muda perfil e situação pela função atualizar_usuario).
alter table public.perfis enable row level security;
create policy perfis_ler on public.perfis for select to authenticated using (id = auth.uid() or public.pode('admin'));

-- ---------------------------------------------------------------------------------------------------------------
-- Apoio às funções das operações (0005 e 0006)
-- ---------------------------------------------------------------------------------------------------------------

-- Erro de regra para a tela: o status (401, 403, 404, 409, 422) e os erros por campo vão no DETAIL, em JSON; a
-- implementação services/supabase/ converte em ApiError.
create or replace function public.falhar(status integer, mensagem text, campos jsonb default null) returns void
language plpgsql as $$
begin
  raise exception '%', mensagem using errcode = 'P0' || status::text, detail = jsonb_build_object('status', status, 'campos', campos)::text;
end $$;

-- Confere a sessão e a permissão no começo de cada função de escrita.
create or replace function public.exigir(variadic ps text[]) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.ativo() then perform public.falhar(401, 'Sessão expirada ou não autenticada. Entre novamente.'); end if;
  if not public.pode(variadic ps) then perform public.falhar(403, 'Você não tem permissão para executar esta operação.'); end if;
end $$;

-- Histórico e auditoria: toda função que muda o estado registra os seus eventos.
create or replace function public.registrar_evento(p_entidade text, p_entidade_id text, p_tipo text, p_descricao text, p_referencia text default null)
returns void language sql security definer set search_path = public as $$
  insert into public.eventos (tipo, entidade, entidade_id, descricao, referencia, quem)
  values (p_tipo, p_entidade, p_entidade_id, p_descricao, p_referencia, public.quem())
$$;

-- Local onde o dormente está: o do fardo ou, se reprovado, o de segregação.
create or replace function public.local_do_dormente(d public.dormentes) returns text
language sql stable set search_path = public as $$
  select case
    when d.situacao = 'reprovado' then d.local_id
    when d.situacao in ('em_estoque', 'reservado', 'aguardando_inspecao') then (select f.local_id from public.fardos f where f.id = d.fardo_id)
  end
$$;

-- Próximo número de uma sequência de documentos (INV, LT, RME por ano; NF e DOF do Simulador).
create or replace function public.proximo_numero(p_nome text, p_inicio bigint default 1) returns bigint
language plpgsql security definer set search_path = public as $$
declare n bigint;
begin
  insert into public.sequencias (nome, valor) values (p_nome, p_inicio)
  on conflict (nome) do update set valor = public.sequencias.valor + 1
  returning valor into n;
  return n;
end $$;
