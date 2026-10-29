-- =============================================================================
-- IMOBPROJ · 007 · Realtime
-- Publica wa_messages (conversas em tempo real) e audit_log (feed de atividade).
-- O Realtime respeita a RLS das tabelas (postgres_changes).
-- Bloco idempotente: cria a publicação se faltar e só adiciona tabelas ausentes.
-- =============================================================================

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach t in array array['wa_messages', 'audit_log']
  loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'imobproj'
         and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table imobproj.%I', t);
    end if;
  end loop;
end
$$;
