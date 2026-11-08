-- Holz Trilho v2 · 0004 · Cálculos, views dos campos calculados e leitura do estado
-- O que é calculado no app (src/services/mock/consultas.ts e src/dominio/parametros.ts) tem aqui a mesma regra:
--   · funções de apoio: dias úteis com os feriados, nível dos prazos, fim da cura, volume do tamanho, chave da NF-e;
--   · views (com security_invoker: valem as políticas de quem consulta) dos campos calculados de fardo, contrato, ata,
--     local, DOF, entrega e estoque por item. As funções das operações (0005) usam as views; os testes conferem que
--     elas dão o mesmo resultado que o app;
--   · exportar_estado(): tudo o que o usuário pode ler, numa chamada só, para o app montar as telas com as mesmas
--     consultas do modo simulado.

-- ---------------------------------------------------------------------------------------------------------------
-- Datas e prazos
-- ---------------------------------------------------------------------------------------------------------------

-- Dia útil: segunda a sexta, fora os feriados dos parâmetros.
create or replace function public.dia_util(d date) returns boolean
language sql stable set search_path = public as $$
  select extract(isodow from d) < 6 and not exists (select 1 from public.feriados f where f.data = d)
$$;

-- Soma dias úteis a uma data (como somarDiasUteis).
create or replace function public.somar_dias_uteis(d date, n integer) returns date
language plpgsql stable set search_path = public as $$
declare falta integer := n;
begin
  while falta > 0 loop
    d := d + 1;
    if public.dia_util(d) then falta := falta - 1; end if;
  end loop;
  return d;
end $$;

-- Dias úteis de `de` até `ate` (negativo se `ate` vier antes), como diasUteisEntre.
create or replace function public.dias_uteis_entre(de date, ate date) returns integer
language sql stable set search_path = public as $$
  select case when ate < de then -public.dias_uteis_entre(ate, de)
    else (select count(*)::integer from generate_series(de + 1, ate, interval '1 day') g where public.dia_util(g::date)) end
$$;

-- Nível de um prazo em dias corridos (DOF): vencido, crítico, atenção ou ok.
create or replace function public.nivel_prazo(prazo date, hoje date, alertas integer[]) returns text
language sql immutable as $$
  select case when prazo - hoje < 0 then 'vencido' when prazo - hoje <= alertas[2] then 'critico'
    when prazo - hoje <= alertas[1] then 'atencao' else 'ok' end
$$;

-- Nível de um prazo em dias úteis (laudo).
create or replace function public.nivel_prazo_uteis(prazo date, hoje date, alertas integer[]) returns text
language sql stable set search_path = public as $$
  select case when hoje > prazo then 'vencido' when public.dias_uteis_entre(hoje, prazo) <= alertas[2] then 'critico'
    when public.dias_uteis_entre(hoje, prazo) <= alertas[1] then 'atencao' else 'ok' end
$$;

-- Fim da cura: CCA e CCB ficam 15 dias em cura depois do tratamento; os demais, liberados na própria data.
create or replace function public.liberacao_cura(data_tratamento date, tratamento_id text) returns date
language sql stable set search_path = public as $$
  select case when upper(trim(t.preservativo)) like 'CCA%' or upper(trim(t.preservativo)) like 'CCB%' then data_tratamento + 15 else data_tratamento end
  from public.tratamentos t where t.id = tratamento_id
$$;

-- Volume (m³) de um dormente pelas medidas em cm.
create or replace function public.volume_m3(comprimento numeric, largura numeric, altura numeric) returns numeric
language sql immutable as $$ select comprimento * largura * altura / 1000000 $$;

create or replace function public.volume_do_item(p_item_contrato_id text) returns numeric
language sql stable set search_path = public as $$
  select public.volume_m3(t.comprimento_cm, t.largura_cm, t.altura_cm)
  from public.contrato_itens i join public.tamanhos t on t.id = i.tamanho_id where i.id = p_item_contrato_id
$$;

-- Volume real do dormente (medidas da inspeção) ou, sem medidas, o do tamanho.
create or replace function public.volume_medido(d public.dormentes) returns numeric
language sql stable set search_path = public as $$
  select case when d.comprimento_cm is not null then public.volume_m3(d.comprimento_cm, d.largura_cm, d.altura_cm)
    else public.volume_do_item(d.item_contrato_id) end
