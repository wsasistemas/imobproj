-- Teste do "Restaurar dados da demo" (Fase 7). Rode no banco LOCAL depois de publicar a demo nele:
--   DEMO_SENHA=... SUPABASE_DEMO_DB_URL=postgresql://postgres:postgres@127.0.0.1:56322/postgres bash scripts/publicar-demo.sh
--   docker exec -i supabase_db_imobproj psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/demo_restaurar.sql
-- Tudo dentro de uma transação desfeita no fim: não deixa dados.
begin;

create or replace function pg_temp.como(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create or replace function pg_temp.como_postgres() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- Retrato do estado da demo: contagens e alguns valores que o uso costuma mudar.
create or replace function pg_temp.retrato() returns text language sql as $$
  select concat_ws('|',
    (select count(*) from imobproj.projects), (select count(*) from imobproj.service_orders),
    (select count(*) from imobproj.atendimentos), (select count(*) from imobproj.atendimentos where status = 'fila'),
    (select count(*) from imobproj.meetings), (select count(*) from imobproj.wbs_items),
    (select count(*) from imobproj.wa_messages), (select count(*) from imobproj.profiles),
    (select count(*) from imobproj.setores), (select count(*) from imobproj.app_aparelhos),
    (select count(*) from imobproj.organizations), (select count(*) from imobproj.teams),
    (select string_agg(titulo || ':' || status, ',' order by id) from imobproj.service_orders),
    (select min(ticket) from imobproj.atendimentos),
    (select count(*) from auth.users where raw_user_meta_data ->> 'sistema' = 'imobproj'),
    (select count(*) from imobproj.perfis), (select count(*) from imobproj.perfil_permissoes where ver),
    (select string_agg(concat_ws(':', empresa_nome, valor_hora_tecnica, exigir_foto_checkout), ',') from imobproj.configuracoes),
    (select count(*) from imobproj.openwa_config))
$$;

do $$
declare
  v_super    uuid := 'a0000000-0000-0000-0000-000000000001';
  v_gerente  uuid := 'a0000000-0000-0000-0000-000000000003';
  v_inicial  text;
  v_depois   text;
  v_ok       boolean;
begin
  v_inicial := pg_temp.retrato();

  -- 1) Bagunça típica de quem testa a demo: cria, apaga e altera.
  insert into imobproj.projects (codigo, nome, cliente_org_id, executora_org_id, inicio, fim, status, horas_orcadas)
  values ('TESTE-1', 'Projeto criado no teste', 'b0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000001',
          '2026-11-01', '2026-12-01', 'planejamento', 10);
  delete from imobproj.meetings where numero = 5;
  update imobproj.service_orders set titulo = 'Título alterado no teste' where id = 'e0000000-0000-0000-0000-000000000231';
  update imobproj.profiles set nome = 'Nome alterado' where id = v_gerente;
  update imobproj.atendimentos set status = 'encerrado', encerrado_em = now() where status = 'fila';
  update imobproj.perfil_permissoes set ver = not ver where perfil = 'analista';
  update imobproj.configuracoes set empresa_nome = 'Empresa alterada', valor_hora_tecnica = 1;
  if pg_temp.retrato() = v_inicial then raise exception 'cenário 1: a bagunça não mudou nada (teste inválido)'; end if;

  -- 2) Quem não é super admin não restaura.
  perform pg_temp.como(v_gerente);
  begin
    perform imobproj.demo_restaurar();
    v_ok := false;
  exception when insufficient_privilege then v_ok := true;
  end;
  perform pg_temp.como_postgres();
  if not v_ok then raise exception 'cenário 2: o gerente conseguiu restaurar'; end if;

  -- 3) O super admin restaura e tudo volta ao estado inicial (ticket recomeça em 1001, usuários recriados).
  perform pg_temp.como(v_super);
  perform imobproj.demo_restaurar();
  perform pg_temp.como_postgres();
  v_depois := pg_temp.retrato();
  if v_depois <> v_inicial then
    raise exception 'cenário 3: estado diferente do inicial. Antes: % · Depois: %', v_inicial, v_depois;
  end if;
  if (select nome from imobproj.profiles where id = v_gerente) <> 'Carla Mendes' then
    raise exception 'cenário 3: o nome da gerente não voltou';
  end if;

  -- 4) Perfis, permissões e configurações existem e voltaram ao inicial (o retrato acima já compara os valores).
  if (select count(*) from imobproj.perfis) < 6 or (select count(*) from imobproj.perfil_permissoes) = 0
     or not exists (select 1 from imobproj.configuracoes) or not exists (select 1 from imobproj.openwa_config) then
    raise exception 'cenário 4: perfis, permissões ou configurações sumiram';
  end if;

  -- 5) Sem usuário (script de publicação, role postgres) também restaura.
  perform imobproj.demo_restaurar();
  if pg_temp.retrato() <> v_inicial then raise exception 'cenário 5: restaurar pelo script mudou o estado'; end if;

  raise notice 'demo_restaurar: 5 cenários OK';
end $$;

rollback;
