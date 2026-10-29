-- =============================================================================
-- IMOBPROJ · App de campo (Prompt 3)
-- Migration ADITIVA e idempotente.
--
-- 1) Apontamento pelo app (inclusive offline):
--    service_orders ganha GPS do check-out, o relato da execução e a hora em que o SERVIDOR recebeu
--    cada apontamento. checkin_at/checkout_at continuam sendo a hora do fato (gravada no aparelho,
--    que pode estar offline); *_recebido_em é sempre now() do banco.
--    fn_app_checkin / fn_app_checkout (SECURITY INVOKER: RLS e fn_os_guard continuam valendo) são
--    idempotentes, porque a fila offline do app pode reenviar a mesma operação.
--
-- 2) Evidências: os_evidences ganha recebido_em (forçado pelo trigger, não dá para falsificar),
--    precisão do GPS e descrição. captured_at/lat/lng = aparelho; recebido_em = servidor.
--    fn_app_registrar_evidencia é idempotente por storage_path (índice único).
--
-- 3) Notificações push (Expo): push_tokens (um por aparelho) e push_outbox (fila).
--    O trigger de service_orders enfileira "OS atribuída / aprovada / recusada" para o executor;
--    o insert na fila dispara a Edge Function push-send via pg_net, e o cron push-reenvio
--    tenta de novo as falhas (até 5 tentativas).
--    Reaproveita os segredos do Vault já usados pelo reenvio do OpenWA:
--    openwa_functions_url, openwa_anon_key e openwa_cron_secret (base das Edge Functions).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Apontamento
-- -----------------------------------------------------------------------------
alter table imobproj.service_orders
  add column if not exists checkout_lat          double precision,
  add column if not exists checkout_lng          double precision,
  add column if not exists checkin_recebido_em   timestamptz,
  add column if not exists checkout_recebido_em  timestamptz,
  add column if not exists relato                text;

comment on column imobproj.service_orders.checkin_recebido_em is
  'Hora do servidor ao receber o check-in (checkin_at é a hora do aparelho, que pode estar offline).';
comment on column imobproj.service_orders.relato is
  'Descrição do que foi executado, informada no check-out pelo app de campo.';

-- Hora do fato informada pelo aparelho: nunca no futuro (tolerância de 5 min de relógio).
create or replace function imobproj.fn_app_hora_do_fato(p_em timestamptz)
returns timestamptz
language sql
stable
set search_path = imobproj, extensions
as $$
  select case
    when p_em is null or p_em > now() + interval '5 minutes' then now()
    else p_em
  end;
$$;

create or replace function imobproj.fn_app_checkin(
  p_os_id uuid,
  p_em    timestamptz,
  p_lat   double precision default null,
  p_lng   double precision default null
)
returns imobproj.service_orders
language plpgsql
security invoker
set search_path = imobproj, extensions
as $$
declare
  v_os imobproj.service_orders;
begin
  select * into v_os from imobproj.service_orders where id = p_os_id;
  if not found then
    raise exception 'OS não encontrada' using errcode = 'P0002';
  end if;
  if v_os.executor_id is distinct from auth.uid() then
    raise exception 'Só o executor da OS pode fazer check-in' using errcode = '42501';
  end if;

  -- Reenvio da fila offline: o check-in já foi gravado.
  if v_os.checkin_at is not null and v_os.status <> 'agendada' then
    return v_os;
  end if;
  if v_os.status <> 'agendada' then
    raise exception 'O check-in só pode ser feito em uma OS agendada' using errcode = '23514';
  end if;

  update imobproj.service_orders
     set status              = 'em_execucao',
         checkin_at          = imobproj.fn_app_hora_do_fato(p_em),
         checkin_lat         = p_lat,
         checkin_lng         = p_lng,
         checkin_recebido_em = now()
   where id = p_os_id
   returning * into v_os;
  return v_os;
end;
$$;

create or replace function imobproj.fn_app_checkout(
  p_os_id       uuid,
  p_em          timestamptz,
  p_lat         double precision default null,
  p_lng         double precision default null,
  p_relato      text default null,
  p_fora_escopo boolean default false
)
returns imobproj.service_orders
language plpgsql
security invoker
set search_path = imobproj, extensions
as $$
declare
  v_os  imobproj.service_orders;
  v_fim timestamptz;
