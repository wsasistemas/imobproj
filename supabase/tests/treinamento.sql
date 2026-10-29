-- Teste do Centro de Treinamento (Fase 8). Rode no banco LOCAL:
--   docker exec -i supabase_db_imobproj psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/treinamento.sql
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
  v_super     uuid := 'a0000000-0000-0000-0000-000000000001';
  v_gerente   uuid := 'a0000000-0000-0000-0000-000000000003';
  v_chave     uuid := 'a0000000-0000-0000-0000-000000000004';
  v_analista  uuid := 'a0000000-0000-0000-0000-000000000005';
  v_prestador uuid := 'a0000000-0000-0000-0000-000000000006';
  v_j jsonb;
  v_ok boolean;
  v_g1 bigint := (select id from imobproj.tr_modulos where codigo = 'g1');
  v_t1 bigint := (select id from imobproj.tr_modulos where codigo = 't1');
  v_novo bigint;
  v_b1 bigint; v_b2 bigint;
  v_trilha_atend bigint := (select id from imobproj.tr_trilhas where codigo = 'atendente');
begin
  -- 0) a carga gerada entrou: 4 trilhas, 16 módulos publicados, balões em todos, uma trilha padrão
  if (select count(*) from imobproj.tr_trilhas) <> 4 then raise exception 'cenário 0: trilhas'; end if;
  if (select count(*) from imobproj.tr_modulos where status = 'publicado') <> 16 then raise exception 'cenário 0: módulos'; end if;
  if exists (select 1 from imobproj.tr_modulos m where not exists (select 1 from imobproj.tr_passos p where p.modulo_id = m.id)) then
    raise exception 'cenário 0: módulo sem balão';
  end if;
  if (select count(*) from imobproj.tr_trilhas where padrao) <> 1 then raise exception 'cenário 0: trilha padrão'; end if;

  -- 1) a trilha vem do perfil: gerente 6, analista e prestador 4 (técnico), usuário-chave 3 (padrão)
  perform pg_temp.como(v_gerente);
  v_j := imobproj.tr_meus_treinamentos();
  if v_j #>> '{trilha,codigo}' <> 'gerente' or jsonb_array_length(v_j -> 'modulos') <> 6 then raise exception 'cenário 1: gerente %', v_j -> 'trilha'; end if;
  perform pg_temp.como(v_analista);
  v_j := imobproj.tr_meus_treinamentos();
  if v_j #>> '{trilha,codigo}' <> 'tecnico' or jsonb_array_length(v_j -> 'modulos') <> 4 then raise exception 'cenário 1: analista'; end if;
  perform pg_temp.como(v_prestador);
  if imobproj.tr_meus_treinamentos() #>> '{trilha,codigo}' <> 'tecnico' then raise exception 'cenário 1: prestador'; end if;
  perform pg_temp.como(v_chave);
  v_j := imobproj.tr_meus_treinamentos();
  if v_j #>> '{trilha,codigo}' <> 'cliente' or jsonb_array_length(v_j -> 'modulos') <> 3 then raise exception 'cenário 1: usuário-chave'; end if;
  perform pg_temp.como(v_super);
  if imobproj.tr_meus_treinamentos() #>> '{trilha,codigo}' <> 'gerente' then raise exception 'cenário 1: super admin segue a do gerente'; end if;
  perform pg_temp.como_postgres();

  -- 2) sem perfil: trilha padrão e o aviso semPerfil
  update imobproj.profiles set perfil = null where id = v_prestador;
  perform pg_temp.como(v_prestador);
  v_j := imobproj.tr_meus_treinamentos();
  perform pg_temp.como_postgres();
  if v_j #>> '{trilha,codigo}' <> 'cliente' or not (v_j ->> 'semPerfil')::boolean then raise exception 'cenário 2: sem perfil %', v_j; end if;

  -- 3) módulo de outra trilha é recusado; o módulo da trilha não leva o gabarito
  perform pg_temp.como(v_analista);
  v_ok := false;
  begin
    perform imobproj.tr_modulo(v_g1);
  exception when sqlstate 'P0001' then v_ok := true;
  end;
  if not v_ok then raise exception 'cenário 3: analista abriu módulo do gerente'; end if;
  v_j := imobproj.tr_modulo(v_t1);
  if v_j ? 'resposta' then raise exception 'cenário 3: gabarito vazou no tour'; end if;
  if jsonb_array_length(v_j -> 'baloes') <> 4 or jsonb_array_length(v_j #> '{baloes,0,alvo}') <> 4 then raise exception 'cenário 3: balões'; end if;

  -- 4) progresso: passo limitado ao total; resposta errada não conclui; certa conclui e não desfaz
  perform imobproj.tr_progresso_salvar(v_t1, 99);
  perform pg_temp.como_postgres();
  if (select passo_atual from imobproj.tr_progresso where usuario_id = v_analista and modulo_id = v_t1) <> 4 then raise exception 'cenário 4: passo não limitado'; end if;
  perform pg_temp.como(v_analista);
  perform imobproj.tr_progresso_salvar(v_t1, 2);
  v_j := imobproj.tr_responder(v_t1, 1);
  if (v_j ->> 'certo')::boolean or v_j ->> 'concluidoEm' is not null then raise exception 'cenário 4: errada concluiu'; end if;
  v_j := imobproj.tr_responder(v_t1, 0);
  if not (v_j ->> 'certo')::boolean or v_j ->> 'concluidoEm' is null then raise exception 'cenário 4: certa não concluiu'; end if;
  perform imobproj.tr_progresso_salvar(v_t1, 1);
  perform pg_temp.como_postgres();
  if (select concluido_em from imobproj.tr_progresso where usuario_id = v_analista and modulo_id = v_t1) is null then raise exception 'cenário 4: conclusão desfeita'; end if;
  perform pg_temp.como(v_analista);
  if (imobproj.tr_meus_treinamentos() #>> '{modulos,0,concluidoEm}') is null then raise exception 'cenário 4: cartão sem conclusão'; end if;

  -- 5) "ver como" e o painel: só o super admin
  v_ok := false;
  begin
    perform imobproj.tr_meus_treinamentos('atendente');
  exception when sqlstate 'P0001' then v_ok := true;
  end;
  if not v_ok then raise exception 'cenário 5: analista usou ver como'; end if;
  v_ok := false;
  begin
    perform imobproj.tr_admin_painel();
  exception when sqlstate 'P0001' then v_ok := true;
  end;
  if not v_ok then raise exception 'cenário 5: analista abriu o painel'; end if;
  perform pg_temp.como(v_super);
  if imobproj.tr_meus_treinamentos('atendente') #>> '{trilha,codigo}' <> 'atendente' then raise exception 'cenário 5: ver como atendente'; end if;
  v_j := imobproj.tr_admin_painel();
  if jsonb_array_length(v_j -> 'modulos') <> 16 or jsonb_array_length(v_j -> 'perfis') < 6 then raise exception 'cenário 5: painel'; end if;
  if (imobproj.tr_admin_modulo(v_t1) ->> 'resposta')::int <> 0 then raise exception 'cenário 5: gabarito no editor'; end if;
  if jsonb_array_length(imobproj.tr_progresso_por_perfil()) = 0 then raise exception 'cenário 5: progresso por perfil vazio'; end if;
  if jsonb_array_length(imobproj.tr_progresso_pessoas('analista')) = 0 then raise exception 'cenário 5: pessoas do perfil'; end if;

  -- 6) editor: cria módulo, balões, reordena, exclui; perfil muda de trilha
  v_novo := imobproj.tr_modulo_salvar(jsonb_build_object('titulo', 'Módulo de teste', 'papel', 'atende', 'pergunta', 'Pergunta de teste?',
    'opcoes', jsonb_build_array('Sim', 'Não'), 'resposta', 1, 'status', 'publicado', 'trilhas', jsonb_build_array(v_trilha_atend)));
  perform pg_temp.como_postgres();
  if (select codigo from imobproj.tr_modulos where id = v_novo) <> 'm' || v_novo then raise exception 'cenário 6: código'; end if;
  perform pg_temp.como(v_super);
  v_b1 := imobproj.tr_passo_salvar(jsonb_build_object('moduloId', v_novo, 'tela', 'a-monitor', 'titulo', 'Um', 'texto', 'Primeiro', 'alvo', jsonb_build_array(1, 2, 3, 4)));
  v_b2 := imobproj.tr_passo_salvar(jsonb_build_object('moduloId', v_novo, 'tela', 'a-fila', 'titulo', 'Dois', 'texto', 'Segundo', 'alvo', jsonb_build_array(5, 6, 7, 8)));
  perform imobproj.tr_passos_reordenar(v_novo, array[v_b2, v_b1]);
  perform pg_temp.como_postgres();
  if (select ordem from imobproj.tr_passos where id = v_b2) <> 1 then raise exception 'cenário 6: reordenar'; end if;
  perform pg_temp.como(v_super);
  perform imobproj.tr_passo_excluir(v_b2);
  perform pg_temp.como_postgres();
  if (select ordem from imobproj.tr_passos where id = v_b1) <> 1 then raise exception 'cenário 6: buraco na numeração'; end if;
  perform pg_temp.como(v_super);
  v_ok := false;
  begin
    perform imobproj.tr_passo_salvar(jsonb_build_object('moduloId', v_novo, 'tela', 'a-fila', 'titulo', 'Fora', 'texto', 'Fora da tela', 'alvo', jsonb_build_array(90, 6, 120, 8)));
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'cenário 6: contorno fora da tela aceito'; end if;
  perform imobproj.tr_trilha_perfis_salvar(v_trilha_atend, array['atendente', 'analista']);
  perform pg_temp.como(v_analista);
  if imobproj.tr_meus_treinamentos() #>> '{trilha,codigo}' <> 'atendente' then raise exception 'cenário 6: perfil não mudou de trilha'; end if;
  perform pg_temp.como(v_gerente);
  v_ok := false;
  begin
    perform imobproj.tr_modulo_salvar(jsonb_build_object('id', v_novo, 'titulo', 'Hack', 'papel', 'atende', 'pergunta', 'Pergunta?', 'opcoes', jsonb_build_array('a', 'b'), 'resposta', 0));
  exception when sqlstate 'P0001' then v_ok := true;
  end;
  if not v_ok then raise exception 'cenário 6: gerente editou módulo'; end if;
  perform pg_temp.como_postgres();

  -- 7) sem acesso direto às tabelas e sem execução anônima
  perform pg_temp.como(v_super);
  v_ok := false;
  begin
    perform 1 from imobproj.tr_modulos limit 1;
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'cenário 7: leitura direta da tabela'; end if;
  perform pg_temp.como_postgres();
  perform set_config('role', 'anon', true);
  v_ok := false;
  begin
    perform imobproj.tr_meus_treinamentos();
  exception when insufficient_privilege then v_ok := true;
  end;
  perform pg_temp.como_postgres();
  if not v_ok then raise exception 'cenário 7: anônimo executou'; end if;

  raise notice 'treinamento: 8 cenários OK';
end $$;

rollback;
