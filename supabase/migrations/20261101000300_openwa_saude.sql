-- =============================================================================
-- IMOBPROJ · Verificação de saúde do OpenWA (pg_cron 1 min → Edge Function openwa-saude)
-- Migration ADITIVA e idempotente.
--
-- O OpenWA só manda webhook quando há evento; em silêncio o last_heartbeat envelhecia e o selo
-- "OpenWA conectado" (sinal nos últimos 2 min) ficava vermelho com a sessão funcionando.
-- A openwa-saude pergunta GET /sessions ao OpenWA e atualiza status + last_heartbeat de wa_sessions.
-- Usa os segredos imobproj_openwa_functions_url / _anon_key / _cron_secret (os mesmos do reenvio).
-- =============================================================================

create or replace function imobproj.fn_openwa_saude_disparar()
returns boolean
language plpgsql
security definer
set search_path = imobproj, extensions
as $$
declare
  v_url   text;
  v_chave text;
  v_cron  text;
begin
  if not exists (select 1 from imobproj.openwa_config c where c.ativo)
     or not exists (select 1 from imobproj.wa_sessions s where s.openwa_session_id is not null) then
    return false;
  end if;
  select d.decrypted_secret into v_url from vault.decrypted_secrets d where d.name = 'imobproj_openwa_functions_url';
  select d.decrypted_secret into v_chave from vault.decrypted_secrets d where d.name = 'imobproj_openwa_anon_key';
  select d.decrypted_secret into v_cron from vault.decrypted_secrets d where d.name = 'imobproj_openwa_cron_secret';
  if v_url is null or v_chave is null or v_cron is null then
    return false;
  end if;
  perform net.http_post(
    url := rtrim(v_url, '/') || '/openwa-saude',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_chave,
      'apikey', v_chave,
      'x-openwa-cron', v_cron
    ),
    timeout_milliseconds := 20000
  );
  return true;
end;
$$;
revoke all on function imobproj.fn_openwa_saude_disparar() from public, anon, authenticated;
grant execute on function imobproj.fn_openwa_saude_disparar() to service_role;

do $$
begin
  perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'imobproj-openwa-saude';
  perform cron.schedule('imobproj-openwa-saude', '* * * * *', 'select imobproj.fn_openwa_saude_disparar();');
end
$$;
