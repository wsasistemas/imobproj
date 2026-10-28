-- =============================================================================
-- IMOBPROJ · 005 · Row Level Security
--
-- Matriz (PARTE A do PRD). super_admin passa em tudo (fn_has_role sempre true).
--   diretor        : lê tudo do projeto; dá ciência em atas; aceita/recusa OS;
--                    comenta documentos; decide propostas de escopo.
--   gerente        : mantém EAP, dependências, cronograma, linha de base, documentos;
--                    abre OS; redige atas; administra grupos de WhatsApp.
--   usuario_chave  : lê o projeto; comenta documentos; aceita/recusa OS; ciência em atas.
--   analista       : lê o projeto; executa e aponta as PRÓPRIAS OS (executor_id = auth.uid()).
--   prestador      : vê apenas o projeto (cabeçalho) e as OS atribuídas a ele + evidências.
-- Regras finas de coluna/transição (ex.: só diretor/usuario_chave aprovam OS)
-- ficam nos triggers da migration 003 (fn_os_guard, fn_meeting_participant_guard).
--
-- Escritas feitas por Edge Functions usam service_role (ignora RLS).
-- Políticas recriadas com drop if exists + create => migration reaplicável.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Privilégios de tabela (a RLS filtra as linhas; anon não acessa nada)
-- -----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
revoke all on all tables in schema public from anon;
revoke all on public.project_counters from authenticated;

-- -----------------------------------------------------------------------------
-- Habilita RLS em TODAS as tabelas
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'organizations', 'profiles', 'projects', 'project_members', 'project_counters',
    'documents', 'document_comments', 'wbs_items', 'wbs_dependencies', 'baselines',
    'schedule_changes', 'calendar_events', 'meetings', 'meeting_participants',
    'meeting_actions', 'service_orders', 'os_evidences', 'os_status_history',
    'scope_proposals', 'wa_sessions', 'wa_groups', 'wa_group_members', 'wa_messages',
    'audit_log'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end
$$;

-- project_counters: RLS ligada e SEM políticas (só a função security definer acessa)

-- -----------------------------------------------------------------------------
-- organizations: leitura para autenticados; escrita só super_admin
-- -----------------------------------------------------------------------------
drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations
  for select to authenticated using (true);

drop policy if exists organizations_write on public.organizations;
create policy organizations_write on public.organizations
  for all to authenticated
  using (public.fn_is_super_admin())
  with check (public.fn_is_super_admin());

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or public.fn_is_super_admin()
    or public.fn_shares_project(id)
  );

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or public.fn_is_super_admin())
  with check (id = (select auth.uid()) or public.fn_is_super_admin());
-- (is_super_admin protegido pelo trigger trg_profiles_protege_super_admin)

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (public.fn_is_super_admin());

drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles
  for delete to authenticated
  using (public.fn_is_super_admin());

-- -----------------------------------------------------------------------------
-- projects
-- -----------------------------------------------------------------------------
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects
  for select to authenticated
  using (public.fn_is_member(id));

drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects
  for insert to authenticated
  with check (public.fn_is_super_admin());

drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects
  for update to authenticated
  using (public.fn_has_role(id, array['gerente']))
  with check (public.fn_has_role(id, array['gerente']));

drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects
  for delete to authenticated
  using (public.fn_is_super_admin());

-- -----------------------------------------------------------------------------
-- project_members: quem vê o projeto vê a equipe; cada um vê o próprio vínculo.
-- Gestão de equipe e permissões: super_admin (módulo Administração).
-- -----------------------------------------------------------------------------
drop policy if exists project_members_select on public.project_members;
create policy project_members_select on public.project_members
  for select to authenticated
  using (user_id = (select auth.uid()) or public.fn_can_view_project(project_id));

drop policy if exists project_members_write on public.project_members;
create policy project_members_write on public.project_members
  for all to authenticated
  using (public.fn_is_super_admin())
  with check (public.fn_is_super_admin());

