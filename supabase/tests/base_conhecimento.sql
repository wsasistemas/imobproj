-- Teste da Fase 7 do plano docs/PLANO-conversas-numeros-monitor.md (rode no banco LOCAL):
--   docker exec -i supabase_db_imobproj psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/base_conhecimento.sql
-- Tudo dentro de uma transação desfeita no fim: não deixa dados. Os vetores são falsos (não chama o Gemini).
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
-- Vetor falso de 768 dimensões com 1 na posição p_pos (posições diferentes = trechos distantes).
create or replace function pg_temp.vet(p_pos int) returns text language sql as $$
  select '[' || string_agg(case when i = p_pos then '1' else '0' end, ',' order by i) || ']'
    from generate_series(1, 768) i;
$$;
-- Indexa tudo o que está na fila como a kb-indexar faria, com vetor falso.
create or replace function pg_temp.indexar() returns integer language plpgsql as $$
declare r record; v_n int := 0;
begin
  for r in select * from imobproj.fn_kb_pegar_fila(100) loop
    perform imobproj.fn_kb_gravar(r.fonte, r.fonte_id,
      coalesce((select jsonb_agg(t || jsonb_build_object('vetor', pg_temp.vet(1 + (t ->> 'ordem')::int)))
                  from jsonb_array_elements(r.trechos) t), '[]'::jsonb));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

do $$
declare
  v_super    uuid := 'a0000000-0000-0000-0000-000000000001';
  v_gerente  uuid := 'a0000000-0000-0000-0000-000000000003';
  v_lucas    uuid := 'a0000000-0000-0000-0000-000000000005';  -- analista do PRJ-014
  v_jorge    uuid := 'a0000000-0000-0000-0000-000000000006';  -- prestador do PRJ-014
  v_proj     uuid := 'c0000000-0000-0000-0000-000000000014';
  v_sessao   uuid := '30000000-0000-0000-0000-000000000001';
  v_proj2 uuid; v_os_rasc uuid; v_os_lucas uuid; v_os_jorge uuid; v_os_b uuid; v_team uuid; g1 uuid; v_perg uuid;
  v_n int; v_txt text; v_ok boolean;
