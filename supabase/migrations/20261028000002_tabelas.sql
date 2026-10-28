-- =============================================================================
-- IMOBPROJ · 002 · Tabelas e índices (PARTE C do PRD)
-- Convenções:
--   * chave primária uuid default gen_random_uuid();
--   * created_at / updated_at timestamptz default now() em todas as tabelas
--     (updated_at é mantido pelo trigger set_updated_at, migration 003);
--   * referências a pessoas apontam para public.profiles(id) com on delete set null,
--     exceto vínculos de associação (membros, participantes), que usam cascade;
--   * tudo com "if not exists" para ser reaplicável.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Organizações e pessoas
-- -----------------------------------------------------------------------------
create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  tipo        public.org_tipo not null,
  cnpj        text unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists organizations_tipo_idx on public.organizations (tipo);

create table if not exists public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  nome               text not null default '',
  email              text,
  telefone_whatsapp  text,
  avatar_url         text,
  is_super_admin     boolean not null default false,
  -- Coluna extra (fora da PARTE C): organização a que a pessoa pertence (ex.: prestador)
  organization_id    uuid references public.organizations (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists profiles_email_idx on public.profiles (lower(email));
create index if not exists profiles_organization_idx on public.profiles (organization_id);
create index if not exists profiles_telefone_idx on public.profiles (telefone_whatsapp);
comment on column public.profiles.is_super_admin is 'Super administrador global: acesso total. Só outro super_admin (ou service_role) pode alterar.';

-- -----------------------------------------------------------------------------
-- Projetos e membros
-- -----------------------------------------------------------------------------
create table if not exists public.projects (
  id                uuid primary key default gen_random_uuid(),
  codigo            text not null unique,
  nome              text not null,
  cliente_org_id    uuid references public.organizations (id) on delete restrict,
  executora_org_id  uuid references public.organizations (id) on delete restrict,
  inicio            date,
  fim               date,
  status            public.project_status not null default 'planejamento',
  horas_orcadas     numeric(10,2) not null default 0 check (horas_orcadas >= 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint projects_periodo_chk check (fim is null or inicio is null or fim >= inicio)
);
create index if not exists projects_cliente_idx on public.projects (cliente_org_id);
create index if not exists projects_executora_idx on public.projects (executora_org_id);
create index if not exists projects_status_idx on public.projects (status);

create table if not exists public.project_members (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        public.member_role not null,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint project_members_unq unique (project_id, user_id)
);
create index if not exists project_members_user_idx on public.project_members (user_id) where ativo;
create index if not exists project_members_role_idx on public.project_members (project_id, role);

-- Contadores por projeto usados na numeração sequencial (OS, atas, linhas de base).
-- Acessado apenas por função SECURITY DEFINER; sem políticas de RLS => invisível ao cliente.
create table if not exists public.project_counters (
  project_id  uuid not null references public.projects (id) on delete cascade,
  contador    text not null,           -- 'service_orders' | 'meetings' | 'baselines'
  ultimo      integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (project_id, contador)
);

-- -----------------------------------------------------------------------------
-- Documentação
-- -----------------------------------------------------------------------------
create table if not exists public.documents (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  tipo          public.document_tipo not null default 'outro',
  titulo        text not null,
  versao        text not null default '1.0',
  status        public.document_status not null default 'rascunho',
  storage_path  text,                  -- caminho no bucket "documentos": <project_id>/...
  conteudo      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists documents_project_idx on public.documents (project_id, tipo);
create index if not exists documents_status_idx on public.documents (project_id, status);

create table if not exists public.document_comments (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references public.documents (id) on delete cascade,
  autor_id     uuid references public.profiles (id) on delete set null,
  texto        text not null,
  resolvido    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists document_comments_document_idx on public.document_comments (document_id, created_at);
create index if not exists document_comments_autor_idx on public.document_comments (autor_id);

-- -----------------------------------------------------------------------------
-- EAP, dependências, linha de base e mudanças de cronograma
-- -----------------------------------------------------------------------------
create table if not exists public.wbs_items (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects (id) on delete cascade,
  parent_id       uuid references public.wbs_items (id) on delete cascade,
  codigo          text not null,         -- ex.: 1, 1.1, 1.1.2
  titulo          text not null,
  responsavel_id  uuid references public.profiles (id) on delete set null,
  horas_orcadas   numeric(10,2) not null default 0 check (horas_orcadas >= 0),
  inicio          date,
  fim             date,
  ordem           integer not null default 0,
  is_milestone    boolean not null default false,
  is_fase         boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint wbs_items_codigo_unq unique (project_id, codigo),
  constraint wbs_items_periodo_chk check (fim is null or inicio is null or fim >= inicio),
  constraint wbs_items_parent_chk check (parent_id is null or parent_id <> id)
);
create index if not exists wbs_items_project_idx on public.wbs_items (project_id, ordem);
create index if not exists wbs_items_parent_idx on public.wbs_items (parent_id);
create index if not exists wbs_items_responsavel_idx on public.wbs_items (responsavel_id);
create index if not exists wbs_items_periodo_idx on public.wbs_items (project_id, inicio, fim);

create table if not exists public.wbs_dependencies (
  id               uuid primary key default gen_random_uuid(),
  predecessora_id  uuid not null references public.wbs_items (id) on delete cascade,
  sucessora_id     uuid not null references public.wbs_items (id) on delete cascade,
  tipo             public.dependency_tipo not null default 'FS',
  lag_dias         integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint wbs_dependencies_unq unique (predecessora_id, sucessora_id),
  constraint wbs_dependencies_self_chk check (predecessora_id <> sucessora_id)
);
create index if not exists wbs_dependencies_sucessora_idx on public.wbs_dependencies (sucessora_id);

create table if not exists public.baselines (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  numero        integer not null,        -- sequencial por projeto (trigger)
  congelada_em  timestamptz not null default now(),
  snapshot      jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint baselines_numero_unq unique (project_id, numero)
);

create table if not exists public.schedule_changes (
  id             uuid primary key default gen_random_uuid(),
  wbs_item_id    uuid not null references public.wbs_items (id) on delete cascade,
  autor_id       uuid references public.profiles (id) on delete set null,
  de             jsonb not null default '{}'::jsonb,
  para           jsonb not null default '{}'::jsonb,
  justificativa  text not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists schedule_changes_wbs_idx on public.schedule_changes (wbs_item_id, created_at desc);
create index if not exists schedule_changes_autor_idx on public.schedule_changes (autor_id);

-- -----------------------------------------------------------------------------
-- Atas de reunião
-- -----------------------------------------------------------------------------
create table if not exists public.meetings (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  numero      integer not null,          -- sequencial por projeto (trigger)
  titulo      text not null,
  data        date not null,
  inicio      time,
  fim         time,
  local       text,
  pauta       jsonb not null default '[]'::jsonb,
  decisoes    jsonb not null default '[]'::jsonb,
  status      public.meeting_status not null default 'rascunho',
  redator_id  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint meetings_numero_unq unique (project_id, numero)
);
create index if not exists meetings_project_data_idx on public.meetings (project_id, data desc);
create index if not exists meetings_redator_idx on public.meetings (redator_id);

create table if not exists public.meeting_participants (
  id          uuid primary key default gen_random_uuid(),
  meeting_id  uuid not null references public.meetings (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  presenca    public.presenca_tipo not null default 'presente',
  ciente_em   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint meeting_participants_unq unique (meeting_id, user_id)
);
create index if not exists meeting_participants_user_idx on public.meeting_participants (user_id);

-- -----------------------------------------------------------------------------
-- Ordens de Serviço (antes de calendar_events/meeting_actions por causa das FKs)
-- -----------------------------------------------------------------------------
create table if not exists public.service_orders (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references public.projects (id) on delete cascade,
  numero             integer not null,   -- sequencial por projeto (trigger)
  wbs_item_id        uuid references public.wbs_items (id) on delete set null,
  executor_id        uuid references public.profiles (id) on delete set null,
  titulo             text not null,
  descricao          text,
  agendada_inicio    timestamptz,
  agendada_fim       timestamptz,
  checkin_at         timestamptz,
  checkout_at        timestamptz,
  checkin_lat        double precision,
  checkin_lng        double precision,
  horas              numeric(8,2) not null default 0 check (horas >= 0),
  status             public.os_status not null default 'rascunho',
  fora_escopo        boolean not null default false,
  aceite_por         uuid references public.profiles (id) on delete set null,
  aceite_em          timestamptz,
  aceite_comentario  text,
  origem             public.os_origem not null default 'portal',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint service_orders_numero_unq unique (project_id, numero),
  constraint service_orders_agenda_chk check (agendada_fim is null or agendada_inicio is null or agendada_fim >= agendada_inicio),
  constraint service_orders_check_chk check (checkout_at is null or checkin_at is null or checkout_at >= checkin_at)
);
create index if not exists service_orders_project_status_idx on public.service_orders (project_id, status);
create index if not exists service_orders_executor_idx on public.service_orders (executor_id, status);
create index if not exists service_orders_wbs_idx on public.service_orders (wbs_item_id);
create index if not exists service_orders_aceite_por_idx on public.service_orders (aceite_por);
create index if not exists service_orders_agenda_idx on public.service_orders (project_id, agendada_inicio);

create table if not exists public.os_evidences (
  id            uuid primary key default gen_random_uuid(),
  os_id         uuid not null references public.service_orders (id) on delete cascade,
  tipo          public.evidence_tipo not null default 'foto',
  storage_path  text not null,           -- bucket "evidencias": <project_id>/<os_id>/arquivo
  captured_at   timestamptz not null default now(),
  lat           double precision,
  lng           double precision,
  origem        public.os_origem not null default 'portal',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists os_evidences_os_idx on public.os_evidences (os_id, captured_at);

create table if not exists public.os_status_history (
  id          uuid primary key default gen_random_uuid(),
  os_id       uuid not null references public.service_orders (id) on delete cascade,
  de          public.os_status,          -- null na criação
  para        public.os_status not null,
  autor_id    uuid references public.profiles (id) on delete set null,
  comentario  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists os_status_history_os_idx on public.os_status_history (os_id, created_at);
create index if not exists os_status_history_autor_idx on public.os_status_history (autor_id);

create table if not exists public.scope_proposals (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  os_id       uuid references public.service_orders (id) on delete set null,
  descricao   text not null,
  horas       numeric(8,2) not null default 0 check (horas >= 0),
  valor       numeric(12,2) check (valor is null or valor >= 0),
  status      public.scope_status not null default 'pendente',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists scope_proposals_project_idx on public.scope_proposals (project_id, status);
create index if not exists scope_proposals_os_idx on public.scope_proposals (os_id);

-- -----------------------------------------------------------------------------
-- Encaminhamentos de ata e agenda
-- -----------------------------------------------------------------------------
create table if not exists public.meeting_actions (
  id                   uuid primary key default gen_random_uuid(),
  meeting_id           uuid not null references public.meetings (id) on delete cascade,
  acao                 text not null,
  responsavel_id       uuid references public.profiles (id) on delete set null,
  prazo                date,
  status               public.action_status not null default 'aberta',
  wbs_item_id          uuid references public.wbs_items (id) on delete set null,
  vincular_cronograma  boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists meeting_actions_meeting_idx on public.meeting_actions (meeting_id);
create index if not exists meeting_actions_responsavel_idx on public.meeting_actions (responsavel_id, status);
create index if not exists meeting_actions_wbs_idx on public.meeting_actions (wbs_item_id);

create table if not exists public.calendar_events (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects (id) on delete cascade,
  tipo             public.event_tipo not null,
  wbs_item_id      uuid references public.wbs_items (id) on delete cascade,
  os_id            uuid references public.service_orders (id) on delete cascade,
  meeting_id       uuid references public.meetings (id) on delete cascade,
  titulo           text not null,
  inicio           timestamptz not null,
  fim              timestamptz,
  local            text,
  google_event_id  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint calendar_events_periodo_chk check (fim is null or fim >= inicio)
);
create index if not exists calendar_events_project_inicio_idx on public.calendar_events (project_id, inicio);
create index if not exists calendar_events_tipo_idx on public.calendar_events (project_id, tipo);
create index if not exists calendar_events_wbs_idx on public.calendar_events (wbs_item_id);
create index if not exists calendar_events_os_idx on public.calendar_events (os_id);
create index if not exists calendar_events_meeting_idx on public.calendar_events (meeting_id);

-- -----------------------------------------------------------------------------
-- WhatsApp (OpenWA)
-- -----------------------------------------------------------------------------
create table if not exists public.wa_sessions (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references public.projects (id) on delete cascade,
  numero             text not null,
  openwa_url         text not null,
  -- id do segredo no Supabase Vault (vault.secrets.id). A API key NUNCA fica nesta tabela.
  api_key_secret_id  uuid,
  status             public.wa_session_status not null default 'desconectado',
  last_heartbeat     timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists wa_sessions_project_idx on public.wa_sessions (project_id);
comment on column public.wa_sessions.api_key_secret_id is 'UUID do segredo no Supabase Vault com a API key do OpenWA (ler via vault.decrypted_secrets apenas em Edge Function/service_role).';

create table if not exists public.wa_groups (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects (id) on delete cascade,
  session_id      uuid references public.wa_sessions (id) on delete set null,
  equipe          text not null,
  nome            text not null,
  wa_group_id     text unique,           -- id do grupo no WhatsApp (ex.: 1203...@g.us)
  ativo           boolean not null default true,
  auto_evidencia  boolean not null default false,
  auto_os         boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists wa_groups_project_idx on public.wa_groups (project_id, ativo);
create index if not exists wa_groups_session_idx on public.wa_groups (session_id);

create table if not exists public.wa_group_members (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.wa_groups (id) on delete cascade,
  user_id     uuid references public.profiles (id) on delete set null,
  telefone    text not null,
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint wa_group_members_unq unique (group_id, telefone)
);
create index if not exists wa_group_members_user_idx on public.wa_group_members (user_id);

create table if not exists public.wa_messages (
  id                    uuid primary key default gen_random_uuid(),
  group_id              uuid not null references public.wa_groups (id) on delete cascade,
  wa_message_id         text unique,     -- null enquanto a mensagem de saída não foi enviada
  direction             public.wa_direction not null,
  author_phone          text,
  author_user_id        uuid references public.profiles (id) on delete set null,
  body                  text,
  media_path            text,
  quoted_wa_message_id  text,
  status                public.wa_message_status not null default 'recebida',
  tentativas            integer not null default 0 check (tentativas >= 0),
  erro                  text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists wa_messages_group_created_idx on public.wa_messages (group_id, created_at desc);
create index if not exists wa_messages_author_idx on public.wa_messages (author_user_id);
-- Fila de reenvio (pg_cron): só mensagens de saída pendentes/falhas
create index if not exists wa_messages_fila_idx on public.wa_messages (status, tentativas)
  where direction = 'out' and status in ('pendente', 'falhou');

-- -----------------------------------------------------------------------------
-- Auditoria
-- -----------------------------------------------------------------------------
create table if not exists public.audit_log (
  id           uuid primary key default gen_random_uuid(),
  -- Coluna extra (fora da PARTE C) para facilitar RLS e o feed por projeto.
  -- Sem FK de propósito: o log precisa sobreviver à exclusão do projeto.
  project_id   uuid,
  tabela       text not null,
  registro_id  uuid,
  acao         public.audit_acao not null,
  autor_id     uuid references public.profiles (id) on delete set null,
  dados        jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists audit_log_project_idx on public.audit_log (project_id, created_at desc);
create index if not exists audit_log_registro_idx on public.audit_log (tabela, registro_id);
create index if not exists audit_log_autor_idx on public.audit_log (autor_id);
