-- Holz Trilho v2 · 0006 · Inventário físico por leitura de QR (IN Ibama 21/2014, art. 41)
-- Mesmas regras de src/services/mock/inventario.ts. Cada função roda numa transação só (uma chamada = tudo ou nada).
--   abrir_inventario(locais)          → guarda o que deveria estar em cada local (dormente a dormente)
--   ler_inventario(id, tipo, item, local) → registra a leitura e devolve o retorno para a tela de campo
--   previa_inventario(id)             → o resultado que o fechamento vai gravar, sem gravar
--   fechar_inventario(id, justificativas) → corrige o local errado (transferência), marca os não encontrados como
--                                        "não localizado", grava os inesperados com a justificativa (obrigatória)
-- Não existe ajuste de quantidade: toda diferença é tratada dormente a dormente.

-- Situações em que o dormente está no pátio, num local.
create or replace function public.no_patio(s text) returns boolean
language sql immutable as $$ select s in ('aguardando_inspecao', 'em_estoque', 'reservado', 'reprovado') $$;

-- Percentual com uma casa (100 quando não havia nada esperado), como no mock.
create or replace function public.pct(n integer, de integer) returns numeric
language sql immutable as $$ select case when de = 0 then 100 else round(n * 100.0 / de, 1) end $$;

create or replace function public.codigo_do_local(p_id text) returns text
language sql stable set search_path = public as $$ select coalesce((select codigo from public.locais where id = p_id), '—') $$;

-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.abrir_inventario(p_locais text[]) returns public.inventarios
language plpgsql security definer set search_path = public as $$
declare
  v_ids text[] := array(select distinct unnest(coalesce(p_locais, '{}')));
  v_local public.locais;
  v_outro text;
  v_inv public.inventarios;
  v_ano text := to_char(public.agora() at time zone 'America/Sao_Paulo', 'YYYY');
