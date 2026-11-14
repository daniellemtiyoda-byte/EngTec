-- Holz Trilho v2 · 0010 · Atas com regras e itens próprios, editáveis até o primeiro contrato
-- Cada ata tem vigência, regras de fornecimento (pedido mínimo, parcelas, janelas de entrega) e itens registrados
-- próprios; os contratos da ata seguem essas regras (validar_cronograma, sem mudança). O que muda aqui:
--   · criar_ata: itens obrigatórios (ao menos um tamanho com quantidade) e janelas de entrega validadas.
--   · atualizar_ata (nova): edita fornecedor, vigência, regras e itens enquanto a ata não tem nenhum contrato
--     (cancelado também conta); o número não muda. O primeiro contrato é o momento em que as regras passam a valer.
--   · dados_da_ata (interna): validação comum às duas, igual a dadosDaAta do app (mock/cadastros.ts).
--   · ata_itens: os itens são trocados na edição, então a trava de exclusão passa a ser a liberada só pela função
--     (holz.permitir_troca), como as parcelas do contrato.
-- Rodar depois da 0009, no editor SQL.

drop trigger if exists ata_itens_sem_exclusao on public.ata_itens;
create trigger ata_itens_sem_exclusao before delete on public.ata_itens for each row execute function public.impedir_exclusao_salvo_liberada();

-- Vigência, regras e itens: erros por campo em c; devolve o fim da vigência (12 meses quando não vem) e as regras
-- (as padrão da AR00224 com o que vier informado por cima).
create or replace function public.dados_da_ata(p_dados jsonb, inout c jsonb, out v_fim text, out r jsonb)
language plpgsql stable set search_path = public as $$
declare
  v_inicio text := p_dados->>'vigenciaInicio';
  v_padrao jsonb := '{"pedidoMinimo": 6000, "maxParcelas": 6, "parcelaMinima": 3000, "parcelaMaxima": 6000,
    "prazosParcelas": [[0, 90], [91, 120], [121, 150], [151, 180], [181, 210], [211, 240]]}';
  v_prazos integer;
  v_fim_anterior numeric := -1;
  j jsonb;
  i jsonb;
  n integer := 0;
  v_vistos text[] := '{}';
begin
  v_fim := nullif(p_dados->>'vigenciaFim', '');
  if not public.e_data(v_inicio) then c := c || '{"vigenciaInicio": "Informe o início da vigência."}'; end if;
  if v_fim is null and public.e_data(v_inicio) then v_fim := ((v_inicio::date + interval '12 months')::date - 1)::text; end if;
  if not public.e_data(v_fim) then c := c || '{"vigenciaFim": "Informe o fim da vigência."}';
  elsif v_fim <= coalesce(v_inicio, '') then c := c || '{"vigenciaFim": "O fim vem depois do início."}';
  end if;
  r := v_padrao || coalesce(case when jsonb_typeof(p_dados->'regras') = 'object' then jsonb_strip_nulls(p_dados->'regras') end, '{}');
  if jsonb_typeof(r->'prazosParcelas') <> 'array' then r := jsonb_set(r, '{prazosParcelas}', v_padrao->'prazosParcelas'); end if;
  v_prazos := jsonb_array_length(r->'prazosParcelas');
  if not public.inteiro(r->'pedidoMinimo') or public.num(r->'pedidoMinimo') <= 0 then c := c || '{"regras.pedidoMinimo": "Pedido mínimo em dormentes, maior que zero."}'; end if;
  if not public.inteiro(r->'maxParcelas') or public.num(r->'maxParcelas') <= 0 or public.num(r->'maxParcelas') > v_prazos then
    c := c || jsonb_build_object('regras.maxParcelas', format('De 1 a %s parcelas.', v_prazos));
  end if;
  if not public.inteiro(r->'parcelaMinima') or public.num(r->'parcelaMinima') <= 0 then c := c || '{"regras.parcelaMinima": "Parcela mínima em dormentes, maior que zero."}'; end if;
  if not public.inteiro(r->'parcelaMaxima') or public.num(r->'parcelaMaxima') <= 0 or public.num(r->'parcelaMaxima') < public.num(r->'parcelaMinima') then
    c := c || '{"regras.parcelaMaxima": "A parcela máxima não pode ser menor que a mínima."}';
  end if;
  -- Janelas de entrega em dias da assinatura: o fim não vem antes do início e cada uma começa depois da anterior.
  for j in select * from jsonb_array_elements(r->'prazosParcelas') loop
    if not public.inteiro(j->0) or not public.inteiro(j->1) or public.num(j->0) < 0 or public.num(j->1) < public.num(j->0) then
      c := c || jsonb_build_object('regras.prazosParcelas.' || n, 'Janela em dias da assinatura: o fim não vem antes do início.');
    elsif public.num(j->0) <= v_fim_anterior then
      c := c || jsonb_build_object('regras.prazosParcelas.' || n, format('A %sª parcela começa depois do fim da anterior (dia %s).', n + 1, v_fim_anterior));
    end if;
    if public.inteiro(j->1) then v_fim_anterior := public.num(j->1); end if;
    n := n + 1;
  end loop;
  if jsonb_typeof(p_dados->'itens') <> 'array' or jsonb_array_length(p_dados->'itens') = 0 then
    c := c || '{"itens": "Registre ao menos um tamanho com a quantidade."}';
  end if;
  n := 0;
  for i in select * from jsonb_array_elements(case when jsonb_typeof(p_dados->'itens') = 'array' then p_dados->'itens' else '[]' end) loop
    if not exists (select 1 from public.tamanhos t where t.id = i->>'tamanhoId' and t.ativo) then c := c || jsonb_build_object('itens.' || n, 'Escolha um tamanho ativo.');
    elsif i->>'tamanhoId' = any(v_vistos) then c := c || jsonb_build_object('itens.' || n, 'Tamanho repetido.');
    elsif not public.inteiro(i->'quantidade') or public.num(i->'quantidade') <= 0 then c := c || jsonb_build_object('itens.' || n, 'Quantidade registrada em unidades, maior que zero.');
    end if;
    v_vistos := v_vistos || (i->>'tamanhoId');
    n := n + 1;
  end loop;
