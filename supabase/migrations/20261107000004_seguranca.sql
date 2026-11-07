-- =============================================================================
-- Holz Trilho — Migração 4/4: RLS, privilégios e Storage
--
-- O navegador só LÊ (tabelas e views, com RLS) e ESCREVE pelas funções da
-- migração 2, que conferem a permissão de quem chama. anon não acessa nada.
-- =============================================================================

create or replace function usuario_ativo() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis where id = auth.uid() and ativo)
$$;

-- RLS em todas as tabelas; leitura para usuário ativo (auditoria só para admin)
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table %I enable row level security', t);
    if t = 'auditoria' then
      execute format('create policy leitura on %I for select to authenticated using (tem_permissao(''admin''))', t);
    elsif t not in ('lote_sequencias', 'rme_sequencias') then
      execute format('create policy leitura on %I for select to authenticated using (usuario_ativo())', t);
    end if;
  end loop;
end $$;

-- Privilégios: nada de escrita direta; leitura só para quem está logado
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;     -- inclui as views v_*

revoke all on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
-- internas ou só do servidor (service role)
revoke execute on function
  inspecao_do_inspector(text, text, numeric, text, text, timestamptz, text, text),
  recalcular_fardo(uuid), proximo_seq(text, smallint),
  trg_auditoria(), trg_novo_usuario(), trg_dormentes_saldo(), trg_inspecao_antes(), trg_inspecao_depois()
from authenticated;
grant execute on function inspecao_do_inspector(text, text, numeric, text, text, timestamptz, text, text) to service_role;

-- Novas tabelas/funções criadas depois não ficam abertas a anon por padrão
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on functions from anon;

-- ---------------------------------------------------------------------------
-- Storage: buckets privados; cada usuário envia na própria pasta (<uid>/...)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('nfe-xml',           'nfe-xml',           false, 10485760, array['application/xml', 'text/xml']),
  ('dof-pdf',           'dof-pdf',           false, 10485760, array['application/pdf']),
  ('recebimento-fotos', 'recebimento-fotos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  ('visao-imagens',     'visao-imagens',     false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "holz: leitura" on storage.objects;
drop policy if exists "holz: envio" on storage.objects;

create policy "holz: leitura" on storage.objects for select to authenticated
  using (bucket_id in ('nfe-xml', 'dof-pdf', 'recebimento-fotos', 'visao-imagens') and usuario_ativo());

create policy "holz: envio" on storage.objects for insert to authenticated
  with check (
    (storage.foldername(name))[1] = auth.uid()::text
    and case bucket_id
          when 'nfe-xml'           then tem_permissao('nf:cadastrar')
          when 'dof-pdf'           then tem_permissao('nf:cadastrar')
          when 'recebimento-fotos' then tem_permissao('recebimento:registrar')
          when 'visao-imagens'     then tem_permissao('visao:enviar')
          else false
        end
  );
-- sem update/delete: documento enviado não é sobrescrito nem apagado
