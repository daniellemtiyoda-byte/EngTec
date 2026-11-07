-- =============================================================================
-- Holz Trilho — Migração 3/4: leitura no formato de src/types/models.ts
--
-- Cada view devolve as linhas já com os nomes de campo do modelo (camelCase),
-- então o front lista com GET /rest/v1/v_<nome>?campo=eq.valor&order=... sem
-- conversão. A coluna `busca` (texto em minúsculas) atende à busca das listas.
-- Campos calculados (situação, idade, etapa, prazo...) saem daqui, com os
-- parâmetros vigentes, pela mesma regra do mock (services/mock).
-- security_invoker: a RLS de quem consulta continua valendo.
-- =============================================================================

create or replace function idade_dias(p timestamptz) returns int
language sql stable as $$ select hoje() - (p at time zone 'America/Sao_Paulo')::date $$;

-- Nível do prazo de declaração do DOF: vencido ou até N dias = crítico; até M dias = atenção
create or replace function nivel_prazo(p_prazo date) returns text
language sql stable as $$
  select case when p_prazo - hoje() <= param('dof_alerta_critico_dias') then 'critico'
              when p_prazo - hoje() <= param('dof_alerta_atencao_dias') then 'atencao'
              else 'no_prazo' end
$$;

create or replace function rotulo_grupo(r resultado_peca, c smallint) returns text
language sql immutable as $$
  select case r when 'aprovado' then 'Aprovado' || coalesce(' · Categoria ' || c, '') when 'quarentena' then 'Quarentena' else 'Reprovado' end
$$;

-- ---------------------------------------------------------------------------
-- Cadastros
-- ---------------------------------------------------------------------------
create view v_fornecedores with (security_invoker = true) as
select f.id, f.razao_social as "razaoSocial",
       regexp_replace(f.cnpj, '^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$', '\1.\2.\3/\4-\5') as cnpj,
       f.cidade_uf as "cidadeUf",
       (select count(*) from notas_fiscais n where n.fornecedor_id = f.id)::int as "documentosVigentes",
       f.status,
       lower(concat_ws(' ', f.razao_social, f.cnpj, f.cidade_uf)) as busca
  from fornecedores f;

create view v_especies with (security_invoker = true) as
select e.id, e.numero, e.nome_cientifico as "nomeCientifico", e.observacao, e.classe, e.uso,
       (select count(*) from lotes l where l.especie_id = e.id
           and exists (select 1 from dormentes d where d.lote_id = l.id and d.estado <> 'baixado'))::int as "lotesAtivos",
       lower(concat_ws(' ', e.numero, e.nome_cientifico, e.observacao, e.classe, e.uso)) as busca
  from especies e;

create view v_tamanhos with (security_invoker = true) as
select t.id, t.codigo, t.largura_cm as "larguraCm", t.altura_cm as "alturaCm", t.comprimento_cm as "comprimentoCm",
       t.volume_m3 as "volumeM3", t.medidas, lower(t.codigo) as busca
  from tamanhos t;

create view v_usuarios with (security_invoker = true) as
select p.id, p.nome, p.email, p.ativo, p.ultimo_acesso as "ultimoAcesso",
       coalesce((select string_agg(pa.nome, ', ' order by pa.nome) from usuario_papeis up join papeis pa on pa.codigo = up.papel
                  where up.usuario_id = p.id), 'Sem papel') as perfil,
       coalesce((select jsonb_agg(distinct pp.permissao) from usuario_papeis up join papel_permissoes pp on pp.papel = up.papel
                  where up.usuario_id = p.id), '[]') as permissoes,
       lower(concat_ws(' ', p.nome, p.email)) as busca
  from perfis p;

-- ---------------------------------------------------------------------------
-- NF e DOF (NotaFiscal) e recebimentos (Recebimento)
-- ---------------------------------------------------------------------------
create view v_notas with (security_invoker = true) as
select n.id, n.numero, n.serie, n.chave_acesso as "chaveAcesso", n.fornecedor_id as "fornecedorId", f.razao_social as fornecedor,
       n.emissao, n.origem, n.xml_arquivo_id is not null as "xmlAnexado", n.dof_sugerido as "dofSugerido",
       it.itens, it.total as "quantidadeTotal",
       case when d.id is not null then jsonb_strip_nulls(jsonb_build_object(
         'numero', d.numero, 'codigoControle', d.codigo_controle, 'validade', d.validade, 'volumes', vol.volumes,
         'volumeTotalM3', vol.total, 'arquivoPdf', a.nome_original,
         'declaracao', case when d.declarado_em is null then 'pendente' else 'declarado' end,
         'prazoDeclaracao', d.prazo_declaracao, 'declaradoPor', nome_de(d.declarado_por), 'declaradoEm', d.declarado_em)) end as dof,
       s.situacao, e.etapa, e.etapa <> 'concluida' as "emAndamento",
       case when e.etapa = 'declarar' then d.prazo_declaracao - hoje() end as "diasParaPrazo",
       case when e.etapa = 'declarar' then nivel_prazo(d.prazo_declaracao) end as "nivelPrazo",
       lower(concat_ws(' ', n.numero, n.chave_acesso, f.razao_social, d.numero, d.codigo_controle)) as busca
  from notas_fiscais n
  join fornecedores f on f.id = n.fornecedor_id
  left join dofs d     on d.nf_id = n.id
  left join arquivos a on a.id = d.pdf_arquivo_id
  cross join lateral (
    select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'descricao', i.descricao, 'especieId', i.especie_id,
             'especie', es.nome_cientifico, 'tamanhoId', i.tamanho_id, 'tamanho', t.codigo, 'quantidade', i.quantidade)
             order by i.ordem), '[]') as itens,
           coalesce(sum(i.quantidade), 0)::int as total
      from nf_itens i join especies es on es.id = i.especie_id join tamanhos t on t.id = i.tamanho_id where i.nf_id = n.id) it
  left join lateral (
    select jsonb_agg(jsonb_build_object('especieId', v.especie_id, 'especie', es.nome_cientifico, 'volumeM3', v.volume_m3)
             order by es.nome_cientifico) as volumes, sum(v.volume_m3) as total
      from dof_volumes v join especies es on es.id = v.especie_id where v.dof_id = d.id) vol on true
  cross join lateral (
    select case when exists (select 1 from recebimentos r where r.nf_id = n.id) then 'recebida'
                when d.id is not null then 'aguardando_recebimento' else 'aguardando_dof' end as situacao) s
  cross join lateral (
    select case when s.situacao <> 'recebida' then s.situacao
                when d.declarado_em is not null then 'concluida' else 'declarar' end as etapa) e;

