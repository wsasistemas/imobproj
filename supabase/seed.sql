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

-- -----------------------------------------------------------------------------
-- Fase 1 — Cadastros: dados fictícios de clientes, contatos, cargos e equipes
-- -----------------------------------------------------------------------------
update imobproj.organizations o
   set nome_fantasia = v.fantasia, segmento = v.segmento, endereco = v.endereco
  from (values
    ('b0000000-0000-0000-0000-000000000001'::uuid, 'WSA Sistemas', 'Tecnologia', 'Av. Paulista, 1000, conj. 81, São Paulo/SP'),
    ('b0000000-0000-0000-0000-000000000002'::uuid, 'Calper',       'Construção civil', 'Av. Brasil, 1500, Sala 12, Campinas/SP'),
    ('b0000000-0000-0000-0000-000000000003'::uuid, 'TecnoCampo',   'Serviços de TI', 'R. das Acácias, 88, Valinhos/SP')
  ) as v(id, fantasia, segmento, endereco)
 where o.id = v.id and o.nome_fantasia is null;

insert into imobproj.organizations (id, nome, tipo, cnpj, nome_fantasia, segmento, endereco, ativo) values
  ('b0000000-0000-0000-0000-000000000004', 'Beta Logística S.A.', 'cliente', '44.444.444/0001-44', 'Beta Logística', 'Logística', 'Rod. Anhanguera, km 98, Sumaré/SP', true),
  ('b0000000-0000-0000-0000-000000000005', 'Épsilon Varejo Ltda.', 'cliente', '55.555.555/0001-55', 'Épsilon', 'Varejo', 'R. XV de Novembro, 300, Jundiaí/SP', false)
on conflict (id) do nothing;

