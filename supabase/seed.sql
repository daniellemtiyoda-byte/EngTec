-- =============================================================================
-- Holz Trilho — dados iniciais (rode uma vez, depois das 4 migrações)
-- Permissões e papéis = src/dominio/permissoes.ts e perfisDemo de mock/data.ts.
-- Espécies, tamanhos e parâmetros = dados iniciais do PRD (provisórios até a CPTM confirmar).
-- =============================================================================

insert into permissoes (codigo, descricao) values
  ('admin',                   'Acesso total; Configurações, usuários e auditoria'),
  ('recebimento:registrar',   'Confirmar recebimento'),
  ('inspecao:concluir',       'Lançar resultado manual e concluir a inspeção formando os fardos'),
  ('movimentacoes:registrar', 'Registrar transferência, perda e ajuste'),
  ('movimentacoes:aprovar',   'Aprovar ou rejeitar perda e ajuste'),
  ('inventario:criar',        'Criar sessões e registrar contagens de inventário'),
  ('cadastros:editar',        'Classe e uso das espécies; medidas dos tamanhos'),
  ('nf:cadastrar',            'Cadastrar NF (manual ou XML) e DOF'),
  ('dof:declarar',            'Marcar o DOF como declarado no Sinaflor'),
  ('rme:abrir',               'Abrir e cancelar RME'),
  ('rme:separar',             'Separar RME e confirmar a entrega'),
  ('rme:conferir',            'Conferir RME antes da entrega'),
  ('visao:enviar',            'Enviar imagens para contagem estimada'),
  ('relatorios:exportar',     'Indicadores e exportação de relatórios')
on conflict do nothing;

insert into papeis (codigo, nome) values
  ('administrador', 'Administrador'),
  ('almoxarife',    'Almoxarife'),
  ('operador',      'Operador de pátio'),
  ('supervisor',    'Supervisor de conferência'),
  ('requisitante',  'Requisitante'),
  ('gestor',        'Gestor')
on conflict do nothing;

insert into papel_permissoes (papel, permissao) values
  ('administrador', 'admin'),
  ('almoxarife', 'nf:cadastrar'), ('almoxarife', 'dof:declarar'), ('almoxarife', 'recebimento:registrar'),
  ('almoxarife', 'inspecao:concluir'), ('almoxarife', 'rme:separar'), ('almoxarife', 'movimentacoes:registrar'),
  ('almoxarife', 'relatorios:exportar'),
  ('operador', 'movimentacoes:registrar'), ('operador', 'inventario:criar'),
  ('supervisor', 'rme:conferir'), ('supervisor', 'movimentacoes:aprovar'), ('supervisor', 'inspecao:concluir'),
  ('supervisor', 'relatorios:exportar'),
  ('requisitante', 'rme:abrir'),
  ('gestor', 'movimentacoes:aprovar'), ('gestor', 'relatorios:exportar')
on conflict do nothing;

insert into parametros (chave, valor, descricao, provisorio, editavel) values
  ('limite_dias_estoque',     120, 'Limite de dias em estoque antes do alerta',               true,  true),
  ('dof_alerta_critico_dias',   1, 'DOF: alerta crítico quando o prazo vence em até N dias', true,  true),
  ('dof_alerta_atencao_dias',   3, 'DOF: alerta de atenção quando vence em até N dias',      true,  true),
  ('categoria_1_indice_min',   80, 'Índice mínimo do Inspector para Categoria 1',             true,  true),
  ('categoria_2_indice_min',   50, 'Índice mínimo do Inspector para Categoria 2',             true,  true),
  ('tolerancia_volume_pct',    10, 'Tolerância de divergência de volume (IN Ibama 21/2014)', false, false),
  ('dormentes_por_fardo',      14, 'Dormentes por fardo na sugestão de formação',            false, false),
  -- 1 = aceita que quem separou confira a RME. Só para testar com um usuário; deixe 0 em produção.
  ('permitir_conferente_igual_separador', 0, 'Homologação: quem separou pode conferir (1 = sim)', false, true)
on conflict do nothing;

-- Lista de espécies da RME atual (PRD, "Dados iniciais"). Classe "a definir" = null; 19 a 21 são de AMV.
insert into especies (numero, nome_cientifico, classe, observacao, uso) values
  (1, 'Apuleia leiocarpa', null, null, 'via'), (2, 'Apuleia molaris', null, null, 'via'),
  (3, 'Aspidosperma polyneuron', null, null, 'via'), (4, 'Bowdichia brasiliensis ou Bowdichia spp', null, null, 'via'),
  (5, 'Bowdichia nitida', null, null, 'via'), (6, 'Bowdichia racemosa', null, null, 'via'),
  (7, 'Dialium guianense', '1ª', 'Classe conforme plaqueta', 'via'), (8, 'Diplotropis purpurea', null, null, 'via'),
  (9, 'Dipteryx odorata', null, null, 'via'), (10, 'Dipteryx spp.', null, null, 'via'),
  (11, 'Enterolobium schomburgkii', null, null, 'via'), (12, 'Goupia glabra', null, null, 'via'),
  (13, 'Hymenaea courbaril', null, null, 'via'), (14, 'Hymenaea intermedia', null, null, 'via'),
  (15, 'Hymenolobium petraeum ou Hymenolobium spp', null, null, 'via'), (16, 'Mezilaurus itauba', null, null, 'via'),
  (17, 'Ocotea neesiana', null, null, 'via'), (18, 'Tabebuia serratifolia', null, null, 'via'),
  (19, 'Angelim Vermelho', null, 'Promap', 'AMV'), (20, 'Coimal', null, 'Dormentes antigos', 'AMV'),
  (21, 'Veneer', null, 'Dormentes antigos', 'AMV'), (22, 'Astronium graveolens', null, null, 'via')
on conflict do nothing;

-- Medidas PROVISÓRIAS (só o comprimento de 2,80 m foi visto na plaqueta); editáveis em Cadastros
insert into tamanhos (codigo, largura_cm, altura_cm, comprimento_cm, medidas) values
  ('T1', 24, 17, 280, 'provisorio'), ('T2', 22, 16, 200, 'provisorio'), ('T3', 24, 17, 400, 'provisorio')
on conflict do nothing;

insert into locais_patio (codigo, descricao, capacidade) values
  ('Quadra 1 / Baia 01', 'Área de armazenamento 1', 3000), ('Quadra 1 / Baia 02', 'Área de armazenamento 2', 3000),
  ('Quadra 2 / Baia 01', 'Área de armazenamento 3', 3000), ('Quadra 2 / Baia 02', 'Área de armazenamento 4', 3000),
  ('Quadra 3 / Baia 01', 'Área de armazenamento 5', 3000)
on conflict do nothing;

-- Fornecedor FICTÍCIO para testar (CNPJ de teste válido). Os reais entram com:
--   insert into fornecedores (razao_social, cnpj, cidade_uf) values ('Razão Social', '00000000000000', 'Cidade/UF');
insert into fornecedores (razao_social, cnpj, cidade_uf) values
  ('Madeireira Exemplo Ltda. (fictícia)', '11222333000181', 'Cidade A/SP')
on conflict do nothing;

-- Depois de criar seu usuário em Authentication → Users, dê o papel de administrador:
--   insert into usuario_papeis (usuario_id, papel)
--   select id, 'administrador' from perfis where email = 'seu.email@exemplo.com';