create view v_recebimentos with (security_invoker = true) as
select r.id, r.nf_id as "nfId", n.numero as "nfNumero", d.numero as "dofNumero", f.razao_social as fornecedor,
       r.recebido_em as "recebidoEm",
       q.doc as "quantidadeDocumental", q.conf as "quantidadeConferida", q.conf - q.doc as divergencia,
       r.divergencia_quantidade as "divergenciaQuantidade",
       (select coalesce(jsonb_agg(jsonb_build_object('especie', es.nome_cientifico, 'volumeDofM3', v.volume_dof_m3,
                 'volumeRecebidoM3', v.volume_recebido_m3, 'diferencaPct', v.diferenca_pct) order by es.nome_cientifico), '[]')
          from recebimento_volumes v join especies es on es.id = v.especie_id where v.recebimento_id = r.id) as volumes,
       r.divergencia_volume_pct as "divergenciaVolumePct", r.acima_tolerancia as "acimaTolerancia", r.avaria,
       (select count(*) from recebimento_fotos x where x.recebimento_id = r.id)::int as fotos,
       r.justificativa, r.observacao,
       (select coalesce(jsonb_agg(l.codigo order by l.codigo), '[]') from lotes l where l.recebimento_id = r.id) as lotes,
       nome_de(r.recebido_por) as conferente,
       lower(concat_ws(' ', n.numero, d.numero, f.razao_social)) as busca
  from recebimentos r
  join notas_fiscais n on n.id = r.nf_id
  join fornecedores f  on f.id = n.fornecedor_id
  join dofs d          on d.nf_id = n.id
  cross join lateral (
    select coalesce(sum(i.quantidade), 0)::int as doc,
           coalesce((select sum(ri.quantidade) from recebimento_itens ri where ri.recebimento_id = r.id), 0)::int as conf
      from nf_itens i where i.nf_id = n.id) q;

-- ---------------------------------------------------------------------------
-- Lotes (Lote), saldo (SaldoEstoque), fardos (FardoEstoque), dormentes e inspeções
-- ---------------------------------------------------------------------------
create view v_lotes with (security_invoker = true) as
select l.id, l.codigo, f.razao_social as fornecedor, n.numero as "nfNumero", d.numero as "dofNumero",
       es.nome_cientifico as "especieDocumental", es.classe,
       ff.categoria,
       case when l.etapa_inspecao <> 'concluida' then 'aguardando' when ff.tem_liberado then 'aprovado'
            when ff.tem_quarentena then 'quarentena' else 'reprovado' end as inspecao,
       l.etapa_inspecao as "etapaInspecao",
       dd.inspecionadas as "pecasInspecionadas", dd.sem_fardo as "unidadesSemFardo",
       l.inspecao_concluida_em as "inspecaoConcluidaEm", nome_de(l.inspecao_concluida_por) as "inspecaoConcluidaPor",
       t.codigo as tamanho, l.quantidade, dd.saldo, ff.n as fardos,
       t.comprimento_cm / 100 as "comprimentoM", t.largura_cm / 100 as "larguraM", t.altura_cm / 100 as "alturaM",
       l.quantidade * t.comprimento_cm / 100 as "metrosLineares",
       l.volume_documental_m3 as "volumeDocumentalM3", l.volume_calculado_m3 as "volumeCalculadoM3",
       l.recebido_em as "recebidoEm", idade_dias(l.recebido_em) as "idadeDias",
       dd.saldo > 0 and idade_dias(l.recebido_em) > param('limite_dias_estoque') as "acimaLimiteIdade",
       case when dd.saldo <= 0 then 'sem_saldo' when l.divergente then 'divergente'
            when l.etapa_inspecao <> 'concluida' then 'aguardando_inspecao' when ff.liberado_com_saldo then 'disponivel'
            when ff.quarentena_com_saldo then 'quarentena' when ff.reprovado_com_saldo then 'reprovado' else 'bloqueado' end as situacao,
       case when l.divergente or l.etapa_inspecao <> 'concluida' then 'pendente' when ff.tem_liberado then 'aprovado'
            else 'bloqueado' end as status,
       case when l.divergente then 'divergente' when l.etapa_inspecao <> 'concluida' then 'em_analise'
            when ff.tem_liberado then 'disponivel' else 'bloqueado' end as "estoqueStatus",
       l.local,
       lower(concat_ws(' ', l.codigo, f.razao_social, n.numero, d.numero, es.nome_cientifico, t.codigo, l.local)) as busca
  from lotes l
  join especies es      on es.id = l.especie_id
  join tamanhos t       on t.id = l.tamanho_id
  join notas_fiscais n  on n.id = l.nf_id
  join fornecedores f   on f.id = n.fornecedor_id
  left join dofs d      on d.nf_id = n.id
  cross join lateral (
    select count(*) filter (where x.inspecao_vigente_id is not null)::int as inspecionadas,
           count(*) filter (where x.estado = 'sem_fardo')::int as sem_fardo,
           count(*) filter (where x.estado <> 'baixado')::int as saldo
      from dormentes x where x.lote_id = l.id) dd
  cross join lateral (
    select count(*)::int as n,
           coalesce(bool_or(fardo_liberado(fd)), false) as tem_liberado,
           coalesce(bool_or(fd.resultado = 'quarentena'), false) as tem_quarentena,
           coalesce(bool_or(fardo_liberado(fd) and fd.saldo > 0), false) as liberado_com_saldo,
           coalesce(bool_or(fd.resultado = 'quarentena' and fd.saldo > 0), false) as quarentena_com_saldo,
           coalesce(bool_or(fd.resultado = 'reprovado' and fd.saldo > 0), false) as reprovado_com_saldo,
           (select f2.categoria from fardos f2 where f2.lote_id = l.id and fardo_liberado(f2) and f2.categoria is not null
             group by f2.categoria order by sum(f2.quantidade_inicial) desc, f2.categoria limit 1) as categoria
      from fardos fd where fd.lote_id = l.id) ff;

create view v_saldos with (security_invoker = true) as
select l.id, l.codigo as "loteCodigo", es.nome_cientifico as "especieDocumental", es.classe, vl.categoria,
       case when l.divergente then 0 else s.liberado end as disponivel,
       case when l.divergente then 0 else s.segregado end as bloqueado,
       case when l.divergente then 0 else s.sem_fardo end as "emAnalise",
       case when l.divergente then s.saldo else 0 end as divergente,
       s.saldo * t.comprimento_cm / 100 as "metrosLineares", s.saldo * t.volume_m3 as "volumeM3",
       l.local, vl."idadeDias", vl."acimaLimiteIdade",
       lower(concat_ws(' ', l.codigo, es.nome_cientifico, l.local)) as busca
  from lotes l
  join especies es on es.id = l.especie_id
  join tamanhos t  on t.id = l.tamanho_id
  join v_lotes vl  on vl.id = l.id
  cross join lateral (
    select count(*) filter (where x.estado <> 'baixado')::int as saldo,
           count(*) filter (where x.estado = 'sem_fardo')::int as sem_fardo,
           count(*) filter (where x.estado = 'em_estoque' and fardo_liberado(fd))::int as liberado,
           count(*) filter (where x.estado = 'em_estoque' and not fardo_liberado(fd))::int as segregado
      from dormentes x left join fardos fd on fd.id = x.fardo_id where x.lote_id = l.id) s;

