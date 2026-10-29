import { format, isToday, isYesterday, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import type { PapelMembro } from "@/lib/projeto/tipos";

// Leitura do módulo Conversas WhatsApp no navegador (a RLS filtra: prestador não vê grupos nem mensagens).

export const chavesConversas = {
  raiz: (p: string) => ["projeto", p, "conversas"] as const,
  grupos: (p: string) => ["projeto", p, "conversas", "grupos"] as const,
  resumo: (p: string) => ["projeto", p, "conversas", "resumo"] as const,
  pessoas: (p: string) => ["projeto", p, "conversas", "pessoas"] as const,
  status: (p: string) => ["projeto", p, "conversas", "status-openwa"] as const,
  participantes: (p: string, g: string) => ["projeto", p, "conversas", "participantes", g] as const,
  mensagens: (p: string, g: string) => ["projeto", p, "conversas", "mensagens", g] as const,
  citada: (p: string, waId: string) => ["projeto", p, "conversas", "citada", waId] as const,
  midia: (p: string, caminho: string) => ["projeto", p, "conversas", "midia", caminho] as const,
};

export type DirecaoWa = "in" | "out";
export type SituacaoMensagemWa = "recebida" | "pendente" | "enviada" | "falhou";

export type MensagemWa = {
  id: string;
  group_id: string;
  wa_message_id: string | null;
  direction: DirecaoWa;
  author_phone: string | null;
  author_user_id: string | null;
  body: string | null;
  media_path: string | null;
  quoted_wa_message_id: string | null;
  status: SituacaoMensagemWa;
  tentativas: number;
  erro: string | null;
  created_at: string;
};

export type GrupoWa = {
  id: string;
  project_id: string;
  session_id: string | null;
  equipe: string;
  nome: string;
  wa_group_id: string | null;
  ativo: boolean;
  auto_evidencia: boolean;
  auto_os: boolean;
  created_at: string;
};

export type ResumoConversa = {
  group_id: string;
  ultima_id: string | null;
  ultima_body: string | null;
  ultima_media_path: string | null;
  ultima_direction: DirecaoWa | null;
  ultima_autor_user_id: string | null;
  ultima_autor_phone: string | null;
  ultima_em: string | null;
  last_read_at: string | null;
  nao_lidas: number;
  mencoes: number;
  mencoes_nao_lidas: number;
  fila: number;
};

export type PessoaProjeto = {
  userId: string;
  nome: string;
  papel: PapelMembro;
  ativo: boolean;
  telefone: string | null;
};

export type ParticipanteGrupo = {
  id: string;
  group_id: string;
  user_id: string | null;
  telefone: string;
  is_admin: boolean;
};

export type StatusOpenWa = {
  session_id: string;
  numero: string;
  status: "conectado" | "desconectado" | "erro";
  last_heartbeat: string | null;
};

export const TAMANHO_PAGINA = 40;
export const MAX_TENTATIVAS = 5;
/** Sem sinal (heartbeat) há mais que isto, o selo fica vermelho. */
export const LIMITE_SINAL_MS = 2 * 60 * 1000;

const COLUNAS_MSG =
  "id, group_id, wa_message_id, direction, author_phone, author_user_id, body, media_path, quoted_wa_message_id, status, tentativas, erro, created_at";

// ---------------------------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------------------------
export async function buscarGrupos(projetoId: string): Promise<GrupoWa[]> {
  const consulta = () =>
    createClient()
      .from("wa_groups")
      .select("id, project_id, session_id, equipe, nome, wa_group_id, ativo, auto_evidencia, auto_os, created_at")
      .eq("project_id", projetoId)
      .order("equipe");
  // Grupo com 30 dias sem mensagem está em Anotações da equipe e sai de Conversas. Sem a coluna (banco antigo), lista todos.
  let { data, error } = await consulta().is("anotacao_desde", null);
  if (error) ({ data, error } = await consulta());
  if (error) throw new Error("Não foi possível carregar os grupos de WhatsApp.");
  return (data ?? []) as GrupoWa[];
}

export async function buscarResumo(projetoId: string): Promise<Record<string, ResumoConversa>> {
  const { data, error } = await createClient().rpc("fn_wa_conversas", { p_project_id: projetoId });
  if (error) throw new Error("Não foi possível carregar o resumo das conversas.");
  return Object.fromEntries(((data ?? []) as ResumoConversa[]).map((r) => [r.group_id, r]));
}

type MembroBruto = {
  user_id: string;
  role: PapelMembro;
  ativo: boolean;
  perfil: { id: string; nome: string; telefone_whatsapp: string | null } | { id: string; nome: string; telefone_whatsapp: string | null }[] | null;
};

export async function buscarPessoas(projetoId: string): Promise<PessoaProjeto[]> {
  const { data, error } = await createClient()
    .from("project_members")
    .select("user_id, role, ativo, perfil:profiles!user_id(id, nome, telefone_whatsapp)")
    .eq("project_id", projetoId);
  if (error) throw new Error("Não foi possível carregar a equipe do projeto.");
  return ((data ?? []) as unknown as MembroBruto[]).map((m) => {
    const p = Array.isArray(m.perfil) ? m.perfil[0] : m.perfil;
    return { userId: m.user_id, nome: p?.nome || "Sem nome", papel: m.role, ativo: m.ativo, telefone: p?.telefone_whatsapp ?? null };
  });
}

export async function buscarParticipantes(grupoId: string): Promise<ParticipanteGrupo[]> {
  const { data, error } = await createClient()
    .from("wa_group_members")
    .select("id, group_id, user_id, telefone, is_admin")
    .eq("group_id", grupoId);
  if (error) throw new Error("Não foi possível carregar os participantes.");
  return (data ?? []) as ParticipanteGrupo[];
}

export type PaginaMensagens = { itens: MensagemWa[]; temMais: boolean };

/** Página de mensagens, da mais nova para a mais antiga. `antesDe` = created_at da mais antiga já carregada. */
export async function buscarMensagens(grupoId: string, antesDe: string | null): Promise<PaginaMensagens> {
  let q = createClient()
    .from("wa_messages")
    .select(COLUNAS_MSG)
    .eq("group_id", grupoId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(TAMANHO_PAGINA + 1);
  if (antesDe) q = q.lt("created_at", antesDe);
  const { data, error } = await q;
  if (error) throw new Error("Não foi possível carregar as mensagens.");
  const linhas = (data ?? []) as MensagemWa[];
  return { itens: linhas.slice(0, TAMANHO_PAGINA), temMais: linhas.length > TAMANHO_PAGINA };
}

export async function buscarMensagemPorWaId(waId: string): Promise<MensagemWa | null> {
  const { data, error } = await createClient().from("wa_messages").select(COLUNAS_MSG).eq("wa_message_id", waId).maybeSingle();
  if (error) throw new Error("Não foi possível carregar a mensagem citada.");
  return (data as MensagemWa | null) ?? null;
}

export async function buscarStatusOpenWa(projetoId: string): Promise<StatusOpenWa | null> {
  const { data, error } = await createClient().rpc("fn_wa_status", { p_project_id: projetoId });
  if (error) throw new Error("Não foi possível consultar o OpenWA.");
  const linhas = (data ?? []) as StatusOpenWa[];
  // Mais de uma sessão: vale a com sinal mais recente.
  return (
    [...linhas].sort((a, b) => (b.last_heartbeat ?? "").localeCompare(a.last_heartbeat ?? ""))[0] ?? null
  );
}

// ---------------------------------------------------------------------------------------------
// Mídia (Storage). wa_messages.media_path pode vir com o bucket na frente ("documentos/<projeto>/...",
// contrato de enfileirarMensagemWhatsApp) ou sem ele (mídia recebida pelo webhook, gravada em
// "evidencias/<projeto>/<os>/..." como no seed).
// ---------------------------------------------------------------------------------------------
const BUCKETS = ["imobproj-documentos", "imobproj-evidencias", "imobproj-whatsapp"] as const;
const BUCKET_PADRAO = "imobproj-evidencias";

export function localMidia(caminho: string): { bucket: string; caminho: string } {
  const [primeiro, ...resto] = caminho.replace(/^\/+/, "").split("/");
  if ((BUCKETS as readonly string[]).includes(primeiro) && resto.length > 0) return { bucket: primeiro, caminho: resto.join("/") };
  return { bucket: BUCKET_PADRAO, caminho: caminho.replace(/^\/+/, "") };
}

export async function urlAssinadaMidia(caminho: string): Promise<string | null> {
  const local = localMidia(caminho);
  const { data, error } = await createClient().storage.from(local.bucket).createSignedUrl(local.caminho, 60 * 60);
  if (error || !data) return null;
  return data.signedUrl;
}

export const ehImagem = (caminho: string | null | undefined) => !!caminho && /\.(png|jpe?g|gif|webp|bmp|heic)$/i.test(caminho);
export const nomeArquivo = (caminho: string) => {
  const nome = caminho.split("/").at(-1) ?? caminho;
  return nome.replace(/^\d{10,}-/, ""); // tira o prefixo de tempo que o envio acrescenta
};

// ---------------------------------------------------------------------------------------------
// Pessoas, telefones e menções
// ---------------------------------------------------------------------------------------------
export const soDigitos = (t: string | null | undefined) => (t ?? "").replace(/\D/g, "");

/** +55 11 90000-0003 */
export function formatarTelefone(t: string | null | undefined): string {
  const d = soDigitos(t);
  if (!d) return "—";
  const m = /^(55)?(\d{2})(\d{4,5})(\d{4})$/.exec(d);
  if (!m) return `+${d}`;
  return `+55 ${m[2]} ${m[3]}-${m[4]}`;
}

/** Compara telefones ignorando o 9º dígito e o DDI (os últimos 8 dígitos bastam dentro de um projeto). */
export function mesmoTelefone(a: string | null | undefined, b: string | null | undefined) {
  const da = soDigitos(a);
  const db = soDigitos(b);
  if (da.length < 8 || db.length < 8) return false;
  return da === db || da.slice(-8) === db.slice(-8);
}

export type Autor = { nome: string; papel: PapelMembro | null; telefone: string | null; userId: string | null; conhecido: boolean };

export function resolverAutor(m: Pick<MensagemWa, "author_user_id" | "author_phone">, pessoas: PessoaProjeto[]): Autor {
  const p =
    (m.author_user_id ? pessoas.find((x) => x.userId === m.author_user_id) : undefined) ??
    (m.author_phone ? pessoas.find((x) => mesmoTelefone(x.telefone, m.author_phone)) : undefined);
  if (p) return { nome: p.nome, papel: p.papel, telefone: p.telefone ?? m.author_phone, userId: p.userId, conhecido: true };
  return { nome: formatarTelefone(m.author_phone), papel: null, telefone: m.author_phone, userId: m.author_user_id, conhecido: false };
}

/** Mensagem de sistema (entrou/saiu, grupo criado…): recebida sem autor. */
export const ehSistema = (m: Pick<MensagemWa, "direction" | "author_phone" | "author_user_id">) =>
  m.direction === "in" && !m.author_phone && !m.author_user_id;

const escaparRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Mesma regra de fn_wa_conversas (migration 20261029000800): telefone, nome completo, @primeiro nome ou primeiro nome. */
export function mencionaPessoa(texto: string | null | undefined, eu: { nome: string; telefone: string | null } | null): boolean {
  if (!texto || !eu) return false;
  const corpo = texto.toLowerCase();
  const tel = soDigitos(eu.telefone);
  if (tel.length >= 8 && texto.includes(tel)) return true;
  const nome = eu.nome.trim().toLowerCase();
  if (nome.length >= 3 && corpo.includes(nome)) return true;
  const primeiro = nome.split(/\s+/)[0] ?? "";
  if (primeiro.length >= 2 && corpo.includes(`@${primeiro}`)) return true;
  if (primeiro.length >= 3 && new RegExp(`(^|[^\\p{L}\\p{N}_])${escaparRegex(primeiro)}($|[^\\p{L}\\p{N}_])`, "u").test(corpo)) return true;
  return false;
}

// ---------------------------------------------------------------------------------------------
// Datas
// ---------------------------------------------------------------------------------------------
export const horaCurta = (iso: string) => format(parseISO(iso), "HH:mm");

/** Hora na lista: hoje → 14:05; ontem → Ontem; antes → 21/10. */
export function horaLista(iso: string | null): string {
  if (!iso) return "";
  const d = parseISO(iso);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return "Ontem";
  return format(d, "dd/MM", { locale: ptBR });
}

export function rotuloDia(iso: string): string {
  const d = parseISO(iso);
  if (isToday(d)) return "Hoje";
  if (isYesterday(d)) return "Ontem";
  return format(d, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });
}

export const chaveDia = (iso: string) => format(parseISO(iso), "yyyy-MM-dd");

/** Prévia de uma mensagem numa linha (lista e citação). */
export function previa(m: { body: string | null; media_path: string | null }): string {
  const texto = m.body?.replace(/\s+/g, " ").trim();
  if (texto) return texto;
  if (m.media_path) return ehImagem(m.media_path) ? "Foto" : `Arquivo · ${nomeArquivo(m.media_path)}`;
  return "Mensagem sem texto";
}
