-- =============================================================================
-- IMOBPROJ · Fase 6 · Configurações gerais e regras de OS (ADITIVA)
--
-- 1) imobproj.configuracoes: uma linha só (id = true) com Empresa, Ordens de Serviço, Notificações e
--    Integrações. fn_config_bool (Fase 5) já lê daqui; fn_config_int / fn_config_publica completam.
-- 2) Bucket público imobproj-marca para o logo (a escrita é feita pela Server Action com service_role,
--    depois de checar config_gerais/editar).
-- 3) Regras de OS que passam a valer:
--    * foto / assinatura obrigatórias ao enviar para aceite (trigger em service_orders: vale para o
--      app, para o portal e para qualquer outro caminho);
--    * aceite automático depois de N horas aguardando (fn_aceite_automatico + pg_cron de hora em hora);
--    * aviso ao cliente no WhatsApp ao abrir a OS (consome aviso_cliente_pendente pondo a mensagem na
--      fila wa_messages, que o cron imobproj-openwa-reenvio já entrega);
--    * número inicial da OS em projetos novos.
-- 4) Menu config_gerais nos perfis iniciais (gerente vê; só o super admin edita por padrão).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Tabela de configurações (singleton)
-- -----------------------------------------------------------------------------
create table if not exists imobproj.configuracoes (
  id                              boolean primary key default true check (id),
  -- Empresa
  empresa_nome                    text not null default 'WSA Sistemas',
  empresa_cnpj                    text,
  logo_path                       text,             -- caminho no bucket imobproj-marca
  fuso                            text not null default 'America/Sao_Paulo',
  valor_hora_tecnica              numeric(12, 2) not null default 0 check (valor_hora_tecnica >= 0),
  -- Ordens de Serviço
  os_numero_inicial               integer not null default 1 check (os_numero_inicial >= 1),
  aceite_automatico_horas         integer not null default 0 check (aceite_automatico_horas between 0 and 2160),
  exigir_foto_checkout            boolean not null default false,
  exigir_assinatura_checkout      boolean not null default false,
  avisar_cliente_abertura_os      boolean not null default false,
  resumo_semanal_usuario_chave    boolean not null default false,
  -- Notificações
  notificar_os_atribuida          boolean not null default true,
  notificar_os_decidida           boolean not null default true,
  notificar_ata_publicada         boolean not null default true,
  email_remetente_nome            text not null default 'IMOBPROJ',
  -- Integrações
  app_campo_url                   text,             -- link de instalação do app (convite por WhatsApp)
  portal_url                      text,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  atualizado_por                  uuid references imobproj.profiles (id) on delete set null
);

comment on table imobproj.configuracoes is 'Configurações gerais do IMOBPROJ (uma linha, id = true).';
comment on column imobproj.configuracoes.aceite_automatico_horas is
  'OS em aguardando_aceite há mais que estas horas (desde o check-out) é aprovada automaticamente. 0 = desligado.';
comment on column imobproj.configuracoes.os_numero_inicial is
  'Número da primeira OS de um projeto novo (projetos que já têm OS seguem a própria sequência).';

insert into imobproj.configuracoes (id) values (true) on conflict (id) do nothing;

drop trigger if exists trg_configuracoes_updated_at on imobproj.configuracoes;
create trigger trg_configuracoes_updated_at
  before update on imobproj.configuracoes
  for each row execute function imobproj.set_updated_at();

-- Quem salvou por último (a coluna não vem da tela).
create or replace function imobproj.fn_configuracoes_autor()
returns trigger
language plpgsql
set search_path = imobproj, extensions
as $$
begin
  new.id := true;
  if auth.uid() is not null then
    new.atualizado_por := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_configuracoes_autor on imobproj.configuracoes;
create trigger trg_configuracoes_autor
  before insert or update on imobproj.configuracoes
  for each row execute function imobproj.fn_configuracoes_autor();

alter table imobproj.configuracoes enable row level security;

drop policy if exists configuracoes_select on imobproj.configuracoes;
create policy configuracoes_select on imobproj.configuracoes
  for select to authenticated
  using (imobproj.pode('config_gerais', 'ver'));

drop policy if exists configuracoes_update on imobproj.configuracoes;
create policy configuracoes_update on imobproj.configuracoes
  for update to authenticated
  using (imobproj.pode('config_gerais', 'editar'))
  with check (imobproj.pode('config_gerais', 'editar'));

