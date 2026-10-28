-- =============================================================================
-- IMOBPROJ · WhatsApp via OpenWA (Prompt 2, itens 2 a 5) — migration ADITIVA e idempotente
--
-- 1) openwa_config: configuração global (linha única) — ligado/desligado, URL, ids dos segredos no Vault
--    e o resultado do último "Testar conexão". RLS: só super_admin.
-- 2) Segredos no Supabase Vault (extensão supabase_vault):
--      openwa_api_key         API key do OpenWA (X-API-Key)
--      openwa_webhook_secret  segredo do webhook (header x-openwa-secret e/ou HMAC X-OpenWA-Signature)
--      openwa_functions_url   base das Edge Functions usada pelo cron (ex.: https://<ref>.supabase.co/functions/v1)
--      openwa_anon_key        chave anon (JWT público) que o cron manda no Authorization (verify_jwt da função)
--      openwa_cron_secret     segredo gerado aqui; o cron manda em x-openwa-cron e openwa-send confere no Vault
--    Gravação: fn_openwa_salvar_api_key / fn_openwa_gerar_webhook_secret / fn_openwa_definir_segredo
--    (SECURITY DEFINER, só super_admin ou service_role). Leitura: fn_openwa_segredo — SÓ service_role
--    (Edge Functions e Server Actions com o admin client). A chave nunca volta para o navegador.
-- 3) wa_sessions.openwa_session_id (id da sessão no OpenWA) e wa_messages.enviando_desde (trava de envio).
-- 4) Bucket privado "whatsapp": mídia recebida/enviada nos grupos. Caminho <project_id>/<group_id>/<arquivo>.
--    wa_messages.media_path guarda "<bucket>/<caminho>" (ex.: "whatsapp/<project>/<group>/2026-10/abc.jpg").
-- 5) alertas: avisos para o super_admin (ex.: mensagem que falhou 5 vezes). Trigger em wa_messages.
-- 6) Fila de reenvio: fn_openwa_processar_fila() + job pg_cron "openwa-reenvio" a cada 2 minutos, que chama
--    a Edge Function openwa-send via pg_net (URL e chave lidas do Vault).
-- =============================================================================

