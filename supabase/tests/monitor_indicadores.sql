-- Teste do Monitor de atendimento da Fase 4 (rode no banco LOCAL):
--   docker exec -i supabase_db_imobproj psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/monitor_indicadores.sql
-- Tudo dentro de uma transação desfeita no fim: não deixa dados.
begin;

-- Muda o usuário "logado" (auth.uid()) e o papel do banco, como o PostgREST faz.
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
  v_super uuid := 'a0000000-0000-0000-0000-000000000001';
  v_gerente uuid := 'a0000000-0000-0000-0000-000000000002';
  v_lucas uuid := 'a0000000-0000-0000-0000-000000000005';
  v_proj uuid := 'c0000000-0000-0000-0000-000000000014';
  v_agora timestamptz := '2026-10-20 15:00-03';
  v_setor uuid; v_team uuid; v_sessao uuid; v_g1 uuid; v_g2 uuid; v_at uuid;
  r jsonb; v_n int; v_ok boolean;
begin
  -- Cenário controlado: setor de teste, sempre aberto, com o Lucas na equipe.
  insert into imobproj.setores (nome, gestor_id) values ('Teste Monitor', null) returning id into v_setor;
  update imobproj.setor_horarios set aberto = true, abre = '00:00', fecha = '23:59' where setor_id = v_setor;
  insert into imobproj.teams (nome, setor, setor_id) values ('Equipe Teste Monitor', 'Teste Monitor', v_setor) returning id into v_team;
  insert into imobproj.team_members (team_id, user_id) values (v_team, v_lucas);
  insert into imobproj.wa_sessions (project_id, numero, openwa_url, status) values (v_proj, '5519900001234', 'http://localhost:8002', 'conectado') returning id into v_sessao;
  insert into imobproj.setor_numeros (session_id, setor_id) values (v_sessao, v_setor);
  insert into imobproj.wa_groups (project_id, session_id, equipe, nome, wa_group_id)
  values (v_proj, v_sessao, 'Teste', 'Teste Monitor 1', 'teste-monitor-1@g.us') returning id into v_g1;
  insert into imobproj.wa_groups (project_id, session_id, equipe, nome, wa_group_id)
  values (v_proj, v_sessao, 'Teste', 'Teste Monitor 2', 'teste-monitor-2@g.us') returning id into v_g2;

  -- Outubro (período atual até 20/10 15h): 3 atendidas.
  --   a) espera 2 min, atendimento 10 min, sem transferência          → resolvida no 1º
  --   b) espera 4 min, atendimento 20 min, 1 transferência             → não resolvida
  --   c) espera 6 min, atendimento 30 min, cliente voltou em 24 h, fora do horário → não resolvida
  insert into imobproj.atendimentos (setor_id, group_id, project_id, atendente_id, status, entrou_fila_em, assumido_em, encerrado_em,
                                     transferencias, reaberto_em_24h, fora_horario) values
    (v_setor, v_g1, v_proj, v_lucas, 'encerrado', '2026-10-05 10:00-03', '2026-10-05 10:02-03', '2026-10-05 10:12-03', 0, false, false),
    (v_setor, v_g1, v_proj, v_lucas, 'encerrado', '2026-10-10 10:00-03', '2026-10-10 10:04-03', '2026-10-10 10:24-03', 1, false, false),
    (v_setor, v_g1, v_proj, v_lucas, 'encerrado', '2026-10-15 22:00-03', '2026-10-15 22:06-03', '2026-10-15 22:36-03', 0, true,  true),
    -- depois de "agora": não conta
    (v_setor, v_g1, v_proj, v_lucas, 'encerrado', '2026-10-25 10:00-03', '2026-10-25 10:01-03', '2026-10-25 10:05-03', 0, false, false),
    -- setembro, dentro do mesmo trecho (até 20/09 15h): 1 atendida
    (v_setor, v_g1, v_proj, v_lucas, 'encerrado', '2026-09-10 10:00-03', '2026-09-10 10:10-03', '2026-09-10 10:40-03', 0, false, false),
    -- setembro, fora do trecho comparável
    (v_setor, v_g1, v_proj, v_lucas, 'encerrado', '2026-09-25 10:00-03', '2026-09-25 10:01-03', '2026-09-25 10:02-03', 0, false, false);

  -- 1) indicadores do mês como super admin (só o setor de teste)
  perform pg_temp.como(v_super);
  r := imobproj.monitor_indicadores('mes', v_setor, v_agora);
  perform pg_temp.como_postgres();
  assert (r->'atual'->>'atendidas')::int = 3, format('1) atendidas: %s', r->'atual');
  assert (r->'atual'->>'resolvidas1o')::int = 1, format('1) resolvidas no 1º: %s', r->'atual');
  assert (r->'atual'->>'foraHorario')::int = 1, format('1) fora do horário: %s', r->'atual');
  assert (r->'atual'->>'esperaMediaSeg')::numeric = 240, format('1) espera média: %s', r->'atual');
  assert (r->'atual'->>'atendimentoMedioSeg')::numeric = 1200, format('1) atendimento médio: %s', r->'atual');
  assert (r->'anterior'->>'atendidas')::int = 1, format('1) anterior atendidas: %s', r->'anterior');
  assert (r->>'inicio')::timestamptz = '2026-10-01 00:00-03', format('1) início do período: %s', r->>'inicio');

  -- 2) "hoje" em 20/10: nada encerrado nesse dia
  perform pg_temp.como(v_super);
  r := imobproj.monitor_indicadores('hoje', v_setor, v_agora);
  perform pg_temp.como_postgres();
  assert (r->'atual'->>'atendidas')::int = 0, format('2) hoje: %s', r->'atual');

  -- 3) escopo: analista (sem o menu) não monitora nada; como atendente, só os setores das equipes dele
  perform pg_temp.como(v_lucas);
  assert cardinality(imobproj.fn_monitor_setores()) = 0, '3) analista não deveria monitorar';
  perform pg_temp.como_postgres();
  update imobproj.profiles set perfil = 'atendente' where id = v_lucas;
  perform pg_temp.como(v_lucas);
  assert v_setor = any (imobproj.fn_monitor_setores()), '3) atendente deveria ver o setor da equipe dele';
  assert not ('b3000000-0000-0000-0000-000000000002'::uuid = any (imobproj.fn_monitor_setores())),
    '3) atendente não deveria ver Implantação (não está na equipe)';
  perform pg_temp.como_postgres();

  -- 4) mensagem do cliente abre atendimento na fila; ninguém online → fica na fila, fora do horário
  update imobproj.atendente_status set online = false;
  insert into imobproj.wa_messages (group_id, direction, author_phone, body, status, created_at)
  values (v_g2, 'in', '5511977776666', 'Preciso de ajuda com o login', 'recebida', now());
  select imobproj.fn_atendimento_mensagem(id) into v_at from imobproj.wa_messages where group_id = v_g2 order by created_at desc limit 1;
  assert (select status from imobproj.atendimentos where id = v_at) = 'fila', '4) deveria entrar na fila';
  assert (select fora_horario from imobproj.atendimentos where id = v_at), '4) sem ninguém online conta como fora do horário';

  -- 5) Lucas fica online → a distribuição automática entrega a conversa para ele
  perform pg_temp.como(v_lucas);
  perform imobproj.at_meu_status(true, false);
  perform pg_temp.como_postgres();
  assert (select status = 'atendimento' and atendente_id = v_lucas from imobproj.atendimentos where id = v_at),
    '5) a distribuição deveria entregar ao Lucas';

  -- 6) outra pessoa não assume conversa já assumida
  v_ok := false;
  begin
    perform pg_temp.como(v_gerente);
    perform imobproj.at_assumir(v_at);
  exception when others then
    v_ok := sqlerrm like 'Outra pessoa já assumiu%';
  end;
  perform pg_temp.como_postgres();
  assert v_ok, '6) deveria recusar assumir conversa de outra pessoa';

  -- 7) Lucas devolve à fila e encerra depois de reassumir; o encerramento conta no indicador de hoje
  perform pg_temp.como(v_lucas);
  perform imobproj.at_meu_status(true, true);           -- pausa: a devolução não volta para ele
  perform imobproj.at_devolver_fila(v_at);
  perform pg_temp.como_postgres();
  assert (select status = 'fila' and devolvido_fila from imobproj.atendimentos where id = v_at), '7) deveria voltar à fila';
  perform pg_temp.como(v_lucas);
  perform imobproj.at_assumir(v_at);
  perform imobproj.at_encerrar(v_at);
  r := imobproj.monitor_indicadores('hoje', v_setor);
  perform pg_temp.como_postgres();
  assert (r->'atual'->>'atendidas')::int = 1, format('7) hoje deveria ter 1 atendida: %s', r->'atual');
  assert (r->'atual'->>'resolvidas1o')::int = 0, format('7) devolvida à fila não é resolvida no 1º: %s', r->'atual');

  -- 8) o cliente volta em menos de 24 h: abre outro atendimento e marca o anterior como reaberto
  insert into imobproj.wa_messages (group_id, direction, author_phone, body, status, created_at)
  values (v_g2, 'in', '5511977776666', 'Voltou a dar erro', 'recebida', now() + interval '1 minute');
  perform imobproj.fn_atendimento_mensagem(id) from imobproj.wa_messages where group_id = v_g2 order by created_at desc limit 1;
  assert (select reaberto_em_24h from imobproj.atendimentos where id = v_at), '8) anterior deveria ficar reaberto';
  select count(*) into v_n from imobproj.atendimentos where group_id = v_g2 and status <> 'encerrado';
  assert v_n = 1, format('8) deveria haver 1 atendimento aberto, há %s', v_n);

  -- 9) mensagem de quem atende não abre atendimento
  insert into imobproj.wa_messages (group_id, direction, author_phone, author_user_id, body, status, created_at)
  values (v_g1, 'in', '5511900000005', v_lucas, 'Bom dia, pessoal', 'recebida', now());
  perform imobproj.fn_atendimento_mensagem(id) from imobproj.wa_messages where group_id = v_g1 order by created_at desc limit 1;
  assert not exists (select 1 from imobproj.atendimentos where group_id = v_g1 and status <> 'encerrado'),
    '9) mensagem interna não deveria abrir atendimento';

  raise notice 'monitor_indicadores: 9 cenários OK';
end $$;

rollback;
