-- Holz Trilho v2 · 0005 · Operações: as funções que mudam os dados
-- Cada operação do app é uma função daqui (as do inventário estão em 0006), com as MESMAS regras, mensagens e eventos
-- do modo simulado (src/services/mock/*.ts; os testes rodam as mesmas regras nos dois). Cada função:
--   · confere a sessão e a permissão (exigir), como a tela, mas aqui de verdade;
--   · valida e, havendo erro, levanta o erro de regra (falhar) com os erros por campo, que a tela mostra no lugar;
--   · grava tudo numa transação só (uma chamada = tudo ou nada) e registra os eventos (histórico e auditoria);
--   · devolve a chave do que mudou (em geral o id), em JSON.
-- security definer: a função grava em nome do usuário, que não tem escrita direta nas tabelas (0002).

-- ---------------------------------------------------------------------------------------------------------------
-- Apoio
-- ---------------------------------------------------------------------------------------------------------------

-- Texto de um campo JSON, sem espaços nas pontas ('' quando falta).
create or replace function public.txt(j jsonb, k text) returns text
language sql immutable as $$ select coalesce(trim(j->>k), '') $$;

-- Número de um campo JSON (null quando não é número).
create or replace function public.num(j jsonb) returns numeric
language sql immutable as $$ select case when jsonb_typeof(j) = 'number' then (j #>> '{}')::numeric end $$;

create or replace function public.inteiro(j jsonb) returns boolean
language sql immutable as $$ select coalesce(public.num(j) = trunc(public.num(j)), false) $$;

-- Data AAAA-MM-DD válida?
create or replace function public.e_data(s text) returns boolean
language plpgsql immutable as $$
begin
  if s is null or s !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
  perform s::date;
  return true;
exception when others then return false;
end $$;

-- Instante no formato do app (ISO em UTC com milissegundos, como toISOString).
create or replace function public.iso(t timestamptz) returns text
language sql immutable as $$ select to_char(t at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') $$;

-- Lista JSON → text[] (vazia quando falta).
create or replace function public.lista(j jsonb) returns text[]
language sql immutable as $$
  select coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(j) = 'array' then j else '[]' end)), '{}')
$$;

-- Ordem de criação de um id técnico (es0001 → 1), para listar na mesma ordem do app.
create or replace function public.ordem_id(id text) returns bigint
language sql immutable as $$ select coalesce(substring(id from '(\d+)$')::bigint, 0) $$;

-- Erros por campo acumulados: com algum, falha com a mensagem geral.
create or replace function public.exigir_campos(campos jsonb, mensagem text default 'Confira os campos destacados.') returns void
language plpgsql as $$
begin
  if campos <> '{}' then perform public.falhar(422, mensagem, campos); end if;
end $$;

-- Anexo enviado pelo app (o arquivo já está no armazenamento): grava o registro e devolve o objeto do app.
create or replace function public.anexo_novo(p jsonb, p_tipo text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a public.anexos;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return null; end if;
  insert into public.anexos (nome, tipo, caminho, enviado_por) values (coalesce(p->>'nome', 'arquivo'), p_tipo, p->>'caminho', public.quem()) returning * into a;
  return jsonb_build_object('id', a.id, 'nome', a.nome, 'tipo', a.tipo, 'enviadoEm', public.iso(a.enviado_em), 'enviadoPor', a.enviado_por)
    || case when a.caminho is not null then jsonb_build_object('caminho', a.caminho) else '{}' end;
end $$;

-- Modo demonstração (Simulador e simulação da inspeção).
create or replace function public.exigir_demonstracao() returns void
language plpgsql stable set search_path = public as $$
begin
  if not (select modo_demonstracao from public.parametros where id = 1) then
    perform public.falhar(409, 'O modo demonstração está desligado (Configurações).');
  end if;
end $$;

-- Sequência do dormente ou do fardo pelo ID (AR00224-01-000357 → 357; AR00224-01-F012 → 12).
create or replace function public.sequencia_de(id text) returns integer
language sql immutable as $$ select coalesce(substring(id from '-F?(\d+)$')::integer, 0) $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Situação do dormente: a única porta de mudança (como movimentarDormentes em mock/estoque.ts)
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.movimentar_dormentes(p_ids text[], p_para text, p_tipo text, p_descricao text, p_referencia text default null,
  p_rme text default null, p_local text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_id text;
  d public.dormentes;
  v_permitidas text[];
begin
  foreach v_id in array p_ids loop
    select * into d from public.dormentes where id = v_id for update;
    if not found then perform public.falhar(404, format('Dormente %s não encontrado.', v_id)); end if;
    v_permitidas := case d.situacao
      when 'emitido' then array['aguardando_inspecao']
      when 'aguardando_inspecao' then array['em_estoque', 'reprovado', 'nao_localizado']
      when 'nao_localizado' then array['em_estoque', 'reprovado', 'perdido']
      when 'em_estoque' then array['reservado', 'nao_localizado']
      when 'reservado' then array['em_estoque', 'baixado', 'nao_localizado']
      when 'reprovado' then array['retirado', 'nao_localizado']
      else array[]::text[] end;
    if not p_para = any(v_permitidas) then
      perform public.falhar(409, format('O dormente %s não pode passar de "%s" para "%s".', d.id, d.situacao, p_para));
    end if;
  end loop;
  foreach v_id in array p_ids loop
    select * into d from public.dormentes where id = v_id;
    update public.dormentes set
      situacao = p_para,
      rme_numero = case when p_para in ('reservado', 'baixado') then p_rme
        when p_para in ('em_estoque', 'nao_localizado') and d.situacao = 'reservado' then null else rme_numero end,
      local_id = case when p_para = 'reprovado' then p_local when p_para = 'retirado' then null
        when p_para = 'nao_localizado' and d.situacao = 'reprovado' then null else local_id end
    where id = v_id;
    perform public.registrar_evento('dormente', v_id, p_tipo, p_descricao, p_referencia);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Cadastros (mock/cadastros.ts): nada é apagado, só inativado
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.salvar_fornecedor(p_id text, p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  a public.fornecedores;
  v jsonb;
  c jsonb := '{}';
  v_cnpj text;
  v_esp text[];
  v_id text;
begin
  perform public.exigir('cadastros:editar');
  if p_id is not null then
    select * into a from public.fornecedores where id = p_id;
    if not found then perform public.falhar(404, 'Fornecedor não encontrado.'); end if;
    v := jsonb_build_object('razaoSocial', a.razao_social, 'cnpj', a.cnpj, 'cidadeUf', a.cidade_uf, 'ctfIbama', a.ctf_ibama,
      'ctfValidade', a.ctf_validade, 'especiesIds', to_jsonb(a.especies_ids)) || coalesce(p_dados, '{}');
  else
    v := coalesce(p_dados, '{}');
  end if;
  v_cnpj := regexp_replace(coalesce(v->>'cnpj', ''), '\D', '', 'g');
  v_esp := array(select x from (select distinct on (x) x, n from unnest(public.lista(v->'especiesIds')) with ordinality u(x, n) order by x, n) s order by n);
  if public.txt(v, 'razaoSocial') = '' then c := c || '{"razaoSocial": "Informe a razão social."}'; end if;
  if length(v_cnpj) <> 14 then c := c || '{"cnpj": "O CNPJ tem 14 dígitos."}';
  elsif exists (select 1 from public.fornecedores where id is distinct from p_id and regexp_replace(cnpj, '\D', '', 'g') = v_cnpj) then c := c || '{"cnpj": "CNPJ já cadastrado."}';
  end if;
  if public.txt(v, 'cidadeUf') = '' then c := c || '{"cidadeUf": "Informe a cidade/UF."}'; end if;
  if public.txt(v, 'ctfIbama') = '' then c := c || '{"ctfIbama": "Informe o CTF Ibama."}'; end if;
  if not public.e_data(v->>'ctfValidade') then c := c || '{"ctfValidade": "Informe a validade do CTF."}'; end if;
  if cardinality(v_esp) = 0 then c := c || '{"especiesIds": "Escolha as espécies que o fornecedor fornece."}';
  elsif exists (select 1 from unnest(v_esp) x where not exists (select 1 from public.especies s where s.id = x)) then c := c || '{"especiesIds": "Espécie não encontrada."}';
  end if;
  perform public.exigir_campos(c);
  if p_id is null then
    insert into public.fornecedores (razao_social, cnpj, cidade_uf, ctf_ibama, ctf_validade, especies_ids)
    values (public.txt(v, 'razaoSocial'), v_cnpj, public.txt(v, 'cidadeUf'), public.txt(v, 'ctfIbama'), (v->>'ctfValidade')::date, v_esp) returning id into v_id;
  else
    update public.fornecedores set razao_social = public.txt(v, 'razaoSocial'), cnpj = v_cnpj, cidade_uf = public.txt(v, 'cidadeUf'),
      ctf_ibama = public.txt(v, 'ctfIbama'), ctf_validade = (v->>'ctfValidade')::date, especies_ids = v_esp where id = p_id;
    v_id := p_id;
  end if;
  perform public.registrar_evento('fornecedor', v_id, case when p_id is null then 'criado' else 'alterado' end,
    format('Fornecedor %s %s', public.txt(v, 'razaoSocial'), case when p_id is null then 'cadastrado' else 'alterado' end));
  return to_jsonb(v_id);
end $$;

create or replace function public.situacao_fornecedor(p_id text, p_situacao text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare f public.fornecedores;
begin
  perform public.exigir('cadastros:editar');
  select * into f from public.fornecedores where id = p_id;
  if not found then perform public.falhar(404, 'Fornecedor não encontrado.'); end if;
  if f.situacao = p_situacao then perform public.falhar(409, format('O fornecedor já está %s.', p_situacao)); end if;
  -- Reativar não desbloqueia: o bloqueio pelo CTF vencido continua calculado pela validade.
  update public.fornecedores set situacao = p_situacao where id = p_id;
  perform public.registrar_evento('fornecedor', p_id, case when p_situacao = 'ativo' then 'reativado' else 'inativado' end,
    format('Fornecedor %s %s', f.razao_social, case when p_situacao = 'ativo' then 'reativado' else 'inativado' end));
  return to_jsonb(p_id);
end $$;

create or replace function public.salvar_especie(p_id text, p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  a public.especies;
  v jsonb;
  c jsonb := '{}';
  v_id text;
begin
  perform public.exigir('cadastros:editar');
  if p_id is not null then
    select * into a from public.especies where id = p_id;
    if not found then perform public.falhar(404, 'Espécie não encontrado.'); end if;
    v := jsonb_build_object('nomeCientifico', a.nome_cientifico, 'nomePopular', a.nome_popular) || coalesce(p_dados, '{}');
  else
    v := coalesce(p_dados, '{}');
  end if;
  if public.txt(v, 'nomeCientifico') = '' then c := c || '{"nomeCientifico": "Informe o nome científico."}';
  elsif exists (select 1 from public.especies where id is distinct from p_id and lower(trim(nome_cientifico)) = lower(public.txt(v, 'nomeCientifico'))) then
    c := c || '{"nomeCientifico": "Espécie já cadastrada."}';
  end if;
  if public.txt(v, 'nomePopular') = '' then c := c || '{"nomePopular": "Informe o nome popular."}'; end if;
  perform public.exigir_campos(c);
  if p_id is null then
    insert into public.especies (nome_cientifico, nome_popular) values (public.txt(v, 'nomeCientifico'), public.txt(v, 'nomePopular')) returning id into v_id;
  else
    update public.especies set nome_cientifico = public.txt(v, 'nomeCientifico'), nome_popular = public.txt(v, 'nomePopular') where id = p_id;
    v_id := p_id;
  end if;
  perform public.registrar_evento('cadastro', v_id, case when p_id is null then 'criado' else 'alterado' end,
    format('Espécie %s %s', public.txt(v, 'nomePopular'), case when p_id is null then 'cadastrada' else 'alterada' end));
  return to_jsonb(v_id);
end $$;

create or replace function public.salvar_tamanho(p_id text, p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  a public.tamanhos;
  v jsonb;
  c jsonb := '{}';
  k text;
  v_id text;
begin
  perform public.exigir('cadastros:editar');
  if p_id is not null then
    select * into a from public.tamanhos where id = p_id;
    if not found then perform public.falhar(404, 'Tamanho não encontrado.'); end if;
    v := jsonb_build_object('codigo', a.codigo, 'uso', a.uso, 'comprimentoCm', a.comprimento_cm, 'larguraCm', a.largura_cm, 'alturaCm', a.altura_cm,
      'medidas', a.medidas) || coalesce(p_dados, '{}');
  else
    v := coalesce(p_dados, '{}');
  end if;
  if public.txt(v, 'codigo') !~ '^\d{6}$' then c := c || '{"codigo": "Código de material CPTM com 6 dígitos (ex. 006234)."}';
  elsif exists (select 1 from public.tamanhos where id is distinct from p_id and lower(trim(codigo)) = lower(public.txt(v, 'codigo'))) then c := c || '{"codigo": "Código já utilizado."}';
  end if;
  foreach k in array array['comprimentoCm', 'larguraCm', 'alturaCm'] loop
    if not coalesce(public.num(v->k) > 0, false) then c := c || jsonb_build_object(k, 'Medida em cm, maior que zero.'); end if;
  end loop;
  if coalesce(v->>'uso', '') not in ('via_corrente', 'amv') then c := c || '{"uso": "Escolha o uso: via corrente ou AMV."}'; end if;
  perform public.exigir_campos(c);
  if p_id is null then
    insert into public.tamanhos (codigo, uso, comprimento_cm, largura_cm, altura_cm, medidas)
    values (public.txt(v, 'codigo'), v->>'uso', public.num(v->'comprimentoCm'), public.num(v->'larguraCm'), public.num(v->'alturaCm'), coalesce(v->>'medidas', 'provisorio'))
    returning id into v_id;
  else
    update public.tamanhos set codigo = public.txt(v, 'codigo'), uso = v->>'uso', comprimento_cm = public.num(v->'comprimentoCm'), largura_cm = public.num(v->'larguraCm'),
      altura_cm = public.num(v->'alturaCm'), medidas = coalesce(v->>'medidas', 'provisorio') where id = p_id;
    v_id := p_id;
  end if;
  perform public.registrar_evento('cadastro', v_id, case when p_id is null then 'criado' else 'alterado' end,
    format('Tamanho %s %s', public.txt(v, 'codigo'), case when p_id is null then 'cadastrado' else 'alterado' end));
  return to_jsonb(v_id);
end $$;

create or replace function public.salvar_tratamento(p_id text, p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  a public.tratamentos;
  v jsonb;
  c jsonb := '{}';
  v_id text;
begin
  perform public.exigir('cadastros:editar');
  if p_id is not null then
    select * into a from public.tratamentos where id = p_id;
    if not found then perform public.falhar(404, 'Tratamento não encontrado.'); end if;
    v := jsonb_build_object('preservativo', a.preservativo, 'empresa', a.empresa) || coalesce(p_dados, '{}');
  else
    v := coalesce(p_dados, '{}');
  end if;
  if public.txt(v, 'preservativo') = '' then c := c || '{"preservativo": "Informe o preservativo."}'; end if;
  if public.txt(v, 'empresa') = '' then c := c || '{"empresa": "Informe a empresa de tratamento."}'; end if;
  if c = '{}' and exists (select 1 from public.tratamentos where id is distinct from p_id and lower(trim(preservativo)) = lower(public.txt(v, 'preservativo'))
      and lower(trim(empresa)) = lower(public.txt(v, 'empresa'))) then
    c := c || '{"preservativo": "Tratamento já cadastrado."}';
  end if;
  perform public.exigir_campos(c);
  if p_id is null then
    insert into public.tratamentos (preservativo, empresa) values (public.txt(v, 'preservativo'), public.txt(v, 'empresa')) returning id into v_id;
  else
    update public.tratamentos set preservativo = public.txt(v, 'preservativo'), empresa = public.txt(v, 'empresa') where id = p_id;
    v_id := p_id;
  end if;
  perform public.registrar_evento('cadastro', v_id, case when p_id is null then 'criado' else 'alterado' end,
    format('Tratamento %s / %s %s', public.txt(v, 'preservativo'), public.txt(v, 'empresa'), case when p_id is null then 'cadastrado' else 'alterado' end));
  return to_jsonb(v_id);
end $$;

create or replace function public.salvar_empresa_inspetora(p_id text, p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  a public.empresas_inspetoras;
  v jsonb;
  c jsonb := '{}';
  v_cnpj text;
  v_id text;
begin
  perform public.exigir('cadastros:editar');
  if p_id is not null then
    select * into a from public.empresas_inspetoras where id = p_id;
    if not found then perform public.falhar(404, 'Empresa inspetora não encontrado.'); end if;
    v := jsonb_strip_nulls(jsonb_build_object('nome', a.nome, 'cnpj', a.cnpj)) || coalesce(p_dados, '{}');
  else
    v := coalesce(p_dados, '{}');
  end if;
  v_cnpj := regexp_replace(coalesce(v->>'cnpj', ''), '\D', '', 'g');
  if public.txt(v, 'nome') = '' then c := c || '{"nome": "Informe o nome."}';
  elsif exists (select 1 from public.empresas_inspetoras where id is distinct from p_id and lower(trim(nome)) = lower(public.txt(v, 'nome'))) then c := c || '{"nome": "Empresa já cadastrada."}';
  end if;
  if v_cnpj <> '' and length(v_cnpj) <> 14 then c := c || '{"cnpj": "O CNPJ tem 14 dígitos (ou deixe em branco)."}';
  elsif v_cnpj <> '' and exists (select 1 from public.empresas_inspetoras where id is distinct from p_id and cnpj = v_cnpj) then c := c || '{"cnpj": "CNPJ já cadastrado."}';
  end if;
  perform public.exigir_campos(c);
  if p_id is null then
    insert into public.empresas_inspetoras (nome, cnpj) values (public.txt(v, 'nome'), nullif(v_cnpj, '')) returning id into v_id;
  else
    update public.empresas_inspetoras set nome = public.txt(v, 'nome'), cnpj = nullif(v_cnpj, '') where id = p_id;
    v_id := p_id;
  end if;
  perform public.registrar_evento('cadastro', v_id, case when p_id is null then 'criado' else 'alterado' end,
    format('Empresa inspetora %s %s', public.txt(v, 'nome'), case when p_id is null then 'cadastrada' else 'alterada' end));
  return to_jsonb(v_id);
end $$;

-- Inativa ou reativa um cadastro simples (espécie, tamanho, tratamento, empresa inspetora) ou reativa um local.
create or replace function public.alterar_ativo(p_tabela text, p_id text, p_ativo boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_rotulo text := case p_tabela when 'especies' then 'Espécie' when 'tamanhos' then 'Tamanho' when 'tratamentos' then 'Tratamento'
    when 'empresas_inspetoras' then 'Empresa inspetora' when 'locais' then 'Local' end;
  v_atual boolean;
begin
  perform public.exigir('cadastros:editar');
  if v_rotulo is null then perform public.falhar(422, 'Cadastro inválido.'); end if;
  if p_tabela = 'locais' and not p_ativo then perform public.falhar(422, 'Use a inativação do local.'); end if;
  execute format('select ativo from public.%I where id = $1', p_tabela) into v_atual using p_id;
  if v_atual is null then perform public.falhar(404, format('%s não encontrado.', v_rotulo)); end if;
  if v_atual = p_ativo then perform public.falhar(409, format('%s já está %s.', v_rotulo, case when p_ativo then 'ativo' else 'inativo' end)); end if;
  execute format('update public.%I set ativo = $1 where id = $2', p_tabela) using p_ativo, p_id;
  perform public.registrar_evento(case when p_tabela = 'locais' then 'local' else 'cadastro' end, p_id, case when p_ativo then 'reativado' else 'inativado' end,
    format('%s %s', v_rotulo, case when p_ativo then 'reativado' else 'inativado' end));
  return to_jsonb(p_id);
end $$;

-- Ocupação do local (dormentes nos fardos que estão nele e reprovados segregados nele), como localView.
create or replace function public.ocupacao_do_local(p_id text) returns integer
language sql stable set search_path = public as $$
  select coalesce((select sum(case when f.situacao in ('aguardando_inspecao', 'em_inspecao') then f.total else f.saldo end)::integer
    from public.v_fardos f where f.local_id = p_id and (f.saldo > 0 or f.situacao in ('aguardando_inspecao', 'em_inspecao'))), 0)
    + (select count(*)::integer from public.dormentes d where d.situacao = 'reprovado' and d.local_id = p_id)
$$;

create or replace function public.salvar_local(p_id text, p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  a public.locais;
  v jsonb;
  c jsonb := '{}';
  v_codigo text;
  v_id text;
begin
  perform public.exigir('cadastros:editar');
  if p_id is not null then
    select * into a from public.locais where id = p_id;
    if not found then perform public.falhar(404, 'Local não encontrado.'); end if;
    v := jsonb_build_object('codigo', a.codigo, 'descricao', a.descricao, 'tipo', a.tipo, 'capacidade', a.capacidade) || coalesce(p_dados, '{}');
  else
    v := coalesce(p_dados, '{}');
  end if;
  v_codigo := upper(public.txt(v, 'codigo'));
  if v_codigo !~ '^[A-Z0-9]+(-[A-Z0-9]+)*$' then c := c || '{"codigo": "Código com letras e números, partes separadas por hífen (ex. A-03)."}';
  elsif exists (select 1 from public.locais where id is distinct from p_id and codigo = v_codigo) then c := c || '{"codigo": "Código já utilizado."}';
  end if;
  if public.txt(v, 'descricao') = '' then c := c || '{"descricao": "Informe a descrição."}'; end if;
  if coalesce(v->>'tipo', '') not in ('armazenagem', 'inspecao', 'segregacao', 'expedicao') then c := c || '{"tipo": "Escolha o tipo."}'; end if;
  if not public.inteiro(v->'capacidade') or public.num(v->'capacidade') <= 0 then c := c || '{"capacidade": "Capacidade em dormentes, maior que zero."}';
  elsif p_id is not null and public.num(v->'capacidade') < public.ocupacao_do_local(p_id) then c := c || '{"capacidade": "A capacidade não pode ficar abaixo da ocupação atual."}';
  end if;
  -- O código vai impresso no QR do local: não muda depois de criado.
  if p_id is not null and v_codigo <> a.codigo then c := c || '{"codigo": "O código do local não muda depois de criado (está no QR impresso)."}'; end if;
  perform public.exigir_campos(c);
  if p_id is null then
    insert into public.locais (codigo, descricao, tipo, capacidade) values (v_codigo, public.txt(v, 'descricao'), v->>'tipo', public.num(v->'capacidade')) returning id into v_id;
  else
    update public.locais set descricao = public.txt(v, 'descricao'), tipo = v->>'tipo', capacidade = public.num(v->'capacidade') where id = p_id;
    v_id := p_id;
  end if;
  perform public.registrar_evento('local', v_id, case when p_id is null then 'criado' else 'alterado' end,
    format('Local %s %s', v_codigo, case when p_id is null then 'cadastrado' else 'alterado' end));
  return to_jsonb(v_id);
end $$;

create or replace function public.inativar_local(p_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l public.locais;
begin
  perform public.exigir('cadastros:editar');
  select * into l from public.locais where id = p_id;
  if not found then perform public.falhar(404, 'Local não encontrado.'); end if;
  if not l.ativo then perform public.falhar(409, format('O local %s já está inativo.', l.codigo)); end if;
  if public.ocupacao_do_local(p_id) > 0 then perform public.falhar(409, format('O local %s tem dormentes: transfira os fardos antes de inativar.', l.codigo)); end if;
  update public.locais set ativo = false where id = p_id;
  perform public.registrar_evento('local', p_id, 'inativado', format('Local %s inativado', l.codigo));
  return to_jsonb(p_id);
end $$;

-- Usuários: o administrador muda o perfil e a situação (as contas são criadas no painel do Supabase).
create or replace function public.atualizar_usuario(p_id uuid, p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u public.perfis;
begin
  perform public.exigir('admin');
  select * into u from public.perfis where id = p_id;
  if not found then perform public.falhar(404, 'Usuário não encontrado.'); end if;
  if p_dados ? 'perfil' and p_dados->>'perfil' is not null then
    if p_dados->>'perfil' not in ('administrador', 'almoxarife', 'gestor', 'requisitante') then
      perform public.falhar(422, 'Perfil inválido.', '{"perfil": "Escolha um perfil."}');
    end if;
    u.perfil := p_dados->>'perfil';
  end if;
  if jsonb_typeof(p_dados->'ativo') = 'boolean' then u.ativo := (p_dados->>'ativo')::boolean; end if;
  update public.perfis set perfil = u.perfil, ativo = u.ativo where id = p_id;
  perform public.registrar_evento('usuario', p_id::text, 'alterado', format('Usuário %s: perfil %s, %s', u.nome, u.perfil, case when u.ativo then 'ativo' else 'inativo' end));
  return to_jsonb(p_id);
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Ata e contrato
-- ---------------------------------------------------------------------------------------------------------------

-- Fornecedor liberado para nova ata ou contrato: ativo e com o CTF Ibama válido.
create or replace function public.exigir_fornecedor_liberado(p_fornecedor text, p_campo text) returns void
language plpgsql stable set search_path = public as $$
declare f public.fornecedores;
begin
  select * into f from public.fornecedores where id = p_fornecedor;
  if not found then perform public.falhar(422, 'Escolha o fornecedor.', jsonb_build_object(p_campo, 'Fornecedor não encontrado.')); end if;
  if f.situacao <> 'ativo' then perform public.falhar(422, format('O fornecedor %s está inativo.', f.razao_social), jsonb_build_object(p_campo, 'Fornecedor inativo.')); end if;
  if f.ctf_validade < public.hoje() then
    perform public.falhar(422, format('O fornecedor %s está bloqueado: CTF Ibama vencido em %s.', f.razao_social, f.ctf_validade), jsonb_build_object(p_campo, 'Fornecedor bloqueado (CTF vencido).'));
  end if;
end $$;

create or replace function public.criar_ata(p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c jsonb := '{}';
  v_numero text := upper(public.txt(p_dados, 'numero'));
  v_inicio text := p_dados->>'vigenciaInicio';
  v_fim text := nullif(p_dados->>'vigenciaFim', '');
  r jsonb;
  v_padrao jsonb := '{"pedidoMinimo": 6000, "maxParcelas": 6, "parcelaMinima": 3000, "parcelaMaxima": 6000,
    "prazosParcelas": [[0, 90], [91, 120], [121, 150], [151, 180], [181, 210], [211, 240]]}';
  v_prazos integer;
  i jsonb;
  n integer := 0;
  v_vistos text[] := '{}';
  v_id text;
begin
  perform public.exigir('contratos:editar');
  if v_numero !~ '^[A-Z]{2}\d{5}$' then c := c || '{"numero": "Número no formato AA00000 (ex. AR00224)."}';
  elsif exists (select 1 from public.atas where numero = v_numero) then c := c || '{"numero": "Ata já cadastrada."}';
  end if;
  if not public.e_data(v_inicio) then c := c || '{"vigenciaInicio": "Informe o início da vigência."}'; end if;
  if v_fim is null and public.e_data(v_inicio) then v_fim := ((v_inicio::date + interval '12 months')::date - 1)::text; end if;
  if not public.e_data(v_fim) then c := c || '{"vigenciaFim": "Informe o fim da vigência."}';
  elsif v_fim < coalesce(v_inicio, '') then c := c || '{"vigenciaFim": "O fim vem depois do início."}';
  end if;
  -- Regras: as padrão (documentos da CPTM) com o que vier informado por cima.
  r := v_padrao || coalesce(case when jsonb_typeof(p_dados->'regras') = 'object' then jsonb_strip_nulls(p_dados->'regras') end, '{}');
  v_prazos := jsonb_array_length(r->'prazosParcelas');
  if not public.inteiro(r->'pedidoMinimo') or public.num(r->'pedidoMinimo') <= 0 then c := c || '{"regras.pedidoMinimo": "Pedido mínimo em dormentes, maior que zero."}'; end if;
  if not public.inteiro(r->'maxParcelas') or public.num(r->'maxParcelas') <= 0 or public.num(r->'maxParcelas') > v_prazos then
    c := c || jsonb_build_object('regras.maxParcelas', format('De 1 a %s parcelas.', v_prazos));
  end if;
  if not public.inteiro(r->'parcelaMinima') or public.num(r->'parcelaMinima') <= 0 then c := c || '{"regras.parcelaMinima": "Parcela mínima em dormentes, maior que zero."}'; end if;
  if not public.inteiro(r->'parcelaMaxima') or public.num(r->'parcelaMaxima') <= 0 or public.num(r->'parcelaMaxima') < public.num(r->'parcelaMinima') then
    c := c || '{"regras.parcelaMaxima": "A parcela máxima não pode ser menor que a mínima."}';
  end if;
  for i in select * from jsonb_array_elements(coalesce(p_dados->'itens', '[]')) loop
    if not exists (select 1 from public.tamanhos t where t.id = i->>'tamanhoId' and t.ativo) then c := c || jsonb_build_object('itens.' || n, 'Escolha um tamanho ativo.');
    elsif i->>'tamanhoId' = any(v_vistos) then c := c || jsonb_build_object('itens.' || n, 'Tamanho repetido.');
    elsif not public.inteiro(i->'quantidade') or public.num(i->'quantidade') <= 0 then c := c || jsonb_build_object('itens.' || n, 'Quantidade registrada em unidades, maior que zero.');
    end if;
    v_vistos := v_vistos || (i->>'tamanhoId');
    n := n + 1;
  end loop;
  perform public.exigir_campos(c);
  perform public.exigir_fornecedor_liberado(p_dados->>'fornecedorId', 'fornecedorId');
  insert into public.atas (numero, fornecedor_id, vigencia_inicio, vigencia_fim, regras)
  values (v_numero, p_dados->>'fornecedorId', v_inicio::date, v_fim::date, r) returning id into v_id;
  insert into public.ata_itens (ordem, ata_id, tamanho_id, quantidade)
  select (x.n - 1)::integer, v_id, x.i->>'tamanhoId', public.num(x.i->'quantidade') from jsonb_array_elements(coalesce(p_dados->'itens', '[]')) with ordinality x(i, n);
  perform public.registrar_evento('ata', v_id, 'criado', format('Ata %s cadastrada (vigência até %s)', v_numero, v_fim), v_numero);
  return to_jsonb(v_id);
end $$;

-- Valida o cronograma pelas regras da ata (validarCronograma). Devolve os erros por campo e a soma por tamanho, na
-- ordem em que os tamanhos aparecem: [{ "tamanhoId", "quantidade" }].
create or replace function public.validar_cronograma(p_ata_id text, p_parcelas jsonb, p_contrato_id text, inout c jsonb, out por_tamanho jsonb)
language plpgsql stable set search_path = public as $$
declare
  a public.atas;
  r jsonb;
  p jsonb;
  i jsonb;
  n integer := 0;
  k integer;
  v_soma numeric;
  v_q numeric;
  v_vistos text[];
  v_total numeric := 0;
  t record;
  v_saldo numeric;
  v_ja numeric;
  v_codigo text;
  v_qtd numeric;
begin
  select * into a from public.atas where id = p_ata_id;
  r := a.regras;
  por_tamanho := '[]';
  if jsonb_array_length(coalesce(p_parcelas, '[]')) = 0 then c := c || '{"parcelas": "Informe ao menos uma parcela."}';
  elsif jsonb_array_length(p_parcelas) > public.num(r->'maxParcelas') then c := c || jsonb_build_object('parcelas', format('A ata permite até %s parcelas.', r->>'maxParcelas'));
  end if;
  for p in select * from jsonb_array_elements(coalesce(p_parcelas, '[]')) loop
    v_vistos := '{}';
    v_soma := 0;
    k := 0;
    for i in select * from jsonb_array_elements(coalesce(p->'itens', '[]')) loop
      v_q := coalesce(public.num(i->'quantidade'), 0);
      if not exists (select 1 from public.tamanhos tt where tt.id = i->>'tamanhoId' and (tt.ativo or exists (
          select 1 from public.contrato_itens ci where ci.contrato_id = p_contrato_id and ci.tamanho_id = tt.id))) then
        c := c || jsonb_build_object(format('parcelas.%s.%s', n, k), 'Escolha um tamanho ativo.');
      elsif i->>'tamanhoId' = any(v_vistos) then c := c || jsonb_build_object(format('parcelas.%s.%s', n, k), 'Tamanho repetido na parcela.');
      elsif not public.inteiro(i->'quantidade') or v_q < 0 then c := c || jsonb_build_object(format('parcelas.%s.%s', n, k), 'Quantidade em unidades.');
      end if;
      v_vistos := v_vistos || (i->>'tamanhoId');
      v_soma := v_soma + greatest(v_q, 0);
      if exists (select 1 from jsonb_array_elements(por_tamanho) x where x->>'tamanhoId' = i->>'tamanhoId') then
        select jsonb_agg(case when x->>'tamanhoId' = i->>'tamanhoId' then jsonb_set(x, '{quantidade}', to_jsonb(public.num(x->'quantidade') + greatest(v_q, 0))) else x end order by o)
        into por_tamanho from jsonb_array_elements(por_tamanho) with ordinality y(x, o);
      else
        por_tamanho := por_tamanho || jsonb_build_array(jsonb_build_object('tamanhoId', i->>'tamanhoId', 'quantidade', greatest(v_q, 0)));
      end if;
      k := k + 1;
    end loop;
    if v_soma < public.num(r->'parcelaMinima') or v_soma > public.num(r->'parcelaMaxima') then
      c := c || jsonb_build_object('parcelas.' || n, format('A %sª parcela soma %s: cada parcela tem de %s a %s dormentes.', n + 1, v_soma, r->>'parcelaMinima', r->>'parcelaMaxima'));
    end if;
    n := n + 1;
  end loop;
  select coalesce(sum(public.num(x->'quantidade')), 0) into v_total from jsonb_array_elements(por_tamanho) x;
  if jsonb_array_length(coalesce(p_parcelas, '[]')) > 0 and v_total < public.num(r->'pedidoMinimo') then
    c := c || jsonb_build_object('parcelas', format('O contrato soma %s dormentes: o pedido mínimo da ata é %s.', v_total, r->>'pedidoMinimo'));
  end if;
  if exists (select 1 from public.ata_itens where ata_id = a.id) then
    for t in select x->>'tamanhoId' as tamanho_id, public.num(x->'quantidade') as q from jsonb_array_elements(por_tamanho) x loop
      select v.saldo into v_saldo from public.v_ata_itens v where v.ata_id = a.id and v.tamanho_id = t.tamanho_id;
      v_ja := coalesce((select quantidade from public.contrato_itens where contrato_id = p_contrato_id and tamanho_id = t.tamanho_id), 0);
      v_codigo := coalesce((select codigo from public.tamanhos where id = t.tamanho_id), t.tamanho_id);
      v_qtd := t.q;
      if v_saldo is null then c := c || jsonb_build_object('parcelas', format('O tamanho %s não está registrado na ata %s.', v_codigo, a.numero));
      elsif v_qtd > v_saldo + v_ja then c := c || jsonb_build_object('parcelas', format('O tamanho %s passa do saldo da ata (%s).', v_codigo, v_saldo + v_ja));
      end if;
    end loop;
  end if;
end $$;

-- Grava as parcelas (numeradas na ordem) só com as quantidades maiores que zero.
create or replace function public.gravar_parcelas(p_contrato_id text, p_parcelas jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.contrato_parcelas (ordem, contrato_id, numero, tamanho_id, quantidade)
  select (row_number() over (order by p.n, i.m) - 1)::integer, p_contrato_id, p.n, i.x->>'tamanhoId', public.num(i.x->'quantidade')
  from jsonb_array_elements(p_parcelas) with ordinality p(v, n)
  cross join lateral jsonb_array_elements(coalesce(p.v->'itens', '[]')) with ordinality i(x, m)
  where public.num(i.x->'quantidade') > 0;
end $$;

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
  perform public.exigir_campos(c);
  perform public.exigir_fornecedor_liberado(a.fornecedor_id, 'ataId');
  select x.c, x.por_tamanho into c, v_por from public.validar_cronograma(a.id, p_dados->'parcelas', null, c) x;
  perform public.exigir_campos(c, 'Confira o cronograma: as regras da ata não foram atendidas.');
  insert into public.contratos (numero, ata_id, ano, data_assinatura, gestor, criado_por)
  values (v_numero, a.id, public.num(p_dados->'ano'), v_assinatura::date, public.txt(p_dados, 'gestor'), public.quem()) returning id into v_id;
  insert into public.contrato_itens (ordem, contrato_id, tamanho_id, quantidade)
  select (row_number() over (order by o) - 1)::integer, v_id, x->>'tamanhoId', public.num(x->'quantidade')
  from jsonb_array_elements(v_por) with ordinality y(x, o) where public.num(x->'quantidade') > 0 order by o;
  perform public.gravar_parcelas(v_id, p_dados->'parcelas');
  select coalesce(sum(quantidade), 0) into v_total from public.contrato_itens where contrato_id = v_id;
  perform public.registrar_evento('contrato', v_id, 'criado', format('Contrato criado: %s parcela(s), %s dormentes (gestor %s)',
    (select count(distinct numero) from public.contrato_parcelas where contrato_id = v_id), v_total, public.txt(p_dados, 'gestor')), v_numero);
  return to_jsonb(v_id);
end $$;

-- Novo gestor ou novo cronograma (mesmas regras da ata); nenhum item abaixo do já emitido, descontados os reprovados.
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

create or replace function public.cancelar_contrato(p_numero text, p_motivo text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.contratos;
  v_motivo text := trim(coalesce(p_motivo, ''));
  f record;
begin
  perform public.exigir('contratos:editar');
  select * into r from public.contratos where numero = p_numero for update;
  if not found then perform public.falhar(404, format('Contrato %s não encontrado.', p_numero)); end if;
  if r.situacao = 'cancelado' then perform public.falhar(409, format('O contrato %s já está cancelado.', p_numero)); end if;
  if v_motivo = '' then perform public.falhar(422, 'Informe o motivo do cancelamento.', '{"motivo": "Motivo obrigatório."}'); end if;
  if exists (select 1 from public.fardos where contrato_id = r.id and recebido_em is not null and conclusao_em is null) then
    perform public.falhar(409, 'Há fardos deste contrato aguardando inspeção: conclua antes de cancelar.');
  end if;
  update public.contratos set situacao = 'cancelado', motivo_cancelamento = v_motivo where id = r.id;
  perform public.registrar_evento('contrato', r.id, 'cancelado', format('Contrato cancelado: %s', v_motivo), r.numero);
  for f in select id from public.fardos where contrato_id = r.id and recebido_em is null order by public.ordem_id(emissao_id), id loop
    perform public.registrar_evento('fardo', f.id, 'cancelado', format('Contrato cancelado: %s', v_motivo));
  end loop;
  return to_jsonb(r.id);
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- NF e DOF (mock/documentos.ts)
-- ---------------------------------------------------------------------------------------------------------------

-- Reentrega (reposição) só depois da retirada dos reprovados do contrato.
create or replace function public.exigir_reentrega_liberada(p_contrato text) returns void
language plpgsql stable set search_path = public as $$
declare n integer;
begin
  select count(*) into n from public.dormentes where contrato_id = p_contrato and situacao = 'reprovado';
  if n > 0 then
    perform public.falhar(409, format('Reentrega só depois da retirada dos reprovados: %s dormente(s) deste contrato ainda aguardam retirada pelo fornecedor.', n),
      '{"reentrega": "Reprovados aguardando retirada."}');
  end if;
end $$;

-- Cadastra a NF e a DOF (e o boletim e o relatório técnico, se vierem) e cria a entrega "a caminho", vinculada a uma
-- parcela. Interna: usada por cadastrar_entrega (tela NF e DOF e recebimento) e pelo Simulador.
create or replace function public.registrar_entrega(p_dados jsonb, p_origem text, p_arquivos jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  d_nf jsonb := coalesce(p_dados->'nf', '{}');
  d_dof jsonb := coalesce(p_dados->'dof', '{}');
  b jsonb := case when jsonb_typeof(p_dados->'boletim') = 'object' then p_dados->'boletim' end;
  rt jsonb := case when jsonb_typeof(p_dados->'relatorioTecnico') = 'object' then p_dados->'relatorioTecnico' end;
  ct public.v_contratos;
  forn public.fornecedores;
  c jsonb := '{}';
  v_chave text := regexp_replace(coalesce(d_nf->>'chaveAcesso', ''), '\D', '', 'g');
  v_parcela integer := public.num(p_dados->'parcela');
  v_tem_parcela boolean;
  i jsonb;
  n integer;
  v_tam text;
  v_emp public.empresas_inspetoras;
  v_rep text;
  v_emissao public.emissoes;
  v_fardos text[];
  v_id text;
  f public.fardos;
  v_entrega text;
  v_nf text;
  v_dof text;
  v_xml jsonb;
  v_pdf jsonb;
  v_bol jsonb;
  v_rel jsonb;
  v_reentrega boolean := coalesce((p_dados->>'reentrega')::boolean, false);
  v_desc text;
begin
  select * into ct from public.v_contratos where id = d_nf->>'contratoId';
  if not found then perform public.falhar(422, 'Escolha o contrato da NF.', '{"nf.contratoId": "Contrato não encontrado."}'); end if;
  if ct.situacao_calculada = 'cancelado' then perform public.falhar(422, format('O contrato %s está cancelado.', ct.numero), '{"nf.contratoId": "Contrato cancelado."}'); end if;
  select * into forn from public.fornecedores where id = ct.fornecedor_id;

  if public.txt(d_nf, 'numero') = '' then c := c || '{"nf.numero": "Informe o número da NF."}'; end if;
  if not public.chave_valida(v_chave) then c := c || '{"nf.chaveAcesso": "A chave de acesso tem 44 dígitos e um dígito verificador válido."}';
  elsif substr(v_chave, 7, 14) <> regexp_replace(forn.cnpj, '\D', '', 'g') then
    c := c || jsonb_build_object('nf.chaveAcesso', format('A chave não é do CNPJ do fornecedor do contrato (%s).', forn.razao_social));
  end if;
  if not public.e_data(d_nf->>'emissao') then c := c || '{"nf.emissao": "Informe a data de emissão."}'; end if;
  if jsonb_array_length(coalesce(d_nf->'itens', '[]')) = 0 then c := c || '{"nf.itens": "Informe ao menos um item da NF."}'; end if;
  v_tem_parcela := exists (select 1 from public.contrato_parcelas where contrato_id = ct.id and numero = v_parcela);
  if not v_tem_parcela then c := c || '{"parcela": "Escolha a parcela do cronograma do contrato."}'; end if;
  n := 0;
  for i in select * from jsonb_array_elements(coalesce(d_nf->'itens', '[]')) loop
    select tamanho_id into v_tam from public.contrato_itens where id = i->>'itemContratoId' and contrato_id = ct.id;
    if v_tam is null then c := c || jsonb_build_object('nf.itens.' || n, 'Item não pertence ao contrato.');
    elsif v_tem_parcela and not exists (select 1 from public.contrato_parcelas where contrato_id = ct.id and numero = v_parcela and tamanho_id = v_tam) then
      c := c || jsonb_build_object('nf.itens.' || n, format('Tamanho fora da %sª parcela.', v_parcela));
    elsif not public.inteiro(i->'quantidade') or public.num(i->'quantidade') <= 0 then c := c || jsonb_build_object('nf.itens.' || n, 'Quantidade em unidades, maior que zero.');
    elsif not coalesce(public.num(i->'volumeM3') >= 0, false) then c := c || jsonb_build_object('nf.itens.' || n, 'Volume inválido.');
    end if;
    n := n + 1;
  end loop;
  -- DOF: sem DOF não há entrega.
  if public.txt(d_dof, 'numero') = '' then c := c || '{"dof.numero": "Informe o número da DOF: sem DOF não há entrega."}'; end if;
  if not public.e_data(d_dof->>'validade') then c := c || '{"dof.validade": "Informe a validade da DOF."}'; end if;
  if jsonb_array_length(coalesce(d_dof->'volumes', '[]')) = 0 then c := c || '{"dof.volumes": "Informe o volume por espécie, como no documento."}'; end if;
  n := 0;
  for i in select * from jsonb_array_elements(coalesce(d_dof->'volumes', '[]')) loop
    if not (i->>'especieId') = any(forn.especies_ids) then c := c || jsonb_build_object('dof.volumes.' || n, 'Espécie que o fornecedor não fornece.');
    elsif not coalesce(public.num(i->'volumeM3') > 0, false) then c := c || jsonb_build_object('dof.volumes.' || n, 'Volume maior que zero.');
    end if;
    n := n + 1;
  end loop;
  -- Boletim de Inspeção (opcional): empresa inspetora ativa e, por tamanho do contrato, espécies e quantidades aprovadas.
  if b is not null then
    if public.txt(b, 'numero') = '' then c := c || '{"boletim.numero": "Informe o número do boletim."}'; end if;
    if not public.e_data(b->>'data') then c := c || '{"boletim.data": "Informe a data do boletim."}'; end if;
    select * into v_emp from public.empresas_inspetoras where id = b->>'empresaInspetoraId';
    if v_emp.id is null then c := c || '{"boletim.empresaInspetoraId": "Escolha a empresa inspetora."}';
    elsif not v_emp.ativo then c := c || jsonb_build_object('boletim.empresaInspetoraId', format('A empresa %s está inativa.', v_emp.nome));
    end if;
    n := 0;
    for i in select * from jsonb_array_elements(coalesce(b->'itens', '[]')) loop
      if not exists (select 1 from public.contrato_itens where contrato_id = ct.id and tamanho_id = i->>'tamanhoId') then c := c || jsonb_build_object('boletim.itens.' || n, 'Tamanho fora do contrato.');
      elsif not exists (select 1 from public.especies where id = i->>'especieId') then c := c || jsonb_build_object('boletim.itens.' || n, 'Escolha a espécie.');
      elsif not public.inteiro(i->'quantidade') or public.num(i->'quantidade') <= 0 then c := c || jsonb_build_object('boletim.itens.' || n, 'Quantidade aprovada, maior que zero.');
      end if;
      n := n + 1;
    end loop;
  end if;
  if rt is not null then
    if public.txt(rt, 'numero') = '' then c := c || '{"relatorioTecnico.numero": "Informe o número do relatório."}'; end if;
    if not public.e_data(rt->>'data') then c := c || '{"relatorioTecnico.data": "Informe a data do relatório."}'; end if;
  end if;
  perform public.exigir_campos(c, 'Confira os dados da NF e da DOF.');
  if v_reentrega then perform public.exigir_reentrega_liberada(ct.id); end if;

  select numero into v_rep from public.nfs where chave_acesso = v_chave;
  if v_rep is not null then
    perform public.falhar(409, format('Esta chave de acesso já foi cadastrada (NF %s).', v_rep), '{"nf.chaveAcesso": "Chave de acesso já cadastrada."}');
  end if;
  if exists (select 1 from public.dofs where numero = public.txt(d_dof, 'numero')) then
    perform public.falhar(409, format('A DOF %s já foi cadastrada.', d_dof->>'numero'), '{"dof.numero": "DOF já cadastrada."}');
  end if;

  -- Emissão do fornecedor com a mesma chave (Simulador): sem fardos indicados, os dela que seguem livres viram os esperados.
  select * into v_emissao from public.emissoes where d_nf->>'chaveAcesso' = v_chave and entrega_id is null order by public.ordem_id(id) limit 1;
  if jsonb_array_length(coalesce(p_dados->'fardosIds', '[]')) > 0 then
    v_fardos := public.lista(p_dados->'fardosIds');
  elsif v_emissao.id is not null then
    v_fardos := array(select x from unnest(v_emissao.fardos_ids) with ordinality u(x, o)
      where exists (select 1 from public.fardos ff where ff.id = x and ff.entrega_id is null and ff.recebido_em is null) order by o);
  else
    v_fardos := '{}';
  end if;
  v_fardos := array(select x from (select distinct on (x) x, o from unnest(v_fardos) with ordinality u(x, o) order by x, o) s order by o);
  foreach v_id in array v_fardos loop
    select * into f from public.fardos where id = v_id for update;
    if f.id is null or f.contrato_id <> ct.id then
      perform public.falhar(422, format('O fardo %s não é deste contrato.', v_id), jsonb_build_object('fardosIds', format('Fardo %s fora do contrato.', v_id)));
    end if;
    if f.recebido_em is not null or f.entrega_id is not null then
      perform public.falhar(409, format('O fardo %s já está em outra entrega ou já foi recebido.', v_id), jsonb_build_object('fardosIds', format('Fardo %s indisponível.', v_id)));
    end if;
  end loop;

  v_entrega := public.novo_id('en');
  v_nf := public.novo_id('nf');
  v_dof := public.novo_id('dof');
  v_xml := public.anexo_novo(p_arquivos->'xml', 'xml');
  insert into public.nfs (id, numero, serie, chave_acesso, fornecedor_id, contrato_id, emissao, entrega_id, xml, criado_por)
  values (v_nf, public.txt(d_nf, 'numero'), coalesce(nullif(public.txt(d_nf, 'serie'), ''), '1'), v_chave, forn.id, ct.id, (d_nf->>'emissao')::date, v_entrega, v_xml, public.quem());
  insert into public.nf_itens (ordem, nf_id, item_contrato_id, quantidade, volume_m3)
  select (o - 1)::integer, v_nf, x->>'itemContratoId', public.num(x->'quantidade'), public.num(x->'volumeM3') from jsonb_array_elements(d_nf->'itens') with ordinality y(x, o);
  v_pdf := public.anexo_novo(p_arquivos->'pdf', 'pdf');
  insert into public.dofs (id, numero, nf_id, validade, pdf) values (v_dof, public.txt(d_dof, 'numero'), v_nf, (d_dof->>'validade')::date, v_pdf);
  insert into public.dof_volumes (ordem, dof_id, especie_id, volume_m3)
  select (o - 1)::integer, v_dof, x->>'especieId', public.num(x->'volumeM3') from jsonb_array_elements(d_dof->'volumes') with ordinality y(x, o);
  if b is not null then
    v_bol := jsonb_build_object('numero', public.txt(b, 'numero'), 'data', b->>'data', 'empresaInspetoraId', b->>'empresaInspetoraId', 'itens', coalesce(b->'itens', '[]'));
    v_bol := v_bol || coalesce(jsonb_build_object('arquivo', public.anexo_novo(p_arquivos->'boletim', 'pdf')), '{}');
    v_bol := jsonb_strip_nulls(v_bol);
  end if;
  if rt is not null then
    v_rel := jsonb_strip_nulls(jsonb_build_object('numero', public.txt(rt, 'numero'), 'data', rt->>'data', 'arquivo', public.anexo_novo(p_arquivos->'relatorio', 'pdf')));
  end if;
  insert into public.entregas (id, contrato_id, nf_id, dof_id, fardos_ids, parcela, reentrega, origem, boletim, relatorio_tecnico, criado_por)
  values (v_entrega, ct.id, v_nf, v_dof, v_fardos, v_parcela, v_reentrega, p_origem, v_bol, v_rel, public.quem());
  update public.fardos set entrega_id = v_entrega where id = any(v_fardos);
  if v_emissao.id is not null then update public.emissoes set entrega_id = v_entrega where id = v_emissao.id; end if;
  v_desc := format('Entrega da NF %s cadastrada (%sª parcela%s; %s)', d_nf->>'numero', v_parcela, case when v_reentrega then ', reentrega' else '' end, p_origem);
  perform public.registrar_evento('entrega', v_entrega, 'criado', v_desc, 'NF ' || (d_nf->>'numero'));
  perform public.registrar_evento('contrato', ct.id, 'criado', v_desc, 'NF ' || (d_nf->>'numero'));
  return v_entrega;
end $$;

create or replace function public.cadastrar_entrega(p_dados jsonb, p_origem text default 'cadastro', p_arquivos jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir('nf:cadastrar');
  if p_origem not in ('cadastro', 'recebimento') then perform public.falhar(422, 'Origem inválida.'); end if;
  return to_jsonb(public.registrar_entrega(p_dados, p_origem, coalesce(p_arquivos, '{}')));
end $$;

-- Marca a DOF como declarada no Sinaflor, com quem e quando: só depois que algum fardo da entrega chegou.
create or replace function public.declarar_dof(p_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  d public.dofs;
  en public.entregas;
  v_nf text;
  f record;
begin
  perform public.exigir('dof:declarar');
  select * into d from public.dofs where id = p_id for update;
  if not found then perform public.falhar(404, 'DOF não encontrado.'); end if;
  if d.declarado_em is not null then perform public.falhar(409, format('A DOF %s já foi declarada.', d.numero)); end if;
  select * into en from public.entregas where dof_id = d.id;
  if en.situacao = 'a_caminho' then perform public.falhar(409, format('A DOF %s só pode ser declarada depois do recebimento da entrega.', d.numero)); end if;
  update public.dofs set declarado_em = public.agora(), declarado_por = public.quem() where id = d.id;
  if en.id is not null then
    perform public.registrar_evento('entrega', en.id, 'declarado', format('DOF %s declarada no Sinaflor', d.numero), 'DOF ' || d.numero);
    select numero into v_nf from public.nfs where id = d.nf_id;
    for f in select id from public.fardos where entrega_id = en.id order by public.ordem_id(emissao_id), id loop
      perform public.registrar_evento('fardo', f.id, 'declarado', format('DOF %s declarada no Sinaflor', d.numero), case when v_nf is not null then 'NF ' || v_nf end);
    end loop;
  end if;
  return to_jsonb(d.id);
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Simulador do fornecedor (mock/simulador.ts): só demonstração
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.emitir_fardos(p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ct public.v_contratos;
  v_parcela integer := public.num(p_dados->'parcela');
  v_itens jsonb;
  i jsonb;
  n integer;
  it public.v_contrato_itens;
  c jsonb := '{}';
  forn public.fornecedores;
  v_especies text[];
  v_trat public.tratamentos[];
  t public.tratamentos;
  v_hoje date := public.hoje();
  v_emissao text;
  v_seq_fardo integer;
  v_seq_dorm integer;
  v_fardos text[] := '{}';
  v_vol jsonb := '[]';
  v_bol jsonb := '[]';
  v_nf_itens jsonb := '[]';
  v_k integer;
  v_j integer;
  v_seq integer;
  v_fardo text;
  v_dorm text;
  v_esp text;
  v_classe smallint;
  v_tam public.tamanhos;
  v_volume numeric;
  v_q integer;
  v_num_nf bigint;
  v_num_dof bigint;
  v_num_bol bigint;
  v_emp text;
  v_ano text := to_char(public.hoje(), 'YYYY');
  v_chave text;
  v_nf jsonb;
  v_dof jsonb;
  v_reentrega boolean := coalesce((p_dados->>'reentrega')::boolean, false);
  v_com boolean := coalesce((p_dados->>'comDocumentos')::boolean, false);
  v_boletim jsonb;
  v_relatorio jsonb;
  v_dpf integer;
begin
  perform public.exigir('simulador:usar');
  perform public.exigir_demonstracao();
  select * into ct from public.v_contratos where id = p_dados->>'contratoId';
  if not found then perform public.falhar(404, 'Contrato não encontrado.'); end if;
  if ct.situacao_calculada <> 'vigente' then perform public.falhar(422, format('O contrato %s não está vigente.', ct.numero), '{"contratoId": "Escolha um contrato vigente."}'); end if;
  if not exists (select 1 from public.contrato_parcelas where contrato_id = ct.id and numero = v_parcela) then
    perform public.falhar(422, 'Escolha a parcela do cronograma.', '{"parcela": "Parcela não encontrada no contrato."}');
  end if;
  select coalesce(jsonb_agg(x order by o), '[]') into v_itens from jsonb_array_elements(coalesce(p_dados->'itens', '[]')) with ordinality y(x, o) where coalesce(public.num(x->'fardos'), 0) > 0;
  if jsonb_array_length(v_itens) = 0 then perform public.falhar(422, 'Informe ao menos um fardo.', '{"itens": "Informe a quantidade de fardos."}'); end if;
  n := 0;
  for i in select * from jsonb_array_elements(v_itens) loop
    select * into it from public.v_contrato_itens where id = i->>'itemContratoId' and contrato_id = ct.id;
    if it.id is null then c := c || jsonb_build_object('itens.' || n, 'Item não pertence ao contrato.');
    elsif not exists (select 1 from public.contrato_parcelas where contrato_id = ct.id and numero = v_parcela and tamanho_id = it.tamanho_id) then
      c := c || jsonb_build_object('itens.' || n, format('O tamanho não está na %sª parcela.', v_parcela));
    elsif not public.inteiro(i->'fardos') or public.num(i->'fardos') > 50 then c := c || jsonb_build_object('itens.' || n, 'De 1 a 50 fardos.');
    elsif not public.inteiro(i->'dormentesPorFardo') or public.num(i->'dormentesPorFardo') < 1 or public.num(i->'dormentesPorFardo') > 50 then
      c := c || jsonb_build_object('itens.' || n, 'De 1 a 50 dormentes por fardo.');
    elsif public.num(i->'fardos') * public.num(i->'dormentesPorFardo') > it.saldo_a_emitir then
      c := c || jsonb_build_object('itens.' || n, format('Passa do saldo a emitir do item (%s).', it.saldo_a_emitir));
    end if;
    n := n + 1;
  end loop;
  perform public.exigir_campos(c, 'Confira as quantidades: o total emitido, descontados os reprovados, não pode passar do contratado.');

  -- Espécie, classe e tratamento de cada fardo: atribuídos de forma determinística pela sequência do fardo, entre as
  -- espécies que o fornecedor fornece (como viriam do Boletim de Inspeção e da plaquinha).
  select * into forn from public.fornecedores where id = ct.fornecedor_id;
  v_especies := array(select x from unnest(forn.especies_ids) with ordinality u(x, o) where exists (select 1 from public.especies s where s.id = x and s.ativo) order by o);
  v_trat := array(select tt from public.tratamentos tt where tt.ativo order by public.ordem_id(tt.id));
  if cardinality(v_especies) = 0 or cardinality(v_trat) = 0 then perform public.falhar(409, 'Cadastre espécies (do fornecedor) e tratamentos ativos antes de emitir.'); end if;
  select coalesce(max(public.sequencia_de(id)), 0) + 1 into v_seq_fardo from public.fardos where contrato_id = ct.id;
  select coalesce(max(public.sequencia_de(id)), 0) + 1 into v_seq_dorm from public.dormentes where contrato_id = ct.id;
  v_emissao := public.novo_id('em');

  -- Primeiro passo: os fardos, as quantidades por espécie e o boletim (para gravar a emissão antes dos fardos).
  for i in select * from jsonb_array_elements(v_itens) loop
    select tt.* into v_tam from public.contrato_itens ci join public.tamanhos tt on tt.id = ci.tamanho_id where ci.id = i->>'itemContratoId';
    v_volume := public.volume_m3(v_tam.comprimento_cm, v_tam.largura_cm, v_tam.altura_cm);
    v_dpf := public.num(i->'dormentesPorFardo');
    for v_k in 1..public.num(i->'fardos') loop
      v_seq := v_seq_fardo + cardinality(v_fardos);
      v_esp := v_especies[(v_seq - 1) % cardinality(v_especies) + 1];
      v_fardos := v_fardos || format('%s-F%s', ct.numero, lpad(v_seq::text, 3, '0'));
      if exists (select 1 from jsonb_array_elements(v_vol) x where x->>'especieId' = v_esp) then
        select jsonb_agg(case when x->>'especieId' = v_esp then jsonb_set(x, '{v}', to_jsonb(public.num(x->'v') + v_dpf * v_volume)) else x end order by o) into v_vol
        from jsonb_array_elements(v_vol) with ordinality y(x, o);
      else
        v_vol := v_vol || jsonb_build_array(jsonb_build_object('especieId', v_esp, 'v', v_dpf * v_volume));
      end if;
      if exists (select 1 from jsonb_array_elements(v_bol) x where x->>'tamanhoId' = v_tam.id and x->>'especieId' = v_esp) then
        select jsonb_agg(case when x->>'tamanhoId' = v_tam.id and x->>'especieId' = v_esp then jsonb_set(x, '{quantidade}', to_jsonb(public.num(x->'quantidade') + v_dpf)) else x end order by o)
        into v_bol from jsonb_array_elements(v_bol) with ordinality y(x, o);
      else
        v_bol := v_bol || jsonb_build_array(jsonb_build_object('tamanhoId', v_tam.id, 'especieId', v_esp, 'quantidade', v_dpf));
      end if;
    end loop;
    v_q := public.num(i->'fardos') * v_dpf;
    v_nf_itens := v_nf_itens || jsonb_build_array(jsonb_build_object('itemContratoId', i->>'itemContratoId', 'quantidade', v_q, 'volumeM3', round(v_q * v_volume, 3)));
  end loop;

  -- NF e DOF de exemplo, coerentes com o volume emitido (a DOF declara o volume nominal); boletim e relatório de exemplo.
  v_num_nf := public.proximo_numero('numeroNf', 4500);
  v_num_dof := public.proximo_numero('numeroDof', 26010001);
  select e.id into v_emp from public.empresas_inspetoras e where e.ativo order by public.ordem_id(e.id)
  offset (select count(*) from public.contratos x where public.ordem_id(x.id) < public.ordem_id(ct.id)) % greatest((select count(*) from public.empresas_inspetoras where ativo), 1) limit 1;
  if v_emp is null then perform public.falhar(409, 'Cadastre uma empresa inspetora ativa antes de emitir.'); end if;
  v_num_bol := public.proximo_numero('numeroBoletim', 1);
  v_chave := public.chave_com_digito('35' || to_char(v_hoje, 'YYMM') || lpad(regexp_replace(forn.cnpj, '\D', '', 'g'), 14, '0') || '55001'
    || lpad(v_num_nf::text, 9, '0') || '1' || lpad(v_num_nf::text, 8, '0'));
  v_boletim := jsonb_build_object('numero', format('BI-%s-%s', v_ano, lpad(v_num_bol::text, 4, '0')), 'data', (v_hoje - 1)::text, 'empresaInspetoraId', v_emp, 'itens', v_bol);
  v_relatorio := jsonb_build_object('numero', format('RT-%s-%s', v_ano, lpad(v_num_bol::text, 4, '0')), 'data', (v_hoje - 1)::text);
  v_nf := jsonb_build_object('numero', v_num_nf::text, 'serie', '1', 'chaveAcesso', v_chave, 'emissao', v_hoje::text, 'itens', v_nf_itens);
  v_dof := jsonb_build_object('numero', v_num_dof::text, 'validade', (v_hoje + coalesce(public.num(p_dados->'validadeDofDias'), 7)::integer)::text,
    'volumes', (select coalesce(jsonb_agg(jsonb_build_object('especieId', x->>'especieId', 'volumeM3', round(public.num(x->'v'), 3)) order by o), '[]') from jsonb_array_elements(v_vol) with ordinality y(x, o)));
  insert into public.emissoes (id, contrato_id, fardos_ids, parcela, reentrega, com_documentos, boletim, relatorio_tecnico, nf, dof, criado_por)
  values (v_emissao, ct.id, v_fardos, v_parcela, v_reentrega, v_com, v_boletim, v_relatorio, v_nf, v_dof, public.quem());

  -- Fardos e dormentes (situação: em trânsito / emitido). Marcação: usina e data de impregnação (2 dias antes).
  n := 0;
  for i in select * from jsonb_array_elements(v_itens) loop
    v_dpf := public.num(i->'dormentesPorFardo');
    for v_k in 1..public.num(i->'fardos') loop
      n := n + 1;
      v_fardo := v_fardos[n];
      v_seq := public.sequencia_de(v_fardo);
      t := v_trat[(v_seq - 1) % cardinality(v_trat) + 1];
      v_esp := v_especies[(v_seq - 1) % cardinality(v_especies) + 1];
      v_classe := case when v_seq % 5 = 0 then 2 else 1 end;
      insert into public.fardos (id, contrato_id, item_contrato_id, especie_id, classe, tratamento_id, usina_tratamento, data_tratamento, emissao_id, quantidade_inicial)
      values (v_fardo, ct.id, i->>'itemContratoId', v_esp, v_classe, t.id, t.empresa, v_hoje - 2, v_emissao, v_dpf);
      perform public.registrar_evento('fardo', v_fardo, 'emitido', 'Fardo emitido pelo fornecedor');
      for v_j in 1..v_dpf loop
        v_dorm := format('%s-%s', ct.numero, lpad(v_seq_dorm::text, 6, '0'));
        v_seq_dorm := v_seq_dorm + 1;
        insert into public.dormentes (id, contrato_id, item_contrato_id, fardo_id, especie_id, classe, tratamento_id, usina_tratamento, data_tratamento)
        values (v_dorm, ct.id, i->>'itemContratoId', v_fardo, v_esp, v_classe, t.id, t.empresa, v_hoje - 2);
        perform public.registrar_evento('dormente', v_dorm, 'emitido', format('Emitido pelo fornecedor no fardo %s', v_fardo), v_fardo);
      end loop;
    end loop;
  end loop;
  perform public.registrar_evento('contrato', ct.id, 'emitido', format('%s fardo(s) emitidos pelo fornecedor (NF %s, %sª parcela)', cardinality(v_fardos), v_num_nf, v_parcela), 'NF ' || v_num_nf);

  -- Com documentos: a entrega já nasce cadastrada, como se a CPTM tivesse cadastrado NF e DOF (liga-se pela chave).
  if v_com then
    perform public.registrar_entrega(jsonb_build_object('nf', v_nf || jsonb_build_object('contratoId', ct.id), 'dof', v_dof, 'parcela', v_parcela,
      'reentrega', v_reentrega, 'fardosIds', to_jsonb(v_fardos), 'boletim', v_boletim, 'relatorioTecnico', v_relatorio), 'simulador',
      jsonb_build_object('xml', jsonb_build_object('nome', format('NF-%s.xml', v_num_nf)), 'boletim', jsonb_build_object('nome', (v_boletim->>'numero') || '.pdf'),
        'relatorio', jsonb_build_object('nome', (v_relatorio->>'numero') || '.pdf')));
  end if;
  return to_jsonb(v_emissao);
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Recebimento (mock/recebimento.ts)
-- ---------------------------------------------------------------------------------------------------------------

-- Diferença percentual entre o volume calculado e o da DOF (null = infinita: sem volume na DOF e algo recebido).
create or replace function public.diferenca_volume_pct(documental numeric, calculado numeric) returns numeric
language sql immutable as $$
  select case when documental <= 0 then case when calculado > 0 then null else 0 end else abs(calculado - documental) / documental * 100 end
$$;

-- Divergência de volume por espécie (IN Ibama): DOF × nominal e, com a inspeção concluída de todos os fardos recebidos
-- da espécie, DOF × medido (que passa a valer). `p_faltas` ({ fardoId: n }) sobrepõe a falta declarada dos fardos.
create or replace function public.divergencia_volume(p_dof_id text, p_fardos text[], p_faltas jsonb default '{}') returns jsonb
language plpgsql stable set search_path = public as $$
declare
  v_id text;
  f public.fardos;
  v_vol numeric;
  v_falta numeric;
  v_total integer;
  esp jsonb := '[]';    -- [{ especieId, nominal, medido, tudo, estimados }] na ordem: espécies da DOF, depois as dos fardos
  x jsonb;
  saida jsonb := '[]';
  v_doc numeric;
  v_nom numeric;
  v_med numeric;
  v_pct numeric;
  v_medido numeric;
  v_estimados integer;
begin
  select coalesce(jsonb_agg(jsonb_build_object('especieId', especie_id, 'nominal', 0, 'medido', 0, 'tudo', true, 'estimados', 0, 'temFardo', false) order by ordem), '[]')
  into esp from public.dof_volumes where dof_id = p_dof_id;
  foreach v_id in array p_fardos loop
    select * into f from public.fardos where id = v_id;
    v_vol := public.volume_do_item(f.item_contrato_id);
    v_falta := coalesce(public.num(p_faltas->f.id), f.falta_declarada, 0);
    select count(*) into v_total from public.dormentes where fardo_id = f.id;
    select coalesce(sum(public.volume_medido(d)), 0), count(*) filter (where d.comprimento_cm is null) into v_medido, v_estimados
    from public.dormentes d where d.fardo_id = f.id and d.situacao in ('em_estoque', 'reservado', 'baixado', 'reprovado');
    if not exists (select 1 from jsonb_array_elements(esp) e where e->>'especieId' = f.especie_id) then
      esp := esp || jsonb_build_array(jsonb_build_object('especieId', f.especie_id, 'nominal', 0, 'medido', 0, 'tudo', true, 'estimados', 0, 'temFardo', false));
    end if;
    select jsonb_agg(case when e->>'especieId' = f.especie_id then e || jsonb_build_object(
        'nominal', public.num(e->'nominal') + greatest(0, v_total - v_falta) * v_vol,
        'medido', public.num(e->'medido') + v_medido,
        'tudo', (e->>'tudo')::boolean and f.conclusao_em is not null,
        'estimados', public.num(e->'estimados') + v_estimados, 'temFardo', true) else e end order by o)
    into esp from jsonb_array_elements(esp) with ordinality y(e, o);
  end loop;
  for x in select * from jsonb_array_elements(esp) loop
    v_doc := coalesce((select volume_m3 from public.dof_volumes where dof_id = p_dof_id and especie_id = x->>'especieId'), 0);
    v_nom := round(public.num(x->'nominal'), 3);
    v_med := case when (x->>'tudo')::boolean and (x->>'temFardo')::boolean then round(public.num(x->'medido'), 3) end;
    v_pct := public.diferenca_volume_pct(v_doc, coalesce(v_med, v_nom));
    saida := saida || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'especieId', x->>'especieId', 'documentalM3', v_doc, 'nominalM3', v_nom, 'medidoM3', v_med,
      'base', case when v_med is not null then 'medido' else 'nominal' end,
      'estimados', case when v_med is not null and public.num(x->'estimados') > 0 then public.num(x->'estimados') end,
      'percentual', round(v_pct, 1), 'acimaTolerancia', v_pct is null or v_pct > 10)));
  end loop;
  return saida;
end $$;

-- Justificativa preenchida pelo sistema quando a divergência vem só da falta (justificativaPorFalta).
create or replace function public.justificativa_por_falta(p_fardos text[], p_faltas jsonb) returns text
language plpgsql immutable as $$
declare
  partes text[] := '{}';
  x jsonb;
  q integer;
begin
  if cardinality(p_fardos) > 0 then
    partes := partes || format('%s da entrega, ainda em trânsito: %s', case when cardinality(p_fardos) = 1 then 'um fardo' else cardinality(p_fardos) || ' fardos' end, array_to_string(p_fardos, ', '));
  end if;
  for x in select * from jsonb_array_elements(coalesce(p_faltas, '[]')) loop
    q := public.num(x->'quantidade');
    partes := partes || format('%s %s no fardo %s', q, case when q = 1 then 'dormente' else 'dormentes' end, x->>'fardoId');
  end loop;
  return case when cardinality(partes) > 0 then format('Divergência causada pela falta de %s.', array_to_string(partes, '; ')) else '' end;
end $$;

create or replace function public.receber(p_entrega_id text, p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  en public.entregas;
  v_nf public.nfs;
  v_dof public.dofs;
  l public.locais;
  v_esperados text[];
  v_lidos text[];
  v_aceitos text[] := '{}';
  v_desconhecidos text[] := '{}';
  v_faltantes text[];
  v_id text;
  f public.fardos;
  v_oc jsonb;
  n integer;
  v_faltas jsonb := '[]';      -- [{ fardoId, quantidade }] na ordem
  v_faltas_mapa jsonb := '{}';
  v_zero jsonb := '{}';
  v_recebidos text[];
  v_div jsonb;
  v_acima boolean;
  v_so_falta boolean := false;
  v_auto text;
  v_exige boolean;
  c jsonb := '{}';
  v_total integer;
  v_informada text := public.txt(p_dados, 'justificativaDivergencia');
  v_just text;
  v_flag boolean := false;
  v_compl text;
  v_ocorr jsonb := '[]';
  v_fotos jsonb;
  v_rec text;
  v_ref text;
  v_x jsonb;
begin
  perform public.exigir('recebimento:registrar');
  select * into en from public.entregas where id = p_entrega_id for update;
  if not found then perform public.falhar(404, 'Entrega não encontrado.'); end if;
  if en.situacao = 'recebida' then perform public.falhar(409, 'Esta entrega já foi recebida por completo.'); end if;
  select * into v_nf from public.nfs where id = en.nf_id;
  select * into v_dof from public.dofs where id = en.dof_id;
  select * into l from public.locais where id = p_dados->>'localEsperaId';
  if l.id is null or not l.ativo or l.tipo <> 'inspecao' then
    perform public.falhar(422, 'Escolha o local de espera da inspeção.', '{"localEsperaId": "Escolha um local ativo do tipo inspeção."}');
  end if;
  -- Reentrega (reposição) só depois da retirada dos reprovados do contrato.
  if en.reentrega then perform public.exigir_reentrega_liberada(en.contrato_id); end if;

  -- Análise (analisarRecebimento): aceitos, desconhecidos, faltantes e a divergência acumulada da entrega.
  v_esperados := array(select ff.id from public.fardos ff where ff.id = any(en.fardos_ids) and ff.recebido_em is null order by public.ordem_id(ff.emissao_id), ff.id);
  v_lidos := array(select x from (select distinct on (x) x, o from unnest(array(select upper(trim(y)) from unnest(public.lista(p_dados->'fardosLidos')) y)) with ordinality u(x, o)
    where x <> '' order by x, o) s order by o);
  foreach v_id in array v_lidos loop
    select * into f from public.fardos where id = v_id for update;
    if f.id is not null and (v_id = any(v_esperados) or (f.contrato_id = en.contrato_id and f.recebido_em is null and f.entrega_id is null)) then
      v_aceitos := v_aceitos || v_id;
    else
      v_desconhecidos := v_desconhecidos || v_id;
    end if;
  end loop;
  v_faltantes := array(select x from unnest(v_esperados) with ordinality u(x, o) where not x = any(v_aceitos) order by o);
  for v_oc in select * from jsonb_array_elements(coalesce(p_dados->'ocorrencias', '[]')) loop
    if v_oc->>'tipo' = 'falta' and coalesce(v_oc->>'fardoId', '') <> '' and coalesce(public.num(v_oc->'quantidade'), 0) <> 0
       and (v_oc->>'fardoId') = any(v_aceitos) and public.num(v_oc->'quantidade') > 0 then
      if v_faltas_mapa ? (v_oc->>'fardoId') then
        v_faltas_mapa := v_faltas_mapa || jsonb_build_object(v_oc->>'fardoId', public.num(v_faltas_mapa->(v_oc->>'fardoId')) + public.num(v_oc->'quantidade'));
      else
        v_faltas_mapa := v_faltas_mapa || jsonb_build_object(v_oc->>'fardoId', public.num(v_oc->'quantidade'));
        v_faltas := v_faltas || jsonb_build_array(jsonb_build_object('fardoId', v_oc->>'fardoId'));
      end if;
    end if;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('fardoId', x->>'fardoId', 'quantidade', v_faltas_mapa->(x->>'fardoId')) order by k), '[]') into v_faltas
  from jsonb_array_elements(v_faltas) with ordinality y(x, k);
  select coalesce(jsonb_object_agg(k, 0), '{}') into v_zero from jsonb_object_keys(v_faltas_mapa) k;
  v_recebidos := array(select ff.id from public.fardos ff where ff.entrega_id = en.id and ff.recebido_em is not null order by public.ordem_id(ff.emissao_id), ff.id) || v_aceitos;
  v_div := public.divergencia_volume(en.dof_id, v_recebidos, v_faltas_mapa);
  v_acima := exists (select 1 from jsonb_array_elements(v_div) d where (d->>'acimaTolerancia')::boolean);
  -- Se, contando o que faltou (fardos e dormentes), a DOF fecha dentro da tolerância, a divergência vem só da falta.
  if v_acima and (cardinality(v_faltantes) > 0 or v_faltas_mapa <> '{}') then
    v_so_falta := not exists (select 1 from jsonb_array_elements(public.divergencia_volume(en.dof_id, v_recebidos || v_faltantes, v_zero)) d where (d->>'acimaTolerancia')::boolean);
  end if;
  if v_so_falta then v_auto := public.justificativa_por_falta(v_faltantes, v_faltas); end if;
  v_exige := v_acima and not v_so_falta;
  if cardinality(v_aceitos) = 0 then perform public.falhar(422, 'Nenhum fardo desta entrega foi lido.', '{"fardosLidos": "Leia o QR de ao menos um fardo da entrega."}'); end if;

  n := 0;
  for v_oc in select * from jsonb_array_elements(coalesce(p_dados->'ocorrencias', '[]')) loop
    if v_oc->>'tipo' = 'falta' then
      select count(*) into v_total from public.dormentes where fardo_id = v_oc->>'fardoId';
      if coalesce(v_oc->>'fardoId', '') = '' or not (v_oc->>'fardoId') = any(v_aceitos) then
        c := c || jsonb_build_object('ocorrencias.' || n, 'Na falta, escolha o fardo lido em que faltam dormentes.');
        n := n + 1;
        continue;
      end if;
      if not public.inteiro(v_oc->'quantidade') or public.num(v_oc->'quantidade') < 1 or public.num(v_oc->'quantidade') > v_total then
        c := c || jsonb_build_object('ocorrencias.' || n, format('Informe quantos dormentes faltam no fardo (de 1 a %s).', v_total));
        n := n + 1;
        continue;
      end if;
    end if;
    if public.txt(v_oc, 'descricao') = '' then c := c || jsonb_build_object('ocorrencias.' || n, 'Descreva a ocorrência.');
    elsif v_oc->>'tipo' <> 'falta' and jsonb_array_length(coalesce(v_oc->'fotos', '[]')) = 0 then c := c || jsonb_build_object('ocorrencias.' || n, 'A ocorrência exige ao menos uma foto.');
    end if;
    n := n + 1;
  end loop;
  for v_x in select * from jsonb_array_elements(v_faltas) loop
    if public.num(v_x->'quantidade') > (select count(*) from public.dormentes where fardo_id = v_x->>'fardoId') then
      c := c || jsonb_build_object('ocorrencias', format('A falta declarada no fardo %s passa da quantidade de dormentes dele.', v_x->>'fardoId'));
    end if;
  end loop;
  perform public.exigir_campos(c, 'Complete as ocorrências: descrição sempre; foto na avaria e na sobra; na falta, o fardo e a quantidade.');

  -- Justificativa: automática quando a divergência vem só dos fardos que faltaram (a pessoa pode complementar).
  v_just := nullif(v_informada, '');
  if v_auto is not null then
    v_compl := case when left(v_informada, length(v_auto)) = v_auto then trim(substr(v_informada, length(v_auto) + 1)) else v_informada end;
    v_just := case when v_compl <> '' then v_auto || ' ' || v_compl else v_auto end;
    v_flag := true;
  elsif v_exige and v_informada = '' then
    perform public.falhar(422, 'A divergência de volume passa de 10% em alguma espécie (IN Ibama): informe a justificativa.', '{"justificativaDivergencia": "Justificativa obrigatória."}');
  end if;

  -- Ocorrências: as declaradas e as que o sistema gera (falta de fardo esperado e fardo desconhecido).
  for v_oc in select * from jsonb_array_elements(coalesce(p_dados->'ocorrencias', '[]')) loop
    select coalesce(jsonb_agg(public.anexo_novo(ft, 'imagem') order by k), '[]') into v_fotos from jsonb_array_elements(coalesce(v_oc->'fotos', '[]')) with ordinality y(ft, k);
    v_ocorr := v_ocorr || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('tipo', v_oc->>'tipo', 'descricao', public.txt(v_oc, 'descricao'), 'fardoId', nullif(v_oc->>'fardoId', ''),
      'quantidade', case when v_oc->>'tipo' = 'falta' then v_oc->'quantidade' end)) || jsonb_build_object('automatica', false, 'fotos', v_fotos));
  end loop;
  foreach v_id in array v_faltantes loop
    v_ocorr := v_ocorr || jsonb_build_array(jsonb_build_object('tipo', 'falta', 'descricao', format('Fardo %s não foi lido; continua em trânsito.', v_id), 'fardoId', v_id, 'automatica', true, 'fotos', '[]'::jsonb));
  end loop;
  foreach v_id in array v_desconhecidos loop
    v_ocorr := v_ocorr || jsonb_build_array(jsonb_build_object('tipo', 'fardo_desconhecido', 'descricao', format('Fardo %s lido não pertence a esta entrega.', v_id), 'fardoId', v_id, 'automatica', true, 'fotos', '[]'::jsonb));
  end loop;

  v_rec := public.novo_id('rc');
  v_ref := 'NF ' || v_nf.numero;
  foreach v_id in array v_aceitos loop
    select * into f from public.fardos where id = v_id;
    if f.entrega_id is null then
      update public.entregas set fardos_ids = fardos_ids || v_id where id = en.id;
    end if;
    update public.fardos set entrega_id = en.id, recebido_em = public.agora(), local_id = l.id,
      falta_declarada = case when v_faltas_mapa ? v_id then public.num(v_faltas_mapa->v_id) else falta_declarada end where id = v_id;
    perform public.registrar_evento('fardo', v_id, 'recebido', format('Recebido na %s, aguardando inspeção em %s', v_ref, l.codigo), v_ref);
    perform public.movimentar_dormentes(array(select id from public.dormentes where fardo_id = v_id and situacao = 'emitido' order by id), 'aguardando_inspecao', 'recebido',
      format('Recebido na %s (fardo %s)', v_ref, v_id), v_ref);
  end loop;
  for v_oc in select * from jsonb_array_elements(v_ocorr) loop
    if (v_oc->>'fardoId') = any(v_aceitos) then
      perform public.registrar_evento('fardo', v_oc->>'fardoId', 'ocorrencia', format('Ocorrência no recebimento: %s', v_oc->>'descricao'), v_ref);
    end if;
  end loop;
  update public.entregas set situacao = case when exists (select 1 from public.fardos ff where ff.id = any(entregas.fardos_ids) and ff.recebido_em is null)
    then 'recebida_parcial' else 'recebida' end where id = en.id;

  insert into public.recebimentos (id, entrega_id, nf_id, dof_id, recebido_por, canhoto, fardos_esperados, fardos_lidos, conforme, ocorrencias, divergencia_volume,
    justificativa_divergencia, justificativa_automatica, local_espera_id)
  values (v_rec, en.id, v_nf.id, v_dof.id, public.quem(), public.anexo_novo(p_dados->'canhoto', 'imagem'), v_esperados, v_aceitos, jsonb_array_length(v_ocorr) = 0, v_ocorr, v_div,
    v_just, v_flag, l.id);
  perform public.registrar_evento('entrega', en.id, 'recebido', format('Recebimento provisório: %s fardo(s) em %s%s', cardinality(v_aceitos), l.codigo,
    case when jsonb_array_length(v_ocorr) > 0 then format(', %s ocorrência(s)', jsonb_array_length(v_ocorr)) else '' end), v_ref);
  return to_jsonb(v_rec);
end $$;

-- Laudo Técnico de aprovação: depois que toda a entrega foi recebida e inspecionada (prazo de 20 dias úteis: alerta).
create or replace function public.emitir_laudo(p_entrega_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  en public.v_entregas;
  v_aprov integer;
  v_reprov integer;
  v_numero text;
  v_nf text;
  f record;
begin
  perform public.exigir('inspecao:operar');
  perform 1 from public.entregas where id = p_entrega_id for update;
  select * into en from public.v_entregas where id = p_entrega_id;
  if not found then perform public.falhar(404, 'Entrega não encontrado.'); end if;
  if en.laudo is not null then perform public.falhar(409, format('O laudo desta entrega já foi emitido (%s).', en.laudo->>'numero')); end if;
  if not en.pode_emitir_laudo then perform public.falhar(409, 'O laudo só é emitido depois que todos os fardos da entrega foram recebidos e inspecionados.'); end if;
  select count(*) filter (where situacao in ('reprovado', 'retirado')), count(*) filter (where situacao in ('em_estoque', 'reservado', 'baixado'))
  into v_reprov, v_aprov from public.dormentes where fardo_id = any(en.fardos_ids);
  v_numero := format('LT-%s-%s', to_char(public.hoje(), 'YYYY'), lpad(public.proximo_numero('numeroLaudo', 1)::text, 4, '0'));
  update public.entregas set laudo = jsonb_build_object('numero', v_numero, 'emitidoEm', public.iso(public.agora()), 'emitidoPor', public.quem(),
    'aprovados', v_aprov, 'reprovados', v_reprov) where id = en.id;
  select numero into v_nf from public.nfs where id = en.nf_id;
  perform public.registrar_evento('entrega', en.id, 'laudo', format('Laudo Técnico %s emitido: %s aprovados, %s reprovados', v_numero, v_aprov, v_reprov), v_numero);
  perform public.registrar_evento('contrato', en.contrato_id, 'laudo', format('Laudo Técnico %s da NF %s', v_numero, coalesce(v_nf, '')), v_numero);
  for f in select id from public.fardos where id = any(en.fardos_ids) order by public.ordem_id(emissao_id), id loop
    perform public.registrar_evento('fardo', f.id, 'laudo', format('Laudo Técnico %s emitido', v_numero), case when v_nf is not null then 'NF ' || v_nf end);
  end loop;
  return to_jsonb(en.id);
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Inspeção (mock/inspecao.ts)
-- ---------------------------------------------------------------------------------------------------------------

-- Local ativo de segregação para os reprovados (o primeiro com espaço; sem espaço, o primeiro).
create or replace function public.local_de_segregacao() returns public.locais
language plpgsql stable set search_path = public as $$
declare l public.locais;
begin
  select x.* into l from public.locais x join public.v_locais v on v.id = x.id
  where x.ativo and x.tipo = 'segregacao' order by (v.ocupacao < v.capacidade) desc, public.ordem_id(x.id) limit 1;
  if l.id is null then perform public.falhar(409, 'Não há local de segregação ativo. Cadastre um em Cadastros › Locais.'); end if;
  return l;
end $$;

-- Reprovados do fardo: comunicação ao fornecedor em até 5 dias úteis e retirada em até 15. Reprovado encontrado
-- depois entra na mesma reprovação, se ela ainda não foi retirada.
create or replace function public.registrar_reprovacao(p_fardo text, p_ids text[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  f public.fardos;
  v_com date := public.somar_dias_uteis(public.hoje(), 5);
  v_ret date := public.somar_dias_uteis(public.hoje(), 15);
begin
  select * into f from public.fardos where id = p_fardo;
  if f.reprovados_ids is not null and f.retirado_em is null then
    update public.fardos set reprovados_ids = reprovados_ids || p_ids where id = p_fardo;
    return;
  end if;
  update public.fardos set reprovados_ids = p_ids, comunicar_ate = v_com, retirar_ate = v_ret,
    comunicado_em = null, comunicado_por = null, retirado_em = null, retirado_por = null where id = p_fardo;
  perform public.registrar_evento('fardo', p_fardo, 'segregado', format('%s reprovado(s): comunicar o fornecedor até %s; retirada até %s', cardinality(p_ids), v_com, v_ret));
end $$;

create or replace function public.segregar(p_fardo text, p_ids text[], p_de text) returns void
language plpgsql security definer set search_path = public as $$
declare seg public.locais;
begin
  if cardinality(p_ids) = 0 then return; end if;
  seg := public.local_de_segregacao();
  perform public.movimentar_dormentes(p_ids, 'reprovado', 'segregado', format('Reprovado na inspeção, segregado em %s', seg.codigo), null, null, seg.id);
  insert into public.movimentacoes (tipo, fardo_id, dormentes_ids, quantidade, de_local_id, para_local_id, quem)
  values ('segregacao', p_fardo, p_ids, cardinality(p_ids), p_de, seg.id, public.quem());
  perform public.registrar_reprovacao(p_fardo, p_ids);
end $$;

-- Registra a inspeção de um dormente (Inspector, simulação ou à mão). Interna: usada também pela simulação do fardo.
create or replace function public.inspecionar(p_dormente text, p_dados jsonb, p_fardo text) returns text
language plpgsql security definer set search_path = public as $$
declare
  d public.dormentes;
  f public.fardos;
  v_resultado text;
  v_categoria smallint;
  v_veredito text;
  v_indice numeric;
  v_origem text := coalesce(p_dados->>'origem', 'manual');
  v_lim integer[];
  v_insp text;
  m jsonb := case when jsonb_typeof(p_dados->'medidas') = 'object' then p_dados->'medidas' end;
  v_tardia boolean;
  v_local public.locais;
begin
  select * into d from public.dormentes where id = upper(trim(p_dormente)) for update;
  if not found then perform public.falhar(404, format('Dormente %s não encontrado.', p_dormente), '{"dormenteId": "ID não encontrado."}'); end if;
  if p_fardo is not null and d.fardo_id <> p_fardo then
    perform public.falhar(409, format('O dormente %s não pertence a este fardo (é do %s).', d.id, d.fardo_id), '{"dormenteId": "Não pertence a este fardo."}');
  end if;
  if d.situacao = 'emitido' then perform public.falhar(409, format('O dormente %s ainda não foi recebido.', d.id)); end if;
  if d.situacao not in ('aguardando_inspecao', 'nao_localizado') then perform public.falhar(409, format('O dormente %s já foi inspecionado e o fardo concluído.', d.id)); end if;

  if v_origem = 'manual' then
    v_resultado := p_dados->>'resultado';
    if v_resultado = 'aprovado' and coalesce(public.num(p_dados->'categoria'), 0) = 0 then
      perform public.falhar(422, 'Informe a categoria do dormente aprovado.', '{"categoria": "Categoria obrigatória para aprovado."}');
    end if;
    v_categoria := case when v_resultado = 'aprovado' then public.num(p_dados->'categoria') end;
  else
    v_indice := public.num(p_dados->'indice');
    if not coalesce(v_indice >= 0 and v_indice <= 100, false) then perform public.falhar(422, 'Índice da inspeção fora de 0 a 100.', '{"indice": "De 0 a 100."}'); end if;
    v_veredito := p_dados->>'veredito';
    v_resultado := case when v_veredito = 'APROVADO' then 'aprovado' else 'reprovado' end;
    select limites_categoria into v_lim from public.parametros where id = 1;
    v_categoria := case when v_resultado = 'aprovado' then case when v_indice >= v_lim[1] then 1 when v_indice >= v_lim[2] then 2 else 3 end end;
  end if;

  insert into public.inspecoes (dormente_id, fardo_id, resultado, categoria, indice, veredito, comprimento_cm, largura_cm, altura_cm, inspetor, origem, relatorio_url)
  values (d.id, d.fardo_id, v_resultado, v_categoria, v_indice, v_veredito, public.num(m->'comprimentoCm'), public.num(m->'larguraCm'), public.num(m->'alturaCm'),
    case v_origem when 'manual' then public.quem() when 'simulado' then 'Inspeção simulada' else 'Railway Edge Inspector' end, v_origem,
    case when v_origem <> 'manual' then p_dados->>'relatorioUrl' end)
  returning id into v_insp;
  v_tardia := d.situacao = 'nao_localizado';
  update public.dormentes set inspecao_id = v_insp, categoria = v_categoria,
    comprimento_cm = coalesce(public.num(m->'comprimentoCm'), comprimento_cm), largura_cm = coalesce(public.num(m->'larguraCm'), largura_cm),
    altura_cm = coalesce(public.num(m->'alturaCm'), altura_cm)
  where id = d.id;
  perform public.registrar_evento('dormente', d.id, 'inspecionado', format('Inspecionado: %s%s',
    case when v_resultado = 'aprovado' then format('aprovado, categoria %s', v_categoria) else 'reprovado' end, case when v_origem = 'manual' then ' (lançado à mão)' else '' end));

  if v_tardia then
    -- Encontrado depois da conclusão do fardo: segue o fluxo na hora.
    select * into f from public.fardos where id = d.fardo_id;
    if v_resultado = 'aprovado' then
      select * into v_local from public.locais where id = f.local_id;
      perform public.movimentar_dormentes(array[d.id], 'em_estoque', 'guardado',
        format('Encontrado e guardado no fardo %s%s', f.id, case when v_local.id is not null then ' em ' || v_local.codigo else '' end));
    else
      perform public.segregar(f.id, array[d.id], f.local_id);
    end if;
  end if;
  return d.fardo_id;
end $$;

create or replace function public.registrar_inspecao(p_dormente_id text, p_dados jsonb, p_fardo_id text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir('inspecao:operar');
  return to_jsonb(public.inspecionar(p_dormente_id, p_dados, p_fardo_id));
end $$;

create or replace function public.exigir_em_inspecao(p_fardo text) returns public.fardos
language plpgsql set search_path = public as $$
declare f public.fardos;
begin
  select * into f from public.fardos where id = p_fardo for update;
  if not found then perform public.falhar(404, 'Fardo não encontrado.'); end if;
  if f.recebido_em is null then perform public.falhar(409, format('O fardo %s ainda não foi recebido.', f.id)); end if;
  if f.conclusao_em is not null then perform public.falhar(409, format('A inspeção do fardo %s já foi concluída.', f.id)); end if;
  return f;
end $$;

-- Simulação determinística do Inspector para os dormentes ainda sem inspeção (~5% reprovados).
create or replace function public.simular_fardo(p_fardo_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  f public.fardos;
  t public.tamanhos;
  d record;
  v_seq integer;
  v_rep boolean;
begin
  perform public.exigir('inspecao:operar');
  perform public.exigir_demonstracao();
  f := public.exigir_em_inspecao(p_fardo_id);
  select tt.* into t from public.contrato_itens ci join public.tamanhos tt on tt.id = ci.tamanho_id where ci.id = f.item_contrato_id;
  for d in select id from public.dormentes where fardo_id = f.id and situacao = 'aguardando_inspecao' and inspecao_id is null order by id loop
    v_seq := public.sequencia_de(d.id);
    v_rep := v_seq % 20 = 7;
    perform public.inspecionar(d.id, jsonb_build_object('origem', 'simulado',
      'veredito', case when v_rep then case when v_seq % 40 = 7 then 'ATENCAO' else 'REJEITADO' end else 'APROVADO' end,
      'indice', case when v_rep then 20 + (v_seq % 30) else 50 + ((v_seq * 37) % 51) end,
      'medidas', jsonb_build_object('comprimentoCm', t.comprimento_cm + ((v_seq % 3) - 1), 'larguraCm', t.largura_cm, 'alturaCm', t.altura_cm)), f.id);
  end loop;
  return to_jsonb(f.id);
end $$;

-- Conclui a inspeção do fardo e guarda no local. Não lidos exigem justificativa e ficam "não localizado"; quando cabem
-- na falta declarada no recebimento, vale a justificativa do sistema se ninguém escrever outra.
create or replace function public.concluir_inspecao(p_fardo_id text, p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  f public.fardos;
  l public.locais;
  v_aprov text[];
  v_reprov text[];
  v_nao text[];
  v_auto text;
  v_just text;
  v_espera text;
begin
  perform public.exigir('inspecao:operar');
  f := public.exigir_em_inspecao(p_fardo_id);
  select * into l from public.locais where id = p_dados->>'localId';
  if l.id is null or not l.ativo or l.tipo <> 'armazenagem' then
    perform public.falhar(422, 'Escolha o local de guarda.', '{"localId": "Escolha um local ativo de armazenagem."}');
  end if;
  v_aprov := array(select d.id from public.dormentes d join public.inspecoes i on i.id = d.inspecao_id where d.fardo_id = f.id and d.situacao = 'aguardando_inspecao' and i.resultado = 'aprovado' order by d.id);
  v_reprov := array(select d.id from public.dormentes d join public.inspecoes i on i.id = d.inspecao_id where d.fardo_id = f.id and d.situacao = 'aguardando_inspecao' and i.resultado = 'reprovado' order by d.id);
  v_nao := array(select d.id from public.dormentes d where d.fardo_id = f.id and d.situacao = 'aguardando_inspecao' and d.inspecao_id is null order by d.id);
  if cardinality(v_nao) > 0 and f.falta_declarada is not null and cardinality(v_nao) <= f.falta_declarada then
    v_auto := format('Falta de %s %s no recebimento do fardo.', f.falta_declarada, case when f.falta_declarada = 1 then 'dormente declarada' else 'dormentes declarada' end);
  end if;
  v_just := coalesce(nullif(public.txt(p_dados, 'justificativa'), ''), v_auto);
  if cardinality(v_nao) > 0 and v_just is null then
    perform public.falhar(422, format('%s dormente(s) não foram lidos. Para concluir assim, informe a justificativa: eles ficarão como não localizados.', cardinality(v_nao)),
      '{"justificativa": "Justificativa obrigatória com dormentes não lidos."}');
  end if;
  v_espera := f.local_id;
  if cardinality(v_aprov) > 0 then
    perform public.movimentar_dormentes(v_aprov, 'em_estoque', 'guardado', format('Aprovado e guardado no fardo %s em %s', f.id, l.codigo));
    insert into public.movimentacoes (tipo, fardo_id, dormentes_ids, quantidade, de_local_id, para_local_id, quem)
    values ('guarda', f.id, v_aprov, cardinality(v_aprov), v_espera, l.id, public.quem());
  end if;
  perform public.segregar(f.id, v_reprov, v_espera);
  if cardinality(v_nao) > 0 then
    perform public.movimentar_dormentes(v_nao, 'nao_localizado', 'nao_localizado', format('Não lido na inspeção do fardo %s: %s', f.id, v_just));
  end if;
  update public.fardos set local_id = l.id, conclusao_em = public.agora(), conclusao_por = public.quem(),
    conclusao_justificativa = case when cardinality(v_nao) > 0 then v_just end, nao_localizados = v_nao where id = f.id;
  perform public.registrar_evento('fardo', f.id, 'inspecionado', format('Inspeção concluída: %s aprovados, %s reprovados%s', cardinality(v_aprov), cardinality(v_reprov),
    case when cardinality(v_nao) > 0 then format(', %s não localizados', cardinality(v_nao)) else '' end));
  perform public.registrar_evento('fardo', f.id, 'guardado', format('Guardado em %s', l.codigo));
  return to_jsonb(f.id);
end $$;

create or replace function public.registrar_comunicacao(p_fardo_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare f public.fardos;
begin
  perform public.exigir('inspecao:operar');
  select * into f from public.fardos where id = p_fardo_id for update;
  if not found then perform public.falhar(404, 'Fardo não encontrado.'); end if;
  if f.reprovados_ids is null then perform public.falhar(409, format('O fardo %s não tem reprovados.', f.id)); end if;
  if f.comunicado_em is not null then perform public.falhar(409, 'A comunicação ao fornecedor já foi registrada.'); end if;
  update public.fardos set comunicado_em = public.agora(), comunicado_por = public.quem() where id = f.id;
  perform public.registrar_evento('fardo', f.id, 'comunicado', format('Fornecedor comunicado dos %s reprovado(s)', cardinality(f.reprovados_ids)));
  return to_jsonb(f.id);
end $$;

-- Retirada pelo fornecedor: os reprovados saem da segregação e ficam "retirado pelo fornecedor".
create or replace function public.registrar_retirada(p_fardo_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  f public.fardos;
  v_ids text[];
  v_seg text;
begin
  perform public.exigir('inspecao:operar');
  select * into f from public.fardos where id = p_fardo_id for update;
  if not found then perform public.falhar(404, 'Fardo não encontrado.'); end if;
  if f.reprovados_ids is null then perform public.falhar(409, format('O fardo %s não tem reprovados.', f.id)); end if;
  if f.retirado_em is not null then perform public.falhar(409, 'A retirada já foi registrada.'); end if;
  if f.comunicado_em is null then perform public.falhar(409, 'Registre antes a comunicação ao fornecedor.'); end if;
  v_ids := array(select x from unnest(f.reprovados_ids) with ordinality u(x, o) where exists (select 1 from public.dormentes d where d.id = x and d.situacao = 'reprovado') order by o);
  select local_id into v_seg from public.dormentes where id = v_ids[1];
  perform public.movimentar_dormentes(v_ids, 'retirado', 'retirado', 'Retirado pelo fornecedor (reprovado na inspeção)');
  if cardinality(v_ids) > 0 then
    insert into public.movimentacoes (tipo, fardo_id, dormentes_ids, quantidade, de_local_id, quem)
    values ('retirada', f.id, v_ids, cardinality(v_ids), v_seg, public.quem());
  end if;
  update public.fardos set retirado_em = public.agora(), retirado_por = public.quem() where id = f.id;
  perform public.registrar_evento('fardo', f.id, 'retirado', format('%s reprovado(s) retirado(s) pelo fornecedor', cardinality(v_ids)));
  return to_jsonb(f.id);
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Estoque (mock/estoque.ts)
-- ---------------------------------------------------------------------------------------------------------------

-- Transfere o fardo com saldo para outro local. Expedição: só o fardo inteiro reservado para uma RME pronta.
create or replace function public.transferir_fardo(p_fardo_id text, p_local_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  f public.v_fardos;
  destino public.locais;
  v_origem text;
  v_ids text[];
  v_rmes text[];
  v_rme public.rmes;
  v_livres integer;
  v_ref text;
  v_desc text;
  v_id text;
begin
  perform public.exigir('estoque:movimentar');
  perform 1 from public.fardos where id = p_fardo_id for update;
  select * into f from public.v_fardos where id = p_fardo_id;
  if not found then perform public.falhar(404, 'Fardo não encontrado.'); end if;
  if f.situacao <> 'em_estoque' then perform public.falhar(409, format('O fardo %s não está em estoque (situação: %s).', f.id, f.situacao)); end if;
  select * into destino from public.locais where id = p_local_id;
  if not found then perform public.falhar(404, 'Local não encontrado.'); end if;
  if not destino.ativo then perform public.falhar(422, format('O local %s está inativo.', destino.codigo), '{"localId": "Escolha um local ativo."}'); end if;
  if destino.tipo not in ('armazenagem', 'expedicao') then
    perform public.falhar(422, format('O local %s não é de armazenagem nem de expedição.', destino.codigo), '{"localId": "Escolha um local de armazenagem ou expedição."}');
  end if;
  if destino.id = f.local_id then perform public.falhar(422, format('O fardo já está em %s.', destino.codigo), '{"localId": "Escolha outro local."}'); end if;
  v_origem := (select codigo from public.locais where id = f.local_id);
  v_ids := array(select id from public.dormentes where fardo_id = f.id and situacao in ('em_estoque', 'reservado') order by id);
  if destino.tipo = 'expedicao' then
    v_rmes := array(select distinct case when situacao = 'reservado' then coalesce(rme_numero, '') else '' end from public.dormentes where id = any(v_ids));
    if cardinality(v_rmes) = 1 then select * into v_rme from public.rmes where numero = v_rmes[1]; end if;
    if v_rme.id is null or v_rme.situacao <> 'pronta' then
      select count(*) into v_livres from public.dormentes where id = any(v_ids) and situacao = 'em_estoque';
      perform public.falhar(422, format('O local %s é de expedição: só recebe fardo com todos os dormentes reservados para uma RME pronta. %s', destino.codigo,
        case when v_livres > 0 then format('O fardo %s tem %s dormente(s) disponível(is): fica no local atual até a entrega.', f.id, v_livres)
          else format('Os dormentes do fardo %s não estão reservados para uma única RME pronta.', f.id) end),
        '{"localId": "Expedição só recebe fardo inteiro reservado para uma RME pronta."}');
    end if;
    v_ref := v_rme.numero;
  end if;
  v_desc := format('Transferido de %s para %s%s', coalesce(v_origem, '—'), destino.codigo, case when v_ref is not null then format(' (%s)', v_ref) else '' end);
  perform public.registrar_evento('fardo', f.id, 'transferido', v_desc, v_ref);
  foreach v_id in array v_ids loop perform public.registrar_evento('dormente', v_id, 'transferido', v_desc, v_ref); end loop;
  insert into public.movimentacoes (tipo, fardo_id, dormentes_ids, quantidade, de_local_id, para_local_id, quem, referencia)
  values ('transferencia', f.id, v_ids, cardinality(v_ids), f.local_id, destino.id, public.quem(), v_ref);
  update public.fardos set local_id = destino.id where id = f.id;
  return to_jsonb(f.id);
end $$;

-- Devolve à origem o fardo que foi para a expedição por uma RME cancelada (o local de onde ele saiu para lá).
create or replace function public.devolver_da_expedicao(p_fardo text, p_rme text) returns void
language plpgsql security definer set search_path = public as $$
declare
  f public.fardos;
  aqui public.locais;
  origem public.locais;
  v_ids text[];
  v_desc text;
  v_id text;
begin
  select * into f from public.fardos where id = p_fardo for update;
  select * into aqui from public.locais where id = f.local_id;
  if aqui.tipo is distinct from 'expedicao' then return; end if;
  select l.* into origem from public.movimentacoes m join public.locais l on l.id = m.de_local_id
  where m.fardo_id = f.id and m.para_local_id = f.local_id and m.tipo = 'transferencia' order by public.ordem_id(m.id) desc limit 1;
  if origem.id is null then return; end if;
  v_ids := array(select id from public.dormentes where fardo_id = f.id and situacao in ('em_estoque', 'reservado') order by id);
  v_desc := format('Devolvido de %s para %s: %s cancelada', aqui.codigo, origem.codigo, p_rme);
  perform public.registrar_evento('fardo', f.id, 'transferido', v_desc, p_rme);
  foreach v_id in array v_ids loop perform public.registrar_evento('dormente', v_id, 'transferido', v_desc, p_rme); end loop;
  insert into public.movimentacoes (tipo, fardo_id, dormentes_ids, quantidade, de_local_id, para_local_id, quem, referencia)
  values ('transferencia', f.id, v_ids, cardinality(v_ids), aqui.id, origem.id, public.quem(), p_rme);
  update public.fardos set local_id = origem.id where id = f.id;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Saída por requisição (mock/rme.ts): aberta → em separação → pronta → entregue (ou cancelada antes da entrega)
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.abrir_rme(p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c jsonb := '{}';
  i jsonb;
  n integer := 0;
  k text;
  v_vistos text[] := '{}';
  v_ano integer := extract(year from public.hoje());
  v_seq integer;
  v_id text;
  v_numero text;
  u public.perfis;
begin
  perform public.exigir('rme:abrir');
  if public.txt(p_dados, 'destino') = '' then c := c || '{"destino": "Informe a obra ou o trecho."}'; end if;
  if coalesce(p_dados->>'tipoDestino', '') not in ('principal_pesado', 'principal_medio', 'desvio', 'patio') then c := c || '{"tipoDestino": "Escolha o tipo de destino."}'; end if;
  if not public.e_data(p_dados->>'necessidadeEm') then c := c || '{"necessidadeEm": "Informe a data de necessidade."}';
  elsif (p_dados->>'necessidadeEm')::date < public.hoje() then c := c || '{"necessidadeEm": "A data de necessidade já passou."}';
  end if;
  if jsonb_array_length(coalesce(p_dados->'itens', '[]')) = 0 then c := c || '{"itens": "Informe ao menos um item."}'; end if;
  for i in select * from jsonb_array_elements(coalesce(p_dados->'itens', '[]')) loop
    k := coalesce(i->>'tamanhoId', '') || '|' || coalesce(i->>'classe', '');
    if not exists (select 1 from public.tamanhos where id = i->>'tamanhoId') then c := c || jsonb_build_object('itens.' || n, 'Escolha o tamanho.');
    elsif coalesce(public.num(i->'classe'), 0) not in (1, 2) then c := c || jsonb_build_object('itens.' || n, 'Escolha a classe (1ª ou 2ª).');
    elsif jsonb_typeof(i->'categoriaMinima') not in ('null') and coalesce(public.num(i->'categoriaMinima'), 0) not in (1, 2, 3) then
      c := c || jsonb_build_object('itens.' || n, 'Categoria mínima 1, 2 ou 3 (ou qualquer aprovado).');
    elsif coalesce(i->>'especieId', '') <> '' and not exists (select 1 from public.especies where id = i->>'especieId') then c := c || jsonb_build_object('itens.' || n, 'Espécie não encontrada.');
    elsif k = any(v_vistos) then c := c || jsonb_build_object('itens.' || n, 'Tamanho e classe repetidos: some as quantidades numa linha.');
    elsif not public.inteiro(i->'quantidade') or public.num(i->'quantidade') <= 0 then c := c || jsonb_build_object('itens.' || n, 'Quantidade em unidades, maior que zero.');
    end if;
    v_vistos := v_vistos || k;
    n := n + 1;
  end loop;
  perform public.exigir_campos(c, 'Confira os dados da requisição.');
  perform pg_advisory_xact_lock(hashtext('rme' || v_ano));
  select coalesce(max(substring(numero from '^RME-\d{4}-(\d{4})$')::integer), 0) + 1 into v_seq from public.rmes where numero like 'RME-' || v_ano || '-%';
  v_numero := format('RME-%s-%s', v_ano, lpad(v_seq::text, 4, '0'));
  select * into u from public.perfis where id = auth.uid();
  insert into public.rmes (numero, solicitante_id, solicitante_nome, destino, tipo_destino, necessidade_em)
  values (v_numero, u.id, public.quem(), public.txt(p_dados, 'destino'), p_dados->>'tipoDestino', (p_dados->>'necessidadeEm')::date) returning id into v_id;
  insert into public.rme_itens (rme_id, ordem, tamanho_id, classe, categoria_minima, especie_id, quantidade)
  select v_id, (o - 1)::integer, x->>'tamanhoId', public.num(x->'classe'), nullif(coalesce(public.num(x->'categoriaMinima'), 0), 0), nullif(x->>'especieId', ''), public.num(x->'quantidade')
  from jsonb_array_elements(p_dados->'itens') with ordinality y(x, o);
  perform public.registrar_evento('rme', v_id, 'criado', format('RME aberta para %s', public.txt(p_dados, 'destino')), v_numero);
  return to_jsonb(v_id);
end $$;

create or replace function public.iniciar_separacao(p_numero text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.rmes;
begin
  perform public.exigir('rme:separar');
  select * into r from public.rmes where numero = p_numero for update;
  if not found then perform public.falhar(404, format('RME %s não encontrado.', p_numero)); end if;
  if r.situacao = 'em_separacao' then return to_jsonb(r.id); end if;
  if r.situacao <> 'aberta' then perform public.falhar(409, format('A RME %s não está aberta.', r.numero)); end if;
  update public.rmes set situacao = 'em_separacao' where id = r.id;
  perform public.registrar_evento('rme', r.id, 'reservado', 'Separação iniciada');
  return to_jsonb(r.id);
end $$;

-- O dormente atende o item: espécie (se pedida) e categoria até a mínima pedida (1 é a melhor; sem mínima, qualquer aprovado).
create or replace function public.atende(d public.dormentes, it public.rme_itens) returns boolean
language sql immutable as $$
  select (it.especie_id is null or d.especie_id = it.especie_id) and (it.categoria_minima is null or coalesce(d.categoria, 9) <= it.categoria_minima)
$$;

-- Dormentes já reservados para o item nesta RME (separação anterior, mantida quando a RME volta a "em separação").
create or replace function public.ja_reservados(p_rme text, it public.rme_itens) returns integer
language sql stable set search_path = public as $$
  select count(*)::integer from public.rme_separacao s cross join lateral unnest(s.dormentes_ids) x
  join public.dormentes d on d.id = x join public.fardos f on f.id = d.fardo_id join public.contrato_itens ci on ci.id = f.item_contrato_id
  where s.rme_id = p_rme and d.situacao = 'reservado' and ci.tamanho_id = it.tamanho_id and f.classe = it.classe
$$;

-- Quantos dormentes a sugestão do sistema separa de cada fardo (como sugerirSeparacao): fardos do tamanho e da classe,
-- abertos primeiro, do mais antigo ao mais novo, só o disponível que atende ao item; pede só o que falta.
create or replace function public.sugestao_por_fardo(p_rme text) returns table (fardo_id text, quantidade integer)
language plpgsql stable set search_path = public as $$
declare
  it public.rme_itens;
  f record;
  v_falta integer;
  v_livres integer;
begin
  for it in select * from public.rme_itens where rme_id = p_rme order by ordem loop
    v_falta := greatest(0, it.quantidade - public.ja_reservados(p_rme, it));
    for f in select vf.id from public.v_fardos vf join public.contrato_itens ci on ci.id = vf.item_contrato_id
             where vf.situacao = 'em_estoque' and vf.disponivel > 0 and ci.tamanho_id = it.tamanho_id and vf.classe = it.classe
               and (it.especie_id is null or vf.especie_id = it.especie_id)
             order by vf.aberto desc, public.iso(vf.recebido_em), vf.id loop
      exit when v_falta <= 0;
      select count(*) into v_livres from public.dormentes d where d.fardo_id = f.id and d.situacao = 'em_estoque' and public.atende(d, it);
      if least(v_livres, v_falta) > 0 then
        fardo_id := f.id;
        quantidade := least(v_livres, v_falta);
        return next;
      end if;
      v_falta := v_falta - least(v_livres, v_falta);
    end loop;
  end loop;
end $$;

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
  delete from _sugestao;
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

-- Na entrega da RME, uma destinação final por espécie, com o volume (medido ou, sem medidas, o do tamanho).
create or replace function public.gerar_destinacoes(p_rme text) returns void
language plpgsql security definer set search_path = public as $$
declare r public.rmes;
begin
  select * into r from public.rmes where id = p_rme;
  insert into public.destinacoes (rme_id, rme_numero, especie_id, quantidade, volume_m3, entregue_em)
  select r.id, r.numero, x.especie_id, x.quantidade, round(x.volume, 3), public.agora()
  from (
    select d.especie_id, count(*)::integer as quantidade, sum(public.volume_medido(d)) as volume, min(s.ordem * 100000 + u.o) as primeiro
    from public.rme_separacao s cross join lateral unnest(s.dormentes_ids) with ordinality u(id, o) join public.dormentes d on d.id = u.id
    where s.rme_id = r.id group by d.especie_id
  ) x order by x.primeiro;
end $$;

-- Entrega: baixa os dormentes reservados; o fardo com sobra fica aberto e o zerado, baixado.
create or replace function public.entregar_rme(p_numero text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.rmes;
  l public.rme_separacao;
  f public.fardos;
begin
  perform public.exigir('rme:separar');
  select * into r from public.rmes where numero = p_numero for update;
  if not found then perform public.falhar(404, format('RME %s não encontrado.', p_numero)); end if;
  if r.situacao <> 'pronta' then perform public.falhar(409, format('A RME %s não está pronta para entrega.', r.numero)); end if;
  for l in select * from public.rme_separacao where rme_id = r.id order by ordem loop
    select * into f from public.fardos where id = l.fardo_id;
    perform public.movimentar_dormentes(l.dormentes_ids, 'baixado', 'baixado', format('Entregue para %s', r.destino), r.numero, r.numero);
    insert into public.movimentacoes (tipo, fardo_id, dormentes_ids, quantidade, de_local_id, quem, referencia)
    values ('saida', f.id, l.dormentes_ids, cardinality(l.dormentes_ids), f.local_id, public.quem(), r.numero);
    perform public.registrar_evento('fardo', f.id, 'baixado', format('%s dormente(s) entregues para %s', cardinality(l.dormentes_ids), r.destino), r.numero);
  end loop;
  update public.rmes set situacao = 'entregue' where id = r.id;
  perform public.registrar_evento('rme', r.id, 'baixado', format('Entregue para %s', r.destino));
  perform public.gerar_destinacoes(r.id);
  return to_jsonb(r.id);
end $$;

-- Cancela antes da entrega: libera as reservas e devolve à origem o fardo que já estava na expedição. O almoxarife
-- cancela qualquer RME; o requisitante, só as que abriu.
create or replace function public.cancelar_rme(p_numero text, p_motivo text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.rmes;
  l public.rme_separacao;
  v_ids text[] := '{}';
  v_motivo text := trim(coalesce(p_motivo, ''));
begin
  perform public.exigir('rme:separar', 'rme:abrir');
  select * into r from public.rmes where numero = p_numero for update;
  if not found then perform public.falhar(404, format('RME %s não encontrado.', p_numero)); end if;
  if not public.pode('rme:separar') and r.solicitante_id is distinct from auth.uid() then
    perform public.falhar(403, 'Só quem abriu a RME (ou o almoxarifado) pode cancelá-la.');
  end if;
  if r.situacao in ('entregue', 'cancelada') then perform public.falhar(409, format('A RME %s já foi %s.', r.numero, case when r.situacao = 'entregue' then 'entregue' else 'cancelada' end)); end if;
  if v_motivo = '' then perform public.falhar(422, 'Informe o motivo do cancelamento.', '{"motivo": "Motivo obrigatório."}'); end if;
  for l in select * from public.rme_separacao where rme_id = r.id order by ordem loop
    perform public.devolver_da_expedicao(l.fardo_id, r.numero);
    v_ids := v_ids || l.dormentes_ids;
  end loop;
  if cardinality(v_ids) > 0 then
    perform public.movimentar_dormentes(v_ids, 'em_estoque', 'cancelado', format('Reserva liberada: %s cancelada', r.numero), r.numero);
  end if;
  update public.rmes set situacao = 'cancelada', motivo_cancelamento = v_motivo where id = r.id;
  perform public.registrar_evento('rme', r.id, 'cancelado', format('Cancelada: %s', v_motivo));
  return to_jsonb(r.id);
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- IBAMA (mock/ibama.ts): destinação final, saldo informado do DOF e perdas
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.marcar_destinacao_lancada(p_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d public.destinacoes;
begin
  perform public.exigir('dof:declarar');
  select * into d from public.destinacoes where id = p_id for update;
  if not found then perform public.falhar(404, 'Destinação final não encontrado.'); end if;
  if d.lancado_em is not null then perform public.falhar(409, format('Esta destinação já foi lançada no DOF em %s.', left(public.iso(d.lancado_em), 10))); end if;
  update public.destinacoes set lancado_em = public.agora(), lancado_por = public.quem() where id = d.id;
  perform public.registrar_evento('rme', d.rme_id, 'lancado', format('Destinação final lançada no DOF: %s m³ de %s', public.num_br(d.volume_m3),
    coalesce((select nome_cientifico from public.especies where id = d.especie_id), '')), d.rme_numero);
  return to_jsonb(d.id);
end $$;

create or replace function public.informar_saldo_dof(p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c jsonb := '{}';
  i jsonb;
  n integer := 0;
  v_vistas text[] := '{}';
  v_id text;
begin
  perform public.exigir('dof:declarar');
  if not public.e_data(p_dados->>'data') then c := c || '{"data": "Informe a data do saldo."}';
  elsif p_dados->>'data' > left(public.iso(public.agora()), 10) then c := c || '{"data": "A data não pode ser futura."}';
  end if;
  if jsonb_array_length(coalesce(p_dados->'itens', '[]')) = 0 then c := c || '{"itens": "Informe o saldo de ao menos uma espécie."}'; end if;
  for i in select * from jsonb_array_elements(coalesce(p_dados->'itens', '[]')) loop
    if not exists (select 1 from public.especies where id = i->>'especieId') then c := c || jsonb_build_object('itens.' || n, 'Espécie inválida.');
    elsif (i->>'especieId') = any(v_vistas) then c := c || jsonb_build_object('itens.' || n, 'Espécie repetida.');
    elsif not coalesce(public.num(i->'volumeM3') >= 0, false) then c := c || jsonb_build_object('itens.' || n, 'Volume inválido.');
    end if;
    v_vistas := v_vistas || (i->>'especieId');
    n := n + 1;
  end loop;
  perform public.exigir_campos(c, 'Confira o saldo informado.');
  insert into public.saldos_dof (data, observacao, quem) values ((p_dados->>'data')::date, nullif(public.txt(p_dados, 'observacao'), ''), public.quem()) returning id into v_id;
  insert into public.saldos_dof_itens (ordem, saldo_id, especie_id, volume_m3)
  select (o - 1)::integer, v_id, x->>'especieId', round(public.num(x->'volumeM3'), 3) from jsonb_array_elements(p_dados->'itens') with ordinality y(x, o);
  perform public.registrar_evento('saldo_dof', v_id, 'informado', format('Saldo do DOF de %s informado (%s espécie(s))', p_dados->>'data', jsonb_array_length(p_dados->'itens')));
  return to_jsonb(v_id);
end $$;

-- Perdas (art. 42): só o dormente não localizado vira perdido; sai do saldo físico e fica a comunicar ao IBAMA.
create or replace function public.registrar_perda(p_dormente_id text, p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  d public.dormentes;
  v_desc text := nullif(public.txt(p_dados, 'descricao'), '');
  v_motivo text := p_dados->>'motivo';
  v_tam text;
  v_id text;
begin
  perform public.exigir('painel:gestao');
  select * into d from public.dormentes where id = p_dormente_id for update;
  if not found then perform public.falhar(404, format('Dormente %s não encontrado.', p_dormente_id)); end if;
  if d.situacao <> 'nao_localizado' then
    perform public.falhar(409, format('Só um dormente não localizado pode ser registrado como perdido (o %s está "%s").', d.id, d.situacao));
  end if;
  if coalesce(v_motivo, '') not in ('extravio', 'avaria', 'incendio', 'intemperie', 'outro') then perform public.falhar(422, 'Informe o motivo da perda.', '{"motivo": "Motivo obrigatório."}'); end if;
  if v_motivo = 'outro' and v_desc is null then perform public.falhar(422, 'Descreva o motivo da perda.', '{"descricao": "Obrigatória quando o motivo é \"outro\"."}'); end if;
  select tamanho_id into v_tam from public.contrato_itens where id = d.item_contrato_id;
  perform public.movimentar_dormentes(array[d.id], 'perdido', 'perdido', format('Perda registrada (%s)%s',
    case v_motivo when 'incendio' then 'incêndio' when 'intemperie' then 'intempérie' else v_motivo end, case when v_desc is not null then ': ' || v_desc else '' end), d.fardo_id);
  insert into public.perdas (dormente_id, fardo_id, contrato_id, especie_id, tamanho_id, volume_m3, motivo, descricao, quem)
  values (d.id, d.fardo_id, d.contrato_id, d.especie_id, v_tam, round(public.volume_do_item(d.item_contrato_id), 3), v_motivo, v_desc, public.quem()) returning id into v_id;
  return to_jsonb(v_id);
end $$;

create or replace function public.marcar_perda_comunicada(p_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.perdas;
begin
  perform public.exigir('painel:gestao', 'dof:declarar');
  select * into p from public.perdas where id = p_id for update;
  if not found then perform public.falhar(404, 'Perda não encontrado.'); end if;
  if p.comunicado_em is not null then perform public.falhar(409, format('Esta perda já foi comunicada ao IBAMA em %s.', left(public.iso(p.comunicado_em), 10))); end if;
  update public.perdas set comunicado_em = public.agora(), comunicado_por = public.quem() where id = p.id;
  perform public.registrar_evento('dormente', p.dormente_id, 'comunicado', 'Perda comunicada ao IBAMA', p.fardo_id);
  return to_jsonb(p.id);
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Parâmetros (Configurações): só o administrador
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
    delete from public.niveis_estoque;
    insert into public.niveis_estoque (ordem, classe, tamanho_id, minimo, maximo)
    select (o - 1)::integer, public.num(x->'classe'), x->>'tamanhoId', public.num(x->'minimo'), public.num(x->'maximo') from jsonb_array_elements(p_dados->'niveis') with ordinality y(x, o);
  end if;
  if p_dados ? 'feriados' then
    delete from public.feriados;
    insert into public.feriados (data, nome, abrangencia)
    select (x->>'data')::date, x->>'nome', x->>'abrangencia' from jsonb_array_elements(p_dados->'feriados') x;
  end if;
  perform public.registrar_evento('parametros', 'parametros', 'alterado', format('Parâmetros alterados: %s', (select string_agg(k, ', ') from jsonb_object_keys(p_dados) k)));
  return to_jsonb('parametros'::text);
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Funções internas: só as funções acima as chamam (não ficam abertas pela API).
-- ---------------------------------------------------------------------------------------------------------------
revoke execute on function public.anexo_novo(jsonb, text), public.movimentar_dormentes(text[], text, text, text, text, text, text),
  public.registrar_entrega(jsonb, text, jsonb), public.inspecionar(text, jsonb, text), public.registrar_reprovacao(text, text[]),
  public.segregar(text, text[], text), public.exigir_em_inspecao(text), public.devolver_da_expedicao(text, text), public.gerar_destinacoes(text),
  public.gravar_parcelas(text, jsonb)
  from public, anon, authenticated;
