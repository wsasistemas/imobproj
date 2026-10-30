-- =============================================================================
-- IMOBPROJ · Base de Conhecimento — banco e indexação (Fase 7 do docs/PLANO-conversas-numeros-monitor.md)
-- Migration ADITIVA e idempotente. Decisões K1–K6 aprovadas pelo Wagner em 29/10/2026.
--
-- 1) Extensão vector (pgvector 0.8 existe no ikvj; K3).
-- 2) kb_trechos: texto (já mascarado) + vetor de 768 dimensões (Gemini gemini-embedding-001).
--    RLS repete a das tabelas de origem (K2): OS → quem vê o projeto ou o executor; ata/documento → quem vê
--    o projeto; anotação → fn_pode_ver_anotacao (equipe do grupo + gerente/diretor/super admin).
-- 3) kb_fila: o que precisa ser (re)indexado. Gatilhos em service_orders, meetings, documents e wa_groups (K5).
-- 4) fn_kb_preparar: monta o texto do item (K1), mascara telefone/CPF (K4) e divide em trechos.
--    Sem trecho = o item deixou de valer (OS reprovada, ata de volta a rascunho, grupo voltou para Conversas).
-- 5) fn_kb_pegar_fila / fn_kb_gravar / fn_kb_falhou: usadas pela Edge Function kb-indexar (service_role).
-- 6) pg_cron de 1 min chama kb-indexar via pg_net quando a fila tem item.
-- 7) kb_buscar(vetor, projeto, fontes) SECURITY INVOKER: a RLS de kb_trechos decide o que volta.
-- 8) kb_perguntas: histórico por usuário com 👍/👎 (K6; a tela é a Fase 8).
-- 9) fn_openwa_segredo passa a ler também imobproj_gemini_api_key.
-- =============================================================================

create extension if not exists vector with schema extensions;

-- -----------------------------------------------------------------------------
-- 2) Trechos indexados
-- -----------------------------------------------------------------------------
create table if not exists imobproj.kb_trechos (
  id            uuid primary key default gen_random_uuid(),
  fonte         text not null check (fonte in ('os', 'ata', 'documento', 'anotacao')),
  fonte_id      uuid not null,
  ordem         integer not null default 0,
  project_id    uuid not null references imobproj.projects (id) on delete cascade,
  team_id       uuid references imobproj.teams (id) on delete set null,
  titulo        text not null,
  texto         text not null,
  vetor         extensions.vector(768) not null,
  atualizado_em timestamptz not null default now(),
  constraint kb_trechos_unq unique (fonte, fonte_id, ordem)
);
create index if not exists kb_trechos_projeto_idx on imobproj.kb_trechos (project_id, fonte);
create index if not exists kb_trechos_vetor_idx on imobproj.kb_trechos
  using hnsw (vetor extensions.vector_cosine_ops);

comment on table imobproj.kb_trechos is
  'Base de Conhecimento: trechos de OS aprovadas, atas publicadas/aprovadas, documentos aprovados/vivos e anotações da equipe, com telefone/CPF mascarados. Só a Edge Function kb-indexar grava.';

