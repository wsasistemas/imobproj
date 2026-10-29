-- =============================================================================
-- IMOBPROJ · Schema próprio
-- O banco Supabase é compartilhado pelos sistemas IMOBSYSTEMS (cada um no seu schema:
-- imobdesk, imobpesagens, suprimentos...). Tudo do IMOBPROJ fica em "imobproj".
-- Objetos globais do banco levam o prefixo imobproj: buckets (imobproj-*), policies em
-- storage.objects (imobproj_*), trigger em auth.users, segredos do Vault e jobs do pg_cron.
--
-- A API (PostgREST) precisa expor o schema:
--   * local: supabase/config.toml → [api] schemas;
--   * nuvem: Dashboard › Project Settings › API › Exposed schemas (ou o comando do README).
-- =============================================================================

create schema if not exists imobproj;

grant usage on schema imobproj to anon, authenticated, service_role;

-- Mesmo padrão do schema public no Supabase: o acesso real é decidido pela RLS de cada tabela.
alter default privileges in schema imobproj grant all on tables to anon, authenticated, service_role;
alter default privileges in schema imobproj grant all on functions to anon, authenticated, service_role;
alter default privileges in schema imobproj grant all on sequences to anon, authenticated, service_role;

-- pgcrypto, pg_net, pg_cron e Vault já existem no projeto compartilhado; no local o CLI cria.
create extension if not exists pgcrypto with schema extensions;
