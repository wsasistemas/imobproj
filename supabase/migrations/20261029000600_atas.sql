-- =============================================================================
-- IMOBPROJ · Módulo Atas de reunião (Prompt 2, item 1) — migration ADITIVA e idempotente
--
-- 1) meeting_ciencia_solicitacoes: registro de cada "Solicitar ciência" (quem pediu,
--    quem estava pendente, canais usados e o resultado do e-mail/WhatsApp). O envio de
--    e-mail fica desacoplado: a linha nasce com email_status e pode ser processada por
--    um job/Edge Function quando houver provedor de e-mail configurado.
--
-- 2) fn_ata_encaminhamento_cronograma(p_action_id, p_ligar): liga/desliga o toggle
--    "No cronograma" de um encaminhamento NUMA ÚNICA TRANSAÇÃO.
--    SECURITY INVOKER: a RLS de meeting_actions, wbs_items e calendar_events
--    (escrita: gerente/super_admin) continua valendo; a função confere o papel antes.
--
--    Ligar:
--      * exige prazo;
--      * garante a fase raiz "Encaminhamentos de atas" (is_fase, código = próximo
--        inteiro livre na raiz da EAP);
--      * cria (ou atualiza) o item filho dessa fase: título = ação, responsável,
--        início = data da reunião (ou o prazo, se anterior), fim = prazo,
--        código <fase>.<n> automático;
--      * cria (ou atualiza) o calendar_event tipo 'atividade' ligado ao item
--        (08:00 do início às 18:00 do prazo, fuso America/Sao_Paulo);
--      * grava meeting_actions.wbs_item_id e vincular_cronograma = true;
--      * se o encaminhamento já aponta para uma atividade da EAP que NÃO é da fase
--        de encaminhamentos (vínculo manual, ex.: seed), ela não é alterada:
--        só marca vincular_cronograma = true.
--    Desligar:
--      * item da fase de encaminhamentos: remove o calendar_event; remove também o
--        item da EAP se não houver OS nem outro encaminhamento ligado a ele
--        (senão o item fica, preservando OS/horas, e só o evento sai);
--      * vínculo manual com atividade da EAP: mantém o vínculo, só desmarca o toggle;
--      * se a fase "Encaminhamentos de atas" ficar vazia, ela também sai da EAP.
--    Ao final, recalcula início/fim da fase pelos filhos.
--    Retorna jsonb { wbs_item_id, calendar_event_id, item_removido }.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Solicitações de ciência
-- -----------------------------------------------------------------------------
create table if not exists public.meeting_ciencia_solicitacoes (
  id               uuid primary key default gen_random_uuid(),
  meeting_id       uuid not null references public.meetings (id) on delete cascade,
  solicitante_id   uuid references public.profiles (id) on delete set null default auth.uid(),
  destinatarios    uuid[] not null default '{}',
  -- 'enviado' | 'sem_provedor' | 'falhou' | 'sem_destinatario' | 'nao_solicitado'
  email_status     text not null default 'sem_provedor',
  email_erro       text,
  wa_group_id      uuid references public.wa_groups (id) on delete set null,
  wa_message_id    uuid references public.wa_messages (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists meeting_ciencia_solicitacoes_meeting_idx
  on public.meeting_ciencia_solicitacoes (meeting_id, created_at desc);

comment on table public.meeting_ciencia_solicitacoes is
  'Histórico de "Solicitar ciência" das atas (e-mail + grupo do WhatsApp). email_status=sem_provedor fica para um job de e-mail futuro.';

drop trigger if exists trg_meeting_ciencia_solicitacoes_updated_at on public.meeting_ciencia_solicitacoes;
create trigger trg_meeting_ciencia_solicitacoes_updated_at
  before update on public.meeting_ciencia_solicitacoes
  for each row execute function public.set_updated_at();

alter table public.meeting_ciencia_solicitacoes enable row level security;
grant select, insert, update on public.meeting_ciencia_solicitacoes to authenticated;
grant all on public.meeting_ciencia_solicitacoes to service_role;

drop policy if exists meeting_ciencia_solicitacoes_select on public.meeting_ciencia_solicitacoes;
create policy meeting_ciencia_solicitacoes_select on public.meeting_ciencia_solicitacoes
  for select to authenticated
  using (public.fn_can_view_project(public.fn_project_of_meeting(meeting_id)));

drop policy if exists meeting_ciencia_solicitacoes_insert on public.meeting_ciencia_solicitacoes;
create policy meeting_ciencia_solicitacoes_insert on public.meeting_ciencia_solicitacoes
  for insert to authenticated
  with check (
    solicitante_id = (select auth.uid())
    and public.fn_has_role(public.fn_project_of_meeting(meeting_id), array['gerente'])
  );

drop policy if exists meeting_ciencia_solicitacoes_update on public.meeting_ciencia_solicitacoes;
create policy meeting_ciencia_solicitacoes_update on public.meeting_ciencia_solicitacoes
  for update to authenticated
  using (public.fn_has_role(public.fn_project_of_meeting(meeting_id), array['gerente']))
  with check (public.fn_has_role(public.fn_project_of_meeting(meeting_id), array['gerente']));

-- -----------------------------------------------------------------------------
-- 2. Encaminhamento <-> cronograma
-- -----------------------------------------------------------------------------
create or replace function public.fn_ata_encaminhamento_cronograma(p_action_id uuid, p_ligar boolean)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tz          constant text := 'America/Sao_Paulo';
  v_fase_titulo constant text := 'Encaminhamentos de atas';
  v_acao        public.meeting_actions%rowtype;
  v_reuniao     public.meetings%rowtype;
  v_item        public.wbs_items%rowtype;
  v_fase        public.wbs_items%rowtype;
  v_project     uuid;
  v_inicio      date;
  v_codigo      text;
  v_n           integer;
  v_evento      uuid;
  v_removido    boolean := false;
  v_em_uso      boolean;
begin
  select * into v_acao from public.meeting_actions where id = p_action_id;
  if not found then
    raise exception 'Encaminhamento não encontrado' using errcode = 'P0002';
  end if;
  select * into v_reuniao from public.meetings where id = v_acao.meeting_id;
  v_project := v_reuniao.project_id;

  if not public.fn_has_role(v_project, array['gerente']) then
    raise exception 'Somente o gerente leva encaminhamentos ao cronograma' using errcode = '42501';
  end if;

  -- serializa a criação da fase/códigos por projeto
  perform pg_advisory_xact_lock(hashtext('atas_encaminhamentos:' || v_project::text));

  select * into v_fase
    from public.wbs_items
   where project_id = v_project and parent_id is null and is_fase and titulo = v_fase_titulo
   order by created_at
   limit 1;

  if v_acao.wbs_item_id is not null then
    select * into v_item from public.wbs_items where id = v_acao.wbs_item_id;
  end if;

  -- -------------------------------------------------------------------------
  -- Desligar
  -- -------------------------------------------------------------------------
  if not p_ligar then
    if v_item.id is not null and v_fase.id is not null and v_item.parent_id = v_fase.id then
      delete from public.calendar_events where wbs_item_id = v_item.id and tipo = 'atividade';

      select exists (select 1 from public.service_orders so where so.wbs_item_id = v_item.id)
          or exists (select 1 from public.meeting_actions ma where ma.wbs_item_id = v_item.id and ma.id <> v_acao.id)
        into v_em_uso;

      if not v_em_uso then
        delete from public.wbs_items where id = v_item.id;
        v_removido := true;
      end if;
    end if;

    update public.meeting_actions
       set vincular_cronograma = false,
           wbs_item_id = case when v_removido then null else wbs_item_id end
     where id = v_acao.id;

    if v_fase.id is not null then
      if not exists (select 1 from public.wbs_items where parent_id = v_fase.id)
         and not exists (select 1 from public.service_orders where wbs_item_id = v_fase.id)
         and not exists (select 1 from public.meeting_actions where wbs_item_id = v_fase.id) then
        -- fase ficou vazia: sai da EAP (volta a ser criada no próximo "No cronograma")
        delete from public.wbs_items where id = v_fase.id;
      else
        update public.wbs_items f
           set inicio = s.ini, fim = s.fim
          from (select min(inicio) as ini, max(fim) as fim from public.wbs_items where parent_id = v_fase.id) s
         where f.id = v_fase.id and s.ini is not null;
      end if;
    end if;

    return jsonb_build_object(
      'wbs_item_id', case when v_removido then null else v_acao.wbs_item_id end,
      'calendar_event_id', null,
      'item_removido', v_removido
    );
  end if;

  -- -------------------------------------------------------------------------
  -- Ligar
  -- -------------------------------------------------------------------------
  if v_acao.prazo is null then
    raise exception 'Defina o prazo do encaminhamento antes de levá-lo ao cronograma' using errcode = '23514';
  end if;

  -- vínculo manual com uma atividade da EAP fora da fase de encaminhamentos: não mexe nela
  if v_item.id is not null and (v_fase.id is null or v_item.parent_id is distinct from v_fase.id) then
    update public.meeting_actions set vincular_cronograma = true where id = v_acao.id;
    return jsonb_build_object('wbs_item_id', v_item.id, 'calendar_event_id', null, 'item_removido', false);
  end if;

  v_inicio := least(v_reuniao.data, v_acao.prazo);

  if v_fase.id is null then
    select coalesce(max(codigo::integer), 0) + 1
      into v_n
      from public.wbs_items
     where project_id = v_project and parent_id is null and codigo ~ '^[0-9]+$';

    insert into public.wbs_items (project_id, parent_id, codigo, titulo, responsavel_id, horas_orcadas,
                                  inicio, fim, ordem, is_milestone, is_fase)
    values (v_project, null, v_n::text, v_fase_titulo, null, 0, v_inicio, v_acao.prazo,
            (select coalesce(max(ordem), 0) + 100 from public.wbs_items where project_id = v_project and parent_id is null),
            false, true)
    returning * into v_fase;
  end if;

  if v_item.id is null then
    select coalesce(max(substring(codigo from '\.([0-9]+)$')::integer), 0) + 1
      into v_n
      from public.wbs_items
     where parent_id = v_fase.id and codigo ~ '\.[0-9]+$';
    v_codigo := v_fase.codigo || '.' || v_n;

    insert into public.wbs_items (project_id, parent_id, codigo, titulo, responsavel_id, horas_orcadas,
                                  inicio, fim, ordem, is_milestone, is_fase)
    values (v_project, v_fase.id, v_codigo, left(v_acao.acao, 300), v_acao.responsavel_id, 0,
            v_inicio, v_acao.prazo, v_fase.ordem + v_n, false, false)
    returning * into v_item;
  else
    update public.wbs_items
       set titulo = left(v_acao.acao, 300),
           responsavel_id = v_acao.responsavel_id,
           inicio = least(coalesce(inicio, v_inicio), v_acao.prazo),
           fim = v_acao.prazo
     where id = v_item.id
    returning * into v_item;
  end if;

  select id into v_evento
    from public.calendar_events
   where wbs_item_id = v_item.id and tipo = 'atividade'
   order by created_at
   limit 1;

  if v_evento is null then
    insert into public.calendar_events (project_id, tipo, wbs_item_id, titulo, inicio, fim)
    values (v_project, 'atividade', v_item.id, v_item.codigo || ' ' || v_item.titulo,
            (v_item.inicio + time '08:00') at time zone v_tz,
            (v_item.fim + time '18:00') at time zone v_tz)
    returning id into v_evento;
  else
    update public.calendar_events
       set titulo = v_item.codigo || ' ' || v_item.titulo,
           inicio = (v_item.inicio + time '08:00') at time zone v_tz,
           fim = (v_item.fim + time '18:00') at time zone v_tz
     where id = v_evento;
  end if;

  update public.meeting_actions
     set wbs_item_id = v_item.id,
         vincular_cronograma = true
   where id = v_acao.id;

  update public.wbs_items f
     set inicio = s.ini, fim = s.fim
    from (select min(inicio) as ini, max(fim) as fim from public.wbs_items where parent_id = v_fase.id) s
   where f.id = v_fase.id and s.ini is not null;

  return jsonb_build_object('wbs_item_id', v_item.id, 'calendar_event_id', v_evento, 'item_removido', false);
end;
$$;

revoke all on function public.fn_ata_encaminhamento_cronograma(uuid, boolean) from public, anon;
grant execute on function public.fn_ata_encaminhamento_cronograma(uuid, boolean) to authenticated;

comment on function public.fn_ata_encaminhamento_cronograma(uuid, boolean) is
  'Toggle "No cronograma" do encaminhamento de ata: cria/atualiza (ou remove) o item da fase "Encaminhamentos de atas" e o calendar_event atividade, atomicamente. SECURITY INVOKER.';