-- Quem pode ver o trecho: as mesmas regras da tabela de origem.
create or replace function imobproj.fn_kb_pode_ver(p_fonte text, p_fonte_id uuid, p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = imobproj
as $$
  select case p_fonte
    when 'os' then
      imobproj.fn_can_view_project(p_project_id)
      or exists (
        select 1 from imobproj.service_orders so
         where so.id = p_fonte_id
           and so.executor_id = auth.uid()
           and imobproj.fn_is_member(so.project_id)
      )
    when 'ata' then imobproj.fn_can_view_project(p_project_id)
    when 'documento' then imobproj.fn_can_view_project(p_project_id)
    when 'anotacao' then imobproj.fn_pode_ver_anotacao(p_fonte_id)
    else false
  end;
$$;
revoke all on function imobproj.fn_kb_pode_ver(text, uuid, uuid) from public, anon;
grant execute on function imobproj.fn_kb_pode_ver(text, uuid, uuid) to authenticated, service_role;

alter table imobproj.kb_trechos enable row level security;
drop policy if exists kb_trechos_select on imobproj.kb_trechos;
create policy kb_trechos_select on imobproj.kb_trechos
  for select to authenticated
  using (imobproj.fn_kb_pode_ver(fonte, fonte_id, project_id));
revoke all on imobproj.kb_trechos from anon;
revoke insert, update, delete on imobproj.kb_trechos from authenticated;
grant select on imobproj.kb_trechos to authenticated;
grant all on imobproj.kb_trechos to service_role;

-- -----------------------------------------------------------------------------
-- 3) Fila de indexação
-- -----------------------------------------------------------------------------
create table if not exists imobproj.kb_fila (
  fonte       text not null check (fonte in ('os', 'ata', 'documento', 'anotacao')),
  fonte_id    uuid not null,
  criado_em   timestamptz not null default now(),
  pego_em     timestamptz,                -- null = livre; preenchido quando a kb-indexar pega o item
  tentativas  integer not null default 0 check (tentativas >= 0),
  erro        text,
  primary key (fonte, fonte_id)
);
create index if not exists kb_fila_pendentes_idx on imobproj.kb_fila (criado_em) where tentativas < 5;
alter table imobproj.kb_fila enable row level security;   -- sem policy: só service_role/definer
revoke all on imobproj.kb_fila from anon, authenticated;
grant all on imobproj.kb_fila to service_role;

-- Põe (ou recoloca) o item na fila. Item re-enfileirado durante a indexação volta a ficar livre, então a
-- versão nova é indexada na próxima volta.
create or replace function imobproj.fn_kb_enfileirar(p_fonte text, p_fonte_id uuid)
returns void
language sql
security definer
set search_path = imobproj
as $$
  insert into imobproj.kb_fila (fonte, fonte_id)
  values (p_fonte, p_fonte_id)
  on conflict (fonte, fonte_id) do update
    set criado_em = now(), pego_em = null, tentativas = 0, erro = null;
$$;
revoke all on function imobproj.fn_kb_enfileirar(text, uuid) from public, anon, authenticated;

create or replace function imobproj.fn_kb_os_mudou()
returns trigger
language plpgsql
security definer
set search_path = imobproj
as $$
begin
  if tg_op = 'DELETE' then
    delete from imobproj.kb_trechos where fonte = 'os' and fonte_id = old.id;
    delete from imobproj.kb_fila where fonte = 'os' and fonte_id = old.id;
    return old;
  end if;
  if new.status = 'aprovada' or (tg_op = 'UPDATE' and old.status = 'aprovada') then
    perform imobproj.fn_kb_enfileirar('os', new.id);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_kb_os on imobproj.service_orders;
create trigger trg_kb_os
  after insert or delete or update of status, titulo, descricao, materiais, aceite_comentario, project_id
  on imobproj.service_orders
  for each row execute function imobproj.fn_kb_os_mudou();

create or replace function imobproj.fn_kb_ata_mudou()
returns trigger
language plpgsql
security definer
set search_path = imobproj
as $$
begin
  if tg_op = 'DELETE' then
    delete from imobproj.kb_trechos where fonte = 'ata' and fonte_id = old.id;
    delete from imobproj.kb_fila where fonte = 'ata' and fonte_id = old.id;
    return old;
  end if;
  if new.status in ('publicada', 'aprovada') or (tg_op = 'UPDATE' and old.status in ('publicada', 'aprovada')) then
    perform imobproj.fn_kb_enfileirar('ata', new.id);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_kb_ata on imobproj.meetings;
create trigger trg_kb_ata
  after insert or delete or update of status, titulo, data, pauta, decisoes, project_id
  on imobproj.meetings
  for each row execute function imobproj.fn_kb_ata_mudou();