begin
  -- 1) K4: CPF e telefone mascarados antes de ir para a IA
  v_txt := imobproj.fn_kb_mascarar('CPF 123.456.789-09, fone +55 (21) 99477-1524 e 2133334444; OS 231 de 2026');
  assert v_txt = 'CPF [CPF], fone [telefone] e [telefone]; OS 231 de 2026', format('1) máscara: %s', v_txt);

  -- 2) K1/K5: OS aprovada entra na fila; rascunho não
  delete from imobproj.kb_fila;
  delete from imobproj.kb_trechos;
  insert into imobproj.service_orders (project_id, numero, titulo, status)
  values (v_proj, 9901, 'OS rascunho teste', 'rascunho') returning id into v_os_rasc;
  assert not exists (select 1 from imobproj.kb_fila where fonte_id = v_os_rasc), '2) rascunho entrou na fila';
  select id into v_os_lucas from imobproj.service_orders where project_id = v_proj and numero = 231;
  select id into v_os_jorge from imobproj.service_orders where project_id = v_proj and numero = 233;
  update imobproj.service_orders set descricao = descricao || ' Contato do síndico: 21 99477-1524.' where id = v_os_lucas;
  update imobproj.service_orders set materiais = 'Cabo 10mm' where id = v_os_jorge;
  assert (select count(*) from imobproj.kb_fila where fonte = 'os') = 2, '2) OS aprovadas editadas não entraram na fila';

  -- 3) indexação: trecho gravado mascarado, fila esvaziada
  perform imobproj.fn_kb_enfileirar('ata', (select id from imobproj.meetings where project_id = v_proj and numero = 1));
  v_n := pg_temp.indexar();
  assert v_n = 3, format('3) %s itens indexados', v_n);
  assert not exists (select 1 from imobproj.kb_fila), '3) fila não esvaziou';
  select texto into v_txt from imobproj.kb_trechos where fonte = 'os' and fonte_id = v_os_lucas;
  assert v_txt like '%[telefone]%' and v_txt not like '%99477%', '3) telefone não foi mascarado no trecho';

  -- 4) item re-enfileirado durante a indexação continua na fila
  perform imobproj.fn_kb_enfileirar('os', v_os_jorge);
  perform imobproj.fn_kb_pegar_fila(10);
  perform imobproj.fn_kb_enfileirar('os', v_os_jorge);          -- mudou enquanto indexava
  perform imobproj.fn_kb_gravar('os', v_os_jorge, '[]'::jsonb);
  assert exists (select 1 from imobproj.kb_fila where fonte_id = v_os_jorge and pego_em is null), '4) re-enfileirado sumiu da fila';
  perform pg_temp.indexar();
  assert exists (select 1 from imobproj.kb_trechos where fonte_id = v_os_jorge), '4) OS do Jorge não voltou para a base';

  -- 5) K2: prestador só recebe a própria OS; analista recebe as OS e a ata do projeto
  perform pg_temp.como(v_jorge);
  select count(*) into v_n from imobproj.kb_buscar(pg_temp.vet(1)::extensions.vector, null, null, 30);
  assert v_n = 1, format('5) prestador recebeu %s trechos', v_n);
  assert (select fonte_id from imobproj.kb_buscar(pg_temp.vet(1)::extensions.vector)) = v_os_jorge, '5) prestador recebeu OS de outro executor';
  perform pg_temp.como(v_lucas);
  select count(*) into v_n from imobproj.kb_buscar(pg_temp.vet(1)::extensions.vector, null, null, 30);
  assert v_n = 3, format('5) analista recebeu %s trechos', v_n);
  select count(*) into v_n from imobproj.kb_buscar(pg_temp.vet(1)::extensions.vector, v_proj, array['ata'], 30);
  assert v_n = 1, format('5) filtro por fonte devolveu %s', v_n);

  -- 6) K2: membro do projeto A não recebe trecho do projeto B
  perform pg_temp.como_postgres();
  insert into imobproj.projects (codigo, nome) values ('TST-KB', 'Projeto teste base') returning id into v_proj2;
  insert into imobproj.service_orders (project_id, numero, titulo, status, aceite_comentario)
  values (v_proj2, 1, 'OS do projeto B', 'aprovada', 'Segredo do B') returning id into v_os_b;
  perform pg_temp.indexar();
  assert exists (select 1 from imobproj.kb_trechos where fonte_id = v_os_b), '6) OS do B não foi indexada';
  perform pg_temp.como(v_lucas);
  assert not exists (select 1 from imobproj.kb_buscar(pg_temp.vet(1)::extensions.vector, null, null, 30) b where b.project_id = v_proj2),
    '6) membro do A recebeu trecho do B';
  assert not exists (select 1 from imobproj.kb_trechos where project_id = v_proj2), '6) membro do A leu kb_trechos do B';
  perform pg_temp.como(v_super);
  assert exists (select 1 from imobproj.kb_buscar(pg_temp.vet(1)::extensions.vector, v_proj2) b), '6) super admin não recebeu o B';

  -- 7) anotações: grupo em Anotações entra; membro da equipe recebe, analista de fora não, gerente sim
  perform pg_temp.como_postgres();
  insert into imobproj.teams (nome) values ('Equipe KB teste') returning id into v_team;
  insert into imobproj.project_teams (project_id, team_id) values (v_proj, v_team);
  insert into imobproj.team_members (team_id, user_id) values (v_team, v_jorge);
  insert into imobproj.wa_groups (project_id, session_id, team_id, equipe, nome, wa_group_id)
  values (v_proj, v_sessao, v_team, 'x', 'Obra KB', 'teste-kb-1@g.us') returning id into g1;
  insert into imobproj.wa_messages (group_id, wa_message_id, direction, author_phone, body, created_at)
  values (g1, 'teste-kb-msg-1', 'in', '5521999990000', 'Disjuntor geral trocado, CPF 111.222.333-44', now() - interval '31 days');
  perform imobproj.fn_anotacoes_mover();
  assert exists (select 1 from imobproj.kb_fila where fonte = 'anotacao' and fonte_id = g1), '7) grupo em Anotações não entrou na fila';
  perform pg_temp.indexar();
  select texto into v_txt from imobproj.kb_trechos where fonte = 'anotacao' and fonte_id = g1;
  assert v_txt like '%Disjuntor geral trocado, CPF [CPF]%', format('7) texto da anotação: %s', v_txt);
  perform pg_temp.como(v_jorge);
  assert exists (select 1 from imobproj.kb_buscar(pg_temp.vet(1)::extensions.vector, null, array['anotacao']) b where b.fonte_id = g1),
    '7) membro da equipe não recebeu a anotação';
  perform pg_temp.como(v_lucas);
  assert not exists (select 1 from imobproj.kb_buscar(pg_temp.vet(1)::extensions.vector, null, array['anotacao']) b where b.fonte_id = g1),
    '7) analista fora da equipe recebeu a anotação';
  perform pg_temp.como(v_gerente);
  assert exists (select 1 from imobproj.kb_buscar(pg_temp.vet(1)::extensions.vector, null, array['anotacao']) b where b.fonte_id = g1),
    '7) gerente não recebeu a anotação';

  -- 8) mensagem nova devolve o grupo para Conversas: sai da base
  perform pg_temp.como_postgres();
  insert into imobproj.wa_messages (group_id, wa_message_id, direction, author_phone, body)
  values (g1, 'teste-kb-msg-2', 'in', '5521999990000', 'Voltamos');
  perform pg_temp.indexar();
  assert not exists (select 1 from imobproj.kb_trechos where fonte_id = g1), '8) grupo que voltou para Conversas ficou na base';

  -- 9) OS que deixa de estar aprovada sai da base; OS apagada também
  update imobproj.service_orders set status = 'recusada' where id = v_os_b;
  perform pg_temp.indexar();
  assert not exists (select 1 from imobproj.kb_trechos where fonte_id = v_os_b), '9) OS recusada ficou na base';
  delete from imobproj.service_orders where id = v_os_lucas;
  assert not exists (select 1 from imobproj.kb_trechos where fonte_id = v_os_lucas), '9) OS apagada ficou na base';

  -- 10) usuário comum não mexe na fila nem grava trecho
  perform pg_temp.como(v_gerente);
  v_ok := false;
  begin
    perform imobproj.fn_kb_pegar_fila(1);
  exception when insufficient_privilege then v_ok := true;
  end;
  assert v_ok, '10) gerente pegou a fila';
  v_ok := false;
  begin
    insert into imobproj.kb_trechos (fonte, fonte_id, project_id, titulo, texto, vetor)
    values ('os', gen_random_uuid(), v_proj, 'x', 'x', pg_temp.vet(1)::extensions.vector);
  exception when insufficient_privilege then v_ok := true;
  end;
  assert v_ok, '10) gerente gravou trecho';

  -- 11) K6: cada um vê só as próprias perguntas e só muda o 👍/👎
  perform pg_temp.como_postgres();
  insert into imobproj.kb_perguntas (user_id, project_id, pergunta, resposta)
  values (v_lucas, v_proj, 'Qual foi o SLA combinado?', 'Horas úteis [1]') returning id into v_perg;
  perform pg_temp.como(v_gerente);
  assert not exists (select 1 from imobproj.kb_perguntas where id = v_perg), '11) gerente viu pergunta do Lucas';
  perform pg_temp.como(v_lucas);
  update imobproj.kb_perguntas set avaliacao = 1 where id = v_perg;
  v_ok := false;
  begin
    update imobproj.kb_perguntas set resposta = 'inventada' where id = v_perg;
  exception when insufficient_privilege then v_ok := true;
  end;
  assert v_ok, '11) usuário alterou a resposta';
  perform pg_temp.como_postgres();
  assert (select avaliacao from imobproj.kb_perguntas where id = v_perg) = 1, '11) avaliação não gravou';

  raise notice 'base_conhecimento: 11 cenários OK';
end $$;

rollback;
