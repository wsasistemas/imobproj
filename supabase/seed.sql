-- =============================================================================
-- IMOBPROJ · seed de desenvolvimento (supabase start / supabase db reset)
-- Projeto exemplo: PRJ-014 · Portal de Tickets Calper
--
-- Usuários de teste (senha de todos: Imobproj@2026) — SOMENTE ambiente local:
--   superadmin@exemplo.com.br     super_admin (profiles.is_super_admin)
--   diretor@exemplo.com.br        diretor
--   gerente@exemplo.com.br        gerente
--   usuario.chave@exemplo.com.br  usuario_chave
--   analista@exemplo.com.br       analista
--   prestador@exemplo.com.br      prestador
--
-- UUIDs fixos e legíveis por prefixo:
--   a… pessoas | b… organizações | c… projeto | d… EAP | 9… dependências
--   e… OS | 8… evidências | f… atas | 7… encaminhamentos | 1… documentos
--   5… eventos | 3… sessão WA | 2… grupos WA | 4… mensagens WA | 6… baseline
-- Nenhum segredo real: api_key_secret_id fica nulo (configurar no Vault).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Auth: usuários + identidades (o trigger imobproj_on_auth_user_created cria os profiles)
-- -----------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
)
select
  '00000000-0000-0000-0000-000000000000'::uuid, u.id, 'authenticated', 'authenticated', u.email,
  extensions.crypt('Imobproj@2026', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('nome', u.nome, 'telefone_whatsapp', u.fone, 'sistema', 'imobproj'),
  now(), now(),
  '', '', '', '', '', '', '', ''
from (values
  ('a0000000-0000-0000-0000-000000000001'::uuid, 'superadmin@exemplo.com.br',    'Marina Castro',   '5511900000001'),
  ('a0000000-0000-0000-0000-000000000002'::uuid, 'diretor@exemplo.com.br',       'Ricardo Almeida', '5511900000002'),
  ('a0000000-0000-0000-0000-000000000003'::uuid, 'gerente@exemplo.com.br',       'Fernanda Rocha',  '5511900000003'),
  ('a0000000-0000-0000-0000-000000000004'::uuid, 'usuario.chave@exemplo.com.br', 'Paulo Mendes',    '5511900000004'),
  ('a0000000-0000-0000-0000-000000000005'::uuid, 'analista@exemplo.com.br',      'Lucas Oliveira',  '5511900000005'),
  ('a0000000-0000-0000-0000-000000000006'::uuid, 'prestador@exemplo.com.br',     'Jorge Ferreira',  '5511900000006')
) as u (id, email, nome, fone)
on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select
  u.id, u.id, u.id::text, 'email',
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false),
  now(), now(), now()
from auth.users u
where u.id in (
  'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004',
  'a0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000006'
)
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Organizações e perfis
-- -----------------------------------------------------------------------------
insert into imobproj.organizations (id, nome, tipo, cnpj) values
  ('b0000000-0000-0000-0000-000000000001', 'WSA Sistemas',               'executora', '11.111.111/0001-11'),
  ('b0000000-0000-0000-0000-000000000002', 'Calper',                     'cliente',   '22.222.222/0001-22'),
  ('b0000000-0000-0000-0000-000000000003', 'TecnoCampo Serviços de TI',  'prestador', '33.333.333/0001-33')
on conflict (id) do nothing;

update imobproj.profiles p
   set is_super_admin  = (p.id = 'a0000000-0000-0000-0000-000000000001'),
       organization_id = v.org
  from (values
    ('a0000000-0000-0000-0000-000000000001'::uuid, 'b0000000-0000-0000-0000-000000000001'::uuid),
    ('a0000000-0000-0000-0000-000000000002'::uuid, 'b0000000-0000-0000-0000-000000000002'::uuid),
    ('a0000000-0000-0000-0000-000000000003'::uuid, 'b0000000-0000-0000-0000-000000000001'::uuid),
    ('a0000000-0000-0000-0000-000000000004'::uuid, 'b0000000-0000-0000-0000-000000000002'::uuid),
    ('a0000000-0000-0000-0000-000000000005'::uuid, 'b0000000-0000-0000-0000-000000000001'::uuid),
    ('a0000000-0000-0000-0000-000000000006'::uuid, 'b0000000-0000-0000-0000-000000000003'::uuid)
  ) as v (id, org)
 where p.id = v.id;

-- -----------------------------------------------------------------------------
-- Projeto e equipe
-- -----------------------------------------------------------------------------
insert into imobproj.projects (id, codigo, nome, cliente_org_id, executora_org_id, inicio, fim, status, horas_orcadas) values
  ('c0000000-0000-0000-0000-000000000014', 'PRJ-014', 'Portal de Tickets Calper',
   'b0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001',
   '2026-08-03', '2026-12-18', 'execucao', 544)
