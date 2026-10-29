-- =============================================================================
-- IMOBPROJ · Fase 5 — App de OS: abertura de OS pelo celular e painel de aparelhos
-- Migration ADITIVA e idempotente (decisão D2: a OS é aberta no próprio app de campo).
--
-- 1) service_orders ganha tipo (corretiva/preventiva/implantação/visita), materiais usados,
--    quem criou e a flag do aviso ao cliente (lida da configuração da Fase 6, quando existir).
-- 2) fn_app_abrir_os (SECURITY DEFINER): o app manda o id gerado no aparelho (UUID), então
--    a fila offline pode reenviar sem duplicar e o check-in feito offline já aponta para a OS
--    certa. Número sequencial e histórico continuam nos triggers de sempre.
--    Quem abre: super admin, gerente ou diretor (para qualquer membro), analista ou prestador
--    (só para si mesmo). A RLS de insert continua só para gerente; o app passa por esta função.
-- 3) fn_app_checkout com p_materiais (sobrecarga; a versão antiga continua para apps antigos).
-- 4) app_aparelhos: um registro por instalação do app (modelo, sistema, versão, último acesso e
--    pendências da fila), gravado por fn_app_registrar_aparelho. Painel do portal por
--    app_painel() e app_aparelhos_lista(), com o menu admin_app_campo.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Colunas novas da OS
-- -----------------------------------------------------------------------------
alter table imobproj.service_orders
  add column if not exists tipo                   text,
  add column if not exists materiais              text,
  add column if not exists criado_por             uuid references imobproj.profiles (id) on delete set null,
  add column if not exists aviso_cliente_pendente boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'service_orders_tipo_chk') then
    alter table imobproj.service_orders
      add constraint service_orders_tipo_chk
      check (tipo is null or tipo in ('corretiva', 'preventiva', 'implantacao', 'visita'));
  end if;
end $$;

create index if not exists service_orders_origem_idx on imobproj.service_orders (origem, created_at);

comment on column imobproj.service_orders.materiais is 'Materiais usados na execução, informados no check-out pelo app.';
comment on column imobproj.service_orders.aviso_cliente_pendente is
  'A OS foi aberta pelo app e o cliente deve ser avisado no WhatsApp (envio fica para a configuração da Fase 6).';

-- Lê uma opção booleana de imobproj.configuracoes (Fase 6) sem quebrar enquanto a tabela ou a
-- coluna não existem: devolve o padrão.
create or replace function imobproj.fn_config_bool(p_coluna text, p_padrao boolean)
returns boolean
language plpgsql
stable
security definer
set search_path = imobproj, extensions
as $$
declare
  v boolean;
begin
  if to_regclass('imobproj.configuracoes') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'imobproj' and table_name = 'configuracoes' and column_name = p_coluna) then
    return p_padrao;
  end if;
  execute format('select %I from imobproj.configuracoes limit 1', p_coluna) into v;
  return coalesce(v, p_padrao);
exception when others then
  return p_padrao;
end;
$$;
revoke all on function imobproj.fn_config_bool(text, boolean) from public, anon;
grant execute on function imobproj.fn_config_bool(text, boolean) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2) Abrir OS pelo app
-- -----------------------------------------------------------------------------
create or replace function imobproj.fn_app_abrir_os(
  p_id          uuid,
  p_project_id  uuid,
  p_tipo        text,
  p_titulo      text,
  p_descricao   text default null,
  p_inicio      timestamptz default null,
  p_fim         timestamptz default null,
  p_executor_id uuid default null
)
returns imobproj.service_orders
language plpgsql
security definer
set search_path = imobproj, extensions
as $$
declare
  v_uid      uuid := auth.uid();
  v_role     text;
  v_executor uuid;
  v_os       imobproj.service_orders;
