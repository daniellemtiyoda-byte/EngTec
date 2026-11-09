-- Holz Trilho v2 · 0008 · Privilégios explícitos (segunda camada, além da RLS)
-- Ideia trazida do banco da v1, feito pelo Erik (migração 20261107000004_seguranca.sql do main): mesmo que uma
-- política RLS falhe ou falte, os papéis da API não têm o privilégio de fazer o que não devem.
--   · anon (sem login): nada. Não lê tabela nem view e não executa função.
--   · authenticated: só select nas tabelas e views (a RLS decide o que cada um vê); nada de insert, update ou
--     delete direto. Execute só nas funções que o app chama (src/services/montagem.ts e supabase/index.ts) e nas
--     auxiliares de leitura que elas, as views e as políticas usam rodando como o usuário (security invoker):
--     quem lê uma view ou é avaliado por uma política precisa de execute nas funções que ela chama. As funções
--     security definer rodam como o dono, então o que chamam por dentro continua fechado. As de gatilho não
--     precisam (o Postgres só confere ao criar o gatilho).
-- O teste privilegios.test.ts confere as duas listas contra o código do app e contra o banco.

-- Tabelas, views e sequências.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;  -- inclui as views v_*

-- Funções: tudo fechado, depois só as da lista.
revoke all on all functions in schema public from public, anon, authenticated;

grant execute on function
  -- Leitura do app.
  public.exportar_estado(),
  -- Escritas do app (uma por operação; a permissão é conferida dentro de cada uma).
  public.salvar_especie(text, jsonb), public.salvar_tamanho(text, jsonb), public.salvar_tratamento(text, jsonb),
  public.salvar_empresa_inspetora(text, jsonb), public.salvar_fornecedor(text, jsonb), public.situacao_fornecedor(text, text),
  public.salvar_local(text, jsonb), public.inativar_local(text), public.alterar_ativo(text, text, boolean),
  public.atualizar_usuario(uuid, jsonb), public.atualizar_parametros(jsonb),
  public.criar_ata(jsonb), public.criar_contrato(jsonb), public.atualizar_contrato(text, jsonb), public.cancelar_contrato(text, text),
  public.emitir_fardos(jsonb), public.cadastrar_entrega(jsonb, text, jsonb), public.declarar_dof(text),
  public.receber(text, jsonb), public.emitir_laudo(text),
  public.registrar_inspecao(text, jsonb, text), public.simular_fardo(text), public.concluir_inspecao(text, jsonb),
  public.registrar_comunicacao(text), public.registrar_retirada(text),
  public.transferir_fardo(text, text),
  public.abrir_rme(jsonb), public.iniciar_separacao(text), public.separar_rme(text, jsonb), public.entregar_rme(text),
  public.cancelar_rme(text, text),
  public.marcar_destinacao_lancada(text), public.informar_saldo_dof(jsonb), public.registrar_perda(text, jsonb),
  public.marcar_perda_comunicada(text),
  public.abrir_inventario(text[]), public.ler_inventario(text, text, text, text), public.fechar_inventario(text, jsonb),
  public.reiniciar_demonstracao(),
  -- Auxiliares usadas como o usuário: políticas RLS e do Storage (ativo, pode), views e exportar_estado.
  public.ativo(), public.pode(text[]), public.agora(), public.hoje(), public.dia_sp(timestamptz), public.dia_util(date),
  public.somar_dias_uteis(date, integer), public.nivel_prazo(date, date, integer[]), public.liberacao_cura(date, text)
to authenticated;

-- Objetos criados depois (migrações novas, editor SQL) não ficam abertos a anon nem graváveis direto por
-- authenticated: tabela nova só com select; função nova fechada a anon. O padrão do Postgres dá execute a PUBLIC
-- (que inclui anon) em toda função nova; ele vale para o banco todo e só se tira sem "in schema".
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke insert, update, delete, truncate, references, trigger on tables from authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon;
alter default privileges revoke execute on functions from public;
