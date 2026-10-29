-- =============================================================================
-- IMOBPROJ — Fase 1: Cadastros (Clientes, Usuários e Equipes)
-- Migration ADITIVA: só add column if not exists / create table if not exists.
--   * organizations: nome fantasia, segmento, endereço, situação;
--   * organization_contacts: contatos de cada empresa (o principal aparece na lista de Clientes);
--   * profiles: cargo, situação e "atende no WhatsApp";
--   * teams + team_members: grupos de pessoas (o setor vira FK na Fase 3).
-- Leitura: autenticados. Escrita: só super admin (igual a organizations).
-- =============================================================================

alter table imobproj.organizations add column if not exists nome_fantasia text;
alter table imobproj.organizations add column if not exists segmento      text;
alter table imobproj.organizations add column if not exists endereco      text;
alter table imobproj.organizations add column if not exists ativo         boolean not null default true;

alter table imobproj.profiles add column if not exists cargo            text;
alter table imobproj.profiles add column if not exists ativo            boolean not null default true;
alter table imobproj.profiles add column if not exists atende_whatsapp  boolean not null default false;

create table if not exists imobproj.organization_contacts (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references imobproj.organizations (id) on delete cascade,
  nome               text not null,
  cargo              text,
  email              text,
  telefone_whatsapp  text,
  principal          boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists organization_contacts_org_idx on imobproj.organization_contacts (organization_id);
-- No máximo um contato principal por empresa.
create unique index if not exists organization_contacts_principal_unq
  on imobproj.organization_contacts (organization_id) where principal;

create table if not exists imobproj.teams (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  setor       text,
  lider_id    uuid references imobproj.profiles (id) on delete set null,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists teams_nome_unq on imobproj.teams (lower(nome));

create table if not exists imobproj.team_members (
  team_id     uuid not null references imobproj.teams (id) on delete cascade,
  user_id     uuid not null references imobproj.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index if not exists team_members_user_idx on imobproj.team_members (user_id);

-- updated_at automático
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_organization_contacts_updated_at') then
    create trigger trg_organization_contacts_updated_at before update on imobproj.organization_contacts
      for each row execute function imobproj.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_teams_updated_at') then
    create trigger trg_teams_updated_at before update on imobproj.teams
      for each row execute function imobproj.set_updated_at();
  end if;
end $$;

-- Grants (mesmo padrão das outras tabelas do schema)
grant select, insert, update, delete on imobproj.organization_contacts, imobproj.teams, imobproj.team_members to authenticated;
grant all on imobproj.organization_contacts, imobproj.teams, imobproj.team_members to service_role;

-- RLS
alter table imobproj.organization_contacts enable row level security;
alter table imobproj.teams enable row level security;
alter table imobproj.team_members enable row level security;

drop policy if exists organization_contacts_select on imobproj.organization_contacts;
create policy organization_contacts_select on imobproj.organization_contacts
  for select to authenticated using (true);
drop policy if exists organization_contacts_write on imobproj.organization_contacts;
create policy organization_contacts_write on imobproj.organization_contacts
  for all to authenticated
  using (imobproj.fn_is_super_admin())
  with check (imobproj.fn_is_super_admin());

drop policy if exists teams_select on imobproj.teams;
create policy teams_select on imobproj.teams
  for select to authenticated using (true);
drop policy if exists teams_write on imobproj.teams;
create policy teams_write on imobproj.teams
  for all to authenticated
  using (imobproj.fn_is_super_admin())
  with check (imobproj.fn_is_super_admin());

drop policy if exists team_members_select on imobproj.team_members;
create policy team_members_select on imobproj.team_members
  for select to authenticated using (true);
drop policy if exists team_members_write on imobproj.team_members;
create policy team_members_write on imobproj.team_members
  for all to authenticated
  using (imobproj.fn_is_super_admin())
  with check (imobproj.fn_is_super_admin());
