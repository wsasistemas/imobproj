-- =============================================================================
-- IMOBPROJ — Fase 1 do plano docs/PLANO-conversas-numeros-monitor.md
-- Vários números, grupo → equipe → projeto, Monitor de conversas e Anotações da equipe.
-- Migration ADITIVA: só create ... if not exists / add column if not exists / create or replace.
--
-- Decisões do Wagner (29/10/2026):
--   D1 o número (wa_sessions) é do projeto, em nome da empresa contratante: project_id continua obrigatório.
--   D2 equipe pode atender vários projetos (project_teams, N:N).
--   D3 um grupo = 1 projeto + 1 equipe + 1 número do mesmo projeto.
--   D4 "online agora" = mensagem nos últimos 15 min.
--   D5 30 dias sem mensagem → o grupo vai para "Anotações da equipe" (só leitura, sem OS/evidência).
--   D6 Monitor só para gerente, diretor e super admin.
--   D8 Anotações: membros da equipe do grupo; gerente, diretor e super admin veem todas.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Equipes que atendem cada projeto (D2)
-- -----------------------------------------------------------------------------
create table if not exists imobproj.project_teams (
  project_id  uuid not null references imobproj.projects (id) on delete cascade,
  team_id     uuid not null references imobproj.teams (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (project_id, team_id)
);
create index if not exists project_teams_team_idx on imobproj.project_teams (team_id);

comment on table imobproj.project_teams is
  'Equipes que atendem cada projeto (N:N). O grupo do WhatsApp só pode ser ligado a uma equipe do seu projeto.';

-- -----------------------------------------------------------------------------
-- Grupo: equipe do cadastro e data em que foi para Anotações da equipe
-- -----------------------------------------------------------------------------
alter table imobproj.wa_groups add column if not exists team_id uuid references imobproj.teams (id) on delete set null;
alter table imobproj.wa_groups add column if not exists anotacao_desde timestamptz;
create index if not exists wa_groups_team_idx on imobproj.wa_groups (team_id);
create index if not exists wa_groups_anotacao_idx on imobproj.wa_groups (project_id) where anotacao_desde is not null;
create index if not exists wa_messages_group_created_idx on imobproj.wa_messages (group_id, created_at desc);

comment on column imobproj.wa_groups.team_id is
  'Equipe (cadastro) que atende o grupo. O texto "equipe" continua preenchido com o nome, para o que já lê ele.';
comment on column imobproj.wa_groups.anotacao_desde is
  'Preenchido quando o grupo passa 30 dias sem mensagem: sai de Conversas e vai para Anotações da equipe. Mensagem nova volta para null.';

-- D3: número do mesmo projeto e equipe do projeto. Só valida o que mudou, para não travar grupos antigos.
create or replace function imobproj.fn_wa_groups_vinculo()
returns trigger
language plpgsql
security definer
set search_path = imobproj
as $$
declare
  v_proj_sessao uuid;
  v_nome_equipe text;
begin
  if new.session_id is not null
     and (tg_op = 'INSERT' or new.session_id is distinct from old.session_id or new.project_id is distinct from old.project_id) then
    select project_id into v_proj_sessao from imobproj.wa_sessions where id = new.session_id;
    if v_proj_sessao is distinct from new.project_id then
      raise exception 'O número escolhido é de outro projeto. Cada grupo usa um número do próprio projeto.'
        using errcode = 'check_violation';
    end if;
  end if;

  if new.team_id is not null
     and (tg_op = 'INSERT' or new.team_id is distinct from old.team_id or new.project_id is distinct from old.project_id) then
    if not exists (select 1 from imobproj.project_teams pt where pt.project_id = new.project_id and pt.team_id = new.team_id) then
      raise exception 'A equipe escolhida não atende este projeto. Ligue a equipe ao projeto em Cadastros › Equipes.'
        using errcode = 'check_violation';
    end if;
    select nome into v_nome_equipe from imobproj.teams where id = new.team_id;
    new.equipe := coalesce(v_nome_equipe, new.equipe);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_wa_groups_vinculo on imobproj.wa_groups;
create trigger trg_wa_groups_vinculo before insert or update of session_id, project_id, team_id on imobproj.wa_groups
  for each row execute function imobproj.fn_wa_groups_vinculo();

-- -----------------------------------------------------------------------------
-- D5: 30 dias sem mensagem → Anotações da equipe; mensagem nova → volta para Conversas
-- -----------------------------------------------------------------------------
create or replace function imobproj.fn_anotacoes_mover(p_dias integer default 30)
returns integer
language plpgsql
security definer
set search_path = imobproj
as $$
declare
  v_qtd integer;
begin
  update imobproj.wa_groups g
     set anotacao_desde = now()
   where g.anotacao_desde is null
     and g.ativo
     and coalesce(
           (select max(m.created_at) from imobproj.wa_messages m where m.group_id = g.id),
           g.created_at
         ) < now() - make_interval(days => p_dias);
  get diagnostics v_qtd = row_count;
  return v_qtd;
end;
$$;

create or replace function imobproj.fn_wa_messages_volta_conversa()
returns trigger
language plpgsql
security definer
set search_path = imobproj
as $$
begin
  update imobproj.wa_groups set anotacao_desde = null
   where id = new.group_id and anotacao_desde is not null;
  return new;
exception when others then
  raise warning 'imobproj.fn_wa_messages_volta_conversa: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_wa_messages_volta_conversa on imobproj.wa_messages;
create trigger trg_wa_messages_volta_conversa after insert on imobproj.wa_messages
  for each row execute function imobproj.fn_wa_messages_volta_conversa();

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'imobproj-anotacoes-mover';
    perform cron.schedule('imobproj-anotacoes-mover', '17 6 * * *', 'select imobproj.fn_anotacoes_mover();');
  else
    raise notice 'pg_cron ausente: agende "select imobproj.fn_anotacoes_mover();" uma vez por dia.';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Conversas: grupo em Anotações sai da lista (mesmo corpo de 20261029000800 + filtro anotacao_desde)
-- -----------------------------------------------------------------------------
create or replace function imobproj.fn_wa_conversas(p_project_id uuid)
returns table (
  group_id             uuid,
  ultima_id            uuid,
  ultima_body          text,
  ultima_media_path    text,
  ultima_direction     imobproj.wa_direction,
  ultima_autor_user_id uuid,
  ultima_autor_phone   text,
  ultima_em            timestamptz,
  last_read_at         timestamptz,
  nao_lidas            integer,
  mencoes              integer,
  mencoes_nao_lidas    integer,
  fila                 integer
)
language sql
stable
security invoker
set search_path = imobproj, extensions
as $$
  with eu as (
    select auth.uid() as id,
           lower(trim(coalesce(p.nome, ''))) as nome,
           lower(split_part(trim(coalesce(p.nome, '')), ' ', 1)) as primeiro,
           regexp_replace(lower(split_part(trim(coalesce(p.nome, '')), ' ', 1)), '([^[:alnum:]])', '\\\1', 'g') as primeiro_re,
           regexp_replace(coalesce(p.telefone_whatsapp, ''), '\D', '', 'g') as tel
      from (select 1) x
      left join imobproj.profiles p on p.id = auth.uid()
  ),
  grupos as (
    select g.id, rs.last_read_at
      from imobproj.wa_groups g
      left join imobproj.wa_read_state rs on rs.group_id = g.id and rs.user_id = auth.uid()
     where g.project_id = p_project_id
       and g.anotacao_desde is null
  ),
  marcadas as (
    select m.group_id,
           m.created_at,
           m.direction,
           m.status,
           (m.author_user_id is distinct from (select id from eu)) as de_outro,
           (
             m.body is not null and (
               ((select length(tel) from eu) >= 8 and strpos(m.body, (select tel from eu)) > 0)
               or ((select length(nome) from eu) >= 3 and strpos(lower(m.body), (select nome from eu)) > 0)
               or ((select length(primeiro) from eu) >= 2 and strpos(lower(m.body), '@' || (select primeiro from eu)) > 0)
               or ((select length(primeiro) from eu) >= 3
                   and lower(m.body) ~ ('\m' || (select primeiro_re from eu) || '\M'))
             )
           ) as menciona
      from imobproj.wa_messages m
      join grupos g on g.id = m.group_id
  )
  select g.id,
         u.id, u.body, u.media_path, u.direction, u.author_user_id, u.author_phone, u.created_at,
         g.last_read_at,
         coalesce(c.nao_lidas, 0)::integer,
         coalesce(c.mencoes, 0)::integer,
         coalesce(c.mencoes_nao_lidas, 0)::integer,
         coalesce(c.fila, 0)::integer
    from grupos g
    left join lateral (
      select m.id, m.body, m.media_path, m.direction, m.author_user_id, m.author_phone, m.created_at
        from imobproj.wa_messages m
       where m.group_id = g.id
       order by m.created_at desc
       limit 1
    ) u on true
    left join lateral (
      select count(*) filter (where k.de_outro and (g.last_read_at is null or k.created_at > g.last_read_at)) as nao_lidas,
             count(*) filter (where k.de_outro and k.menciona) as mencoes,
             count(*) filter (where k.de_outro and k.menciona
                                and (g.last_read_at is null or k.created_at > g.last_read_at)) as mencoes_nao_lidas,
             count(*) filter (where k.direction = 'out' and k.status in ('pendente', 'falhou')) as fila
        from marcadas k
       where k.group_id = g.id
    ) c on true;
$$;

-- -----------------------------------------------------------------------------
-- D6: Monitor de conversas do projeto (gerente, diretor e super admin)
-- -----------------------------------------------------------------------------
create or replace function imobproj.conversas_monitor(p_project_id uuid, p_online_min integer default 15, p_espera_min integer default 30)
returns table (
  group_id         uuid,
  nome             text,
  team_id          uuid,
  equipe           text,
  session_id       uuid,
  numero           text,
  estado           text,          -- 'online' | 'recente' | 'anotacao'
  anotacao_desde   timestamptz,
  ultima_em        timestamptz,
  ultima_body      text,
  ultima_direction imobproj.wa_direction,
  ultima_autor     text,
  ultima_midia     boolean,
  nao_lidas        integer,
  esperando_desde  timestamptz    -- última mensagem recebida sem resposta depois dela, há mais de p_espera_min
)
language plpgsql
stable
security definer
set search_path = imobproj
as $$
begin
  if not imobproj.fn_has_role(p_project_id, array['diretor', 'gerente']) then
    raise exception 'O Monitor de conversas é só para o gerente do projeto, o diretor e o super admin.'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  select g.id,
         g.nome,
         g.team_id,
         coalesce(t.nome, g.equipe),
         g.session_id,
         s.numero,
         case
           when g.anotacao_desde is not null then 'anotacao'
           when u.created_at >= now() - make_interval(mins => p_online_min) then 'online'
           else 'recente'
         end,
         g.anotacao_desde,
         u.created_at,
         left(u.body, 200),
         u.direction,
         coalesce(nullif(trim(pa.nome), ''), case when u.author_phone is not null then '+' || u.author_phone end),
         u.media_path is not null,
         coalesce((
           select count(*)::integer
             from imobproj.wa_messages m
            where m.group_id = g.id
              and m.author_user_id is distinct from auth.uid()
              and (rs.last_read_at is null or m.created_at > rs.last_read_at)
         ), 0),
         (
           select min(m.created_at)
             from imobproj.wa_messages m
            where m.group_id = g.id
              and m.direction = 'in'
              and m.author_phone is not null
              and m.created_at > coalesce((
                    select max(o.created_at) from imobproj.wa_messages o
                     where o.group_id = g.id and o.direction = 'out'
                  ), '-infinity'::timestamptz)
           having min(m.created_at) < now() - make_interval(mins => p_espera_min)
         )
    from imobproj.wa_groups g
    left join imobproj.teams t on t.id = g.team_id
    left join imobproj.wa_sessions s on s.id = g.session_id
    left join imobproj.wa_read_state rs on rs.group_id = g.id and rs.user_id = auth.uid()
    left join lateral (
      select m.created_at, m.body, m.direction, m.author_user_id, m.author_phone, m.media_path
        from imobproj.wa_messages m
       where m.group_id = g.id
       order by m.created_at desc
       limit 1
    ) u on true
    left join imobproj.profiles pa on pa.id = u.author_user_id
   where g.project_id = p_project_id
     and g.ativo
   order by u.created_at desc nulls last;
end;
$$;

-- -----------------------------------------------------------------------------
-- D5 + D8: Anotações da equipe (só leitura, sem nada de OS/evidência)
-- -----------------------------------------------------------------------------
-- Pode ler as anotações do grupo: gerente/diretor/super admin do projeto, ou membro da equipe do grupo.
create or replace function imobproj.fn_pode_ver_anotacao(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = imobproj
as $$
  select exists (
    select 1
      from imobproj.wa_groups g
     where g.id = p_group_id
       and g.anotacao_desde is not null
       and (
         imobproj.fn_has_role(g.project_id, array['diretor', 'gerente'])
         or exists (select 1 from imobproj.team_members tm where tm.team_id = g.team_id and tm.user_id = auth.uid())
       )
  );
$$;

create or replace function imobproj.anotacoes_grupos(p_project_id uuid, p_busca text default null)
returns table (
  group_id        uuid,
  nome            text,
  team_id         uuid,
  equipe          text,
  anotacao_desde  timestamptz,
  primeira_em     timestamptz,
  ultima_em       timestamptz,
  mensagens       integer
)
language sql
stable
security definer
set search_path = imobproj
as $$
  select g.id, g.nome, g.team_id, coalesce(t.nome, g.equipe), g.anotacao_desde,
         min(m.created_at), max(m.created_at), count(m.id)::integer
    from imobproj.wa_groups g
    left join imobproj.teams t on t.id = g.team_id
    left join imobproj.wa_messages m on m.group_id = g.id
   where g.project_id = p_project_id
     and g.anotacao_desde is not null
     and imobproj.fn_pode_ver_anotacao(g.id)
     and (
       nullif(trim(p_busca), '') is null
       or g.nome ilike '%' || trim(p_busca) || '%'
       or exists (select 1 from imobproj.wa_messages b where b.group_id = g.id and b.body ilike '%' || trim(p_busca) || '%')
     )
   group by g.id, g.nome, g.team_id, t.nome, g.equipe, g.anotacao_desde
   order by max(m.created_at) desc nulls last;
$$;

-- Mensagens do grupo em Anotações. De propósito sem status, fila, citação de OS nem evidência.
create or replace function imobproj.anotacoes_mensagens(p_group_id uuid)
returns table (
  id           uuid,
  direction    imobproj.wa_direction,
  autor        text,
  autor_user_id uuid,
  body         text,
  media_path   text,
  citada_body  text,
  created_at   timestamptz
)
language plpgsql
stable
security definer
set search_path = imobproj
as $$
begin
  if not imobproj.fn_pode_ver_anotacao(p_group_id) then
    raise exception 'Você não tem acesso às anotações deste grupo.' using errcode = 'insufficient_privilege';
  end if;

  return query
  select m.id, m.direction,
         coalesce(nullif(trim(p.nome), ''), case when m.author_phone is not null then '+' || m.author_phone end),
         m.author_user_id, m.body, m.media_path,
         (select left(q.body, 200) from imobproj.wa_messages q where q.wa_message_id = m.quoted_wa_message_id limit 1),
         m.created_at
    from imobproj.wa_messages m
    left join imobproj.profiles p on p.id = m.author_user_id
   where m.group_id = p_group_id
     and (m.direction = 'in' or m.status = 'enviada')
   order by m.created_at;
end;
$$;

-- -----------------------------------------------------------------------------
-- RLS e grants
-- -----------------------------------------------------------------------------
alter table imobproj.project_teams enable row level security;

drop policy if exists project_teams_select on imobproj.project_teams;
create policy project_teams_select on imobproj.project_teams
  for select to authenticated
  using (
    imobproj.fn_is_member(project_id)
    or exists (select 1 from imobproj.team_members tm where tm.team_id = project_teams.team_id and tm.user_id = (select auth.uid()))
  );

drop policy if exists project_teams_write on imobproj.project_teams;
create policy project_teams_write on imobproj.project_teams
  for all to authenticated
  using (imobproj.fn_has_role(project_id, array['diretor', 'gerente']))
  with check (imobproj.fn_has_role(project_id, array['diretor', 'gerente']));

revoke all on imobproj.project_teams from anon;
grant select, insert, delete on imobproj.project_teams to authenticated;
grant all on imobproj.project_teams to service_role;

revoke execute on function imobproj.fn_anotacoes_mover(integer) from public, anon, authenticated;
grant execute on function imobproj.fn_anotacoes_mover(integer) to service_role;

do $$
declare
  f text;
begin
  foreach f in array array[
    'imobproj.conversas_monitor(uuid, integer, integer)',
    'imobproj.fn_pode_ver_anotacao(uuid)',
    'imobproj.anotacoes_grupos(uuid, text)',
    'imobproj.anotacoes_mensagens(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end;
$$;

comment on function imobproj.conversas_monitor(uuid, integer, integer) is
  'Monitor de conversas do projeto: estado (online/recente/anotacao), última mensagem, não lidas e espera. Só gerente, diretor e super admin.';
comment on function imobproj.anotacoes_grupos(uuid, text) is
  'Anotações da equipe: grupos com 30 dias sem mensagem que o usuário pode ler (equipe dele; gerente/diretor/super admin veem todos).';
comment on function imobproj.anotacoes_mensagens(uuid) is
  'Mensagens de um grupo em Anotações da equipe, só leitura e sem dados de OS/evidência.';