on conflict (id) do nothing;

insert into imobproj.project_members (project_id, user_id, role) values
  ('c0000000-0000-0000-0000-000000000014', 'a0000000-0000-0000-0000-000000000002', 'diretor'),
  ('c0000000-0000-0000-0000-000000000014', 'a0000000-0000-0000-0000-000000000003', 'gerente'),
  ('c0000000-0000-0000-0000-000000000014', 'a0000000-0000-0000-0000-000000000004', 'usuario_chave'),
  ('c0000000-0000-0000-0000-000000000014', 'a0000000-0000-0000-0000-000000000005', 'analista'),
  ('c0000000-0000-0000-0000-000000000014', 'a0000000-0000-0000-0000-000000000006', 'prestador')
on conflict (project_id, user_id) do nothing;

-- -----------------------------------------------------------------------------
-- EAP: 4 fases com subitens (horas orçadas nas folhas = 544 h)
-- -----------------------------------------------------------------------------
insert into imobproj.wbs_items (id, project_id, parent_id, codigo, titulo, responsavel_id, horas_orcadas, inicio, fim, ordem, is_milestone, is_fase) values
  -- Fase 1
  ('d0000000-0000-0000-0000-000000000100', 'c0000000-0000-0000-0000-000000000014', null, '1', 'Iniciação e Planejamento',
   'a0000000-0000-0000-0000-000000000003', 0, '2026-08-03', '2026-08-28', 100, false, true),
  -- Fase 2
  ('d0000000-0000-0000-0000-000000000200', 'c0000000-0000-0000-0000-000000000014', null, '2', 'Desenho da Solução',
   'a0000000-0000-0000-0000-000000000003', 0, '2026-08-31', '2026-09-25', 200, false, true),
  -- Fase 3
  ('d0000000-0000-0000-0000-000000000300', 'c0000000-0000-0000-0000-000000000014', null, '3', 'Desenvolvimento',
   'a0000000-0000-0000-0000-000000000003', 0, '2026-09-28', '2026-11-27', 300, false, true),
  -- Fase 4
  ('d0000000-0000-0000-0000-000000000400', 'c0000000-0000-0000-0000-000000000014', null, '4', 'Homologação e Implantação',
   'a0000000-0000-0000-0000-000000000003', 0, '2026-11-30', '2026-12-18', 400, false, true)
on conflict (id) do nothing;

