-- Holz Trilho v2 · 0007 · Dados de demonstração: carga com datas do dia e "Reiniciar dados de demonstração"
-- A história de demonstração é a mesma do modo simulado (src/services/mock/data.ts), gerada pelas regras do app e
-- guardada aqui como modelo (tabela demonstracao, preenchida pelo seed.sql), com as datas do dia em que foi gerada.
-- carregar_demonstracao() a grava nas tabelas com TODAS as datas deslocadas para o dia em que é executada (a mesma
-- lógica de data-base do mock): parcelas no prazo e uma atrasada, fardos em cura, laudo vencido, DOFs perto do
-- prazo, o inventário de 3 dias atrás etc. Os prazos em dias úteis gravados (comunicação e retirada dos reprovados)
-- são recalculados com os feriados. Os feriados não se deslocam.
-- reiniciar_demonstracao(): só o administrador; recria os dados sem apagar as contas (auth.users) nem os perfis.

create table public.demonstracao (
  id smallint primary key default 1 check (id = 1),
  data_base date not null,          -- dia em que a história foi gerada
  linhas jsonb not null             -- { tabela: [linhas] }, como paraLinhas() em src/services/supabase/mapa.ts
);
alter table public.demonstracao enable row level security;   -- sem políticas: só as funções abaixo leem

-- ---------------------------------------------------------------------------------------------------------------
-- Deslocamento das datas
-- ---------------------------------------------------------------------------------------------------------------

-- Um texto: data (AAAA-MM-DD), instante (ISO) ou texto com datas dentro (descrições do histórico). IDs com números
-- (AR00224-01-000357) não são confundidos com datas: a data não pode estar colada em letra, número ou hífen.
create or replace function public.deslocar_texto(s text, dias integer) returns text
language plpgsql immutable as $$
declare
  m text[];
  saida text := '';
  resto text := s;
