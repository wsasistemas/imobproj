-- =============================================================================
-- IMOBPROJ — Fase 2: Perfis e permissões (decisão D1 do plano)
-- Migration ADITIVA: só create ... if not exists / add column if not exists / políticas novas.
--   * perfis + perfil_permissoes: o perfil define os menus e as ações (ver, criar, editar, excluir,
--     aprovar) no sistema todo. O papel por projeto continua em project_members;
--   * profiles.perfil: chave do perfil da pessoa (texto, não uuid: a Central de Acessos
--     — acessos.provisionar — grava a CHAVE do perfil em <schema>.usuarios.perfil);
--   * view imobproj.usuarios (id, email, perfil, ativo) sobre profiles: é o "cadastro próprio no
--     aplicativo" que acessos.tem_cadastro/provisionar procuram em todo schema. Assim quem tem
--     profile ativo conta como cadastrado e a liberação pela Central cria o profile (D3);
--   * imobproj.pode(menu, acao) e imobproj.minhas_permissoes(): usadas pelo menu, pelas telas,
--     pelas Server Actions e pelas políticas novas abaixo.
-- Super admin (profiles.is_super_admin) continua tendo acesso total e não depende de perfil.
-- =============================================================================

create table if not exists imobproj.perfis (
  chave       text primary key check (chave ~ '^[a-z_][a-z0-9_]{0,40}$'),
  nome        text not null,
  descricao   text,
  -- Ordem na lista; o MAIOR é o mais restrito (acessos.provisionar usa o de maior ordem por padrão).
  ordem       integer not null default 100,
  -- Fixo: Super admin. Não se edita nem se exclui.
  fixo        boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists imobproj.perfil_permissoes (
  perfil      text not null references imobproj.perfis (chave) on update cascade on delete cascade,
  -- id do item em src/config/menu.ts (ex.: cadastros_clientes)
  menu        text not null,
  ver         boolean not null default false,
  criar       boolean not null default false,
  editar      boolean not null default false,
  excluir     boolean not null default false,
  aprovar     boolean not null default false,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null,
  primary key (perfil, menu)
);

alter table imobproj.profiles
  add column if not exists perfil text references imobproj.perfis (chave) on update cascade on delete set null;
create index if not exists profiles_perfil_idx on imobproj.profiles (perfil);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_perfis_updated_at') then
    create trigger trg_perfis_updated_at before update on imobproj.perfis
      for each row execute function imobproj.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_perfil_permissoes_updated_at') then
    create trigger trg_perfil_permissoes_updated_at before update on imobproj.perfil_permissoes
      for each row execute function imobproj.set_updated_at();
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Perfis iniciais e as permissões de cada um (só entram se ainda não existirem)
-- -----------------------------------------------------------------------------
insert into imobproj.perfis (chave, nome, descricao, ordem, fixo) values
  ('super_admin',   'Super admin',             'Acesso total, não editável',                 0,  true),
  ('gerente',       'Gerente de projetos',     'Planeja, acompanha e aprova o trabalho',      10, false),
  ('analista',      'Analista',                'Executa e registra o trabalho dos projetos',  20, false),
  ('atendente',     'Atendente',               'Atende os clientes no WhatsApp',              30, false),
  ('usuario_chave', 'Usuário-chave (cliente)', 'Acompanha o projeto e aprova as OS',          40, false),
  ('prestador',     'Prestador',               'Só o app de OS e as OS em que trabalha',      50, false)
on conflict (chave) do nothing;

insert into imobproj.perfil_permissoes (perfil, menu, ver, criar, editar, excluir, aprovar)
select v.perfil, v.menu, v.ver, v.criar, v.editar, v.excluir, v.aprovar
from (values
  -- Gerente de projetos
  ('gerente', 'inicio',                 true,  false, false, false, false),
  ('gerente', 'projetos',               true,  true,  true,  false, true),
  ('gerente', 'projetos_visao_geral',   true,  false, false, false, false),
  ('gerente', 'projetos_documentacao',  true,  true,  true,  true,  true),
  ('gerente', 'projetos_cronograma',    true,  true,  true,  true,  true),
  ('gerente', 'projetos_atas',          true,  true,  true,  true,  true),
  ('gerente', 'projetos_os',            true,  true,  true,  false, true),
  ('gerente', 'conversas',              true,  true,  true,  false, false),
  ('gerente', 'cadastros_clientes',     true,  true,  true,  false, false),
  ('gerente', 'cadastros_usuarios',     true,  false, false, false, false),
  ('gerente', 'cadastros_equipes',      true,  true,  true,  false, false),
  -- Analista
  ('analista', 'inicio',                true,  false, false, false, false),
  ('analista', 'projetos',              true,  false, false, false, false),
  ('analista', 'projetos_visao_geral',  true,  false, false, false, false),
  ('analista', 'projetos_documentacao', true,  true,  true,  false, false),
  ('analista', 'projetos_cronograma',   true,  true,  true,  false, false),
  ('analista', 'projetos_atas',         true,  true,  true,  false, false),
  ('analista', 'projetos_os',           true,  true,  true,  false, false),
  ('analista', 'conversas',             true,  true,  false, false, false),
  ('analista', 'cadastros_clientes',    true,  false, false, false, false),
  ('analista', 'cadastros_equipes',     true,  false, false, false, false),
  -- Atendente
  ('atendente', 'inicio',               true,  false, false, false, false),
  ('atendente', 'conversas',            true,  true,  true,  false, false),
  ('atendente', 'cadastros_clientes',   true,  false, false, false, false),
  -- Usuário-chave (cliente)
  ('usuario_chave', 'inicio',               true, false, false, false, false),
  ('usuario_chave', 'projetos',             true, false, false, false, false),
  ('usuario_chave', 'projetos_visao_geral', true, false, false, false, false),
  ('usuario_chave', 'projetos_documentacao',true, false, false, false, true),
  ('usuario_chave', 'projetos_cronograma',  true, false, false, false, false),
  ('usuario_chave', 'projetos_atas',        true, false, false, false, true),
  ('usuario_chave', 'projetos_os',          true, false, false, false, true),
  -- Prestador
  ('prestador', 'inicio',               true,  false, false, false, false),
  ('prestador', 'projetos',             true,  false, false, false, false),
  ('prestador', 'projetos_os',          true,  true,  true,  false, false)
) as v(perfil, menu, ver, criar, editar, excluir, aprovar)
on conflict (perfil, menu) do nothing;

-- Quem já existe ganha o perfil do maior papel que tem nos projetos (só onde ainda está vazio).
update imobproj.profiles p
   set perfil = case
     when exists (select 1 from imobproj.project_members m where m.user_id = p.id and m.ativo and m.role in ('diretor', 'gerente')) then 'gerente'
     when exists (select 1 from imobproj.project_members m where m.user_id = p.id and m.ativo and m.role = 'analista') then 'analista'
     when exists (select 1 from imobproj.project_members m where m.user_id = p.id and m.ativo and m.role = 'usuario_chave') then 'usuario_chave'
     when exists (select 1 from imobproj.project_members m where m.user_id = p.id and m.ativo and m.role = 'prestador') then 'prestador'
     when p.atende_whatsapp then 'atendente'
     else 'analista'
   end
 where p.perfil is null and not p.is_super_admin;

-- -----------------------------------------------------------------------------
-- Funções
-- -----------------------------------------------------------------------------
-- Pode o usuário logado fazer `p_acao` no menu `p_menu`? Ação diferente de "ver" exige "ver".
create or replace function imobproj.pode(p_menu text, p_acao text default 'ver')
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select auth.uid()) is null then false
    when imobproj.fn_is_super_admin() then true
    else coalesce((
      select pp.ver and case p_acao
               when 'ver' then true
               when 'criar' then pp.criar
               when 'editar' then pp.editar
               when 'excluir' then pp.excluir
               when 'aprovar' then pp.aprovar
               else false
             end
        from imobproj.profiles p
        join imobproj.perfil_permissoes pp on pp.perfil = p.perfil and pp.menu = p_menu
       where p.id = (select auth.uid()) and p.ativo
    ), false)
  end