begin
  if v_uid is null then
    raise exception 'Sem sessão' using errcode = '42501';
  end if;
  if p_id is null or p_project_id is null then
    raise exception 'Informe a OS e o projeto' using errcode = '22023';
  end if;

  -- Reenvio da fila offline: a OS já foi criada por esta pessoa.
  select * into v_os from imobproj.service_orders where id = p_id;
  if found then
    if v_os.criado_por is distinct from v_uid then
      raise exception 'Identificador de OS já usado' using errcode = '23505';
    end if;
    return v_os;
  end if;

  v_role := coalesce(imobproj.fn_user_role(p_project_id), '');
  if v_role not in ('super_admin', 'gerente', 'diretor', 'analista', 'prestador') then
    raise exception 'Seu papel neste projeto não permite abrir OS' using errcode = '42501';
  end if;

  if coalesce(btrim(p_titulo), '') = '' or length(btrim(p_titulo)) < 3 then
    raise exception 'Informe o título da OS (ao menos 3 caracteres)' using errcode = '23514';
  end if;
  if p_tipo is not null and p_tipo not in ('corretiva', 'preventiva', 'implantacao', 'visita') then
    raise exception 'Tipo de OS inválido' using errcode = '22023';
  end if;
  if p_inicio is not null and p_fim is not null and p_fim < p_inicio then
    raise exception 'O fim precisa ser depois do início' using errcode = '23514';
  end if;

  v_executor := coalesce(p_executor_id, v_uid);
  if v_role in ('analista', 'prestador') and v_executor <> v_uid then
    raise exception 'Você só pode abrir OS para você mesmo' using errcode = '42501';
  end if;
  if not exists (select 1 from imobproj.project_members pm
                  where pm.project_id = p_project_id and pm.user_id = v_executor and pm.ativo
                    and pm.role in ('gerente', 'analista', 'prestador', 'diretor'))
     and not (v_executor = v_uid and v_role = 'super_admin') then
    raise exception 'O responsável precisa fazer parte da equipe do projeto' using errcode = '23514';
  end if;

  insert into imobproj.service_orders (
    id, project_id, executor_id, titulo, descricao, agendada_inicio, agendada_fim,
    status, origem, tipo, criado_por, aviso_cliente_pendente
  ) values (
    p_id, p_project_id, v_executor, btrim(p_titulo), nullif(btrim(coalesce(p_descricao, '')), ''),
    p_inicio, coalesce(p_fim, p_inicio),
    case when p_inicio is null then 'rascunho' else 'agendada' end::imobproj.os_status,
    'app', p_tipo, v_uid,
    -- TODO Fase 6: o envio do aviso no WhatsApp lê esta flag e a zera depois de enviar.
    imobproj.fn_config_bool('avisar_cliente_abertura_os', false)
  )
  returning * into v_os;
  return v_os;
end;
$$;
revoke all on function imobproj.fn_app_abrir_os(uuid, uuid, text, text, text, timestamptz, timestamptz, uuid) from public, anon;
grant execute on function imobproj.fn_app_abrir_os(uuid, uuid, text, text, text, timestamptz, timestamptz, uuid) to authenticated;

-- Pessoas que podem ser responsáveis por uma OS do projeto (para o formulário do app).
create or replace function imobproj.fn_app_responsaveis(p_project_id uuid)
returns table (id uuid, nome text, papel text)
language sql
stable
security definer
set search_path = imobproj, extensions
as $$
  select p.id, p.nome, pm.role::text
    from imobproj.project_members pm
    join imobproj.profiles p on p.id = pm.user_id
   where pm.project_id = p_project_id
     and pm.ativo
     and pm.role in ('gerente', 'analista', 'prestador', 'diretor')
     and imobproj.fn_is_member(p_project_id)
   order by p.nome;
$$;
revoke all on function imobproj.fn_app_responsaveis(uuid) from public, anon;
grant execute on function imobproj.fn_app_responsaveis(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 3) Check-out com materiais (sobrecarga; a de 6 parâmetros continua valendo)
-- -----------------------------------------------------------------------------
create or replace function imobproj.fn_app_checkout(
  p_os_id       uuid,
  p_em          timestamptz,
  p_lat         double precision,
  p_lng         double precision,
  p_relato      text,
  p_fora_escopo boolean,
  p_materiais   text
)
returns imobproj.service_orders
language plpgsql
security invoker
set search_path = imobproj, extensions
as $$
declare
  v_os imobproj.service_orders;
begin
  v_os := imobproj.fn_app_checkout(p_os_id, p_em, p_lat, p_lng, p_relato, p_fora_escopo);
  if nullif(btrim(coalesce(p_materiais, '')), '') is not null then
    update imobproj.service_orders
       set materiais = btrim(p_materiais)
     where id = p_os_id
     returning * into v_os;
  end if;
  return v_os;
