-- =============================================================================
-- IMOBPROJ · Cronograma (módulo do Prompt 1, item 4) — migration ADITIVA e idempotente
--
-- 1) schedule_changes passa a registrar remarcações de QUALQUER evento da agenda,
--    não só de itens da EAP:
--      * wbs_item_id deixa de ser obrigatório (reunião avulsa, OS sem atividade);
--      * novas colunas project_id (obrigatória, preenchida por trigger),
--        calendar_event_id, os_id e meeting_id (vínculos opcionais, "set null"
--        quando o registro de origem é excluído — o histórico permanece);
--      * políticas RLS passam a usar project_id (com fallback para a EAP).
-- 2) fn_cronograma_remarcar: grava, numa única transação, as novas datas do
--    evento (calendar_events e/ou wbs_items / service_orders / meetings ligados)
--    e a linha de schedule_changes com de/para/justificativa/autor.
--    SECURITY INVOKER: a RLS de cada tabela continua valendo.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. schedule_changes: colunas novas
-- -----------------------------------------------------------------------------
alter table imobproj.schedule_changes alter column wbs_item_id drop not null;

alter table imobproj.schedule_changes
  add column if not exists project_id uuid references imobproj.projects (id) on delete cascade,
  add column if not exists calendar_event_id uuid references imobproj.calendar_events (id) on delete set null,
  add column if not exists os_id uuid references imobproj.service_orders (id) on delete set null,
  add column if not exists meeting_id uuid references imobproj.meetings (id) on delete set null;

-- histórico existente: projeto vem da EAP
update imobproj.schedule_changes sc
   set project_id = w.project_id
  from imobproj.wbs_items w
 where sc.project_id is null
   and w.id = sc.wbs_item_id;

-- Projeto sempre derivado dos vínculos (não confia no valor enviado pelo cliente)
create or replace function imobproj.fn_schedule_changes_projeto()
returns trigger
language plpgsql
security definer
set search_path = imobproj, extensions
as $$
begin
  if new.wbs_item_id is not null then
    new.project_id := imobproj.fn_project_of_wbs(new.wbs_item_id);
  elsif new.calendar_event_id is not null then
    new.project_id := (select ce.project_id from imobproj.calendar_events ce where ce.id = new.calendar_event_id);
  elsif new.os_id is not null then
    new.project_id := imobproj.fn_project_of_os(new.os_id);
  elsif new.meeting_id is not null then
    new.project_id := imobproj.fn_project_of_meeting(new.meeting_id);
  end if;
  if new.project_id is null then
    raise exception 'Mudança de cronograma sem vínculo com um projeto' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace trigger trg_schedule_changes_projeto
  before insert on imobproj.schedule_changes
  for each row execute function imobproj.fn_schedule_changes_projeto();

alter table imobproj.schedule_changes alter column project_id set not null;

create index if not exists schedule_changes_project_idx on imobproj.schedule_changes (project_id, created_at desc);
create index if not exists schedule_changes_evento_idx on imobproj.schedule_changes (calendar_event_id);
create index if not exists schedule_changes_os_idx on imobproj.schedule_changes (os_id);
create index if not exists schedule_changes_meeting_idx on imobproj.schedule_changes (meeting_id);

-- RLS (mesma regra de antes: quem vê o projeto lê; gerente/super_admin inserem como autor)
drop policy if exists schedule_changes_select on imobproj.schedule_changes;
create policy schedule_changes_select on imobproj.schedule_changes
  for select to authenticated
  using (imobproj.fn_can_view_project(coalesce(project_id, imobproj.fn_project_of_wbs(wbs_item_id))));

drop policy if exists schedule_changes_insert on imobproj.schedule_changes;
create policy schedule_changes_insert on imobproj.schedule_changes
  for insert to authenticated
  with check (
    autor_id = (select auth.uid())
    and imobproj.fn_has_role(coalesce(project_id, imobproj.fn_project_of_wbs(wbs_item_id)), array['gerente'])
  );

-- -----------------------------------------------------------------------------
-- 2. Remarcação atômica (arrastar/redimensionar no calendário)
--
-- p_origem:
--   'evento'    -> p_id é calendar_events.id; atualiza o evento e o que estiver
--                  ligado a ele (wbs_item, OS, reunião);
--   'atividade' -> p_id é wbs_items.id (atividade/marco sem calendar_event);
--   'os'        -> p_id é service_orders.id (OS agendada sem calendar_event);
--   'reuniao'   -> p_id é meetings.id (reunião sem calendar_event).
-- Datas da EAP e da reunião são derivadas no fuso America/Sao_Paulo.
-- de/para: { inicio, fim } da atividade da EAP (quando houver, no mesmo formato
-- do histórico existente) + { evento | os | reuniao } com os horários.
-- Retorna o id da linha de schedule_changes.
-- -----------------------------------------------------------------------------
create or replace function imobproj.fn_cronograma_remarcar(
  p_project_id    uuid,
  p_origem        text,
  p_id            uuid,
  p_inicio        timestamptz,
  p_fim           timestamptz,
  p_justificativa text
)
returns uuid
language plpgsql
security invoker
set search_path = imobproj, extensions
as $$
declare
  v_tz        constant text := 'America/Sao_Paulo';
  v_ev        imobproj.calendar_events%rowtype;
  v_w         imobproj.wbs_items%rowtype;
  v_o         imobproj.service_orders%rowtype;
  v_m         imobproj.meetings%rowtype;
  v_ev_id     uuid;
  v_wbs       uuid;
  v_os        uuid;
  v_meeting   uuid;
  v_ini_data  date;
  v_fim_data  date;
  v_de        jsonb := '{}'::jsonb;
  v_para      jsonb := '{}'::jsonb;
  v_id        uuid;
