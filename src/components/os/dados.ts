import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import type {
  EvidenciaOs,
  HistoricoOs,
  OrdemServico,
  OsStatus,
  PapelMembro,
} from "@/lib/projeto/tipos";

// Leitura do módulo Ordens de Serviço no navegador (a RLS filtra o que cada papel vê).

export const chavesOs = {
  raiz: (projetoId: string) => ["projeto", projetoId, "os"] as const,
  lista: (projetoId: string) => ["projeto", projetoId, "os", "lista"] as const,
  opcoes: (projetoId: string) => ["projeto", projetoId, "os", "opcoes"] as const,
  detalhe: (projetoId: string, osId: string) => ["projeto", projetoId, "os", "detalhe", osId] as const,
  evidencias: (projetoId: string, osId: string) => ["projeto", projetoId, "os", "evidencias", osId] as const,
  historico: (projetoId: string, osId: string) => ["projeto", projetoId, "os", "historico", osId] as const,
  medicao: (projetoId: string, mes: string) => ["projeto", projetoId, "os", "medicao", mes] as const,
};

export const BUCKET_EVIDENCIAS = "evidencias";

type Ref<T> = T | T[] | null;
/** PostgREST devolve objeto ou array conforme a FK; normaliza para objeto. */
export function um<T>(v: Ref<T> | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export type OsLinha = OrdemServico & {
  horas_previstas?: number | null;
  executor: { id: string; nome: string } | null;
  atividade: { id: string; codigo: string; titulo: string } | null;
};

const SELECT_OS =
  "*, executor:profiles!executor_id(id, nome), atividade:wbs_items!wbs_item_id(id, codigo, titulo)";

type OsBruta = OrdemServico & {
  horas_previstas?: number | null;
  executor: Ref<{ id: string; nome: string }>;
  atividade: Ref<{ id: string; codigo: string; titulo: string }>;
};

function normalizarOs(o: OsBruta): OsLinha {
  return { ...o, horas: Number(o.horas ?? 0), executor: um(o.executor), atividade: um(o.atividade) };
}

export async function buscarListaOs(projetoId: string): Promise<OsLinha[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("service_orders")
    .select(SELECT_OS)
    .eq("project_id", projetoId)
    .order("numero", { ascending: false });
  if (error) throw new Error("Não foi possível carregar as Ordens de Serviço.");
  return ((data ?? []) as unknown as OsBruta[]).map(normalizarOs);
}

export type OpcoesNovaOs = {
  atividades: { id: string; codigo: string; titulo: string }[];
  membros: { id: string; nome: string; papel: PapelMembro }[];
};

export async function buscarOpcoesNovaOs(projetoId: string): Promise<OpcoesNovaOs> {
  const supabase = createClient();
  const [eap, equipe] = await Promise.all([
    supabase
      .from("wbs_items")
      .select("id, codigo, titulo, is_fase, ordem")
      .eq("project_id", projetoId)
      .eq("is_fase", false)
      .order("codigo"),
    supabase
      .from("project_members")
      .select("role, user:profiles!user_id(id, nome)")
      .eq("project_id", projetoId)
      .eq("ativo", true),
  ]);
  if (eap.error || equipe.error) throw new Error("Não foi possível carregar a EAP e a equipe do projeto.");
  const membros = ((equipe.data ?? []) as unknown as { role: PapelMembro; user: Ref<{ id: string; nome: string }> }[])
    .map((m) => ({ papel: m.role, perfil: um(m.user) }))
    .filter((m): m is { papel: PapelMembro; perfil: { id: string; nome: string } } => !!m.perfil)
    .map((m) => ({ id: m.perfil.id, nome: m.perfil.nome || "Sem nome", papel: m.papel }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return {
    atividades: (eap.data ?? []).map((i) => ({ id: i.id as string, codigo: i.codigo as string, titulo: i.titulo as string })),
    membros,
  };
}

export async function buscarOs(projetoId: string, osId: string): Promise<OsLinha | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("service_orders")
    .select(SELECT_OS)
    .eq("project_id", projetoId)
    .eq("id", osId)
    .maybeSingle();
  if (error) throw new Error("Não foi possível carregar a OS.");
  return data ? normalizarOs(data as unknown as OsBruta) : null;
}

export type EvidenciaComUrl = EvidenciaOs & { url: string | null; nome: string; imagem: boolean };

const EXT_IMAGEM = /\.(jpe?g|png|gif|webp|avif|bmp|heic|svg)$/i;

export async function buscarEvidencias(osId: string): Promise<EvidenciaComUrl[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("os_evidences")
    .select("id, os_id, tipo, storage_path, captured_at, lat, lng, origem")
    .eq("os_id", osId)
    .order("captured_at", { ascending: true });
  if (error) throw new Error("Não foi possível carregar as evidências.");
  const lista = (data ?? []) as EvidenciaOs[];
  if (lista.length === 0) return [];

  // URLs assinadas (1 h) numa única chamada; arquivo ausente no Storage volta sem URL.
  const { data: assinadas } = await supabase.storage
    .from(BUCKET_EVIDENCIAS)
    .createSignedUrls(
      lista.map((e) => e.storage_path),
      3600,
    );
  const porCaminho = new Map((assinadas ?? []).map((s) => [s.path, s.error ? null : s.signedUrl]));
  return lista.map((e) => ({
    ...e,
    url: porCaminho.get(e.storage_path) ?? null,
    nome: e.storage_path.split("/").pop() ?? e.storage_path,
    imagem: e.tipo !== "arquivo" && EXT_IMAGEM.test(e.storage_path),
  }));
}

export type HistoricoComAutor = HistoricoOs & { autor: { nome: string } | null };

export async function buscarHistorico(osId: string): Promise<HistoricoComAutor[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("os_status_history")
    .select("id, os_id, de, para, autor_id, comentario, created_at, autor:profiles!autor_id(nome)")
    .eq("os_id", osId)
    .order("created_at", { ascending: false });
  if (error) throw new Error("Não foi possível carregar o histórico.");
  return ((data ?? []) as unknown as (HistoricoOs & { autor: Ref<{ nome: string }> })[]).map((h) => ({
    ...h,
    autor: um(h.autor),
  }));
}

// ---------------------------------------------------------------------------------------------
// Formatação (pt-BR)
// ---------------------------------------------------------------------------------------------
const fmtHoras = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const formatarHoras = (h: number | null | undefined) => (h == null ? "—" : `${fmtHoras.format(Number(h))} h`);

const fmtMoeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const formatarMoeda = (v: number) => fmtMoeda.format(v);

export function formatarDataHora(iso: string | null | undefined) {
  if (!iso) return "—";
  return format(parseISO(iso), "dd/MM/yyyy HH:mm", { locale: ptBR });
}

export function formatarData(iso: string | null | undefined) {
  if (!iso) return "—";
  return format(parseISO(iso), "dd/MM/yyyy", { locale: ptBR });
}

export function formatarAgendamento(inicio: string | null, fim: string | null) {
  if (!inicio) return "—";
  if (!fim) return formatarDataHora(inicio);
  const i = parseISO(inicio);
  const f = parseISO(fim);
  const mesmoDia = format(i, "yyyy-MM-dd") === format(f, "yyyy-MM-dd");
  return mesmoDia
    ? `${format(i, "dd/MM/yyyy HH:mm", { locale: ptBR })}–${format(f, "HH:mm")}`
    : `${format(i, "dd/MM HH:mm", { locale: ptBR })} a ${format(f, "dd/MM/yyyy HH:mm", { locale: ptBR })}`;
}

export const numeroOs = (n: number) => `OS ${n}`;

export const ORDEM_SITUACOES: OsStatus[] = [
  "rascunho",
  "agendada",
  "em_execucao",
  "aguardando_aceite",
  "aprovada",
  "recusada",
];

export const ROTULO_ORIGEM = { portal: "Portal", app: "App de campo", whatsapp: "WhatsApp" } as const;
export const ROTULO_EVIDENCIA = { foto: "Foto", arquivo: "Arquivo", print: "Print", assinatura: "Assinatura" } as const;
