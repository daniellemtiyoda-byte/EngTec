-- =============================================================================
-- Holz Trilho — Migração 2/4: regras de negócio (funções chamadas pelo front)
--
-- Cada operação de src/services/contracts.ts que grava algo é uma função aqui,
-- chamada por POST /rest/v1/rpc/<nome> (src/services/supabase). As regras são
-- as mesmas de src/services/mock (recebimento.ts, inspecao.ts, rme.ts,
-- ajustes.ts, estoque.ts); se mudar uma, mude a outra.
--
-- Erros: SQLSTATE 'PT<status>' faz o PostgREST responder com esse status HTTP;
-- o HINT 'campo:<nome>' vira o erro por campo (ApiError.detalhes) no front,
-- com as mesmas chaves que o mock usa.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Auxiliares
-- ---------------------------------------------------------------------------
create or replace function falha(p_status int, p_msg text, p_campo text default null)
returns void language plpgsql as $$
begin
  raise exception using errcode = 'PT' || p_status, message = p_msg, hint = coalesce('campo:' || p_campo, '');
end $$;

create or replace function hoje() returns date
language sql stable as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

create or replace function nome_de(p uuid) returns text
language sql stable security definer set search_path = public as $$ select nome from perfis where id = p $$;

create or replace function tem_permissao(p_permissao text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from usuario_papeis up
      join perfis pf           on pf.id = up.usuario_id and pf.ativo
      join papel_permissoes pp on pp.papel = up.papel
     where up.usuario_id = auth.uid() and pp.permissao in (p_permissao, 'admin'))
$$;

create or replace function permissoes_do_usuario() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct pp.permissao order by pp.permissao), '{}')
    from usuario_papeis up join papel_permissoes pp on pp.papel = up.papel
    join perfis pf on pf.id = up.usuario_id and pf.ativo
   where up.usuario_id = auth.uid()
$$;

create or replace function exigir(p_permissao text) returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then perform falha(401, 'Sessão expirada ou não autenticada. Entre novamente.'); end if;
  if not tem_permissao(p_permissao) then perform falha(403, 'Você não tem permissão para executar esta operação.'); end if;
  return auth.uid();
end $$;

create or replace function param(p_chave text) returns numeric
language sql stable security definer set search_path = public as $$ select valor from parametros where chave = p_chave $$;

-- Chave de acesso NF-e: 44 dígitos, DV módulo 11 (mesma regra de utils/nfeXml.ts)
create or replace function chave_nfe_valida(c text) returns boolean
language plpgsql immutable as $$
declare s int := 0; p int := 2; dv int;
begin
  if c is null or c !~ '^[0-9]{44}$' then return false; end if;
  for i in reverse 43..1 loop
    s := s + substr(c, i, 1)::int * p;
    p := case when p = 9 then 2 else p + 1 end;
  end loop;
  dv := 11 - (s % 11);
  if dv >= 10 then dv := 0; end if;
  return dv = substr(c, 44, 1)::int;
end $$;

create or replace function cnpj_valido(c text) returns boolean
language plpgsql immutable as $$
declare p1 int[] := '{5,4,3,2,9,8,7,6,5,4,3,2}'; p2 int[] := '{6,5,4,3,2,9,8,7,6,5,4,3,2}'; s int; d1 int; d2 int;
begin
  if c is null or c !~ '^[0-9]{14}$' or c ~ '^(.)\1{13}$' then return false; end if;
  s := 0; for i in 1..12 loop s := s + substr(c, i, 1)::int * p1[i]; end loop;
  d1 := case when s % 11 < 2 then 0 else 11 - s % 11 end;
  s := 0; for i in 1..13 loop s := s + substr(c, i, 1)::int * p2[i]; end loop;
  d2 := case when s % 11 < 2 then 0 else 11 - s % 11 end;
  return d1 = substr(c, 13, 1)::int and d2 = substr(c, 14, 1)::int;
end $$;

alter table notas_fiscais add constraint nf_chave_valida check (chave_acesso is null or chave_nfe_valida(chave_acesso));
alter table fornecedores  add constraint fornecedor_cnpj_valido check (cnpj_valido(cnpj));

-- diferencaVolumePct de src/dominio/parametros.ts
create or replace function diferenca_volume_pct(recebido numeric, dof numeric) returns numeric
language sql immutable as $$
  select case when dof > 0 then (recebido - dof) / dof * 100 when recebido > 0 then 100 else 0 end
$$;

create or replace function categoria_do_indice(p_indice numeric) returns smallint
language sql stable as $$
  select case when p_indice is null then null
              when p_indice >= param('categoria_1_indice_min') then 1
              when p_indice >= param('categoria_2_indice_min') then 2
              else 3 end::smallint
$$;

create or replace function proximo_seq(p_tabela text, p_ano smallint) returns integer
language plpgsql as $$
declare v int;
begin
  if p_tabela = 'lote' then
    insert into lote_sequencias as s values (p_ano, 1)
    on conflict (ano) do update set ultimo = s.ultimo + 1 returning ultimo into v;
  else
    insert into rme_sequencias as s values (p_ano, 1)
    on conflict (ano) do update set ultimo = s.ultimo + 1 returning ultimo into v;
  end if;
  return v;
end $$;

create or replace function fardo_liberado(f fardos) returns boolean
language sql immutable as $$ select f.resultado = 'aprovado' and f.motivo_bloqueio is null $$;

create or replace function rotulo_motivo_perda(m motivo_perda) returns text
language sql immutable as $$
  select case m when 'avaria' then 'Avaria' when 'incendio' then 'Incêndio' when 'intemperie' then 'Intempérie'
                when 'furto' then 'Furto' else 'Outro' end
$$;

-- ---------------------------------------------------------------------------
-- Gatilhos
-- ---------------------------------------------------------------------------
create or replace function trg_auditoria() returns trigger
language plpgsql security definer set search_path = public as $$
declare linha jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into auditoria (tabela, registro_id, acao, usuario_id, antes, depois)
  values (tg_table_name, coalesce(linha->>'id', linha->>'chave', linha->>'codigo'), tg_op, auth.uid(),
          case when tg_op <> 'INSERT' then to_jsonb(old) end, case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['usuario_papeis','papel_permissoes','parametros','fornecedores','especies','tamanhos',
                           'notas_fiscais','dofs','recebimentos','lotes','fardos','rmes','movimentacoes',
                           'sessoes_inventario','inventario_contagens'] loop
    execute format('create trigger %I after insert or update or delete on %I for each row execute function trg_auditoria()', t || '_auditoria', t);
  end loop;
end $$;

-- Novo usuário no Supabase Auth → perfil (os papéis são dados pelo administrador)
create or replace function trg_novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into perfis (id, nome, email)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'nome', ''), split_part(new.email, '@', 1)), new.email)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger auth_novo_usuario after insert on auth.users for each row execute function trg_novo_usuario();

-- Saldo do fardo = dormentes em estoque nele. Zerado: baixado; abaixo do inicial (ou já aberto): aberto.
create or replace function recalcular_fardo(p_fardo uuid) returns void
language sql as $$
  update fardos f
     set saldo  = s.n,
         estado = case when s.n = 0 then 'baixado'
                       when f.estado = 'fechado' and s.n >= f.quantidade_inicial then 'fechado'
                       else 'aberto' end::estado_fardo
    from (select count(*)::int as n from dormentes where fardo_id = p_fardo and estado = 'em_estoque') s
   where f.id = p_fardo
$$;

create or replace function trg_dormentes_saldo() returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('holz.sem_recalculo', true), '') = 'on' then return null; end if;
  if new.fardo_id is not distinct from old.fardo_id and new.estado = old.estado then return null; end if;
  if old.fardo_id is not null then perform recalcular_fardo(old.fardo_id); end if;
  if new.fardo_id is not null and new.fardo_id is distinct from old.fardo_id then perform recalcular_fardo(new.fardo_id); end if;
  return null;
end $$;

create trigger dormentes_saldo after update on dormentes for each row execute function trg_dormentes_saldo();