insert into imobproj.wbs_items (id, project_id, parent_id, codigo, titulo, responsavel_id, horas_orcadas, inicio, fim, ordem, is_milestone, is_fase) values
  ('d0000000-0000-0000-0000-000000000101', 'c0000000-0000-0000-0000-000000000014', 'd0000000-0000-0000-0000-000000000100', '1.1', 'Termo de abertura e kickoff',
   'a0000000-0000-0000-0000-000000000003', 16, '2026-08-03', '2026-08-07', 101, false, false),
  ('d0000000-0000-0000-0000-000000000102', 'c0000000-0000-0000-0000-000000000014', 'd0000000-0000-0000-0000-000000000100', '1.2', 'Levantamento de requisitos',
   'a0000000-0000-0000-0000-000000000005', 40, '2026-08-10', '2026-08-21', 102, false, false),
  ('d0000000-0000-0000-0000-000000000103', 'c0000000-0000-0000-0000-000000000014', 'd0000000-0000-0000-0000-000000000100', '1.3', 'Marco: escopo aprovado',
   'a0000000-0000-0000-0000-000000000002', 0, '2026-08-28', '2026-08-28', 103, true, false),

  ('d0000000-0000-0000-0000-000000000201', 'c0000000-0000-0000-0000-000000000014', 'd0000000-0000-0000-0000-000000000200', '2.1', 'Mapeamento de processos AS-IS e TO-BE',
   'a0000000-0000-0000-0000-000000000005', 32, '2026-08-31', '2026-09-11', 201, false, false),
  ('d0000000-0000-0000-0000-000000000202', 'c0000000-0000-0000-0000-000000000014', 'd0000000-0000-0000-0000-000000000200', '2.2', 'Protótipo navegável das telas',
   'a0000000-0000-0000-0000-000000000005', 40, '2026-09-08', '2026-09-25', 202, false, false),
  ('d0000000-0000-0000-0000-000000000203', 'c0000000-0000-0000-0000-000000000014', 'd0000000-0000-0000-0000-000000000200', '2.3', 'Arquitetura técnica',
   'a0000000-0000-0000-0000-000000000003', 24, '2026-09-14', '2026-09-25', 203, false, false),

  ('d0000000-0000-0000-0000-000000000301', 'c0000000-0000-0000-0000-000000000014', 'd0000000-0000-0000-0000-000000000300', '3.1', 'Abertura e triagem de tickets',
   'a0000000-0000-0000-0000-000000000005', 120, '2026-09-28', '2026-10-30', 301, false, false),
  ('d0000000-0000-0000-0000-000000000302', 'c0000000-0000-0000-0000-000000000014', 'd0000000-0000-0000-0000-000000000300', '3.2', 'Painel de atendimento e SLA',
   'a0000000-0000-0000-0000-000000000005', 100, '2026-10-05', '2026-11-13', 302, false, false),
  ('d0000000-0000-0000-0000-000000000303', 'c0000000-0000-0000-0000-000000000014', 'd0000000-0000-0000-0000-000000000300', '3.3', 'Integração WhatsApp (OpenWA)',
   'a0000000-0000-0000-0000-000000000005', 60, '2026-10-26', '2026-11-20', 303, false, false),
  ('d0000000-0000-0000-0000-000000000304', 'c0000000-0000-0000-0000-000000000014', 'd0000000-0000-0000-0000-000000000300', '3.4', 'Infraestrutura e deploy',
   'a0000000-0000-0000-0000-000000000006', 40, '2026-10-19', '2026-11-27', 304, false, false),

  ('d0000000-0000-0000-0000-000000000401', 'c0000000-0000-0000-0000-000000000014', 'd0000000-0000-0000-0000-000000000400', '4.1', 'Testes com usuários-chave',
   'a0000000-0000-0000-0000-000000000004', 48, '2026-11-30', '2026-12-09', 401, false, false),
  ('d0000000-0000-0000-0000-000000000402', 'c0000000-0000-0000-0000-000000000014', 'd0000000-0000-0000-0000-000000000400', '4.2', 'Treinamento das equipes',
   'a0000000-0000-0000-0000-000000000003', 24, '2026-12-07', '2026-12-16', 402, false, false),
  ('d0000000-0000-0000-0000-000000000403', 'c0000000-0000-0000-0000-000000000014', 'd0000000-0000-0000-0000-000000000400', '4.3', 'Marco: go-live',
   'a0000000-0000-0000-0000-000000000002', 0, '2026-12-18', '2026-12-18', 403, true, false)
on conflict (id) do nothing;

insert into imobproj.wbs_dependencies (id, predecessora_id, sucessora_id, tipo, lag_dias) values
  ('90000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000101', 'd0000000-0000-0000-0000-000000000102', 'FS', 0),
  ('90000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000102', 'd0000000-0000-0000-0000-000000000103', 'FS', 5),
  ('90000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000103', 'd0000000-0000-0000-0000-000000000201', 'FS', 0),
  ('90000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000201', 'd0000000-0000-0000-0000-000000000202', 'SS', 6),
  ('90000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000202', 'd0000000-0000-0000-0000-000000000301', 'FS', 0),
  ('90000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000301', 'd0000000-0000-0000-0000-000000000302', 'SS', 5),
  ('90000000-0000-0000-0000-000000000007', 'd0000000-0000-0000-0000-000000000302', 'd0000000-0000-0000-0000-000000000401', 'FS', 0),
  ('90000000-0000-0000-0000-000000000008', 'd0000000-0000-0000-0000-000000000304', 'd0000000-0000-0000-0000-000000000401', 'FS', 0),
  ('90000000-0000-0000-0000-000000000009', 'd0000000-0000-0000-0000-000000000401', 'd0000000-0000-0000-0000-000000000403', 'FS', 0),
  ('90000000-0000-0000-0000-000000000010', 'd0000000-0000-0000-0000-000000000402', 'd0000000-0000-0000-0000-000000000403', 'FS', 0)
on conflict (id) do nothing;

-- Linha de base nº 1 (congelada no fim do planejamento)
insert into imobproj.baselines (id, project_id, numero, congelada_em, snapshot)
select '60000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000014', 1,
       '2026-08-28 18:00:00-03',
       jsonb_agg(jsonb_build_object(
         'wbs_item_id', w.id, 'codigo', w.codigo, 'titulo', w.titulo,
         'inicio', w.inicio, 'fim', w.fim, 'horas_orcadas', w.horas_orcadas,
         'is_fase', w.is_fase, 'is_milestone', w.is_milestone
       ) order by w.ordem)
  from imobproj.wbs_items w
 where w.project_id = 'c0000000-0000-0000-0000-000000000014'
on conflict (id) do nothing;