begin
  if auth.uid() is null then
    raise exception 'Sessão expirada. Entre novamente.' using errcode = '42501';
  end if;
  if not imobproj.fn_has_role(p_project_id, array['gerente']) then
    raise exception 'Você não tem permissão para alterar o cronograma deste projeto.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_justificativa), '') = '' then
    raise exception 'Informe a justificativa da mudança.' using errcode = 'P0001';
  end if;
  if p_inicio is null or (p_fim is not null and p_fim < p_inicio) then
    raise exception 'Período inválido: o fim precisa ser depois do início.' using errcode = 'P0001';
  end if;

  if p_origem = 'evento' then
    select * into v_ev from imobproj.calendar_events
     where id = p_id and project_id = p_project_id
     for update;
    if not found then
      raise exception 'Evento não encontrado neste projeto.' using errcode = 'P0001';
    end if;
    v_ev_id   := v_ev.id;
    v_wbs     := v_ev.wbs_item_id;
    v_os      := v_ev.os_id;
    v_meeting := v_ev.meeting_id;
    v_de   := v_de   || jsonb_build_object('evento', jsonb_build_object('inicio', v_ev.inicio, 'fim', v_ev.fim));
    v_para := v_para || jsonb_build_object('evento', jsonb_build_object('inicio', p_inicio, 'fim', p_fim));
    update imobproj.calendar_events set inicio = p_inicio, fim = p_fim where id = v_ev.id;
  elsif p_origem = 'atividade' then
    v_wbs := p_id;
  elsif p_origem = 'os' then
    v_os := p_id;
  elsif p_origem = 'reuniao' then
    v_meeting := p_id;
  else
    raise exception 'Origem de evento inválida.' using errcode = 'P0001';
  end if;

  -- Atividade / marco da EAP (datas sem hora)
  if v_wbs is not null then
    select * into v_w from imobproj.wbs_items
     where id = v_wbs and project_id = p_project_id
     for update;
    if not found then
      raise exception 'Atividade da EAP não encontrada neste projeto.' using errcode = 'P0001';
    end if;
    v_ini_data := (p_inicio at time zone v_tz)::date;
    v_fim_data := case
                    when v_w.is_milestone or p_fim is null then v_ini_data
                    else greatest(v_ini_data, (p_fim at time zone v_tz)::date)
                  end;
    v_de   := v_de   || jsonb_build_object('inicio', v_w.inicio, 'fim', v_w.fim);
    v_para := v_para || jsonb_build_object('inicio', v_ini_data, 'fim', v_fim_data);
    update imobproj.wbs_items set inicio = v_ini_data, fim = v_fim_data where id = v_w.id;
  end if;

  -- Ordem de Serviço (agendamento)
  if v_os is not null then
    select * into v_o from imobproj.service_orders
     where id = v_os and project_id = p_project_id
     for update;
    if not found then
      raise exception 'Ordem de Serviço não encontrada neste projeto.' using errcode = 'P0001';
    end if;
    v_de   := v_de   || jsonb_build_object('os', jsonb_build_object('inicio', v_o.agendada_inicio, 'fim', v_o.agendada_fim));
    v_para := v_para || jsonb_build_object('os', jsonb_build_object('inicio', p_inicio, 'fim', p_fim));
    update imobproj.service_orders
       set agendada_inicio = p_inicio,
           agendada_fim    = p_fim
     where id = v_o.id;
  end if;

  -- Reunião (data + horários locais; reunião sem horário continua sem horário)
  if v_meeting is not null then
    select * into v_m from imobproj.meetings
     where id = v_meeting and project_id = p_project_id
     for update;
    if not found then
      raise exception 'Reunião não encontrada neste projeto.' using errcode = 'P0001';
    end if;
    v_de := v_de || jsonb_build_object('reuniao',
      jsonb_build_object('data', v_m.data, 'inicio', v_m.inicio, 'fim', v_m.fim));
    update imobproj.meetings
       set data   = (p_inicio at time zone v_tz)::date,
           inicio = case when v_m.inicio is null then null else (p_inicio at time zone v_tz)::time end,
           fim    = case
                      when v_m.fim is null or p_fim is null then v_m.fim
                      else (p_fim at time zone v_tz)::time
                    end
     where id = v_m.id
     returning * into v_m;
    v_para := v_para || jsonb_build_object('reuniao',
      jsonb_build_object('data', v_m.data, 'inicio', v_m.inicio, 'fim', v_m.fim));
  end if;

  insert into imobproj.schedule_changes (
    project_id, wbs_item_id, calendar_event_id, os_id, meeting_id, autor_id, de, para, justificativa
  ) values (
    p_project_id, v_wbs, v_ev_id, v_os, v_meeting, auth.uid(), v_de, v_para, btrim(p_justificativa)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function imobproj.fn_cronograma_remarcar(uuid, text, uuid, timestamptz, timestamptz, text) from public, anon;
grant execute on function imobproj.fn_cronograma_remarcar(uuid, text, uuid, timestamptz, timestamptz, text) to authenticated;

comment on function imobproj.fn_cronograma_remarcar(uuid, text, uuid, timestamptz, timestamptz, text) is
  'Cronograma: remarca um evento (calendar_event, atividade da EAP, OS ou reunião) e grava schedule_changes com justificativa, na mesma transação.';
