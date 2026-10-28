-- =============================================================================
-- IMOBPROJ · Módulo Conversas WhatsApp (Prompt 2, item 6) — migration ADITIVA e idempotente
--
-- 1) wa_read_state(group_id, user_id, last_read_at): até onde cada usuário leu cada grupo.
--    Base dos filtros "Não lidos" e "Menções" da tela /projetos/[id]/conversas.
--    RLS: cada um lê/grava só a própria linha, e só de grupos de projetos que enxerga.
--
-- 2) fn_wa_marcar_lido(p_group_id): grava last_read_at = now() (relógio do banco, o mesmo de
--    wa_messages.created_at). SECURITY INVOKER: a RLS acima vale.
--
-- 3) fn_wa_conversas(p_project_id): uma linha por grupo do projeto com a última mensagem,
--    não lidas, menções (total e não lidas) e o tamanho da fila de reenvio.
--    SECURITY INVOKER: a RLS de wa_groups/wa_messages filtra (prestador não vê nada).
--    Não lida = mensagem de outra pessoa criada depois de last_read_at (sem linha = tudo não lido).
--    Menção = mensagem de outra pessoa cujo texto contém o telefone do usuário (ex.: "@5511900000003"),
--    o nome completo, "@<primeiro nome>" ou o primeiro nome como palavra inteira (sem diferenciar
--    maiúsculas). A interface usa a mesma regra para destacar o balão (src/components/conversas/dados.ts).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Estado de leitura por usuário
-- -----------------------------------------------------------------------------
create table if not exists public.wa_read_state (
  group_id      uuid not null references public.wa_groups (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  last_read_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists wa_read_state_user_idx on public.wa_read_state (user_id);

comment on table public.wa_read_state is
  'Conversas WhatsApp: até quando cada usuário leu cada grupo (filtros Não lidos/Menções). Linha só do próprio usuário (RLS).';

drop trigger if exists trg_wa_read_state_updated_at on public.wa_read_state;
create trigger trg_wa_read_state_updated_at
  before update on public.wa_read_state
  for each row execute function public.set_updated_at();

alter table public.wa_read_state enable row level security;
grant select, insert, update, delete on public.wa_read_state to authenticated;
grant all on public.wa_read_state to service_role;
revoke all on public.wa_read_state from anon;

drop policy if exists wa_read_state_select on public.wa_read_state;
create policy wa_read_state_select on public.wa_read_state
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists wa_read_state_insert on public.wa_read_state;
create policy wa_read_state_insert on public.wa_read_state
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.fn_can_view_project(public.fn_project_of_group(group_id))
  );

drop policy if exists wa_read_state_update on public.wa_read_state;
create policy wa_read_state_update on public.wa_read_state
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and public.fn_can_view_project(public.fn_project_of_group(group_id))
  );

drop policy if exists wa_read_state_delete on public.wa_read_state;
create policy wa_read_state_delete on public.wa_read_state
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- 2. Marcar grupo como lido
-- -----------------------------------------------------------------------------
create or replace function public.fn_wa_marcar_lido(p_group_id uuid)
returns timestamptz
language sql
volatile
security invoker
set search_path = public
as $$
  insert into public.wa_read_state as rs (group_id, user_id, last_read_at)
  values (p_group_id, auth.uid(), now())
  on conflict (group_id, user_id)
    do update set last_read_at = greatest(rs.last_read_at, excluded.last_read_at)
  returning last_read_at;
$$;

revoke all on function public.fn_wa_marcar_lido(uuid) from public, anon;
grant execute on function public.fn_wa_marcar_lido(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Lista de conversas do projeto (última mensagem, não lidas, menções, fila)
-- -----------------------------------------------------------------------------
create or replace function public.fn_wa_conversas(p_project_id uuid)
returns table (
  group_id             uuid,
  ultima_id            uuid,
  ultima_body          text,
  ultima_media_path    text,
  ultima_direction     public.wa_direction,
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
set search_path = public
as $$
  with eu as (
    select auth.uid() as id,
           lower(trim(coalesce(p.nome, ''))) as nome,
           lower(split_part(trim(coalesce(p.nome, '')), ' ', 1)) as primeiro,
           -- primeiro nome escapado para regex (só letras/dígitos passam sem barra)
           regexp_replace(lower(split_part(trim(coalesce(p.nome, '')), ' ', 1)), '([^[:alnum:]])', '\\\1', 'g') as primeiro_re,
           regexp_replace(coalesce(p.telefone_whatsapp, ''), '\D', '', 'g') as tel
      from (select 1) x
      left join public.profiles p on p.id = auth.uid()
  ),
  grupos as (
    select g.id, rs.last_read_at
      from public.wa_groups g
      left join public.wa_read_state rs on rs.group_id = g.id and rs.user_id = auth.uid()
     where g.project_id = p_project_id
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
               -- primeiro nome como palavra inteira ("Bom dia, Ricardo"), com 3+ letras
               or ((select length(primeiro) from eu) >= 3
                   and lower(m.body) ~ ('\m' || (select primeiro_re from eu) || '\M'))
             )
           ) as menciona
      from public.wa_messages m
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
        from public.wa_messages m
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

revoke all on function public.fn_wa_conversas(uuid) from public, anon;
grant execute on function public.fn_wa_conversas(uuid) to authenticated;

comment on function public.fn_wa_conversas(uuid) is
  'Conversas WhatsApp: por grupo do projeto, última mensagem, não lidas, menções e fila de reenvio do usuário logado. SECURITY INVOKER (RLS).';