-- -----------------------------------------------------------------------------
-- documents / document_comments
-- -----------------------------------------------------------------------------
drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents
  for select to authenticated
  using (public.fn_can_view_project(project_id));

drop policy if exists documents_write on public.documents;
create policy documents_write on public.documents
  for all to authenticated
  using (public.fn_has_role(project_id, array['gerente']))
  with check (public.fn_has_role(project_id, array['gerente']));

drop policy if exists document_comments_select on public.document_comments;
create policy document_comments_select on public.document_comments
  for select to authenticated
  using (public.fn_can_view_project(public.fn_project_of_document(document_id)));

drop policy if exists document_comments_insert on public.document_comments;
create policy document_comments_insert on public.document_comments
  for insert to authenticated
  with check (
    autor_id = (select auth.uid())
    and public.fn_has_role(public.fn_project_of_document(document_id),
                           array['diretor', 'gerente', 'usuario_chave'])
  );

-- autor edita o próprio comentário; gerente resolve/edita qualquer um
drop policy if exists document_comments_update on public.document_comments;
create policy document_comments_update on public.document_comments
  for update to authenticated
  using (
    autor_id = (select auth.uid())
    or public.fn_has_role(public.fn_project_of_document(document_id), array['gerente'])
  )
  with check (
    autor_id = (select auth.uid())
    or public.fn_has_role(public.fn_project_of_document(document_id), array['gerente'])
  );

drop policy if exists document_comments_delete on public.document_comments;
create policy document_comments_delete on public.document_comments
  for delete to authenticated
  using (
    autor_id = (select auth.uid())
    or public.fn_has_role(public.fn_project_of_document(document_id), array['gerente'])
  );

-- -----------------------------------------------------------------------------
-- EAP, dependências, linha de base, mudanças de cronograma
-- -----------------------------------------------------------------------------
drop policy if exists wbs_items_select on public.wbs_items;
create policy wbs_items_select on public.wbs_items
  for select to authenticated
  using (public.fn_can_view_project(project_id));

drop policy if exists wbs_items_write on public.wbs_items;
create policy wbs_items_write on public.wbs_items
  for all to authenticated
  using (public.fn_has_role(project_id, array['gerente']))
  with check (public.fn_has_role(project_id, array['gerente']));

drop policy if exists wbs_dependencies_select on public.wbs_dependencies;
create policy wbs_dependencies_select on public.wbs_dependencies
  for select to authenticated
  using (public.fn_can_view_project(public.fn_project_of_wbs(predecessora_id)));

drop policy if exists wbs_dependencies_write on public.wbs_dependencies;
create policy wbs_dependencies_write on public.wbs_dependencies
  for all to authenticated
  using (public.fn_has_role(public.fn_project_of_wbs(predecessora_id), array['gerente']))
  with check (public.fn_has_role(public.fn_project_of_wbs(predecessora_id), array['gerente']));

drop policy if exists baselines_select on public.baselines;
create policy baselines_select on public.baselines
  for select to authenticated
  using (public.fn_can_view_project(project_id));

-- linha de base é congelada: gerente cria; só super_admin altera/exclui
drop policy if exists baselines_insert on public.baselines;
create policy baselines_insert on public.baselines
  for insert to authenticated
  with check (public.fn_has_role(project_id, array['gerente']));

drop policy if exists baselines_update on public.baselines;
create policy baselines_update on public.baselines
  for update to authenticated
  using (public.fn_is_super_admin())
  with check (public.fn_is_super_admin());

drop policy if exists baselines_delete on public.baselines;
create policy baselines_delete on public.baselines
  for delete to authenticated
  using (public.fn_is_super_admin());

drop policy if exists schedule_changes_select on public.schedule_changes;
create policy schedule_changes_select on public.schedule_changes
  for select to authenticated
  using (public.fn_can_view_project(public.fn_project_of_wbs(wbs_item_id)));

