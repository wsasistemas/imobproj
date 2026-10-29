-- =============================================================================
-- IMOBPROJ · Fase 6 (pendência) · Envio das notificações e do resumo semanal (ADITIVA)
--
-- 1) As chaves da aba Notificações passam a valer:
--    * notificar_os_atribuida / notificar_os_decidida: condicionam o push de fn_push_os_notificar;
--    * notificar_ata_publicada: ata que vira 'publicada' avisa os participantes por push (para
--      registrarem ciência).
-- 2) Resumo semanal de horas ao usuário-chave (chave resumo_semanal_usuario_chave):
--    fn_resumo_semanal() monta, por projeto ativo com usuário-chave, o resumo da semana anterior
--    (segunda a domingo, no fuso das configurações) e envia:
--      * no grupo do cliente no WhatsApp (fila wa_messages, entregue pelo cron imobproj-openwa-reenvio);
--      * por push a cada usuário-chave do projeto (fila push_outbox).
--    imobproj.resumo_semanal_envios guarda o que já saiu: rodar de novo na mesma semana não duplica.
--    pg_cron: toda segunda às 11h UTC (8h em Brasília).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1a) Push de OS condicionado às chaves (mesma função da migration app_campo + as duas checagens)
-- -----------------------------------------------------------------------------
create or replace function imobproj.fn_push_os_notificar()
returns trigger
language plpgsql
security definer
set search_path = imobproj, extensions
as $$
declare
  v_codigo text;
  v_titulo text;
  v_corpo  text;
  v_tipo   text;
begin
  if new.executor_id is null or new.status = 'rascunho' then
    return new;
  end if;

  if tg_op = 'INSERT'
     or new.executor_id is distinct from old.executor_id
     or (old.status = 'rascunho' and new.status = 'agendada') then
    v_tipo := 'atribuida';
  elsif new.status is distinct from old.status and new.status in ('aprovada', 'recusada') then
    v_tipo := new.status::text;
  else
    return new;
  end if;

  -- Chaves da aba Notificações (Configurações gerais).
  if v_tipo = 'atribuida' and not imobproj.fn_config_bool('notificar_os_atribuida', true) then
    return new;
  end if;
  if v_tipo in ('aprovada', 'recusada') and not imobproj.fn_config_bool('notificar_os_decidida', true) then
    return new;
  end if;

  select p.codigo into v_codigo from imobproj.projects p where p.id = new.project_id;
  v_titulo := case v_tipo
    when 'atribuida' then 'Nova OS atribuída'
    when 'aprovada'  then 'OS aprovada'
    else 'OS recusada'
  end;
  v_corpo := format('OS %s · %s — %s', new.numero, coalesce(v_codigo, ''), new.titulo);
  if v_tipo = 'recusada' and coalesce(btrim(new.aceite_comentario), '') <> '' then
    v_corpo := v_corpo || E'\nMotivo: ' || left(new.aceite_comentario, 140);
  end if;

  -- Quem fez a mudança não precisa ser avisado dela.
  if new.executor_id is distinct from auth.uid() then
    insert into imobproj.push_outbox (user_id, titulo, corpo, dados)
    values (new.executor_id, v_titulo, v_corpo,
            jsonb_build_object('tipo', v_tipo, 'os_id', new.id, 'project_id', new.project_id));
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1b) Ata publicada → push aos participantes
-- -----------------------------------------------------------------------------
create or replace function imobproj.fn_push_ata_publicada()
returns trigger
language plpgsql
security definer
set search_path = imobproj, extensions
as $$
declare
  v_codigo text;
begin
  if new.status <> 'publicada'
     or (tg_op = 'UPDATE' and old.status = new.status)
     or not imobproj.fn_config_bool('notificar_ata_publicada', true) then
    return null;
  end if;

  select p.codigo into v_codigo from imobproj.projects p where p.id = new.project_id;

  insert into imobproj.push_outbox (user_id, titulo, corpo, dados)
  select mp.user_id,
         'Ata publicada',
         format('Ata %s · %s — %s%sRegistre sua ciência.', new.numero, coalesce(v_codigo, ''), new.titulo, E'\n'),
         jsonb_build_object('tipo', 'ata_publicada', 'meeting_id', new.id, 'project_id', new.project_id)
    from imobproj.meeting_participants mp
   where mp.meeting_id = new.id
     and mp.ciente_em is null
     and mp.user_id is distinct from auth.uid();   -- quem publicou não precisa do aviso
  return null;