end;
$$;
revoke all on function imobproj.fn_app_checkout(uuid, timestamptz, double precision, double precision, text, boolean, text) from public, anon;
grant execute on function imobproj.fn_app_checkout(uuid, timestamptz, double precision, double precision, text, boolean, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 4) Aparelhos
-- -----------------------------------------------------------------------------
create table if not exists imobproj.app_aparelhos (
  id             uuid primary key,                 -- gerado no aparelho na primeira abertura
  user_id        uuid not null references imobproj.profiles (id) on delete cascade,
  modelo         text,
  sistema        text,
  versao_app     text,
  pendencias     integer not null default 0 check (pendencias >= 0),
  ultimo_acesso  timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists app_aparelhos_user_idx on imobproj.app_aparelhos (user_id);
create index if not exists app_aparelhos_acesso_idx on imobproj.app_aparelhos (ultimo_acesso desc);

drop trigger if exists trg_app_aparelhos_updated_at on imobproj.app_aparelhos;
create trigger trg_app_aparelhos_updated_at
  before update on imobproj.app_aparelhos
  for each row execute function imobproj.set_updated_at();

alter table imobproj.app_aparelhos enable row level security;

drop policy if exists app_aparelhos_select on imobproj.app_aparelhos;
create policy app_aparelhos_select on imobproj.app_aparelhos
  for select to authenticated
  using (user_id = (select auth.uid()) or imobproj.pode('admin_app_campo', 'ver'));
-- Escrita só por fn_app_registrar_aparelho (SECURITY DEFINER).

grant select on imobproj.app_aparelhos to authenticated;
grant all on imobproj.app_aparelhos to service_role;

-- Um aparelho pertence a quem fez login por último nele.
create or replace function imobproj.fn_app_registrar_aparelho(
  p_id         uuid,
  p_modelo     text default null,
  p_sistema    text default null,
  p_versao     text default null,
  p_pendencias integer default 0
)
returns void
language plpgsql
security definer
set search_path = imobproj, extensions
as $$
begin
  if auth.uid() is null then
    raise exception 'Sem sessão' using errcode = '42501';
  end if;
  if p_id is null then
    raise exception 'Aparelho sem identificador' using errcode = '22023';
  end if;
  insert into imobproj.app_aparelhos (id, user_id, modelo, sistema, versao_app, pendencias, ultimo_acesso)
  values (p_id, auth.uid(), left(p_modelo, 120), left(p_sistema, 60), left(p_versao, 30), greatest(coalesce(p_pendencias, 0), 0), now())
  on conflict (id) do update
    set user_id       = excluded.user_id,
        modelo        = coalesce(excluded.modelo, imobproj.app_aparelhos.modelo),
        sistema       = coalesce(excluded.sistema, imobproj.app_aparelhos.sistema),
        versao_app    = coalesce(excluded.versao_app, imobproj.app_aparelhos.versao_app),
        pendencias    = excluded.pendencias,
        ultimo_acesso = now();
end;
$$;
revoke all on function imobproj.fn_app_registrar_aparelho(uuid, text, text, text, integer) from public, anon;
grant execute on function imobproj.fn_app_registrar_aparelho(uuid, text, text, text, integer) to authenticated;

-- Painel do portal: indicadores (aparelho ativo = acesso nos últimos 30 dias).
create or replace function imobproj.app_painel()
returns table (aparelhos_ativos integer, os_app_mes integer, pendencias integer, versao text)
language plpgsql
stable
security definer
set search_path = imobproj, extensions
as $$
begin
  if not imobproj.pode('admin_app_campo', 'ver') then
    raise exception 'Seu perfil não tem acesso ao painel do app' using errcode = '42501';
  end if;
  return query
  select
    (select count(*)::int from imobproj.app_aparelhos a where a.ultimo_acesso > now() - interval '30 days'),
    (select count(*)::int from imobproj.service_orders so
      where so.origem = 'app' and so.created_at >= date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'),
    (select coalesce(sum(a.pendencias), 0)::int from imobproj.app_aparelhos a where a.ultimo_acesso > now() - interval '30 days'),
    (select a.versao_app from imobproj.app_aparelhos a where a.versao_app is not null
      order by string_to_array(regexp_replace(a.versao_app, '[^0-9.]', '', 'g'), '.')::int[] desc nulls last limit 1);
end;
$$;
revoke all on function imobproj.app_painel() from public, anon;
grant execute on function imobproj.app_painel() to authenticated;

create or replace function imobproj.app_aparelhos_lista()
returns table (
  id uuid, user_id uuid, usuario text, modelo text, sistema text, versao_app text,
  ultimo_acesso timestamptz, pendencias integer, push_ativo boolean
)
language plpgsql
stable
security definer
set search_path = imobproj, extensions
as $$
begin
  if not imobproj.pode('admin_app_campo', 'ver') then
    raise exception 'Seu perfil não tem acesso ao painel do app' using errcode = '42501';
  end if;
  return query
  select a.id, a.user_id, coalesce(nullif(p.nome, ''), p.email, 'Usuário'), a.modelo, a.sistema, a.versao_app,
         a.ultimo_acesso, a.pendencias,
         exists (select 1 from imobproj.push_tokens t where t.user_id = a.user_id and t.ativo)
    from imobproj.app_aparelhos a
    join imobproj.profiles p on p.id = a.user_id
   order by a.ultimo_acesso desc;
end;
$$;
revoke all on function imobproj.app_aparelhos_lista() from public, anon;
grant execute on function imobproj.app_aparelhos_lista() to authenticated;

-- -----------------------------------------------------------------------------
-- Permissão do menu nos perfis iniciais (aditivo): gerente vê o painel.
-- -----------------------------------------------------------------------------
insert into imobproj.perfil_permissoes (perfil, menu, ver, criar, editar, excluir, aprovar)
select v.perfil, v.menu, v.ver, v.criar, v.editar, v.excluir, v.aprovar
from (values
  ('gerente', 'admin_app_campo', true, false, false, false, false)
) as v(perfil, menu, ver, criar, editar, excluir, aprovar)
where exists (select 1 from imobproj.perfis p where p.chave = v.perfil)
on conflict (perfil, menu) do nothing;