$$;

-- Arredonda como o app (3 casas, metade para cima).
create or replace function public.arredondar3(v numeric) returns numeric
language sql immutable as $$ select round(v, 3) $$;

-- Número no formato brasileiro, até 3 casas (como toLocaleString('pt-BR')).
create or replace function public.num_br(v numeric) returns text
language plpgsql immutable as $$
declare s text := to_char(round(v, 3), 'FM999,999,999,990.000');
begin
  s := rtrim(rtrim(s, '0'), '.');
  return translate(s, ',.', '.,');
end $$;

-- Dígito verificador da chave de acesso da NF-e (módulo 11, pesos 2 a 9 da direita para a esquerda).
create or replace function public.digito_chave(base43 text) returns integer
language plpgsql immutable as $$
declare soma integer := 0; peso integer := 2; i integer; resto integer;
begin
  for i in reverse length(base43)..1 loop
    soma := soma + substr(base43, i, 1)::integer * peso;
    peso := case when peso = 9 then 2 else peso + 1 end;
  end loop;
  resto := soma % 11;
  return case when resto < 2 then 0 else 11 - resto end;
end $$;

create or replace function public.chave_com_digito(base43 text) returns text
language sql immutable as $$ select base43 || public.digito_chave(base43) $$;

create or replace function public.chave_valida(chave text) returns boolean
language sql immutable as $$
  select chave ~ '^\d{44}$' and public.digito_chave(left(chave, 43)) = right(chave, 1)::integer
$$;

-- Dia (São Paulo) de um instante.
create or replace function public.dia_sp(t timestamptz) returns date
language sql stable as $$ select (t at time zone 'America/Sao_Paulo')::date $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Leitura do estado: o app monta as telas a partir disto (services/supabase/), com as mesmas consultas do mock.
-- security invoker: cada tabela devolve só o que as políticas deixam o usuário ler.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.exportar_estado() returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  r jsonb := '{}';
  v jsonb;
  t text;
begin
  foreach t in array array['especies', 'tamanhos', 'tratamentos', 'empresas_inspetoras', 'locais', 'fornecedores', 'atas', 'ata_itens', 'contratos',
    'contrato_itens', 'contrato_parcelas', 'emissoes', 'nfs', 'nf_itens', 'dofs', 'dof_volumes', 'entregas', 'fardos', 'dormentes',
    'recebimentos', 'inspecoes', 'movimentacoes', 'rmes', 'rme_itens', 'rme_separacao', 'eventos', 'destinacoes', 'saldos_dof',
    'saldos_dof_itens', 'perdas', 'inventarios', 'inventario_esperados', 'inventario_leituras', 'inventario_locais',
    'inventario_diferencas', 'parametros', 'niveis_estoque', 'feriados', 'perfis'] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]'') from public.%I x', t) into v;
    r := r || jsonb_build_object(t, v);
  end loop;
  return r;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Views dos campos calculados (mesmas regras de mock/consultas.ts; conferidas nos testes contra o app)
-- ---------------------------------------------------------------------------------------------------------------

-- Fardo: saldo físico (em estoque + reservados), disponível (fora da cura), situação sempre derivada, aberto, idade.
create or replace view public.v_fardos with (security_invoker = true) as
with contagem as (
  select f.id,
    count(d.id) filter (where d.situacao = 'em_estoque')::integer as em_estoque,
    count(d.id) filter (where d.situacao = 'reservado')::integer as reservados,
    count(d.id) filter (where d.situacao = 'baixado')::integer as baixados,
    count(d.id) filter (where d.situacao = 'aguardando_inspecao' and d.inspecao_id is not null)::integer as em_inspecao,
    count(d.id) filter (where d.inspecao_id is not null)::integer as inspecionados,
    count(d.id)::integer as total
  from public.fardos f left join public.dormentes d on d.fardo_id = f.id
  group by f.id
), base as (
  select f.*, c.em_estoque, c.reservados, c.baixados, c.inspecionados, c.total, c.em_estoque + c.reservados as saldo,
    case when f.recebido_em is null then 'em_transito'
      when f.conclusao_em is null then case when c.em_inspecao > 0 then 'em_inspecao' else 'aguardando_inspecao' end
      when c.em_estoque + c.reservados = 0 then 'baixado' else 'em_estoque' end as situacao,
    public.liberacao_cura(f.data_tratamento, f.tratamento_id) as fim_cura,
    case when f.recebido_em is not null then greatest(0, public.hoje() - public.dia_sp(f.recebido_em)) end as idade_dias
  from public.fardos f join contagem c on c.id = f.id
)
select b.*,
  case when b.em_estoque > 0 and public.hoje() < b.fim_cura then b.fim_cura end as em_cura_ate,
  case when b.em_estoque > 0 and public.hoje() < b.fim_cura then 0 else b.em_estoque end as disponivel,
  b.situacao = 'em_estoque' and b.baixados > 0 as aberto,
  b.situacao = 'em_estoque' and coalesce(b.idade_dias, 0) > (select limite_dias_estoque from public.parametros where id = 1) as acima_limite_dias