create extension if not exists supabase_vault with schema vault;
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- -----------------------------------------------------------------------------
-- 1. Configuração global
-- -----------------------------------------------------------------------------
create table if not exists public.openwa_config (
  id                        boolean primary key default true check (id),   -- linha única
  ativo                     boolean not null default false,
  url                       text,
  api_key_secret_id         uuid,           -- vault.secrets.id
  api_key_atualizada_em     timestamptz,
  webhook_secret_id         uuid,           -- vault.secrets.id
  webhook_secret_gerado_em  timestamptz,
  ultimo_teste              jsonb,          -- {ok, latencia_ms, em, erro, sessoes:[{id,name,status,phone}]}
  updated_by                uuid references public.profiles (id) on delete set null,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
comment on table public.openwa_config is
  'Configuração global do OpenWA (linha única). A API key e o segredo do webhook ficam no Supabase Vault; aqui só os ids.';

insert into public.openwa_config (id) values (true) on conflict (id) do nothing;

drop trigger if exists trg_openwa_config_updated_at on public.openwa_config;
create trigger trg_openwa_config_updated_at
  before update on public.openwa_config
  for each row execute function public.set_updated_at();

alter table public.openwa_config enable row level security;
revoke all on public.openwa_config from anon;
grant select, update on public.openwa_config to authenticated;
grant all on public.openwa_config to service_role;

drop policy if exists openwa_config_select on public.openwa_config;
create policy openwa_config_select on public.openwa_config
  for select to authenticated
  using (public.fn_is_super_admin());

drop policy if exists openwa_config_update on public.openwa_config;
create policy openwa_config_update on public.openwa_config
  for update to authenticated
  using (public.fn_is_super_admin())
  with check (public.fn_is_super_admin());

-- -----------------------------------------------------------------------------
-- 2. Colunas novas
-- -----------------------------------------------------------------------------
alter table public.wa_sessions add column if not exists openwa_session_id text;
comment on column public.wa_sessions.openwa_session_id is
  'Id da sessão no OpenWA (campo "id" de GET /api/sessions; o webhook manda em "sessionId").';
create unique index if not exists wa_sessions_openwa_session_unq
  on public.wa_sessions (openwa_session_id) where openwa_session_id is not null;

alter table public.wa_messages add column if not exists enviando_desde timestamptz;
comment on column public.wa_messages.enviando_desde is
  'Trava de envio da Edge Function openwa-send (evita envio duplo entre o portal e o cron). Null = livre.';

-- -----------------------------------------------------------------------------
-- 3. Segredos no Vault
-- -----------------------------------------------------------------------------
-- true para super_admin logado, service_role (Edge Functions / admin client) e SQL direto (cron, psql).
create or replace function public.fn_openwa_pode_gerir()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.fn_is_super_admin()
      or coalesce(auth.role(), '') = 'service_role'
      or (auth.uid() is null and coalesce(auth.role(), '') not in ('anon', 'authenticated'));
$$;
revoke all on function public.fn_openwa_pode_gerir() from public, anon;
grant execute on function public.fn_openwa_pode_gerir() to authenticated, service_role;

-- Grava (cria ou substitui) um segredo do OpenWA no Vault. Nomes permitidos: lista fixa.
create or replace function public.fn_openwa_definir_segredo(p_nome text, p_valor text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, vault
as $$
declare
  v_id uuid;
begin
  if not public.fn_openwa_pode_gerir() then
    raise exception 'Apenas o super admin pode alterar a configuração do OpenWA' using errcode = '42501';
  end if;
  if p_nome not in ('openwa_api_key', 'openwa_webhook_secret', 'openwa_functions_url', 'openwa_anon_key', 'openwa_cron_secret') then
    raise exception 'Segredo desconhecido: %', p_nome using errcode = '22023';
  end if;
  if coalesce(btrim(p_valor), '') = '' then
    raise exception 'Informe o valor do segredo' using errcode = '23514';
  end if;

  select s.id into v_id from vault.secrets s where s.name = p_nome;
  if v_id is null then
    v_id := vault.create_secret(btrim(p_valor), p_nome, 'IMOBPROJ · OpenWA');
  else
    perform vault.update_secret(v_id, btrim(p_valor), p_nome, 'IMOBPROJ · OpenWA');
  end if;
  return v_id;
end;
$$;
revoke all on function public.fn_openwa_definir_segredo(text, text) from public, anon;
grant execute on function public.fn_openwa_definir_segredo(text, text) to authenticated, service_role;

-- API key do OpenWA: grava no Vault e marca a data em openwa_config. Devolve só a data.
create or replace function public.fn_openwa_salvar_api_key(p_chave text)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_em timestamptz := now();
begin
  v_id := public.fn_openwa_definir_segredo('openwa_api_key', p_chave);
  update public.openwa_config
     set api_key_secret_id = v_id, api_key_atualizada_em = v_em, updated_by = auth.uid()
   where id;
  return v_em;
end;
$$;
revoke all on function public.fn_openwa_salvar_api_key(text) from public, anon;
grant execute on function public.fn_openwa_salvar_api_key(text) to authenticated, service_role;

-- Gera um novo segredo do webhook (64 hex), grava no Vault e devolve o valor UMA vez (para copiar).
create or replace function public.fn_openwa_gerar_webhook_secret()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_segredo text := encode(extensions.gen_random_bytes(32), 'hex');
  v_id uuid;
begin
  v_id := public.fn_openwa_definir_segredo('openwa_webhook_secret', v_segredo);
  update public.openwa_config
     set webhook_secret_id = v_id, webhook_secret_gerado_em = now(), updated_by = auth.uid()
   where id;
  return v_segredo;
end;
$$;
revoke all on function public.fn_openwa_gerar_webhook_secret() from public, anon;
grant execute on function public.fn_openwa_gerar_webhook_secret() to authenticated, service_role;

-- Leitura de um segredo: SOMENTE service_role (Edge Functions e Server Actions com o admin client).
create or replace function public.fn_openwa_segredo(p_nome text)
returns text
language plpgsql
stable
security definer
set search_path = public, vault
as $$
declare
  v_valor text;
begin
  -- service_role (PostgREST) ou SQL direto sem JWT (cron/psql). anon/authenticated nunca.
  if not (coalesce(auth.role(), '') = 'service_role'
          or (auth.uid() is null and coalesce(auth.role(), '') not in ('anon', 'authenticated'))) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if p_nome not in ('openwa_api_key', 'openwa_webhook_secret', 'openwa_functions_url', 'openwa_anon_key', 'openwa_cron_secret') then
    raise exception 'Segredo desconhecido: %', p_nome using errcode = '22023';
  end if;
  select d.decrypted_secret into v_valor from vault.decrypted_secrets d where d.name = p_nome;
  return v_valor;
end;
$$;
revoke all on function public.fn_openwa_segredo(text) from public, anon, authenticated;
grant execute on function public.fn_openwa_segredo(text) to service_role;

-- Quais segredos existem (sem o valor) — para a tela de administração.
create or replace function public.fn_openwa_segredos_status()
returns table (nome text, atualizado_em timestamptz)
language sql
stable
security definer
set search_path = public, vault
as $$
  select s.name::text, s.updated_at
    from vault.secrets s
   where public.fn_openwa_pode_gerir()
     and s.name in ('openwa_api_key', 'openwa_webhook_secret', 'openwa_functions_url', 'openwa_anon_key', 'openwa_cron_secret');
$$;
revoke all on function public.fn_openwa_segredos_status() from public, anon;
grant execute on function public.fn_openwa_segredos_status() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. Bucket "whatsapp" (privado): <project_id>/<group_id>/<arquivo>
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('whatsapp', 'whatsapp', false, 52428800)
on conflict (id) do nothing;

drop policy if exists whatsapp_select on storage.objects;
create policy whatsapp_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'whatsapp'
    and public.fn_can_view_project(public.fn_try_uuid((storage.foldername(name))[1]))
  );

-- Quem pode mandar mensagem no grupo (vê o projeto) pode subir a mídia antes de enfileirar.
drop policy if exists whatsapp_insert on storage.objects;
create policy whatsapp_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'whatsapp'
    and public.fn_can_view_project(public.fn_try_uuid((storage.foldername(name))[1]))
  );