create view v_fardos with (security_invoker = true) as
select fd.id, fd.codigo, l.codigo as "loteCodigo", fd.sequencia, fd.quantidade_inicial as "quantidadeInicial", fd.saldo,
       fd.estado, fd.local, fd.resultado, fd.categoria, fd.motivo_bloqueio as "motivoBloqueio",
       fd.formado_em as "formadoEm", coalesce(nome_de(fd.formado_por), '—') as "formadoPor",
       es.nome_cientifico as "especieDocumental", es.classe, t.codigo as tamanho, n.numero as "nfNumero",
       f.razao_social as fornecedor, l.recebido_em as "recebidoEm", idade_dias(l.recebido_em) as "idadeDias",
       fd.saldo > 0 and idade_dias(l.recebido_em) > param('limite_dias_estoque') as "acimaLimiteIdade",
       case when fd.saldo <= 0 then 'sem_saldo' when l.divergente then 'divergente' when fd.motivo_bloqueio is not null then 'bloqueado'
            when fd.resultado in ('quarentena', 'reprovado') then fd.resultado::text else 'disponivel' end as situacao,
       fd.saldo > 0 as "emEstoque", fd.saldo * t.volume_m3 as "volumeM3",
       lower(concat_ws(' ', fd.codigo, l.codigo, es.nome_cientifico, t.codigo, n.numero, fd.local)) as busca
  from fardos fd
  join lotes l          on l.id = fd.lote_id
  join especies es      on es.id = l.especie_id
  join tamanhos t       on t.id = l.tamanho_id
  join notas_fiscais n  on n.id = l.nf_id
  join fornecedores f   on f.id = n.fornecedor_id;

-- Dormente: o rastreio começa na formação dos fardos (os sem fardo ainda são só peças do lote)
create view v_dormentes with (security_invoker = true) as
select d.id, d.codigo, l.codigo as "loteCodigo", d.sequencia, fd.codigo as "fardoCodigo", i.resultado, i.categoria, d.estado,
       case when d.estado = 'baixado' then jsonb_strip_nulls(jsonb_build_object('tipo', d.baixa_tipo, 'referencia', d.baixa_referencia,
              'quando', d.baixa_em, 'usuario', nome_de(d.baixa_por))) end as baixa,
       lower(concat_ws(' ', d.codigo, fd.codigo)) as busca
  from dormentes d
  join lotes l       on l.id = d.lote_id
  join fardos fd     on fd.id = d.fardo_id
  left join inspecoes i on i.id = d.inspecao_vigente_id;

create view v_inspecoes with (security_invoker = true) as
select i.id, d.codigo as "codigoPeca", l.codigo as "loteCodigo", d.sequencia, i.resultado, i.veredito, i.indice, i.categoria,
       i.inspetor, i.estacao, i.inspecionado_em as "inspecionadoEm", i.relatorio_url as "relatorioUrl",
       d.inspecao_vigente_id = i.id as vigente, i.origem,
       lower(concat_ws(' ', d.codigo, i.inspetor, i.estacao)) as busca
  from inspecoes i
  join dormentes d on d.id = i.dormente_id
  join lotes l     on l.id = d.lote_id;

create view v_volumetria with (security_invoker = true) as
select l.id, l.codigo as "loteCodigo", l.volume_documental_m3 as "volumeDocumentalM3", l.volume_calculado_m3 as "volumeCalculadoM3",
       l.volume_documental_m3 - l.volume_calculado_m3 as "diferencaM3",
       case when l.volume_calculado_m3 > 0 then round((l.volume_documental_m3 - l.volume_calculado_m3) / l.volume_calculado_m3 * 100, 2) else 0 end as "diferencaPct",
       case when l.divergente then 'divergente' else 'conforme' end as situacao,
       lower(l.codigo) as busca
  from lotes l;

-- ---------------------------------------------------------------------------
-- Movimentações, RME
-- ---------------------------------------------------------------------------
create view v_movimentacoes with (security_invoker = true) as
select m.id, m.tipo, l.codigo as "loteCodigo", fd.codigo as "fardoCodigo", es.nome_cientifico as especie, m.referencia,
       m.quantidade, m.origem, m.destino, m.data_hora as "dataHora", coalesce(nome_de(m.usuario_id), '—') as usuario, m.status,
       m.motivo_perda as "motivoPerda", m.motivo, nome_de(m.decidido_por) as "decididoPor", m.decidido_em as "decididoEm",
       m.motivo_rejeicao as "motivoRejeicao",
       (select jsonb_agg(d.codigo order by d.codigo) from movimentacao_dormentes md join dormentes d on d.id = md.dormente_id
         where md.movimentacao_id = m.id) as dormentes,
       lower(concat_ws(' ', l.codigo, fd.codigo, es.nome_cientifico, m.referencia, m.origem, m.destino, nome_de(m.usuario_id))) as busca
  from movimentacoes m
  join lotes l        on l.id = m.lote_id
  join especies es    on es.id = l.especie_id
  left join fardos fd on fd.id = m.fardo_id;

create view v_rmes with (security_invoker = true) as
select r.id, r.numero, nome_de(r.requisitante_id) as requisitante, r.destinatario, r.urgencia, r.data_limite as "dataLimite",
       r.observacao, r.aberta_em as "abertaEm", r.status,
       (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'especieId', i.especie_id, 'especie', es.nome_cientifico,
                 'tamanhoId', i.tamanho_id, 'tamanho', t.codigo, 'quantidade', i.quantidade, 'quantidadeEntregue', i.quantidade_entregue)
                 order by i.ordem), '[]')
          from rme_itens i join especies es on es.id = i.especie_id join tamanhos t on t.id = i.tamanho_id where i.rme_id = r.id) as itens,
       (select jsonb_strip_nulls(jsonb_build_object(
                 'itens', (select coalesce(jsonb_agg(jsonb_build_object('itemId', si.item_id, 'fardoCodigo', fd.codigo,
                             'loteCodigo', l.codigo, 'quantidade', si.quantidade, 'dormentes', to_jsonb(si.dormentes),
                             'saldoFardo', si.saldo_fardo) order by fd.codigo), '[]')
                             from rme_separacao_itens si join fardos fd on fd.id = si.fardo_id join lotes l on l.id = fd.lote_id
                            where si.separacao_id = s.id),
                 'seguiuSugestao', s.seguiu_sugestao, 'justificativa', s.justificativa,
                 'almoxarife', nome_de(s.almoxarife_id), 'separadaEm', s.separada_em))
          from rme_separacoes s where s.rme_id = r.id and s.ativa) as separacao,
       nome_de(r.supervisor_id) as supervisor, r.conferida_em as "conferidaEm",
       nome_de(r.entregue_por) as "entreguePor", r.entregue_em as "entregueEm", r.motivo_cancelamento as "motivoCancelamento",
       (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('quando', e.quando, 'usuario', coalesce(nome_de(e.usuario_id), '—'),
                 'acao', e.acao, 'detalhe', e.detalhe)) order by e.quando, e.id), '[]')
          from rme_eventos e where e.rme_id = r.id) as historico,
       r.status in ('aberta', 'em_separacao', 'conferida') as "emAndamento",
       lower(concat_ws(' ', r.numero, r.destinatario, nome_de(r.requisitante_id))) as busca
  from rmes r;

