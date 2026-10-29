-- Teste da regra de roteamento da Fase 3 (rode no banco LOCAL):
--   docker exec -i supabase_db_imobproj psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/setores_roteamento.sql
-- Tudo dentro de uma transação desfeita no fim: não deixa dados.
begin;
do $$
declare
  v_proj uuid := 'c0000000-0000-0000-0000-000000000014';
  v_sessao_com uuid := '30000000-0000-0000-0000-000000000001';  -- ligada ao setor Suporte técnico
  v_sessao_sem uuid := '30000000-0000-0000-0000-000000000002';  -- sem setor
  v_suporte uuid := 'b3000000-0000-0000-0000-000000000001';
  v_impl uuid := 'b3000000-0000-0000-0000-000000000002';
  g1 uuid; g2 uuid; g3 uuid; v uuid;
begin
  -- 1) conversa nova num número com setor → fila desse setor (trigger)
  insert into imobproj.wa_groups (project_id, session_id, equipe, nome, wa_group_id)
  values (v_proj, v_sessao_com, 'Teste', 'Teste 1', 'teste-roteamento-1@g.us') returning id, setor_id into g1, v;
  assert v = v_suporte, format('1) esperado setor Suporte, veio %s', v);

  -- 2) número sem setor → continua sem setor (comportamento antigo)
  insert into imobproj.wa_groups (project_id, session_id, equipe, nome, wa_group_id)
  values (v_proj, v_sessao_sem, 'Teste', 'Teste 2', 'teste-roteamento-2@g.us') returning id, setor_id into g2, v;
  assert v is null, format('2) esperado sem setor, veio %s', v);

  -- 3) o número ganha setor depois: a próxima mensagem (webhook) roteia a conversa
  insert into imobproj.setor_numeros (session_id, setor_id) values (v_sessao_sem, v_impl);
  v := imobproj.fn_rotear_conversa(g2);
  assert v = v_impl, format('3) esperado Implantação, veio %s', v);
  assert (select setor_id from imobproj.wa_groups where id = g2) = v_impl, '3) setor não gravado';

  -- 4) conversa que já tem setor não muda de fila
  update imobproj.setor_numeros set setor_id = v_suporte where session_id = v_sessao_sem;
  v := imobproj.fn_rotear_conversa(g2);
  assert v = v_impl, format('4) conversa mudou de fila para %s', v);

  -- 5) setor inativo não recebe conversa nova
  update imobproj.setores set ativo = false where id = v_suporte;
  insert into imobproj.wa_groups (project_id, session_id, equipe, nome, wa_group_id)
  values (v_proj, v_sessao_com, 'Teste', 'Teste 3', 'teste-roteamento-3@g.us') returning id, setor_id into g3, v;
  assert v is null, format('5) setor inativo recebeu conversa: %s', v);
  update imobproj.setores set ativo = true where id = v_suporte;

  -- 6) horário: quarta 10h aberto, quarta 20h fechado, domingo fechado, feriado fechado
  assert imobproj.fn_setor_aberto(v_suporte, '2026-10-28 10:00 America/Sao_Paulo'), '6a) quarta 10h deveria estar aberto';
  assert not imobproj.fn_setor_aberto(v_suporte, '2026-10-28 20:00 America/Sao_Paulo'), '6b) quarta 20h deveria estar fechado';
  assert not imobproj.fn_setor_aberto(v_suporte, '2026-11-01 10:00 America/Sao_Paulo'), '6c) domingo deveria estar fechado';
  assert not imobproj.fn_setor_aberto(v_suporte, '2026-11-02 10:00 America/Sao_Paulo'), '6d) feriado deveria estar fechado';

  -- 7) setor novo nasce com 7 horários, regras e 3 mensagens
  insert into imobproj.setores (nome) values ('Setor de teste') returning id into v;
  assert (select count(*) from imobproj.setor_horarios where setor_id = v) = 7, '7) horários padrão';
  assert exists (select 1 from imobproj.setor_regras where setor_id = v), '7) regras padrão';
  assert (select count(*) from imobproj.setor_mensagens where setor_id = v) = 3, '7) mensagens padrão';

  raise notice 'setores_roteamento: 7 cenários OK';
end $$;
rollback;