from base b;

-- Item do contrato: emitidos, recebidos (sem a falta declarada), aprovados, reprovados e saldo a emitir.
create or replace view public.v_contrato_itens with (security_invoker = true) as
with c as (
  select i.id,
    count(d.id)::integer as emitidos,
    count(d.id) filter (where d.situacao <> 'emitido')::integer as chegaram,
    count(d.id) filter (where d.situacao in ('em_estoque', 'reservado', 'baixado'))::integer as aprovados,
    count(d.id) filter (where d.situacao in ('reprovado', 'retirado'))::integer as reprovados
  from public.contrato_itens i left join public.dormentes d on d.item_contrato_id = i.id
  group by i.id
)
select i.*, c.emitidos,
  greatest(0, c.chegaram - (select coalesce(sum(f.falta_declarada), 0) from public.fardos f where f.item_contrato_id = i.id))::integer as recebidos,
  c.aprovados, c.reprovados, (i.quantidade - (c.emitidos - c.reprovados))::integer as saldo_a_emitir
from public.contrato_itens i join c on c.id = i.id;

-- Contrato: fornecedor (da ata) e situação; "concluído" é calculado (PROVISÓRIO): itens cumpridos por aprovados e nada
-- pendente na entrada.
create or replace view public.v_contratos with (security_invoker = true) as
select c.*, a.fornecedor_id,
  case when c.situacao = 'cancelado' then 'cancelado'
    when exists (select 1 from public.contrato_itens i where i.contrato_id = c.id)
      and not exists (select 1 from public.v_contrato_itens i where i.contrato_id = c.id and i.aprovados < i.quantidade)
      and not exists (select 1 from public.dormentes d where d.contrato_id = c.id and d.situacao in ('emitido', 'aguardando_inspecao', 'nao_localizado'))
    then 'concluido' else 'vigente' end as situacao_calculada
from public.contratos c join public.atas a on a.id = c.ata_id;

-- Ata: contratado (contratos não cancelados) e saldo por tamanho.
create or replace view public.v_ata_itens with (security_invoker = true) as
with c as (
  select i.ata_id, i.tamanho_id, coalesce(sum(ci.quantidade) filter (where ct.situacao <> 'cancelado'), 0)::integer as contratado
  from public.ata_itens i
  left join public.contratos ct on ct.ata_id = i.ata_id
  left join public.contrato_itens ci on ci.contrato_id = ct.id and ci.tamanho_id = i.tamanho_id
  group by i.ata_id, i.tamanho_id
)
select i.*, c.contratado, i.quantidade - c.contratado as saldo
from public.ata_itens i join c on c.ata_id = i.ata_id and c.tamanho_id = i.tamanho_id;

-- Local: ocupação (dormentes nos fardos que estão nele e reprovados segregados nele) e quantos fardos.
create or replace view public.v_locais with (security_invoker = true) as
select l.*,
  (coalesce((select sum(case when f.situacao in ('aguardando_inspecao', 'em_inspecao') then f.total else f.saldo end) from public.v_fardos f
    where f.local_id = l.id and (f.saldo > 0 or f.situacao in ('aguardando_inspecao', 'em_inspecao'))), 0)
    + (select count(*) from public.dormentes d where d.situacao = 'reprovado' and d.local_id = l.id))::integer as ocupacao,
  (select count(*) from public.v_fardos f where f.local_id = l.id and (f.saldo > 0 or f.situacao in ('aguardando_inspecao', 'em_inspecao')))::integer as fardos
