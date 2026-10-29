import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import type { MeetingStatus, PapelMembro } from "@/lib/projeto/tipos";

// Leitura do módulo Atas no navegador (a RLS filtra o que cada papel vê).

export const chavesAtas = {
  raiz: (projetoId: string) => ["projeto", projetoId, "atas"] as const,
  lista: (projetoId: string) => ["projeto", projetoId, "atas", "lista"] as const,
  membros: (projetoId: string) => ["projeto", projetoId, "atas", "membros"] as const,
  grupos: (projetoId: string) => ["projeto", projetoId, "atas", "grupos"] as const,
  detalhe: (projetoId: string, ataId: string) => ["projeto", projetoId, "atas", "detalhe", ataId] as const,
  anexos: (projetoId: string, ataId: string) => ["projeto", projetoId, "atas", "anexos", ataId] as const,
};

export const BUCKET_ATAS = "imobproj-documentos";
export const pastaAnexos = (projetoId: string, ataId: string) => `${projetoId}/atas/${ataId}`;

export type ActionStatus = "aberta" | "em_andamento" | "concluida" | "cancelada";

export const SITUACAO_ENCAMINHAMENTO: Record<ActionStatus, { label: string; variant: "info" | "warning" | "success" | "neutral" }> = {
  aberta: { label: "Aberta", variant: "info" },
  em_andamento: { label: "Em andamento", variant: "warning" },
  concluida: { label: "Concluída", variant: "success" },
  cancelada: { label: "Cancelada", variant: "neutral" },
};

/** Papéis que podem dar ciência (PERMISSOES.ata_ciencia). */
export const PAPEIS_CIENCIA: PapelMembro[] = ["diretor", "usuario_chave"];