begin
  if s ~ '^\d{4}-\d{2}-\d{2}$' then return (s::date + dias)::text; end if;
  if s ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}' then
    return to_char((s::timestamptz + make_interval(days => dias)) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  end if;
  if s !~ '\d{4}-\d{2}-\d{2}' then return s; end if;
  loop
    m := regexp_match(resto, '^(.*?)(?<![0-9A-Za-z-])(\d{4}-\d{2}-\d{2})(?![0-9A-Za-z])(.*)$', 's');
    exit when m is null;
    saida := saida || m[1] || (m[2]::date + dias)::text;
    resto := m[3];
  end loop;
  return saida || resto;
end $$;

create or replace function public.deslocar_datas(j jsonb, dias integer) returns jsonb
language plpgsql immutable as $$
declare r jsonb;
begin
  case jsonb_typeof(j)
    when 'object' then
      select coalesce(jsonb_object_agg(key, public.deslocar_datas(value, dias)), '{}') into r from jsonb_each(j);
      return r;
    when 'array' then
      select coalesce(jsonb_agg(public.deslocar_datas(value, dias) order by n), '[]') into r from jsonb_array_elements(j) with ordinality x(value, n);
      return r;
    when 'string' then
      return to_jsonb(public.deslocar_texto(j #>> '{}', dias));
    else
      return j;
  end case;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Carga
-- ---------------------------------------------------------------------------------------------------------------

-- Tabelas de dados, na ordem de carga (a mesma de TABELAS em mapa.ts). Perfis e contas ficam fora.
create or replace function public.tabelas_de_dados() returns text[]
language sql immutable as $$
  select array['especies', 'tamanhos', 'tratamentos', 'empresas_inspetoras', 'locais', 'fornecedores', 'atas', 'ata_itens', 'contratos',
    'contrato_itens', 'contrato_parcelas', 'emissoes', 'nfs', 'nf_itens', 'dofs', 'dof_volumes', 'entregas', 'fardos', 'dormentes',
    'recebimentos', 'inspecoes', 'movimentacoes', 'rmes', 'rme_itens', 'rme_separacao', 'eventos', 'destinacoes', 'saldos_dof',
    'saldos_dof_itens', 'perdas', 'inventarios', 'inventario_esperados', 'inventario_leituras', 'inventario_locais',
    'inventario_diferencas', 'parametros', 'niveis_estoque', 'feriados', 'sequencias']
$$;

-- Grava as linhas ({ tabela: [linhas] }) nas tabelas vazias e acerta as sequências dos ids técnicos.
create or replace function public.carregar_linhas(p_linhas jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  t text;
  s record;
begin
  set constraints all deferred;
  foreach t in array public.tabelas_de_dados() loop
    if jsonb_array_length(coalesce(p_linhas->t, '[]')) > 0 then
      execute format('insert into public.%I select * from jsonb_populate_recordset(null::public.%I, $1)', t, t) using p_linhas->t;
    end if;
  end loop;
  -- Ids técnicos (es0001, mv0042): continuam de onde a história parou.
  for s in select c.relname, substr(c.relname, 5) as prefixo from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'S' and c.relname like 'seq\_%' loop
    perform setval('public.' || s.relname, coalesce((select valor from public.sequencias where nome = s.prefixo), 0) + 1, false);
  end loop;
  perform setval(pg_get_serial_sequence('public.inventario_leituras', 'ordem'), coalesce((select max(ordem) from public.inventario_leituras), 0) + 1, false);
  set constraints all immediate;
end $$;

-- A chave de acesso das NFs de exemplo traz o ano e o mês da emissão (AAMM): refeita com a emissão já deslocada.
create or replace function public.recalcular_chaves() returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.nfs set chave_acesso = public.chave_com_digito(left(chave_acesso, 2) || to_char(emissao, 'YYMM') || substr(chave_acesso, 7, 37))
  where chave_acesso <> public.chave_com_digito(left(chave_acesso, 2) || to_char(emissao, 'YYMM') || substr(chave_acesso, 7, 37));
  update public.emissoes set nf = jsonb_set(nf, '{chaveAcesso}', to_jsonb(public.chave_com_digito(left(nf->>'chaveAcesso', 2)
    || to_char((nf->>'emissao')::date, 'YYMM') || substr(nf->>'chaveAcesso', 7, 37))));
end $$;

-- Prazos em dias úteis gravados (comunicação e retirada dos reprovados): recalculados a partir do dia da
-- reprovação já deslocado, com os feriados, e o texto do histórico que os mostra é refeito.
create or replace function public.recalcular_prazos_uteis() returns void
language plpgsql security definer set search_path = public as $$
declare
  f record;
  v_dia date;
  v_com date;
  v_ret date;
begin
  for f in select * from public.fardos where reprovados_ids is not null loop
    -- O dia da reprovação: a primeira segregação do fardo depois da conclusão da inspeção (ou a da conclusão).
    select public.dia_sp(min(m.quando)) into v_dia from public.movimentacoes m where m.fardo_id = f.id and m.tipo = 'segregacao';
    v_dia := coalesce(v_dia, public.dia_sp(f.conclusao_em));
    v_com := public.somar_dias_uteis(v_dia, 5);
    v_ret := public.somar_dias_uteis(v_dia, 15);
    if v_com is distinct from f.comunicar_ate or v_ret is distinct from f.retirar_ate then
      update public.fardos set comunicar_ate = v_com, retirar_ate = v_ret where id = f.id;
      alter table public.eventos disable trigger eventos_so_inclusao;
      update public.eventos set descricao = regexp_replace(descricao, 'comunicar o fornecedor até \S+; retirada até \S+$',
        format('comunicar o fornecedor até %s; retirada até %s', v_com, v_ret))
      where entidade = 'fardo' and entidade_id = f.id and tipo = 'segregado' and descricao like '%comunicar o fornecedor até%';
      alter table public.eventos enable trigger eventos_so_inclusao;
    end if;
  end loop;
end $$;

-- Apaga os dados (não as contas nem os perfis) e grava a história de demonstração com as datas do dia.
create or replace function public.carregar_demonstracao() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_modelo public.demonstracao;
  v_dias integer;
  v_linhas jsonb;
  v_requisitante uuid;
begin
  select * into v_modelo from public.demonstracao where id = 1;
  if not found then perform public.falhar(409, 'O modelo da demonstração não foi carregado (execute o seed.sql).'); end if;
  -- As RMEs da demonstração são do requisitante de demonstração: sem a conta, a carga não segue.
  select id into v_requisitante from public.perfis where email = 'requisitante@example.com';
  if v_requisitante is null then
    perform public.falhar(409, 'A conta requisitante@example.com não foi encontrada em Authentication › Users. Crie-a (Add user, com Auto Confirm) e execute o seed.sql de novo.');
  end if;
  v_dias := public.hoje() - v_modelo.data_base;
  -- Os feriados são datas do calendário: não se deslocam.
  v_linhas := public.deslocar_datas(v_modelo.linhas - 'feriados', v_dias) || jsonb_build_object('feriados', v_modelo.linhas->'feriados');

  execute 'truncate ' || (select string_agg(format('public.%I', t), ', ') from unnest(public.tabelas_de_dados()) t) || ', public.anexos';
  perform public.carregar_linhas(v_linhas);
  perform public.recalcular_prazos_uteis();
  perform public.recalcular_chaves();

  update public.rmes set solicitante_id = v_requisitante where solicitante_id is null;
end $$;

-- "Reiniciar dados de demonstração" (Configurações, com a fonte Supabase): só o administrador.
create or replace function public.reiniciar_demonstracao() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir('admin');
  perform public.carregar_demonstracao();
  return to_jsonb('ok'::text);
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Funções internas: só as funções do banco as chamam (não ficam abertas pela API).
-- ---------------------------------------------------------------------------------------------------------------
revoke execute on function public.novo_id(text), public.registrar_evento(text, text, text, text, text), public.proximo_numero(text, bigint),
  public.ao_criar_conta(), public.criar_perfis_das_contas(), public.carregar_linhas(jsonb), public.carregar_demonstracao(), public.recalcular_prazos_uteis(),
  public.recalcular_chaves(), public.analisar_inventario(text, jsonb)
  from public, anon, authenticated;
