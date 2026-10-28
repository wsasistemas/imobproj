-- =============================================================================
-- IMOBPROJ · Módulo Ordens de Serviço (Prompt 1, item 5)
-- Migration ADITIVA e idempotente.
--
-- 1) service_orders.horas_previstas: horas planejadas na abertura da OS.
--    Não reaproveitamos "horas" porque ela é a hora APONTADA (check-out) e entra em
--    v_wbs_progress (apontadas/aprovadas); gravar a previsão nela inflaria o avanço.
--
-- 2) fn_os_marcar_fora_escopo: marca a OS como fora do escopo e cria a proposta de
--    escopo (scope_proposals, status 'pendente') NA MESMA TRANSAÇÃO.
--    SECURITY INVOKER: roda com o usuário logado, então a RLS de service_orders
--    (update: gerente/diretor/usuario_chave) e de scope_proposals (insert: idem)
--    continua valendo; a função só acrescenta a atomicidade e a checagem de papel.
-- =============================================================================

alter table public.service_orders
  add column if not exists horas_previstas numeric(8,2)
    check (horas_previstas is null or horas_previstas >= 0);

comment on column public.service_orders.horas_previstas is
  'Horas previstas na abertura da OS (planejamento). As horas apontadas/aprovadas ficam em "horas".';

create or replace function public.fn_os_marcar_fora_escopo(
  p_os_id     uuid,
  p_descricao text,
  p_horas     numeric,
  p_valor     numeric default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_project_id uuid;
  v_fora       boolean;
  v_proposta   uuid;
begin
  if coalesce(btrim(p_descricao), '') = '' then
    raise exception 'Descreva o que está fora do escopo' using errcode = '23514';
  end if;
  if p_horas is null or p_horas < 0 then
    raise exception 'Informe as horas da proposta (zero ou mais)' using errcode = '23514';
  end if;
  if p_valor is not null and p_valor < 0 then
    raise exception 'O valor da proposta não pode ser negativo' using errcode = '23514';
  end if;

  select so.project_id, so.fora_escopo
    into v_project_id, v_fora
    from public.service_orders so
   where so.id = p_os_id
   for update;

  if v_project_id is null then
    raise exception 'OS não encontrada' using errcode = 'P0002';
  end if;

  if not public.fn_has_role(v_project_id, array['gerente', 'diretor', 'usuario_chave']) then
    raise exception 'Somente gerente, diretor ou usuário-chave podem marcar OS fora do escopo'
      using errcode = '42501';
  end if;

  if v_fora then
    raise exception 'Esta OS já está marcada como fora do escopo' using errcode = '23514';
  end if;

  update public.service_orders
     set fora_escopo = true
   where id = p_os_id;

  insert into public.scope_proposals (project_id, os_id, descricao, horas, valor, status)
  values (v_project_id, p_os_id, btrim(p_descricao), p_horas, p_valor, 'pendente')
  returning id into v_proposta;

  return v_proposta;
end;
$$;

revoke all on function public.fn_os_marcar_fora_escopo(uuid, text, numeric, numeric) from public, anon;
grant execute on function public.fn_os_marcar_fora_escopo(uuid, text, numeric, numeric) to authenticated;