drop policy if exists whatsapp_delete on storage.objects;
create policy whatsapp_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'whatsapp'
    and public.fn_has_role(public.fn_try_uuid((storage.foldername(name))[1]), array['gerente'])
  );

-- -----------------------------------------------------------------------------
-- 5. Alertas para o super_admin
-- -----------------------------------------------------------------------------
create table if not exists public.alertas (
  id           uuid primary key default gen_random_uuid(),
  tipo         text not null,              -- ex.: 'whatsapp_envio_falhou'
  titulo       text not null,
  detalhe      text,
  project_id   uuid,                       -- sem FK: o alerta sobrevive à exclusão do projeto
  referencia   text,                       -- ex.: id da wa_message
  dados        jsonb not null default '{}'::jsonb,
  lido_em      timestamptz,
  lido_por     uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint alertas_referencia_unq unique (tipo, referencia)
);
create index if not exists alertas_nao_lidos_idx on public.alertas (created_at desc) where lido_em is null;
comment on table public.alertas is
  'Avisos operacionais para o super_admin (ex.: mensagem de WhatsApp que falhou 5 vezes). Gravados por trigger/Edge Function.';

drop trigger if exists trg_alertas_updated_at on public.alertas;
create trigger trg_alertas_updated_at
  before update on public.alertas
  for each row execute function public.set_updated_at();

alter table public.alertas enable row level security;
revoke all on public.alertas from anon;
grant select, update on public.alertas to authenticated;
grant all on public.alertas to service_role;

drop policy if exists alertas_select on public.alertas;
create policy alertas_select on public.alertas
  for select to authenticated
  using (public.fn_is_super_admin());

drop policy if exists alertas_update on public.alertas;
create policy alertas_update on public.alertas
  for update to authenticated
  using (public.fn_is_super_admin())
  with check (public.fn_is_super_admin());