-- ---------------------------------------------------------------------------
-- Inventário, visão computacional, pátio, relatórios, auditoria, documentos
-- ---------------------------------------------------------------------------
create view v_sessoes_inventario with (security_invoker = true) as
select s.id, s.descricao, s.local, s.aberta_em as "abertaEm", s.estado,
       (select count(*) from inventario_contagens c where c.sessao_id = s.id)::int as "itensContados",
       (select count(*) from inventario_contagens c where c.sessao_id = s.id and c.contagem <> c.saldo_sistema)::int as divergencias,
       s.ajuste, lower(concat_ws(' ', s.descricao, s.local)) as busca
  from sessoes_inventario s;

create view v_divergencias_inventario with (security_invoker = true) as
select c.id, c.sessao_id as "sessaoId", l.codigo as "loteCodigo", c.saldo_sistema as "saldoSistema", c.contagem,
       c.contagem - c.saldo_sistema as diferenca, lower(l.codigo) as busca
  from inventario_contagens c join lotes l on l.id = c.lote_id;

create view v_processamentos with (security_invoker = true) as
select p.id, a.nome_original as arquivo, p.enviado_em as "enviadoEm", p.estado, p.contagem_estimada as "contagemEstimada",
       p.confianca, p.revisao, lower(a.nome_original) as busca
  from processamentos_imagem p join arquivos a on a.id = p.arquivo_id;

create view v_locais_patio with (security_invoker = true) as
select lp.id, lp.codigo, lp.descricao, lp.capacidade,
       (select coalesce(sum(fd.saldo), 0) from fardos fd where fd.local = lp.codigo)::int as ocupacao,
       lp.status, lower(concat_ws(' ', lp.codigo, lp.descricao)) as busca
  from locais_patio lp;

create view v_transferencias with (security_invoker = true) as
select m.id, l.codigo as "loteCodigo", m.quantidade, m.origem as de, m.destino as para, m.data_hora as "dataHora", m.status,
       lower(concat_ws(' ', l.codigo, m.origem, m.destino)) as busca
  from movimentacoes m join lotes l on l.id = m.lote_id where m.tipo = 'transferencia';

create view v_relatorios with (security_invoker = true) as
select * from (values
  ('rel1', 'Posição de estoque', 'Saldos por lote, classe e categoria', '["csv","xlsx","pdf"]'::jsonb, 'posicao estoque'),
  ('rel2', 'Divergências de recebimento', 'NF e DOF x conferência', '["csv","pdf"]'::jsonb, 'divergencias recebimento'),
  ('rel3', 'Controle volumétrico', 'Volume documental x calculado', '["xlsx","pdf"]'::jsonb, 'controle volumetrico'),
  ('rel4', 'Movimentações do período', 'Entradas, saídas e transferências', '["csv","xlsx"]'::jsonb, 'movimentacoes periodo')
) as x(id, nome, descricao, formatos, busca);

create view v_auditoria with (security_invoker = true) as
select a.id::text as id, a.em as "dataHora", coalesce(nome_de(a.usuario_id), 'Sistema') as usuario,
       case a.acao when 'INSERT' then 'Cadastro' when 'UPDATE' then 'Alteração' else 'Exclusão' end as acao,
       a.tabela as entidade, coalesce(a.registro_id, '') as detalhe,
       lower(concat_ws(' ', a.tabela, a.registro_id, nome_de(a.usuario_id))) as busca
  from auditoria a;

create view v_documentos with (security_invoker = true) as
select 'nf-' || n.id as id, 'NF-e' as tipo, n.numero, n.fornecedor, n.emissao::text as emissao, n."quantidadeTotal" as quantidade,
       coalesce((n.dof->>'volumeTotalM3')::numeric, 0) as "volumeDocumentalM3",
       case when n.situacao = 'recebida' then 'aprovado' else 'pendente' end as status, n.busca
  from v_notas n
union all
select 'dof-' || n.id, 'DOF', n.dof->>'numero', n.fornecedor, n.dof->>'validade', n."quantidadeTotal",
       (n.dof->>'volumeTotalM3')::numeric,
       case when n.dof->>'declaracao' = 'declarado' then 'aprovado' else 'pendente' end, n.busca
  from v_notas n where n.dof is not null;

-- =============================================================================
-- Detalhes (LoteDetalhe, FardoDetalhe), relatórios e Painel
-- =============================================================================

-- Movimentação como evento da linha do tempo (EventoLote)
create or replace function evento_movimentacao(m v_movimentacoes) returns jsonb
language sql stable as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'quando', m."dataHora", 'tipo', m.tipo, 'usuario', m.usuario, 'referencia', m.referencia, 'status', m.status,
    'titulo', case m.tipo when 'entrada' then 'Entrada no estoque' when 'saida' then 'Saída por RME' when 'transferencia' then 'Transferência'
                          when 'perda' then 'Perda' else 'Ajuste de saldo' end || coalesce(' · ' || m."fardoCodigo", ''),
    'detalhe', case when m.tipo = 'ajuste' and m.quantidade > 0 then '+' else '' end || m.quantidade || ' un. · ' || m.origem || ' → ' || m.destino
               || coalesce(' · ' || m.motivo, '')
               || coalesce(' · dormentes ' || (select string_agg(right(x, 4), ', ') from jsonb_array_elements_text(m.dormentes) x), '')))
$$;

