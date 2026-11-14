-- Holz Trilho v2 · 0009 · pg_safeupdate: todo UPDATE e DELETE das funções com WHERE
-- No Supabase, o PostgREST carrega o pg_safeupdate, que recusa UPDATE e DELETE sem WHERE em qualquer comando da
-- requisição, inclusive dentro de funções security definer e de gatilhos (erro 21000 "UPDATE requires a WHERE
-- clause"). O editor SQL não passa pelo PostgREST (por isso o seed.sql rodou) e o PGlite dos testes não tem a
-- extensão. As funções abaixo são as mesmas das migrações anteriores, só com o WHERE: "where true" quando o comando
-- é mesmo para todas as linhas, ou o WHERE real. O teste safeupdate.test.ts confere todas as funções do banco.
--   · recalcular_chaves (0007; chamada por carregar_demonstracao e reiniciar_demonstracao): update de emissoes.
--   · separar_rme (0005): delete da tabela temporária _sugestao.
--   · atualizar_parametros (0005): delete de niveis_estoque e de feriados.
-- create or replace mantém o dono e os privilégios; mesmo assim, eles são repetidos no fim, iguais aos da 0008.

-- ---------------------------------------------------------------------------------------------------------------
-- Demonstração (0007): a chave da NF de exemplo da emissão só muda quando a emissão deslocada muda o AAMM.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.recalcular_chaves() returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.nfs set chave_acesso = public.chave_com_digito(left(chave_acesso, 2) || to_char(emissao, 'YYMM') || substr(chave_acesso, 7, 37))
  where chave_acesso <> public.chave_com_digito(left(chave_acesso, 2) || to_char(emissao, 'YYMM') || substr(chave_acesso, 7, 37));
  update public.emissoes set nf = jsonb_set(nf, '{chaveAcesso}', to_jsonb(public.chave_com_digito(left(nf->>'chaveAcesso', 2)
    || to_char((nf->>'emissao')::date, 'YYMM') || substr(nf->>'chaveAcesso', 7, 37))))
  where nf->>'chaveAcesso' <> public.chave_com_digito(left(nf->>'chaveAcesso', 2) || to_char((nf->>'emissao')::date, 'YYMM') || substr(nf->>'chaveAcesso', 7, 37));
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- RME (0005)
-- ---------------------------------------------------------------------------------------------------------------
-- Separa: reserva os dormentes e deixa a RME pronta. A quantidade de cada item (somada ao que já estava reservado,
-- quando a separação é completada) tem de bater com a pedida. Trocar de fardo ou mudar a quantidade pede justificativa.
create or replace function public.separar_rme(p_numero text, p_separacao jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.rmes;
  c jsonb := '{}';
  v_sugerida integer;
  s jsonb;
  n integer := 0;
  f public.v_fardos;
  v_tam text;
  it public.rme_itens;
  v_ids text[];
  v_id text;
  d public.dormentes;
  v_usados text[] := '{}';
  v_totais jsonb := '{}';
  v_k text;
  v_seguiu boolean;
  v_abaixo boolean;
  v_linhas jsonb := '[]';
  l jsonb;
  v_anterior integer;
  v_troca boolean := false;
  v_ordem integer;
begin
  perform public.exigir('rme:separar');
  select * into r from public.rmes where numero = p_numero for update;
  if not found then perform public.falhar(404, format('RME %s não encontrado.', p_numero)); end if;
  if r.situacao not in ('aberta', 'em_separacao') then perform public.falhar(409, format('A RME %s não está aberta para separação.', r.numero)); end if;
  if jsonb_array_length(coalesce(p_separacao, '[]')) = 0 then perform public.falhar(422, 'Informe os dormentes separados.', '{"separacao": "Nada separado."}'); end if;
  -- Trava os dormentes envolvidos (duas separações ao mesmo tempo não reservam o mesmo dormente).
  perform 1 from public.dormentes where id = any(array(select upper(trim(x)) from jsonb_array_elements(p_separacao) e cross join lateral jsonb_array_elements_text(coalesce(e->'dormentesIds', '[]')) x)) for update;
  v_sugerida := case when r.tipo_destino = 'principal_pesado' then 1 else 2 end;
  create temp table if not exists _sugestao (fardo_id text, quantidade integer) on commit drop;
  delete from _sugestao where true;   -- a tabela temporária pode existir de uma chamada anterior na mesma transação
  insert into _sugestao select * from public.sugestao_por_fardo(r.id);

  for s in select * from jsonb_array_elements(p_separacao) loop
    select * into f from public.v_fardos where id = s->>'fardoId';
    if f.id is null then perform public.falhar(404, format('Fardo %s não encontrado.', s->>'fardoId')); end if;
    select tamanho_id into v_tam from public.contrato_itens where id = f.item_contrato_id;
    v_k := v_tam || '|' || f.classe;
    it := null;
    select * into it from public.rme_itens where rme_id = r.id and tamanho_id = v_tam and classe = f.classe;
    if it.rme_id is null then c := c || jsonb_build_object('separacao.' || n, format('O fardo %s não é do tamanho e da classe de um item desta RME.', f.id)); end if;
    if f.em_cura_ate is not null then c := c || jsonb_build_object('separacao.' || n, format('O fardo %s está em cura até %s: ainda não pode ser separado.', f.id, f.em_cura_ate)); end if;
    -- Classe inferior à sugerida para o tipo de destino: aceita com justificativa.
    v_abaixo := f.classe > v_sugerida;
    if v_abaixo and public.txt(s, 'justificativaClasse') = '' then
      c := c || jsonb_build_object('separacao.' || n, format('O fardo %s é de %sª classe, abaixo da %sª sugerida para o destino: informe a justificativa.', f.id, f.classe, v_sugerida));
    end if;
    v_ids := array(select x from (select distinct on (x) x, o from unnest(array(select upper(trim(y)) from jsonb_array_elements_text(coalesce(s->'dormentesIds', '[]')) y)) with ordinality u(x, o) order by x, o) q order by o);
    if cardinality(v_ids) = 0 then c := c || jsonb_build_object('separacao.' || n, format('Nenhum dormente do fardo %s.', f.id)); end if;
    foreach v_id in array v_ids loop
      d := null;
      select * into d from public.dormentes where id = v_id;
      if d.id is null or d.fardo_id <> f.id then c := c || jsonb_build_object('separacao.' || n, format('O dormente %s não é do fardo %s.', v_id, f.id));
      elsif d.situacao <> 'em_estoque' then c := c || jsonb_build_object('separacao.' || n, format('O dormente %s não está disponível (%s).', v_id, d.situacao));
      elsif it.rme_id is not null and not public.atende(d, it) then c := c || jsonb_build_object('separacao.' || n, format('O dormente %s não atende ao item (espécie ou categoria mínima).', v_id));
      elsif v_id = any(v_usados) then c := c || jsonb_build_object('separacao.' || n, format('O dormente %s aparece duas vezes.', v_id));
      end if;
      v_usados := v_usados || v_id;
    end loop;
    v_totais := v_totais || jsonb_build_object(v_k, coalesce(public.num(v_totais->v_k), 0) + cardinality(v_ids));
    v_seguiu := coalesce((select quantidade from _sugestao where fardo_id = f.id) = cardinality(v_ids), false);
    if not v_seguiu and public.txt(s, 'justificativa') = '' then
      c := c || jsonb_build_object('separacao.' || n, format('O fardo %s difere da sugestão: informe a justificativa.', f.id));
    end if;
    v_troca := v_troca or not v_seguiu;
    v_linhas := v_linhas || jsonb_build_array(jsonb_build_object('fardoId', f.id, 'ids', to_jsonb(v_ids), 'seguiu', v_seguiu,
      'justificativa', case when not v_seguiu then nullif(public.txt(s, 'justificativa'), '') end,
      'justificativaClasse', case when v_abaixo then nullif(public.txt(s, 'justificativaClasse'), '') end));
    n := n + 1;
  end loop;
  for it in select * from public.rme_itens where rme_id = r.id order by ordem loop
    v_k := it.tamanho_id || '|' || it.classe;
    if coalesce(public.num(v_totais->v_k), 0) + public.ja_reservados(r.id, it) <> it.quantidade then
      c := c || jsonb_build_object('itens.' || it.ordem, format('Separados %s de %s: a quantidade tem de bater com a pedida.', coalesce(public.num(v_totais->v_k), 0) + public.ja_reservados(r.id, it), it.quantidade));
    end if;
  end loop;
  perform public.exigir_campos(c, 'Confira a separação.');

  for l in select * from jsonb_array_elements(v_linhas) loop
    perform public.movimentar_dormentes(public.lista(l->'ids'), 'reservado', 'reservado', format('Reservado para a %s (%s)', r.numero, r.destino), r.numero, r.numero);
  end loop;
  -- Completar: as linhas novas somam-se às da separação anterior (mesmo fardo, mesma linha).
  select count(*) into v_anterior from public.rme_separacao where rme_id = r.id;
  for l in select * from jsonb_array_elements(v_linhas) loop
    if exists (select 1 from public.rme_separacao where rme_id = r.id and fardo_id = l->>'fardoId') then
      update public.rme_separacao set dormentes_ids = dormentes_ids || public.lista(l->'ids'), seguiu_sugestao = seguiu_sugestao and (l->>'seguiu')::boolean,
        justificativa = nullif(concat_ws(' · ', justificativa, l->>'justificativa'), ''), justificativa_classe = coalesce(justificativa_classe, l->>'justificativaClasse')
      where rme_id = r.id and fardo_id = l->>'fardoId';
    else
      select coalesce(max(ordem) + 1, 0) into v_ordem from public.rme_separacao where rme_id = r.id;
      insert into public.rme_separacao (ordem, rme_id, fardo_id, dormentes_ids, seguiu_sugestao, justificativa, justificativa_classe)
      values (v_ordem, r.id, l->>'fardoId', public.lista(l->'ids'), (l->>'seguiu')::boolean, l->>'justificativa', l->>'justificativaClasse');
    end if;
  end loop;
  update public.rmes set situacao = 'pronta' where id = r.id;
  perform public.registrar_evento('rme', r.id, 'reservado', format('%s: %s dormentes reservados%s', case when v_anterior > 0 then 'Separação completada' else 'Separação concluída' end,
    (select count(distinct x) from unnest(v_usados) x), case when v_troca then ' (com troca de fardo justificada)' else '' end));
  return to_jsonb(r.id);
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Parâmetros (0005): os níveis e os feriados enviados substituem a lista inteira.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.atualizar_parametros(p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  a public.parametros;
  v jsonb;
  c jsonb := '{}';
  v_x jsonb;
  n integer := 0;
begin
  perform public.exigir('admin');
  select * into a from public.parametros where id = 1 for update;
  v := jsonb_build_object('limiteDiasEstoque', a.limite_dias_estoque, 'alertaDofDias', to_jsonb(a.alerta_dof_dias), 'limitesCategoria', to_jsonb(a.limites_categoria),
    'dormentesPorFardoPadrao', a.dormentes_por_fardo_padrao, 'alertaLaudoDias', to_jsonb(a.alerta_laudo_dias), 'modoDemonstracao', a.modo_demonstracao,
    'niveis', (select coalesce(jsonb_agg(jsonb_build_object('classe', classe, 'tamanhoId', tamanho_id, 'minimo', minimo, 'maximo', maximo) order by ordem), '[]') from public.niveis_estoque))
    || (coalesce(p_dados, '{}') - 'toleranciaVolumePct');
  if not public.inteiro(v->'limiteDiasEstoque') or public.num(v->'limiteDiasEstoque') <= 0 then c := c || '{"limiteDiasEstoque": "Dias inteiros, maior que zero."}'; end if;
  if not public.inteiro(v->'alertaDofDias'->0) or not public.inteiro(v->'alertaDofDias'->1) or public.num(v->'alertaDofDias'->1) < 0
     or public.num(v->'alertaDofDias'->0) < public.num(v->'alertaDofDias'->1) then
    c := c || '{"alertaDofDias": "O alerta de atenção vem antes (ou junto) do crítico."}';
  end if;
  if not coalesce(public.num(v->'limitesCategoria'->1) > 0 and public.num(v->'limitesCategoria'->1) < public.num(v->'limitesCategoria'->0) and public.num(v->'limitesCategoria'->0) <= 100, false) then
    c := c || '{"limitesCategoria": "Limites entre 0 e 100, o da categoria 1 maior que o da 2."}';
  end if;
  if not public.inteiro(v->'dormentesPorFardoPadrao') or public.num(v->'dormentesPorFardoPadrao') < 1 or public.num(v->'dormentesPorFardoPadrao') > 50 then
    c := c || '{"dormentesPorFardoPadrao": "De 1 a 50."}';
  end if;
  for v_x in select * from jsonb_array_elements(coalesce(v->'niveis', '[]')) loop
    if not coalesce(public.num(v_x->'minimo') >= 0 and public.num(v_x->'maximo') >= public.num(v_x->'minimo'), false) then
      c := c || jsonb_build_object('niveis.' || n, 'Mínimo de 0 para cima e máximo maior ou igual ao mínimo.');
    end if;
    n := n + 1;
  end loop;
  perform public.exigir_campos(c, 'Confira os parâmetros.');
  update public.parametros set limite_dias_estoque = public.num(v->'limiteDiasEstoque'), alerta_dof_dias = array[public.num(v->'alertaDofDias'->0), public.num(v->'alertaDofDias'->1)],
    limites_categoria = array[public.num(v->'limitesCategoria'->0), public.num(v->'limitesCategoria'->1)], dormentes_por_fardo_padrao = public.num(v->'dormentesPorFardoPadrao'),
    alerta_laudo_dias = array[public.num(v->'alertaLaudoDias'->0), public.num(v->'alertaLaudoDias'->1)], modo_demonstracao = (v->>'modoDemonstracao')::boolean
  where id = 1;
  if p_dados ? 'niveis' then
    delete from public.niveis_estoque where true;
    insert into public.niveis_estoque (ordem, classe, tamanho_id, minimo, maximo)
    select (o - 1)::integer, public.num(x->'classe'), x->>'tamanhoId', public.num(x->'minimo'), public.num(x->'maximo') from jsonb_array_elements(p_dados->'niveis') with ordinality y(x, o);
  end if;
  if p_dados ? 'feriados' then
    delete from public.feriados where true;
    insert into public.feriados (data, nome, abrangencia)
    select (x->>'data')::date, x->>'nome', x->>'abrangencia' from jsonb_array_elements(p_dados->'feriados') x;
  end if;
  perform public.registrar_evento('parametros', 'parametros', 'alterado', format('Parâmetros alterados: %s', (select string_agg(k, ', ') from jsonb_object_keys(p_dados) k)));
  return to_jsonb('parametros'::text);
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Privilégios: os mesmos de antes (0007 e 0008).
-- ---------------------------------------------------------------------------------------------------------------
revoke all on function public.recalcular_chaves(), public.separar_rme(text, jsonb), public.atualizar_parametros(jsonb)
  from public, anon, authenticated;
grant execute on function public.separar_rme(text, jsonb), public.atualizar_parametros(jsonb) to authenticated;