end;
$$;

drop trigger if exists trg_meetings_push_publicada on imobproj.meetings;
create trigger trg_meetings_push_publicada
  after insert or update of status on imobproj.meetings
  for each row execute function imobproj.fn_push_ata_publicada();

-- -----------------------------------------------------------------------------
-- 2) Resumo semanal de horas ao usuário-chave
-- -----------------------------------------------------------------------------
create table if not exists imobproj.resumo_semanal_envios (
  project_id     uuid not null references imobproj.projects (id) on delete cascade,
  semana_inicio  date not null,                 -- segunda-feira da semana resumida
  grupo_id       uuid references imobproj.wa_groups (id) on delete set null,  -- null: projeto sem grupo do cliente
  push_qtd       integer not null default 0,
  mensagem       text not null,
  created_at     timestamptz not null default now(),
  primary key (project_id, semana_inicio)
);
comment on table imobproj.resumo_semanal_envios is
  'Resumos semanais de horas já enviados ao usuário-chave (um por projeto e semana).';

alter table imobproj.resumo_semanal_envios enable row level security;
-- Sem políticas: só service_role e as funções SECURITY DEFINER.
grant all on imobproj.resumo_semanal_envios to service_role;

-- Horas no formato brasileiro, sem zeros à toa: 12 → "12", 12.5 → "12,5".
create or replace function imobproj.fn_fmt_horas(p numeric)
returns text
language sql
immutable
as $$
  select replace(rtrim(rtrim(to_char(round(coalesce(p, 0), 1), 'FM999999990.0'), '0'), '.'), '.', ',');
$$;