create or replace function lote_obter(p_codigo text) returns jsonb
language plpgsql stable set search_path = public as $$
declare v_lote jsonb; v_nf jsonb; v_rec jsonb; v_fardos jsonb; v_res text; v_id uuid;
begin
  select to_jsonb(l) - 'busca', l.id into v_lote, v_id from v_lotes l where lower(l.codigo) = lower(trim(p_codigo));
  if v_lote is null then perform falha(404, format('Lote %s não encontrado.', p_codigo)); end if;
  select to_jsonb(n) - 'busca' into v_nf from v_notas n where n.id = (select nf_id from lotes where id = v_id);
  select to_jsonb(r) - 'busca' into v_rec from v_recebimentos r where r.id = (select recebimento_id from lotes where id = v_id);
  select coalesce(jsonb_agg(to_jsonb(f) - 'busca' order by f.sequencia), '[]') into v_fardos from v_fardos f where f."loteCodigo" = v_lote->>'codigo';
  select string_agg(g || ': ' || n || ' fardo(s), ' || q || ' un.', ' · ' order by o) into v_res
    from (select rotulo_grupo(fd.resultado, fd.categoria) || case when fd.motivo_bloqueio is not null then ' (divergente)' else '' end as g,
                 count(*) as n, sum(fd.quantidade_inicial) as q, min(fd.sequencia) as o
            from fardos fd where fd.lote_id = v_id group by 1) x;

  return jsonb_build_object(
    'lote', v_lote, 'fardos', v_fardos, 'nf', v_nf, 'recebimento', v_rec,
    'inspecoes', (select coalesce(jsonb_agg(to_jsonb(i) - 'busca' order by i.vigente desc, i.sequencia, i."inspecionadoEm" desc), '[]')
                    from v_inspecoes i where i."loteCodigo" = v_lote->>'codigo'),
    'dormentes', (select coalesce(jsonb_agg(to_jsonb(d) - 'busca' order by d.sequencia), '[]') from v_dormentes d where d."loteCodigo" = v_lote->>'codigo'),
    'historico', (select coalesce(jsonb_agg(e order by e->>'quando'), '[]') from (
        select jsonb_strip_nulls(jsonb_build_object('quando', (v_nf->>'emissao') || 'T12:00:00-03:00', 'tipo', 'nf',
                 'titulo', 'NF ' || (v_nf->>'numero') || ' emitida', 'referencia', 'NF ' || (v_nf->>'numero'),
                 'detalhe', (v_nf->>'fornecedor') || ' · ' || case when v_nf->>'origem' = 'xml' then 'importada do XML' else 'cadastro manual' end)) as e
        union all
        select jsonb_strip_nulls(jsonb_build_object('quando', v_rec->>'recebidoEm', 'tipo', 'recebimento', 'titulo', 'Recebimento conferido',
                 'usuario', v_rec->>'conferente', 'referencia', 'NF ' || (v_rec->>'nfNumero'),
                 'detalhe', 'Lote criado com ' || (v_lote->>'quantidade') || ' dormentes, aguardando inspeção.'
                            || case when (v_rec->>'acimaTolerancia')::boolean then ' Divergência de volume acima da tolerância.' else '' end))
         where v_rec is not null
        union all
        select jsonb_strip_nulls(jsonb_build_object('quando', v_lote->>'inspecaoConcluidaEm', 'tipo', 'inspecao',
                 'titulo', 'Inspeção concluída: ' || jsonb_array_length(v_fardos) || ' fardo(s) formado(s)',
                 'usuario', v_lote->>'inspecaoConcluidaPor', 'detalhe', v_res))
         where v_lote->>'inspecaoConcluidaEm' is not null
        union all
        select jsonb_strip_nulls(jsonb_build_object('quando', v_nf->'dof'->>'declaradoEm', 'tipo', 'declaracao',
                 'titulo', 'DOF ' || (v_nf->'dof'->>'numero') || ' declarado no Sinaflor', 'usuario', v_nf->'dof'->>'declaradoPor'))
         where v_nf->'dof'->>'declaradoEm' is not null
        union all
        select evento_movimentacao(m) from v_movimentacoes m where m."loteCodigo" = v_lote->>'codigo' and m.tipo <> 'entrada'
      ) h));
end $$;

create or replace function fardo_obter(p_codigo text) returns jsonb
language plpgsql stable set search_path = public as $$
declare v_f jsonb; v_lote jsonb;
begin
  select to_jsonb(f) - 'busca' into v_f from v_fardos f where lower(f.codigo) = lower(trim(p_codigo));
  if v_f is null then perform falha(404, format('Fardo %s não encontrado.', p_codigo)); end if;
  select to_jsonb(l) - 'busca' into v_lote from v_lotes l where l.codigo = v_f->>'loteCodigo';
  return jsonb_build_object(
    'fardo', v_f, 'lote', v_lote,
    'dormentes', (select coalesce(jsonb_agg(to_jsonb(d) - 'busca' order by d.sequencia), '[]') from v_dormentes d where d."fardoCodigo" = v_f->>'codigo'),
    'inspecoes', (select coalesce(jsonb_agg(to_jsonb(i) - 'busca' order by i.sequencia), '[]') from v_inspecoes i
                   where i.vigente and i."codigoPeca" in (select codigo from v_dormentes where "fardoCodigo" = v_f->>'codigo')),
    'historico', (select coalesce(jsonb_agg(e order by e->>'quando'), '[]') from (
        select jsonb_strip_nulls(jsonb_build_object('quando', v_f->>'formadoEm', 'tipo', 'inspecao',
                 'titulo', 'Fardo formado com ' || (v_f->>'quantidadeInicial') || ' dormente(s)', 'usuario', v_f->>'formadoPor',
                 'detalhe', rotulo_grupo((v_f->>'resultado')::resultado_peca, (v_f->>'categoria')::smallint) || ' · ' || (v_f->>'local')
                            || coalesce(' · ' || (v_f->>'motivoBloqueio'), ''))) as e
        union all
        select evento_movimentacao(m) from v_movimentacoes m where m."fardoCodigo" = v_f->>'codigo'
      ) h));
end $$;

-- DofPendente[]: DOFs de NFs recebidas ainda não declarados, prazo mais próximo primeiro
create or replace function rel_dofs_pendentes() returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'diasParaPrazo')::int), '[]') from (
    select jsonb_build_object('id', n.id, 'nfId', n.id, 'nfNumero', n.numero, 'fornecedor', n.fornecedor,
             'dofNumero', n.dof->>'numero', 'codigoControle', n.dof->>'codigoControle', 'validade', n.dof->>'validade',
             'prazoDeclaracao', n.dof->>'prazoDeclaracao',
             'recebidoEm', (select r."recebidoEm" from v_recebimentos r where r."nfId" = n.id),
             'diasParaPrazo', (n.dof->>'prazoDeclaracao')::date - hoje(),
             'nivel', nivel_prazo((n.dof->>'prazoDeclaracao')::date)) as x
      from v_notas n where n.etapa = 'declarar') s
$$;

-- LinhaSaldoIbama[]: saldo físico em m³ por espécie e dimensão
create or replace function rel_saldo_ibama() returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(x order by x->>'especie', x->>'tamanho'), '[]') from (
    select jsonb_build_object('id', es.nome_cientifico || '|' || t.codigo, 'especie', es.nome_cientifico, 'tamanho', t.codigo,
             'larguraCm', t.largura_cm, 'alturaCm', t.altura_cm, 'comprimentoCm', t.comprimento_cm,
             'lotes', count(*), 'quantidade', sum(s.disponivel + s.bloqueado + s."emAnalise" + s.divergente),
             'volumeM3', sum(s."volumeM3"),
             'disponivelM3', sum(s.disponivel) * t.volume_m3, 'emAnaliseM3', sum(s."emAnalise") * t.volume_m3,
             'bloqueadoM3', sum(s.bloqueado) * t.volume_m3, 'divergenteM3', sum(s.divergente) * t.volume_m3) as x
      from v_saldos s join lotes l on l.id = s.id join especies es on es.id = l.especie_id join tamanhos t on t.id = l.tamanho_id
     where s.disponivel + s.bloqueado + s."emAnalise" + s.divergente > 0
     group by es.nome_cientifico, t.codigo, t.largura_cm, t.altura_cm, t.comprimento_cm, t.volume_m3) g
