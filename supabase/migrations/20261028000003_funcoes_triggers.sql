-- =============================================================================
-- IMOBPROJ · 003 · Funções auxiliares, helpers de permissão e triggers
--   * set_updated_at() genérico em todas as tabelas;
--   * criação automática de profile no signup (auth.users);
--   * helpers de papel usados pela RLS (fn_user_role etc.);
--   * numeração sequencial por projeto (OS, atas, linhas de base);
--   * histórico de status de OS e regras de transição;
--   * auditoria genérica em audit_log.
-- Funções com "create or replace" e triggers com "create or replace trigger"
-- (PG14+) => migration reaplicável.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- updated_at
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

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
    execute format(
      'create or replace trigger trg_%1$s_updated_at
         before update on public.%1$I
         for each row execute function public.set_updated_at()', t);
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- Conversão segura texto -> uuid (usada nas políticas de Storage)
-- -----------------------------------------------------------------------------
create or replace function public.fn_try_uuid(p_texto text)
returns uuid
language plpgsql
immutable
set search_path = public
as $$
begin
  return p_texto::uuid;
exception when others then
  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- Helpers de permissão (SECURITY DEFINER: leem profiles/project_members sem
-- passar pela RLS, o que evita recursão nas políticas)
-- -----------------------------------------------------------------------------
create or replace function public.fn_is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_super_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

-- Papel do usuário logado no projeto: 'super_admin' | role ativo | null
create or replace function public.fn_user_role(p_project_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.fn_is_super_admin() then 'super_admin'
    else (
      select pm.role::text
        from public.project_members pm
       where pm.project_id = p_project_id
         and pm.user_id = auth.uid()
         and pm.ativo
       limit 1
    )
  end;
$$;

create or replace function public.fn_is_member(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.fn_user_role(p_project_id) is not null;
$$;

-- true se o usuário tem um dos papéis informados no projeto.
-- super_admin SEMPRE retorna true (não precisa constar na lista).
create or replace function public.fn_has_role(p_project_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.fn_user_role(p_project_id) = 'super_admin'
    or public.fn_user_role(p_project_id) = any (p_roles),
    false
  );
$$;

-- "Vê o projeto inteiro": todos os papéis, exceto prestador (que só vê as próprias OS).
create or replace function public.fn_can_view_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.fn_has_role(p_project_id, array['diretor', 'gerente', 'usuario_chave', 'analista']);
$$;

-- Resolve o project_id de registros filhos (SECURITY DEFINER para não depender da RLS)
create or replace function public.fn_project_of_document(p_id uuid)
returns uuid language sql stable security definer set search_path = public
as $$ select project_id from public.documents where id = p_id; $$;

create or replace function public.fn_project_of_wbs(p_id uuid)
returns uuid language sql stable security definer set search_path = public
as $$ select project_id from public.wbs_items where id = p_id; $$;

create or replace function public.fn_project_of_meeting(p_id uuid)
returns uuid language sql stable security definer set search_path = public
as $$ select project_id from public.meetings where id = p_id; $$;

create or replace function public.fn_project_of_os(p_id uuid)
returns uuid language sql stable security definer set search_path = public
as $$ select project_id from public.service_orders where id = p_id; $$;

create or replace function public.fn_project_of_group(p_id uuid)
returns uuid language sql stable security definer set search_path = public
as $$ select project_id from public.wa_groups where id = p_id; $$;

-- O usuário logado é o executor da OS?
create or replace function public.fn_is_os_executor(p_os_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.service_orders so
     where so.id = p_os_id and so.executor_id = auth.uid()
  );
$$;

-- O usuário logado compartilha algum projeto (ativo) com p_user_id?
create or replace function public.fn_shares_project(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.project_members a
      join public.project_members b on b.project_id = a.project_id
     where a.user_id = auth.uid() and a.ativo
       and b.user_id = p_user_id
  );
$$;

-- -----------------------------------------------------------------------------
-- Signup: cria o profile a partir de auth.users
-- -----------------------------------------------------------------------------
create or replace function public.fn_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nome, email, telefone_whatsapp)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'nome', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      split_part(new.email, '@', 1)
    ),
    new.email,
    nullif(new.raw_user_meta_data ->> 'telefone_whatsapp', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.fn_handle_new_user();

-- Impede que um usuário comum se promova a super_admin.
create or replace function public.fn_profiles_protege_super_admin()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- auth.uid() nulo = service_role / SQL direto / seed: liberado
  if auth.uid() is not null
     and new.is_super_admin is distinct from old.is_super_admin
     and not public.fn_is_super_admin() then
    raise exception 'Apenas super_admin pode alterar is_super_admin' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace trigger trg_profiles_protege_super_admin
  before update on public.profiles
  for each row execute function public.fn_profiles_protege_super_admin();

-- -----------------------------------------------------------------------------
-- Numeração sequencial por projeto
-- Estratégia: tabela project_counters com upsert atômico
--   insert ... on conflict do update set ultimo = ultimo + 1 returning ultimo
-- O upsert trava a linha (project_id, contador) até o fim da transação, então
-- inserts concorrentes no mesmo projeto ficam serializados e nunca repetem número.
-- Se o insert já trouxer "numero" (ex.: seed/importação), o contador avança até ele.
-- TG_ARGV[0] = nome do contador.
-- -----------------------------------------------------------------------------
create or replace function public.fn_set_numero_sequencial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contador text := tg_argv[0];
  v_numero   integer;
begin
  if new.numero is null then
    insert into public.project_counters as pc (project_id, contador, ultimo)
    values (new.project_id, v_contador, 1)
    on conflict (project_id, contador)
      do update set ultimo = pc.ultimo + 1
    returning pc.ultimo into v_numero;
    new.numero := v_numero;
  else
    insert into public.project_counters as pc (project_id, contador, ultimo)
    values (new.project_id, v_contador, new.numero)
    on conflict (project_id, contador)
      do update set ultimo = greatest(pc.ultimo, excluded.ultimo);
  end if;
  return new;
end;
$$;

create or replace trigger trg_service_orders_numero
  before insert on public.service_orders
  for each row execute function public.fn_set_numero_sequencial('service_orders');

create or replace trigger trg_meetings_numero
  before insert on public.meetings
  for each row execute function public.fn_set_numero_sequencial('meetings');

create or replace trigger trg_baselines_numero
  before insert on public.baselines
  for each row execute function public.fn_set_numero_sequencial('baselines');

-- -----------------------------------------------------------------------------
-- Ordens de Serviço: regras de transição (complementam a RLS, que não
-- consegue restringir colunas/valores por papel)
-- -----------------------------------------------------------------------------
create or replace function public.fn_os_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_role text;
begin
  -- service_role, SQL direto e seed (sem JWT) não passam pelas regras
  if auth.uid() is null then
    return new;
  end if;

  v_role := coalesce(public.fn_user_role(old.project_id), '');

  if new.project_id is distinct from old.project_id then
    raise exception 'Não é permitido mover uma OS para outro projeto' using errcode = '42501';
  end if;

  -- Aceite / recusa: só diretor, usuario_chave ou super_admin
  if new.status is distinct from old.status and new.status in ('aprovada', 'recusada') then
    if v_role not in ('super_admin', 'diretor', 'usuario_chave') then
      raise exception 'Somente diretor ou usuário-chave podem aprovar/recusar OS' using errcode = '42501';
    end if;
    if new.status = 'recusada' and coalesce(btrim(new.aceite_comentario), '') = '' then
      raise exception 'Comentário obrigatório ao recusar a OS' using errcode = '23514';
    end if;
    new.aceite_por := auth.uid();
    new.aceite_em  := now();
  end if;

  -- Executor (analista/prestador): só aponta a própria OS
  if v_role in ('analista', 'prestador') then
    if new.executor_id is distinct from old.executor_id
       or new.wbs_item_id is distinct from old.wbs_item_id
       or new.aceite_por is distinct from old.aceite_por
       or new.aceite_em is distinct from old.aceite_em
       or new.aceite_comentario is distinct from old.aceite_comentario then
      raise exception 'Executor não pode alterar responsável, atividade ou dados de aceite' using errcode = '42501';
    end if;
    if new.status is distinct from old.status
       and new.status not in ('em_execucao', 'aguardando_aceite') then
      raise exception 'Executor só pode iniciar a OS ou enviá-la para aceite' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create or replace trigger trg_service_orders_guard
  before update on public.service_orders
  for each row execute function public.fn_os_guard();

-- Histórico de status (insert e mudança de status)
create or replace function public.fn_os_status_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.os_status_history (os_id, de, para, autor_id, comentario)
    values (new.id, null, new.status, auth.uid(), 'OS criada');
  elsif new.status is distinct from old.status then
    insert into public.os_status_history (os_id, de, para, autor_id, comentario)
    values (
      new.id, old.status, new.status, auth.uid(),
      case when new.status in ('aprovada', 'recusada') then new.aceite_comentario end
    );
  end if;
  return null;
end;
$$;

create or replace trigger trg_service_orders_status_history
  after insert or update of status on public.service_orders
  for each row execute function public.fn_os_status_history();

-- -----------------------------------------------------------------------------
-- Ciência em ata: quem não é gerente/super_admin só pode registrar ciente_em
-- -----------------------------------------------------------------------------
create or replace function public.fn_meeting_participant_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null
     or public.fn_has_role(public.fn_project_of_meeting(old.meeting_id), array['gerente']) then
    return new;
  end if;
  if new.meeting_id is distinct from old.meeting_id
     or new.user_id is distinct from old.user_id
     or new.presenca is distinct from old.presenca then
    raise exception 'Somente o gerente altera participantes e presença' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace trigger trg_meeting_participants_guard
  before update on public.meeting_participants
  for each row execute function public.fn_meeting_participant_guard();

-- -----------------------------------------------------------------------------
-- Integridade da EAP: pai e dependências no mesmo projeto
-- -----------------------------------------------------------------------------
create or replace function public.fn_wbs_item_valida()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.parent_id is not null
     and public.fn_project_of_wbs(new.parent_id) is distinct from new.project_id then
    raise exception 'O item pai da EAP precisa ser do mesmo projeto' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace trigger trg_wbs_items_valida
  before insert or update of parent_id, project_id on public.wbs_items
  for each row execute function public.fn_wbs_item_valida();

create or replace function public.fn_wbs_dependency_valida()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.fn_project_of_wbs(new.predecessora_id) is distinct from public.fn_project_of_wbs(new.sucessora_id) then
    raise exception 'Dependências só entre itens do mesmo projeto' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace trigger trg_wbs_dependencies_valida
  before insert or update on public.wbs_dependencies
  for each row execute function public.fn_wbs_dependency_valida();

-- -----------------------------------------------------------------------------
-- Auditoria genérica
-- dados: INSERT => {"new": ...}; DELETE => {"old": ...};
--        UPDATE => {"old": ..., "new": ..., "alterados": [colunas]}
-- project_id: id do próprio registro em projects; coluna project_id nas demais.
-- -----------------------------------------------------------------------------
create or replace function public.fn_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old  jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new  jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row  jsonb := coalesce(v_new, v_old);
  v_dados jsonb;
  v_alterados jsonb;
begin
  if tg_op = 'UPDATE' then
    select coalesce(jsonb_agg(n.key), '[]'::jsonb)
      into v_alterados
      from jsonb_each(v_new) n
     where n.key <> 'updated_at'
       and n.value is distinct from (v_old -> n.key);

    -- Update sem mudança real (só updated_at): não registra
    if jsonb_array_length(v_alterados) = 0 then
      return null;
    end if;
    v_dados := jsonb_build_object('old', v_old, 'new', v_new, 'alterados', v_alterados);
  elsif tg_op = 'INSERT' then
    v_dados := jsonb_build_object('new', v_new);
  else
    v_dados := jsonb_build_object('old', v_old);
  end if;

  insert into public.audit_log (project_id, tabela, registro_id, acao, autor_id, dados)
  values (
    case when tg_table_name = 'projects'
         then (v_row ->> 'id')::uuid
         else (v_row ->> 'project_id')::uuid end,
    tg_table_name,
    (v_row ->> 'id')::uuid,
    tg_op::public.audit_acao,
    auth.uid(),
    v_dados
  );
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['projects', 'documents', 'wbs_items', 'meetings', 'service_orders']
  loop
    execute format(
      'create or replace trigger trg_%1$s_audit
         after insert or update or delete on public.%1$I
         for each row execute function public.fn_audit()', t);
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- Status da sessão OpenWA para membros (sem expor api_key_secret_id nem a URL)
-- A tabela wa_sessions é restrita ao super_admin; o app usa esta função.
-- -----------------------------------------------------------------------------
create or replace function public.fn_wa_status(p_project_id uuid)
returns table (
  session_id      uuid,
  numero          text,
  status          public.wa_session_status,
  last_heartbeat  timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.numero, s.status, s.last_heartbeat
    from public.wa_sessions s
   where s.project_id = p_project_id
     and public.fn_can_view_project(p_project_id);
$$;
