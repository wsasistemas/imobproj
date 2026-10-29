-- Teste das chaves de Notificações e do resumo semanal (pendência da Fase 6). Rode no banco LOCAL:
--   docker exec -i supabase_db_imobproj psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/notificacoes.sql
-- Tudo dentro de uma transação desfeita no fim: não deixa dados.
begin;

do $$
declare
  v_proj      uuid := 'c0000000-0000-0000-0000-000000000014';
  v_chave     uuid := 'a0000000-0000-0000-0000-000000000004';   -- usuário-chave do PRJ-014
  v_analista  uuid := 'a0000000-0000-0000-0000-000000000005';
  v_ata       uuid;
  v_os        uuid;
  v_n         int;
  v_msg       text;
  -- quarta, 28/10/2026: a semana resumida é 19/10 a 25/10
  v_ref       timestamptz := '2026-10-28 08:00 America/Sao_Paulo';
begin
  delete from imobproj.push_outbox;

  -- 1) OS atribuída com a chave desligada: nada na fila; ligada: um push
  update imobproj.configuracoes set notificar_os_atribuida = false;
  insert into imobproj.service_orders (project_id, executor_id, titulo, status)
  values (v_proj, v_analista, 'Teste push desligado', 'agendada') returning id into v_os;
  assert (select count(*) from imobproj.push_outbox) = 0, '1a) push saiu com a chave desligada';
  update imobproj.configuracoes set notificar_os_atribuida = true;
  insert into imobproj.service_orders (project_id, executor_id, titulo, status)
  values (v_proj, v_analista, 'Teste push ligado', 'agendada');
  assert (select count(*) from imobproj.push_outbox where dados->>'tipo' = 'atribuida') = 1, '1b) push de OS atribuída não saiu';

  -- 2) OS decidida com a chave desligada: nada; ligada: push de aprovada
  delete from imobproj.push_outbox;
  update imobproj.configuracoes set notificar_os_decidida = false;
  update imobproj.service_orders set status = 'recusada' where id = v_os;
  assert (select count(*) from imobproj.push_outbox) = 0, '2a) push de recusa saiu com a chave desligada';
  update imobproj.configuracoes set notificar_os_decidida = true;
  update imobproj.service_orders set status = 'aprovada' where id = v_os;
  assert (select count(*) from imobproj.push_outbox where dados->>'tipo' = 'aprovada') = 1, '2b) push de aprovação não saiu';

  -- 3) Ata publicada: push a cada participante sem ciência; chave desligada não manda
  delete from imobproj.push_outbox;
  insert into imobproj.meetings (project_id, titulo, data, status)
  values (v_proj, 'Ata de teste', current_date, 'rascunho') returning id into v_ata;
  insert into imobproj.meeting_participants (meeting_id, user_id) values (v_ata, v_chave), (v_ata, v_analista);
  update imobproj.meeting_participants set ciente_em = now() where meeting_id = v_ata and user_id = v_analista;
  update imobproj.configuracoes set notificar_ata_publicada = false;
  update imobproj.meetings set status = 'publicada' where id = v_ata;
  assert (select count(*) from imobproj.push_outbox) = 0, '3a) push de ata saiu com a chave desligada';
  update imobproj.meetings set status = 'rascunho' where id = v_ata;
  update imobproj.configuracoes set notificar_ata_publicada = true;
  update imobproj.meetings set status = 'publicada' where id = v_ata;
  select count(*) into v_n from imobproj.push_outbox where dados->>'tipo' = 'ata_publicada';
  assert v_n = 1, format('3b) esperado 1 push de ata (só quem não deu ciência), veio %s', v_n);
  assert (select user_id from imobproj.push_outbox where dados->>'tipo' = 'ata_publicada') = v_chave, '3c) push foi para a pessoa errada';

  -- 4) Resumo semanal desligado: nada sai
  delete from imobproj.push_outbox;
  update imobproj.configuracoes set resumo_semanal_usuario_chave = false;
  assert imobproj.fn_resumo_semanal(v_ref) = 0, '4) resumo saiu com a chave desligada';

  -- 5) Resumo ligado: OS executada e aprovada na semana → mensagem no grupo do cliente + push ao usuário-chave
  update imobproj.configuracoes set resumo_semanal_usuario_chave = true;
  insert into imobproj.service_orders (project_id, executor_id, titulo, status, horas, checkin_at, checkout_at, aceite_em)
  values (v_proj, v_analista, 'Executada na semana', 'aprovada', 2.5,
          '2026-10-20 09:00 America/Sao_Paulo', '2026-10-20 11:30 America/Sao_Paulo', '2026-10-21 10:00 America/Sao_Paulo');
  delete from imobproj.wa_messages where body like '📊 *Resumo semanal*%';
  delete from imobproj.resumo_semanal_envios;
  v_n := imobproj.fn_resumo_semanal(v_ref);
  assert v_n = 1, format('5a) esperado 1 projeto resumido, veio %s', v_n);
  select body into v_msg from imobproj.wa_messages where body like '📊 *Resumo semanal*%' order by created_at desc limit 1;
  assert v_msg is not null, '5b) mensagem não entrou na fila do WhatsApp';
  assert v_msg like '%Semana de 19/10 a 25/10%', format('5c) semana errada: %s', v_msg);
  assert v_msg like '%✅ Aprovadas: % OS · % h%' and v_msg like '%⏳ Aguardando seu aceite:%', format('5d) linhas do resumo ausentes: %s', v_msg);
  assert (select count(*) from imobproj.push_outbox where dados->>'tipo' = 'resumo_semanal' and user_id = v_chave) = 1,
    '5e) push do resumo não foi ao usuário-chave';
  assert (select semana_inicio from imobproj.resumo_semanal_envios where project_id = v_proj) = '2026-10-19', '5f) envio não registrado';

  -- 6) Rodar de novo na mesma semana não duplica
  assert imobproj.fn_resumo_semanal(v_ref) = 0, '6) resumo duplicado na mesma semana';

  -- 7) Cron agendado
  assert exists (select 1 from cron.job where jobname = 'imobproj-resumo-semanal' and schedule = '0 11 * * 1'), '7) cron ausente';

  raise notice 'notificacoes: 7 cenários OK. Mensagem: %', v_msg;
end
$$;

rollback;