grant select, update on imobproj.configuracoes to authenticated;
grant all on imobproj.configuracoes to service_role;

-- Inteiro com padrão, no mesmo espírito de fn_config_bool.
create or replace function imobproj.fn_config_int(p_coluna text, p_padrao integer)
returns integer
language plpgsql
stable
security definer
set search_path = imobproj, extensions
as $$
declare
  v integer;
begin
  if to_regclass('imobproj.configuracoes') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'imobproj' and table_name = 'configuracoes' and column_name = p_coluna) then
    return p_padrao;
  end if;
  execute format('select (%I)::integer from imobproj.configuracoes limit 1', p_coluna) into v;
  return coalesce(v, p_padrao);
exception when others then
  return p_padrao;
end;
$$;
revoke all on function imobproj.fn_config_int(text, integer) from public, anon;
grant execute on function imobproj.fn_config_int(text, integer) to authenticated, service_role;

-- O que qualquer pessoa logada (portal e app) precisa saber, sem ver a tabela inteira.
create or replace function imobproj.fn_config_publica()
returns table (
  empresa_nome               text,
  logo_path                  text,
  fuso                       text,
  valor_hora_tecnica         numeric,
  exigir_foto_checkout       boolean,
  exigir_assinatura_checkout boolean,
  aceite_automatico_horas    integer,
  app_campo_url              text
)
language sql
stable
security definer
set search_path = imobproj, extensions
as $$
  select c.empresa_nome, c.logo_path, c.fuso,
         -- valor da hora: só quem vê a medição (diretor/gerente/super admin) ou o menu de configurações
         case when imobproj.fn_is_super_admin() or imobproj.pode('config_gerais', 'ver')
                   or exists (select 1 from imobproj.project_members m
                               where m.user_id = auth.uid() and m.ativo and m.role in ('diretor', 'gerente'))
              then c.valor_hora_tecnica end,
         c.exigir_foto_checkout, c.exigir_assinatura_checkout, c.aceite_automatico_horas, c.app_campo_url
    from imobproj.configuracoes c
   where auth.uid() is not null
   limit 1;
$$;
revoke all on function imobproj.fn_config_publica() from public, anon;
grant execute on function imobproj.fn_config_publica() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2) Logo: bucket público (leitura aberta; escrita só service_role pela Server Action)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('imobproj-marca', 'imobproj-marca', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- 3a) Foto / assinatura obrigatórias ao enviar a OS para aceite
-- -----------------------------------------------------------------------------
create or replace function imobproj.fn_os_exigir_evidencias()
returns trigger
language plpgsql
security definer
set search_path = imobproj, extensions
as $$
declare
  v_foto       boolean := imobproj.fn_config_bool('exigir_foto_checkout', false);
  v_assinatura boolean := imobproj.fn_config_bool('exigir_assinatura_checkout', false);
begin
  -- Seed, SQL direto e service_role não passam pela regra.
  if auth.uid() is null then
    return new;
  end if;
  if new.status = 'aguardando_aceite' and old.status is distinct from 'aguardando_aceite' then
    if v_foto and not exists (select 1 from imobproj.os_evidences e where e.os_id = new.id and e.tipo = 'foto') then
      raise exception 'Inclua ao menos uma foto antes de enviar a OS para aceite.' using errcode = '23514';
    end if;
    if v_assinatura and not exists (select 1 from imobproj.os_evidences e where e.os_id = new.id and e.tipo = 'assinatura') then
      raise exception 'Colete a assinatura do cliente antes de enviar a OS para aceite.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_service_orders_exigir_evidencias on imobproj.service_orders;
create trigger trg_service_orders_exigir_evidencias
  before update of status on imobproj.service_orders
  for each row execute function imobproj.fn_os_exigir_evidencias();

-- -----------------------------------------------------------------------------
-- 3b) Aceite automático
-- -----------------------------------------------------------------------------
create or replace function imobproj.fn_aceite_automatico()
returns integer
language plpgsql
security definer
set search_path = imobproj, extensions
as $$
declare
  v_horas integer := imobproj.fn_config_int('aceite_automatico_horas', 0);
  v_qtd   integer;
