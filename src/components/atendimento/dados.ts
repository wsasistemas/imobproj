import { createClient } from "@/lib/supabase/client";

// Monitor de atendimento (Fase 4): leitura pelas RPCs imobproj.monitor_* (o banco filtra os setores que a pessoa
// monitora) e formatação dos tempos, no mesmo formato do Monitor do imobdesk.

export type Periodo = "hoje" | "semana" | "mes";

export type Indicadores = {
  atendidas: number;
  resolvidas1o: number;
  foraHorario: number;
  esperaMediaSeg: number | null;
  atendimentoMedioSeg: number | null;
};

export type RespostaIndicadores = { inicio: string; atual: Indicadores; anterior: Indicadores };

export type MonitorAtendente = {
  usuario_id: string;
  nome: string;
  setor_id: string;
  setor_nome: string;
  online: boolean;
  apto: boolean;
  pausa: boolean;
  em_atendimento: number;
  limite: number;
  atendidas_hoje: number;
  tempo_medio_seg: number | null;
};

export type MonitorConversa = {
  atendimento_id: string;
  ticket: number;
  setor_id: string;
  setor_nome: string;
  group_id: string;
  project_id: string | null;
  grupo_nome: string;
  cliente: string | null;
  telefone: string | null;
  numero: string | null;
  status: "fila" | "atendimento";
  ultima_previa: string | null;
  entrou_fila_em: string;
  atendente_id: string | null;
  atendente_nome: string | null;
  assumido_em: string | null;
  ultima_msg_cliente_em: string | null;
  ultima_msg_atendente_em: string | null;
};

export type SetorMonitor = { id: string; nome: string };

export const chavesMonitor = {
  tudo: ["atendimento", "monitor"] as const,
  setores: () => ["atendimento", "monitor", "setores"] as const,
  indicadores: (periodo: Periodo, setor: string | null) => ["atendimento", "monitor", "indicadores", periodo, setor] as const,
  atendentes: (setor: string | null) => ["atendimento", "monitor", "atendentes", setor] as const,
  conversas: (setor: string | null) => ["atendimento", "monitor", "conversas", setor] as const,
};

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function normalizar(i: Record<string, unknown> | undefined): Indicadores {
  return {
    atendidas: Number(i?.atendidas ?? 0),
    resolvidas1o: Number(i?.resolvidas1o ?? 0),
    foraHorario: Number(i?.foraHorario ?? 0),
    esperaMediaSeg: num(i?.esperaMediaSeg),
    atendimentoMedioSeg: num(i?.atendimentoMedioSeg),
  };
}

export async function buscarSetoresMonitor(): Promise<SetorMonitor[]> {
  const supabase = createClient();
  const { data: ids, error } = await supabase.rpc("fn_monitor_setores");
  if (error) throw error;
  const lista = (ids ?? []) as string[];
  if (!lista.length) return [];
  const { data, error: e2 } = await supabase.from("setores").select("id, nome").in("id", lista).order("nome");
  if (e2) throw e2;
  return (data ?? []) as SetorMonitor[];
}

export async function buscarIndicadores(periodo: Periodo, setor: string | null): Promise<RespostaIndicadores> {
  const { data, error } = await createClient().rpc("monitor_indicadores", { p_periodo: periodo, p_setor: setor });
  if (error) throw error;
  const d = data as { inicio: string; atual: Record<string, unknown>; anterior: Record<string, unknown> };
  return { inicio: d.inicio, atual: normalizar(d.atual), anterior: normalizar(d.anterior) };
}

export async function buscarAtendentes(setor: string | null): Promise<MonitorAtendente[]> {
  const { data, error } = await createClient().rpc("monitor_atendentes", { p_setor: setor });
  if (error) throw error;
  return ((data ?? []) as MonitorAtendente[]).map((a) => ({ ...a, tempo_medio_seg: num(a.tempo_medio_seg) }));
}

export async function buscarConversas(setor: string | null): Promise<MonitorConversa[]> {
  const { data, error } = await createClient().rpc("monitor_conversas", { p_setor: setor });
  if (error) throw error;
  return (data ?? []) as MonitorConversa[];
}

/** "33 s", "1 min 42 s", "14 min", "5h 07" (como no imobdesk). */
export function minutos(seg: number | null): string {
  if (seg === null || Number.isNaN(seg)) return "—";
  const s = Math.round(seg);
  if (s < 60) return `${s} s`;
  if (s < 600) return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;
}

/** Cronômetro "mm:ss" ou "h:mm:ss" para tempos que andam na tela. */
export function duracao(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const mmss = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return h ? `${h}:${mmss}` : mmss;
}

export const horaDe = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—";

/** Variação contra o mesmo trecho do período anterior (subir é ruim quando menorMelhor). */
export function variacao(atual: number | null, anterior: number | null, menorMelhor: boolean): { texto: string; tom: "igual" | "bom" | "ruim" } {
  if (atual === null || anterior === null || anterior === 0) {
    return { texto: atual && !anterior ? "novo" : "0,00%", tom: "igual" };
  }
  const pct = ((atual - anterior) / anterior) * 100;
  if (Math.abs(pct) < 0.005) return { texto: "0,00%", tom: "igual" };
  const bom = menorMelhor ? pct < 0 : pct > 0;
  return { texto: `${pct > 0 ? "+" : ""}${pct.toFixed(2).replace(".", ",")}%`, tom: bom ? "bom" : "ruim" };
}

export function disponivel(a: MonitorAtendente): "sim" | "pausa" | "nao" {
  if (a.online && a.pausa) return "pausa";
  return a.online && a.apto && a.em_atendimento < a.limite ? "sim" : "nao";
}

/** O cliente escreveu depois da última resposta do atendente. */
export function clienteEsperando(c: MonitorConversa): boolean {
  if (!c.ultima_msg_cliente_em) return false;
  return !c.ultima_msg_atendente_em || c.ultima_msg_cliente_em > c.ultima_msg_atendente_em;
}

export const hrefConversa = (c: { project_id: string | null; group_id: string }) =>
  c.project_id ? `/projetos/${c.project_id}/conversas?grupo=${c.group_id}` : null;
