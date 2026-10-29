-- Teste da abertura de OS pelo app (Fase 5). Rode no banco LOCAL:
--   docker exec -i supabase_db_imobproj psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/app_abrir_os.sql
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
  v_diretor   uuid := 'a0000000-0000-0000-0000-000000000002';
  v_gerente   uuid := 'a0000000-0000-0000-0000-000000000003';
  v_chave     uuid := 'a0000000-0000-0000-0000-000000000004';
  v_analista  uuid := 'a0000000-0000-0000-0000-000000000005';
  v_prestador uuid := 'a0000000-0000-0000-0000-000000000006';
  v_proj      uuid := 'c0000000-0000-0000-0000-000000000014';
  v_id1 uuid := gen_random_uuid(); v_id2 uuid := gen_random_uuid(); v_id3 uuid := gen_random_uuid();
  v_ultimo int;
  v_os imobproj.service_orders;
  v_ok boolean;
  v_n int;
begin
  -- As regras de check-out da Fase 6 (foto/assinatura obrigatórias) têm teste próprio (configuracoes_regras.sql).
  if to_regclass('imobproj.configuracoes') is not null then
    execute 'update imobproj.configuracoes set exigir_foto_checkout = false, exigir_assinatura_checkout = false';
  end if;
  select coalesce(max(numero), 0) into v_ultimo from imobproj.service_orders where project_id = v_proj;

  -- 1) analista abre para si: número sequencial, origem app, agendada, histórico "OS criada"
  perform pg_temp.como(v_analista);
  v_os := imobproj.fn_app_abrir_os(v_id1, v_proj, 'corretiva', 'Teste app 1', null, now() + interval '1 hour', now() + interval '2 hours', null);
  perform pg_temp.como_postgres();
  if v_os.numero <> v_ultimo + 1 or v_os.origem <> 'app' or v_os.status <> 'agendada'
     or v_os.executor_id <> v_analista or v_os.criado_por <> v_analista or v_os.tipo <> 'corretiva' then
    raise exception 'cenário 1: OS aberta com dados errados: %', row_to_json(v_os);
  end if;
  select count(*) into v_n from imobproj.os_status_history where os_id = v_id1 and para = 'agendada';
  if v_n <> 1 then raise exception 'cenário 1: histórico ausente'; end if;

  -- 2) reenvio da fila offline (mesmo id) não duplica nem gasta número
  perform pg_temp.como(v_analista);
  v_os := imobproj.fn_app_abrir_os(v_id1, v_proj, 'corretiva', 'Teste app 1', null, now() + interval '1 hour', null, null);
  perform pg_temp.como_postgres();
  select count(*) into v_n from imobproj.service_orders where id = v_id1;
  if v_n <> 1 or v_os.numero <> v_ultimo + 1 then raise exception 'cenário 2: reenvio duplicou'; end if;

  -- 3) gerente abre para o prestador; sem data nasce rascunho; número segue a sequência
  perform pg_temp.como(v_gerente);
  v_os := imobproj.fn_app_abrir_os(v_id2, v_proj, 'visita', 'Teste app 2', 'desc', null, null, v_prestador);
  perform pg_temp.como_postgres();
  if v_os.numero <> v_ultimo + 2 or v_os.status <> 'rascunho' or v_os.executor_id <> v_prestador then
    raise exception 'cenário 3: %', row_to_json(v_os);
  end if;

  -- 4) prestador não pode abrir para outra pessoa
  v_ok := false;
  begin
    perform pg_temp.como(v_prestador);
    perform imobproj.fn_app_abrir_os(v_id3, v_proj, 'visita', 'Teste app 3', null, now(), null, v_analista);
  exception when sqlstate '42501' then v_ok := true;
  end;
  perform pg_temp.como_postgres();
  if not v_ok then raise exception 'cenário 4: prestador abriu OS para outra pessoa'; end if;

  -- 5) usuário-chave não abre OS
  v_ok := false;
  begin
    perform pg_temp.como(v_chave);
    perform imobproj.fn_app_abrir_os(v_id3, v_proj, 'visita', 'Teste app 3', null, now(), null, null);
  exception when sqlstate '42501' then v_ok := true;
  end;
  perform pg_temp.como_postgres();
  if not v_ok then raise exception 'cenário 5: usuário-chave abriu OS'; end if;

  -- 6) outra pessoa não reaproveita o id de uma OS existente
  v_ok := false;
  begin
    perform pg_temp.como(v_diretor);
    perform imobproj.fn_app_abrir_os(v_id1, v_proj, 'visita', 'Sequestro', null, now(), null, null);
  exception when sqlstate '23505' then v_ok := true;
  end;
  perform pg_temp.como_postgres();
  if not v_ok then raise exception 'cenário 6: id reaproveitado por outra pessoa'; end if;

  -- 7) a RLS de insert direto continua só para gerente (o analista passa pela função)
  v_ok := false;
  begin
    perform pg_temp.como(v_analista);
    insert into imobproj.service_orders (project_id, titulo, status) values (v_proj, 'Direto', 'rascunho');
  exception when insufficient_privilege then v_ok := true;
  end;
  perform pg_temp.como_postgres();
  if not v_ok then raise exception 'cenário 7: analista inseriu OS direto'; end if;

  -- 8) check-out com materiais (sobrecarga de 7 parâmetros)
  perform pg_temp.como(v_analista);
  perform imobproj.fn_app_checkin(v_id1, now(), null, null);
  v_os := imobproj.fn_app_checkout(v_id1, now(), null, null, 'Driver reinstalado', false, '1 cabo USB');
  perform pg_temp.como_postgres();
  if v_os.status <> 'aguardando_aceite' or v_os.materiais <> '1 cabo USB' then
    raise exception 'cenário 8: %', row_to_json(v_os);
  end if;

  -- 9) aparelho: registra, atualiza e o painel só abre para quem tem o menu
  perform pg_temp.como(v_analista);
  perform imobproj.fn_app_registrar_aparelho('e5000000-0000-0000-0000-0000000000ff', 'Pixel 9', 'Android 16', '1.0.4', 2);
  perform imobproj.fn_app_registrar_aparelho('e5000000-0000-0000-0000-0000000000ff', null, null, null, 0);
  v_ok := false;
  begin
    perform * from imobproj.app_painel();
  exception when sqlstate '42501' then v_ok := true;
  end;
  perform pg_temp.como_postgres();
  if not v_ok then raise exception 'cenário 9: analista abriu o painel'; end if;
  select count(*) into v_n from imobproj.app_aparelhos
   where id = 'e5000000-0000-0000-0000-0000000000ff' and pendencias = 0 and modelo = 'Pixel 9';
  if v_n <> 1 then raise exception 'cenário 9: aparelho não atualizado'; end if;

  perform pg_temp.como(v_gerente);
  select count(*) into v_n from imobproj.app_aparelhos_lista();
  perform pg_temp.como_postgres();
  if v_n < 5 then raise exception 'cenário 9: gerente não vê os aparelhos (%).', v_n; end if;

  raise notice 'app_abrir_os: 9 cenários OK';
end $$;

rollback;
