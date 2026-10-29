-- =============================================================================
-- Central de Acessos — RÉPLICA SÓ PARA O BANCO LOCAL. Nunca roda na nuvem.
--
-- Na nuvem (Supabase compartilhado ikvjaowvpvxojvcfwnct) o schema `acessos` e os atalhos
-- public.pa_* / public.pode_acessar_app já existem e pertencem à Central de Acessos (criada pelo
-- imobdesk). O IMOBPROJ só os USA (decisão D3): não cria modelo paralelo nem grava a estrutura lá.
--
-- Por que este arquivo fica fora de supabase/migrations:
--   * scripts/migrar-nuvem.sh aplica tudo o que está em supabase/migrations/*.sql na nuvem;
--     se esta réplica estivesse lá, sobrescreveria as funções da Central com esta cópia;
--   * aqui ele entra pelo [db.seed] do supabase/config.toml, que só roda no `supabase db reset`
--     local (depois do seed.sql, porque usa os usuários de teste).
--
-- Cópia fiel de pg_get_functiondef na nuvem em 29/10/2026. Única diferença:
-- imobdoces.sou_super_admin() é um stub que devolve false (o schema imobdoces não existe no
-- local); então, aqui, o super admin da Central é só a conta proprietária.
-- =============================================================================

create schema if not exists acessos;
create schema if not exists imobdoces;

create or replace function imobdoces.sou_super_admin()
returns boolean language sql stable security definer set search_path = '' as $$ select false $$;

create table if not exists acessos.aplicativos (
  schema_name           text primary key check (schema_name ~ '^[a-z_][a-z0-9_]{0,62}$'),
  nome                  text not null,
  url                   text,
  controle_ativo        boolean not null default false,
  padrao_novos          text not null default 'bloqueado' check (padrao_novos = any (array['bloqueado', 'liberado'])),
  schema_dados          text,
  perfil_liberar        text,
  oculto                boolean not null default false,
  controle_ativado_em   timestamptz,
  ultima_verificacao_em timestamptz,
  atualizado_em         timestamptz not null default now(),
  atualizado_por        uuid
);

create table if not exists acessos.contas_proprietarias (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  criado_em  timestamptz not null default now()
);

create table if not exists acessos.permissoes (
  schema_name              text not null references acessos.aplicativos (schema_name) on update cascade on delete cascade,
  user_id                  uuid not null references auth.users (id) on delete cascade,
  pode_entrar              boolean not null,
  origem_decisao           text not null default 'manual' check (origem_decisao = any (array['manual', 'carga'])),
  cadastrado_pela_central  boolean not null default false,
  alterado_por             uuid,
  alterado_em              timestamptz not null default now(),
  primary key (schema_name, user_id)
);

revoke all on all tables in schema acessos from anon, authenticated;
grant all on all tables in schema acessos to service_role;

CREATE OR REPLACE FUNCTION acessos.e_proprietario(p_usuario uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT p_usuario IS NOT NULL AND EXISTS (SELECT 1 FROM acessos.contas_proprietarias c WHERE c.user_id = p_usuario)
$function$;

CREATE OR REPLACE FUNCTION acessos.sou_super_admin()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT acessos.e_proprietario((SELECT auth.uid())) OR coalesce(imobdoces.sou_super_admin(), false)
$function$;

CREATE OR REPLACE FUNCTION acessos.exigir_super_admin()
 RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  IF NOT acessos.sou_super_admin() THEN
    RAISE EXCEPTION 'Somente o super admin gerencia as permissões por aplicativo.' USING ERRCODE = '42501';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION acessos.schema_de(p_app text)
 RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT coalesce((SELECT coalesce(a.schema_dados, a.schema_name) FROM acessos.aplicativos a WHERE a.schema_name = p_app), p_app)
$function$;

CREATE OR REPLACE FUNCTION acessos.tem_cadastro(p_app text, p_usuario uuid)
 RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_schema text := acessos.schema_de(p_app);
  v_tem_ativo boolean;
  v_tem_status boolean;
  v_achou boolean;
BEGIN
  IF p_usuario IS NULL OR pg_catalog.to_regclass(pg_catalog.format('%I.usuarios', v_schema)) IS NULL THEN
    RETURN false;
  END IF;
  SELECT bool_or(column_name = 'ativo'), bool_or(column_name = 'status')
    INTO v_tem_ativo, v_tem_status
    FROM information_schema.columns
   WHERE table_schema = v_schema AND table_name = 'usuarios';
  EXECUTE pg_catalog.format(
    'SELECT EXISTS (SELECT 1 FROM %I.usuarios u WHERE u.id = $1 %s)',
    v_schema,
    CASE
      WHEN v_tem_ativo THEN 'AND u.ativo'
      WHEN v_tem_status THEN 'AND coalesce(lower(u.status::text), '''') NOT IN (''inativo'', ''bloqueado'', ''suspenso'')'
      ELSE ''
    END)
    INTO v_achou USING p_usuario;
  RETURN coalesce(v_achou, false);
END;
$function$;

CREATE OR REPLACE FUNCTION acessos.pode_acessar(p_usuario uuid, p_app text)
 RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_app acessos.aplicativos;
  v_pode boolean;
BEGIN
  IF p_usuario IS NULL THEN RETURN false; END IF;
  -- 1. Conta proprietária.
  IF acessos.e_proprietario(p_usuario) THEN RETURN true; END IF;
  SELECT * INTO v_app FROM acessos.aplicativos a WHERE a.schema_name = p_app;
  IF v_app.schema_name IS NULL OR NOT v_app.controle_ativo THEN RETURN true; END IF;
  -- 2. Decisão manual do super admin.
  SELECT p.pode_entrar INTO v_pode FROM acessos.permissoes p
   WHERE p.schema_name = p_app AND p.user_id = p_usuario AND p.origem_decisao = 'manual';
  IF v_pode IS NOT NULL THEN RETURN v_pode; END IF;
  -- 3. Cadastro próprio no aplicativo.
  IF acessos.tem_cadastro(p_app, p_usuario) THEN RETURN true; END IF;
  -- 4. Padrão do aplicativo.
  RETURN v_app.padrao_novos = 'liberado';
END;
$function$;

CREATE OR REPLACE FUNCTION acessos.eu_posso(p_app text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT acessos.pode_acessar((SELECT auth.uid()), p_app)
$function$;

CREATE OR REPLACE FUNCTION acessos.provisionar(p_app text, p_usuario uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_schema text := acessos.schema_de(p_app);
  v_perfil text;
  v_colunas integer;
BEGIN
  SELECT count(*) INTO v_colunas FROM information_schema.columns
   WHERE table_schema = v_schema AND table_name = 'usuarios' AND column_name IN ('id', 'email', 'perfil', 'ativo');
  IF v_colunas < 4 OR pg_catalog.to_regclass(pg_catalog.format('%I.perfis', v_schema)) IS NULL THEN
    RETURN false;
  END IF;
  SELECT a.perfil_liberar INTO v_perfil FROM acessos.aplicativos a WHERE a.schema_name = p_app;
  IF v_perfil IS NULL THEN
    EXECUTE pg_catalog.format('SELECT chave FROM %I.perfis ORDER BY ordem DESC LIMIT 1', v_schema) INTO v_perfil;
  END IF;
  EXECUTE pg_catalog.format(
    'INSERT INTO %I.usuarios (id, email, perfil, ativo)
     SELECT u.id, lower(u.email), $2, true FROM auth.users u WHERE u.id = $1
     ON CONFLICT (id) DO UPDATE SET ativo = true', v_schema)
    USING p_usuario, v_perfil;
  RETURN true;
END;
$function$;

-- Atalhos públicos (os mesmos em todos os aplicativos)
CREATE OR REPLACE FUNCTION public.pa_sou_super_admin()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT acessos.sou_super_admin()
$function$;

CREATE OR REPLACE FUNCTION public.pode_acessar_app(p_app text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_app text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_app, '')));
BEGIN
  -- Registra que o aplicativo já faz a verificação (no máximo uma escrita a cada 10 minutos).
  UPDATE acessos.aplicativos a SET ultima_verificacao_em = pg_catalog.now()
   WHERE a.schema_name = v_app
     AND (a.ultima_verificacao_em IS NULL OR a.ultima_verificacao_em < pg_catalog.now() - interval '10 minutes');
  RETURN acessos.pode_acessar((SELECT auth.uid()), v_app);
END;
$function$;

CREATE OR REPLACE FUNCTION public.pa_listar_aplicativos()
 RETURNS TABLE(schema_name text, nome text, url text, controle_ativo boolean, padrao_novos text, schema_dados text, ultima_verificacao_em timestamp with time zone, controle_ativado_em timestamp with time zone, liberados bigint, bloqueados bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  PERFORM acessos.exigir_super_admin();
  RETURN QUERY
  SELECT a.schema_name, a.nome, a.url, a.controle_ativo, a.padrao_novos, coalesce(a.schema_dados, a.schema_name),
         a.ultima_verificacao_em, a.controle_ativado_em,
         (SELECT count(*) FROM acessos.permissoes p WHERE p.schema_name = a.schema_name AND p.origem_decisao = 'manual' AND p.pode_entrar),
         (SELECT count(*) FROM acessos.permissoes p WHERE p.schema_name = a.schema_name AND p.origem_decisao = 'manual' AND NOT p.pode_entrar)
    FROM acessos.aplicativos a
   WHERE NOT a.oculto
   ORDER BY a.nome;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pa_listar_usuarios(p_app text, p_busca text DEFAULT NULL::text)
 RETURNS TABLE(user_id uuid, email text, criado_em timestamp with time zone, ultimo_login timestamp with time zone, proprietario boolean, tem_cadastro boolean, decisao boolean, efetivo boolean)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  PERFORM acessos.exigir_super_admin();
  RETURN QUERY
  SELECT u.id, u.email::text, u.created_at, u.last_sign_in_at,
         acessos.e_proprietario(u.id),
         acessos.tem_cadastro(p_app, u.id),
         (SELECT p.pode_entrar FROM acessos.permissoes p
           WHERE p.schema_name = p_app AND p.user_id = u.id AND p.origem_decisao = 'manual'),
         acessos.pode_acessar(u.id, p_app)
    FROM auth.users u
   WHERE p_busca IS NULL OR u.email ILIKE '%' || p_busca || '%'
   ORDER BY u.email
   LIMIT 500;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pa_definir_controle(p_app text, p_ativo boolean)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  PERFORM acessos.exigir_super_admin();
  UPDATE acessos.aplicativos a
     SET controle_ativo = p_ativo,
         controle_ativado_em = CASE WHEN p_ativo THEN pg_catalog.now() ELSE a.controle_ativado_em END,
         atualizado_em = pg_catalog.now(),
         atualizado_por = auth.uid()
   WHERE a.schema_name = p_app;
  IF NOT FOUND THEN RAISE EXCEPTION 'Aplicativo % não encontrado.', p_app; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pa_definir_permissao(p_app text, p_usuario uuid, p_pode boolean)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_cadastrou boolean := false;
BEGIN
  PERFORM acessos.exigir_super_admin();
  IF NOT EXISTS (SELECT 1 FROM acessos.aplicativos a WHERE a.schema_name = p_app) THEN
    RAISE EXCEPTION 'Aplicativo % não encontrado.', p_app;
  END IF;
  IF p_pode IS NULL THEN
    DELETE FROM acessos.permissoes p WHERE p.schema_name = p_app AND p.user_id = p_usuario;
  ELSE
    IF p_pode AND NOT acessos.tem_cadastro(p_app, p_usuario) THEN
      v_cadastrou := acessos.provisionar(p_app, p_usuario);
    END IF;
    INSERT INTO acessos.permissoes (schema_name, user_id, pode_entrar, origem_decisao, cadastrado_pela_central, alterado_por)
    VALUES (p_app, p_usuario, p_pode, 'manual', v_cadastrou, auth.uid())
    ON CONFLICT (schema_name, user_id) DO UPDATE
      SET pode_entrar = excluded.pode_entrar, origem_decisao = 'manual',
          cadastrado_pela_central = acessos.permissoes.cadastrado_pela_central OR excluded.cadastrado_pela_central,
          alterado_por = excluded.alterado_por, alterado_em = pg_catalog.now();
  END IF;
  RETURN acessos.pode_acessar(p_usuario, p_app);
END;
$function$;

CREATE OR REPLACE FUNCTION public.pa_salvar_aplicativo(p_app text, p_nome text, p_url text, p_padrao_novos text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  PERFORM acessos.exigir_super_admin();
  UPDATE acessos.aplicativos a
     SET nome = coalesce(nullif(pg_catalog.btrim(p_nome), ''), a.nome),
         url = nullif(pg_catalog.btrim(p_url), ''),
         padrao_novos = coalesce(p_padrao_novos, a.padrao_novos),
         atualizado_em = pg_catalog.now(),
         atualizado_por = auth.uid()
   WHERE a.schema_name = p_app;
  IF NOT FOUND THEN RAISE EXCEPTION 'Aplicativo % não encontrado.', p_app; END IF;
END;
$function$;

revoke all on function public.pa_sou_super_admin(), public.pode_acessar_app(text), public.pa_listar_aplicativos(),
  public.pa_listar_usuarios(text, text), public.pa_definir_controle(text, boolean),
  public.pa_definir_permissao(text, uuid, boolean), public.pa_salvar_aplicativo(text, text, text, text) from public, anon;
grant execute on function public.pa_sou_super_admin(), public.pode_acessar_app(text), public.pa_listar_aplicativos(),
  public.pa_listar_usuarios(text, text), public.pa_definir_controle(text, boolean),
  public.pa_definir_permissao(text, uuid, boolean), public.pa_salvar_aplicativo(text, text, text, text) to authenticated, service_role;

-- Dados locais de teste: os mesmos aplicativos da nuvem + o IMOBPROJ com o controle LIGADO,
-- e o super admin do seed como conta proprietária (na nuvem é a conta do Wagner).
insert into acessos.aplicativos (schema_name, nome, url, controle_ativo, padrao_novos, schema_dados, perfil_liberar) values
  ('imobproj',       'IMOBPROJ',          'http://localhost:3000', true,  'bloqueado', null,     null),
  ('imobdesk',       'ImobDesk',          null,                    true,  'bloqueado', null,     'operador'),
  ('imobenviomassa', 'Disparo em massa',  null,                    true,  'bloqueado', null,     'analista'),
  ('suprimentos',    'Suprimentos',       null,                    false, 'bloqueado', null,     null)
on conflict (schema_name) do nothing;

insert into acessos.contas_proprietarias (user_id)
select u.id from auth.users u where u.email = 'superadmin@exemplo.com.br'
on conflict (user_id) do nothing;