insert into imobproj.organization_contacts (id, organization_id, nome, cargo, email, telefone_whatsapp, principal) values
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'Paulo Mendes',  'Usuário-chave · diretor', 'usuario.chave@exemplo.com.br', '5511900000004', true),
  ('b1000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'Carlos Souza',  'Financeiro',              'financeiro@calper.exemplo.com.br', '5519997013388', false),
  ('b1000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000004', 'Lúcia Ferraz',  'Gerente de TI',           'lucia@beta.exemplo.com.br', '5511987440192', true),
  ('b1000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000005', 'Sandra Melo',   'Compras',                 'sandra@epsilon.exemplo.com.br', '5521996542201', true)
on conflict (id) do nothing;

update imobproj.profiles p
   set cargo = v.cargo, atende_whatsapp = v.atende
  from (values
    ('a0000000-0000-0000-0000-000000000001'::uuid, 'Diretora de operações', true),
    ('a0000000-0000-0000-0000-000000000002'::uuid, 'Diretor',               false),
    ('a0000000-0000-0000-0000-000000000003'::uuid, 'Gerente de projetos',   true),
    ('a0000000-0000-0000-0000-000000000004'::uuid, 'Diretor (cliente)',     false),
    ('a0000000-0000-0000-0000-000000000005'::uuid, 'Analista de suporte',   true),
    ('a0000000-0000-0000-0000-000000000006'::uuid, 'Técnico de campo',      false)
  ) as v(id, cargo, atende)
 where p.id = v.id and p.cargo is null;

insert into imobproj.teams (id, nome, setor, lider_id) values
  ('b2000000-0000-0000-0000-000000000001', 'Suporte técnico', 'Suporte',     'a0000000-0000-0000-0000-000000000005'),
  ('b2000000-0000-0000-0000-000000000002', 'Implantação',     'Implantação', 'a0000000-0000-0000-0000-000000000003')
on conflict (id) do nothing;

insert into imobproj.team_members (team_id, user_id) values
  ('b2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000005'),
  ('b2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000006'),
  ('b2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003'),
  ('b2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001')
on conflict do nothing;

-- Fase 2: perfil de acesso de cada usuário de teste (o super admin não precisa de perfil).
update imobproj.profiles p
   set perfil = case
     when p.email in ('diretor@exemplo.com.br', 'gerente@exemplo.com.br') then 'gerente'
     when p.email = 'usuario.chave@exemplo.com.br' then 'usuario_chave'
     when p.email = 'prestador@exemplo.com.br' then 'prestador'
     when p.email = 'analista@exemplo.com.br' then 'analista'
     when p.atende_whatsapp then 'atendente'
     else 'analista'
   end
 where p.perfil is null and not p.is_super_admin;

-- -----------------------------------------------------------------------------
-- Fase 3: setores, números e fila (dados fictícios)
-- -----------------------------------------------------------------------------
-- Segundo número, ainda sem setor (para testar "ligar um número").
insert into imobproj.wa_sessions (id, project_id, numero, openwa_url, api_key_secret_id, status, last_heartbeat) values
  ('30000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000014', '5519935003001',
   'http://localhost:8002', null, 'desconectado', null)
on conflict (id) do nothing;

-- O trigger trg_setores_padroes cria horários, regras e mensagens de cada setor.
insert into imobproj.setores (id, nome, gestor_id) values
  ('b3000000-0000-0000-0000-000000000001', 'Suporte técnico', 'a0000000-0000-0000-0000-000000000003'),
  ('b3000000-0000-0000-0000-000000000002', 'Implantação',     'a0000000-0000-0000-0000-000000000003')
on conflict (id) do nothing;

insert into imobproj.setor_numeros (session_id, setor_id) values
  ('30000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001')
on conflict (session_id) do nothing;

update imobproj.teams set setor_id = 'b3000000-0000-0000-0000-000000000001'
 where id = 'b2000000-0000-0000-0000-000000000001' and setor_id is null;
update imobproj.teams set setor_id = 'b3000000-0000-0000-0000-000000000002'
 where id = 'b2000000-0000-0000-0000-000000000002' and setor_id is null;

insert into imobproj.setor_feriados (setor_id, data, descricao) values
  ('b3000000-0000-0000-0000-000000000001', '2026-11-02', 'Finados'),
  ('b3000000-0000-0000-0000-000000000001', '2026-11-20', 'Consciência Negra'),
  ('b3000000-0000-0000-0000-000000000001', '2026-12-08', 'Nossa Senhora da Conceição (Campinas)')
on conflict do nothing;

-- Conversas que já existiam entram na fila do setor do número delas.
update imobproj.wa_groups g set setor_id = imobproj.fn_setor_do_numero(g.session_id)
 where g.setor_id is null and g.session_id is not null;

-- -----------------------------------------------------------------------------
-- Fase 4: Monitor de atendimento (dados fictícios)
-- -----------------------------------------------------------------------------
-- Terceiro número, do setor Implantação, com duas conversas de clientes.
insert into imobproj.wa_sessions (id, project_id, numero, openwa_url, api_key_secret_id, status, last_heartbeat) values
  ('30000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000014', '5519935003002',
   'http://localhost:8002', null, 'conectado', now())
on conflict (id) do nothing;

insert into imobproj.setor_numeros (session_id, setor_id) values
  ('30000000-0000-0000-0000-000000000003', 'b3000000-0000-0000-0000-000000000002')
on conflict (session_id) do nothing;

insert into imobproj.wa_groups (id, project_id, session_id, equipe, nome, wa_group_id, ativo, auto_evidencia, auto_os) values
  ('20000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000014', '30000000-0000-0000-0000-000000000003',
   'Implantação', 'Beta Logística · Implantação', '120363000000000005@g.us', true, false, false),
  ('20000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000014', '30000000-0000-0000-0000-000000000003',
   'Implantação', 'Épsilon · Treinamento', '120363000000000006@g.us', true, false, false)
on conflict (id) do nothing;

-- Fernanda (gerente) também atende o Suporte técnico.
insert into imobproj.team_members (team_id, user_id) values
  ('b2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003')
on conflict do nothing;

-- Histórico: atendimentos encerrados neste mês e no mês passado (indicadores e comparação).
-- Colunas: grupo, setor, cliente, telefone, atendente, dias atrás, minutos de espera, minutos de atendimento,
-- transferências, devolvido à fila, reaberto em 24 h, fora do horário, prévia.
-- Dias < 31: este mês (no mínimo o dia 1 às 8h). Dias >= 31: mês passado, no mesmo trecho do mês.
insert into imobproj.atendimentos (setor_id, group_id, project_id, cliente_nome, cliente_telefone, atendente_id, status,
                                   entrou_fila_em, assumido_em, encerrado_em, transferencias, devolvido_fila,
                                   reaberto_em_24h, fora_horario, ultima_previa)
select v.setor, v.grupo, 'c0000000-0000-0000-0000-000000000014', v.cliente, v.fone, v.atendente, 'encerrado',
       base.ini, base.ini + make_interval(mins => v.espera),
       base.ini + make_interval(mins => v.espera + v.dur),
       v.transf, v.devolvido, v.reaberto, v.fora, v.previa
  from (values
    ('20000000-0000-0000-0000-000000000004'::uuid, 'b3000000-0000-0000-0000-000000000001'::uuid, 'Paulo Mendes',    '5511900000004', 'a0000000-0000-0000-0000-000000000005'::uuid, 1,  2, 14, 0, false, false, false, 'Relatório de SLA não abre'),
    ('20000000-0000-0000-0000-000000000003'::uuid, 'b3000000-0000-0000-0000-000000000001'::uuid, 'Carlos Souza',    '5519997013388', 'a0000000-0000-0000-0000-000000000005'::uuid, 2,  1, 9,  0, false, false, false, 'Senha do painel expirou'),
    ('20000000-0000-0000-0000-000000000001'::uuid, 'b3000000-0000-0000-0000-000000000001'::uuid, 'Ricardo Almeida', '5511900000002', 'a0000000-0000-0000-0000-000000000003'::uuid, 3,  4, 22, 1, false, false, false, 'Dúvida sobre o cronograma'),
    ('20000000-0000-0000-0000-000000000002'::uuid, 'b3000000-0000-0000-0000-000000000001'::uuid, 'Paulo Mendes',    '5511900000004', 'a0000000-0000-0000-0000-000000000005'::uuid, 4,  1, 11, 0, false, true,  false, 'Erro ao anexar arquivo'),
    ('20000000-0000-0000-0000-000000000004'::uuid, 'b3000000-0000-0000-0000-000000000001'::uuid, 'Paulo Mendes',    '5511900000004', 'a0000000-0000-0000-0000-000000000003'::uuid, 5,  3, 17, 0, false, false, true,  'Mensagem enviada às 21h'),
    ('20000000-0000-0000-0000-000000000005'::uuid, 'b3000000-0000-0000-0000-000000000002'::uuid, 'Lúcia Ferraz',    '5511987440192', 'a0000000-0000-0000-0000-000000000003'::uuid, 6,  2, 31, 0, false, false, false, 'Agenda da visita técnica'),
    ('20000000-0000-0000-0000-000000000006'::uuid, 'b3000000-0000-0000-0000-000000000002'::uuid, 'Sandra Melo',     '5521996542201', 'a0000000-0000-0000-0000-000000000001'::uuid, 8,  6, 26, 0, true,  false, false, 'Material do treinamento'),
    ('20000000-0000-0000-0000-000000000003'::uuid, 'b3000000-0000-0000-0000-000000000001'::uuid, 'Carlos Souza',    '5519997013388', 'a0000000-0000-0000-0000-000000000005'::uuid, 9,  1, 8,  0, false, false, false, 'Impressora fiscal offline'),
    ('20000000-0000-0000-0000-000000000005'::uuid, 'b3000000-0000-0000-0000-000000000002'::uuid, 'Lúcia Ferraz',    '5511987440192', 'a0000000-0000-0000-0000-000000000001'::uuid, 11, 3, 19, 0, false, false, false, 'Acesso de novos usuários'),
    ('20000000-0000-0000-0000-000000000001'::uuid, 'b3000000-0000-0000-0000-000000000001'::uuid, 'Ricardo Almeida', '5511900000002', 'a0000000-0000-0000-0000-000000000005'::uuid, 13, 2, 12, 0, false, false, false, 'Status da OS 233'),
    ('20000000-0000-0000-0000-000000000004'::uuid, 'b3000000-0000-0000-0000-000000000001'::uuid, 'Paulo Mendes',    '5511900000004', 'a0000000-0000-0000-0000-000000000005'::uuid, 15, 5, 15, 0, false, false, true,  'Pedido no sábado'),
    ('20000000-0000-0000-0000-000000000006'::uuid, 'b3000000-0000-0000-0000-000000000002'::uuid, 'Sandra Melo',     '5521996542201', 'a0000000-0000-0000-0000-000000000003'::uuid, 18, 2, 24, 2, false, false, false, 'Contrato de suporte'),
    ('20000000-0000-0000-0000-000000000004'::uuid, 'b3000000-0000-0000-0000-000000000001'::uuid, 'Paulo Mendes',    '5511900000004', 'a0000000-0000-0000-0000-000000000005'::uuid, 31, 6, 20, 1, false, false, false, 'Painel lento'),
    ('20000000-0000-0000-0000-000000000003'::uuid, 'b3000000-0000-0000-0000-000000000001'::uuid, 'Carlos Souza',    '5519997013388', 'a0000000-0000-0000-0000-000000000005'::uuid, 33, 4, 18, 0, true,  false, true,  'Boleto não chegou'),
    ('20000000-0000-0000-0000-000000000005'::uuid, 'b3000000-0000-0000-0000-000000000002'::uuid, 'Lúcia Ferraz',    '5511987440192', 'a0000000-0000-0000-0000-000000000003'::uuid, 36, 3, 28, 0, false, false, false, 'Kick-off da implantação'),
    ('20000000-0000-0000-0000-000000000001'::uuid, 'b3000000-0000-0000-0000-000000000001'::uuid, 'Ricardo Almeida', '5511900000002', 'a0000000-0000-0000-0000-000000000005'::uuid, 40, 2, 10, 0, false, false, false, 'Reunião de status'),
    ('20000000-0000-0000-0000-000000000006'::uuid, 'b3000000-0000-0000-0000-000000000002'::uuid, 'Sandra Melo',     '5521996542201', 'a0000000-0000-0000-0000-000000000001'::uuid, 44, 8, 33, 1, false, true,  false, 'Treinamento remarcado')
  ) as v(grupo, setor, cliente, fone, atendente, dias, espera, dur, transf, devolvido, reaberto, fora, previa)
  cross join lateral (
    select case when v.dias >= 31
             then (date_trunc('month', now() at time zone 'America/Sao_Paulo') - interval '1 month'
                   + make_interval(days => least(v.dias - 31, 20)) + interval '10 hours') at time zone 'America/Sao_Paulo'
             else greatest(
                    (date_trunc('month', now() at time zone 'America/Sao_Paulo') + interval '8 hours') at time zone 'America/Sao_Paulo',
                    (date_trunc('day', now() at time zone 'America/Sao_Paulo') - make_interval(days => v.dias) + interval '10 hours') at time zone 'America/Sao_Paulo')
           end as ini
  ) as base
 where not exists (select 1 from imobproj.atendimentos);

-- Em atendimento agora: Lucas com duas conversas (no grupo Desenvolvimento o cliente espera resposta) e
-- Fernanda com uma do Implantação.
insert into imobproj.atendimentos (setor_id, group_id, project_id, cliente_nome, cliente_telefone, atendente_id, status,
                                   entrou_fila_em, assumido_em, ultima_previa, ultima_msg_cliente_em, ultima_msg_atendente_em)
select v.setor, v.grupo, 'c0000000-0000-0000-0000-000000000014', v.cliente, v.fone, v.atendente, 'atendimento',
       now() - make_interval(mins => v.fila), now() - make_interval(mins => v.assumiu), v.previa,
       now() - make_interval(mins => v.cli), now() - make_interval(mins => v.atd)
  from (values
    ('20000000-0000-0000-0000-000000000001'::uuid, 'b3000000-0000-0000-0000-000000000001'::uuid, 'Ricardo Almeida', '5511900000002', 'a0000000-0000-0000-0000-000000000005'::uuid, 27, 25, 'Podemos antecipar a homologação?', 4, 2),
    ('20000000-0000-0000-0000-000000000002'::uuid, 'b3000000-0000-0000-0000-000000000001'::uuid, 'Paulo Mendes',    '5511900000004', 'a0000000-0000-0000-0000-000000000005'::uuid, 13, 11, 'A tela de abertura ainda dá erro', 3, 8),
    ('20000000-0000-0000-0000-000000000006'::uuid, 'b3000000-0000-0000-0000-000000000002'::uuid, 'Sandra Melo',     '5521996542201', 'a0000000-0000-0000-0000-000000000003'::uuid, 9,  8,  'Obrigada, vou testar agora', 6, 5)
  ) as v(grupo, setor, cliente, fone, atendente, fila, assumiu, previa, cli, atd)
 where not exists (select 1 from imobproj.atendimentos a where a.group_id = v.grupo and a.status <> 'encerrado');

-- Na fila: mensagens novas de clientes passam por fn_atendimento_mensagem (o mesmo caminho do webhook).
-- Ninguém tem status online ainda, então a distribuição automática não entrega nenhuma.
insert into imobproj.wa_messages (id, group_id, wa_message_id, direction, author_phone, author_user_id, body, status, created_at) values
  ('40000000-0000-0000-0000-000000000101', '20000000-0000-0000-0000-000000000004', 'wamid.SEED0101', 'in', '5511900000004',
   'a0000000-0000-0000-0000-000000000004', 'O relatório de SLA da filial Campinas veio em branco', 'recebida', now() - interval '6 minutes'),
  ('40000000-0000-0000-0000-000000000102', '20000000-0000-0000-0000-000000000003', 'wamid.SEED0102', 'in', '5519997013388',
   null, 'Bom dia, o servidor de homologação caiu?', 'recebida', now() - interval '3 minutes'),
  ('40000000-0000-0000-0000-000000000103', '20000000-0000-0000-0000-000000000005', 'wamid.SEED0103', 'in', '5511987440192',
   null, 'Podemos remarcar a visita de sexta para segunda?', 'recebida', now() - interval '1 minute')
on conflict (id) do nothing;

select imobproj.fn_atendimento_mensagem(id)
  from imobproj.wa_messages
 where id in ('40000000-0000-0000-0000-000000000101', '40000000-0000-0000-0000-000000000102', '40000000-0000-0000-0000-000000000103')
 order by created_at;

-- Status de quem atende (depois da fila, para a distribuição não entregar no seed):
-- Lucas online, Fernanda em pausa, Marina offline. "Online" vale por 5 min sem sinal da tela.
insert into imobproj.atendente_status (user_id, online, pausa, atualizado_em) values
  ('a0000000-0000-0000-0000-000000000005', true,  false, now()),
  ('a0000000-0000-0000-0000-000000000003', true,  true,  now()),
  ('a0000000-0000-0000-0000-000000000001', false, false, now())
on conflict (user_id) do nothing;

-- -----------------------------------------------------------------------------
-- Fase 5 · App de OS: aparelhos e OS abertas pelo app (dados fictícios)
-- -----------------------------------------------------------------------------
insert into imobproj.app_aparelhos (id, user_id, modelo, sistema, versao_app, pendencias, ultimo_acesso) values
  ('e5000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000005', 'Samsung Galaxy A54', 'Android 15', '1.0.3', 1, now() - interval '25 minutes'),
  ('e5000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000006', 'iPhone 13',          'iOS 19',     '1.0.2', 1, now() - interval '1 day 2 hours'),
  ('e5000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004', 'Motorola Moto G84',  'Android 14', '1.0.3', 0, now() - interval '3 hours'),
  ('e5000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000003', 'Samsung Galaxy S24', 'Android 15', '1.0.1', 0, now() - interval '45 days')
on conflict (id) do nothing;

insert into imobproj.service_orders (id, project_id, executor_id, titulo, descricao, agendada_inicio, agendada_fim, status, origem, tipo, criado_por)
select v.id, 'c0000000-0000-0000-0000-000000000014', v.executor, v.titulo, v.descricao,
       date_trunc('day', now()) + v.inicio, date_trunc('day', now()) + v.fim,
       v.status::imobproj.os_status, 'app', v.tipo, v.executor
  from (values
    ('e6000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0000-0000-0000-000000000005'::uuid, 'Impressora fiscal sem comunicação',
     'Aberta em campo: cliente relatou falha ao emitir cupom.', interval '14 hours', interval '15 hours 30 minutes', 'agendada', 'corretiva'),
    ('e6000000-0000-0000-0000-000000000002'::uuid, 'a0000000-0000-0000-0000-000000000006'::uuid, 'Revisão do nobreak da sala de servidores',
     null, interval '-2 days 9 hours', interval '-2 days 10 hours', 'agendada', 'preventiva')
  ) as v(id, executor, titulo, descricao, inicio, fim, status, tipo)
 where not exists (select 1 from imobproj.service_orders so where so.id = v.id);