from public.locais l;

-- DOF: prazo de declaração no Sinaflor (dia seguinte à validade), nível e se já pode ser declarada.
create or replace view public.v_dofs with (security_invoker = true) as
select d.*, d.validade + 1 as prazo_declaracao, (d.validade + 1) - public.hoje() as dias_para_prazo,
  case when d.declarado_em is not null then 'ok' else public.nivel_prazo(d.validade + 1, public.hoje(), (select alerta_dof_dias from public.parametros where id = 1)) end as nivel_prazo,
  case when d.declarado_em is not null then 'declarado' else 'a_declarar' end as situacao_declaracao,
  d.declarado_em is null and exists (select 1 from public.nfs n join public.entregas e on e.id = n.entrega_id where n.id = d.nf_id and e.situacao <> 'a_caminho') as pode_declarar
from public.dofs d;

-- Entrega: data da entrega (primeiro recebimento), prazo do laudo (20 dias úteis), etapa e se o laudo pode sair.
create or replace view public.v_entregas with (security_invoker = true) as
with base as (
  select e.*,
    (select min(r.recebido_em) from public.recebimentos r where r.entrega_id = e.id) as recebida_em,
    e.situacao = 'recebida' and not exists (select 1 from public.fardos f where f.id = any(e.fardos_ids) and f.conclusao_em is null) as inspecionada
  from public.entregas e
)
select b.*,
  case when b.recebida_em is not null then public.somar_dias_uteis(public.dia_sp(b.recebida_em), 20) end as prazo_laudo,
  b.inspecionada and b.laudo is null as pode_emitir_laudo,
  case when b.situacao <> 'recebida' then 'a_caminho' when not b.inspecionada then 'aguardando_inspecao'
    when b.laudo is not null then 'concluida' else 'aguardando_laudo' end as etapa
from base b;

-- Estoque por item (classe + tamanho): em estoque, em cura, aguardando inspeção, reservado e não localizado contra o
-- mínimo e o máximo (o nível compara o disponível somado ao que está em cura). Sem nível definido, "ok".
create or replace view public.v_estoque_por_item with (security_invoker = true) as
with ds as (
  select d.classe, i.tamanho_id, d.situacao,
    d.situacao = 'em_estoque' and public.hoje() < public.liberacao_cura(d.data_tratamento, d.tratamento_id) as em_cura,
    public.liberacao_cura(d.data_tratamento, d.tratamento_id) as fim_cura
  from public.dormentes d join public.contrato_itens i on i.id = d.item_contrato_id
), itens as (
  select classe, tamanho_id from public.niveis_estoque union select classe, tamanho_id from ds
), contagem as (
  select it.classe, it.tamanho_id,
    count(d.situacao) filter (where d.situacao = 'em_estoque' and not d.em_cura)::integer as em_estoque,
    count(d.situacao) filter (where d.em_cura)::integer as em_cura,
    min(d.fim_cura) filter (where d.em_cura) as liberacao_cura,
    count(d.situacao) filter (where d.situacao = 'aguardando_inspecao')::integer as aguardando_inspecao,
    count(d.situacao) filter (where d.situacao = 'reservado')::integer as reservado,
    count(d.situacao) filter (where d.situacao = 'nao_localizado')::integer as nao_localizado
  from itens it left join ds d on d.classe = it.classe and d.tamanho_id = it.tamanho_id
  group by it.classe, it.tamanho_id
)
select c.*, t.uso, coalesce(n.minimo, 0) as minimo, coalesce(n.maximo, 0) as maximo,
  case when n.classe is null then 'ok' when c.em_estoque + c.em_cura < n.minimo then 'falta' when c.em_estoque + c.em_cura > n.maximo then 'excesso' else 'ok' end as situacao
from contagem c join public.tamanhos t on t.id = c.tamanho_id
left join public.niveis_estoque n on n.classe = c.classe and n.tamanho_id = c.tamanho_id;