begin
  if v_horas <= 0 then
    return 0;
  end if;
  update imobproj.service_orders o
     set status            = 'aprovada',
         aceite_em         = now(),
         aceite_por        = null,
         aceite_comentario = format('Aprovada automaticamente: %s h sem resposta do cliente.', v_horas)
   where o.status = 'aguardando_aceite'
     and coalesce(o.checkout_at, o.updated_at) < now() - make_interval(hours => v_horas);
  get diagnostics v_qtd = row_count;
  return v_qtd;
end;
$$;
revoke all on function imobproj.fn_aceite_automatico() from public, anon, authenticated;
grant execute on function imobproj.fn_aceite_automatico() to service_role;

-- De hora em hora (pg_cron já é usado pelo reenvio do OpenWA).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'imobproj-aceite-automatico';
    perform cron.schedule('imobproj-aceite-automatico', '7 * * * *', 'select imobproj.fn_aceite_automatico();');
  else
    raise notice 'pg_cron ausente: agende "select imobproj.fn_aceite_automatico();" de hora em hora.';
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- 3c) Aviso ao cliente no WhatsApp ao abrir a OS
--     Grupo do cliente: o grupo ativo do projeto que tem usuário-chave/diretor como membro, ou cujo nome
--     de equipe fala em "chave"/"cliente". Sem grupo, a flag fica marcada (nada é perdido) e nada sai.
-- -----------------------------------------------------------------------------
create or replace function imobproj.fn_grupo_cliente(p_project_id uuid)
returns uuid
language sql
stable
security definer
set search_path = imobproj, extensions
as $$
  select g.id
    from imobproj.wa_groups g
   where g.project_id = p_project_id
     and g.ativo
     and g.session_id is not null
   order by
     (exists (select 1
                from imobproj.wa_group_members gm
                join imobproj.project_members pm on pm.user_id = gm.user_id and pm.project_id = g.project_id and pm.ativo
               where gm.group_id = g.id and pm.role in ('usuario_chave', 'diretor'))) desc,
     (g.equipe ilike '%chave%' or g.equipe ilike '%cliente%') desc,
     g.created_at
   limit 1;
$$;
revoke all on function imobproj.fn_grupo_cliente(uuid) from public, anon, authenticated;
grant execute on function imobproj.fn_grupo_cliente(uuid) to service_role;

alter table imobproj.service_orders
  add column if not exists aviso_cliente_em timestamptz;
comment on column imobproj.service_orders.aviso_cliente_em is
  'Quando o aviso de abertura entrou na fila do WhatsApp (wa_messages).';

create or replace function imobproj.fn_os_avisar_cliente()
returns trigger
language plpgsql
security definer
set search_path = imobproj, extensions
as $$
declare
  v_grupo   uuid;
  v_projeto record;
  v_quando  text;
  v_resp    text;
begin
  -- Rascunho ainda não é uma OS de verdade: o aviso sai quando ela for agendada.
  if not new.aviso_cliente_pendente or new.aviso_cliente_em is not null or new.status = 'rascunho' then
    return null;
  end if;
  v_grupo := imobproj.fn_grupo_cliente(new.project_id);
  if v_grupo is null then
    return null;
  end if;
  select p.codigo, p.nome into v_projeto from imobproj.projects p where p.id = new.project_id;
  select nullif(btrim(pr.nome), '') into v_resp from imobproj.profiles pr where pr.id = new.executor_id;
  v_quando := case when new.agendada_inicio is not null
                   then to_char(new.agendada_inicio at time zone imobproj.fn_config_texto_fuso(), 'DD/MM "às" HH24:MI')
              end;

  insert into imobproj.wa_messages (group_id, direction, body, status, author_user_id)
  values (
    v_grupo, 'out',
    format(E'📋 *OS %s aberta* · %s\n%s%s%s',
           new.numero, coalesce(v_projeto.codigo, ''), new.titulo,
           case when v_quando is not null then E'\n🗓 ' || v_quando else '' end,
           case when v_resp is not null then E'\n👷 ' || v_resp else '' end),
    'pendente', null
  );

  update imobproj.service_orders
     set aviso_cliente_pendente = false,
         aviso_cliente_em       = now()
   where id = new.id;
  return null;
end;
$$;

-- Fuso das configurações (texto), usado para formatar horários nas mensagens.
create or replace function imobproj.fn_config_texto_fuso()
returns text
language plpgsql
stable
security definer
set search_path = imobproj, extensions
as $$
declare
  v text;