-- Inspeção: lote concluído não recebe mais; vale a mais recente; primeira põe o lote "em inspeção"
create or replace function trg_inspecao_antes() returns trigger language plpgsql as $$
declare v_lote text;
begin
  select l.codigo into v_lote from dormentes d join lotes l on l.id = d.lote_id
   where d.id = new.dormente_id and l.etapa_inspecao = 'concluida';
  if v_lote is not null then
    perform falha(409, format('A inspeção do lote %s já foi concluída e os fardos já foram formados.', v_lote));
  end if;
  return new;
end $$;

create or replace function trg_inspecao_depois() returns trigger language plpgsql as $$
begin
  update dormentes d set inspecao_vigente_id = new.id
   where d.id = new.dormente_id
     and (d.inspecao_vigente_id is null
          or (select i.inspecionado_em from inspecoes i where i.id = d.inspecao_vigente_id) <= new.inspecionado_em);
  update lotes set etapa_inspecao = 'em_inspecao'
   where id = (select lote_id from dormentes where id = new.dormente_id) and etapa_inspecao = 'aguardando';
  return null;
end $$;

create trigger inspecoes_antes  before insert on inspecoes for each row execute function trg_inspecao_antes();
create trigger inspecoes_depois after  insert on inspecoes for each row execute function trg_inspecao_depois();

-- =============================================================================
-- Sessão e arquivos
-- =============================================================================

-- Usuario (models.ts) do usuário logado; registra o último acesso
create or replace function meu_usuario() returns jsonb
language plpgsql security definer set search_path = public as $$
declare p perfis;
begin
  if auth.uid() is null then perform falha(401, 'Sessão expirada ou não autenticada. Entre novamente.'); end if;
  select * into p from perfis where id = auth.uid();
  if not found or not p.ativo then perform falha(403, 'Usuário inativo ou sem cadastro no sistema. Fale com o administrador.'); end if;
  update perfis set ultimo_acesso = now() where id = p.id;
  return jsonb_build_object(
    'id', p.id, 'nome', p.nome, 'email', p.email, 'ativo', p.ativo, 'ultimoAcesso', now(),
    'perfil', coalesce((select string_agg(pa.nome, ', ' order by pa.nome) from usuario_papeis up join papeis pa on pa.codigo = up.papel
                         where up.usuario_id = p.id), 'Sem papel'),
    'permissoes', to_jsonb(permissoes_do_usuario()));
end $$;

