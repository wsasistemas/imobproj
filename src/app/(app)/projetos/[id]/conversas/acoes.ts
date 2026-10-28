"use server";

import { z } from "zod";
import { falha, mensagemErroBanco, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { exigirPermissao } from "@/lib/projeto/servidor";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { enfileirarMensagemWhatsApp } from "@/lib/whatsapp/enviar";

// Server Actions do módulo Conversas WhatsApp. Toda ação: zod → permissão no servidor → confere que o
// grupo/mensagem é do projeto informado → grava com o cliente do usuário (a RLS confere de novo).
//
// Regra da "próxima ata" (Criar pendência / Levar para a próxima ata):
//   a ata em RASCUNHO do projeto com data >= hoje (fuso America/Sao_Paulo) mais próxima;
//   se não houver, cria uma ata rascunho "Pendências do WhatsApp" com data de hoje e o usuário como
//   redator. Só o gerente (ata_redigir; RLS meetings_write / meeting_actions_insert) pode.

// Regex permissiva (e não z.uuid()): os ids do seed não seguem a RFC 4122.
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Identificador inválido.");

const FUSO = "America/Sao_Paulo";
const TITULO_ATA_PENDENCIAS = "Pendências do WhatsApp";
const BUCKET_ANEXOS = "documentos";

function erroPermissao(e: unknown) {
  return falha(e instanceof Error ? e.message : "Você não tem permissão para esta ação neste projeto.");
}

function primeiroErro(e: z.ZodError) {
  return e.issues[0]?.message ?? "Dados inválidos.";
}

/** Data de hoje (AAAA-MM-DD) no fuso do projeto. */
function hojeSp(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function dataHoraSp(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

type Supa = Awaited<ReturnType<typeof createClient>>;

async function lerGrupo(supabase: Supa, projectId: string, groupId: string) {
  const { data } = await supabase
    .from("wa_groups")
    .select("id, project_id, nome, equipe, ativo")
    .eq("id", groupId)
    .eq("project_id", projectId)
    .maybeSingle();
  return data as { id: string; project_id: string; nome: string; equipe: string; ativo: boolean } | null;
}

// ---------------------------------------------------------------------------------------------
// Marcar como lido (estado do próprio usuário; a RLS de wa_read_state só aceita a própria linha)
// ---------------------------------------------------------------------------------------------
const esquemaLido = z.object({ projectId: uuid, groupId: uuid });

export async function marcarComoLido(entrada: z.input<typeof esquemaLido>): Promise<ResultadoAcao<{ lidoEm: string }>> {
  const v = esquemaLido.safeParse(entrada);
  if (!v.success) return falha(primeiroErro(v.error));
  const supabase = await createClient();
  if (!(await lerGrupo(supabase, v.data.projectId, v.data.groupId))) return falha("Grupo não encontrado neste projeto.");
  const { data, error } = await supabase.rpc("fn_wa_marcar_lido", { p_group_id: v.data.groupId });
  if (error) return falha(mensagemErroBanco(error));
  return sucesso({ lidoEm: data as string });
}

// ---------------------------------------------------------------------------------------------
// Anexo: URL assinada de upload (o bucket "documentos" só aceita escrita do gerente; como todos que
// respondem podem anexar, o servidor confere whatsapp_responder e emite a URL com a service_role).
// Caminho: documentos/<projeto>/whatsapp/<grupo>/<timestamp>-<arquivo>
// ---------------------------------------------------------------------------------------------
const TAMANHO_MAX_ANEXO = 16 * 1024 * 1024; // limite do WhatsApp para documentos comuns

const esquemaAnexo = z.object({
  projectId: uuid,
  groupId: uuid,
  nomeArquivo: z.string().trim().min(1, "Arquivo sem nome.").max(200),
  tamanho: z.number().int().positive().max(TAMANHO_MAX_ANEXO, "O arquivo passa de 16 MB."),
});

function nomeSeguro(nome: string) {
  const base = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return (base || "arquivo").slice(-120);
}

export async function prepararAnexo(
  entrada: z.input<typeof esquemaAnexo>,
): Promise<ResultadoAcao<{ bucket: string; caminho: string; token: string; mediaPath: string }>> {
  const v = esquemaAnexo.safeParse(entrada);
  if (!v.success) return falha(primeiroErro(v.error));
  try {
    await exigirPermissao(v.data.projectId, "whatsapp_responder");
  } catch (e) {
    return erroPermissao(e);
  }
  const supabase = await createClient();
  const grupo = await lerGrupo(supabase, v.data.projectId, v.data.groupId);
  if (!grupo) return falha("Grupo não encontrado neste projeto.");
  if (!grupo.ativo) return falha("Este grupo está arquivado: não é possível enviar mensagens.");

  const caminho = `${v.data.projectId}/whatsapp/${v.data.groupId}/${Date.now()}-${nomeSeguro(v.data.nomeArquivo)}`;
  const { data, error } = await createAdminClient().storage.from(BUCKET_ANEXOS).createSignedUploadUrl(caminho);
  if (error || !data) return falha("Não foi possível preparar o envio do arquivo.");
  return sucesso({ bucket: BUCKET_ANEXOS, caminho, token: data.token, mediaPath: `${BUCKET_ANEXOS}/${caminho}` });
}

// ---------------------------------------------------------------------------------------------
// Enviar mensagem (fila wa_messages + Edge Function openwa-send, via contrato compartilhado)
// ---------------------------------------------------------------------------------------------
const esquemaEnvio = z
  .object({
    projectId: uuid,
    groupId: uuid,
    body: z.string().max(4000, "Mensagem longa demais (máx. 4.000 caracteres).").optional().default(""),
    mediaPath: z.string().max(500).nullable().optional(),
    quotedWaMessageId: z.string().max(200).nullable().optional(),
  })
  .refine((v) => !!v.body.trim() || !!v.mediaPath, { message: "Escreva uma mensagem ou anexe um arquivo." });

export async function enviarMensagem(
  entrada: z.input<typeof esquemaEnvio>,
): Promise<ResultadoAcao<{ id: string; enviadaAgora: boolean }>> {
  const v = esquemaEnvio.safeParse(entrada);
  if (!v.success) return falha(primeiroErro(v.error));
  try {
    await exigirPermissao(v.data.projectId, "whatsapp_responder");
  } catch (e) {
    return erroPermissao(e);
  }
  const supabase = await createClient();
  const grupo = await lerGrupo(supabase, v.data.projectId, v.data.groupId);
  if (!grupo) return falha("Grupo não encontrado neste projeto.");
  if (!grupo.ativo) return falha("Este grupo está arquivado: não é possível enviar mensagens.");

  // Só aceita anexo subido por prepararAnexo para este grupo.
  const prefixo = `${BUCKET_ANEXOS}/${v.data.projectId}/whatsapp/${v.data.groupId}/`;
  if (v.data.mediaPath && (!v.data.mediaPath.startsWith(prefixo) || v.data.mediaPath.includes(".."))) {
    return falha("Anexo inválido. Anexe o arquivo novamente.");
  }

  // A citação precisa ser de uma mensagem do mesmo grupo.
  if (v.data.quotedWaMessageId) {
    const { data: citada } = await supabase
      .from("wa_messages")
      .select("id")
      .eq("wa_message_id", v.data.quotedWaMessageId)
      .eq("group_id", v.data.groupId)
      .maybeSingle();
    if (!citada) return falha("A mensagem citada não está mais disponível.");
  }

  return enfileirarMensagemWhatsApp({
    groupId: v.data.groupId,
    body: v.data.body.trim() || undefined,
    mediaPath: v.data.mediaPath ?? undefined,
    quotedWaMessageId: v.data.quotedWaMessageId ?? undefined,
  });
}

// ---------------------------------------------------------------------------------------------
// Automação do grupo (gerente)
// ---------------------------------------------------------------------------------------------
const esquemaAutomacao = z.object({
  projectId: uuid,
  groupId: uuid,
  campo: z.enum(["auto_evidencia", "auto_os"]),
  valor: z.boolean(),
});

export async function alterarAutomacao(entrada: z.input<typeof esquemaAutomacao>): Promise<ResultadoAcao<void>> {
  const v = esquemaAutomacao.safeParse(entrada);
  if (!v.success) return falha(primeiroErro(v.error));
  try {
    await exigirPermissao(v.data.projectId, "whatsapp_grupos_gerir");
  } catch (e) {
    return erroPermissao(e);
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("wa_groups")
    .update({ [v.data.campo]: v.data.valor })
    .eq("id", v.data.groupId)
    .eq("project_id", v.data.projectId)
    .select("id")
    .single();
  if (error) return falha(mensagemErroBanco(error));
  return sucesso(undefined);
}

// ---------------------------------------------------------------------------------------------
// Próxima ata (rascunho, data >= hoje) — ou cria "Pendências do WhatsApp"
// ---------------------------------------------------------------------------------------------
export type AtaDestino = { id: string; numero: number; titulo: string; data: string; criada: boolean };

async function proximaAtaRascunho(supabase: Supa, projectId: string, userId: string): Promise<ResultadoAcao<AtaDestino & { pauta: unknown }>> {
  const hoje = hojeSp();
  const { data: existente, error } = await supabase
    .from("meetings")
    .select("id, numero, titulo, data, pauta")
    .eq("project_id", projectId)
    .eq("status", "rascunho")
    .gte("data", hoje)
    .order("data", { ascending: true })
    .order("numero", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) return falha(mensagemErroBanco(error));
  if (existente) return sucesso({ ...(existente as Omit<AtaDestino, "criada"> & { pauta: unknown }), criada: false });

  const { data: nova, error: erroNova } = await supabase
    .from("meetings")
    .insert({ project_id: projectId, titulo: TITULO_ATA_PENDENCIAS, data: hoje, status: "rascunho", redator_id: userId, pauta: [] })
    .select("id, numero, titulo, data, pauta")
    .single();
  if (erroNova || !nova) return falha(mensagemErroBanco(erroNova));
  return sucesso({ ...(nova as Omit<AtaDestino, "criada"> & { pauta: unknown }), criada: true });
}

type MensagemOrigem = {
  id: string;
  body: string | null;
  media_path: string | null;
  created_at: string;
  author_phone: string | null;
  author_user_id: string | null;
  group: { project_id: string; nome: string } | { project_id: string; nome: string }[] | null;
};

async function lerMensagemDoProjeto(supabase: Supa, projectId: string, messageId: string) {
  const { data } = await supabase
    .from("wa_messages")
    .select("id, body, media_path, created_at, author_phone, author_user_id, group:wa_groups!group_id(project_id, nome)")
    .eq("id", messageId)
    .maybeSingle();
  const m = data as MensagemOrigem | null;
  const grupo = m ? (Array.isArray(m.group) ? m.group[0] : m.group) : null;
  if (!m || !grupo || grupo.project_id !== projectId) return null;
  return { ...m, grupoNome: grupo.nome };
}

async function nomeAutor(supabase: Supa, m: { author_user_id: string | null; author_phone: string | null }) {
  if (m.author_user_id) {
    const { data } = await supabase.from("profiles").select("nome").eq("id", m.author_user_id).maybeSingle();
    if (data?.nome) return data.nome as string;
  }
  if (m.author_phone) {
    const d = m.author_phone.replace(/\D/g, "");
    const { data } = await supabase.from("profiles").select("nome").eq("telefone_whatsapp", d).limit(1).maybeSingle();
    if (data?.nome) return data.nome as string;
    return `+${d}`;
  }
  return "Sistema";
}

// ---------------------------------------------------------------------------------------------
// Criar pendência (encaminhamento na próxima ata)
// ---------------------------------------------------------------------------------------------
const esquemaPendencia = z.object({
  projectId: uuid,
  messageId: uuid,
  acao: z.string().trim().min(3, "Descreva a pendência (mín. 3 caracteres).").max(1000),
  responsavelId: uuid.nullable(),
  prazo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Prazo inválido.")
    .nullable(),
});

export async function criarPendencia(entrada: z.input<typeof esquemaPendencia>): Promise<ResultadoAcao<AtaDestino>> {
  const v = esquemaPendencia.safeParse(entrada);
  if (!v.success) return falha(primeiroErro(v.error));
  let userId: string;
  try {
    ({ userId } = await exigirPermissao(v.data.projectId, "ata_redigir"));
  } catch (e) {
    return erroPermissao(e);
  }
  const supabase = await createClient();
  if (!(await lerMensagemDoProjeto(supabase, v.data.projectId, v.data.messageId))) return falha("Mensagem não encontrada neste projeto.");

  if (v.data.responsavelId) {
    const { data: membro } = await supabase
      .from("project_members")
      .select("user_id")
      .eq("project_id", v.data.projectId)
      .eq("user_id", v.data.responsavelId)
      .eq("ativo", true)
      .maybeSingle();
    if (!membro) return falha("O responsável precisa ser membro ativo do projeto.");
  }

  const ata = await proximaAtaRascunho(supabase, v.data.projectId, userId);
  if (!ata.ok) return ata;

  const { error } = await supabase.from("meeting_actions").insert({
    meeting_id: ata.dados.id,
    acao: v.data.acao,
    responsavel_id: v.data.responsavelId,
    prazo: v.data.prazo,
    status: "aberta",
  });
  if (error) return falha(mensagemErroBanco(error));
  const { pauta: _pauta, ...destino } = ata.dados;
  void _pauta;
  return sucesso(destino);
}

// ---------------------------------------------------------------------------------------------
// Levar para a próxima ata (item de pauta com autor e data)
// ---------------------------------------------------------------------------------------------
const esquemaPauta = z.object({ projectId: uuid, messageId: uuid });

export async function levarParaProximaAta(entrada: z.input<typeof esquemaPauta>): Promise<ResultadoAcao<AtaDestino>> {
  const v = esquemaPauta.safeParse(entrada);
  if (!v.success) return falha(primeiroErro(v.error));
  let userId: string;
  try {
    ({ userId } = await exigirPermissao(v.data.projectId, "ata_redigir"));
  } catch (e) {
    return erroPermissao(e);
  }
  const supabase = await createClient();
  const msg = await lerMensagemDoProjeto(supabase, v.data.projectId, v.data.messageId);
  if (!msg) return falha("Mensagem não encontrada neste projeto.");

  const texto =
    msg.body?.replace(/\s+/g, " ").trim() ||
    (msg.media_path ? `Arquivo: ${msg.media_path.split("/").at(-1)}` : "");
  if (!texto) return falha("A mensagem não tem texto para levar à pauta.");
  const autor = await nomeAutor(supabase, msg);
  // Mesmo formato de texto simples da pauta das atas (array de strings, como no seed).
  const item = `${texto.slice(0, 800)} — ${autor}, ${dataHoraSp(msg.created_at)} (WhatsApp · ${msg.grupoNome})`;

  const ata = await proximaAtaRascunho(supabase, v.data.projectId, userId);
  if (!ata.ok) return ata;

  const pautaAtual = Array.isArray(ata.dados.pauta) ? (ata.dados.pauta as unknown[]) : [];
  if (pautaAtual.some((p) => p === item)) return falha("Esta mensagem já está na pauta da próxima ata.");

  const { error } = await supabase
    .from("meetings")
    .update({ pauta: [...pautaAtual, item] })
    .eq("id", ata.dados.id)
    .eq("status", "rascunho")
    .select("id")
    .single();
  if (error) return falha(mensagemErroBanco(error));
  const { pauta: _pauta, ...destino } = ata.dados;
  void _pauta;
  return sucesso(destino);
}