drop policy if exists schedule_changes_insert on public.schedule_changes;
create policy schedule_changes_insert on public.schedule_changes
  for insert to authenticated
  with check (
    autor_id = (select auth.uid())
    and public.fn_has_role(public.fn_project_of_wbs(wbs_item_id), array['gerente'])
  );
-- histórico imutável: sem update/delete para autenticados

-- -----------------------------------------------------------------------------
-- calendar_events: projeto inteiro para quem vê o projeto; prestador vê os
-- eventos das próprias OS. Gerente mantém a agenda.
-- -----------------------------------------------------------------------------
drop policy if exists calendar_events_select on public.calendar_events;
create policy calendar_events_select on public.calendar_events
  for select to authenticated
  using (
    public.fn_can_view_project(project_id)
    or (os_id is not null and public.fn_is_os_executor(os_id))
  );

drop policy if exists calendar_events_write on public.calendar_events;
create policy calendar_events_write on public.calendar_events
  for all to authenticated
  using (public.fn_has_role(project_id, array['gerente']))
  with check (public.fn_has_role(project_id, array['gerente']));

-- -----------------------------------------------------------------------------
-- Atas
-- -----------------------------------------------------------------------------
drop policy if exists meetings_select on public.meetings;
create policy meetings_select on public.meetings
  for select to authenticated
  using (public.fn_can_view_project(project_id));

drop policy if exists meetings_write on public.meetings;
create policy meetings_write on public.meetings
  for all to authenticated
  using (public.fn_has_role(project_id, array['gerente']))
  with check (public.fn_has_role(project_id, array['gerente']));

drop policy if exists meeting_participants_select on public.meeting_participants;
create policy meeting_participants_select on public.meeting_participants
  for select to authenticated
  using (public.fn_can_view_project(public.fn_project_of_meeting(meeting_id)));

drop policy if exists meeting_participants_insert on public.meeting_participants;
create policy meeting_participants_insert on public.meeting_participants
  for insert to authenticated
  with check (public.fn_has_role(public.fn_project_of_meeting(meeting_id), array['gerente']));

-- ciência: diretor/usuario_chave na própria linha; gerente em qualquer linha
drop policy if exists meeting_participants_update on public.meeting_participants;
create policy meeting_participants_update on public.meeting_participants
  for update to authenticated
  using (
    public.fn_has_role(public.fn_project_of_meeting(meeting_id), array['gerente'])
    or (user_id = (select auth.uid())
        and public.fn_has_role(public.fn_project_of_meeting(meeting_id), array['diretor', 'usuario_chave']))
  )
  with check (
    public.fn_has_role(public.fn_project_of_meeting(meeting_id), array['gerente'])
    or (user_id = (select auth.uid())
        and public.fn_has_role(public.fn_project_of_meeting(meeting_id), array['diretor', 'usuario_chave']))
  );

drop policy if exists meeting_participants_delete on public.meeting_participants;
create policy meeting_participants_delete on public.meeting_participants
  for delete to authenticated
  using (public.fn_has_role(public.fn_project_of_meeting(meeting_id), array['gerente']));

drop policy if exists meeting_actions_select on public.meeting_actions;
create policy meeting_actions_select on public.meeting_actions
  for select to authenticated
  using (public.fn_can_view_project(public.fn_project_of_meeting(meeting_id)));

drop policy if exists meeting_actions_insert on public.meeting_actions;
create policy meeting_actions_insert on public.meeting_actions
  for insert to authenticated
  with check (public.fn_has_role(public.fn_project_of_meeting(meeting_id), array['gerente']));

-- gerente edita; o responsável atualiza o andamento do próprio encaminhamento
drop policy if exists meeting_actions_update on public.meeting_actions;
create policy meeting_actions_update on public.meeting_actions
  for update to authenticated
  using (
    public.fn_has_role(public.fn_project_of_meeting(meeting_id), array['gerente'])
    or (responsavel_id = (select auth.uid())
        and public.fn_can_view_project(public.fn_project_of_meeting(meeting_id)))
  )
  with check (
    public.fn_has_role(public.fn_project_of_meeting(meeting_id), array['gerente'])
    or (responsavel_id = (select auth.uid())
        and public.fn_can_view_project(public.fn_project_of_meeting(meeting_id)))
  );