-- Uma remarcação registrada (painel de atendimento atrasou 1 semana)
insert into imobproj.schedule_changes (id, wbs_item_id, autor_id, de, para, justificativa) values
  ('6a000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000302', 'a0000000-0000-0000-0000-000000000003',
   '{"inicio":"2026-09-28","fim":"2026-11-06"}', '{"inicio":"2026-10-05","fim":"2026-11-13"}',
   'Protótipo recusado na revisão (OS 236); início do painel deslocado em uma semana.')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Ordens de Serviço: inseridas no estado inicial e depois movimentadas,
-- para que os triggers gerem o histórico (os_status_history) e a auditoria.
-- -----------------------------------------------------------------------------
insert into imobproj.service_orders (
  id, project_id, numero, wbs_item_id, executor_id, titulo, descricao,
  agendada_inicio, agendada_fim, status, fora_escopo, origem
) values
  ('e0000000-0000-0000-0000-000000000231', 'c0000000-0000-0000-0000-000000000014', 231, 'd0000000-0000-0000-0000-000000000102', 'a0000000-0000-0000-0000-000000000005',
   'Workshop de requisitos com a central de atendimento', 'Entrevistas com supervisores e registro dos requisitos funcionais.',
   '2026-08-12 09:00-03', '2026-08-13 18:00-03', 'agendada', false, 'portal'),
  ('e0000000-0000-0000-0000-000000000232', 'c0000000-0000-0000-0000-000000000014', 232, 'd0000000-0000-0000-0000-000000000201', 'a0000000-0000-0000-0000-000000000005',
   'Mapeamento AS-IS do fluxo de chamados', 'Modelagem do processo atual de abertura e encerramento de chamados.',
   '2026-09-01 09:00-03', '2026-09-02 18:00-03', 'agendada', false, 'portal'),
  ('e0000000-0000-0000-0000-000000000233', 'c0000000-0000-0000-0000-000000000014', 233, 'd0000000-0000-0000-0000-000000000304', 'a0000000-0000-0000-0000-000000000006',
   'Instalação do servidor de homologação', 'Provisionar VM, Docker e certificados no datacenter da Calper.',
   '2026-10-21 08:00-03', '2026-10-21 17:00-03', 'agendada', false, 'app'),
  ('e0000000-0000-0000-0000-000000000234', 'c0000000-0000-0000-0000-000000000014', 234, 'd0000000-0000-0000-0000-000000000301', 'a0000000-0000-0000-0000-000000000005',
   'Tela de abertura de ticket', 'Formulário com anexos, categorização automática e confirmação por e-mail.',
   '2026-10-27 09:00-03', '2026-10-30 18:00-03', 'agendada', false, 'portal'),
  ('e0000000-0000-0000-0000-000000000235', 'c0000000-0000-0000-0000-000000000014', 235, 'd0000000-0000-0000-0000-000000000304', 'a0000000-0000-0000-0000-000000000006',
   'Configurar backup e monitoramento', 'Rotina de backup diário e alertas de disco/CPU.',
   '2026-11-04 08:00-03', '2026-11-04 17:00-03', 'agendada', false, 'portal'),
  ('e0000000-0000-0000-0000-000000000236', 'c0000000-0000-0000-0000-000000000014', 236, 'd0000000-0000-0000-0000-000000000202', 'a0000000-0000-0000-0000-000000000005',
   'Protótipo das telas do atendente', 'Protótipo navegável da fila e do detalhe do ticket.',
   '2026-09-15 09:00-03', '2026-09-16 18:00-03', 'agendada', false, 'portal'),
  ('e0000000-0000-0000-0000-000000000237', 'c0000000-0000-0000-0000-000000000014', 237, null, 'a0000000-0000-0000-0000-000000000005',
   'Relatório extra de SLA por filial', 'Solicitado no grupo Usuários-chave: #OS relatório de SLA por filial com exportação em PDF.',
   null, null, 'rascunho', true, 'whatsapp')
on conflict (id) do nothing;

-- Em execução (check-in)
update imobproj.service_orders
   set status = 'em_execucao',
       checkin_at = agendada_inicio + interval '5 minutes',
       checkin_lat = -23.5505, checkin_lng = -46.6333
 where id in ('e0000000-0000-0000-0000-000000000231', 'e0000000-0000-0000-0000-000000000232',
              'e0000000-0000-0000-0000-000000000233', 'e0000000-0000-0000-0000-000000000234',
              'e0000000-0000-0000-0000-000000000236')
   and status = 'agendada';

-- Check-out e envio para aceite
update imobproj.service_orders
   set status = 'aguardando_aceite',
       checkout_at = agendada_fim,
       horas = case id
                 when 'e0000000-0000-0000-0000-000000000231' then 16
                 when 'e0000000-0000-0000-0000-000000000232' then 12
                 when 'e0000000-0000-0000-0000-000000000233' then 8
                 when 'e0000000-0000-0000-0000-000000000236' then 6
               end
 where id in ('e0000000-0000-0000-0000-000000000231', 'e0000000-0000-0000-0000-000000000232',
              'e0000000-0000-0000-0000-000000000233', 'e0000000-0000-0000-0000-000000000236')
   and status = 'em_execucao';