begin
  perform public.exigir('estoque:movimentar');
  if cardinality(v_ids) = 0 then
    perform public.falhar(422, 'Escolha ao menos um local.', jsonb_build_object('locaisIds', 'Escolha ao menos um local.'));
  end if;
  foreach v_outro in array v_ids loop
    select * into v_local from public.locais where id = v_outro;
    if not found then perform public.falhar(404, 'Local não encontrado.'); end if;
    if not v_local.ativo then
      perform public.falhar(422, format('O local %s está inativo.', v_local.codigo), jsonb_build_object('locaisIds', format('O local %s está inativo.', v_local.codigo)));
    end if;
  end loop;
  -- Um local só pode estar num inventário aberto de cada vez (trava as linhas para não abrir dois ao mesmo tempo).
  perform 1 from public.locais where id = any(v_ids) for update;
  select i.numero into v_outro from public.inventarios i where i.situacao = 'aberto' and i.locais_ids && v_ids limit 1;
  if v_outro is not null then
    perform public.falhar(409, format('Um dos locais já está no inventário %s, ainda aberto.', v_outro), jsonb_build_object('locaisIds', format('Já está em %s.', v_outro)));
  end if;

  insert into public.inventarios (numero, locais_ids, aberto_por)
  values (format('INV-%s-%s', v_ano, lpad(public.proximo_numero('inventario' || v_ano)::text, 4, '0')), v_ids, public.quem())
  returning * into v_inv;

  insert into public.inventario_esperados (inventario_id, dormente_id, fardo_id, local_id)
  select v_inv.id, d.id, d.fardo_id, public.local_do_dormente(d)
  from public.dormentes d
  where public.no_patio(d.situacao) and public.local_do_dormente(d) = any(v_ids);

  perform public.registrar_evento('inventario', v_inv.id, 'criado',
    format('Inventário aberto: %s (%s dormentes esperados)', (select string_agg(public.codigo_do_local(x), ', ') from unnest(v_ids) x),
      (select count(*) from public.inventario_esperados where inventario_id = v_inv.id)), v_inv.numero);
  return v_inv;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.ler_inventario(p_id text, p_tipo text, p_item text, p_local text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_inv public.inventarios;
  v_item text := upper(trim(p_item));
  v_repetido boolean;
  v_aqui text := public.codigo_do_local(p_local);
  v_n integer;
  v_de text;
  v_d public.dormentes;
  v_esp text;
begin
  perform public.exigir('estoque:movimentar');
  select * into v_inv from public.inventarios where id = p_id;
  if not found then perform public.falhar(404, 'Inventário não encontrado.'); end if;
  if v_inv.situacao <> 'aberto' then perform public.falhar(409, format('O inventário %s já foi fechado.', v_inv.numero)); end if;
  if not p_local = any(v_inv.locais_ids) then
    perform public.falhar(422, 'Este local não está no inventário.', jsonb_build_object('localId', 'Escolha um local do inventário.'));
  end if;
  if p_tipo not in ('fardo', 'dormente') then perform public.falhar(422, 'Leia o QR de um fardo ou de um dormente.'); end if;
  if (p_tipo = 'fardo' and not exists (select 1 from public.fardos where id = v_item))
     or (p_tipo = 'dormente' and not exists (select 1 from public.dormentes where id = v_item)) then
    perform public.falhar(404, format('%s %s não encontrado no sistema. Confira a etiqueta.', case p_tipo when 'fardo' then 'Fardo' else 'Dormente' end, v_item));
  end if;

  v_repetido := exists (select 1 from public.inventario_leituras where inventario_id = p_id and tipo = p_tipo and item_id = v_item and local_id = p_local);
  insert into public.inventario_leituras (inventario_id, tipo, item_id, local_id, quem) values (p_id, p_tipo, v_item, p_local, public.quem());
  if v_repetido then
    return jsonb_build_object('situacao', 'repetido', 'mensagem', format('%s já tinha sido lido em %s.', v_item, v_aqui), 'quantidade', 0);
  end if;

  if p_tipo = 'fardo' then
    select count(*) into v_n from public.dormentes where fardo_id = v_item and situacao in ('aguardando_inspecao', 'em_estoque', 'reservado');
    if v_n = 0 then
      return jsonb_build_object('situacao', 'inesperado', 'mensagem', format('Fardo %s sem dormentes no pátio: confira e justifique no fechamento.', v_item), 'quantidade', 0);
    end if;
    select coalesce(e.local_id, (select local_id from public.fardos where id = v_item)) into v_de
    from public.dormentes d left join public.inventario_esperados e on e.inventario_id = p_id and e.dormente_id = d.id
    where d.fardo_id = v_item and d.situacao in ('aguardando_inspecao', 'em_estoque', 'reservado') order by d.id limit 1;
    if v_de = p_local then
      return jsonb_build_object('situacao', 'conferido', 'mensagem', format('Fardo %s: %s dormente(s) conferidos.', v_item, v_n), 'quantidade', v_n);
    end if;
    return jsonb_build_object('situacao', 'local_errado', 'mensagem', format('Fardo %s deveria estar em %s: será transferido para %s no fechamento.', v_item, public.codigo_do_local(v_de), v_aqui), 'quantidade', v_n);
  end if;

  select * into v_d from public.dormentes where id = v_item;
  select local_id into v_esp from public.inventario_esperados where inventario_id = p_id and dormente_id = v_item;
  if v_esp = p_local then
    return jsonb_build_object('situacao', 'conferido', 'mensagem', format('Dormente %s conferido.', v_item), 'quantidade', 1);
  end if;
  if v_esp is not null and v_d.situacao = 'reprovado' then
    return jsonb_build_object('situacao', 'local_errado', 'mensagem', format('Reprovado %s deveria estar em %s: o local será corrigido no fechamento.', v_item, public.codigo_do_local(v_esp)), 'quantidade', 1);
  end if;
  return jsonb_build_object('situacao', 'inesperado', 'mensagem', format('Dormente %s não era esperado em %s (%s): justifique no fechamento.', v_item, v_aqui, public.motivo_inesperado(v_d)), 'quantidade', 1);
end $$;

create or replace function public.motivo_inesperado(d public.dormentes) returns text
language sql stable set search_path = public as $$
  select case d.situacao
    when 'baixado' then 'baixado na ' || coalesce(d.rme_numero, 'RME')
    when 'perdido' then 'registrado como perdido'
    when 'retirado' then 'retirado pelo fornecedor'
    when 'nao_localizado' then 'estava não localizado: inspecione para voltar ao fluxo'
    when 'emitido' then 'o fardo ainda não foi recebido'
    else format('é do fardo %s, que está em %s', d.fardo_id, public.codigo_do_local(public.local_do_dormente(d)))
  end
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- O resultado (o mesmo na prévia e no fechamento), em JSON no formato de ResultadoInventario (models.ts).
create or replace function public.analisar_inventario(p_id text, p_justificativas jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_inv public.inventarios;
  v_f record;
  v_de text;
  v_para text;
  v_total integer;
  v_vistos integer;
  v_locais integer;
  v_res jsonb;
begin
  select * into v_inv from public.inventarios where id = p_id;
  if not found then perform public.falhar(404, 'Inventário não encontrado.'); end if;

  -- Onde cada dormente foi visto: a última leitura dele ou do seu fardo.
  create temporary table if not exists _vistos (dormente_id text primary key, local_id text) on commit drop;
  create temporary table if not exists _difs (grupo text, tipo text, item_id text, fardo_id text, local_id text, lido_em_id text, quantidade integer, motivo text, justificativa text) on commit drop;
  create temporary table if not exists _conferidos (dormente_id text primary key) on commit drop;
  create temporary table if not exists _movidos (fardo_id text primary key, de text, para text, quantidade integer) on commit drop;
  truncate _vistos, _difs, _conferidos, _movidos;

  insert into _vistos
  select distinct on (c.dormente_id) c.dormente_id, c.local_id from (
    select l.item_id as dormente_id, l.local_id, l.ordem from public.inventario_leituras l where l.inventario_id = p_id and l.tipo = 'dormente'
    union all
    select d.id, l.local_id, l.ordem from public.inventario_leituras l
      join public.dormentes d on d.fardo_id = l.item_id and d.situacao in ('aguardando_inspecao', 'em_estoque', 'reservado')
    where l.inventario_id = p_id and l.tipo = 'fardo'
  ) c order by c.dormente_id, c.ordem desc;

  -- Fardo em local errado: o QR do fardo lido noutro local, ou todos os seus dormentes lidos noutro local único.
  for v_f in
    select distinct x.fardo_id from (
      select e.fardo_id from public.inventario_esperados e join public.dormentes d on d.id = e.dormente_id
      where e.inventario_id = p_id and d.situacao in ('aguardando_inspecao', 'em_estoque', 'reservado')
      union select l.item_id from public.inventario_leituras l where l.inventario_id = p_id and l.tipo = 'fardo'
    ) x
  loop
    select count(*) into v_total from public.dormentes where fardo_id = v_f.fardo_id and situacao in ('aguardando_inspecao', 'em_estoque', 'reservado');
    continue when v_total = 0;
    select coalesce(e.local_id, public.local_do_dormente(d)) into v_de
    from public.dormentes d left join public.inventario_esperados e on e.inventario_id = p_id and e.dormente_id = d.id
    where d.fardo_id = v_f.fardo_id and d.situacao in ('aguardando_inspecao', 'em_estoque', 'reservado') order by d.id limit 1;
    select l.local_id into v_para from public.inventario_leituras l
    where l.inventario_id = p_id and l.tipo = 'fardo' and l.item_id = v_f.fardo_id order by l.ordem desc limit 1;
    if v_para is null then
      select count(v.dormente_id), count(distinct v.local_id), min(v.local_id) into v_vistos, v_locais, v_para
      from public.dormentes d join _vistos v on v.dormente_id = d.id
      where d.fardo_id = v_f.fardo_id and d.situacao in ('aguardando_inspecao', 'em_estoque', 'reservado');
      if v_vistos <> v_total or v_locais <> 1 then v_para := null; end if;
    end if;
    if v_para is not null and v_de is not null and v_para <> v_de then
      insert into _movidos values (v_f.fardo_id, v_de, v_para, v_total);
      insert into _difs values ('local_errado', 'fardo', v_f.fardo_id, v_f.fardo_id, v_de, v_para, v_total,
        format('Lido em %s; estava registrado em %s.', public.codigo_do_local(v_para), public.codigo_do_local(v_de)), null);
      insert into _conferidos select id from public.dormentes where fardo_id = v_f.fardo_id and situacao in ('aguardando_inspecao', 'em_estoque', 'reservado') on conflict do nothing;
    end if;
  end loop;

  -- Esperados que continuam no pátio: conferidos, reprovado em local errado ou não encontrados.
  insert into _conferidos
  select e.dormente_id from public.inventario_esperados e join public.dormentes d on d.id = e.dormente_id
  join _vistos v on v.dormente_id = e.dormente_id
  where e.inventario_id = p_id and public.no_patio(d.situacao) and v.local_id = e.local_id
  on conflict do nothing;

  insert into _difs
  select 'local_errado', 'dormente', d.id, d.fardo_id, e.local_id, v.local_id, 1,
    format('Reprovado lido em %s; estava registrado em %s.', public.codigo_do_local(v.local_id), public.codigo_do_local(e.local_id)), null
  from public.inventario_esperados e join public.dormentes d on d.id = e.dormente_id join _vistos v on v.dormente_id = d.id
  where e.inventario_id = p_id and d.situacao = 'reprovado' and v.local_id <> e.local_id
    and not exists (select 1 from _conferidos c where c.dormente_id = d.id);
  insert into _conferidos select item_id from _difs where grupo = 'local_errado' and tipo = 'dormente' on conflict do nothing;

  insert into _difs
  select 'nao_encontrado', 'dormente', d.id, d.fardo_id, e.local_id, null, 1,
    format('Esperado em %s e não lido.%s', public.codigo_do_local(e.local_id), case when d.situacao = 'reservado' then format(' Estava reservado para a %s.', d.rme_numero) else '' end), null
  from public.inventario_esperados e join public.dormentes d on d.id = e.dormente_id
  where e.inventario_id = p_id and public.no_patio(d.situacao)
    and not exists (select 1 from _conferidos c where c.dormente_id = d.id)
    and not exists (select 1 from _vistos v where v.dormente_id = d.id);

  -- Inesperados: dormente lido pelo próprio QR onde não era esperado; fardo lido sem dormentes no pátio.
  insert into _difs
  select distinct on (d.id) 'inesperado', 'dormente', d.id, d.fardo_id, null, l.local_id, 1,
    format('Lido em %s: %s.', public.codigo_do_local(l.local_id), public.motivo_inesperado(d)),
    nullif(trim(p_justificativas->>('dormente:' || d.id)), '')
  from (select distinct on (item_id) item_id, local_id from public.inventario_leituras where inventario_id = p_id and tipo = 'dormente' order by item_id, ordem desc) l
  join public.dormentes d on d.id = l.item_id
  left join public.inventario_esperados e on e.inventario_id = p_id and e.dormente_id = d.id
  where not exists (select 1 from _conferidos c where c.dormente_id = d.id)
    and not (e.local_id is not null and e.local_id = l.local_id);

  insert into _difs
  select 'inesperado', 'fardo', l.item_id, l.item_id, null, l.local_id, 1,
    format('Fardo lido em %s sem dormentes no pátio (baixado, perdido ou não recebido).', public.codigo_do_local(l.local_id)),
    nullif(trim(p_justificativas->>('fardo:' || l.item_id)), '')
  from (select distinct on (item_id) item_id, local_id from public.inventario_leituras where inventario_id = p_id and tipo = 'fardo' order by item_id, ordem) l
  where not exists (select 1 from public.dormentes d where d.fardo_id = l.item_id and d.situacao in ('aguardando_inspecao', 'em_estoque', 'reservado'));

  -- Localizados: achados em qualquer local do inventário. No lugar certo: lidos no local esperado, sem correção.
  with por_local as (
    select x.local_id,
      count(*) filter (where public.no_patio(d.situacao)) as esperados,
      count(*) filter (where public.no_patio(d.situacao) and exists (select 1 from _vistos v where v.dormente_id = x.dormente_id)) as localizados,
      count(*) filter (where public.no_patio(d.situacao) and exists (select 1 from _conferidos c where c.dormente_id = x.dormente_id)
        and not exists (select 1 from _movidos m where m.fardo_id = x.fardo_id)
        and not exists (select 1 from _difs f where f.tipo = 'dormente' and f.item_id = x.dormente_id)) as no_lugar_certo
    from public.inventario_esperados x join public.dormentes d on d.id = x.dormente_id
    where x.inventario_id = p_id group by x.local_id
  ), locais as (
    select l.id as local_id, l.ordem, coalesce(p.esperados, 0) as esperados, coalesce(p.localizados, 0) as localizados, coalesce(p.no_lugar_certo, 0) as no_lugar_certo,
      (select count(*) from _difs f where f.local_id = l.id or (f.grupo = 'inesperado' and f.lido_em_id = l.id)) as diferencas
    from unnest(v_inv.locais_ids) with ordinality l(id, ordem) left join por_local p on p.local_id = l.id
  )
  select jsonb_build_object(
    'porLocal', coalesce((select jsonb_agg(jsonb_build_object('localId', local_id, 'esperados', esperados, 'localizados', localizados, 'noLugarCerto', no_lugar_certo,
      'percentualLocalizados', public.pct(localizados, esperados), 'percentualNoLugarCerto', public.pct(no_lugar_certo, esperados), 'diferencas', diferencas) order by ordem) from locais), '[]'),
    'esperados', (select coalesce(sum(esperados), 0) from locais),
    'localizados', (select coalesce(sum(localizados), 0) from locais),
    'noLugarCerto', (select coalesce(sum(no_lugar_certo), 0) from locais),
    'percentualLocalizados', (select public.pct(coalesce(sum(localizados), 0)::int, coalesce(sum(esperados), 0)::int) from locais),
    'percentualNoLugarCerto', (select public.pct(coalesce(sum(no_lugar_certo), 0)::int, coalesce(sum(esperados), 0)::int) from locais),
    'diferencas', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('grupo', grupo, 'tipo', tipo, 'id', item_id, 'fardoId', fardo_id,
      'localId', local_id, 'lidoEmId', lido_em_id, 'quantidade', quantidade, 'motivo', motivo, 'justificativa', justificativa))
      order by case grupo when 'local_errado' then 1 when 'nao_encontrado' then 2 else 3 end, item_id) from _difs), '[]')
  ) into v_res;
  return v_res;