create or replace function imobproj.fn_kb_documento_mudou()
returns trigger
language plpgsql
security definer
set search_path = imobproj
as $$
begin
  if tg_op = 'DELETE' then
    delete from imobproj.kb_trechos where fonte = 'documento' and fonte_id = old.id;
    delete from imobproj.kb_fila where fonte = 'documento' and fonte_id = old.id;
    return old;
  end if;
  if new.status in ('aprovado', 'vivo') or (tg_op = 'UPDATE' and old.status in ('aprovado', 'vivo')) then
    perform imobproj.fn_kb_enfileirar('documento', new.id);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_kb_documento on imobproj.documents;
create trigger trg_kb_documento
  after insert or delete or update of status, titulo, versao, conteudo, project_id
  on imobproj.documents
  for each row execute function imobproj.fn_kb_documento_mudou();

-- Grupo entra em Anotações (indexa) ou volta para Conversas (sai da base).
create or replace function imobproj.fn_kb_grupo_mudou()
returns trigger
language plpgsql
security definer
set search_path = imobproj
as $$
begin
  if tg_op = 'DELETE' then
    delete from imobproj.kb_trechos where fonte = 'anotacao' and fonte_id = old.id;
    delete from imobproj.kb_fila where fonte = 'anotacao' and fonte_id = old.id;
    return old;
  end if;
  if new.anotacao_desde is not null or old.anotacao_desde is not null then
    perform imobproj.fn_kb_enfileirar('anotacao', new.id);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_kb_grupo on imobproj.wa_groups;
create trigger trg_kb_grupo
  after delete or update of anotacao_desde, team_id, nome, project_id
  on imobproj.wa_groups
  for each row execute function imobproj.fn_kb_grupo_mudou();

-- -----------------------------------------------------------------------------
-- 4) Texto de cada item (K1), mascarado (K4) e dividido em trechos
-- -----------------------------------------------------------------------------
-- CPF (com ou sem pontuação) e telefone brasileiro (com ou sem +55/DDD) viram marcadores.
create or replace function imobproj.fn_kb_mascarar(p_texto text)
returns text
language sql
immutable
set search_path = imobproj
as $$
  select regexp_replace(
           regexp_replace(
             coalesce(p_texto, ''),
             '\m\d{3}\.?\d{3}\.?\d{3}-?\d{2}\M', '[CPF]', 'g'),
           '(\+?55[\s.-]?)?\(?\m\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}\M', '[telefone]', 'g');
$$;

-- Junta as linhas em trechos de até p_max caracteres (linha maior que p_max é cortada).
create or replace function imobproj.fn_kb_fatiar(p_texto text, p_max integer default 2500)
returns setof text
language plpgsql
immutable
set search_path = imobproj
as $$
declare
  v_linha text;
  v_atual text := '';
begin
  foreach v_linha in array regexp_split_to_array(coalesce(p_texto, ''), '\n') loop
    v_linha := left(btrim(v_linha), p_max);
    continue when v_linha = '';
    if length(v_atual) > 0 and length(v_atual) + 1 + length(v_linha) > p_max then
      return next v_atual;
      v_atual := '';
    end if;
    v_atual := case when v_atual = '' then v_linha else v_atual || E'\n' || v_linha end;
  end loop;
  if v_atual <> '' then
    return next v_atual;
  end if;
end;
$$;

-- Itens de um array jsonb de strings, um por linha com marcador.
create or replace function imobproj.fn_kb_itens(p_itens jsonb, p_prefixo text default '- ')
returns text
language sql
immutable
set search_path = imobproj
as $$
  select coalesce(string_agg(p_prefixo || btrim(i.valor), E'\n' order by i.n), '')
    from jsonb_array_elements_text(case when jsonb_typeof(p_itens) = 'array' then p_itens else '[]'::jsonb end)
         with ordinality as i(valor, n)
   where btrim(i.valor) <> '';
$$;