begin
  select * into v_os from imobproj.service_orders where id = p_os_id;
  if not found then
    raise exception 'OS não encontrada' using errcode = 'P0002';
  end if;
  if v_os.executor_id is distinct from auth.uid() then
    raise exception 'Só o executor da OS pode fazer check-out' using errcode = '42501';
  end if;

  -- Reenvio da fila offline: o check-out já foi gravado.
  if v_os.checkout_at is not null and v_os.status in ('aguardando_aceite', 'aprovada', 'recusada') then
    return v_os;
  end if;
  if v_os.status <> 'em_execucao' or v_os.checkin_at is null then
    raise exception 'O check-out só pode ser feito em uma OS em execução' using errcode = '23514';
  end if;

  v_fim := greatest(imobproj.fn_app_hora_do_fato(p_em), v_os.checkin_at);

  update imobproj.service_orders
     set status               = 'aguardando_aceite',
         checkout_at          = v_fim,
         checkout_lat         = p_lat,
         checkout_lng         = p_lng,
         checkout_recebido_em = now(),
         horas                = round((extract(epoch from (v_fim - v_os.checkin_at)) / 3600.0)::numeric, 2),
         relato               = nullif(btrim(coalesce(p_relato, '')), ''),
         fora_escopo          = v_os.fora_escopo or coalesce(p_fora_escopo, false)
   where id = p_os_id
   returning * into v_os;
  return v_os;
end;
$$;

revoke all on function imobproj.fn_app_checkin(uuid, timestamptz, double precision, double precision) from public, anon;
revoke all on function imobproj.fn_app_checkout(uuid, timestamptz, double precision, double precision, text, boolean) from public, anon;
grant execute on function imobproj.fn_app_checkin(uuid, timestamptz, double precision, double precision) to authenticated;
grant execute on function imobproj.fn_app_checkout(uuid, timestamptz, double precision, double precision, text, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- 2) Evidências
-- -----------------------------------------------------------------------------
alter table imobproj.os_evidences
  add column if not exists recebido_em timestamptz not null default now(),
  add column if not exists precisao_m  double precision,
  add column if not exists descricao   text;

comment on column imobproj.os_evidences.recebido_em is
  'Hora do servidor ao receber a evidência (captured_at/lat/lng vêm do aparelho).';

-- recebido_em é sempre do servidor, mesmo que o cliente mande outro valor.
create or replace function imobproj.fn_os_evidences_recebido()
returns trigger
language plpgsql
set search_path = imobproj, extensions
as $$
begin
  new.recebido_em := now();
  return new;
end;
$$;

create or replace trigger trg_os_evidences_recebido
  before insert on imobproj.os_evidences
  for each row execute function imobproj.fn_os_evidences_recebido();

create unique index if not exists os_evidences_storage_path_uq on imobproj.os_evidences (storage_path);

create or replace function imobproj.fn_app_registrar_evidencia(
  p_os_id        uuid,
  p_tipo         imobproj.evidence_tipo,
  p_storage_path text,
  p_capturado_em timestamptz,
  p_lat          double precision default null,
  p_lng          double precision default null,
  p_precisao_m   double precision default null,
  p_descricao    text default null
)
returns uuid
language plpgsql
security invoker
set search_path = imobproj, extensions
as $$
declare
  v_projeto uuid;
  v_id      uuid;
begin
  v_projeto := imobproj.fn_project_of_os(p_os_id);
  if v_projeto is null then
    raise exception 'OS não encontrada' using errcode = 'P0002';
  end if;
  -- evidencias/<project_id>/<os_id>/<arquivo>
  if p_storage_path not like v_projeto::text || '/' || p_os_id::text || '/%'
     or position('/' in substr(p_storage_path, length(v_projeto::text || '/' || p_os_id::text || '/') + 1)) > 0 then
    raise exception 'Caminho do arquivo inválido para esta OS' using errcode = '22023';
  end if;

  insert into imobproj.os_evidences (os_id, tipo, storage_path, captured_at, lat, lng, precisao_m, descricao, origem)
  values (p_os_id, p_tipo, p_storage_path, imobproj.fn_app_hora_do_fato(p_capturado_em),
          p_lat, p_lng, p_precisao_m, nullif(btrim(coalesce(p_descricao, '')), ''), 'app')
  on conflict (storage_path) do nothing
  returning id into v_id;

  if v_id is null then   -- reenvio da fila offline
    select id into v_id from imobproj.os_evidences where storage_path = p_storage_path;
  end if;
  return v_id;
end;
$$;

revoke all on function imobproj.fn_app_registrar_evidencia(uuid, imobproj.evidence_tipo, text, timestamptz, double precision, double precision, double precision, text) from public, anon;
grant execute on function imobproj.fn_app_registrar_evidencia(uuid, imobproj.evidence_tipo, text, timestamptz, double precision, double precision, double precision, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 3) Notificações push
-- -----------------------------------------------------------------------------
create table if not exists imobproj.push_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references imobproj.profiles (id) on delete cascade,
  token       text not null unique,
  plataforma  text not null check (plataforma in ('android', 'ios')),
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists push_tokens_user_idx on imobproj.push_tokens (user_id) where ativo;