end $$;

create or replace function public.previa_inventario(p_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.ativo() then perform public.falhar(401, 'Sessão expirada ou não autenticada. Entre novamente.'); end if;
  return public.analisar_inventario(p_id);
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Fechamento: uma transação só. Se qualquer passo falhar, nada é gravado.
create or replace function public.fechar_inventario(p_id text, p_justificativas jsonb default '{}') returns public.inventarios
language plpgsql security definer set search_path = public as $$
declare
  v_inv public.inventarios;
  v_res jsonb;
  v_faltando jsonb;
  v_d record;
  v_dorm public.dormentes;
  v_rme public.rmes;
  v_ref text;
  v_desc text;
begin
  perform public.exigir('estoque:movimentar');
  select * into v_inv from public.inventarios where id = p_id for update;      -- trava: duas pessoas não fecham juntas
  if not found then perform public.falhar(404, 'Inventário não encontrado.'); end if;
  if v_inv.situacao <> 'aberto' then perform public.falhar(409, format('O inventário %s já foi fechado.', v_inv.numero)); end if;
  v_ref := v_inv.numero;

  v_res := public.analisar_inventario(p_id, coalesce(p_justificativas, '{}'));
  select jsonb_object_agg(x->>'tipo' || ':' || (x->>'id'), 'Justificativa obrigatória.') into v_faltando
  from jsonb_array_elements(v_res->'diferencas') x where x->>'grupo' = 'inesperado' and x->>'justificativa' is null;
  if v_faltando is not null then
    perform public.falhar(422, format('Justifique %s antes de fechar.', case when (select count(*) from jsonb_object_keys(v_faltando)) = 1
      then 'o item inesperado' else format('os %s itens inesperados', (select count(*) from jsonb_object_keys(v_faltando))) end), v_faltando);
  end if;

  for v_d in select * from jsonb_to_recordset(v_res->'diferencas') as x(grupo text, tipo text, id text, "fardoId" text, "localId" text, "lidoEmId" text, quantidade integer, motivo text, justificativa text)
  loop
    if v_d.grupo = 'local_errado' and v_d.tipo = 'fardo' then
      v_desc := format('Corrigido no inventário %s: estava registrado em %s, lido em %s', v_ref, public.codigo_do_local(v_d."localId"), public.codigo_do_local(v_d."lidoEmId"));
      insert into public.movimentacoes (tipo, fardo_id, dormentes_ids, quantidade, de_local_id, para_local_id, quem, referencia)
      select 'transferencia', v_d.id, array_agg(id order by id), count(*), (select local_id from public.fardos where id = v_d.id), v_d."lidoEmId", public.quem(), v_ref
      from public.dormentes where fardo_id = v_d.id and situacao in ('aguardando_inspecao', 'em_estoque', 'reservado');
      update public.fardos set local_id = v_d."lidoEmId" where id = v_d.id;
      perform public.registrar_evento('fardo', v_d.id, 'transferido', v_desc, v_ref);
      perform public.registrar_evento('dormente', d.id, 'transferido', v_desc, v_ref)
      from public.dormentes d where d.fardo_id = v_d.id and d.situacao in ('aguardando_inspecao', 'em_estoque', 'reservado');

    elsif v_d.grupo = 'local_errado' then
      insert into public.movimentacoes (tipo, fardo_id, dormentes_ids, quantidade, de_local_id, para_local_id, quem, referencia)
      select 'transferencia', fardo_id, array[id], 1, local_id, v_d."lidoEmId", public.quem(), v_ref from public.dormentes where id = v_d.id;
      update public.dormentes set local_id = v_d."lidoEmId" where id = v_d.id;
      perform public.registrar_evento('dormente', v_d.id, 'transferido', format('Corrigido no inventário %s: reprovado lido em %s', v_ref, public.codigo_do_local(v_d."lidoEmId")), v_ref);

    elsif v_d.grupo = 'nao_encontrado' then
      select * into v_dorm from public.dormentes where id = v_d.id for update;
      v_rme := null;
      if v_dorm.situacao = 'reservado' then select * into v_rme from public.rmes where numero = v_dorm.rme_numero for update; end if;
      update public.dormentes set situacao = 'nao_localizado', rme_numero = null,
        local_id = case when v_dorm.situacao = 'reprovado' then null else local_id end
      where id = v_d.id;
      perform public.registrar_evento('dormente', v_d.id, 'nao_localizado', format('Não encontrado no inventário %s (%s)', v_ref, public.codigo_do_local(v_d."localId")), v_ref);
      -- Reservado não encontrado: só ele sai da separação; as demais reservas ficam (e o fardo na expedição também).
      -- A RME volta a "em separação" para completar a quantidade que falta.
      if v_rme.id is not null then
        update public.rme_separacao set dormentes_ids = array_remove(dormentes_ids, v_d.id)
        where rme_id = v_rme.id and v_d.id = any(dormentes_ids) and cardinality(dormentes_ids) > 1;
        perform set_config('holz.permitir_troca', 'sim', true);
        delete from public.rme_separacao where rme_id = v_rme.id and dormentes_ids = array[v_d.id];
        perform set_config('holz.permitir_troca', '', true);
        update public.rmes set situacao = 'em_separacao' where id = v_rme.id and situacao = 'pronta';
        perform public.registrar_evento('rme', v_rme.id, 'alterado', format('Dormente %s não encontrado no inventário %s: saiu da separação; faltam %s para completar', v_d.id, v_ref,
          (select coalesce(sum(quantidade), 0) from public.rme_itens where rme_id = v_rme.id)
          - (select coalesce(sum(cardinality(dormentes_ids)), 0) from public.rme_separacao where rme_id = v_rme.id)), v_ref);
      end if;

    else
      perform public.registrar_evento(v_d.tipo, v_d.id, 'ocorrencia', format('Inesperado no inventário %s: %s Justificativa: %s', v_ref, v_d.motivo, v_d.justificativa), v_ref);
    end if;

    insert into public.inventario_diferencas (inventario_id, grupo, tipo, item_id, fardo_id, local_id, lido_em_id, quantidade, motivo, justificativa)
    values (p_id, v_d.grupo, v_d.tipo, v_d.id, v_d."fardoId", v_d."localId", v_d."lidoEmId", v_d.quantidade, v_d.motivo, v_d.justificativa);
  end loop;

  insert into public.inventario_locais (inventario_id, local_id, esperados, localizados, no_lugar_certo, percentual_localizados, percentual_no_lugar_certo, diferencas)
  select p_id, x->>'localId', (x->>'esperados')::int, (x->>'localizados')::int, (x->>'noLugarCerto')::int,
    (x->>'percentualLocalizados')::numeric, (x->>'percentualNoLugarCerto')::numeric, (x->>'diferencas')::int
  from jsonb_array_elements(v_res->'porLocal') x;

  update public.inventarios set situacao = 'fechado', fechado_em = public.agora(), fechado_por = public.quem(),
    esperados_total = (v_res->>'esperados')::int, localizados_total = (v_res->>'localizados')::int, no_lugar_certo_total = (v_res->>'noLugarCerto')::int,
    percentual_localizados = (v_res->>'percentualLocalizados')::numeric, percentual_no_lugar_certo = (v_res->>'percentualNoLugarCerto')::numeric
  where id = p_id returning * into v_inv;

  perform public.registrar_evento('inventario', p_id, 'fechado', format('Inventário fechado: %s de %s localizados (%s%%), %s no lugar certo (%s%%); %s em local errado, %s não encontrado(s), %s inesperado(s)',
    v_res->>'localizados', v_res->>'esperados', v_res->>'percentualLocalizados', v_res->>'noLugarCerto', v_res->>'percentualNoLugarCerto',
    (select count(*) from jsonb_array_elements(v_res->'diferencas') x where x->>'grupo' = 'local_errado'),
    (select count(*) from jsonb_array_elements(v_res->'diferencas') x where x->>'grupo' = 'nao_encontrado'),
    (select count(*) from jsonb_array_elements(v_res->'diferencas') x where x->>'grupo' = 'inesperado')), v_ref);
  return v_inv;
end $$;

-- Último inventário fechado de cada local ativo (relatórios do IBAMA e Inventário para vistoria).
create or replace view public.v_inventario_por_local with (security_invoker = true) as
select l.id as local_id, u.inventario_id, u.numero, u.fechado_em,
  coalesce(u.esperados, 0) as esperados, coalesce(u.localizados, 0) as localizados, coalesce(u.no_lugar_certo, 0) as no_lugar_certo,
  u.percentual_localizados, u.percentual_no_lugar_certo,
  coalesce((select count(*) from public.inventario_diferencas d where d.inventario_id = u.inventario_id and d.grupo = 'local_errado' and d.local_id = l.id), 0) as local_errado,
  coalesce((select count(*) from public.inventario_diferencas d where d.inventario_id = u.inventario_id and d.grupo = 'nao_encontrado' and d.local_id = l.id), 0) as nao_encontrados,
  coalesce((select count(*) from public.inventario_diferencas d where d.inventario_id = u.inventario_id and d.grupo = 'inesperado' and d.lido_em_id = l.id), 0) as inesperados
from public.locais l
left join lateral (
  select i.id as inventario_id, i.numero, i.fechado_em, il.esperados, il.localizados, il.no_lugar_certo, il.percentual_localizados, il.percentual_no_lugar_certo
  from public.inventario_locais il join public.inventarios i on i.id = il.inventario_id
  where il.local_id = l.id and i.situacao = 'fechado' order by i.fechado_em desc limit 1
) u on true
where l.ativo;

-- As funções são chamadas pelo app (usuário logado); a permissão é conferida dentro de cada uma.
revoke all on function public.analisar_inventario(text, jsonb) from public, anon;
grant execute on function public.abrir_inventario(text[]), public.ler_inventario(text, text, text, text), public.previa_inventario(text),
  public.fechar_inventario(text, jsonb) to authenticated;
