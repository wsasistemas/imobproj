-- =============================================================================
-- IMOBPROJ · 006 · Storage (buckets privados + políticas por projeto)
--
-- Convenção de caminhos (o primeiro segmento é SEMPRE o project_id):
--   documentos/<project_id>/<document_id>/<arquivo>
--   evidencias/<project_id>/<os_id>/<arquivo>
-- fn_try_uuid evita erro de cast quando o caminho não começa com um uuid.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values
  ('documentos', 'documentos', false, 52428800),   -- 50 MB
  ('evidencias', 'evidencias', false, 52428800)
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- documentos: quem vê o projeto lê; gerente/super_admin escrevem
-- -----------------------------------------------------------------------------
drop policy if exists documentos_select on storage.objects;
create policy documentos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documentos'
    and public.fn_can_view_project(public.fn_try_uuid((storage.foldername(name))[1]))
  );

drop policy if exists documentos_insert on storage.objects;
create policy documentos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documentos'
    and public.fn_has_role(public.fn_try_uuid((storage.foldername(name))[1]), array['gerente'])
  );

drop policy if exists documentos_update on storage.objects;
create policy documentos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'documentos'
    and public.fn_has_role(public.fn_try_uuid((storage.foldername(name))[1]), array['gerente'])
  )
  with check (
    bucket_id = 'documentos'
    and public.fn_has_role(public.fn_try_uuid((storage.foldername(name))[1]), array['gerente'])
  );

drop policy if exists documentos_delete on storage.objects;
create policy documentos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documentos'
    and public.fn_has_role(public.fn_try_uuid((storage.foldername(name))[1]), array['gerente'])
  );

-- -----------------------------------------------------------------------------
-- evidencias: quem vê o projeto lê; o executor da OS (segundo segmento) lê e
-- escreve as evidências da própria OS; gerente/super_admin escrevem tudo.
-- -----------------------------------------------------------------------------
drop policy if exists evidencias_select on storage.objects;
create policy evidencias_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'evidencias'
    and (
      public.fn_can_view_project(public.fn_try_uuid((storage.foldername(name))[1]))
      or (
        public.fn_is_os_executor(public.fn_try_uuid((storage.foldername(name))[2]))
        and public.fn_project_of_os(public.fn_try_uuid((storage.foldername(name))[2]))
            = public.fn_try_uuid((storage.foldername(name))[1])
      )
    )
  );

drop policy if exists evidencias_insert on storage.objects;
create policy evidencias_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'evidencias'
    and (
      public.fn_has_role(public.fn_try_uuid((storage.foldername(name))[1]), array['gerente'])
      or (
        public.fn_is_os_executor(public.fn_try_uuid((storage.foldername(name))[2]))
        and public.fn_project_of_os(public.fn_try_uuid((storage.foldername(name))[2]))
            = public.fn_try_uuid((storage.foldername(name))[1])
      )
    )
  );

drop policy if exists evidencias_update on storage.objects;
create policy evidencias_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'evidencias'
    and (
      public.fn_has_role(public.fn_try_uuid((storage.foldername(name))[1]), array['gerente'])
      or public.fn_is_os_executor(public.fn_try_uuid((storage.foldername(name))[2]))
    )
  )
  with check (
    bucket_id = 'evidencias'
    and (
      public.fn_has_role(public.fn_try_uuid((storage.foldername(name))[1]), array['gerente'])
      or (
        public.fn_is_os_executor(public.fn_try_uuid((storage.foldername(name))[2]))
        and public.fn_project_of_os(public.fn_try_uuid((storage.foldername(name))[2]))
            = public.fn_try_uuid((storage.foldername(name))[1])
      )
    )
  );

drop policy if exists evidencias_delete on storage.objects;
create policy evidencias_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'evidencias'
    and (
      public.fn_has_role(public.fn_try_uuid((storage.foldername(name))[1]), array['gerente'])
      or public.fn_is_os_executor(public.fn_try_uuid((storage.foldername(name))[2]))
    )
  );