-- Aceites
update imobproj.service_orders
   set status = 'aprovada', aceite_por = 'a0000000-0000-0000-0000-000000000004',
       aceite_em = '2026-08-14 10:00-03', aceite_comentario = 'Requisitos validados com a central.'
 where id = 'e0000000-0000-0000-0000-000000000231' and status = 'aguardando_aceite';

update imobproj.service_orders
   set status = 'aprovada', aceite_por = 'a0000000-0000-0000-0000-000000000002',
       aceite_em = '2026-09-03 16:30-03', aceite_comentario = 'De acordo.'
 where id = 'e0000000-0000-0000-0000-000000000232' and status = 'aguardando_aceite';

update imobproj.service_orders
   set status = 'recusada', aceite_por = 'a0000000-0000-0000-0000-000000000004',
       aceite_em = '2026-09-17 11:00-03',
       aceite_comentario = 'Protótipo não contempla o fluxo de reabertura de ticket. Refazer.'
 where id = 'e0000000-0000-0000-0000-000000000236' and status = 'aguardando_aceite';

insert into imobproj.os_evidences (id, os_id, tipo, storage_path, captured_at, lat, lng, origem) values
  ('80000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000231', 'arquivo',
   'c0000000-0000-0000-0000-000000000014/e0000000-0000-0000-0000-000000000231/requisitos-v1.pdf', '2026-08-13 17:40-03', null, null, 'portal'),
  ('80000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000233', 'foto',
   'c0000000-0000-0000-0000-000000000014/e0000000-0000-0000-0000-000000000233/rack-01.jpg', '2026-10-21 10:12-03', -23.5505, -46.6333, 'app'),
  ('80000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000233', 'print',
   'c0000000-0000-0000-0000-000000000014/e0000000-0000-0000-0000-000000000233/docker-ps.png', '2026-10-21 15:30-03', -23.5505, -46.6333, 'app'),
  ('80000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000233', 'assinatura',
   'c0000000-0000-0000-0000-000000000014/e0000000-0000-0000-0000-000000000233/assinatura-cliente.png', '2026-10-21 16:55-03', -23.5505, -46.6333, 'app')
on conflict (id) do nothing;

insert into imobproj.scope_proposals (id, project_id, os_id, descricao, horas, valor, status) values
  ('8a000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000014', 'e0000000-0000-0000-0000-000000000237',
   'Relatório de SLA por filial com exportação em PDF (não previsto no escopo).', 16, 2400.00, 'pendente')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Documentos e comentários
-- -----------------------------------------------------------------------------
insert into imobproj.documents (id, project_id, tipo, titulo, versao, status, storage_path, conteudo) values
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000014', 'termo_abertura', 'Termo de Abertura do Projeto', '1.0', 'aprovado',
   'c0000000-0000-0000-0000-000000000014/10000000-0000-0000-0000-000000000001/termo-abertura-v1.pdf', '{}'),
  ('10000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000014', 'escopo', 'Declaração de Escopo', '1.2', 'aprovado',
   'c0000000-0000-0000-0000-000000000014/10000000-0000-0000-0000-000000000002/escopo-v1.2.pdf', '{}'),
  ('10000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000014', 'processo_asis', 'Processo AS-IS: abertura de chamados', '0.3', 'revisao', null,
   '{"etapas":[{"ordem":1,"titulo":"Cliente liga para a central"},{"ordem":2,"titulo":"Atendente registra em planilha"},{"ordem":3,"titulo":"Problema resolvido no 1º nível?","decisao":true,"sim":5,"nao":4},{"ordem":4,"titulo":"Encaminha por e-mail ao técnico"},{"ordem":5,"titulo":"Encerra o chamado"}]}'),
  ('10000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000014', 'processo_tobe', 'Processo TO-BE: abertura de tickets', '0.1', 'rascunho', null,
   '{"etapas":[{"ordem":1,"titulo":"Cliente abre ticket no portal ou WhatsApp"},{"ordem":2,"titulo":"Triagem automática por categoria"},{"ordem":3,"titulo":"Dentro do SLA?","decisao":true,"sim":4,"nao":5},{"ordem":4,"titulo":"Atendente resolve e encerra"},{"ordem":5,"titulo":"Escala para supervisor"}]}'),
  ('10000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000014', 'requisitos', 'Requisitos funcionais', '2.0', 'vivo', null,
   '{"requisitos":[{"id":"RF-01","texto":"Abrir ticket com anexos"},{"id":"RF-02","texto":"Painel com fila por SLA"},{"id":"RF-03","texto":"Notificação por WhatsApp"}]}')