$$;

-- RelatorioMovimentacoes; p = FiltroMovimentacoes
create or replace function rel_movimentacoes(p jsonb) returns jsonb
language plpgsql stable set search_path = public as $$
declare v_de date := (p->>'de')::date; v_ate date := (p->>'ate')::date; v_linhas jsonb; v_totais jsonb;
begin
  if v_de is null or v_ate is null or v_de > v_ate then perform falha(422, 'Informe um período válido.', 'de'); end if;
  select coalesce(jsonb_agg(to_jsonb(m) - 'busca' order by m."dataHora" desc), '[]') into v_linhas
    from v_movimentacoes m
   where (m."dataHora" at time zone 'America/Sao_Paulo')::date between v_de and v_ate
     and (p->>'especie' is null or m.especie = p->>'especie')
     and (p->>'tipo' is null or m.tipo::text = p->>'tipo')
     and (coalesce(trim(p->>'usuario'), '') = '' or lower(m.usuario) like '%' || lower(trim(p->>'usuario')) || '%');
  select coalesce(jsonb_agg(jsonb_build_object('tipo', t, 'registros', n, 'quantidade', q)
                            order by array_position(array['entrada','saida','transferencia','perda','ajuste'], t)), '[]') into v_totais
    from (select x->>'tipo' as t, count(*) as n, sum((x->>'quantidade')::int) as q
            from jsonb_array_elements(v_linhas) x where x->>'status' = 'aprovado' group by 1) s;
  return jsonb_build_object('linhas', v_linhas, 'totais', v_totais);
end $$;

-- Indicadores (Painel)
create or replace function ui_indicadores() returns jsonb
language sql stable set search_path = public as $$
  with s as (select * from v_saldos), lo as (select * from v_lotes), entregues as (select * from rmes where status = 'entregue')
  select jsonb_strip_nulls(jsonb_build_object(
    'disponivel', (select coalesce(sum(disponivel), 0) from s), 'bloqueado', (select coalesce(sum(bloqueado), 0) from s),
    'emAnalise', (select coalesce(sum("emAnalise"), 0) from s), 'divergente', (select coalesce(sum(divergente), 0) from s),
    'metrosLineares', (select coalesce(sum("metrosLineares"), 0) from s),
    'volumeDocumentalM3', (select coalesce(sum(volume_documental_m3), 0) from lotes),
    'volumeCalculadoM3', (select coalesce(sum("volumeM3"), 0) from s),
    'recebimentosPendentes', (select count(*) from v_notas where situacao <> 'recebida'),
    'inventariosAbertos', (select count(*) from sessoes_inventario where estado not in ('aprovado', 'rejeitado')),
    'recebimentosPorMes', (select coalesce(jsonb_agg(jsonb_build_object('rotulo', rotulo, 'valor', valor) order by m), '[]') from (
        select date_trunc('month', g)::date as m,
               (array['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'])[extract(month from g)::int] as rotulo,
               (select count(*) from recebimentos r
                 where date_trunc('month', r.recebido_em at time zone 'America/Sao_Paulo') = date_trunc('month', g)) as valor
          from generate_series(date_trunc('month', hoje()::timestamp) - interval '4 months', date_trunc('month', hoje()::timestamp), interval '1 month') g) x),
    'estoquePorClasse', (select coalesce(jsonb_agg(jsonb_build_object('rotulo', r, 'valor', v)), '[]') from (
        select case when classe is null then 'Classe a definir' else 'Classe ' || classe end as r, sum(disponivel) as v
          from s group by 1) x),
    'fifoPct', (select case when count(*) > 0 then 100.0 * count(*) filter (where sp.seguiu_sugestao) / count(*) end
                  from entregues e join rme_separacoes sp on sp.rme_id = e.id and sp.ativa),
    'rmesEntregues', (select count(*) from entregues), 'rmesNoSistema', (select count(*) from rmes),
    'idadeMediaDias', (select coalesce(sum("idadeDias" * saldo)::numeric / nullif(sum(saldo), 0), 0) from lo where saldo > 0),
    'lotesAcimaLimite', (select count(*) from lo where "acimaLimiteIdade"),
    'limiteIdadeDias', param('limite_dias_estoque'),
    'divergenciaInventarioPct', (select coalesce(100.0 * sum(abs(contagem - saldo_sistema)) / nullif(sum(saldo_sistema), 0), 0) from inventario_contagens),
    'rastreabilidadePct', (select coalesce(100.0 * count(*) filter (where ok) / nullif(count(*), 0), 0) from (
        select lo."dofNumero" is not null and lo.quantidade - lo.saldo = coalesce((
                 select sum(case when m.tipo in ('saida', 'perda') then m.quantidade when m.tipo = 'ajuste' then -m.quantidade else 0 end)
                   from movimentacoes m where m.lote_id = lo.id and m.status = 'aprovado'), 0) as ok
          from lo) x),
    'dofsPendentes', jsonb_array_length(rel_dofs_pendentes()),
    'lotesAguardandoInspecao', (select count(*) from lotes where etapa_inspecao <> 'concluida'),
    'saldoM3PorEspecie', (select coalesce(jsonb_agg(jsonb_build_object('rotulo', e, 'valor', v) order by v desc), '[]') from (
        select "especieDocumental" as e, sum("volumeM3") as v from s where "volumeM3" > 0 group by 1) x)))
$$;

