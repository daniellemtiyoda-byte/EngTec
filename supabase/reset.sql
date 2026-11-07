-- =============================================================================
-- Holz Trilho — LIMPA o banco (apaga TUDO do schema public e recria vazio)
--
-- Use só para recomeçar: por exemplo, para trocar a primeira versão do banco
-- (entregue antes da integração com o front) por esta. Apaga todos os dados
-- das tabelas do sistema. Os usuários do Supabase Auth e os arquivos do
-- Storage NÃO são apagados.
--
-- Depois rode, na ordem: migrations/…0001 a …0004 e seed.sql.
-- =============================================================================

drop trigger if exists auth_novo_usuario on auth.users;
drop policy if exists "holz: leitura" on storage.objects;
drop policy if exists "holz: envio" on storage.objects;

drop schema if exists public cascade;
create schema public;

-- Privilégios padrão do Supabase para o schema public
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on schema public to postgres, service_role;
alter default privileges in schema public grant all on tables    to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;