on conflict (id) do nothing;

insert into imobproj.document_comments (id, document_id, autor_id, texto, resolvido) values
  ('11000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004',
   'Faltou a etapa de aprovação do supervisor para chamados acima de R$ 5 mil.', false),
  ('11000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003',
   'Incluído na versão 0.3. Pode validar?', false),
  ('11000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002',
   'Escopo aprovado pela diretoria.', true)
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Atas (5), participantes e encaminhamentos
-- -----------------------------------------------------------------------------
insert into imobproj.meetings (id, project_id, numero, titulo, data, inicio, fim, local, pauta, decisoes, status, redator_id) values
  ('f0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000014', 1, 'Kickoff do projeto', '2026-08-04', '09:00', '10:30', 'Calper · Sala 3',
   '["Apresentação das equipes","Objetivos e escopo","Cronograma macro","Canais de comunicação"]',
   '["Reuniões de status semanais às sextas","Grupos de WhatsApp por equipe via OpenWA"]', 'aprovada', 'a0000000-0000-0000-0000-000000000003'),
  ('f0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000014', 2, 'Workshop de requisitos', '2026-08-14', '14:00', '17:00', 'Google Meet',
   '["Fluxo atual de chamados","Indicadores de SLA","Integrações necessárias"]',
   '["SLA medido em horas úteis","Primeira versão sem integração com ERP"]', 'aprovada', 'a0000000-0000-0000-0000-000000000003'),
  ('f0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000014', 3, 'Validação dos processos AS-IS e TO-BE', '2026-09-11', '10:00', '11:30', 'Calper · Sala 3',
   '["Revisão do AS-IS","Proposta TO-BE","Pontos de decisão"]',
   '["Triagem automática por categoria aprovada"]', 'publicada', 'a0000000-0000-0000-0000-000000000003'),
  ('f0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000014', 4, 'Revisão do protótipo', '2026-09-25', '15:00', '16:00', 'Google Meet',
   '["Navegação do protótipo","Fluxo de reabertura","Ajustes de layout"]',
   '["Refazer fluxo de reabertura (OS 236 recusada)","Painel deslocado em uma semana"]', 'publicada', 'a0000000-0000-0000-0000-000000000003'),
  ('f0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000014', 5, 'Status semanal nº 12', '2026-10-23', '09:00', '09:45', 'Google Meet',
   '["Andamento do desenvolvimento","Servidor de homologação","Pedido de relatório de SLA por filial"]',
   '[]', 'rascunho', 'a0000000-0000-0000-0000-000000000003')
on conflict (id) do nothing;

insert into imobproj.meeting_participants (meeting_id, user_id, presenca, ciente_em)
select m.id, p.user_id,
       case when m.numero = 3 and p.user_id = 'a0000000-0000-0000-0000-000000000002'::uuid
            then 'ausente'::imobproj.presenca_tipo else 'presente'::imobproj.presenca_tipo end,
       case when m.status = 'aprovada' then m.data::timestamptz + interval '1 day'
            when m.status = 'publicada' and p.user_id = 'a0000000-0000-0000-0000-000000000004'::uuid
              then m.data::timestamptz + interval '1 day' end
  from imobproj.meetings m
 cross join (values
   ('a0000000-0000-0000-0000-000000000002'::uuid),
   ('a0000000-0000-0000-0000-000000000003'::uuid),
   ('a0000000-0000-0000-0000-000000000004'::uuid),
   ('a0000000-0000-0000-0000-000000000005'::uuid)
 ) as p (user_id)
 where m.project_id = 'c0000000-0000-0000-0000-000000000014'
on conflict (meeting_id, user_id) do nothing;

-- prestador participou do status semanal
insert into imobproj.meeting_participants (meeting_id, user_id, presenca) values
  ('f0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000006', 'presente')
on conflict (meeting_id, user_id) do nothing;

