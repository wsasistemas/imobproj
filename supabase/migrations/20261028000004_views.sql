-- =============================================================================
-- IMOBPROJ · 004 · Views de avanço físico
--
-- Regra do PRD: avanço = horas de OS aprovadas ÷ horas orçadas na EAP.
--
-- Formato escolhido: TRÊS views (todas security_invoker = true, ou seja,
-- respeitam a RLS de quem consulta):
--   * v_wbs_progress     -> uma linha por item da EAP (coluna nivel = 'fase'|'item'),
--                           já agregando a subárvore do item;
--   * v_fase_progress    -> recorte de v_wbs_progress só com as fases (is_fase);
--   * v_project_progress -> uma linha por projeto.
--
-- Critérios:
--   * horas orçadas contam apenas nas FOLHAS da árvore (itens sem filhos), para
--     não somar duas vezes quando a fase também tem horas preenchidas;
--   * horas aprovadas = soma de service_orders.horas com status 'aprovada' e
--     fora_escopo = false, de OS ligadas ao item ou a qualquer descendente;
--   * horas apontadas = OS em_execucao, aguardando_aceite ou aprovada (informativo);
--   * percentual = least(100, aprovadas / orçadas * 100), 0 quando orçadas = 0.
-- =============================================================================

create or replace view public.v_wbs_progress
with (security_invoker = true)
as
with recursive
itens as (
  select w.*,
         not exists (select 1 from public.wbs_items f where f.parent_id = w.id) as is_folha
    from public.wbs_items w
),
-- Fecho transitivo: cada item é ancestral de si mesmo (distancia 0) e dos descendentes
arvore (ancestral_id, descendente_id, distancia) as (
  select i.id, i.id, 0 from itens i
  union all
  select a.ancestral_id, c.id, a.distancia + 1
    from arvore a
    join public.wbs_items c on c.parent_id = a.descendente_id
),
horas_os as (
  select so.wbs_item_id,
         sum(so.horas) filter (where so.status = 'aprovada' and not so.fora_escopo) as aprovadas,
         sum(so.horas) filter (where so.status in ('em_execucao', 'aguardando_aceite', 'aprovada')) as apontadas
    from public.service_orders so
   where so.wbs_item_id is not null
   group by so.wbs_item_id
),
agg as (
  select a.ancestral_id,
         coalesce(sum(i.horas_orcadas) filter (where i.is_folha), 0)::numeric(12,2) as horas_orcadas,
         coalesce(sum(h.aprovadas), 0)::numeric(12,2) as horas_aprovadas,
         coalesce(sum(h.apontadas), 0)::numeric(12,2) as horas_apontadas
    from arvore a
    join itens i on i.id = a.descendente_id
    left join horas_os h on h.wbs_item_id = i.id
   group by a.ancestral_id
)
select
  i.project_id,
  i.id               as wbs_item_id,
  i.parent_id,
  fase.fase_id,
  i.codigo,
  i.titulo,
  case when i.is_fase then 'fase' else 'item' end as nivel,
  i.is_fase,
  i.is_milestone,
  i.is_folha,
  i.responsavel_id,
  i.inicio,
  i.fim,
  i.ordem,
  ag.horas_orcadas,
  ag.horas_aprovadas,
  ag.horas_apontadas,
  case
    when ag.horas_orcadas > 0
      then least(100, round(ag.horas_aprovadas / ag.horas_orcadas * 100, 2))
    else 0
  end::numeric(5,2) as percentual
from itens i
join agg ag on ag.ancestral_id = i.id
left join lateral (
  -- fase mais próxima na cadeia de ancestrais (o próprio item, se for fase)
  select a2.ancestral_id as fase_id
    from arvore a2
    join public.wbs_items f on f.id = a2.ancestral_id and f.is_fase
   where a2.descendente_id = i.id
   order by a2.distancia
   limit 1
) fase on true;

comment on view public.v_wbs_progress is
  'Avanço físico por item da EAP (subárvore agregada). nivel = fase|item. Percentual = horas de OS aprovadas (dentro do escopo) ÷ horas orçadas das folhas, limitado a 100.';

create or replace view public.v_fase_progress
with (security_invoker = true)
as
select project_id, wbs_item_id as fase_id, codigo, titulo, inicio, fim, ordem,
       horas_orcadas, horas_aprovadas, horas_apontadas, percentual
  from public.v_wbs_progress
 where is_fase;

comment on view public.v_fase_progress is 'Avanço físico por fase da EAP (itens com is_fase = true).';

create or replace view public.v_project_progress
with (security_invoker = true)
as
with eap as (
  select w.project_id, coalesce(sum(w.horas_orcadas), 0) as horas_orcadas_eap
    from public.wbs_items w
   where not exists (select 1 from public.wbs_items f where f.parent_id = w.id)
   group by w.project_id
),
os as (
  select so.project_id,
         coalesce(sum(so.horas) filter (where so.status = 'aprovada' and not so.fora_escopo), 0) as horas_aprovadas,
         coalesce(sum(so.horas) filter (where so.status in ('em_execucao', 'aguardando_aceite', 'aprovada')), 0) as horas_apontadas,
         coalesce(sum(so.horas) filter (where so.fora_escopo), 0) as horas_fora_escopo,
         count(*) filter (where so.status = 'aguardando_aceite') as os_aguardando_aceite
    from public.service_orders so
   group by so.project_id
)
select
  p.id as project_id,
  p.codigo,
  p.nome,
  p.status,
  p.horas_orcadas                          as horas_orcadas_projeto,
  coalesce(e.horas_orcadas_eap, 0)::numeric(12,2) as horas_orcadas_eap,
  coalesce(o.horas_aprovadas, 0)::numeric(12,2)   as horas_aprovadas,
  coalesce(o.horas_apontadas, 0)::numeric(12,2)   as horas_apontadas,
  coalesce(o.horas_fora_escopo, 0)::numeric(12,2) as horas_fora_escopo,
  coalesce(o.os_aguardando_aceite, 0)::integer    as os_aguardando_aceite,
  -- base: horas da EAP; se a EAP estiver vazia, usa projects.horas_orcadas
  case
    when coalesce(nullif(e.horas_orcadas_eap, 0), nullif(p.horas_orcadas, 0)) is null then 0
    else least(100, round(
      coalesce(o.horas_aprovadas, 0)
      / coalesce(nullif(e.horas_orcadas_eap, 0), nullif(p.horas_orcadas, 0)) * 100, 2))
  end::numeric(5,2) as percentual
from public.projects p
left join eap e on e.project_id = p.id
left join os  o on o.project_id = p.id;

comment on view public.v_project_progress is
  'Avanço físico por projeto: horas de OS aprovadas (dentro do escopo) ÷ horas orçadas das folhas da EAP (ou projects.horas_orcadas se a EAP estiver vazia).';