create table if not exists imobproj.push_outbox (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references imobproj.profiles (id) on delete cascade,
  titulo      text not null,
  corpo       text not null,
  dados       jsonb not null default '{}'::jsonb,
  status      text not null default 'pendente' check (status in ('pendente', 'enviada', 'falhou', 'sem_aparelho')),
  tentativas  integer not null default 0,
  erro        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists push_outbox_fila_idx on imobproj.push_outbox (created_at) where status in ('pendente', 'falhou');

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_push_tokens_updated_at') then
    create trigger trg_push_tokens_updated_at before update on imobproj.push_tokens
      for each row execute function imobproj.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_push_outbox_updated_at') then
    create trigger trg_push_outbox_updated_at before update on imobproj.push_outbox
      for each row execute function imobproj.set_updated_at();
  end if;
end
$$;

alter table imobproj.push_tokens enable row level security;
alter table imobproj.push_outbox enable row level security;

-- Cada usuário vê e desativa os próprios aparelhos; o registro passa por fn_push_registrar_token.
drop policy if exists push_tokens_select on imobproj.push_tokens;
create policy push_tokens_select on imobproj.push_tokens
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists push_tokens_update on imobproj.push_tokens;
create policy push_tokens_update on imobproj.push_tokens
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- push_outbox: sem políticas — só service_role (Edge Function) e os triggers SECURITY DEFINER.

-- Um aparelho pertence a quem fez login por último nele.
create or replace function imobproj.fn_push_registrar_token(p_token text, p_plataforma text)
returns void
language plpgsql
security definer
set search_path = imobproj, extensions
as $$
begin
  if auth.uid() is null then
    raise exception 'Sem sessão' using errcode = '42501';
  end if;
  if coalesce(btrim(p_token), '') = '' or p_plataforma not in ('android', 'ios') then
    raise exception 'Token inválido' using errcode = '22023';
  end if;
  insert into imobproj.push_tokens (user_id, token, plataforma, ativo)
  values (auth.uid(), btrim(p_token), p_plataforma, true)
  on conflict (token) do update
    set user_id = excluded.user_id, plataforma = excluded.plataforma, ativo = true;
end;
$$;
revoke all on function imobproj.fn_push_registrar_token(text, text) from public, anon;
grant execute on function imobproj.fn_push_registrar_token(text, text) to authenticated;

-- Dispara push-send para um item da fila (pg_net é assíncrono: não segura a transação).
create or replace function imobproj.fn_push_disparar(p_id uuid)
returns void
language plpgsql
security definer
set search_path = imobproj, extensions
as $$
declare
  v_url   text;
  v_chave text;
  v_cron  text;
begin
  select d.decrypted_secret into v_url from vault.decrypted_secrets d where d.name = 'imobproj_openwa_functions_url';
  select d.decrypted_secret into v_chave from vault.decrypted_secrets d where d.name = 'imobproj_openwa_anon_key';
  select d.decrypted_secret into v_cron from vault.decrypted_secrets d where d.name = 'imobproj_openwa_cron_secret';
  if v_url is null or v_chave is null or v_cron is null then
    return;   -- sem a base das Edge Functions no Vault: fica na fila
  end if;
  perform net.http_post(
    url := rtrim(v_url, '/') || '/push-send',
    body := jsonb_build_object('id', p_id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_chave,
      'apikey', v_chave,
      'x-openwa-cron', v_cron
    ),
    timeout_milliseconds := 20000
  );
end;
$$;
revoke all on function imobproj.fn_push_disparar(uuid) from public, anon, authenticated;

create or replace function imobproj.fn_push_outbox_disparar()
returns trigger
language plpgsql
security definer
set search_path = imobproj, extensions
as $$
begin
  perform imobproj.fn_push_disparar(new.id);
  return new;
end;
$$;

create or replace trigger trg_push_outbox_disparar
  after insert on imobproj.push_outbox
  for each row execute function imobproj.fn_push_outbox_disparar();

-- OS atribuída, aprovada ou recusada → notifica o executor.
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

create or replace trigger trg_push_os_notificar
  after insert or update of executor_id, status on imobproj.service_orders
  for each row execute function imobproj.fn_push_os_notificar();

-- Reenvio: pendentes antigas e falhas, até 5 tentativas.
create or replace function imobproj.fn_push_processar_fila(p_limite integer default 50)
returns integer
language plpgsql
security definer
set search_path = imobproj, extensions
as $$
declare
  v_id  uuid;
  v_qtd integer := 0;
begin
  for v_id in
    select o.id
      from imobproj.push_outbox o
     where o.tentativas < 5
       and (o.status = 'falhou'
            or (o.status = 'pendente' and o.created_at < now() - interval '1 minute'))
     order by o.created_at
     limit greatest(p_limite, 1)
  loop
    perform imobproj.fn_push_disparar(v_id);
    v_qtd := v_qtd + 1;
  end loop;
  return v_qtd;
end;
$$;
revoke all on function imobproj.fn_push_processar_fila(integer) from public, anon, authenticated;
grant execute on function imobproj.fn_push_processar_fila(integer) to service_role;

do $$
begin
  perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'imobproj-push-reenvio';
  perform cron.schedule('imobproj-push-reenvio', '*/2 * * * *', 'select imobproj.fn_push_processar_fila();');
end
$$;