insert into imobproj.meeting_actions (id, meeting_id, acao, responsavel_id, prazo, status, wbs_item_id, vincular_cronograma) values
  ('70000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'Criar grupos de WhatsApp por equipe',
   'a0000000-0000-0000-0000-000000000003', '2026-08-07', 'concluida', null, false),
  ('70000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000002', 'Enviar planilha de categorias de chamados',
   'a0000000-0000-0000-0000-000000000004', '2026-08-19', 'concluida', null, false),
  ('70000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000003', 'Detalhar regras de triagem automática',
   'a0000000-0000-0000-0000-000000000005', '2026-09-18', 'concluida', 'd0000000-0000-0000-0000-000000000201', true),
  ('70000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000004', 'Refazer fluxo de reabertura no protótipo',
   'a0000000-0000-0000-0000-000000000005', '2026-10-02', 'em_andamento', 'd0000000-0000-0000-0000-000000000202', true),
  ('70000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000005', 'Avaliar proposta de escopo do relatório de SLA',
   'a0000000-0000-0000-0000-000000000002', '2026-10-30', 'aberta', null, false),
  ('70000000-0000-0000-0000-000000000006', 'f0000000-0000-0000-0000-000000000005', 'Liberar acesso VPN para o prestador',
   'a0000000-0000-0000-0000-000000000004', '2026-10-28', 'aberta', 'd0000000-0000-0000-0000-000000000304', true)
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Agenda (calendar_events)
-- -----------------------------------------------------------------------------
insert into imobproj.calendar_events (id, project_id, tipo, wbs_item_id, os_id, meeting_id, titulo, inicio, fim, local) values
  ('50000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000014', 'reuniao', null, null, 'f0000000-0000-0000-0000-000000000001',
   'Kickoff do projeto', '2026-08-04 09:00-03', '2026-08-04 10:30-03', 'Calper · Sala 3'),
  ('50000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000014', 'reuniao', null, null, 'f0000000-0000-0000-0000-000000000004',
   'Revisão do protótipo', '2026-09-25 15:00-03', '2026-09-25 16:00-03', 'Google Meet'),
  ('50000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000014', 'reuniao', null, null, 'f0000000-0000-0000-0000-000000000005',
   'Status semanal nº 12', '2026-10-23 09:00-03', '2026-10-23 09:45-03', 'Google Meet'),
  ('50000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000014', 'reuniao', null, null, null,
   'Status semanal nº 13', '2026-10-30 09:00-03', '2026-10-30 09:45-03', 'Google Meet'),
  ('50000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000014', 'os', null, 'e0000000-0000-0000-0000-000000000234', null,
   'OS 234 · Tela de abertura de ticket', '2026-10-27 09:00-03', '2026-10-30 18:00-03', 'Remoto'),
  ('50000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000014', 'os', null, 'e0000000-0000-0000-0000-000000000235', null,
   'OS 235 · Configurar backup e monitoramento', '2026-11-04 08:00-03', '2026-11-04 17:00-03', 'Datacenter Calper'),
  ('50000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000014', 'marco', 'd0000000-0000-0000-0000-000000000103', null, null,
   'Marco: escopo aprovado', '2026-08-28 00:00-03', null, null),
  ('50000000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000014', 'marco', 'd0000000-0000-0000-0000-000000000403', null, null,
   'Marco: go-live', '2026-12-18 00:00-03', null, null),
  ('50000000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000014', 'atividade', 'd0000000-0000-0000-0000-000000000301', null, null,
   '3.1 Abertura e triagem de tickets', '2026-09-28 08:00-03', '2026-10-30 18:00-03', null),
  ('50000000-0000-0000-0000-000000000010', 'c0000000-0000-0000-0000-000000000014', 'atividade', 'd0000000-0000-0000-0000-000000000302', null, null,
   '3.2 Painel de atendimento e SLA', '2026-10-05 08:00-03', '2026-11-13 18:00-03', null)
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- WhatsApp: 1 sessão OpenWA, 4 grupos por equipe, membros e mensagens
-- -----------------------------------------------------------------------------
insert into imobproj.wa_sessions (id, project_id, numero, openwa_url, api_key_secret_id, status, last_heartbeat) values
  ('30000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000014', '5511900000099',
   'http://localhost:8002', null, 'conectado', now())
on conflict (id) do nothing;

insert into imobproj.wa_groups (id, project_id, session_id, equipe, nome, wa_group_id, ativo, auto_evidencia, auto_os) values
  ('20000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000014', '30000000-0000-0000-0000-000000000001',
   'Gestão', 'PRJ-014 · Gestão', '120363000000000001@g.us', true, false, false),
  ('20000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000014', '30000000-0000-0000-0000-000000000001',
   'Desenvolvimento', 'PRJ-014 · Desenvolvimento', '120363000000000002@g.us', true, true, false),
  ('20000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000014', '30000000-0000-0000-0000-000000000001',
   'Infraestrutura', 'PRJ-014 · Infraestrutura', '120363000000000003@g.us', true, true, true),
  ('20000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000014', '30000000-0000-0000-0000-000000000001',
   'Usuários-chave', 'PRJ-014 · Usuários-chave', '120363000000000004@g.us', true, false, true)
on conflict (id) do nothing;

