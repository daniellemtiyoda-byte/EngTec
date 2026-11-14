-- Holz Trilho v2 · 0011 · Local de entrega do contrato
-- O contrato passa a dizer onde o fornecedor entrega os dormentes (texto livre, obrigatório no contrato novo; os
-- contratos que já existiam ficam sem local até alguém editar). A vigência do contrato não é gravada: o app
-- calcula pelo fim da janela da última parcela (assinatura + regra da ata).
--   · contratos.local_entrega (coluna nova; os contratos antigos ficam sem valor).
--   · criar_contrato e atualizar_contrato: as mesmas da 0005, com o local de entrega.
-- Rodar depois da 0010, no editor SQL. Depois, rodar de novo o supabase/seed.sql para a demonstração ganhar o local.

-- Sem NOT NULL: o modelo da demonstração gravado antes desta migração não tem a coluna e é carregado com
-- jsonb_populate_recordset, que manda NULL; o app lê NULL como vazio.
alter table public.contratos add column if not exists local_entrega text;

create or replace function public.criar_contrato(p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c jsonb := '{}';
  v_numero text := upper(public.txt(p_dados, 'numero'));
  a public.atas;
  v_assinatura text := p_dados->>'dataAssinatura';
  v_por jsonb;
  v_id text;
  v_total numeric;
begin
  perform public.exigir('contratos:editar');
  select * into a from public.atas where id = p_dados->>'ataId';
  if a.id is null then c := c || '{"ataId": "Escolha a ata."}'; end if;
  if v_numero !~ '^[A-Z]{2}\d{5}-\d{2}$' then c := c || '{"numero": "Número no formato AA00000-00 (ex. AR00224-01)."}';
  elsif a.id is not null and left(v_numero, length(a.numero) + 1) <> a.numero || '-' then c := c || jsonb_build_object('numero', format('O contrato começa pelo número da ata (%s-).', a.numero));
  elsif exists (select 1 from public.contratos where numero = v_numero) then c := c || '{"numero": "Contrato já cadastrado."}';
  end if;
  if not public.inteiro(p_dados->'ano') or public.num(p_dados->'ano') < 2000 then c := c || '{"ano": "Informe o ano."}'; end if;
  if not public.e_data(v_assinatura) then c := c || '{"dataAssinatura": "Informe a data de assinatura."}';
  elsif a.id is not null and (v_assinatura::date < a.vigencia_inicio or v_assinatura::date > a.vigencia_fim) then
    c := c || jsonb_build_object('dataAssinatura', format('A ata %s vale de %s a %s.', a.numero, a.vigencia_inicio, a.vigencia_fim));
  end if;
  if public.txt(p_dados, 'gestor') = '' then c := c || '{"gestor": "Informe o gestor do contrato."}'; end if;
  if public.txt(p_dados, 'localEntrega') = '' then c := c || '{"localEntrega": "Informe o local de entrega."}'; end if;
  perform public.exigir_campos(c);
  perform public.exigir_fornecedor_liberado(a.fornecedor_id, 'ataId');
  select x.c, x.por_tamanho into c, v_por from public.validar_cronograma(a.id, p_dados->'parcelas', null, c) x;
  perform public.exigir_campos(c, 'Confira o cronograma: as regras da ata não foram atendidas.');
  insert into public.contratos (numero, ata_id, ano, data_assinatura, gestor, local_entrega, criado_por)
  values (v_numero, a.id, public.num(p_dados->'ano'), v_assinatura::date, public.txt(p_dados, 'gestor'), public.txt(p_dados, 'localEntrega'), public.quem()) returning id into v_id;
  insert into public.contrato_itens (ordem, contrato_id, tamanho_id, quantidade)
  select (row_number() over (order by o) - 1)::integer, v_id, x->>'tamanhoId', public.num(x->'quantidade')
  from jsonb_array_elements(v_por) with ordinality y(x, o) where public.num(x->'quantidade') > 0 order by o;
  perform public.gravar_parcelas(v_id, p_dados->'parcelas');
  select coalesce(sum(quantidade), 0) into v_total from public.contrato_itens where contrato_id = v_id;
  perform public.registrar_evento('contrato', v_id, 'criado', format('Contrato criado: %s parcela(s), %s dormentes (gestor %s)',
    (select count(distinct numero) from public.contrato_parcelas where contrato_id = v_id), v_total, public.txt(p_dados, 'gestor')), v_numero);
  return to_jsonb(v_id);
end $$;

create or replace function public.atualizar_contrato(p_numero text, p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.contratos;
  c jsonb := '{}';
  v_por jsonb;
  it record;
  v_q numeric;
  v_ordem integer;
  v_cron boolean := jsonb_typeof(p_dados->'parcelas') = 'array';
begin
  perform public.exigir('contratos:editar');
  select * into r from public.contratos where numero = p_numero for update;
  if not found then perform public.falhar(404, format('Contrato %s não encontrado.', p_numero)); end if;
  if r.situacao = 'cancelado' then perform public.falhar(409, format('O contrato %s está cancelado.', p_numero)); end if;
  if p_dados ? 'gestor' and public.txt(p_dados, 'gestor') = '' then c := c || '{"gestor": "Informe o gestor do contrato."}'; end if;
  if p_dados ? 'localEntrega' and public.txt(p_dados, 'localEntrega') = '' then c := c || '{"localEntrega": "Informe o local de entrega."}'; end if;
  if v_cron then
    select x.c, x.por_tamanho into c, v_por from public.validar_cronograma(r.ata_id, p_dados->'parcelas', r.id, c) x;
    for it in select v.*, t.codigo from public.v_contrato_itens v join public.tamanhos t on t.id = v.tamanho_id where v.contrato_id = r.id order by v.ordem loop
      v_q := coalesce((select public.num(x->'quantidade') from jsonb_array_elements(v_por) x where x->>'tamanhoId' = it.tamanho_id), 0);
      if v_q < it.emitidos - it.reprovados then
        c := c || jsonb_build_object('parcelas', format('O tamanho %s não pode ficar abaixo do já emitido (%s).', it.codigo, it.emitidos - it.reprovados));
      end if;
    end loop;
    -- Entregas já vinculadas a uma parcela que deixaria de existir.
    if exists (select 1 from public.entregas where contrato_id = r.id and parcela > jsonb_array_length(p_dados->'parcelas')) then
      c := c || '{"parcelas": "Há entregas em parcelas que deixariam de existir."}';
    end if;
  end if;
  perform public.exigir_campos(c, 'Confira o cronograma: as regras da ata não foram atendidas.');
  if p_dados ? 'gestor' then update public.contratos set gestor = public.txt(p_dados, 'gestor') where id = r.id; end if;
  if p_dados ? 'localEntrega' then update public.contratos set local_entrega = public.txt(p_dados, 'localEntrega') where id = r.id; end if;
  if v_cron then
    perform set_config('holz.permitir_troca', 'sim', true);
    delete from public.contrato_parcelas where contrato_id = r.id;
    perform set_config('holz.permitir_troca', '', true);
    perform public.gravar_parcelas(r.id, p_dados->'parcelas');
    for it in select x->>'tamanhoId' as tamanho_id, public.num(x->'quantidade') as q from jsonb_array_elements(v_por) with ordinality y(x, o) order by o loop
      if exists (select 1 from public.contrato_itens where contrato_id = r.id and tamanho_id = it.tamanho_id) then
        update public.contrato_itens set quantidade = it.q where contrato_id = r.id and tamanho_id = it.tamanho_id;
      elsif it.q > 0 then
        select coalesce(max(ordem) + 1, 0) into v_ordem from public.contrato_itens where contrato_id = r.id;
        insert into public.contrato_itens (ordem, contrato_id, tamanho_id, quantidade) values (v_ordem, r.id, it.tamanho_id, it.q);
      end if;
    end loop;
    update public.contrato_itens set quantidade = 0 where contrato_id = r.id
      and tamanho_id not in (select x->>'tamanhoId' from jsonb_array_elements(v_por) x);
  end if;
  perform public.registrar_evento('contrato', r.id, 'alterado', case when v_cron then 'Cronograma alterado' else 'Gestor alterado' end, r.numero);
  return to_jsonb(r.id);
end $$;

-- Privilégios (0008): as duas continuam chamadas pelo app.
revoke all on function public.criar_contrato(jsonb), public.atualizar_contrato(text, jsonb) from public, anon, authenticated;
grant execute on function public.criar_contrato(jsonb), public.atualizar_contrato(text, jsonb) to authenticated;
