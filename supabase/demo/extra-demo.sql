-- -----------------------------------------------------------------------------
-- Acréscimos só da demonstração (entram no fim do seed-demo.sql gerado).
-- Atendente fictícia, um terceiro cliente e mais dois projetos, para a lista de projetos,
-- o Monitor e os cadastros terem cara de sistema em uso.
-- -----------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
)
select
  '00000000-0000-0000-0000-000000000000'::uuid, u.id, 'authenticated', 'authenticated', u.email,
  extensions.crypt('__DEMO_SENHA__', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('nome', u.nome, 'telefone_whatsapp', u.fone, 'sistema', 'imobproj'),
  now(), now(),
  '', '', '', '', '', '', '', ''
from (values
  ('a0000000-0000-0000-0000-000000000007'::uuid, 'atendente@demo.imobproj.com.br', 'Juliana Prado', '5519995550021')
) as u (id, email, nome, fone)
on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select u.id, u.id, u.id::text, 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false),
       now(), now(), now()
  from auth.users u
 where u.id = 'a0000000-0000-0000-0000-000000000007'
on conflict do nothing;

update imobproj.profiles
   set organization_id = 'b0000000-0000-0000-0000-000000000001',
       cargo = 'Analista de atendimento',
       atende_whatsapp = true,
       perfil = 'atendente'
 where id = 'a0000000-0000-0000-0000-000000000007';

insert into imobproj.team_members (team_id, user_id) values
  ('b2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000007')
on conflict do nothing;

-- No projeto principal, para ver as conversas dos grupos que atende.
insert into imobproj.project_members (project_id, user_id, role) values
  ('c0000000-0000-0000-0000-000000000014', 'a0000000-0000-0000-0000-000000000007', 'analista')
on conflict (project_id, user_id) do nothing;

insert into imobproj.atendente_status (user_id, online, pausa, atualizado_em) values
  ('a0000000-0000-0000-0000-000000000007', true, false, now())
on conflict (user_id) do nothing;

-- Terceiro cliente
insert into imobproj.organizations (id, nome, tipo, cnpj, nome_fantasia, segmento, endereco, ativo) values
  ('b0000000-0000-0000-0000-000000000006', 'Gama Engenharia Ltda.', 'cliente', '66.666.666/0001-66', 'Gama Engenharia', 'Engenharia', 'R. Barão de Jaguara, 900, Campinas/SP', true)
on conflict (id) do nothing;

insert into imobproj.organization_contacts (id, organization_id, nome, cargo, email, telefone_whatsapp, principal) values
  ('b1000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000006', 'Ricardo Nunes Filho', 'Coordenador de obras', 'ricardo@gama.demo.com.br', '5519932417788', true)
on conflict (id) do nothing;

-- Dois projetos a mais: um em planejamento e um em homologação
insert into imobproj.projects (id, codigo, nome, cliente_org_id, executora_org_id, inicio, fim, status, horas_orcadas) values
  ('c0000000-0000-0000-0000-000000000021', 'BET-LOG', 'Rastreamento de frota Beta',
   'b0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000001', '2026-11-09', '2027-03-26', 'planejamento', 320),
  ('c0000000-0000-0000-0000-000000000022', 'GAM-INF', 'Rede e Wi-Fi da obra Jardim Sul',
   'b0000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000001', '2026-07-06', '2026-11-13', 'homologacao', 210)
on conflict (id) do nothing;

insert into imobproj.project_members (project_id, user_id, role) values
  ('c0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000003', 'gerente'),
  ('c0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000005', 'analista'),
  ('c0000000-0000-0000-0000-000000000022', 'a0000000-0000-0000-0000-000000000003', 'gerente'),
  ('c0000000-0000-0000-0000-000000000022', 'a0000000-0000-0000-0000-000000000005', 'analista'),
  ('c0000000-0000-0000-0000-000000000022', 'a0000000-0000-0000-0000-000000000006', 'prestador')
on conflict (project_id, user_id) do nothing;

insert into imobproj.wbs_items (id, project_id, parent_id, codigo, titulo, responsavel_id, horas_orcadas, inicio, fim, ordem, is_milestone, is_fase) values
  ('d2100000-0000-0000-0000-000000000100', 'c0000000-0000-0000-0000-000000000021', null, '1', 'Planejamento',
   'a0000000-0000-0000-0000-000000000003', 0, '2026-11-09', '2026-11-27', 100, false, true),
  ('d2100000-0000-0000-0000-000000000200', 'c0000000-0000-0000-0000-000000000021', null, '2', 'Implantação dos rastreadores',
   'a0000000-0000-0000-0000-000000000003', 0, '2026-11-30', '2027-03-26', 200, false, true),
  ('d2200000-0000-0000-0000-000000000100', 'c0000000-0000-0000-0000-000000000022', null, '1', 'Projeto de rede',
   'a0000000-0000-0000-0000-000000000003', 0, '2026-07-06', '2026-08-14', 100, false, true),
  ('d2200000-0000-0000-0000-000000000200', 'c0000000-0000-0000-0000-000000000022', null, '2', 'Instalação e testes',
   'a0000000-0000-0000-0000-000000000003', 0, '2026-08-17', '2026-11-13', 200, false, true)
