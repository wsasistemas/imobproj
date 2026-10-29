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
  ('imobproj-documentos', 'imobproj-documentos', false, 52428800),   -- 50 MB
  ('imobproj-evidencias', 'imobproj-evidencias', false, 52428800)
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- documentos: quem vê o projeto lê; gerente/super_admin escrevem
-- -----------------------------------------------------------------------------
drop policy if exists documentos_select on storage.objects;
create policy imobproj_documentos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'imobproj-documentos'
    and imobproj.fn_can_view_project(imobproj.fn_try_uuid((storage.foldername(name))[1]))
  );

drop policy if exists documentos_insert on storage.objects;
create policy imobproj_documentos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'imobproj-documentos'
    and imobproj.fn_has_role(imobproj.fn_try_uuid((storage.foldername(name))[1]), array['gerente'])
  );

drop policy if exists documentos_update on storage.objects;
create policy imobproj_documentos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'imobproj-documentos'
    and imobproj.fn_has_role(imobproj.fn_try_uuid((storage.foldername(name))[1]), array['gerente'])
  )
  with check (
    bucket_id = 'imobproj-documentos'
    and imobproj.fn_has_role(imobproj.fn_try_uuid((storage.foldername(name))[1]), array['gerente'])
  );

drop policy if exists documentos_delete on storage.objects;
create policy imobproj_documentos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'imobproj-documentos'
    and imobproj.fn_has_role(imobproj.fn_try_uuid((storage.foldername(name))[1]), array['gerente'])
  );

-- -----------------------------------------------------------------------------
-- evidencias: quem vê o projeto lê; o executor da OS (segundo segmento) lê e
-- escreve as evidências da própria OS; gerente/super_admin escrevem tudo.
-- -----------------------------------------------------------------------------
drop policy if exists evidencias_select on storage.objects;
create policy imobproj_evidencias_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'imobproj-evidencias'
    and (
      imobproj.fn_can_view_project(imobproj.fn_try_uuid((storage.foldername(name))[1]))
      or (
        imobproj.fn_is_os_executor(imobproj.fn_try_uuid((storage.foldername(name))[2]))
        and imobproj.fn_project_of_os(imobproj.fn_try_uuid((storage.foldername(name))[2]))
            = imobproj.fn_try_uuid((storage.foldername(name))[1])
      )
    )
  );

drop policy if exists evidencias_insert on storage.objects;
create policy imobproj_evidencias_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'imobproj-evidencias'
    and (
      imobproj.fn_has_role(imobproj.fn_try_uuid((storage.foldername(name))[1]), array['gerente'])
      or (
        imobproj.fn_is_os_executor(imobproj.fn_try_uuid((storage.foldername(name))[2]))
        and imobproj.fn_project_of_os(imobproj.fn_try_uuid((storage.foldername(name))[2]))
            = imobproj.fn_try_uuid((storage.foldername(name))[1])
      )
    )
  );

drop policy if exists evidencias_update on storage.objects;
create policy imobproj_evidencias_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'imobproj-evidencias'
    and (
      imobproj.fn_has_role(imobproj.fn_try_uuid((storage.foldername(name))[1]), array['gerente'])
      or imobproj.fn_is_os_executor(imobproj.fn_try_uuid((storage.foldername(name))[2]))
    )
  )
  with check (
    bucket_id = 'imobproj-evidencias'
    and (
      imobproj.fn_has_role(imobproj.fn_try_uuid((storage.foldername(name))[1]), array['gerente'])
      or (
        imobproj.fn_is_os_executor(imobproj.fn_try_uuid((storage.foldername(name))[2]))
        and imobproj.fn_project_of_os(imobproj.fn_try_uuid((storage.foldername(name))[2]))
            = imobproj.fn_try_uuid((storage.foldername(name))[1])
      )
    )
  );

drop policy if exists evidencias_delete on storage.objects;
create policy imobproj_evidencias_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'imobproj-evidencias'
    and (
      imobproj.fn_has_role(imobproj.fn_try_uuid((storage.foldername(name))[1]), array['gerente'])
      or imobproj.fn_is_os_executor(imobproj.fn_try_uuid((storage.foldername(name))[2]))
    )
  );
