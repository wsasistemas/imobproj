-- =============================================================================
-- IMOBPROJ — Fase 3: Setores, números e fila (docs/PLANO-implantacao-final.md)
-- Migration ADITIVA: só create ... if not exists / add column if not exists.
--
-- Setor de atendimento = dono de um ou mais números (sessões OpenWA em wa_sessions).
-- Cada conversa (wa_groups) passa a ter setor_id: a conversa nova entra na fila do setor dono do número
-- que recebeu a mensagem (trigger no insert + imobproj.fn_rotear_conversa(), chamada pelo openwa-webhook).
-- Número sem setor: setor_id fica nulo e o comportamento continua o de antes.
-- =============================================================================

create table if not exists imobproj.setores (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  gestor_id   uuid references imobproj.profiles (id) on delete set null,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists setores_nome_unq on imobproj.setores (lower(nome));

-- Um número (sessão) pertence a um só setor.
create table if not exists imobproj.setor_numeros (
  session_id  uuid primary key references imobproj.wa_sessions (id) on delete cascade,
  setor_id    uuid not null references imobproj.setores (id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index if not exists setor_numeros_setor_idx on imobproj.setor_numeros (setor_id);

-- Horário por dia da semana (0 = domingo … 6 = sábado), no fuso do setor.
create table if not exists imobproj.setor_horarios (
  setor_id    uuid not null references imobproj.setores (id) on delete cascade,
  dia_semana  smallint not null check (dia_semana between 0 and 6),
  aberto      boolean not null default true,
  abre        time not null default '08:00',
  fecha       time not null default '18:00',
  primary key (setor_id, dia_semana),
  constraint setor_horarios_intervalo check (not aberto or fecha > abre)
);

create table if not exists imobproj.setor_feriados (
  setor_id    uuid not null references imobproj.setores (id) on delete cascade,
  data        date not null,
  descricao   text not null default '',
  primary key (setor_id, data)
);

-- Regras da fila (uma linha por setor).
create table if not exists imobproj.setor_regras (
  setor_id                  uuid primary key references imobproj.setores (id) on delete cascade,
  fuso                      text not null default 'America/Sao_Paulo',
  limite_por_atendente      integer not null default 5 check (limite_por_atendente between 1 and 50),
  distribuicao_automatica   boolean not null default true,
  devolver_sem_resposta_min integer not null default 10 check (devolver_sem_resposta_min between 1 and 1440),
  encerrar_inatividade_min  integer not null default 120 check (encerrar_inatividade_min between 5 and 10080),
  pesquisa_satisfacao       boolean not null default true,
  updated_at                timestamptz not null default now()
);

-- Mensagens automáticas. Variáveis: {cliente}, {ticket}, {setor}, {atendente}.
create table if not exists imobproj.setor_mensagens (
  setor_id    uuid not null references imobproj.setores (id) on delete cascade,
  tipo        text not null check (tipo in ('boas_vindas', 'fora_horario', 'encerramento')),
  texto       text not null default '',
  ativo       boolean not null default true,
  updated_at  timestamptz not null default now(),
  primary key (setor_id, tipo)
);

-- Equipe pertence a um setor (a coluna texto teams.setor da Fase 1 continua, para compatibilidade).
alter table imobproj.teams add column if not exists setor_id uuid references imobproj.setores (id) on delete set null;
create index if not exists teams_setor_idx on imobproj.teams (setor_id);

-- Conversa → fila do setor.
alter table imobproj.wa_groups add column if not exists setor_id uuid references imobproj.setores (id) on delete set null;
create index if not exists wa_groups_setor_idx on imobproj.wa_groups (setor_id);

-- updated_at automático
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_setores_updated_at') then
    create trigger trg_setores_updated_at before update on imobproj.setores
      for each row execute function imobproj.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_setor_regras_updated_at') then
    create trigger trg_setor_regras_updated_at before update on imobproj.setor_regras
      for each row execute function imobproj.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_setor_mensagens_updated_at') then
    create trigger trg_setor_mensagens_updated_at before update on imobproj.setor_mensagens
      for each row execute function imobproj.set_updated_at();
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Setor novo nasce com horário comercial, regras e mensagens padrão.
-- -----------------------------------------------------------------------------
create or replace function imobproj.fn_setor_padroes()
returns trigger
language plpgsql
security definer
set search_path = imobproj
as $$
begin
  insert into imobproj.setor_horarios (setor_id, dia_semana, aberto, abre, fecha)
  select new.id, d, d between 1 and 5, '08:00', case when d = 6 then '12:00'::time else '18:00'::time end
    from generate_series(0, 6) as d
  on conflict do nothing;
  insert into imobproj.setor_regras (setor_id) values (new.id) on conflict do nothing;
  insert into imobproj.setor_mensagens (setor_id, tipo, texto) values
    (new.id, 'boas_vindas',  'Olá, {cliente}! Você falou com o setor {setor}. Em instantes alguém da equipe vai te atender.'),
    (new.id, 'fora_horario', 'Nosso atendimento está fechado agora. Sua mensagem ficou registrada no ticket {ticket} e responderemos no próximo horário.'),
    (new.id, 'encerramento', 'Atendimento encerrado. Obrigado pelo contato, {cliente}!')
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists trg_setores_padroes on imobproj.setores;
create trigger trg_setores_padroes after insert on imobproj.setores
  for each row execute function imobproj.fn_setor_padroes();

-- -----------------------------------------------------------------------------
-- Roteamento
-- -----------------------------------------------------------------------------
-- Setor (ativo) dono do número/sessão; null quando o número não tem setor.
create or replace function imobproj.fn_setor_do_numero(p_session_id uuid)
returns uuid
language sql
stable
security definer
set search_path = imobproj
as $$
  select n.setor_id
    from imobproj.setor_numeros n
    join imobproj.setores s on s.id = n.setor_id and s.ativo
   where n.session_id = p_session_id;
$$;

-- Conversa nova: entra na fila do setor do número (se ela ainda não tem setor).
create or replace function imobproj.fn_wa_groups_setor()
returns trigger
language plpgsql
security definer
set search_path = imobproj
as $$
begin
  if new.setor_id is null and new.session_id is not null then
    new.setor_id := imobproj.fn_setor_do_numero(new.session_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_wa_groups_setor on imobproj.wa_groups;
create trigger trg_wa_groups_setor before insert on imobproj.wa_groups
  for each row execute function imobproj.fn_wa_groups_setor();

-- Chamada pelo openwa-webhook a cada mensagem: conversa sem setor recebe o do número; devolve o setor final.
-- Só service_role (a Edge Function); não muda conversa que já tem setor.
create or replace function imobproj.fn_rotear_conversa(p_group_id uuid, p_session_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = imobproj
as $$
declare
  v_setor uuid;
  v_sessao uuid;
begin
  select setor_id, coalesce(p_session_id, session_id) into v_setor, v_sessao
    from imobproj.wa_groups where id = p_group_id;
  if not found then
    return null;
  end if;
  if v_setor is null and v_sessao is not null then
    v_setor := imobproj.fn_setor_do_numero(v_sessao);
    if v_setor is not null then
      update imobproj.wa_groups set setor_id = v_setor where id = p_group_id and setor_id is null;
    end if;
  end if;
  return v_setor;
end;
$$;

-- O setor está aberto no instante p_quando? (horário do dia no fuso do setor, menos feriados)
create or replace function imobproj.fn_setor_aberto(p_setor_id uuid, p_quando timestamptz default now())
returns boolean
language sql
stable
security definer
set search_path = imobproj
as $$
  with local as (
    select (p_quando at time zone coalesce(r.fuso, 'America/Sao_Paulo')) as ts
      from imobproj.setores s
      left join imobproj.setor_regras r on r.setor_id = s.id
     where s.id = p_setor_id
  )
  select coalesce((
    select h.aberto and l.ts::time >= h.abre and l.ts::time < h.fecha
           and not exists (select 1 from imobproj.setor_feriados f where f.setor_id = p_setor_id and f.data = l.ts::date)
      from local l
      join imobproj.setor_horarios h on h.setor_id = p_setor_id and h.dia_semana = extract(dow from l.ts)::smallint
  ), false);
$$;

-- Números (sessões) para a tela Setores e números. wa_sessions só é legível pelo super admin (RLS);
-- quem tem "ver" em config_setores enxerga número, status e projeto — nunca a URL nem o segredo.
create or replace function imobproj.sessoes_para_setor()
returns table (id uuid, numero text, status text, projeto text, setor_id uuid)
language sql
stable
security definer
set search_path = imobproj
as $$
  select ws.id, ws.numero, ws.status::text, coalesce(p.codigo || ' · ' || p.nome, p.nome), n.setor_id
    from imobproj.wa_sessions ws
    left join imobproj.projects p on p.id = ws.project_id
    left join imobproj.setor_numeros n on n.session_id = ws.id
   where imobproj.pode('config_setores', 'ver')
   order by ws.numero;
$$;

grant execute on function imobproj.fn_setor_do_numero(uuid) to authenticated, service_role;
grant execute on function imobproj.fn_setor_aberto(uuid, timestamptz) to authenticated, service_role;
grant execute on function imobproj.sessoes_para_setor() to authenticated, service_role;
revoke execute on function imobproj.fn_rotear_conversa(uuid, uuid) from public, anon, authenticated;
grant execute on function imobproj.fn_rotear_conversa(uuid, uuid) to service_role;

-- -----------------------------------------------------------------------------
-- RLS e grants
-- -----------------------------------------------------------------------------
alter table imobproj.setores          enable row level security;
alter table imobproj.setor_numeros    enable row level security;
alter table imobproj.setor_horarios   enable row level security;
alter table imobproj.setor_feriados   enable row level security;
alter table imobproj.setor_regras     enable row level security;
alter table imobproj.setor_mensagens  enable row level security;

grant select, insert, update, delete on
  imobproj.setores, imobproj.setor_numeros, imobproj.setor_horarios,
  imobproj.setor_feriados, imobproj.setor_regras, imobproj.setor_mensagens to authenticated;
grant all on
  imobproj.setores, imobproj.setor_numeros, imobproj.setor_horarios,
  imobproj.setor_feriados, imobproj.setor_regras, imobproj.setor_mensagens to service_role;

-- Leitura: todos os logados (o nome do setor aparece em Equipes, Conversas e no Monitor).
drop policy if exists setores_select on imobproj.setores;
create policy setores_select on imobproj.setores for select to authenticated using (true);
drop policy if exists setores_ins on imobproj.setores;
create policy setores_ins on imobproj.setores for insert to authenticated
  with check (imobproj.pode('config_setores', 'criar'));
drop policy if exists setores_upd on imobproj.setores;
create policy setores_upd on imobproj.setores for update to authenticated
  using (imobproj.pode('config_setores', 'editar')) with check (imobproj.pode('config_setores', 'editar'));
drop policy if exists setores_del on imobproj.setores;
create policy setores_del on imobproj.setores for delete to authenticated
  using (imobproj.pode('config_setores', 'excluir'));

drop policy if exists setor_numeros_select on imobproj.setor_numeros;
create policy setor_numeros_select on imobproj.setor_numeros for select to authenticated using (true);
drop policy if exists setor_numeros_write on imobproj.setor_numeros;
create policy setor_numeros_write on imobproj.setor_numeros for all to authenticated
  using (imobproj.pode('config_setores', 'editar')) with check (imobproj.pode('config_setores', 'editar'));

drop policy if exists setor_horarios_select on imobproj.setor_horarios;
create policy setor_horarios_select on imobproj.setor_horarios for select to authenticated using (true);
drop policy if exists setor_horarios_write on imobproj.setor_horarios;
create policy setor_horarios_write on imobproj.setor_horarios for all to authenticated
  using (imobproj.pode('config_fila', 'editar')) with check (imobproj.pode('config_fila', 'editar'));

drop policy if exists setor_feriados_select on imobproj.setor_feriados;
create policy setor_feriados_select on imobproj.setor_feriados for select to authenticated using (true);
drop policy if exists setor_feriados_write on imobproj.setor_feriados;
create policy setor_feriados_write on imobproj.setor_feriados for all to authenticated
  using (imobproj.pode('config_fila', 'editar')) with check (imobproj.pode('config_fila', 'editar'));

drop policy if exists setor_regras_select on imobproj.setor_regras;
create policy setor_regras_select on imobproj.setor_regras for select to authenticated using (true);
drop policy if exists setor_regras_write on imobproj.setor_regras;
create policy setor_regras_write on imobproj.setor_regras for all to authenticated
  using (imobproj.pode('config_fila', 'editar')) with check (imobproj.pode('config_fila', 'editar'));

drop policy if exists setor_mensagens_select on imobproj.setor_mensagens;
create policy setor_mensagens_select on imobproj.setor_mensagens for select to authenticated using (true);
drop policy if exists setor_mensagens_write on imobproj.setor_mensagens;
create policy setor_mensagens_write on imobproj.setor_mensagens for all to authenticated
  using (imobproj.pode('config_fila', 'editar')) with check (imobproj.pode('config_fila', 'editar'));

-- -----------------------------------------------------------------------------
-- Permissões dos menus novos nos perfis iniciais (aditivo): gerente sim; os demais, não.
-- O super admin passa em imobproj.pode() sem precisar de linha.
-- -----------------------------------------------------------------------------
insert into imobproj.perfil_permissoes (perfil, menu, ver, criar, editar, excluir, aprovar)
select v.perfil, v.menu, v.ver, v.criar, v.editar, v.excluir, v.aprovar
from (values
  ('gerente', 'config_setores', true, true,  true, false, false),
  ('gerente', 'config_fila',    true, false, true, false, false)
) as v(perfil, menu, ver, criar, editar, excluir, aprovar)
where exists (select 1 from imobproj.perfis p where p.chave = v.perfil)
on conflict (perfil, menu) do nothing;