end $$;

create or replace function public.criar_ata(p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c jsonb := '{}';
  v_numero text := upper(public.txt(p_dados, 'numero'));
  v record;
  v_id text;
begin
  perform public.exigir('contratos:editar');
  if v_numero !~ '^[A-Z]{2}\d{5}$' then c := c || '{"numero": "Número no formato AA00000 (ex. AR00224)."}';
  elsif exists (select 1 from public.atas where numero = v_numero) then c := c || '{"numero": "Ata já cadastrada."}';
  end if;
  select * into v from public.dados_da_ata(p_dados, c);
  perform public.exigir_campos(v.c);
  perform public.exigir_fornecedor_liberado(p_dados->>'fornecedorId', 'fornecedorId');
  insert into public.atas (numero, fornecedor_id, vigencia_inicio, vigencia_fim, regras)
  values (v_numero, p_dados->>'fornecedorId', (p_dados->>'vigenciaInicio')::date, v.v_fim::date, v.r) returning id into v_id;
  insert into public.ata_itens (ordem, ata_id, tamanho_id, quantidade)
  select (x.n - 1)::integer, v_id, x.i->>'tamanhoId', public.num(x.i->'quantidade') from jsonb_array_elements(p_dados->'itens') with ordinality x(i, n);
  perform public.registrar_evento('ata', v_id, 'criado', format('Ata %s cadastrada (vigência até %s)', v_numero, v.v_fim), v_numero);
  return to_jsonb(v_id);
end $$;

create or replace function public.atualizar_ata(p_numero text, p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  a public.atas;
  v record;
  v_n integer;
begin
  perform public.exigir('contratos:editar');
  select * into a from public.atas where numero = upper(trim(p_numero)) for update;
  if a.id is null then perform public.falhar(404, format('Ata %s não encontrada.', p_numero)); end if;
  select count(*) into v_n from public.contratos where ata_id = a.id;
  if v_n > 0 then
    perform public.falhar(409, format('A ata %s já tem %s: regras, vigência e itens não mudam mais.', a.numero,
      case when v_n = 1 then 'um contrato' else v_n || ' contratos' end));
  end if;
  select * into v from public.dados_da_ata(p_dados, '{}');
  perform public.exigir_campos(v.c);
  perform public.exigir_fornecedor_liberado(p_dados->>'fornecedorId', 'fornecedorId');
  update public.atas set fornecedor_id = p_dados->>'fornecedorId', vigencia_inicio = (p_dados->>'vigenciaInicio')::date,
    vigencia_fim = v.v_fim::date, regras = v.r
  where id = a.id;
  perform set_config('holz.permitir_troca', 'sim', true);
  delete from public.ata_itens where ata_id = a.id;
  perform set_config('holz.permitir_troca', '', true);
  insert into public.ata_itens (ordem, ata_id, tamanho_id, quantidade)
  select (x.n - 1)::integer, a.id, x.i->>'tamanhoId', public.num(x.i->'quantidade') from jsonb_array_elements(p_dados->'itens') with ordinality x(i, n);
  perform public.registrar_evento('ata', a.id, 'alterado', format('Ata %s alterada (vigência até %s)', a.numero, v.v_fim), a.numero);
  return to_jsonb(a.id);
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Privilégios (0008): o app chama criar_ata e atualizar_ata; dados_da_ata é interna.
-- ---------------------------------------------------------------------------------------------------------------
revoke all on function public.dados_da_ata(jsonb, jsonb), public.criar_ata(jsonb), public.atualizar_ata(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.criar_ata(jsonb), public.atualizar_ata(text, jsonb) to authenticated;