drop policy if exists meeting_actions_delete on public.meeting_actions;
create policy meeting_actions_delete on public.meeting_actions
  for delete to authenticated
  using (public.fn_has_role(public.fn_project_of_meeting(meeting_id), array['gerente']));

-- -----------------------------------------------------------------------------
-- Ordens de Serviço
-- -----------------------------------------------------------------------------
drop policy if exists service_orders_select on public.service_orders;
create policy service_orders_select on public.service_orders
  for select to authenticated
  using (
    public.fn_can_view_project(project_id)
    or (executor_id = (select auth.uid()) and public.fn_is_member(project_id))
  );

drop policy if exists service_orders_insert on public.service_orders;
create policy service_orders_insert on public.service_orders
  for insert to authenticated
  with check (public.fn_has_role(project_id, array['gerente']));

-- gerente edita; diretor/usuario_chave fazem aceite; executor aponta a própria OS
-- (o que cada papel pode mudar é validado por fn_os_guard)
drop policy if exists service_orders_update on public.service_orders;
create policy service_orders_update on public.service_orders
  for update to authenticated
  using (
    public.fn_has_role(project_id, array['gerente', 'diretor', 'usuario_chave'])
    or (executor_id = (select auth.uid())
        and public.fn_has_role(project_id, array['analista', 'prestador']))
  )
  with check (
    public.fn_has_role(project_id, array['gerente', 'diretor', 'usuario_chave'])
    or (executor_id = (select auth.uid())
        and public.fn_has_role(project_id, array['analista', 'prestador']))
  );

-- gerente exclui apenas rascunhos; super_admin exclui qualquer uma
drop policy if exists service_orders_delete on public.service_orders;
create policy service_orders_delete on public.service_orders
  for delete to authenticated
  using (
    public.fn_is_super_admin()
    or (status = 'rascunho' and public.fn_has_role(project_id, array['gerente']))
  );

drop policy if exists os_evidences_select on public.os_evidences;
create policy os_evidences_select on public.os_evidences
  for select to authenticated
  using (
    public.fn_can_view_project(public.fn_project_of_os(os_id))
    or public.fn_is_os_executor(os_id)
  );

drop policy if exists os_evidences_insert on public.os_evidences;
create policy os_evidences_insert on public.os_evidences
  for insert to authenticated
  with check (
    public.fn_has_role(public.fn_project_of_os(os_id), array['gerente'])
    or (public.fn_is_os_executor(os_id) and public.fn_is_member(public.fn_project_of_os(os_id)))
  );

drop policy if exists os_evidences_delete on public.os_evidences;
create policy os_evidences_delete on public.os_evidences
  for delete to authenticated
  using (
    public.fn_has_role(public.fn_project_of_os(os_id), array['gerente'])
    or (public.fn_is_os_executor(os_id)
        and exists (select 1 from public.service_orders so
                     where so.id = os_id
                       and so.status in ('rascunho', 'agendada', 'em_execucao')))
  );

drop policy if exists os_status_history_select on public.os_status_history;
create policy os_status_history_select on public.os_status_history
  for select to authenticated
  using (
    public.fn_can_view_project(public.fn_project_of_os(os_id))
    or public.fn_is_os_executor(os_id)
  );
-- insert apenas via trigger security definer; sem update/delete

drop policy if exists scope_proposals_select on public.scope_proposals;
create policy scope_proposals_select on public.scope_proposals
  for select to authenticated
  using (public.fn_can_view_project(project_id));

drop policy if exists scope_proposals_insert on public.scope_proposals;
create policy scope_proposals_insert on public.scope_proposals
  for insert to authenticated
  with check (public.fn_has_role(project_id, array['gerente', 'diretor', 'usuario_chave']));