type Ref<T> = T | T[] | null;
function um<T>(v: Ref<T> | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export type AtaResumo = {
  id: string;
  numero: number;
  titulo: string;
  data: string;
  inicio: string | null;
  fim: string | null;
  local: string | null;
  status: MeetingStatus;
};

export async function buscarAtas(projetoId: string): Promise<AtaResumo[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("meetings")
    .select("id, numero, titulo, data, inicio, fim, local, status")
    .eq("project_id", projetoId)
    .order("numero", { ascending: false });
  if (error) throw new Error("Não foi possível carregar as atas.");
  return (data ?? []) as AtaResumo[];
}

export type MembroProjeto = { id: string; nome: string; email: string | null; papel: PapelMembro };

export async function buscarMembros(projetoId: string): Promise<MembroProjeto[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("project_members")
    .select("role, user:profiles!user_id(id, nome, email)")
    .eq("project_id", projetoId)
    .eq("ativo", true);
  if (error) throw new Error("Não foi possível carregar a equipe do projeto.");
  return ((data ?? []) as unknown as { role: PapelMembro; user: Ref<{ id: string; nome: string; email: string | null }> }[])
    .map((m) => ({ papel: m.role, perfil: um(m.user) }))
    .filter((m): m is { papel: PapelMembro; perfil: { id: string; nome: string; email: string | null } } => !!m.perfil)
    .map((m) => ({ id: m.perfil.id, nome: m.perfil.nome || "Sem nome", email: m.perfil.email, papel: m.papel }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export type GrupoWhatsApp = { id: string; nome: string; equipe: string };

export async function buscarGrupos(projetoId: string): Promise<GrupoWhatsApp[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("wa_groups")
    .select("id, nome, equipe")
    .eq("project_id", projetoId)
    .eq("ativo", true)
    .order("nome");
  if (error) throw new Error("Não foi possível carregar os grupos do WhatsApp.");
  return (data ?? []) as GrupoWhatsApp[];
}

export type Participante = {
  id: string;
  user_id: string;
  presenca: "presente" | "ausente";
  ciente_em: string | null;
  nome: string;
};

export type Encaminhamento = {
  id: string;
  acao: string;
  responsavel_id: string | null;
  responsavel: string | null;
  prazo: string | null;
  status: ActionStatus;
  wbs_item_id: string | null;
  vincular_cronograma: boolean;
  item: { codigo: string; titulo: string } | null;
  created_at: string;
};

export type SolicitacaoCiencia = { created_at: string; destinatarios: string[]; email_status: string };

export type AtaDetalhe = AtaResumo & {
  project_id: string;
  pauta: string[];
  decisoes: string[];
  redator_id: string | null;
  redator: string | null;
  participantes: Participante[];
  encaminhamentos: Encaminhamento[];
  ultimaSolicitacao: SolicitacaoCiencia | null;
};

const comoLista = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : String(x))) : []);

export async function buscarAta(projetoId: string, ataId: string): Promise<AtaDetalhe | null> {
  const supabase = createClient();
  const [ata, participantes, acoes, solicitacoes] = await Promise.all([
    supabase
      .from("meetings")
      .select("id, project_id, numero, titulo, data, inicio, fim, local, status, pauta, decisoes, redator_id, redator:profiles!redator_id(nome)")
      .eq("project_id", projetoId)
      .eq("id", ataId)
      .maybeSingle(),
    supabase
      .from("meeting_participants")
      .select("id, user_id, presenca, ciente_em, perfil:profiles!user_id(nome)")
      .eq("meeting_id", ataId),
    supabase
      .from("meeting_actions")
      .select(
        "id, acao, responsavel_id, prazo, status, wbs_item_id, vincular_cronograma, created_at, responsavel:profiles!responsavel_id(nome), item:wbs_items!wbs_item_id(codigo, titulo)",
      )
      .eq("meeting_id", ataId)
      .order("created_at"),
    supabase
      .from("meeting_ciencia_solicitacoes")
      .select("created_at, destinatarios, email_status")
      .eq("meeting_id", ataId)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  if (ata.error || participantes.error || acoes.error) throw new Error("Não foi possível carregar a ata.");
  if (!ata.data) return null;
  const a = ata.data as unknown as AtaResumo & {
    project_id: string;
    pauta: unknown;
    decisoes: unknown;
    redator_id: string | null;
    redator: Ref<{ nome: string }>;
  };

  return {
    ...a,
    pauta: comoLista(a.pauta),
    decisoes: comoLista(a.decisoes),
    redator: um(a.redator)?.nome ?? null,
    participantes: ((participantes.data ?? []) as unknown as (Omit<Participante, "nome"> & { perfil: Ref<{ nome: string }> })[])
      .map((p) => ({ id: p.id, user_id: p.user_id, presenca: p.presenca, ciente_em: p.ciente_em, nome: um(p.perfil)?.nome || "Sem nome" }))
      .sort((x, y) => x.nome.localeCompare(y.nome, "pt-BR")),
    encaminhamentos: ((acoes.data ?? []) as unknown as (Omit<Encaminhamento, "responsavel" | "item"> & {
      responsavel: Ref<{ nome: string }>;
      item: Ref<{ codigo: string; titulo: string }>;
    })[]).map((e) => ({ ...e, responsavel: um(e.responsavel)?.nome ?? null, item: um(e.item) })),
    // A tabela vem da migration 20261029000600; se ainda não existir, só não mostra a última solicitação.
    ultimaSolicitacao: solicitacoes.error ? null : ((solicitacoes.data?.[0] as SolicitacaoCiencia | undefined) ?? null),
  };
}

export type Anexo = { nome: string; exibicao: string; caminho: string; tamanho: number | null; criadoEm: string | null };

export async function buscarAnexos(projetoId: string, ataId: string): Promise<Anexo[]> {
  const supabase = createClient();
  const pasta = pastaAnexos(projetoId, ataId);
  const { data, error } = await supabase.storage
    .from(BUCKET_ATAS)
    .list(pasta, { limit: 1000, sortBy: { column: "created_at", order: "asc" } });
  if (error) throw new Error("Não foi possível carregar os anexos.");
  return (data ?? [])
    .filter((o) => o.id && o.name !== ".emptyFolderPlaceholder")
    .map((o) => ({
      nome: o.name,
      exibicao: o.name.replace(/^\d{13}-/, ""),
      caminho: `${pasta}/${o.name}`,
      tamanho: (o.metadata as { size?: number } | null)?.size ?? null,
      criadoEm: o.created_at ?? null,
    }));
}

// ---------------------------------------------------------------------------------------------
// Formatação (pt-BR)
// ---------------------------------------------------------------------------------------------
export function formatarData(iso: string | null | undefined, padrao = "dd/MM/yyyy") {
  if (!iso) return "—";
  return format(parseISO(iso), padrao, { locale: ptBR });
}

export function formatarDataHora(iso: string | null | undefined) {
  if (!iso) return "—";
  return format(parseISO(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

export function formatarHorario(inicio: string | null, fim: string | null) {
  if (!inicio) return null;
  return `${inicio.slice(0, 5)}${fim ? `–${fim.slice(0, 5)}` : ""}`;
}

const fmtTamanho = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
export function formatarTamanho(bytes: number | null) {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${fmtTamanho.format(bytes / 1024)} KB`;
  return `${fmtTamanho.format(bytes / 1024 / 1024)} MB`;
}

export const numeroAta = (n: number) => `Ata nº ${n}`;