-- Trechos que o item deve ter hoje. Conjunto vazio = remover da base.
create or replace function imobproj.fn_kb_preparar(p_fonte text, p_fonte_id uuid)
returns table (ordem integer, project_id uuid, team_id uuid, titulo text, texto text)
language plpgsql
stable
security definer
set search_path = imobproj
as $$
declare
  v_proj   uuid;
  v_team   uuid;
  v_titulo text;
  v_corpo  text;
begin
  if p_fonte = 'os' then
    select so.project_id,
           'OS #' || so.numero || ' — ' || so.titulo,
           concat_ws(E'\n',
             'Ordem de Serviço #' || so.numero || ': ' || so.titulo,
             'Projeto: ' || p.codigo || ' — ' || p.nome,
             nullif('Executor: ' || coalesce(ex.nome, ''), 'Executor: '),
             nullif('Aprovada em: ' || coalesce(to_char(so.aceite_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'), ''), 'Aprovada em: '),
             nullif('Descrição: ' || coalesce(btrim(so.descricao), ''), 'Descrição: '),
             nullif('Materiais: ' || coalesce(btrim(so.materiais), ''), 'Materiais: '),
             nullif('Comentário do aceite: ' || coalesce(btrim(so.aceite_comentario), ''), 'Comentário do aceite: '))
      into v_proj, v_titulo, v_corpo
      from imobproj.service_orders so
      join imobproj.projects p on p.id = so.project_id
      left join imobproj.profiles ex on ex.id = so.executor_id
     where so.id = p_fonte_id and so.status = 'aprovada';

  elsif p_fonte = 'ata' then
    select m.project_id,
           'Ata #' || m.numero || ' — ' || m.titulo,
           concat_ws(E'\n',
             'Ata de reunião #' || m.numero || ': ' || m.titulo,
             'Projeto: ' || p.codigo || ' — ' || p.nome,
             'Data: ' || to_char(m.data, 'DD/MM/YYYY'),
             nullif('Pauta:' || E'\n' || imobproj.fn_kb_itens(m.pauta), 'Pauta:' || E'\n'),
             nullif('Decisões:' || E'\n' || imobproj.fn_kb_itens(m.decisoes), 'Decisões:' || E'\n'))
      into v_proj, v_titulo, v_corpo
      from imobproj.meetings m
      join imobproj.projects p on p.id = m.project_id
     where m.id = p_fonte_id and m.status in ('publicada', 'aprovada');

  elsif p_fonte = 'documento' then
    -- Só conteúdo digitado (etapas do processo); documento só com arquivo anexo fica fora (K1).
    select d.project_id,
           d.titulo || ' (v' || d.versao || ')',
           case when jsonb_typeof(d.conteudo -> 'etapas') = 'array' and jsonb_array_length(d.conteudo -> 'etapas') > 0 then
             concat_ws(E'\n',
               'Documento: ' || d.titulo || ' — versão ' || d.versao || ' (' || d.tipo::text || ', ' || d.status::text || ')',
               'Projeto: ' || p.codigo || ' — ' || p.nome,
               'Etapas:',
               (select string_agg(
                         e.n || '. ' || btrim(coalesce(e.etapa ->> 'titulo', ''))
                           || coalesce(nullif(' — responsável: ' || btrim(coalesce(e.etapa ->> 'responsavel', '')), ' — responsável: '), ''),
                         E'\n' order by e.n)
                  from jsonb_array_elements(d.conteudo -> 'etapas') with ordinality as e(etapa, n)),
               nullif('Decisão: ' || btrim(coalesce(d.conteudo #>> '{decisao,pergunta}', '')), 'Decisão: '))
           end
      into v_proj, v_titulo, v_corpo
      from imobproj.documents d
      join imobproj.projects p on p.id = d.project_id
     where d.id = p_fonte_id and d.status in ('aprovado', 'vivo');

  elsif p_fonte = 'anotacao' then
    select g.project_id, g.team_id,
           'Anotações — ' || g.nome || coalesce(' (' || t.nome || ')', ''),
           concat_ws(E'\n',
             'Anotações da equipe ' || coalesce(t.nome, g.equipe) || ', grupo ' || g.nome,
             'Projeto: ' || p.codigo || ' — ' || p.nome,
             (select string_agg(
                       to_char(wm.created_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') || ' '
                         || coalesce(pa.nome, 'Participante') || ': ' || replace(btrim(wm.body), E'\n', ' '),
                       E'\n' order by wm.created_at)
                from imobproj.wa_messages wm
                left join imobproj.profiles pa on pa.id = wm.author_user_id
               where wm.group_id = g.id and nullif(btrim(wm.body), '') is not null))
      into v_proj, v_team, v_titulo, v_corpo
      from imobproj.wa_groups g
      join imobproj.projects p on p.id = g.project_id
      left join imobproj.teams t on t.id = g.team_id
     where g.id = p_fonte_id and g.anotacao_desde is not null;
  end if;

  if v_proj is null or nullif(btrim(coalesce(v_corpo, '')), '') is null then
    return;
  end if;

  return query
    select (row_number() over () - 1)::integer, v_proj, v_team, imobproj.fn_kb_mascarar(v_titulo), f.trecho
      from imobproj.fn_kb_fatiar(imobproj.fn_kb_mascarar(v_corpo)) as f(trecho);
end;
$$;
revoke all on function imobproj.fn_kb_preparar(text, uuid) from public, anon, authenticated;
grant execute on function imobproj.fn_kb_preparar(text, uuid) to service_role;

-- -----------------------------------------------------------------------------
-- 5) Usadas pela kb-indexar (service_role)
-- -----------------------------------------------------------------------------
-- Pega até p_limite itens livres (ou presos há mais de 5 min) e devolve com os trechos que cada um deve ter.
create or replace function imobproj.fn_kb_pegar_fila(p_limite integer default 20)
returns table (fonte text, fonte_id uuid, trechos jsonb)
language plpgsql
security definer
set search_path = imobproj
as $$
begin
  return query
  with pegos as (
    update imobproj.kb_fila f
       set pego_em = now(), tentativas = f.tentativas + 1
     where (f.fonte, f.fonte_id) in (
             select q.fonte, q.fonte_id
               from imobproj.kb_fila q
              where q.tentativas < 5
                and (q.pego_em is null or q.pego_em < now() - interval '5 minutes')
              order by q.criado_em
              limit greatest(p_limite, 1)
              for update skip locked)
    returning f.fonte, f.fonte_id
  )
  select p.fonte, p.fonte_id,
         coalesce((select jsonb_agg(jsonb_build_object(
                             'ordem', t.ordem, 'project_id', t.project_id, 'team_id', t.team_id,
                             'titulo', t.titulo, 'texto', t.texto) order by t.ordem)
                     from imobproj.fn_kb_preparar(p.fonte, p.fonte_id) t), '[]'::jsonb)
    from pegos p;
end;
$$;
revoke all on function imobproj.fn_kb_pegar_fila(integer) from public, anon, authenticated;
grant execute on function imobproj.fn_kb_pegar_fila(integer) to service_role;

-- Troca os trechos do item pelos novos (lista vazia = remove da base) e tira da fila, a menos que tenha
-- sido re-enfileirado enquanto era indexado (pego_em voltou a null).
-- p_trechos: [{ordem, project_id, team_id, titulo, texto, vetor: [768 números]}]
create or replace function imobproj.fn_kb_gravar(p_fonte text, p_fonte_id uuid, p_trechos jsonb)
returns integer
language plpgsql
security definer
set search_path = imobproj, extensions
as $$
declare
  v_qtd integer;
begin
  delete from imobproj.kb_trechos where fonte = p_fonte and fonte_id = p_fonte_id;
  insert into imobproj.kb_trechos (fonte, fonte_id, ordem, project_id, team_id, titulo, texto, vetor)
  select p_fonte, p_fonte_id, (t ->> 'ordem')::integer, (t ->> 'project_id')::uuid, nullif(t ->> 'team_id', '')::uuid,
         t ->> 'titulo', t ->> 'texto', (t ->> 'vetor')::extensions.vector
    from jsonb_array_elements(coalesce(p_trechos, '[]'::jsonb)) t;
  get diagnostics v_qtd = row_count;
  delete from imobproj.kb_fila where fonte = p_fonte and fonte_id = p_fonte_id and pego_em is not null;
  return v_qtd;
end;
$$;
revoke all on function imobproj.fn_kb_gravar(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function imobproj.fn_kb_gravar(text, uuid, jsonb) to service_role;

create or replace function imobproj.fn_kb_falhou(p_fonte text, p_fonte_id uuid, p_erro text)
returns void
language sql
security definer
set search_path = imobproj
as $$
  update imobproj.kb_fila
     set erro = left(p_erro, 1000), pego_em = now() - interval '4 minutes'   -- nova tentativa em ~1 min
   where fonte = p_fonte and fonte_id = p_fonte_id and pego_em is not null;
$$;
revoke all on function imobproj.fn_kb_falhou(text, uuid, text) from public, anon, authenticated;
grant execute on function imobproj.fn_kb_falhou(text, uuid, text) to service_role;

-- -----------------------------------------------------------------------------
-- 6) Disparo da kb-indexar (pg_cron 1 min → pg_net), só quando há item na fila
-- -----------------------------------------------------------------------------
create or replace function imobproj.fn_kb_disparar()
returns boolean
language plpgsql
security definer
set search_path = imobproj, extensions
as $$
declare
  v_url   text;
  v_chave text;
  v_cron  text;
begin
  if not exists (
    select 1 from imobproj.kb_fila f
     where f.tentativas < 5 and (f.pego_em is null or f.pego_em < now() - interval '5 minutes')
  ) then
    return false;
  end if;
  select d.decrypted_secret into v_url from vault.decrypted_secrets d where d.name = 'imobproj_openwa_functions_url';
  select d.decrypted_secret into v_chave from vault.decrypted_secrets d where d.name = 'imobproj_openwa_anon_key';
  select d.decrypted_secret into v_cron from vault.decrypted_secrets d where d.name = 'imobproj_openwa_cron_secret';
  if v_url is null or v_chave is null or v_cron is null then
    return false;   -- sem a base das Edge Functions no Vault: fica na fila
  end if;
  perform net.http_post(
    url := rtrim(v_url, '/') || '/kb-indexar',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_chave,
      'apikey', v_chave,
      'x-openwa-cron', v_cron
    ),
    timeout_milliseconds := 55000
  );
  return true;
end;
$$;
revoke all on function imobproj.fn_kb_disparar() from public, anon, authenticated;
grant execute on function imobproj.fn_kb_disparar() to service_role;

do $$
begin
  perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'imobproj-kb-indexar';
  perform cron.schedule('imobproj-kb-indexar', '* * * * *', 'select imobproj.fn_kb_disparar();');
end
$$;

-- -----------------------------------------------------------------------------
-- 7) Busca (K2: SECURITY INVOKER — a RLS de kb_trechos filtra pelo usuário)
-- -----------------------------------------------------------------------------
create or replace function imobproj.kb_buscar(
  p_pergunta_vetor extensions.vector,
  p_projeto        uuid default null,
  p_fontes         text[] default null,
  p_limite         integer default 8
)
returns table (
  id          uuid,
  fonte       text,
  fonte_id    uuid,
  project_id  uuid,
  team_id     uuid,
  titulo      text,
  texto       text,
  similaridade double precision
)
language sql
stable
security invoker
set search_path = imobproj, extensions
as $$
  select t.id, t.fonte, t.fonte_id, t.project_id, t.team_id, t.titulo, t.texto,
         1 - (t.vetor <=> p_pergunta_vetor) as similaridade
    from imobproj.kb_trechos t
   where (p_projeto is null or t.project_id = p_projeto)
     and (p_fontes is null or cardinality(p_fontes) = 0 or t.fonte = any (p_fontes))
   order by t.vetor <=> p_pergunta_vetor
   limit least(greatest(coalesce(p_limite, 8), 1), 30);
$$;
revoke all on function imobproj.kb_buscar(extensions.vector, uuid, text[], integer) from public, anon;
grant execute on function imobproj.kb_buscar(extensions.vector, uuid, text[], integer) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 8) Histórico de perguntas (K6)
-- -----------------------------------------------------------------------------
create table if not exists imobproj.kb_perguntas (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references imobproj.profiles (id) on delete cascade,
  project_id  uuid references imobproj.projects (id) on delete set null,
  fontes_filtro text[],
  pergunta    text not null check (length(btrim(pergunta)) between 1 and 2000),
  resposta    text,
  fontes      jsonb not null default '[]'::jsonb,   -- [{n, fonte, fonte_id, project_id, titulo}]
  avaliacao   smallint check (avaliacao in (-1, 1)),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists kb_perguntas_user_idx on imobproj.kb_perguntas (user_id, created_at desc);
create index if not exists kb_perguntas_projeto_idx on imobproj.kb_perguntas (project_id);

alter table imobproj.kb_perguntas enable row level security;
drop policy if exists kb_perguntas_select on imobproj.kb_perguntas;
create policy kb_perguntas_select on imobproj.kb_perguntas
  for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists kb_perguntas_update on imobproj.kb_perguntas;
create policy kb_perguntas_update on imobproj.kb_perguntas
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on imobproj.kb_perguntas from anon;
revoke insert, update, delete on imobproj.kb_perguntas from authenticated;
grant select on imobproj.kb_perguntas to authenticated;
grant update (avaliacao) on imobproj.kb_perguntas to authenticated;   -- só o 👍/👎; a resposta vem da kb-perguntar
grant all on imobproj.kb_perguntas to service_role;

-- -----------------------------------------------------------------------------
-- 9) Chave do Gemini no Vault (lida só pela service_role)
-- -----------------------------------------------------------------------------
create or replace function imobproj.fn_openwa_segredo(p_nome text)
returns text
language plpgsql
stable
security definer
set search_path = imobproj, vault
as $$
declare
  v_valor text;
begin
  -- service_role (PostgREST) ou SQL direto sem JWT (cron/psql). anon/authenticated nunca.
  if not (coalesce(auth.role(), '') = 'service_role'
          or (auth.uid() is null and coalesce(auth.role(), '') not in ('anon', 'authenticated'))) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if p_nome not in ('imobproj_openwa_api_key', 'imobproj_openwa_webhook_secret', 'imobproj_openwa_functions_url',
                    'imobproj_openwa_anon_key', 'imobproj_openwa_cron_secret', 'imobproj_gemini_api_key') then
    raise exception 'Segredo desconhecido: %', p_nome using errcode = '22023';
  end if;
  select d.decrypted_secret into v_valor from vault.decrypted_secrets d where d.name = p_nome;
  return v_valor;
end;
$$;
revoke all on function imobproj.fn_openwa_segredo(text) from public, anon, authenticated;
grant execute on function imobproj.fn_openwa_segredo(text) to service_role;

-- -----------------------------------------------------------------------------
-- Carga inicial: tudo o que já vale entra na fila
-- -----------------------------------------------------------------------------
insert into imobproj.kb_fila (fonte, fonte_id)
select 'os', id from imobproj.service_orders where status = 'aprovada'
union all
select 'ata', id from imobproj.meetings where status in ('publicada', 'aprovada')
union all
select 'documento', id from imobproj.documents where status in ('aprovado', 'vivo')
union all
select 'anotacao', id from imobproj.wa_groups where anotacao_desde is not null
on conflict (fonte, fonte_id) do nothing;