insert into imobproj.wa_group_members (group_id, user_id, telefone, is_admin)
select g.id, p.id, p.telefone_whatsapp, p.id = 'a0000000-0000-0000-0000-000000000003'::uuid
  from (values
    ('20000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0000-0000-0000-000000000002'::uuid),
    ('20000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0000-0000-0000-000000000003'::uuid),
    ('20000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0000-0000-0000-000000000004'::uuid),
    ('20000000-0000-0000-0000-000000000002'::uuid, 'a0000000-0000-0000-0000-000000000003'::uuid),
    ('20000000-0000-0000-0000-000000000002'::uuid, 'a0000000-0000-0000-0000-000000000005'::uuid),
    ('20000000-0000-0000-0000-000000000003'::uuid, 'a0000000-0000-0000-0000-000000000003'::uuid),
    ('20000000-0000-0000-0000-000000000003'::uuid, 'a0000000-0000-0000-0000-000000000005'::uuid),
    ('20000000-0000-0000-0000-000000000003'::uuid, 'a0000000-0000-0000-0000-000000000006'::uuid),
    ('20000000-0000-0000-0000-000000000004'::uuid, 'a0000000-0000-0000-0000-000000000003'::uuid),
    ('20000000-0000-0000-0000-000000000004'::uuid, 'a0000000-0000-0000-0000-000000000004'::uuid),
    ('20000000-0000-0000-0000-000000000004'::uuid, 'a0000000-0000-0000-0000-000000000005'::uuid)
  ) as gm (group_id, user_id)
  join imobproj.wa_groups g on g.id = gm.group_id
  join imobproj.profiles p on p.id = gm.user_id
 where p.telefone_whatsapp is not null
on conflict (group_id, telefone) do nothing;

insert into imobproj.wa_messages (id, group_id, wa_message_id, direction, author_phone, author_user_id, body, media_path, quoted_wa_message_id, status, tentativas, erro, created_at) values
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'wamid.SEED0001', 'in', '5511900000002', 'a0000000-0000-0000-0000-000000000002',
   'Bom dia! Como estamos com o cronograma do painel?', null, null, 'recebida', 0, null, '2026-10-26 08:55-03'),
  ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'wamid.SEED0002', 'out', '5511900000003', 'a0000000-0000-0000-0000-000000000003',
   'Bom dia, Ricardo. Uma semana de deslocamento por causa do protótipo; go-live mantido em 18/12.', null, 'wamid.SEED0001', 'enviada', 1, null, '2026-10-26 09:10-03'),
  ('40000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', 'wamid.SEED0003', 'in', '5511900000005', 'a0000000-0000-0000-0000-000000000005',
   'Subi a tela de abertura de ticket na branch de homologação. OS 234 em andamento.', null, null, 'recebida', 0, null, '2026-10-27 17:20-03'),
  ('40000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000003', 'wamid.SEED0004', 'in', '5511900000006', 'a0000000-0000-0000-0000-000000000006',
   'Servidor de homologação no ar. Segue print do docker ps (#233).',
   'c0000000-0000-0000-0000-000000000014/e0000000-0000-0000-0000-000000000233/docker-ps.png', null, 'recebida', 0, null, '2026-10-21 15:31-03'),
  ('40000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000003', 'wamid.SEED0005', 'out', '5511900000003', 'a0000000-0000-0000-0000-000000000003',
   'Perfeito, Jorge. Enviei a OS 233 para aceite.', null, 'wamid.SEED0004', 'enviada', 1, null, '2026-10-21 16:00-03'),
  ('40000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000004', 'wamid.SEED0006', 'in', '5511900000004', 'a0000000-0000-0000-0000-000000000004',
   '#OS relatório de SLA por filial com exportação em PDF', null, null, 'recebida', 0, null, '2026-10-22 11:05-03'),
  ('40000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000004', 'wamid.SEED0007', 'out', '5511900000003', 'a0000000-0000-0000-0000-000000000003',
   'Registrado como OS 237 (rascunho). Está fora do escopo; vamos levar uma proposta na próxima reunião.', null, 'wamid.SEED0006', 'enviada', 1, null, '2026-10-22 11:20-03'),
  -- fila de reenvio: uma pendente e uma que falhou
  ('40000000-0000-0000-0000-000000000008', '20000000-0000-0000-0000-000000000004', null, 'out', '5511900000003', 'a0000000-0000-0000-0000-000000000003',
   'Lembrete: ciência na ata da revisão do protótipo até sexta.', null, null, 'falhou', 2, 'Timeout de 15 s ao chamar o OpenWA', '2026-10-28 08:00-03'),
  ('40000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000002', null, 'out', '5511900000003', 'a0000000-0000-0000-0000-000000000003',
   'Daily às 9h30 amanhã.', null, null, 'pendente', 0, null, '2026-10-28 14:50-03')
on conflict (id) do nothing;
