-- Teste das configurações gerais e regras de OS (Fase 6). Rode no banco LOCAL:
--   docker exec -i supabase_db_imobproj psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/configuracoes_regras.sql
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
  v_analista  uuid := 'a0000000-0000-0000-0000-000000000005';
  v_proj      uuid := 'c0000000-0000-0000-0000-000000000014';
  v_id1 uuid := gen_random_uuid(); v_id2 uuid := gen_random_uuid(); v_id3 uuid := gen_random_uuid();
  v_id4 uuid := gen_random_uuid(); v_id5 uuid := gen_random_uuid(); v_proj2 uuid := gen_random_uuid();
  v_os imobproj.service_orders;
  v_ok boolean;
  v_n int;
  v_txt text;
  v_valor numeric;
begin
  -- 1) foto obrigatória: check-out sem foto é recusado; com foto passa
  update imobproj.configuracoes set exigir_foto_checkout = true, exigir_assinatura_checkout = false;
  perform pg_temp.como(v_analista);
  perform imobproj.fn_app_abrir_os(v_id1, v_proj, 'corretiva', 'Teste foto', null, now(), null, null);
  perform imobproj.fn_app_checkin(v_id1, now(), null, null);
  v_ok := false;
  begin
    perform imobproj.fn_app_checkout(v_id1, now(), null, null, 'feito', false, null);
  exception when sqlstate '23514' then v_ok := true;
  end;
  perform pg_temp.como_postgres();
  if not v_ok then raise exception 'cenário 1: check-out sem foto passou'; end if;
  insert into imobproj.os_evidences (os_id, tipo, storage_path) values (v_id1, 'foto', v_proj || '/' || v_id1 || '/f.jpg');
  perform pg_temp.como(v_analista);
  v_os := imobproj.fn_app_checkout(v_id1, now(), null, null, 'feito', false, null);
  perform pg_temp.como_postgres();
  if v_os.status <> 'aguardando_aceite' then raise exception 'cenário 1: check-out com foto não passou'; end if;

  -- 2) assinatura obrigatória vale também para o caminho do portal (update direto de status)
  update imobproj.configuracoes set exigir_foto_checkout = false, exigir_assinatura_checkout = true;
  perform pg_temp.como(v_analista);
  perform imobproj.fn_app_abrir_os(v_id2, v_proj, 'visita', 'Teste assinatura', null, now(), null, null);
  update imobproj.service_orders set status = 'em_execucao', checkin_at = now() where id = v_id2;
  v_ok := false;
  begin
    update imobproj.service_orders set status = 'aguardando_aceite', checkout_at = now(), horas = 1 where id = v_id2;
  exception when sqlstate '23514' then v_ok := true;
  end;
  perform pg_temp.como_postgres();
  if not v_ok then raise exception 'cenário 2: envio sem assinatura passou'; end if;
  insert into imobproj.os_evidences (os_id, tipo, storage_path) values (v_id2, 'assinatura', v_proj || '/' || v_id2 || '/a.png');
  perform pg_temp.como(v_analista);
  update imobproj.service_orders set status = 'aguardando_aceite', checkout_at = now(), horas = 1 where id = v_id2;
  perform pg_temp.como_postgres();
  select status::text into v_txt from imobproj.service_orders where id = v_id2;
  if v_txt <> 'aguardando_aceite' then raise exception 'cenário 2: envio com assinatura não passou'; end if;
  update imobproj.configuracoes set exigir_assinatura_checkout = false;

  -- 3) aceite automático: desligado não aprova; ligado aprova só o que passou do prazo, com histórico
  update imobproj.service_orders set checkin_at = now() - interval '31 hours', checkout_at = now() - interval '30 hours' where id = v_id1;
  update imobproj.configuracoes set aceite_automatico_horas = 0;
  if imobproj.fn_aceite_automatico() <> 0 then raise exception 'cenário 3: desligado aprovou'; end if;
  update imobproj.configuracoes set aceite_automatico_horas = 24;
  perform imobproj.fn_aceite_automatico();
  select * into v_os from imobproj.service_orders where id = v_id1;
  if v_os.status <> 'aprovada' or v_os.aceite_por is not null or v_os.aceite_em is null
     or v_os.aceite_comentario not like 'Aprovada automaticamente%' then
    raise exception 'cenário 3: OS vencida não aprovada: %', row_to_json(v_os);
  end if;
  select status::text into v_txt from imobproj.service_orders where id = v_id2;
  if v_txt <> 'aguardando_aceite' then raise exception 'cenário 3: OS dentro do prazo foi aprovada'; end if;
  select count(*) into v_n from imobproj.os_status_history
   where os_id = v_id1 and para = 'aprovada' and comentario like 'Aprovada automaticamente%';
  if v_n <> 1 then raise exception 'cenário 3: histórico do aceite automático ausente'; end if;

  -- 4) aviso ao cliente: OS agendada entra na fila do grupo do cliente; rascunho espera ser agendada
  update imobproj.configuracoes set avisar_cliente_abertura_os = true;
  perform pg_temp.como(v_gerente);
  v_os := imobproj.fn_app_abrir_os(v_id3, v_proj, 'preventiva', 'Revisão do nobreak', null, now() + interval '1 day', null, v_analista);
  perform pg_temp.como_postgres();
  select * into v_os from imobproj.service_orders where id = v_id3;
  if v_os.aviso_cliente_pendente or v_os.aviso_cliente_em is null then raise exception 'cenário 4: flag não consumida'; end if;
  select count(*) into v_n from imobproj.wa_messages
   where group_id = '20000000-0000-0000-0000-000000000004' and direction = 'out' and status = 'pendente'
     and body like '%OS ' || v_os.numero || ' aberta%' and author_user_id is null;
  if v_n <> 1 then raise exception 'cenário 4: mensagem não entrou na fila do grupo do cliente'; end if;

  perform pg_temp.como(v_gerente);
  perform imobproj.fn_app_abrir_os(v_id4, v_proj, 'visita', 'Sem data ainda', null, null, null, v_analista);
  perform pg_temp.como_postgres();
  select aviso_cliente_pendente into v_ok from imobproj.service_orders where id = v_id4;
  if not v_ok then raise exception 'cenário 4: rascunho perdeu a flag'; end if;
  update imobproj.service_orders set status = 'agendada', agendada_inicio = now() + interval '2 days' where id = v_id4;
  select count(*) into v_n from imobproj.service_orders where id = v_id4 and aviso_cliente_em is not null and not aviso_cliente_pendente;
  if v_n <> 1 then raise exception 'cenário 4: aviso não saiu ao agendar o rascunho'; end if;
  update imobproj.configuracoes set avisar_cliente_abertura_os = false;

  -- 5) RLS: analista não lê; gerente lê e não grava; super admin grava
  perform pg_temp.como(v_analista);
  select count(*) into v_n from imobproj.configuracoes;
  perform pg_temp.como_postgres();
  if v_n <> 0 then raise exception 'cenário 5: analista leu as configurações'; end if;
  perform pg_temp.como(v_gerente);
  select count(*) into v_n from imobproj.configuracoes;
  if v_n <> 1 then raise exception 'cenário 5: gerente não lê as configurações'; end if;
  update imobproj.configuracoes set empresa_nome = 'Hackeada';
  get diagnostics v_n = row_count;
  perform pg_temp.como_postgres();
  if v_n <> 0 then raise exception 'cenário 5: gerente gravou'; end if;
  perform pg_temp.como(v_super);
  update imobproj.configuracoes set empresa_nome = 'WSA Sistemas Teste';
  perform pg_temp.como_postgres();
  select count(*) into v_n from imobproj.configuracoes where empresa_nome = 'WSA Sistemas Teste' and atualizado_por = v_super;
  if v_n <> 1 then raise exception 'cenário 5: super admin não gravou (ou autor ausente)'; end if;

  -- 6) número inicial da OS em projeto novo (projetos antigos seguem a sequência)
  update imobproj.configuracoes set os_numero_inicial = 500;
  insert into imobproj.projects (id, codigo, nome) values (v_proj2, 'TST-600', 'Projeto teste numeração');
  insert into imobproj.service_orders (id, project_id, titulo, status) values (v_id5, v_proj2, 'Primeira', 'rascunho');
  select numero into v_n from imobproj.service_orders where id = v_id5;
  if v_n <> 500 then raise exception 'cenário 6: primeira OS do projeto novo = % (esperado 500)', v_n; end if;

  -- 7) fn_config_publica: regra de check-out para todos; valor da hora só para quem vê a medição
  update imobproj.configuracoes set valor_hora_tecnica = 145, exigir_foto_checkout = true;
  perform pg_temp.como(v_analista);
  select valor_hora_tecnica, exigir_foto_checkout::text into v_valor, v_txt from imobproj.fn_config_publica();
  perform pg_temp.como_postgres();
  if v_valor is not null or v_txt <> 'true' then raise exception 'cenário 7: analista viu o valor ou não viu a regra'; end if;
  perform pg_temp.como(v_gerente);
  select valor_hora_tecnica into v_valor from imobproj.fn_config_publica();
  perform pg_temp.como_postgres();
  if v_valor is distinct from 145 then raise exception 'cenário 7: gerente não viu o valor da hora'; end if;

  raise notice 'configuracoes_regras: 7 cenários OK';
end $$;

rollback;