-- Alerta[] (sino e Painel)
create or replace function ui_alertas() returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(a order by o), '[]') from (
    select 1 as o, jsonb_build_object('id', 'al-vol-' || r.id, 'nivel', 'critico',
             'titulo', format('Divergência de volume acima de %s%% na NF %s', param('tolerancia_volume_pct'), r."nfNumero"),
             'descricao', format('DOF %s: %s%s%%. A norma manda recusar a carga e comunicar o órgão; os lotes ficam com divergência até serem liberados.',
                                 r."dofNumero", case when r."divergenciaVolumePct" > 0 then '+' else '' end, replace(r."divergenciaVolumePct"::text, '.', ',')),
             'link', '/recebimento') as a
      from v_recebimentos r where r."acimaTolerancia"
       and exists (select 1 from lotes l where l.recebimento_id = r.id and l.divergente)
    union all
    select 2, jsonb_build_object('id', 'al-dof-' || (d->>'nfId'), 'nivel', d->>'nivel',
             'titulo', case when (d->>'diasParaPrazo')::int < 0 then format('DOF %s com prazo de declaração vencido', d->>'dofNumero')
                            else format('DOF %s: declarar no Sinaflor até %s', d->>'dofNumero', to_char((d->>'prazoDeclaracao')::date, 'DD/MM/YYYY')) end,
             'descricao', format('NF %s (%s). ', d->>'nfNumero', d->>'fornecedor') ||
                          case when (d->>'diasParaPrazo')::int < 0 then format('Venceu há %s dia(s); novos DOFs podem ser suspensos.', -(d->>'diasParaPrazo')::int)
                               when (d->>'diasParaPrazo')::int = 0 then 'Vence hoje.' else format('Faltam %s dia(s).', d->>'diasParaPrazo') end,
             'link', '/relatorios?aba=dofs')
      from jsonb_array_elements(rel_dofs_pendentes()) d where d->>'nivel' <> 'no_prazo'
    union all
    select 3, jsonb_build_object('id', 'al-rme-' || r.id, 'nivel', 'critico', 'titulo', format('RME %s com data limite vencida', r.numero),
             'descricao', format('Destinatário: %s. Ainda não entregue.', r.destinatario), 'link', '/rme')
      from rmes r where r.status in ('aberta', 'em_separacao', 'conferida') and r.data_limite < hoje()
    union all
    select 4, jsonb_build_object('id', 'al-urg-' || r.id, 'nivel', 'critico', 'titulo', format('RME urgente %s', r.numero),
             'descricao', format('%s: data limite %s.', r.destinatario, to_char(r.data_limite, 'DD/MM/YYYY')), 'link', '/rme')
      from rmes r where r.status in ('aberta', 'em_separacao', 'conferida') and r.urgencia = 'urgente' and r.data_limite >= hoje()
    union all
    select 5, jsonb_build_object('id', 'al-conferir', 'nivel', 'atencao', 'titulo', format('%s RME aguardando conferência', count(*)),
             'descricao', 'A entrega e a baixa só acontecem após a conferência do supervisor.', 'link', '/rme')
      from rmes where status = 'em_separacao' having count(*) > 0
    union all
    select 6, jsonb_build_object('id', 'al-idade', 'nivel', 'atencao',
             'titulo', format('%s lote(s) acima de %s dias em estoque', count(*), param('limite_dias_estoque')),
             'descricao', 'Limite definido em Configurações.', 'link', '/estoque?visao=lote&acimaLimiteIdade=true')
      from v_lotes where "acimaLimiteIdade" having count(*) > 0
    union all
    select 7, jsonb_build_object('id', 'al-inspecao', 'nivel', 'atencao', 'titulo', format('%s lote(s) aguardando inspeção', count(*)),
             'descricao', 'Material fora do estoque disponível até a inspeção e a formação dos fardos.', 'link', '/inspecao')
      from lotes where etapa_inspecao <> 'concluida' having count(*) > 0
    union all
    select 8, jsonb_build_object('id', 'al-aprovar', 'nivel', 'atencao', 'titulo', format('%s perda/ajuste aguardando aprovação', count(*)),
             'descricao', 'O saldo só muda após a aprovação do supervisor ou gestor.', 'link', '/movimentacoes')
      from movimentacoes where tipo in ('perda', 'ajuste') and status = 'pendente' having count(*) > 0
    union all
    select 9, jsonb_build_object('id', 'al-sem-dof', 'nivel', 'atencao', 'titulo', format('%s NF aguardando DOF', count(*)),
             'descricao', 'O recebimento não avança sem o DOF cadastrado.', 'link', '/notas')
      from v_notas where situacao = 'aguardando_dof' having count(*) > 0
    union all
    select 10, jsonb_build_object('id', 'al-receber', 'nivel', 'atencao', 'titulo', format('%s NF aguardando recebimento', count(*)),
             'descricao', 'NF com DOF pronta para conferência.', 'link', '/recebimento')
      from v_notas where situacao = 'aguardando_recebimento' having count(*) > 0
  ) x
$$;

-- Pendencia[] ("Para fazer agora"), filtradas pelas permissões de quem consulta
create or replace function ui_pendencias() returns jsonb
language plpgsql stable set search_path = public as $$
declare
  r jsonb := '[]';
  v_hoje date := hoje();
  ex jsonb; n int; crit boolean;