drop policy if exists scope_proposals_update on public.scope_proposals;
create policy scope_proposals_update on public.scope_proposals
  for update to authenticated
  using (public.fn_has_role(project_id, array['gerente', 'diretor']))
  with check (public.fn_has_role(project_id, array['gerente', 'diretor']));

drop policy if exists scope_proposals_delete on public.scope_proposals;
create policy scope_proposals_delete on public.scope_proposals
  for delete to authenticated
  using (public.fn_has_role(project_id, array['gerente']));

-- -----------------------------------------------------------------------------
-- WhatsApp
-- wa_sessions: SOMENTE super_admin (status para membros via fn_wa_status()).
-- -----------------------------------------------------------------------------
drop policy if exists wa_sessions_super_admin on public.wa_sessions;
create policy wa_sessions_super_admin on public.wa_sessions
  for all to authenticated
  using (public.fn_is_super_admin())
  with check (public.fn_is_super_admin());

drop policy if exists wa_groups_select on public.wa_groups;
create policy wa_groups_select on public.wa_groups
  for select to authenticated
  using (public.fn_can_view_project(project_id));

drop policy if exists wa_groups_write on public.wa_groups;
create policy wa_groups_write on public.wa_groups
  for all to authenticated
  using (public.fn_has_role(project_id, array['gerente']))
  with check (public.fn_has_role(project_id, array['gerente']));

drop policy if exists wa_group_members_select on public.wa_group_members;
create policy wa_group_members_select on public.wa_group_members
  for select to authenticated
  using (public.fn_can_view_project(public.fn_project_of_group(group_id)));

drop policy if exists wa_group_members_write on public.wa_group_members;
create policy wa_group_members_write on public.wa_group_members
  for all to authenticated
  using (public.fn_has_role(public.fn_project_of_group(group_id), array['gerente']))
  with check (public.fn_has_role(public.fn_project_of_group(group_id), array['gerente']));

drop policy if exists wa_messages_select on public.wa_messages;
create policy wa_messages_select on public.wa_messages
  for select to authenticated
  using (public.fn_can_view_project(public.fn_project_of_group(group_id)));

-- resposta pelo portal: entra na fila como 'pendente'; a Edge Function
-- openwa-send (service_role) envia e atualiza status/tentativas/erro.
drop policy if exists wa_messages_insert on public.wa_messages;
create policy wa_messages_insert on public.wa_messages
  for insert to authenticated
  with check (
    direction = 'out'
    and status = 'pendente'
    and tentativas = 0
    and author_user_id = (select auth.uid())
    and public.fn_can_view_project(public.fn_project_of_group(group_id))
  );

drop policy if exists wa_messages_admin on public.wa_messages;
create policy wa_messages_admin on public.wa_messages
  for update to authenticated
  using (public.fn_is_super_admin())
  with check (public.fn_is_super_admin());

drop policy if exists wa_messages_delete on public.wa_messages;
create policy wa_messages_delete on public.wa_messages
  for delete to authenticated
  using (public.fn_is_super_admin());

-- -----------------------------------------------------------------------------
-- audit_log: leitura para super_admin, diretor e gerente do projeto.
-- Insert apenas pelo trigger fn_audit (security definer). Imutável.
-- -----------------------------------------------------------------------------
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log
  for select to authenticated
  using (
    public.fn_is_super_admin()
    or (project_id is not null and public.fn_has_role(project_id, array['diretor', 'gerente']))
  );

-- -----------------------------------------------------------------------------
-- Views e funções expostas ao app
-- -----------------------------------------------------------------------------
grant select on public.v_wbs_progress, public.v_fase_progress, public.v_project_progress to authenticated;
revoke all on public.v_wbs_progress, public.v_fase_progress, public.v_project_progress from anon;
grant execute on function public.fn_wa_status(uuid) to authenticated;
revoke execute on function public.fn_wa_status(uuid) from anon, public;
