-- Holz Trilho v2 · 0003 · Armazenamento de anexos (Supabase Storage)
-- Um bucket PRIVADO, "anexos": fotos (canhoto, ocorrências), PDF da DOF, XML da NF, boletins, relatórios técnicos e
-- laudos. Nada é público: o app pede um link temporário (signed URL) para abrir cada arquivo.
-- Caminho: <entidade>/<id>/<arquivo> (ex.: entregas/en0012/dof.pdf). Até 10 MB, só os tipos aceitos pelo app.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('anexos', 'anexos', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf', 'application/xml', 'text/xml'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Ver os anexos: quem consulta a operação (administrador, almoxarife, gestor).
create policy anexos_ler on storage.objects for select to authenticated
  using (bucket_id = 'anexos' and public.pode('operacao:consultar'));

-- Enviar: quem cadastra NF e DOF, recebe, inspeciona (laudo), edita cadastros (certificados) ou usa o Simulador.
create policy anexos_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'anexos' and public.pode('nf:cadastrar', 'recebimento:registrar', 'inspecao:operar', 'cadastros:editar', 'simulador:usar'));

-- Não há política de alteração nem de exclusão: anexo enviado não é trocado nem apagado (como os demais registros).