$$;

-- Permissões do usuário logado, para o menu e as telas numa chamada só.
-- Super admin: devolve super_admin = true e nenhuma linha (vê tudo).
create or replace function imobproj.minhas_permissoes()
returns table (super_admin boolean, perfil text, menu text, ver boolean, criar boolean, editar boolean, excluir boolean, aprovar boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select true, 'super_admin'::text, null::text, true, true, true, true, true
   where imobproj.fn_is_super_admin()
  union all
  select false, p.perfil, pp.menu, pp.ver, pp.ver and pp.criar, pp.ver and pp.editar, pp.ver and pp.excluir, pp.ver and pp.aprovar
    from imobproj.profiles p
    join imobproj.perfil_permissoes pp on pp.perfil = p.perfil
   where p.id = (select auth.uid()) and p.ativo and not imobproj.fn_is_super_admin()
$$;

revoke all on function imobproj.pode(text, text) from public, anon;
revoke all on function imobproj.minhas_permissoes() from public, anon;
grant execute on function imobproj.pode(text, text) to authenticated, service_role;
grant execute on function imobproj.minhas_permissoes() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- "Cadastro no aplicativo" para a Central de Acessos (schema acessos, compartilhado)
-- -----------------------------------------------------------------------------
-- View simples (atualizável): acessos.provisionar faz INSERT ... ON CONFLICT (id) aqui ao liberar
-- alguém sem cadastro. Ninguém da API lê ou grava por ela: só as funções da Central (definer).
create or replace view imobproj.usuarios as
  select p.id, p.email, p.perfil, p.ativo from imobproj.profiles p;
revoke all on imobproj.usuarios from public, anon, authenticated;
grant select, insert, update on imobproj.usuarios to service_role;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table imobproj.perfis enable row level security;
alter table imobproj.perfil_permissoes enable row level security;
grant select, insert, update, delete on imobproj.perfis, imobproj.perfil_permissoes to authenticated;
grant all on imobproj.perfis, imobproj.perfil_permissoes to service_role;

drop policy if exists perfis_select on imobproj.perfis;
create policy perfis_select on imobproj.perfis for select to authenticated using (true);
drop policy if exists perfis_write on imobproj.perfis;
create policy perfis_write on imobproj.perfis for all to authenticated
  using (imobproj.fn_is_super_admin() and not fixo)
  with check (imobproj.fn_is_super_admin() and not fixo);

drop policy if exists perfil_permissoes_select on imobproj.perfil_permissoes;
create policy perfil_permissoes_select on imobproj.perfil_permissoes for select to authenticated using (true);
drop policy if exists perfil_permissoes_write on imobproj.perfil_permissoes;
create policy perfil_permissoes_write on imobproj.perfil_permissoes for all to authenticated
  using (imobproj.fn_is_super_admin() and perfil <> 'super_admin')
  with check (imobproj.fn_is_super_admin() and perfil <> 'super_admin');

-- Cadastros: além do super admin (políticas da Fase 1), quem o perfil autoriza.
-- Políticas permissivas somam (OR) com as existentes.
drop policy if exists organizations_ins_perfil on imobproj.organizations;
create policy organizations_ins_perfil on imobproj.organizations for insert to authenticated
  with check (imobproj.pode('cadastros_clientes', 'criar'));
drop policy if exists organizations_upd_perfil on imobproj.organizations;
create policy organizations_upd_perfil on imobproj.organizations for update to authenticated
  using (imobproj.pode('cadastros_clientes', 'editar')) with check (imobproj.pode('cadastros_clientes', 'editar'));
drop policy if exists organizations_del_perfil on imobproj.organizations;
create policy organizations_del_perfil on imobproj.organizations for delete to authenticated
  using (imobproj.pode('cadastros_clientes', 'excluir'));

drop policy if exists organization_contacts_write_perfil on imobproj.organization_contacts;
create policy organization_contacts_write_perfil on imobproj.organization_contacts for all to authenticated
  using (imobproj.pode('cadastros_clientes', 'editar')) with check (imobproj.pode('cadastros_clientes', 'editar'));

drop policy if exists teams_ins_perfil on imobproj.teams;
create policy teams_ins_perfil on imobproj.teams for insert to authenticated
  with check (imobproj.pode('cadastros_equipes', 'criar'));
drop policy if exists teams_upd_perfil on imobproj.teams;
create policy teams_upd_perfil on imobproj.teams for update to authenticated
  using (imobproj.pode('cadastros_equipes', 'editar')) with check (imobproj.pode('cadastros_equipes', 'editar'));
drop policy if exists teams_del_perfil on imobproj.teams;
create policy teams_del_perfil on imobproj.teams for delete to authenticated
  using (imobproj.pode('cadastros_equipes', 'excluir'));

drop policy if exists team_members_write_perfil on imobproj.team_members;
create policy team_members_write_perfil on imobproj.team_members for all to authenticated
  using (imobproj.pode('cadastros_equipes', 'editar')) with check (imobproj.pode('cadastros_equipes', 'editar'));

drop policy if exists profiles_select_perfil on imobproj.profiles;
create policy profiles_select_perfil on imobproj.profiles for select to authenticated
  using (imobproj.pode('cadastros_usuarios', 'ver') or imobproj.pode('cadastros_equipes', 'ver'));
drop policy if exists profiles_update_perfil on imobproj.profiles;
create policy profiles_update_perfil on imobproj.profiles for update to authenticated
  using (imobproj.pode('cadastros_usuarios', 'editar')) with check (imobproj.pode('cadastros_usuarios', 'editar'));

-- Só o super admin troca o perfil de alguém (quem edita usuários não pode se promover).
create or replace function imobproj.fn_profiles_protege_perfil()
returns trigger
language plpgsql
set search_path = imobproj, extensions
as $$
begin
  -- auth.uid() nulo = service_role / SQL direto / seed / Central de Acessos: liberado
  if auth.uid() is not null
     and new.perfil is distinct from old.perfil
     and not imobproj.fn_is_super_admin() then
    raise exception 'Só o super admin pode trocar o perfil de acesso.' using errcode = '42501';
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_profiles_protege_perfil') then
    create trigger trg_profiles_protege_perfil before update on imobproj.profiles
      for each row execute function imobproj.fn_profiles_protege_perfil();
  end if;
end $$;