on conflict (id) do nothing;

insert into imobproj.wbs_items (id, project_id, parent_id, codigo, titulo, responsavel_id, horas_orcadas, inicio, fim, ordem, is_milestone, is_fase) values
  ('d2100000-0000-0000-0000-000000000101', 'c0000000-0000-0000-0000-000000000021', 'd2100000-0000-0000-0000-000000000100', '1.1', 'Levantamento da frota e das rotas',
   'a0000000-0000-0000-0000-000000000005', 40, '2026-11-09', '2026-11-20', 101, false, false),
  ('d2100000-0000-0000-0000-000000000102', 'c0000000-0000-0000-0000-000000000021', 'd2100000-0000-0000-0000-000000000100', '1.2', 'Aprovação do plano',
   'a0000000-0000-0000-0000-000000000003', 0, '2026-11-27', '2026-11-27', 102, true, false),
  ('d2100000-0000-0000-0000-000000000201', 'c0000000-0000-0000-0000-000000000021', 'd2100000-0000-0000-0000-000000000200', '2.1', 'Instalação nos 40 caminhões',
   'a0000000-0000-0000-0000-000000000005', 240, '2026-11-30', '2027-03-12', 201, false, false),
  ('d2100000-0000-0000-0000-000000000202', 'c0000000-0000-0000-0000-000000000021', 'd2100000-0000-0000-0000-000000000200', '2.2', 'Treinamento da central de logística',
   'a0000000-0000-0000-0000-000000000003', 40, '2027-03-15', '2027-03-26', 202, false, false),
  ('d2200000-0000-0000-0000-000000000101', 'c0000000-0000-0000-0000-000000000022', 'd2200000-0000-0000-0000-000000000100', '1.1', 'Vistoria do canteiro e projeto lógico',
   'a0000000-0000-0000-0000-000000000005', 40, '2026-07-06', '2026-07-24', 101, false, false),
  ('d2200000-0000-0000-0000-000000000102', 'c0000000-0000-0000-0000-000000000022', 'd2200000-0000-0000-0000-000000000100', '1.2', 'Compra de switches e antenas',
   'a0000000-0000-0000-0000-000000000003', 10, '2026-07-27', '2026-08-14', 102, false, false),
  ('d2200000-0000-0000-0000-000000000201', 'c0000000-0000-0000-0000-000000000022', 'd2200000-0000-0000-0000-000000000200', '2.1', 'Cabeamento dos contêineres',
   'a0000000-0000-0000-0000-000000000006', 100, '2026-08-17', '2026-10-09', 201, false, false),
  ('d2200000-0000-0000-0000-000000000202', 'c0000000-0000-0000-0000-000000000022', 'd2200000-0000-0000-0000-000000000200', '2.2', 'Testes de cobertura e homologação',
   'a0000000-0000-0000-0000-000000000005', 60, '2026-10-12', '2026-11-13', 202, false, false)
on conflict (id) do nothing;

insert into imobproj.service_orders (id, project_id, wbs_item_id, executor_id, titulo, descricao, agendada_inicio, agendada_fim, status, origem, tipo, criado_por)
select v.id, v.projeto, v.wbs, v.executor, v.titulo, v.descricao,
       date_trunc('day', now()) + v.inicio, date_trunc('day', now()) + v.fim,
       v.status::imobproj.os_status, v.origem::imobproj.os_origem, v.tipo, 'a0000000-0000-0000-0000-000000000003'
  from (values
    ('e7000000-0000-0000-0000-000000000001'::uuid, 'c0000000-0000-0000-0000-000000000022'::uuid, 'd2200000-0000-0000-0000-000000000202'::uuid,
     'a0000000-0000-0000-0000-000000000005'::uuid, 'Medição de cobertura Wi-Fi no bloco B', 'Mapa de calor com o aplicativo de site survey.',
     interval '1 day 9 hours', interval '1 day 12 hours', 'agendada', 'portal', 'implantacao'),
    ('e7000000-0000-0000-0000-000000000002'::uuid, 'c0000000-0000-0000-0000-000000000022'::uuid, 'd2200000-0000-0000-0000-000000000201'::uuid,
     'a0000000-0000-0000-0000-000000000006'::uuid, 'Trocar patch cord do contêiner 3', 'Cliente relatou queda de rede no almoxarifado.',
     interval '13 hours 30 minutes', interval '14 hours 30 minutes', 'agendada', 'app', 'corretiva'),
    ('e7000000-0000-0000-0000-000000000003'::uuid, 'c0000000-0000-0000-0000-000000000021'::uuid, 'd2100000-0000-0000-0000-000000000101'::uuid,
     'a0000000-0000-0000-0000-000000000005'::uuid, 'Visita à garagem de Sumaré', 'Contar veículos, tomadas e pontos de fixação.',
     interval '12 days 8 hours', interval '12 days 17 hours', 'rascunho', 'portal', 'visita')
  ) as v(id, projeto, wbs, executor, titulo, descricao, inicio, fim, status, origem, tipo)
 where not exists (select 1 from imobproj.service_orders so where so.id = v.id);