-- O front envia o arquivo ao Storage (pasta = id do usuário) e registra aqui
create or replace function registrar_arquivo(p_bucket text, p_caminho text, p_nome text,
                                             p_mime text default null, p_tamanho bigint default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then perform falha(401, 'Sessão expirada ou não autenticada. Entre novamente.'); end if;
  if split_part(p_caminho, '/', 1) <> auth.uid()::text then perform falha(422, 'Caminho de arquivo inválido.'); end if;
  if not exists (select 1 from storage.objects where bucket_id = p_bucket and name = p_caminho) then
    perform falha(422, 'Arquivo não encontrado no armazenamento. Envie de novo.');
  end if;
  insert into arquivos (bucket, caminho, nome_original, mime, tamanho_bytes, enviado_por)
  values (p_bucket, p_caminho, left(p_nome, 200), p_mime, p_tamanho, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- =============================================================================
-- NF e DOF
-- =============================================================================

-- p = NovaNf (models.ts)
create or replace function nf_cadastrar(p jsonb, p_xml uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := exigir('nf:cadastrar');
  v_forn fornecedores; v_chave text; v_id uuid; it record;
begin
  select * into v_forn from fornecedores where id = (p->>'fornecedorId')::uuid;
  if not found then perform falha(422, 'Fornecedor não encontrado.', 'fornecedorId'); end if;
  if v_forn.status = 'bloqueado' then perform falha(422, 'Fornecedor bloqueado não pode emitir NF para recebimento.', 'fornecedorId'); end if;
  if length(trim(coalesce(p->>'numero', ''))) = 0 then perform falha(422, 'Informe o número da NF.', 'numero'); end if;
  if p->>'emissao' is null then perform falha(422, 'Informe a data de emissão.', 'emissao'); end if;

  v_chave := nullif(regexp_replace(coalesce(p->>'chaveAcesso', ''), '\D', '', 'g'), '');
  if v_chave is not null and not chave_nfe_valida(v_chave) then perform falha(422, 'Chave de acesso inválida: confira os 44 dígitos.', 'chaveAcesso'); end if;
  if v_chave is not null and exists (select 1 from notas_fiscais where chave_acesso = v_chave) then
    perform falha(409, 'Já existe uma NF com esta chave de acesso.', 'chaveAcesso');
  end if;
  if exists (select 1 from notas_fiscais where fornecedor_id = v_forn.id and numero = trim(p->>'numero')
                                         and serie = coalesce(nullif(trim(p->>'serie'), ''), '1')) then
    perform falha(409, 'Esta NF já foi cadastrada para o fornecedor (mesmo número e série).', 'numero');
  end if;
  if jsonb_array_length(coalesce(p->'itens', '[]')) = 0 then perform falha(422, 'Informe ao menos um item.', 'itens'); end if;
  if p_xml is not null and not exists (select 1 from arquivos where id = p_xml and bucket = 'nfe-xml') then
    perform falha(422, 'Arquivo XML não encontrado.', 'xml');
  end if;

  insert into notas_fiscais (numero, serie, chave_acesso, fornecedor_id, emissao, origem, xml_arquivo_id, dof_sugerido, criado_por)
  values (trim(p->>'numero'), coalesce(nullif(trim(p->>'serie'), ''), '1'), v_chave, v_forn.id, (p->>'emissao')::date,
          case when p_xml is null then 'manual' else 'xml' end::origem_nf, p_xml, nullif(trim(p->>'dofSugerido'), ''), v_user)
  returning id into v_id;

  for it in select x.*, row_number() over () as ordem
              from jsonb_to_recordset(p->'itens') as x(descricao text, "especieId" uuid, "tamanhoId" uuid, quantidade numeric) loop
    if not exists (select 1 from especies where id = it."especieId") or not exists (select 1 from tamanhos where id = it."tamanhoId") then
      perform falha(422, 'Espécie ou tamanho do item não encontrado no cadastro.', 'itens');
    end if;
    if it.quantidade is null or it.quantidade < 1 or it.quantidade <> trunc(it.quantidade) then
      perform falha(422, 'Cada item precisa de quantidade inteira, mínimo 1.', 'itens');
    end if;
    insert into nf_itens (nf_id, ordem, descricao, especie_id, tamanho_id, quantidade)
    values (v_id, it.ordem, coalesce(it.descricao, ''), it."especieId", it."tamanhoId", it.quantidade::int);
  end loop;
  return v_id;
end $$;

-- p = NovoDof; volume obrigatório para cada espécie dos itens da NF
create or replace function nf_cadastrar_dof(p_nf uuid, p jsonb, p_pdf uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_user uuid := exigir('nf:cadastrar'); v_id uuid; e record; v_vol numeric;
begin
  if not exists (select 1 from notas_fiscais where id = p_nf) then perform falha(404, 'NF não encontrada.'); end if;
  if exists (select 1 from dofs where nf_id = p_nf) then perform falha(409, 'Esta NF já tem DOF (um DOF por NF).'); end if;
  if p_pdf is null or not exists (select 1 from arquivos where id = p_pdf and bucket = 'dof-pdf' and lower(nome_original) like '%.pdf') then
    perform falha(422, 'O DOF deve ser anexado em PDF.', 'pdf');
  end if;
  if length(trim(coalesce(p->>'numero', ''))) = 0 then perform falha(422, 'Informe o número do DOF.', 'numero'); end if;
  if length(trim(coalesce(p->>'codigoControle', ''))) = 0 then perform falha(422, 'Informe o código de controle.', 'codigoControle'); end if;
  if p->>'validade' is null then perform falha(422, 'Informe a validade do DOF.', 'validade'); end if;
  if exists (select 1 from dofs where lower(codigo_controle) = lower(trim(p->>'codigoControle'))) then
    perform falha(409, 'Código de controle já usado em outro DOF.', 'codigoControle');
  end if;

  insert into dofs (nf_id, numero, codigo_controle, validade, pdf_arquivo_id, criado_por)
  values (p_nf, trim(p->>'numero'), trim(p->>'codigoControle'), (p->>'validade')::date, p_pdf, v_user)
  returning id into v_id;

  for e in select distinct es.id, es.nome_cientifico from nf_itens i join especies es on es.id = i.especie_id where i.nf_id = p_nf loop
    select (x->>'volumeM3')::numeric into v_vol from jsonb_array_elements(coalesce(p->'volumes', '[]')) x
     where (x->>'especieId')::uuid = e.id limit 1;
    if v_vol is null or v_vol <= 0 then
      perform falha(422, format('Informe o volume do DOF para %s.', e.nome_cientifico), 'vol_' || e.id);
    end if;
    insert into dof_volumes values (v_id, e.id, v_vol);
  end loop;
  return v_id;
end $$;

create or replace function nf_declarar_dof(p_nf uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := exigir('dof:declarar'); v_dof dofs;
begin
  select * into v_dof from dofs where nf_id = p_nf for update;
  if not found then perform falha(404, 'NF ou DOF não encontrado.'); end if;
  if not exists (select 1 from recebimentos where nf_id = p_nf) then
    perform falha(409, 'O DOF só é declarado no Sinaflor depois do recebimento da NF.');
  end if;
  if v_dof.declarado_em is not null then perform falha(409, 'Este DOF já foi marcado como declarado.'); end if;
  update dofs set declarado_em = now(), declarado_por = v_user where id = v_dof.id;
end $$;

-- =============================================================================
-- Recebimento: cria um lote por espécie + tamanho, e os dormentes (LT26-0042-0001...)
-- p = NovoRecebimento
-- =============================================================================
create or replace function recebimento_confirmar(p jsonb, p_fotos uuid[] default '{}') returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := exigir('recebimento:registrar');
  v_nf notas_fiscais; v_dof dofs; v_rec uuid; v_forn text;
  v_ano smallint := extract(year from hoje())::smallint;
  v_tol numeric := param('tolerancia_volume_pct');
  v_div_qtd boolean; v_avaria boolean := coalesce((p->>'avaria')::boolean, false);
  v_acima boolean := false; v_maior numeric := 0; v_pct numeric;
  v_codigo text; v_lote uuid; v_quando timestamptz := now();
  r record;
begin
  select * into v_nf from notas_fiscais where id = (p->>'nfId')::uuid for update;
  if not found then perform falha(404, 'NF não encontrada.'); end if;
  if exists (select 1 from recebimentos where nf_id = v_nf.id) then perform falha(409, 'Esta NF já foi recebida.'); end if;
  select * into v_dof from dofs where nf_id = v_nf.id;
  if not found then perform falha(409, 'Recebimento bloqueado: a NF não tem DOF cadastrado.'); end if;
  select razao_social into v_forn from fornecedores where id = v_nf.fornecedor_id;

  -- quantidade conferida de cada item (em unidades, ao menos 1)
  create temp table if not exists _conf (nf_item_id uuid, quantidade int) on commit drop;
  truncate _conf;
  for r in select i.id, (select (x->>'quantidade')::numeric from jsonb_array_elements(coalesce(p->'itens', '[]')) x
                          where (x->>'itemId')::uuid = i.id limit 1) as q
             from nf_itens i where i.nf_id = v_nf.id order by i.ordem loop
    if r.q is null or r.q < 1 or r.q <> trunc(r.q) then
      perform falha(422, 'Informe a quantidade conferida (ao menos 1).', 'item-' || r.id);
    end if;
    insert into _conf values (r.id, r.q::int);
  end loop;

  select bool_or(c.quantidade <> i.quantidade) into v_div_qtd from _conf c join nf_itens i on i.id = c.nf_item_id;
  if (v_div_qtd or v_avaria) and coalesce(cardinality(p_fotos), 0) = 0 then
    perform falha(422, 'Fotos da carga são obrigatórias quando há divergência com a NF ou avaria.', 'fotos');
  end if;

  -- volume por espécie: soma dos lotes da espécie x volume do DOF da espécie
  for r in
    select dv.especie_id, dv.volume_m3 as dofv,
           coalesce((select sum(c.quantidade * t.volume_m3) from _conf c join nf_itens i on i.id = c.nf_item_id
                       join tamanhos t on t.id = i.tamanho_id where i.especie_id = dv.especie_id), 0) as recebido
      from dof_volumes dv where dv.dof_id = v_dof.id
  loop
    v_pct := round(diferenca_volume_pct(r.recebido, r.dofv), 2);
    if abs(v_pct) > abs(v_maior) then v_maior := v_pct; end if;
    v_acima := v_acima or abs(v_pct) > v_tol;
  end loop;
  if v_acima and length(trim(coalesce(p->>'justificativa', ''))) = 0 then
    perform falha(422, 'Divergência de volume acima da tolerância: a justificativa é obrigatória.', 'justificativa');
  end if;

  insert into recebimentos (nf_id, recebido_em, recebido_por, avaria, observacao, justificativa,
                            divergencia_quantidade, divergencia_volume_pct, acima_tolerancia)
  values (v_nf.id, v_quando, v_user, v_avaria, nullif(trim(p->>'observacao'), ''), nullif(trim(p->>'justificativa'), ''),
          coalesce(v_div_qtd, false), v_maior, v_acima)
  returning id into v_rec;
  insert into recebimento_itens select v_rec, nf_item_id, quantidade from _conf;
  insert into recebimento_fotos select v_rec, unnest(p_fotos);
  insert into recebimento_volumes
  select v_rec, dv.especie_id, dv.volume_m3, x.recebido, round(diferenca_volume_pct(x.recebido, dv.volume_m3), 2)
    from dof_volumes dv
    cross join lateral (select coalesce(sum(c.quantidade * t.volume_m3), 0) as recebido from _conf c
                          join nf_itens i on i.id = c.nf_item_id join tamanhos t on t.id = i.tamanho_id
                         where i.especie_id = dv.especie_id) x
   where dv.dof_id = v_dof.id;

  -- um lote por espécie + tamanho, na ordem dos itens
  for r in
    select i.especie_id, i.tamanho_id, sum(c.quantidade)::int as qtd, t.volume_m3, min(i.ordem) as ordem
      from _conf c join nf_itens i on i.id = c.nf_item_id join tamanhos t on t.id = i.tamanho_id
     group by i.especie_id, i.tamanho_id, t.volume_m3 order by min(i.ordem)
  loop
    v_codigo := format('LT%s-%s', lpad((v_ano % 100)::text, 2, '0'), lpad(proximo_seq('lote', v_ano)::text, 4, '0'));
    insert into lotes (codigo, ano, sequencia, nf_id, recebimento_id, especie_id, tamanho_id, quantidade,
                       volume_calculado_m3, divergente, recebido_em)
    values (v_codigo, v_ano, split_part(v_codigo, '-', 2)::int, v_nf.id, v_rec, r.especie_id, r.tamanho_id, r.qtd,
            round(r.qtd * r.volume_m3, 4), v_acima, v_quando)
    returning id into v_lote;
    insert into dormentes (lote_id, sequencia, codigo)
    select v_lote, g, v_codigo || '-' || lpad(g::text, 4, '0') from generate_series(1, r.qtd) g;
    insert into movimentacoes (tipo, lote_id, referencia, quantidade, origem, destino, data_hora, usuario_id, status)
    values ('entrada', v_lote, 'NF ' || v_nf.numero, r.qtd, v_forn, 'A definir', v_quando, v_user, 'aprovado');
  end loop;

  -- volume documental: o do DOF da espécie distribuído entre os lotes dela, proporcional ao calculado
  update lotes l
     set volume_documental_m3 = round(dv.volume_m3 * l.volume_calculado_m3
                                      / nullif((select sum(volume_calculado_m3) from lotes x
                                                 where x.recebimento_id = v_rec and x.especie_id = l.especie_id), 0), 4)
    from dof_volumes dv
   where l.recebimento_id = v_rec and dv.dof_id = v_dof.id and dv.especie_id = l.especie_id;

  return v_rec;
end $$;

-- Libera os lotes "com divergência" de um recebimento (supervisor/gestor; ainda sem tela: chamar pelo SQL Editor ou por RPC)
create or replace function recebimento_liberar_divergencia(p_recebimento uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := exigir('movimentacoes:aprovar');
begin
  if length(trim(coalesce(p_motivo, ''))) = 0 then perform falha(422, 'Informe o motivo da liberação.', 'motivo'); end if;
  update lotes set divergente = false where recebimento_id = p_recebimento and divergente;
  if not found then perform falha(409, 'Recebimento sem lotes com divergência.'); end if;
  update recebimentos set observacao = concat_ws(E'\n', observacao, format('Divergência liberada por %s: %s', nome_de(v_user), p_motivo))
   where id = p_recebimento;
end $$;

-- =============================================================================
-- Inspeção
-- =============================================================================

-- Integração com o Railway Edge Inspector: chamada pelo servidor (service role). Idempotente por id_externo.
-- Mapeamento PROVISÓRIO: APROVADO → aprovado, ATENCAO → quarentena, REJEITADO → reprovado.
create or replace function inspecao_do_inspector(
  p_codigo_peca text, p_veredito text, p_indice numeric, p_inspetor text, p_estacao text,
  p_quando timestamptz, p_relatorio_url text, p_id_externo text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_dorm dormentes; v_ver veredito_inspector; v_id uuid;
begin
  select * into v_dorm from dormentes where codigo = upper(trim(p_codigo_peca));
  if not found then perform falha(422, format('Código de peça fora do lote ou inexistente: %s.', p_codigo_peca)); end if;
  v_ver := upper(translate(trim(p_veredito), 'ÇçÃãÉé', 'CcAaEe'))::veredito_inspector;
  insert into inspecoes (dormente_id, resultado, veredito, indice, categoria, inspetor, estacao, inspecionado_em,
                         relatorio_url, origem, id_externo)
  values (v_dorm.id, case v_ver when 'APROVADO' then 'aprovado' when 'ATENCAO' then 'quarentena' else 'reprovado' end::resultado_peca,
          v_ver, p_indice, categoria_do_indice(p_indice), coalesce(p_inspetor, 'Inspector'), p_estacao, coalesce(p_quando, now()),
          p_relatorio_url, 'inspector', p_id_externo)
  on conflict (id_externo) do nothing
  returning id into v_id;
  return v_id;
end $$;

-- Lançamento manual (sem o Inspector): N peças com o mesmo resultado, nas primeiras posições sem resultado.
-- p = NovaInspecaoManual. Devolve os ids criados.
create or replace function inspecao_lancar(p_lote text, p jsonb) returns uuid[]
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := exigir('inspecao:concluir');
  v_lote lotes; v_res resultado_peca; v_cat smallint; v_qtd numeric := (p->>'quantidade')::numeric;
  v_livres int; v_ids uuid[];
begin
  select * into v_lote from lotes where lower(codigo) = lower(trim(p_lote));
  if not found then perform falha(404, format('Lote %s não encontrado.', p_lote)); end if;
  if v_lote.etapa_inspecao = 'concluida' then
    perform falha(409, format('A inspeção do lote %s já foi concluída e os fardos já foram formados.', v_lote.codigo));
  end if;
  if p->>'resultado' not in ('aprovado', 'quarentena', 'reprovado') or p->>'resultado' is null then
    perform falha(422, 'Resultado inválido.', 'resultado');
  end if;
  v_res := (p->>'resultado')::resultado_peca;
  v_cat := (p->>'categoria')::smallint;
  if v_res = 'aprovado' and (v_cat is null or v_cat < 1) then perform falha(422, 'Peça aprovada precisa de categoria.', 'categoria'); end if;
  if v_qtd is null or v_qtd < 1 or v_qtd <> trunc(v_qtd) then perform falha(422, 'Quantidade inválida: inteiro, mínimo 1.', 'quantidade'); end if;
  select count(*) into v_livres from dormentes where lote_id = v_lote.id and inspecao_vigente_id is null;
  if v_qtd > v_livres then perform falha(422, format('Só restam %s peça(s) sem resultado neste lote.', v_livres), 'quantidade'); end if;

  with novas as (
    insert into inspecoes (dormente_id, resultado, categoria, inspetor, origem, lancado_por)
    select d.id, v_res, case when v_res = 'aprovado' then v_cat end, nome_de(v_user), 'manual', v_user
      from (select id from dormentes where lote_id = v_lote.id and inspecao_vigente_id is null
             order by sequencia limit v_qtd::int) d
    returning id)
  select array_agg(id) into v_ids from novas;
  return v_ids;
end $$;

-- SugestaoFardos (models.ts): grupos por resultado (e categoria das aprovadas) e fardos de até 14, na ordem da sequência
create or replace function lote_sugestao_fardos(p_codigo text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_lote lotes; v_max int := param('dormentes_por_fardo')::int; v_insp int; v_grupos jsonb; v_fardos jsonb;
begin
  if auth.uid() is null then perform falha(401, 'Sessão expirada ou não autenticada. Entre novamente.'); end if;
  select * into v_lote from lotes where lower(codigo) = lower(trim(p_codigo));
  if not found then perform falha(404, format('Lote %s não encontrado.', p_codigo)); end if;

  create temp table if not exists _grupos (ordem int, resultado text, categoria smallint, cods text[]) on commit drop;
  truncate _grupos;
  insert into _grupos
  select row_number() over (order by array_position(array['aprovado','quarentena','reprovado'], g.resultado::text), g.categoria nulls last),
         g.resultado, g.categoria, g.cods
    from (select i.resultado, case when i.resultado = 'aprovado' then i.categoria end as categoria,
                 array_agg(d.codigo order by d.sequencia) as cods
            from dormentes d join inspecoes i on i.id = d.inspecao_vigente_id
           where d.lote_id = v_lote.id group by 1, 2) g;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('resultado', resultado, 'categoria', categoria,
                    'quantidade', cardinality(cods), 'dormentes', to_jsonb(cods))) order by ordem), '[]'),
         coalesce(sum(cardinality(cods)), 0)
    into v_grupos, v_insp from _grupos;

  -- fardos cheios de 14 e um último com o resto, na ordem da sequência (sugerirFardos de dominio/parametros.ts)
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('resultado', g.resultado, 'categoria', g.categoria,
                    'quantidade', cardinality(g.cods[b * v_max + 1 : (b + 1) * v_max]),
                    'dormentes', to_jsonb(g.cods[b * v_max + 1 : (b + 1) * v_max]))) order by g.ordem, b), '[]')
    into v_fardos
    from _grupos g, generate_series(0, (cardinality(g.cods) - 1) / v_max) b;

  return jsonb_build_object('loteCodigo', v_lote.codigo, 'quantidadeLote', v_lote.quantidade, 'pecasInspecionadas', v_insp,
                            'semResultado', v_lote.quantidade - v_insp, 'excedentes', 0, 'grupos', v_grupos, 'fardos', v_fardos);
end $$;

-- Conclui a inspeção formando os fardos. p = NovaFormacaoFardos
create or replace function lote_formar_fardos(p_codigo text, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := exigir('inspecao:concluir');
  v_lote lotes; v_sem int; v_local text := trim(coalesce(p->>'local', ''));
  v_motivo text := trim(coalesce(p->>'motivoDivergencia', ''));
  f jsonb; v_num int := 0; v_fardo uuid; v_cod text; v_alheia text; v_rep text; v_falta record;
begin
  select * into v_lote from lotes where lower(codigo) = lower(trim(p_codigo)) for update;
  if not found then perform falha(404, format('Lote %s não encontrado.', p_codigo)); end if;
  if v_lote.etapa_inspecao = 'concluida' then
    perform falha(409, format('A inspeção do lote %s já foi concluída e os fardos já foram formados.', v_lote.codigo));
  end if;
  select count(*) into v_sem from dormentes where lote_id = v_lote.id and inspecao_vigente_id is null;
  if v_sem > 0 then
    perform falha(409, format('Faltam %s unidade(s) sem resultado. Aguarde o Inspector ou lance o resultado manualmente.', v_sem));
  end if;
  if jsonb_array_length(coalesce(p->'fardos', '[]')) = 0 then perform falha(422, 'Informe os fardos.', 'fardos'); end if;

  -- peças: (fardo, código) com o grupo do fardo e o da peça
  create temp table if not exists _pecas (n int, codigo text, f_res text, f_cat smallint) on commit drop;
  truncate _pecas;
  insert into _pecas
  select e.n, upper(trim(c)), e.v->>'resultado', case when e.v->>'resultado' = 'aprovado' then (e.v->>'categoria')::smallint end
    from jsonb_array_elements(p->'fardos') with ordinality as e(v, n),
         jsonb_array_elements_text(coalesce(e.v->'dormentes', '[]')) c;

  if exists (select 1 from jsonb_array_elements(p->'fardos') e where jsonb_array_length(coalesce(e->'dormentes', '[]')) = 0) then
    perform falha(422, 'Cada fardo precisa ter ao menos 1 dormente.', 'fardos');
  end if;
  select codigo into v_rep from _pecas group by codigo having count(*) > 1 limit 1;
  if v_rep is not null then perform falha(422, format('A peça %s está em mais de um fardo.', v_rep), 'fardos'); end if;
  select pc.codigo into v_alheia
    from _pecas pc left join dormentes d on d.codigo = pc.codigo and d.lote_id = v_lote.id
    left join inspecoes i on i.id = d.inspecao_vigente_id
   where d.id is null or i.resultado::text <> pc.f_res
      or (pc.f_res = 'aprovado' and i.categoria is distinct from pc.f_cat)
   limit 1;
  if v_alheia is not null then perform falha(422, format('A peça %s não é do grupo do seu fardo.', v_alheia), 'fardos'); end if;
  select d.codigo, count(*) over () as n into v_falta from dormentes d
   where d.lote_id = v_lote.id and not exists (select 1 from _pecas pc where pc.codigo = d.codigo) limit 1;
  if found then perform falha(422, format('%s peça(s) fora dos fardos (ex.: %s).', v_falta.n, v_falta.codigo), 'fardos'); end if;
  if v_local = '' then perform falha(422, 'Informe onde os fardos foram montados.', 'local'); end if;
  if exists (select 1 from jsonb_array_elements(p->'fardos') e where coalesce((e->>'divergente')::boolean, false)) and v_motivo = '' then
    perform falha(422, 'Descreva a divergência de espécie ou tamanho.', 'motivoDivergencia');
  end if;

  perform set_config('holz.sem_recalculo', 'on', true);
  for f in select value from jsonb_array_elements(p->'fardos') loop
    v_num := v_num + 1;
    v_cod := v_lote.codigo || '-F' || lpad(v_num::text, 2, '0');
    insert into fardos (lote_id, sequencia, codigo, quantidade_inicial, saldo, estado, local, resultado, categoria,
                        motivo_bloqueio, formado_por)
    values (v_lote.id, v_num, v_cod, jsonb_array_length(f->'dormentes'), jsonb_array_length(f->'dormentes'), 'fechado', v_local,
            (f->>'resultado')::resultado_peca, case when f->>'resultado' = 'aprovado' then (f->>'categoria')::smallint end,
            case when coalesce((f->>'divergente')::boolean, false) then 'Espécie/tamanho divergente: ' || v_motivo end, v_user)
    returning id into v_fardo;
    update dormentes set fardo_id = v_fardo, estado = 'em_estoque'
     where lote_id = v_lote.id and codigo in (select codigo from _pecas where n = v_num);
  end loop;
  perform set_config('holz.sem_recalculo', 'off', true);

  update lotes set etapa_inspecao = 'concluida', local = v_local, inspecao_concluida_em = now(), inspecao_concluida_por = v_user
   where id = v_lote.id;
end $$;

-- =============================================================================
-- RME
-- =============================================================================

-- p = NovaRme
create or replace function rme_abrir(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := exigir('rme:abrir');
  v_ano smallint := extract(year from hoje())::smallint; v_id uuid; it record;
begin
  if length(trim(coalesce(p->>'destinatario', ''))) = 0 then perform falha(422, 'Informe o destinatário.', 'destinatario'); end if;
  if p->>'dataLimite' is null or (p->>'dataLimite')::date < hoje() then
    perform falha(422, 'A data limite não pode estar no passado.', 'dataLimite');
  end if;
  if jsonb_array_length(coalesce(p->'itens', '[]')) = 0 then perform falha(422, 'Informe ao menos um item.', 'itens'); end if;
  if (select count(*) <> count(distinct (x->>'especieId', x->>'tamanhoId')) from jsonb_array_elements(p->'itens') x) then
    perform falha(422, 'Há itens repetidos (mesma espécie e tamanho): some as quantidades em um só item.', 'itens');
  end if;

  insert into rmes (numero, requisitante_id, destinatario, urgencia, data_limite, observacao)
  values (format('RME%s-%s', lpad((v_ano % 100)::text, 2, '0'), lpad(proximo_seq('rme', v_ano)::text, 4, '0')),
          v_user, trim(p->>'destinatario'), coalesce(p->>'urgencia', 'normal')::urgencia_rme, (p->>'dataLimite')::date,
          nullif(trim(p->>'observacao'), ''))
  returning id into v_id;

  for it in select x.*, row_number() over () as ordem
              from jsonb_to_recordset(p->'itens') as x("especieId" uuid, "tamanhoId" uuid, quantidade numeric) loop
    if it.quantidade is null or it.quantidade < 1 or it.quantidade <> trunc(it.quantidade) then
      perform falha(422, 'Cada item precisa de quantidade inteira, mínimo 1.', 'itens');
    end if;
    if not exists (select 1 from especies where id = it."especieId") or not exists (select 1 from tamanhos where id = it."tamanhoId") then
      perform falha(422, 'Espécie ou tamanho do item não encontrado no cadastro.', 'itens');
    end if;
    insert into rme_itens (rme_id, ordem, especie_id, tamanho_id, quantidade)
    values (v_id, it.ordem, it."especieId", it."tamanhoId", it.quantidade::int);
  end loop;
  insert into rme_eventos (rme_id, usuario_id, acao) values (v_id, v_user, 'RME aberta');
  return v_id;
end $$;

-- OpcaoSeparacao[]: fardos ABERTOS primeiro (do mais antigo ao mais novo), depois os FECHADOS por FIFO de lote.
-- Só fardos aprovados e sem divergência, de lotes com inspeção concluída e sem divergência de volume;
-- o que está separado em outras RMEs ainda não entregues fica reservado.
create or replace function rme_opcoes(p_rme uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with livres as (
    select d.id, d.codigo, d.sequencia, d.fardo_id from dormentes d
     where d.estado = 'em_estoque'
       and not exists (select 1 from rme_reservas r where r.dormente_id = d.id and r.rme_id <> p_rme)
  ), cand as (
    select i.id as item_id, i.ordem, i.quantidade as pedida, f.id as fardo_id, f.codigo as fardo_codigo, f.sequencia,
           f.estado, f.local, l.codigo as lote_codigo, l.recebido_em,
           (select array_agg(lv.codigo order by lv.sequencia) from livres lv where lv.fardo_id = f.id) as cods
      from rme_itens i
      join lotes l  on l.especie_id = i.especie_id and l.tamanho_id = i.tamanho_id
                   and l.etapa_inspecao = 'concluida' and not l.divergente
      join fardos f on f.lote_id = l.id and f.estado <> 'baixado' and f.resultado = 'aprovado' and f.motivo_bloqueio is null
     where i.rme_id = p_rme
  ), ord as (
    select c.*, cardinality(c.cods) as disp,
           coalesce(sum(cardinality(c.cods)) over (partition by c.item_id
                    order by (c.estado = 'aberto') desc, c.recebido_em, c.lote_codigo, c.sequencia
                    rows between unbounded preceding and 1 preceding), 0) as antes
      from cand c where cardinality(c.cods) > 0
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'itemId', item_id, 'fardoCodigo', fardo_codigo, 'loteCodigo', lote_codigo, 'recebidoEm', recebido_em,
           'estado', estado, 'local', local, 'disponivel', disp,
           'sugerido', greatest(0, least(disp, pedida - antes)),
           'dormentesDisponiveis', to_jsonb(cods),
           'dormentesSugeridos', to_jsonb(cods[1 : greatest(0, least(disp, pedida - antes))]))
         order by ordem, (estado = 'aberto') desc, recebido_em, lote_codigo, sequencia), '[]')
    from ord
$$;

-- p = NovaSeparacao
create or replace function rme_separar(p_rme uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := exigir('rme:separar');
  v_rme rmes; v_ops jsonb := rme_opcoes(p_rme); v_sep uuid; v_seguiu boolean; v_just text := nullif(trim(p->>'justificativa'), '');
  item record; e jsonb; op jsonb; v_total int; v_q int; v_dorms text[]; v_fora text; v_fardo fardos;
begin
  select * into v_rme from rmes where id = p_rme for update;
  if not found then perform falha(404, 'RME não encontrada.'); end if;
  if v_rme.status <> 'aberta' then
    perform falha(409, format('Operação não permitida: a RME %s não está aberta.', v_rme.numero));
  end if;

  create temp table if not exists _sep (item_id uuid, fardo_id uuid, quantidade int, dormentes text[], saldo int) on commit drop;
  truncate _sep;
  for item in select * from rme_itens where rme_id = p_rme order by ordem loop
    v_total := 0;
    for e in select x from jsonb_array_elements(coalesce(p->'itens', '[]')) x
              where (x->>'itemId')::uuid = item.id and coalesce((x->>'quantidade')::int, 0) > 0 loop
      select o into op from jsonb_array_elements(v_ops) o
       where (o->>'itemId')::uuid = item.id and o->>'fardoCodigo' = e->>'fardoCodigo';
      if op is null then perform falha(422, format('Fardo %s não está disponível para este item.', e->>'fardoCodigo'), 'item-' || item.id); end if;
      if exists (select 1 from _sep s join fardos f on f.id = s.fardo_id where s.item_id = item.id and f.codigo = e->>'fardoCodigo') then
        perform falha(422, 'O mesmo fardo aparece mais de uma vez.', 'item-' || item.id);
      end if;
      v_q := (e->>'quantidade')::int;
      if v_q > (op->>'disponivel')::int then
        perform falha(422, format('Quantidade inválida no fardo %s (disponível: %s).', e->>'fardoCodigo', op->>'disponivel'), 'item-' || item.id);
      end if;
      select array_agg(upper(trim(c))) into v_dorms from jsonb_array_elements_text(coalesce(e->'dormentes', '[]')) c;
      if coalesce(cardinality(v_dorms), 0) <> v_q or (select count(distinct x) from unnest(v_dorms) x) <> v_q then
        perform falha(422, format('Fardo %s: informe %s dormente(s) diferentes.', e->>'fardoCodigo', v_q), 'item-' || item.id);
      end if;
      select x into v_fora from unnest(v_dorms) x
       where not (op->'dormentesDisponiveis') ? x limit 1;
      if v_fora is not null then
        perform falha(422, format('O dormente %s não está livre no fardo %s.', v_fora, e->>'fardoCodigo'), 'item-' || item.id);
      end if;
      select * into v_fardo from fardos where codigo = e->>'fardoCodigo';
      insert into _sep values (item.id, v_fardo.id, v_q, v_dorms, v_fardo.saldo);
      v_total := v_total + v_q;
    end loop;
    if v_total <> item.quantidade then
      perform falha(422, format('Separado %s de %s: a quantidade separada tem de bater com a pedida.', v_total, item.quantidade), 'item-' || item.id);
    end if;
  end loop;

  select coalesce((select array_agg(s.item_id || '|' || f.codigo || '|' || s.quantidade order by 1)
                     from _sep s join fardos f on f.id = s.fardo_id), '{}')
       = coalesce((select array_agg((o->>'itemId') || '|' || (o->>'fardoCodigo') || '|' || (o->>'sugerido') order by 1)
                     from jsonb_array_elements(v_ops) o where (o->>'sugerido')::int > 0), '{}')
    into v_seguiu;
  if not v_seguiu and v_just is null then
    perform falha(422, 'A separação difere da sugestão FIFO: a justificativa é obrigatória.', 'justificativa');
  end if;

  update rme_separacoes set ativa = false where rme_id = p_rme and ativa;
  insert into rme_separacoes (rme_id, seguiu_sugestao, justificativa, almoxarife_id)
  values (p_rme, v_seguiu, case when v_seguiu then null else v_just end, v_user)
  returning id into v_sep;
  insert into rme_separacao_itens select v_sep, item_id, fardo_id, quantidade, dormentes, saldo from _sep;
  insert into rme_reservas select d.id, p_rme, v_sep from _sep s join dormentes d on d.codigo = any (s.dormentes);
  update rmes set status = 'em_separacao' where id = p_rme;
  insert into rme_eventos (rme_id, usuario_id, acao, detalhe)
  values (p_rme, v_user, 'Separação registrada', case when v_seguiu then 'Seguiu a sugestão FIFO.' else 'Fora da sugestão FIFO: ' || v_just end);
end $$;

-- Conferência em duas pessoas: aprova (→ conferida) ou devolve para separação (motivo obrigatório)
create or replace function rme_conferir(p_rme uuid, p_aprovada boolean, p_motivo text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := exigir('rme:conferir'); v_rme rmes; v_sep rme_separacoes;
begin
  select * into v_rme from rmes where id = p_rme for update;
  if not found then perform falha(404, 'RME não encontrada.'); end if;
  if v_rme.status <> 'em_separacao' then
    perform falha(409, format('Operação não permitida: a RME %s não está em separação.', v_rme.numero));
  end if;
  select * into v_sep from rme_separacoes where rme_id = p_rme and ativa;
  if p_aprovada then
    if v_sep.almoxarife_id = v_user and coalesce(param('permitir_conferente_igual_separador'), 0) = 0 then
      perform falha(409, 'Quem confere não pode ser quem separou.');
    end if;
    update rmes set status = 'conferida', supervisor_id = v_user, conferida_em = now() where id = p_rme;
    insert into rme_eventos (rme_id, usuario_id, acao) values (p_rme, v_user, 'Conferência aprovada');
  else
    if length(trim(coalesce(p_motivo, ''))) = 0 then perform falha(422, 'Informe o motivo da devolução.', 'motivo'); end if;
    delete from rme_reservas where rme_id = p_rme;
    update rme_separacoes set ativa = false where rme_id = p_rme and ativa;
    update rmes set status = 'aberta' where id = p_rme;
    insert into rme_eventos (rme_id, usuario_id, acao, detalhe) values (p_rme, v_user, 'Devolvida para separação', trim(p_motivo));
  end if;
end $$;

-- Entrega: só ela dá a baixa. Os dormentes separados saem; cada fardo gera uma saída com a RME e os dormentes.
create or replace function rme_entregar(p_rme uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := exigir('rme:separar'); v_rme rmes; s record; v_mov uuid; v_agora timestamptz := now();
begin
  select * into v_rme from rmes where id = p_rme for update;
  if not found then perform falha(404, 'RME não encontrada.'); end if;
  if v_rme.status <> 'conferida' then
    perform falha(409, format('Operação não permitida: a RME %s não está conferida.', v_rme.numero));
  end if;

  for s in select si.*, f.codigo as fardo_codigo, f.lote_id, f.local
             from rme_separacoes sp join rme_separacao_itens si on si.separacao_id = sp.id join fardos f on f.id = si.fardo_id
            where sp.rme_id = p_rme and sp.ativa loop
    if (select count(*) from dormentes where fardo_id = s.fardo_id and estado = 'em_estoque' and codigo = any (s.dormentes)) <> s.quantidade then
      perform falha(409, format('Saldo insuficiente no fardo %s. Devolva a RME para nova separação.', s.fardo_codigo));
    end if;
    insert into movimentacoes (tipo, lote_id, fardo_id, referencia, quantidade, origem, destino, data_hora, usuario_id, status)
    values ('saida', s.lote_id, s.fardo_id, v_rme.numero, s.quantidade, s.local, v_rme.destinatario, v_agora, v_user, 'aprovado')
    returning id into v_mov;
    insert into movimentacao_dormentes select v_mov, id from dormentes where codigo = any (s.dormentes);
    update dormentes set estado = 'baixado', baixa_tipo = 'saida', baixa_referencia = v_rme.numero, baixa_em = v_agora, baixa_por = v_user
     where codigo = any (s.dormentes);
    update rme_itens set quantidade_entregue = quantidade_entregue + s.quantidade where id = s.item_id;
  end loop;

  delete from rme_reservas where rme_id = p_rme;
  update rmes set status = 'entregue', entregue_por = v_user, entregue_em = v_agora where id = p_rme;
  insert into rme_eventos (rme_id, usuario_id, acao) values (p_rme, v_user, 'Entrega confirmada e baixa no estoque');
end $$;

create or replace function rme_cancelar(p_rme uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := exigir('rme:abrir'); v_rme rmes;
begin
  select * into v_rme from rmes where id = p_rme for update;
  if not found then perform falha(404, 'RME não encontrada.'); end if;
  if v_rme.status not in ('aberta', 'em_separacao', 'conferida') then
    perform falha(409, format('Operação não permitida: a RME %s já foi encerrada.', v_rme.numero));
  end if;
  if length(trim(coalesce(p_motivo, ''))) = 0 then perform falha(422, 'Informe o motivo do cancelamento.', 'motivo'); end if;
  delete from rme_reservas where rme_id = p_rme;
  update rmes set status = 'cancelada', motivo_cancelamento = trim(p_motivo) where id = p_rme;
  insert into rme_eventos (rme_id, usuario_id, acao, detalhe) values (p_rme, v_user, 'RME cancelada', trim(p_motivo));
end $$;

-- =============================================================================
-- Movimentações: transferência, perda e ajuste (pendentes até a aprovação)
-- =============================================================================

-- Problema com os dormentes de uma baixa ('sai') ou devolução ('volta'), ou null
create or replace function problema_dormentes(p_fardo fardos, p_codigos text[], p_sentido text) returns text
language plpgsql stable as $$
declare c text; d dormentes;
begin
  if coalesce(cardinality(p_codigos), 0) = 0 then return 'Informe os códigos dos dormentes.'; end if;
  if (select count(distinct x) from unnest(p_codigos) x) <> cardinality(p_codigos) then return 'Há código de dormente repetido.'; end if;
  foreach c in array p_codigos loop
    select * into d from dormentes where codigo = c;
    if not found or d.lote_id <> p_fardo.lote_id then
      return format('O dormente %s não é do lote %s.', c, (select codigo from lotes where id = p_fardo.lote_id));
    end if;
    if p_sentido = 'sai' and (d.fardo_id is distinct from p_fardo.id or d.estado <> 'em_estoque') then
      return format('O dormente %s não está em estoque no fardo %s.', c, p_fardo.codigo);
    end if;
    if p_sentido = 'volta' and (d.estado <> 'baixado' or d.baixa_tipo = 'saida') then
      return format('O dormente %s não teve baixa por perda ou ajuste: não pode voltar ao fardo.', c);
    end if;
  end loop;
  return null;
end $$;

-- p = NovaMovimentacao
create or replace function mov_registrar(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := exigir('movimentacoes:registrar');
  v_tipo text := p->>'tipo'; v_q numeric := (p->>'quantidade')::numeric; v_lote lotes; v_fardo fardos;
  v_cods text[]; v_prob text; v_id uuid; v_motivo text := trim(coalesce(p->>'motivo', ''));
begin
  if v_tipo = 'transferencia' then
    select * into v_lote from lotes where lower(codigo) = lower(trim(p->>'loteCodigo'));
    if not found then perform falha(404, 'Lote não encontrado.', 'loteCodigo'); end if;
    if v_lote.etapa_inspecao = 'concluida' and not exists (select 1 from fardos f where f.lote_id = v_lote.id and fardo_liberado(f)) then
      perform falha(409, 'Lote bloqueado: movimentação não permitida.');
    end if;
    if v_q is null or v_q < 1 or v_q <> trunc(v_q) then perform falha(422, 'Quantidade inválida.', 'quantidade'); end if;
    insert into movimentacoes (tipo, lote_id, quantidade, origem, destino, usuario_id, status, motivo)
    values ('transferencia', v_lote.id, v_q::int, coalesce(nullif(trim(p->>'origem'), ''), '—'),
            coalesce(nullif(trim(p->>'destino'), ''), '—'), v_user, 'pendente', nullif(v_motivo, ''))
    returning id into v_id;
    return v_id;
  end if;
  if v_tipo not in ('perda', 'ajuste') then
    perform falha(422, 'Entrada vem do recebimento e saída da RME: não são registradas aqui.');
  end if;

  select * into v_fardo from fardos where lower(codigo) = lower(trim(p->>'fardoCodigo'));
  if not found then perform falha(404, 'Fardo não encontrado.', 'fardoCodigo'); end if;
  if v_motivo = '' then perform falha(422, 'Informe o motivo.', 'motivo'); end if;
  if v_q is null or v_q = 0 or v_q <> trunc(v_q) then perform falha(422, 'Informe um número inteiro diferente de zero.', 'quantidade'); end if;
  if v_tipo = 'perda' and v_q < 0 then perform falha(422, 'A perda é informada em quantidade positiva.', 'quantidade'); end if;
  if v_tipo = 'perda' and (p->>'motivoPerda') is null then perform falha(422, 'Informe o motivo da perda.', 'motivoPerda'); end if;
  select array_agg(upper(trim(c))) into v_cods from jsonb_array_elements_text(coalesce(p->'dormentes', '[]')) c;
  if coalesce(cardinality(v_cods), 0) <> abs(v_q) then
    perform falha(422, format('Informe %s código(s) de dormente, um para cada peça.', abs(v_q)::int), 'dormentes');
  end if;
  v_prob := problema_dormentes(v_fardo, v_cods, case when v_tipo = 'ajuste' and v_q > 0 then 'volta' else 'sai' end);
  if v_prob is not null then perform falha(422, v_prob, 'dormentes'); end if;

  insert into movimentacoes (tipo, lote_id, fardo_id, quantidade, origem, destino, usuario_id, status, motivo_perda, motivo)
  values (v_tipo::tipo_movimentacao, v_fardo.lote_id, v_fardo.id, v_q::int, v_fardo.local,
          case when v_tipo = 'perda' then 'Perda: ' || rotulo_motivo_perda((p->>'motivoPerda')::motivo_perda) else 'Ajuste de saldo' end,
          v_user, 'pendente', case when v_tipo = 'perda' then (p->>'motivoPerda')::motivo_perda end, v_motivo)
  returning id into v_id;
  insert into movimentacao_dormentes select v_id, id from dormentes where codigo = any (v_cods);
  return v_id;
end $$;

-- Aprovação de perda ou ajuste (supervisor/gestor). Quem registrou não decide; rejeitar exige motivo.
create or replace function mov_decidir(p_id uuid, p_aprovada boolean, p_motivo text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := exigir('movimentacoes:aprovar'); v_m movimentacoes; v_fardo fardos; v_cods text[]; v_sentido text;
  v_prob text; v_res text;
begin
  select * into v_m from movimentacoes where id = p_id for update;
  if not found then perform falha(404, 'Movimentação não encontrada.'); end if;
  if v_m.tipo not in ('perda', 'ajuste') then perform falha(409, 'Só perda e ajuste passam por aprovação.'); end if;
  if v_m.status <> 'pendente' then perform falha(409, 'Esta movimentação já foi decidida.'); end if;
  if v_m.usuario_id = v_user then perform falha(409, 'Quem registrou não pode aprovar ou rejeitar.'); end if;

  if not p_aprovada then
    if length(trim(coalesce(p_motivo, ''))) = 0 then perform falha(422, 'Informe o motivo da rejeição.', 'motivo'); end if;
    update movimentacoes set status = 'rejeitado', motivo_rejeicao = trim(p_motivo), decidido_por = v_user, decidido_em = now()
     where id = p_id;
    return;
  end if;

  select * into v_fardo from fardos where id = v_m.fardo_id;
  select array_agg(d.codigo) into v_cods from movimentacao_dormentes md join dormentes d on d.id = md.dormente_id where md.movimentacao_id = p_id;
  v_sentido := case when v_m.tipo = 'ajuste' and v_m.quantidade > 0 then 'volta' else 'sai' end;
  if v_sentido = 'sai' then
    select d.codigo || ' (' || r.numero || ')' into v_res from rme_reservas rr join dormentes d on d.id = rr.dormente_id
      join rmes r on r.id = rr.rme_id where d.codigo = any (v_cods) limit 1;
    if v_res is not null then
      perform falha(409, format('O dormente %s está reservado em RME. Resolva a RME antes de aprovar.', v_res));
    end if;
  end if;
  v_prob := problema_dormentes(v_fardo, v_cods, v_sentido);
  if v_prob is not null then perform falha(409, v_prob); end if;

  if v_sentido = 'sai' then
    update dormentes set estado = 'baixado', baixa_tipo = v_m.tipo::text, baixa_referencia = null, baixa_em = now(), baixa_por = v_user
     where codigo = any (v_cods);
  else
    update dormentes set estado = 'em_estoque', fardo_id = v_fardo.id, baixa_tipo = null, baixa_referencia = null, baixa_em = null, baixa_por = null
     where codigo = any (v_cods);
  end if;
  update movimentacoes set status = 'aprovado', decidido_por = v_user, decidido_em = now() where id = p_id;
end $$;

-- =============================================================================
-- Inventário, visão computacional, exportação (fora do MVP)
-- =============================================================================
create or replace function inventario_criar(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_user uuid := exigir('inventario:criar'); v_id uuid;
begin
  if length(trim(coalesce(p->>'descricao', ''))) = 0 then perform falha(422, 'Informe a descrição.', 'descricao'); end if;
  if length(trim(coalesce(p->>'local', ''))) = 0 then perform falha(422, 'Informe o local.', 'local'); end if;
  insert into sessoes_inventario (descricao, local, aberta_por) values (trim(p->>'descricao'), trim(p->>'local'), v_user)
  returning id into v_id;
  return v_id;
end $$;

-- p_itens = ContagemInventario[]; contagem por imagem nunca entra aqui sozinha (é estimativa)
create or replace function inventario_contagem(p_sessao uuid, p_itens jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := exigir('inventario:criar'); it record; v_lote lotes;
begin
  if not exists (select 1 from sessoes_inventario where id = p_sessao and estado = 'em_contagem') then
    perform falha(404, 'Sessão não encontrada ou já encerrada.');
  end if;
  for it in select * from jsonb_to_recordset(p_itens) as x("loteCodigo" text, "quantidadeContada" int) loop
    select * into v_lote from lotes where lower(codigo) = lower(trim(it."loteCodigo"));
    if not found then perform falha(404, format('Lote %s não encontrado.', it."loteCodigo"), 'loteCodigo'); end if;
    insert into inventario_contagens (sessao_id, lote_id, saldo_sistema, contagem, contado_por)
    values (p_sessao, v_lote.id, (select count(*) from dormentes where lote_id = v_lote.id and estado <> 'baixado'),
            it."quantidadeContada", v_user)
    on conflict (sessao_id, lote_id) do update set contagem = excluded.contagem, saldo_sistema = excluded.saldo_sistema,
                                                   contado_por = excluded.contado_por, contado_em = now();
  end loop;
end $$;

create or replace function visao_enviar(p_arquivo uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_user uuid := exigir('visao:enviar'); v_id uuid;
begin
  if not exists (select 1 from arquivos where id = p_arquivo and bucket = 'visao-imagens') then perform falha(422, 'Imagem não encontrada.'); end if;
  insert into processamentos_imagem (arquivo_id, enviado_por) values (p_arquivo, v_user) returning id into v_id;
  return v_id;
end $$;

create or replace function exportacao_solicitar(p_relatorio text, p_formato text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_user uuid := exigir('relatorios:exportar'); e exportacoes;
begin
  insert into exportacoes (relatorio_id, formato, solicitada_por) values (p_relatorio, p_formato, v_user) returning * into e;
  return jsonb_build_object('id', e.id, 'relatorioId', e.relatorio_id, 'formato', e.formato, 'estado', e.estado);
end $$;

-- =============================================================================
-- Parâmetros e cadastros
-- =============================================================================
create or replace function parametros_obter() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'limiteIdadeDias', param('limite_dias_estoque')::int,
    'alertaDofCriticoDias', param('dof_alerta_critico_dias')::int,
    'alertaDofAtencaoDias', param('dof_alerta_atencao_dias')::int,
    'categoria1IndiceMin', param('categoria_1_indice_min')::int,
    'categoria2IndiceMin', param('categoria_2_indice_min')::int,
    'provisorio', (select bool_or(provisorio) from parametros where editavel and chave <> 'permitir_conferente_igual_separador'))
$$;

-- p = Omit<ParametrosNegocio, 'provisorio'>
create or replace function parametros_atualizar(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := exigir('admin');
  lim numeric := (p->>'limiteIdadeDias')::numeric; cri numeric := (p->>'alertaDofCriticoDias')::numeric;
  ate numeric := (p->>'alertaDofAtencaoDias')::numeric; c1 numeric := (p->>'categoria1IndiceMin')::numeric;
  c2 numeric := (p->>'categoria2IndiceMin')::numeric;
begin
  if lim is null or lim <> trunc(lim) or lim < 1 or lim > 3650 then perform falha(422, 'Confira os parâmetros: inteiro entre 1 e 3650.', 'limiteIdadeDias'); end if;
  if cri is null or cri <> trunc(cri) or cri < 0 then perform falha(422, 'Confira os parâmetros: inteiro, mínimo 0.', 'alertaDofCriticoDias'); end if;
  if ate is null or ate <> trunc(ate) or ate < cri then perform falha(422, 'Confira os parâmetros: maior ou igual ao do alerta crítico.', 'alertaDofAtencaoDias'); end if;
  if c1 is null or c1 <> trunc(c1) or c1 < 1 or c1 > 100 then perform falha(422, 'Confira os parâmetros: inteiro entre 1 e 100.', 'categoria1IndiceMin'); end if;
  if c2 is null or c2 <> trunc(c2) or c2 < 0 or c2 >= c1 then perform falha(422, 'Confira os parâmetros: menor que o da Categoria 1.', 'categoria2IndiceMin'); end if;
  update parametros set valor = x.v, atualizado_por = v_user, atualizado_em = now()
    from (values ('limite_dias_estoque', lim), ('dof_alerta_critico_dias', cri), ('dof_alerta_atencao_dias', ate),
                 ('categoria_1_indice_min', c1), ('categoria_2_indice_min', c2)) as x(k, v)
   where chave = x.k;
  return parametros_obter();
end $$;

-- p = AtualizacaoEspecie
create or replace function especie_atualizar(p_id uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := exigir('cadastros:editar');
begin
  if p->>'uso' not in ('via', 'AMV') then perform falha(422, 'Uso inválido.', 'uso'); end if;
  update especies set classe = nullif(trim(p->>'classe'), ''), uso = p->>'uso' where id = p_id;
  if not found then perform falha(404, 'Espécie não encontrada.'); end if;
end $$;

-- p = NovoTamanho; p_id null = cadastrar
create or replace function tamanho_salvar(p_id uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_user uuid := exigir('cadastros:editar'); v_id uuid := p_id;
begin
  if length(trim(coalesce(p->>'codigo', ''))) = 0 then perform falha(422, 'Informe o código.', 'codigo'); end if;
  if exists (select 1 from tamanhos where lower(codigo) = lower(trim(p->>'codigo')) and id is distinct from p_id) then
    perform falha(409, 'Já existe um tamanho com este código.', 'codigo');
  end if;
  if coalesce((p->>'larguraCm')::numeric, 0) <= 0 then perform falha(422, 'Medida inválida.', 'larguraCm'); end if;
  if coalesce((p->>'alturaCm')::numeric, 0) <= 0 then perform falha(422, 'Medida inválida.', 'alturaCm'); end if;
  if coalesce((p->>'comprimentoCm')::numeric, 0) <= 0 then perform falha(422, 'Medida inválida.', 'comprimentoCm'); end if;
  if p_id is null then
    insert into tamanhos (codigo, largura_cm, altura_cm, comprimento_cm, medidas)
    values (trim(p->>'codigo'), (p->>'larguraCm')::numeric, (p->>'alturaCm')::numeric, (p->>'comprimentoCm')::numeric,
            coalesce(p->>'medidas', 'provisorio'))
    returning id into v_id;
  else
    update tamanhos set codigo = trim(p->>'codigo'), largura_cm = (p->>'larguraCm')::numeric, altura_cm = (p->>'alturaCm')::numeric,
                        comprimento_cm = (p->>'comprimentoCm')::numeric, medidas = coalesce(p->>'medidas', 'provisorio')
     where id = p_id;
    if not found then perform falha(404, 'Tamanho não encontrado.'); end if;
  end if;
  return v_id;
end $$;