begin
  if to_regclass('imobproj.configuracoes') is null then
    return 'America/Sao_Paulo';
  end if;
  select c.fuso into v from imobproj.configuracoes c limit 1;
  return coalesce(nullif(v, ''), 'America/Sao_Paulo');
exception when others then
  return 'America/Sao_Paulo';
end;
$$;
revoke all on function imobproj.fn_config_texto_fuso() from public, anon;
grant execute on function imobproj.fn_config_texto_fuso() to authenticated, service_role;

drop trigger if exists trg_service_orders_avisar_cliente on imobproj.service_orders;
create trigger trg_service_orders_avisar_cliente
  after insert or update of aviso_cliente_pendente, status on imobproj.service_orders
  for each row execute function imobproj.fn_os_avisar_cliente();

-- OS criada pelo portal (não só pelo app) também avisa quando a opção está ligada.
create or replace function imobproj.fn_os_marcar_aviso()
returns trigger
language plpgsql
security definer
set search_path = imobproj, extensions
as $$
begin
  -- Só OS nova de verdade (importação/seed de OS já executada não avisa).
  if not new.aviso_cliente_pendente and new.status in ('rascunho', 'agendada', 'em_execucao') then
    new.aviso_cliente_pendente := imobproj.fn_config_bool('avisar_cliente_abertura_os', false);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_service_orders_marcar_aviso on imobproj.service_orders;
create trigger trg_service_orders_marcar_aviso
  before insert on imobproj.service_orders
  for each row execute function imobproj.fn_os_marcar_aviso();

-- -----------------------------------------------------------------------------
-- 3d) Número inicial da OS em projetos novos
--     Mesma função da migration 003, com o valor inicial do contador de OS vindo das configurações.
-- -----------------------------------------------------------------------------
create or replace function imobproj.fn_set_numero_sequencial()
returns trigger
language plpgsql
security definer
set search_path = imobproj, extensions
as $$
declare
  v_contador text := tg_argv[0];
  v_inicial  integer := case when tg_argv[0] = 'service_orders'
                             then greatest(imobproj.fn_config_int('os_numero_inicial', 1), 1)
                             else 1 end;
  v_numero   integer;
begin
  if new.numero is null then
    insert into imobproj.project_counters as pc (project_id, contador, ultimo)
    values (new.project_id, v_contador, v_inicial)
    on conflict (project_id, contador)
      do update set ultimo = pc.ultimo + 1
    returning pc.ultimo into v_numero;
    new.numero := v_numero;
  else
    insert into imobproj.project_counters as pc (project_id, contador, ultimo)
    values (new.project_id, v_contador, new.numero)
    on conflict (project_id, contador)
      do update set ultimo = greatest(pc.ultimo, excluded.ultimo);
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4) Permissões do menu novo nos perfis iniciais (só acrescenta)
-- -----------------------------------------------------------------------------
insert into imobproj.perfil_permissoes (perfil, menu, ver, criar, editar, excluir, aprovar)
select v.perfil, v.menu, v.ver, v.criar, v.editar, v.excluir, v.aprovar
from (values
  ('gerente', 'config_gerais', true, false, false, false, false)
) as v(perfil, menu, ver, criar, editar, excluir, aprovar)
where exists (select 1 from imobproj.perfis p where p.chave = v.perfil)
on conflict (perfil, menu) do nothing;

-- -----------------------------------------------------------------------------
-- 5) Mensagem automática do sistema (author_user_id nulo: aviso de OS, respostas automáticas) não conta
--    como resposta do atendente no Monitor (Fase 4).
-- -----------------------------------------------------------------------------
create or replace function imobproj.fn_wa_messages_atendimento()
returns trigger
language plpgsql
security definer
set search_path = imobproj
as $$
begin
  if new.direction = 'out' and new.author_user_id is not null then
    update imobproj.atendimentos
       set ultima_msg_atendente_em = new.created_at,
           ultima_previa = left(coalesce(nullif(new.body, ''), ultima_previa), 140)
     where group_id = new.group_id and status <> 'encerrado';
  end if;
  return new;
exception when others then
  raise warning 'imobproj.fn_wa_messages_atendimento: %', sqlerrm;
  return new;
end;
$$;