begin
  -- RMEs por status, urgentes e de data limite mais próxima primeiro
  if tem_permissao('rme:separar') then
    select count(*), bool_or(urgencia = 'urgente' or data_limite < v_hoje),
           (select jsonb_agg(e) from (select jsonb_build_object('codigo', numero, 'texto',
              case when urgencia = 'urgente' then 'URGENTE · ' else '' end || destinatario || ' · até ' || to_char(data_limite, 'DD/MM/YYYY')
              || case when data_limite < v_hoje then ' (vencida)' else '' end) as e
              from rmes where status = 'aberta' order by urgencia desc, data_limite limit 3) x)
      into n, crit, ex from rmes where status = 'aberta';
    if n > 0 then r := r || jsonb_build_object('id', 'separar', 'nivel', case when crit then 'critico' else 'atencao' end,
        'titulo', 'RMEs para separar', 'quantidade', n, 'exemplos', ex, 'acao', jsonb_build_object('rotulo', 'Separar', 'link', '/rme?visao=lista&status=aberta')); end if;
  end if;
  if tem_permissao('rme:conferir') then
    select count(*), bool_or(urgencia = 'urgente' or data_limite < v_hoje),
           (select jsonb_agg(e) from (select jsonb_build_object('codigo', numero, 'texto',
              case when urgencia = 'urgente' then 'URGENTE · ' else '' end || destinatario || ' · até ' || to_char(data_limite, 'DD/MM/YYYY')) as e
              from rmes where status = 'em_separacao' order by urgencia desc, data_limite limit 3) x)
      into n, crit, ex from rmes where status = 'em_separacao';
    if n > 0 then r := r || jsonb_build_object('id', 'conferir', 'nivel', case when crit then 'critico' else 'atencao' end,
        'titulo', 'RMEs para conferir', 'quantidade', n, 'descricao', 'A entrega e a baixa só acontecem depois da sua conferência.',
        'exemplos', ex, 'acao', jsonb_build_object('rotulo', 'Conferir', 'link', '/rme?visao=lista&status=em_separacao')); end if;
  end if;
  if tem_permissao('rme:separar') then
    select count(*), (select jsonb_agg(e) from (select jsonb_build_object('codigo', numero, 'texto', destinatario || ' · até ' || to_char(data_limite, 'DD/MM/YYYY')) as e
              from rmes where status = 'conferida' order by urgencia desc, data_limite limit 3) x)
      into n, ex from rmes where status = 'conferida';
    if n > 0 then r := r || jsonb_build_object('id', 'entregar', 'nivel', 'atencao', 'titulo', 'RMEs conferidas para entregar', 'quantidade', n,
        'exemplos', ex, 'acao', jsonb_build_object('rotulo', 'Confirmar entrega', 'link', '/rme?visao=lista&status=conferida')); end if;
  end if;
  if tem_permissao('recebimento:registrar') then
    select count(*), (select jsonb_agg(e) from (select jsonb_build_object('codigo', 'NF ' || numero, 'texto', fornecedor) as e
              from v_notas where situacao = 'aguardando_recebimento' order by emissao limit 3) x)
      into n, ex from v_notas where situacao = 'aguardando_recebimento';
    if n > 0 then r := r || jsonb_build_object('id', 'receber', 'nivel', 'atencao', 'titulo', 'NFs com DOF prontas para receber', 'quantidade', n,
        'exemplos', ex, 'acao', jsonb_build_object('rotulo', 'Receber', 'link', '/notas?visao=lista&etapa=aguardando_recebimento')); end if;
  end if;
  if tem_permissao('nf:cadastrar') then
    select count(*), (select jsonb_agg(e) from (select jsonb_build_object('codigo', 'NF ' || numero, 'texto', fornecedor) as e
              from v_notas where situacao = 'aguardando_dof' order by emissao limit 3) x)
      into n, ex from v_notas where situacao = 'aguardando_dof';
    if n > 0 then r := r || jsonb_build_object('id', 'dof', 'nivel', 'atencao', 'titulo', 'NFs aguardando DOF', 'quantidade', n,
        'descricao', 'O recebimento não avança sem o DOF.', 'exemplos', ex,
        'acao', jsonb_build_object('rotulo', 'Cadastrar DOF', 'link', '/notas?visao=lista&etapa=aguardando_dof')); end if;
  end if;
  if tem_permissao('dof:declarar') then
    select count(*), (select jsonb_agg(e) from (select jsonb_build_object('codigo', 'NF ' || (d->>'nfNumero'), 'texto', 'DOF ' || (d->>'dofNumero') || ' · ' ||
                case when (d->>'diasParaPrazo')::int < 0 then format('prazo vencido há %s dia(s)', -(d->>'diasParaPrazo')::int)
                     else 'prazo ' || to_char((d->>'prazoDeclaracao')::date, 'DD/MM/YYYY') end) as e
              from jsonb_array_elements(rel_dofs_pendentes()) d limit 3) x)
      into n, ex from jsonb_array_elements(rel_dofs_pendentes()) d;
    if n > 0 then r := r || jsonb_build_object('id', 'declarar',
        'nivel', (select case when bool_or(d->>'nivel' = 'critico') then 'critico' when bool_or(d->>'nivel' = 'atencao') then 'atencao' else 'info' end
                    from jsonb_array_elements(rel_dofs_pendentes()) d),
        'titulo', 'DOFs para declarar no Sinaflor', 'quantidade', n, 'exemplos', ex,
        'acao', jsonb_build_object('rotulo', 'Declarar', 'link', '/relatorios?aba=dofs')); end if;
  end if;
  if tem_permissao('movimentacoes:aprovar') then
    select count(*), (select jsonb_agg(e) from (select jsonb_build_object('codigo', coalesce("fardoCodigo", "loteCodigo"), 'texto',
                case when tipo = 'perda' then 'Perda' else 'Ajuste' end || ' de ' || quantidade || ' un. · ' || usuario) as e
              from v_movimentacoes where tipo in ('perda', 'ajuste') and status = 'pendente' order by "dataHora" limit 3) x)
      into n, ex from movimentacoes where tipo in ('perda', 'ajuste') and status = 'pendente';
    if n > 0 then r := r || jsonb_build_object('id', 'aprovar', 'nivel', 'atencao', 'titulo', 'Perdas e ajustes para aprovar', 'quantidade', n,
        'descricao', 'O saldo só muda depois da aprovação.', 'exemplos', ex,
        'acao', jsonb_build_object('rotulo', 'Revisar', 'link', '/movimentacoes?status=pendente')); end if;
  end if;
  if tem_permissao('rme:abrir') then
    select count(*), (select jsonb_agg(e) from (select jsonb_build_object('codigo', numero, 'texto',
                case status when 'aberta' then 'Aberta' when 'em_separacao' then 'Em separação' else 'Conferida' end || ' · ' || destinatario) as e
              from rmes where requisitante_id = auth.uid() and status in ('aberta', 'em_separacao', 'conferida') order by aberta_em desc limit 3) x)
      into n, ex from rmes where requisitante_id = auth.uid() and status in ('aberta', 'em_separacao', 'conferida');
    r := r || jsonb_strip_nulls(jsonb_build_object('id', 'minhas', 'nivel', 'info',
        'titulo', case when n > 0 then 'Minhas RMEs em andamento' else 'Nenhuma RME sua em andamento' end, 'quantidade', n,
        'exemplos', ex, 'acao', jsonb_build_object('rotulo', 'Abrir RME', 'link', '/rme')));
  end if;
  if tem_permissao('inspecao:concluir') then
    select count(*), (select jsonb_agg(e) from (select jsonb_build_object('codigo', codigo, 'texto', quantidade || ' peças · ' || "especieDocumental") as e
              from v_lotes where "etapaInspecao" <> 'concluida' and "pecasInspecionadas" = quantidade order by "recebidoEm" limit 3) x)
      into n, ex from v_lotes where "etapaInspecao" <> 'concluida' and "pecasInspecionadas" = quantidade;
    if n > 0 then r := r || jsonb_build_object('id', 'formar', 'nivel', 'atencao', 'titulo', 'Lotes inspecionados: formar os fardos', 'quantidade', n,
        'descricao', 'Todas as peças têm resultado. O material só fica disponível depois de formar os fardos.', 'exemplos', ex,
        'acao', jsonb_build_object('rotulo', 'Formar fardos', 'link', '/inspecao')); end if;
  end if;
  if tem_permissao('inspecao:concluir') or tem_permissao('recebimento:registrar') then
    select count(*), (select jsonb_agg(e) from (select jsonb_build_object('codigo', codigo, 'texto', "pecasInspecionadas" || ' de ' || quantidade || ' peças inspecionadas') as e
              from v_lotes where "etapaInspecao" <> 'concluida' and "pecasInspecionadas" < quantidade order by "recebidoEm" limit 3) x)
      into n, ex from v_lotes where "etapaInspecao" <> 'concluida' and "pecasInspecionadas" < quantidade;
    if n > 0 then r := r || jsonb_build_object('id', 'inspecao', 'nivel', 'info', 'titulo', 'Lotes aguardando inspeção', 'quantidade', n,
        'descricao', 'Fora do estoque disponível até o resultado da inspeção.', 'exemplos', ex,
        'acao', jsonb_build_object('rotulo', 'Ver inspeção', 'link', '/inspecao')); end if;
  end if;
  -- exemplos vazios não vão para a tela
  return (select coalesce(jsonb_agg(case when x->'exemplos' = 'null'::jsonb then x - 'exemplos' else x end), '[]') from jsonb_array_elements(r) x);
end $$;
