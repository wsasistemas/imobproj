"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type {
  DependenciaEap,
  EventoAgenda,
  LinhaDeBase,
  MeetingStatus,
  OsStatus,
  PapelMembro,
  ProgressoEap,
} from "@/lib/projeto/tipos";

// Leitura do cronograma no navegador (a RLS filtra o que cada papel vê).
// Tudo numa consulta só: calendário e Gantt usam os mesmos dados.

export type OsAgenda = {
  id: string;
  numero: number;
  titulo: string;
  wbs_item_id: string | null;
  executor_id: string | null;
  agendada_inicio: string | null;
  agendada_fim: string | null;
  status: OsStatus;
};

export type ReuniaoAgenda = {
  id: string;
  numero: number;
  titulo: string;
  data: string;
  inicio: string | null;
  fim: string | null;
  local: string | null;
  status: MeetingStatus;
  participantes: string[];
};

export type Pessoa = { id: string; nome: string; papel: PapelMembro };

/** Item da linha de base congelada (formato do seed: wbs_item_id; aceita também id). */
export type ItemLinhaDeBase = {
  wbs_item_id?: string;
  id?: string;
  codigo?: string;
  titulo?: string;
  inicio: string | null;
  fim: string | null;
  horas_orcadas?: number;
};

export type DadosCronograma = {
  eventos: EventoAgenda[];
  eap: ProgressoEap[];
  dependencias: DependenciaEap[];
  linhaDeBase: (Omit<LinhaDeBase, "snapshot"> & { itens: Map<string, ItemLinhaDeBase> }) | null;
  os: OsAgenda[];
  reunioes: ReuniaoAgenda[];
  pessoas: Pessoa[];
};

export const chaveCronograma = (projetoId: string) => ["projeto", projetoId, "cronograma"] as const;

function lancar(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

async function carregar(projetoId: string): Promise<DadosCronograma> {
  const supabase = createClient();
  const [ev, eap, dep, lb, os, reu, mem] = await Promise.all([
    supabase
      .from("calendar_events")
      .select("id, project_id, tipo, wbs_item_id, os_id, meeting_id, titulo, inicio, fim, local")
      .eq("project_id", projetoId)
      .order("inicio"),
    supabase.from("v_wbs_progress").select("*").eq("project_id", projetoId).order("ordem"),
    supabase
      .from("wbs_dependencies")
      .select("id, predecessora_id, sucessora_id, tipo, lag_dias, pred:wbs_items!wbs_dependencies_predecessora_id_fkey!inner(project_id)")
      .eq("pred.project_id", projetoId),
    supabase
      .from("baselines")
      .select("id, project_id, numero, congelada_em, snapshot")
      .eq("project_id", projetoId)
      .order("numero", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("service_orders")
      .select("id, numero, titulo, wbs_item_id, executor_id, agendada_inicio, agendada_fim, status")
      .eq("project_id", projetoId),
    supabase
      .from("meetings")
      .select("id, numero, titulo, data, inicio, fim, local, status, meeting_participants(user_id)")
      .eq("project_id", projetoId),
    supabase
      .from("project_members")
      .select("user_id, role, profiles(id, nome)")
      .eq("project_id", projetoId)
      .eq("ativo", true),
  ]);
  for (const r of [ev, eap, dep, lb, os, reu, mem]) lancar(r.error);

  let linhaDeBase: DadosCronograma["linhaDeBase"] = null;
  if (lb.data) {
    const itens = new Map<string, ItemLinhaDeBase>();
    const snapshot = Array.isArray(lb.data.snapshot) ? (lb.data.snapshot as ItemLinhaDeBase[]) : [];
    for (const item of snapshot) {
      const id = item.wbs_item_id ?? item.id;
      if (id) itens.set(id, item);
    }
    linhaDeBase = {
      id: lb.data.id,
      project_id: lb.data.project_id,
      numero: lb.data.numero,
      congelada_em: lb.data.congelada_em,
      itens,
    };
  }

  type LinhaReuniao = Omit<ReuniaoAgenda, "participantes"> & { meeting_participants: { user_id: string }[] | null };
  type LinhaMembro = { user_id: string; role: PapelMembro; profiles: { id: string; nome: string } | null };

  const pessoas = ((mem.data ?? []) as unknown as LinhaMembro[])
    .map((m) => ({ id: m.user_id, nome: m.profiles?.nome ?? "Sem nome", papel: m.role }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return {
    eventos: (ev.data ?? []) as EventoAgenda[],
    eap: ((eap.data ?? []) as ProgressoEap[]).map((l) => ({
      ...l,
      horas_orcadas: Number(l.horas_orcadas),
      horas_aprovadas: Number(l.horas_aprovadas),
      horas_apontadas: Number(l.horas_apontadas),
      percentual: Number(l.percentual),
    })),
    dependencias: ((dep.data ?? []) as unknown as DependenciaEap[]).map(
      ({ id, predecessora_id, sucessora_id, tipo, lag_dias }) => ({ id, predecessora_id, sucessora_id, tipo, lag_dias }),
    ),
    linhaDeBase,
    os: (os.data ?? []) as OsAgenda[],
    reunioes: ((reu.data ?? []) as unknown as LinhaReuniao[]).map(({ meeting_participants, ...r }) => ({
      ...r,
      participantes: (meeting_participants ?? []).map((p) => p.user_id),
    })),
    pessoas,
  };
}

export function useDadosCronograma(projetoId: string) {
  return useQuery({
    queryKey: [...chaveCronograma(projetoId), "dados"],
    queryFn: () => carregar(projetoId),
  });
}