create or replace function imobproj.fn_resumo_semanal(p_referencia timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = imobproj, extensions
as $$
declare
  v_fuso    text := imobproj.fn_config_texto_fuso();
  v_ini     date;
  v_ini_ts  timestamptz;
  v_fim_ts  timestamptz;
  v_proj    record;
  v_grupo   uuid;
  v_msg     text;
  v_push    integer;
  v_qtd     integer := 0;
begin
  if not imobproj.fn_config_bool('resumo_semanal_usuario_chave', false) then
    return 0;
  end if;

  -- Semana anterior completa (segunda 00:00 até a segunda seguinte 00:00, no fuso configurado).
  v_ini    := date_trunc('week', (p_referencia at time zone v_fuso))::date - 7;
  v_ini_ts := v_ini::timestamp at time zone v_fuso;
  v_fim_ts := (v_ini + 7)::timestamp at time zone v_fuso;

  for v_proj in
    select p.id, p.codigo, p.nome,
           pp.horas_aprovadas, pp.percentual,
           coalesce(nullif(pp.horas_orcadas_eap, 0), p.horas_orcadas) as horas_orcadas,
           s.exec_qtd, s.exec_horas, s.aprov_qtd, s.aprov_horas, s.recus_qtd, s.aguard_qtd, s.aguard_horas
      from imobproj.projects p
      join imobproj.v_project_progress pp on pp.project_id = p.id
      cross join lateral (
        select count(*) filter (where o.checkout_at >= v_ini_ts and o.checkout_at < v_fim_ts)                 as exec_qtd,
               coalesce(sum(o.horas) filter (where o.checkout_at >= v_ini_ts and o.checkout_at < v_fim_ts), 0) as exec_horas,
               count(*) filter (where o.status = 'aprovada' and o.aceite_em >= v_ini_ts and o.aceite_em < v_fim_ts) as aprov_qtd,
               coalesce(sum(o.horas) filter (where o.status = 'aprovada' and o.aceite_em >= v_ini_ts and o.aceite_em < v_fim_ts), 0) as aprov_horas,
               count(*) filter (where o.status = 'recusada' and o.aceite_em >= v_ini_ts and o.aceite_em < v_fim_ts) as recus_qtd,
               count(*) filter (where o.status = 'aguardando_aceite')                                          as aguard_qtd,
               coalesce(sum(o.horas) filter (where o.status = 'aguardando_aceite'), 0)                        as aguard_horas
          from imobproj.service_orders o
         where o.project_id = p.id
      ) s
     where p.status not in ('encerrado', 'suspenso')
       and exists (select 1 from imobproj.project_members m
                    where m.project_id = p.id and m.ativo and m.role = 'usuario_chave')
       and not exists (select 1 from imobproj.resumo_semanal_envios e
                        where e.project_id = p.id and e.semana_inicio = v_ini)
  loop
    -- Semana parada e nada esperando aceite: não manda resumo vazio.
    if v_proj.exec_qtd = 0 and v_proj.aprov_qtd = 0 and v_proj.recus_qtd = 0 and v_proj.aguard_qtd = 0 then
      continue;
    end if;

    v_msg := format(
      E'📊 *Resumo semanal* · %s\n%s\nSemana de %s a %s\n\n🛠 Executadas: %s OS · %s h\n✅ Aprovadas: %s OS · %s h%s\n⏳ Aguardando seu aceite: %s OS · %s h%s',
      coalesce(v_proj.codigo, ''), v_proj.nome,
      to_char(v_ini, 'DD/MM'), to_char(v_ini + 6, 'DD/MM'),
      v_proj.exec_qtd, imobproj.fn_fmt_horas(v_proj.exec_horas),
      v_proj.aprov_qtd, imobproj.fn_fmt_horas(v_proj.aprov_horas),
      case when v_proj.recus_qtd > 0 then format(E'\n❌ Recusadas: %s OS', v_proj.recus_qtd) else '' end,
      v_proj.aguard_qtd, imobproj.fn_fmt_horas(v_proj.aguard_horas),
      case when coalesce(v_proj.horas_orcadas, 0) > 0
           then format(E'\n\n📈 Avanço do projeto: %s de %s h (%s%%)',
                       imobproj.fn_fmt_horas(v_proj.horas_aprovadas), imobproj.fn_fmt_horas(v_proj.horas_orcadas),
                       replace(trim(to_char(v_proj.percentual, 'FM990.0')), '.', ','))
           else '' end
    );

    v_grupo := imobproj.fn_grupo_cliente(v_proj.id);
    if v_grupo is not null then
      insert into imobproj.wa_messages (group_id, direction, body, status, author_user_id)
      values (v_grupo, 'out', v_msg, 'pendente', null);
    end if;

    insert into imobproj.push_outbox (user_id, titulo, corpo, dados)
    select distinct m.user_id,
           format('Resumo semanal · %s', coalesce(v_proj.codigo, v_proj.nome)),
           format('Semana %s–%s: %s h aprovadas, %s OS aguardando seu aceite.',
                  to_char(v_ini, 'DD/MM'), to_char(v_ini + 6, 'DD/MM'),
                  imobproj.fn_fmt_horas(v_proj.aprov_horas), v_proj.aguard_qtd),
           jsonb_build_object('tipo', 'resumo_semanal', 'project_id', v_proj.id, 'semana', v_ini)
      from imobproj.project_members m
     where m.project_id = v_proj.id and m.ativo and m.role = 'usuario_chave';
    get diagnostics v_push = row_count;

    insert into imobproj.resumo_semanal_envios (project_id, semana_inicio, grupo_id, push_qtd, mensagem)
    values (v_proj.id, v_ini, v_grupo, v_push, v_msg);
    v_qtd := v_qtd + 1;
  end loop;

  return v_qtd;
end;
$$;
revoke all on function imobproj.fn_resumo_semanal(timestamptz) from public, anon, authenticated;
grant execute on function imobproj.fn_resumo_semanal(timestamptz) to service_role;

-- Toda segunda às 11h UTC = 8h em Brasília.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'imobproj-resumo-semanal';
    perform cron.schedule('imobproj-resumo-semanal', '0 11 * * 1', 'select imobproj.fn_resumo_semanal();');
  else
    raise notice 'pg_cron ausente: agende "select imobproj.fn_resumo_semanal();" toda segunda de manhã.';
  end if;
end
$$;
