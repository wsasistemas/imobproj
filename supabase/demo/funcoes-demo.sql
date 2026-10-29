-- =============================================================================
-- IMOBPROJ · funções da VERSÃO DEMO. Só para o banco de demonstração.
-- Fica fora de supabase/migrations de propósito: o scripts/migrar-nuvem.sh nunca leva isto à produção.
-- Aplicado por scripts/publicar-demo.sh a cada publicação (e, para teste, no banco local).
-- =============================================================================

-- Seed de demonstração guardado no próprio banco, com a senha já trocada pelo script de publicação.
create table if not exists imobproj._demo_seed (
  id            integer primary key default 1 check (id = 1),
  sql           text not null,
  atualizado_em timestamptz not null default now()
);
alter table imobproj._demo_seed enable row level security;
revoke all on imobproj._demo_seed from anon, authenticated;

-- Retrato dos perfis e permissões como as migrations deixaram. Cada publicação só ACRESCENTA o que
-- migrations novas criaram (on conflict do nothing): o que alguém mudou na demo não vira "estado inicial".
create table if not exists imobproj._demo_perfis (like imobproj.perfis including defaults including indexes);
create table if not exists imobproj._demo_perfil_permissoes (like imobproj.perfil_permissoes including defaults including indexes);
alter table imobproj._demo_perfis enable row level security;
alter table imobproj._demo_perfil_permissoes enable row level security;
revoke all on imobproj._demo_perfis, imobproj._demo_perfil_permissoes from anon, authenticated;
insert into imobproj._demo_perfis select * from imobproj.perfis on conflict do nothing;
insert into imobproj._demo_perfil_permissoes select * from imobproj.perfil_permissoes on conflict do nothing;

-- Apaga todos os dados do IMOBPROJ e recria os fictícios a partir de imobproj._demo_seed.
-- Perfis e permissões voltam ao retrato acima; configurações e OpenWA voltam ao padrão das migrations
-- (o seed ajusta as configurações). Tabelas internas (nome começando com "_") e o conteúdo dos tutoriais
-- (tr_trilhas, tr_modulos, tr_passos...) ficam intactos; o progresso de cada pessoa no treinamento é apagado.
-- Quem chama precisa ser o super admin da demo; sem usuário (script com a role postgres), passa.
create or replace function imobproj.demo_restaurar()
returns void
language plpgsql
security definer
set search_path = imobproj, extensions, public
as $$
declare
  v_seed    text;
  v_tabelas text;
begin
  if auth.uid() is not null and not exists (
    select 1 from imobproj.profiles where id = auth.uid() and is_super_admin
  ) then
    raise exception 'Só o super admin da demonstração pode restaurar os dados.' using errcode = '42501';
  end if;

  select sql into v_seed from imobproj._demo_seed where id = 1;
  if v_seed is null then
    raise exception 'Seed da demonstração não carregado. Rode scripts/publicar-demo.sh.';
  end if;

  -- Daqui em diante o seed roda como o script de publicação (sem usuário logado): as travas por usuário
  -- (ex.: só super admin altera is_super_admin) não podem barrar a recriação. Vale só até o fim da transação.
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);

  select string_agg(format('imobproj.%I', c.relname), ', ')
    into v_tabelas
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'imobproj'
     and c.relkind in ('r', 'p')
     and c.relname not like '\_%'
     -- Conteúdo do Centro de Treinamento (carga da migration 20261031000700): fica. O progresso (tr_progresso)
     -- sai junto com os perfis das pessoas (on delete cascade / truncate cascade).
     and c.relname not in ('tr_trilhas', 'tr_trilha_perfis', 'tr_modulos', 'tr_trilha_modulos', 'tr_passos');

  execute 'truncate ' || v_tabelas || ' restart identity cascade';

  insert into imobproj.perfis select * from imobproj._demo_perfis;
  insert into imobproj.perfil_permissoes select * from imobproj._demo_perfil_permissoes;
  insert into imobproj.configuracoes (id) values (true) on conflict (id) do nothing;
  insert into imobproj.openwa_config (id) values (true) on conflict (id) do nothing;

  -- Usuários fictícios: saem do Auth (sessões incluídas) e voltam pelo seed com os mesmos ids.
  delete from auth.users where raw_user_meta_data ->> 'sistema' = 'imobproj';

  execute v_seed;
end;
$$;

revoke all on function imobproj.demo_restaurar() from public, anon;
grant execute on function imobproj.demo_restaurar() to authenticated;