-- Mensagem de saída que chegou a 5 tentativas sem sucesso → alerta (uma vez por mensagem).
create or replace function public.fn_wa_alerta_falha()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grupo record;
begin
  if new.direction = 'out' and new.status = 'falhou' and new.tentativas >= 5
     and (tg_op = 'INSERT' or old.tentativas < 5 or old.status <> 'falhou') then
    select g.project_id, g.nome into v_grupo from public.wa_groups g where g.id = new.group_id;
    insert into public.alertas (tipo, titulo, detalhe, project_id, referencia, dados)
    values (
      'whatsapp_envio_falhou',
      'Mensagem do WhatsApp não enviada após 5 tentativas',
      format('Grupo "%s": %s', coalesce(v_grupo.nome, '?'), coalesce(new.erro, 'erro desconhecido')),
      v_grupo.project_id,
      new.id::text,
      jsonb_build_object('message_id', new.id, 'group_id', new.group_id, 'erro', new.erro,
                         'trecho', left(coalesce(new.body, new.media_path, ''), 140))
    )
    on conflict (tipo, referencia) do nothing;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_wa_messages_alerta_falha on public.wa_messages;
create trigger trg_wa_messages_alerta_falha
  after insert or update of status, tentativas on public.wa_messages
  for each row execute function public.fn_wa_alerta_falha();

-- -----------------------------------------------------------------------------
-- 6. Fila de reenvio (pg_cron a cada 2 min → pg_net → Edge Function openwa-send)
--    Reenvia: 'falhou' e 'pendente' com mais de 2 min, tentativas < 5, sem trava de envio recente.
--    Precisa dos segredos openwa_functions_url e openwa_anon_key no Vault (tela de administração ou README).
--    Autenticação na função: Authorization = anon (passa no verify_jwt) + x-openwa-cron = openwa_cron_secret.
-- -----------------------------------------------------------------------------
create or replace function public.fn_openwa_processar_fila(p_limite integer default 20)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_url   text;
  v_chave text;
  v_cron  text;
  v_msg   record;
  v_qtd   integer := 0;
begin
  if not public.fn_openwa_pode_gerir() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if not coalesce((select c.ativo from public.openwa_config c where c.id), false) then
    return 0;   -- OpenWA desligado: nada sai
  end if;

  select d.decrypted_secret into v_url from vault.decrypted_secrets d where d.name = 'openwa_functions_url';
  select d.decrypted_secret into v_chave from vault.decrypted_secrets d where d.name = 'openwa_anon_key';
  select d.decrypted_secret into v_cron from vault.decrypted_secrets d where d.name = 'openwa_cron_secret';
  if v_url is null or v_chave is null or v_cron is null then
    raise notice 'OpenWA: configure openwa_functions_url e openwa_anon_key no Vault para o reenvio automático';
    return 0;
  end if;

  for v_msg in
    select m.id
      from public.wa_messages m
     where m.direction = 'out'
       and m.tentativas < 5
       and (m.status = 'falhou'
            or (m.status = 'pendente' and m.created_at < now() - interval '2 minutes'))
       and (m.enviando_desde is null or m.enviando_desde < now() - interval '2 minutes')
     order by m.created_at
     limit greatest(p_limite, 1)
  loop
    perform net.http_post(
      url := rtrim(v_url, '/') || '/openwa-send',
      body := jsonb_build_object('message_id', v_msg.id),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_chave,
        'apikey', v_chave,
        'x-openwa-cron', v_cron
      ),
      timeout_milliseconds := 20000
    );
    v_qtd := v_qtd + 1;
  end loop;
  return v_qtd;
end;
$$;
revoke all on function public.fn_openwa_processar_fila(integer) from public, anon, authenticated;
grant execute on function public.fn_openwa_processar_fila(integer) to service_role;

-- Segredo do cron: gerado uma vez (não muda em reaplicações).
do $$
begin
  if not exists (select 1 from vault.secrets s where s.name = 'openwa_cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'openwa_cron_secret', 'IMOBPROJ · OpenWA');
  end if;
end
$$;

do $$
begin
  perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'openwa-reenvio';
  perform cron.schedule('openwa-reenvio', '*/2 * * * *', 'select public.fn_openwa_processar_fila();');
end
$$;
