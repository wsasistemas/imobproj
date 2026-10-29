-- Teste da Fase 1 do plano docs/PLANO-conversas-numeros-monitor.md (rode no banco LOCAL):
--   docker exec -i supabase_db_imobproj psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/numeros_grupos_anotacoes.sql
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

do $$
declare
  v_super    uuid := 'a0000000-0000-0000-0000-000000000001';
  v_diretor  uuid := 'a0000000-0000-0000-0000-000000000002';
  v_gerente  uuid := 'a0000000-0000-0000-0000-000000000003';
  v_lucas    uuid := 'a0000000-0000-0000-0000-000000000005';  -- analista
  v_jorge    uuid := 'a0000000-0000-0000-0000-000000000006';  -- prestador
  v_proj     uuid := 'c0000000-0000-0000-0000-000000000014';
  v_sessao   uuid := '30000000-0000-0000-0000-000000000001';
  v_proj2 uuid; v_sessao2 uuid; v_team uuid; v_team_fora uuid; g1 uuid; g2 uuid;
  v_n int; v_txt text; v_ok boolean;
begin
  -- Cenário: segundo projeto com número próprio; equipe "Elétrica" ligada ao PRJ-014; Jorge (prestador) na equipe.
  insert into imobproj.projects (codigo, nome) values ('TST-NUM', 'Projeto teste números') returning id into v_proj2;
  insert into imobproj.wa_sessions (project_id, numero, openwa_url) values (v_proj2, '5521900000001', 'http://x') returning id into v_sessao2;
  insert into imobproj.teams (nome) values ('Elétrica teste') returning id into v_team;
  insert into imobproj.teams (nome) values ('Fora do projeto') returning id into v_team_fora;
  insert into imobproj.project_teams (project_id, team_id) values (v_proj, v_team);
  insert into imobproj.team_members (team_id, user_id) values (v_team, v_jorge);

  -- 1) D3: número de outro projeto é recusado
  begin
    insert into imobproj.wa_groups (project_id, session_id, equipe, nome, wa_group_id)
    values (v_proj, v_sessao2, 'x', 'Mistura', 'teste-num-1@g.us');
    raise exception '1) aceitou número de outro projeto';
  exception when check_violation then null;
  end;

  -- 2) D3: equipe que não atende o projeto é recusada
  begin
    insert into imobproj.wa_groups (project_id, session_id, team_id, equipe, nome, wa_group_id)
    values (v_proj, v_sessao, v_team_fora, 'x', 'Equipe errada', 'teste-num-2@g.us');
    raise exception '2) aceitou equipe fora do projeto';
  exception when check_violation then null;
  end;

  -- 3) vínculo certo: o texto "equipe" vem do cadastro
  insert into imobproj.wa_groups (project_id, session_id, team_id, equipe, nome, wa_group_id)
  values (v_proj, v_sessao, v_team, 'qualquer', 'Elétrica obra', 'teste-num-3@g.us') returning id, equipe into g1, v_txt;
  assert v_txt = 'Elétrica teste', format('3) equipe gravada como %s', v_txt);

  -- 4) D5: 31 dias sem mensagem → Anotações; fora de fn_wa_conversas
  insert into imobproj.wa_messages (group_id, wa_message_id, direction, author_phone, body, created_at)
  values (g1, 'teste-num-msg-1', 'in', '5521999990000', 'Quadro energizado #OS 12', now() - interval '31 days');
  v_n := imobproj.fn_anotacoes_mover();
  assert v_n >= 1, '4) nenhum grupo movido';
  assert (select anotacao_desde from imobproj.wa_groups where id = g1) is not null, '4) grupo não foi para Anotações';
  perform pg_temp.como(v_gerente);
  assert not exists (select 1 from imobproj.fn_wa_conversas(v_proj) c where c.group_id = g1), '4) grupo em Anotações apareceu em Conversas';

  -- 5) D8: prestador da equipe vê; analista fora da equipe não vê; gerente vê
  perform pg_temp.como(v_jorge);
  assert exists (select 1 from imobproj.anotacoes_grupos(v_proj) a where a.group_id = g1), '5) membro da equipe não viu a anotação';
  select count(*) into v_n from imobproj.anotacoes_mensagens(g1);
  assert v_n = 1, format('5) membro da equipe leu %s mensagens', v_n);
  perform pg_temp.como(v_lucas);
  assert not exists (select 1 from imobproj.anotacoes_grupos(v_proj) a where a.group_id = g1), '5) analista fora da equipe viu a anotação';
  v_ok := false;
  begin
    perform imobproj.anotacoes_mensagens(g1);
  exception when insufficient_privilege then v_ok := true;
  end;
  assert v_ok, '5) analista fora da equipe leu as mensagens';
  perform pg_temp.como(v_gerente);
  assert exists (select 1 from imobproj.anotacoes_grupos(v_proj) a where a.group_id = g1), '5) gerente não viu a anotação';

  -- 6) D6: Monitor — gerente, diretor e super admin sim; analista não
  perform pg_temp.como(v_gerente);
  select estado into v_txt from imobproj.conversas_monitor(v_proj) m where m.group_id = g1;
  assert v_txt = 'anotacao', format('6) estado %s', v_txt);
  perform pg_temp.como(v_diretor);
  perform imobproj.conversas_monitor(v_proj);
  perform pg_temp.como(v_super);
  perform imobproj.conversas_monitor(v_proj);
  perform pg_temp.como(v_lucas);
  v_ok := false;
  begin
    perform imobproj.conversas_monitor(v_proj);
  exception when insufficient_privilege then v_ok := true;
  end;
  assert v_ok, '6) analista abriu o Monitor';

  -- 7) mensagem nova devolve o grupo para Conversas e fica "online"
  perform pg_temp.como_postgres();
  insert into imobproj.wa_messages (group_id, wa_message_id, direction, author_phone, body)
  values (g1, 'teste-num-msg-2', 'in', '5521999990000', 'Voltamos');
  assert (select anotacao_desde from imobproj.wa_groups where id = g1) is null, '7) grupo não voltou para Conversas';
  perform pg_temp.como(v_gerente);
  select estado into v_txt from imobproj.conversas_monitor(v_proj) m where m.group_id = g1;
  assert v_txt = 'online', format('7) estado %s', v_txt);
  assert exists (select 1 from imobproj.fn_wa_conversas(v_proj) c where c.group_id = g1), '7) grupo não voltou à lista de Conversas';

  -- 8) espera: mensagem recebida há 40 min sem resposta
  perform pg_temp.como_postgres();
  insert into imobproj.wa_groups (project_id, session_id, team_id, equipe, nome, wa_group_id)
  values (v_proj, v_sessao, v_team, 'x', 'Espera', 'teste-num-4@g.us') returning id into g2;
  insert into imobproj.wa_messages (group_id, wa_message_id, direction, author_phone, body, created_at)
  values (g2, 'teste-num-msg-3', 'in', '5521999990000', 'Alguém?', now() - interval '40 minutes');
  perform pg_temp.como(v_gerente);
  assert (select esperando_desde from imobproj.conversas_monitor(v_proj) m where m.group_id = g2) is not null, '8) espera não marcada';
  assert (select estado from imobproj.conversas_monitor(v_proj) m where m.group_id = g2) = 'recente', '8) deveria ser recente';

  -- 9) project_teams: analista não escreve; gerente escreve
  perform pg_temp.como(v_lucas);
  v_ok := false;
  begin
    insert into imobproj.project_teams (project_id, team_id) values (v_proj, v_team_fora);
  exception when insufficient_privilege then v_ok := true;
  end;
  assert v_ok, '9) analista ligou equipe ao projeto';
  perform pg_temp.como(v_gerente);
  insert into imobproj.project_teams (project_id, team_id) values (v_proj, v_team_fora);

  perform pg_temp.como_postgres();
  raise notice 'numeros_grupos_anotacoes: 9 cenários OK';
end $$;

rollback;
