"use server";

import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { headers } from "next/headers";
import { z } from "zod";
import { falha, mensagemErroBanco, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { pode } from "@/lib/projeto/permissoes";
import { exigirPermissao, papelNoProjeto } from "@/lib/projeto/servidor";
import type { MeetingStatus } from "@/lib/projeto/tipos";
import { createClient } from "@/lib/supabase/server";
import { enfileirarMensagemWhatsApp } from "@/lib/whatsapp/enviar";
import { enviarEmail, type ResultadoEmail } from "./email";

// Server Actions do módulo Atas de reunião. Toda ação: zod → permissão no servidor (exigirPermissao) →
// grava com o cliente do usuário (a RLS confere de novo no banco).
//
// Regras de edição (decididas neste módulo):
//  * dados, pauta e decisões: só o gerente e só com a ata em RASCUNHO (publicada = conteúdo congelado; para
//    corrigir, "Voltar para rascunho");
//  * participantes e presença: gerente, enquanto a ata não estiver APROVADA;
//  * encaminhamentos: gerente cria/edita/remove enquanto não estiver aprovada; a situação (aberta, em andamento…)
//    pode ser atualizada a qualquer momento pelo gerente ou pelo responsável; o toggle "No cronograma" é do gerente;
//  * fluxo: rascunho → publicada → aprovada; publicada → rascunho (reabrir). Aprovada é final.

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Identificador inválido.");
const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
const hora = z
  .string()
  .regex(/^\d{2}:\d{2}(:\d{2})?$/, "Horário inválido.")
  .nullable();

type ErroBanco = { code?: string; message?: string } | null | undefined;

/** Preserva mensagens em português levantadas pelas funções do módulo (ex.: "Defina o prazo…"). */
function erroAtas(error: ErroBanco): string {
  const m = error?.message ?? "";
  const generica = /row-level security|permission denied|violates|syntax/i.test(m);
  if (error && ["42501", "23514", "P0001", "P0002"].includes(error.code ?? "") && m && !generica) return m;
  return mensagemErroBanco(error);
}

function erroPermissao(e: unknown) {
  return falha(e instanceof Error ? e.message : "Você não tem permissão para esta ação neste projeto.");
}

type AtaServidor = {
  id: string;
  project_id: string;
  numero: number;
  titulo: string;
  data: string;
  inicio: string | null;
  fim: string | null;
  local: string | null;
  status: MeetingStatus;
  decisoes: unknown;
};

/** Lê a ata garantindo que pertence ao projeto informado (a permissão foi conferida para esse projeto). */
async function lerAta(projectId: string, meetingId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meetings")
    .select("id, project_id, numero, titulo, data, inicio, fim, local, status, decisoes")
    .eq("id", meetingId)
    .eq("project_id", projectId)
    .maybeSingle();
  return { supabase, ata: data as AtaServidor | null, error };
}

const SEM_ATA = "Ata não encontrada neste projeto.";

// ---------------------------------------------------------------------------------------------
// Nova ata / editar dados
// ---------------------------------------------------------------------------------------------
const esquemaDados = z
  .object({
    projectId: uuid,
    titulo: z.string().trim().min(3, "Informe um título com ao menos 3 caracteres.").max(200, "Título muito longo."),
    data: dataIso,
    inicio: hora,
    fim: hora,
    local: z.string().trim().max(200, "Local muito longo.").nullable(),
  })
  .refine((v) => !v.inicio || !v.fim || v.fim >= v.inicio, { message: "O fim deve ser depois do início.", path: ["fim"] });

export type EntradaDadosAta = z.input<typeof esquemaDados>;

export async function criarAta(entrada: EntradaDadosAta): Promise<ResultadoAcao<{ id: string; numero: number }>> {
  const v = esquemaDados.safeParse(entrada);
  if (!v.success) return falha(v.error.issues[0]?.message ?? "Dados inválidos.");
  const d = v.data;
  let userId: string;
  try {
    ({ userId } = await exigirPermissao(d.projectId, "ata_redigir"));
  } catch (e) {
    return erroPermissao(e);
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meetings")
    .insert({
      project_id: d.projectId,
      titulo: d.titulo,
      data: d.data,
      inicio: d.inicio,
      fim: d.fim,
      local: d.local || null,
      status: "rascunho",
      redator_id: userId,
      pauta: [],
      decisoes: [],
    })
    .select("id, numero")
    .single();
  if (error || !data) return falha(erroAtas(error));
  return sucesso({ id: data.id as string, numero: data.numero as number });
}

export async function atualizarDadosAta(
  entrada: EntradaDadosAta & { meetingId: string },
): Promise<ResultadoAcao<null>> {
  const v = esquemaDados.safeParse(entrada);
  const id = uuid.safeParse(entrada.meetingId);
  if (!v.success) return falha(v.error.issues[0]?.message ?? "Dados inválidos.");
  if (!id.success) return falha("Identificador inválido.");
  const d = v.data;
  try {
    await exigirPermissao(d.projectId, "ata_redigir");
  } catch (e) {
    return erroPermissao(e);
  }
  const { supabase, ata } = await lerAta(d.projectId, id.data);
  if (!ata) return falha(SEM_ATA);
  if (ata.status !== "rascunho") return falha("Só é possível editar os dados de uma ata em rascunho.");
  const { error } = await supabase
    .from("meetings")
    .update({ titulo: d.titulo, data: d.data, inicio: d.inicio, fim: d.fim, local: d.local || null })
    .eq("id", ata.id);
  if (error) return falha(erroAtas(error));
  return sucesso(null);
}

// ---------------------------------------------------------------------------------------------
// Situação: rascunho → publicada → aprovada (gerente)
// ---------------------------------------------------------------------------------------------
const TRANSICOES: Record<MeetingStatus, MeetingStatus[]> = {
  rascunho: ["publicada"],
  publicada: ["aprovada", "rascunho"],
  aprovada: [],
};

export async function mudarSituacaoAta(entrada: {
  projectId: string;
  meetingId: string;
  para: MeetingStatus;
}): Promise<ResultadoAcao<null>> {
  const v = z
    .object({ projectId: uuid, meetingId: uuid, para: z.enum(["rascunho", "publicada", "aprovada"]) })
    .safeParse(entrada);
  if (!v.success) return falha("Dados inválidos.");
  const d = v.data;
  try {
    await exigirPermissao(d.projectId, "ata_redigir");
  } catch (e) {
    return erroPermissao(e);
  }
  const { supabase, ata } = await lerAta(d.projectId, d.meetingId);
  if (!ata) return falha(SEM_ATA);
  if (!TRANSICOES[ata.status].includes(d.para)) return falha("Mudança de situação não permitida para esta ata.");

  if (d.para === "publicada") {
    const { count } = await supabase
      .from("meeting_participants")
      .select("id", { count: "exact", head: true })
      .eq("meeting_id", ata.id);
    if (!count) return falha("Adicione ao menos um participante antes de publicar a ata.");
  }

  const { error } = await supabase.from("meetings").update({ status: d.para }).eq("id", ata.id).eq("status", ata.status);
  if (error) return falha(erroAtas(error));
  return sucesso(null);
}

export async function excluirAta(entrada: { projectId: string; meetingId: string }): Promise<ResultadoAcao<null>> {
  const v = z.object({ projectId: uuid, meetingId: uuid }).safeParse(entrada);
  if (!v.success) return falha("Dados inválidos.");
  const d = v.data;
  try {
    await exigirPermissao(d.projectId, "ata_redigir");
  } catch (e) {
    return erroPermissao(e);
  }
  const { supabase, ata } = await lerAta(d.projectId, d.meetingId);
  if (!ata) return falha(SEM_ATA);
  if (ata.status !== "rascunho") return falha("Só é possível excluir uma ata em rascunho.");

  // Encaminhamentos levados ao cronograma: desfaz o vínculo (remove evento/item criado pela ata).
  const { data: ligados } = await supabase
    .from("meeting_actions")
    .select("id")
    .eq("meeting_id", ata.id)
    .eq("vincular_cronograma", true);
  for (const a of ligados ?? []) {
    const { error } = await supabase.rpc("fn_ata_encaminhamento_cronograma", { p_action_id: a.id, p_ligar: false });
    if (error) return falha(erroAtas(error));
  }

  const pasta = `${d.projectId}/atas/${ata.id}`;
  const { data: arquivos } = await supabase.storage.from("imobproj-documentos").list(pasta, { limit: 1000 });
  if (arquivos?.length) await supabase.storage.from("imobproj-documentos").remove(arquivos.map((a) => `${pasta}/${a.name}`));

  const { error } = await supabase.from("meetings").delete().eq("id", ata.id);
  if (error) return falha(erroAtas(error));
  return sucesso(null);
}

// ---------------------------------------------------------------------------------------------
// Pauta e decisões (gerente, rascunho)
// ---------------------------------------------------------------------------------------------
export async function salvarListaAta(entrada: {
  projectId: string;
  meetingId: string;
  campo: "pauta" | "decisoes";
  itens: string[];
}): Promise<ResultadoAcao<null>> {
  const v = z
    .object({
      projectId: uuid,
      meetingId: uuid,
      campo: z.enum(["pauta", "decisoes"]),
      itens: z.array(z.string().trim().min(1, "Item vazio.").max(1000, "Item muito longo.")).max(200),
    })
    .safeParse(entrada);
  if (!v.success) return falha(v.error.issues[0]?.message ?? "Dados inválidos.");
  const d = v.data;
  try {
    await exigirPermissao(d.projectId, "ata_redigir");
  } catch (e) {
    return erroPermissao(e);
  }
  const { supabase, ata } = await lerAta(d.projectId, d.meetingId);
  if (!ata) return falha(SEM_ATA);
  if (ata.status !== "rascunho") return falha("Pauta e decisões só podem ser editadas com a ata em rascunho.");
  const { error } = await supabase
    .from("meetings")
    .update({ [d.campo]: d.itens })
    .eq("id", ata.id);
  if (error) return falha(erroAtas(error));
  return sucesso(null);
}

// ---------------------------------------------------------------------------------------------
// Participantes
// ---------------------------------------------------------------------------------------------
export async function adicionarParticipantes(entrada: {
  projectId: string;
  meetingId: string;
  userIds: string[];
}): Promise<ResultadoAcao<{ adicionados: number }>> {
  const v = z
    .object({ projectId: uuid, meetingId: uuid, userIds: z.array(uuid).min(1, "Escolha ao menos uma pessoa.").max(100) })
    .safeParse(entrada);
  if (!v.success) return falha(v.error.issues[0]?.message ?? "Dados inválidos.");
  const d = v.data;
  try {
    await exigirPermissao(d.projectId, "ata_redigir");
  } catch (e) {
    return erroPermissao(e);
  }
  const { supabase, ata } = await lerAta(d.projectId, d.meetingId);
  if (!ata) return falha(SEM_ATA);
  if (ata.status === "aprovada") return falha("A ata já foi aprovada: participantes não podem mais ser alterados.");

  // Só membros ativos do projeto
  const { data: membros, error: erroMembros } = await supabase
    .from("project_members")
    .select("user_id")
    .eq("project_id", d.projectId)
    .eq("ativo", true)
    .in("user_id", d.userIds);
  if (erroMembros) return falha(erroAtas(erroMembros));
  const validos = (membros ?? []).map((m) => m.user_id as string);
  if (validos.length === 0) return falha("As pessoas escolhidas não são membros ativos do projeto.");

  const { data, error } = await supabase
    .from("meeting_participants")
    .upsert(
      validos.map((user_id) => ({ meeting_id: ata.id, user_id, presenca: "presente" as const })),
      { onConflict: "meeting_id,user_id", ignoreDuplicates: true },
    )
    .select("id");
  if (error) return falha(erroAtas(error));
  return sucesso({ adicionados: data?.length ?? 0 });
}

async function lerParticipante(projectId: string, participanteId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("meeting_participants")
    .select("id, meeting_id, user_id, ciente_em, ata:meetings!meeting_id(project_id, status)")
    .eq("id", participanteId)
    .maybeSingle();
  const bruto = data as null | {
    id: string;
    meeting_id: string;
    user_id: string;
    ciente_em: string | null;
    ata: { project_id: string; status: MeetingStatus } | { project_id: string; status: MeetingStatus }[] | null;
  };
  const ata = Array.isArray(bruto?.ata) ? bruto?.ata[0] : bruto?.ata;
  if (!bruto || !ata || ata.project_id !== projectId) return { supabase, participante: null };
  return { supabase, participante: { ...bruto, ata } };
}

export async function removerParticipante(entrada: {
  projectId: string;
  participanteId: string;
}): Promise<ResultadoAcao<null>> {
  const v = z.object({ projectId: uuid, participanteId: uuid }).safeParse(entrada);
  if (!v.success) return falha("Dados inválidos.");
  try {
    await exigirPermissao(v.data.projectId, "ata_redigir");
  } catch (e) {
    return erroPermissao(e);
  }
  const { supabase, participante } = await lerParticipante(v.data.projectId, v.data.participanteId);
  if (!participante) return falha("Participante não encontrado nesta ata.");
  if (participante.ata.status === "aprovada") return falha("A ata já foi aprovada: participantes não podem mais ser alterados.");
  const { error } = await supabase.from("meeting_participants").delete().eq("id", participante.id);
  if (error) return falha(erroAtas(error));
  return sucesso(null);
}

export async function definirPresenca(entrada: {
  projectId: string;
  participanteId: string;
  presenca: "presente" | "ausente";
}): Promise<ResultadoAcao<null>> {
  const v = z
    .object({ projectId: uuid, participanteId: uuid, presenca: z.enum(["presente", "ausente"]) })
    .safeParse(entrada);
  if (!v.success) return falha("Dados inválidos.");
  try {
    await exigirPermissao(v.data.projectId, "ata_redigir");
  } catch (e) {
    return erroPermissao(e);
  }
  const { supabase, participante } = await lerParticipante(v.data.projectId, v.data.participanteId);
  if (!participante) return falha("Participante não encontrado nesta ata.");
  if (participante.ata.status === "aprovada") return falha("A ata já foi aprovada: a presença não pode mais ser alterada.");
  const { error } = await supabase
    .from("meeting_participants")
    .update({ presenca: v.data.presenca })
    .eq("id", participante.id);
  if (error) return falha(erroAtas(error));
  return sucesso(null);
}

/** "Dar ciência" do próprio usuário (diretor, usuário-chave ou super admin) numa ata publicada. */
export async function darCiencia(entrada: { projectId: string; meetingId: string }): Promise<ResultadoAcao<{ cienteEm: string }>> {
  const v = z.object({ projectId: uuid, meetingId: uuid }).safeParse(entrada);
  if (!v.success) return falha("Dados inválidos.");
  let userId: string;
  try {
    ({ userId } = await exigirPermissao(v.data.projectId, "ata_ciencia"));
  } catch (e) {
    return erroPermissao(e);
  }
  const { supabase, ata } = await lerAta(v.data.projectId, v.data.meetingId);
  if (!ata) return falha(SEM_ATA);
  if (ata.status !== "publicada") return falha("A ciência é dada com a ata publicada.");
  const agora = new Date().toISOString();
  const { data, error } = await supabase
    .from("meeting_participants")
    .update({ ciente_em: agora })
    .eq("meeting_id", ata.id)
    .eq("user_id", userId)
    .is("ciente_em", null)
    .select("id");
  if (error) return falha(erroAtas(error));
  if (!data?.length) return falha("Você não é participante desta ata ou já deu ciência.");
  return sucesso({ cienteEm: agora });
}

// ---------------------------------------------------------------------------------------------
// Encaminhamentos
// ---------------------------------------------------------------------------------------------
const STATUS_ACAO = z.enum(["aberta", "em_andamento", "concluida", "cancelada"]);

const esquemaEncaminhamento = z.object({
  projectId: uuid,
  meetingId: uuid,
  acao: z.string().trim().min(3, "Descreva a ação com ao menos 3 caracteres.").max(1000, "Ação muito longa."),
  responsavelId: uuid.nullable(),
  prazo: dataIso.nullable(),
  status: STATUS_ACAO,
});

export type EntradaEncaminhamento = z.input<typeof esquemaEncaminhamento>;

async function responsavelValido(projectId: string, responsavelId: string | null) {
  if (!responsavelId) return true;
  const supabase = await createClient();
  const { data } = await supabase
    .from("project_members")
    .select("id")
    .eq("project_id", projectId)
    .eq("user_id", responsavelId)
    .eq("ativo", true)
    .maybeSingle();
  return !!data;
}

export async function criarEncaminhamento(entrada: EntradaEncaminhamento): Promise<ResultadoAcao<{ id: string }>> {
  const v = esquemaEncaminhamento.safeParse(entrada);
  if (!v.success) return falha(v.error.issues[0]?.message ?? "Dados inválidos.");
  const d = v.data;
  try {
    await exigirPermissao(d.projectId, "ata_redigir");
  } catch (e) {
    return erroPermissao(e);
  }
  const { supabase, ata } = await lerAta(d.projectId, d.meetingId);
  if (!ata) return falha(SEM_ATA);
  if (ata.status === "aprovada") return falha("A ata já foi aprovada: não é possível incluir encaminhamentos.");
  if (!(await responsavelValido(d.projectId, d.responsavelId))) return falha("O responsável precisa ser membro do projeto.");
  const { data, error } = await supabase
    .from("meeting_actions")
    .insert({
      meeting_id: ata.id,
      acao: d.acao,
      responsavel_id: d.responsavelId,
      prazo: d.prazo,
      status: d.status,
      vincular_cronograma: false,
    })
    .select("id")
    .single();
  if (error || !data) return falha(erroAtas(error));
  return sucesso({ id: data.id as string });
}

type EncaminhamentoServidor = {
  id: string;
  meeting_id: string;
  responsavel_id: string | null;
  vincular_cronograma: boolean;
  wbs_item_id: string | null;
  ata: { project_id: string; status: MeetingStatus } | null;
};

async function lerEncaminhamento(projectId: string, actionId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("meeting_actions")
    .select("id, meeting_id, responsavel_id, vincular_cronograma, wbs_item_id, ata:meetings!meeting_id(project_id, status)")
    .eq("id", actionId)
    .maybeSingle();
  const bruto = data as (Omit<EncaminhamentoServidor, "ata"> & { ata: unknown }) | null;
  if (!bruto) return { supabase, enc: null };
  const ata = (Array.isArray(bruto.ata) ? bruto.ata[0] : bruto.ata) as EncaminhamentoServidor["ata"];
  if (!ata || ata.project_id !== projectId) return { supabase, enc: null };
  return { supabase, enc: { ...bruto, ata } as EncaminhamentoServidor };
}

export async function atualizarEncaminhamento(
  entrada: Omit<EntradaEncaminhamento, "meetingId"> & { actionId: string },
): Promise<ResultadoAcao<{ sincronizado: boolean }>> {
  const v = esquemaEncaminhamento.omit({ meetingId: true }).extend({ actionId: uuid }).safeParse(entrada);
  if (!v.success) return falha(v.error.issues[0]?.message ?? "Dados inválidos.");
  const d = v.data;
  try {
    await exigirPermissao(d.projectId, "ata_redigir");
  } catch (e) {
    return erroPermissao(e);
  }
  const { supabase, enc } = await lerEncaminhamento(d.projectId, d.actionId);
  if (!enc?.ata) return falha("Encaminhamento não encontrado neste projeto.");
  if (enc.ata.status === "aprovada") return falha("A ata já foi aprovada: edite apenas a situação do encaminhamento.");
  if (!(await responsavelValido(d.projectId, d.responsavelId))) return falha("O responsável precisa ser membro do projeto.");
  if (enc.vincular_cronograma && !d.prazo) return falha("Encaminhamento no cronograma precisa de prazo. Desligue o cronograma antes de remover o prazo.");

  const { error } = await supabase
    .from("meeting_actions")
    .update({ acao: d.acao, responsavel_id: d.responsavelId, prazo: d.prazo, status: d.status })
    .eq("id", enc.id);
  if (error) return falha(erroAtas(error));

  // No cronograma: reflete título/responsável/prazo no item da EAP e no evento
  if (enc.vincular_cronograma) {
    const { error: erroSync } = await supabase.rpc("fn_ata_encaminhamento_cronograma", {
      p_action_id: enc.id,
      p_ligar: true,
    });
    if (erroSync) return falha(`Encaminhamento salvo, mas o cronograma não foi atualizado: ${erroAtas(erroSync)}`);
    return sucesso({ sincronizado: true });
  }
  return sucesso({ sincronizado: false });
}

/** Situação do encaminhamento: gerente ou o próprio responsável (a RLS meeting_actions_update permite os dois). */
export async function mudarStatusEncaminhamento(entrada: {
  projectId: string;
  actionId: string;
  status: z.infer<typeof STATUS_ACAO>;
}): Promise<ResultadoAcao<null>> {
  const v = z.object({ projectId: uuid, actionId: uuid, status: STATUS_ACAO }).safeParse(entrada);
  if (!v.success) return falha("Dados inválidos.");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return falha("Sua sessão expirou. Entre novamente.");
  const papel = await papelNoProjeto(v.data.projectId);
  const { enc } = await lerEncaminhamento(v.data.projectId, v.data.actionId);
  if (!enc) return falha("Encaminhamento não encontrado neste projeto.");
  if (!pode(papel, "ata_redigir") && enc.responsavel_id !== user.id)
    return falha("Somente o gerente ou o responsável atualizam a situação do encaminhamento.");
  const { error } = await supabase.from("meeting_actions").update({ status: v.data.status }).eq("id", enc.id);
  if (error) return falha(erroAtas(error));
  return sucesso(null);
}

export async function removerEncaminhamento(entrada: { projectId: string; actionId: string }): Promise<ResultadoAcao<null>> {
  const v = z.object({ projectId: uuid, actionId: uuid }).safeParse(entrada);
  if (!v.success) return falha("Dados inválidos.");
  try {
    await exigirPermissao(v.data.projectId, "ata_redigir");
  } catch (e) {
    return erroPermissao(e);
  }
  const { supabase, enc } = await lerEncaminhamento(v.data.projectId, v.data.actionId);
  if (!enc?.ata) return falha("Encaminhamento não encontrado neste projeto.");
  if (enc.ata.status === "aprovada") return falha("A ata já foi aprovada: encaminhamentos não podem ser removidos.");
  if (enc.vincular_cronograma) {
    const { error } = await supabase.rpc("fn_ata_encaminhamento_cronograma", { p_action_id: enc.id, p_ligar: false });
    if (error) return falha(erroAtas(error));
  }
  const { error } = await supabase.from("meeting_actions").delete().eq("id", enc.id);
  if (error) return falha(erroAtas(error));
  return sucesso(null);
}

/** Toggle "No cronograma" (gerente). Atômico no banco: fn_ata_encaminhamento_cronograma. */
export async function alternarCronograma(entrada: {
  projectId: string;
  actionId: string;
  ligar: boolean;
}): Promise<ResultadoAcao<{ wbsItemId: string | null; itemRemovido: boolean }>> {
  const v = z.object({ projectId: uuid, actionId: uuid, ligar: z.boolean() }).safeParse(entrada);
  if (!v.success) return falha("Dados inválidos.");
  try {
    await exigirPermissao(v.data.projectId, "cronograma_editar");
    await exigirPermissao(v.data.projectId, "ata_redigir");
  } catch (e) {
    return erroPermissao(e);
  }
  const { supabase, enc } = await lerEncaminhamento(v.data.projectId, v.data.actionId);
  if (!enc) return falha("Encaminhamento não encontrado neste projeto.");
  const { data, error } = await supabase.rpc("fn_ata_encaminhamento_cronograma", {
    p_action_id: enc.id,
    p_ligar: v.data.ligar,
  });
  if (error) return falha(erroAtas(error));
  const r = (data ?? {}) as { wbs_item_id?: string | null; item_removido?: boolean };
  return sucesso({ wbsItemId: r.wbs_item_id ?? null, itemRemovido: !!r.item_removido });
}

// ---------------------------------------------------------------------------------------------
// Anexos (upload direto do navegador no bucket "documentos" — RLS de storage: gerente; remoção aqui)
// ---------------------------------------------------------------------------------------------
export async function removerAnexo(entrada: {
  projectId: string;
  meetingId: string;
  nome: string;
}): Promise<ResultadoAcao<null>> {
  const v = z
    .object({
      projectId: uuid,
      meetingId: uuid,
      nome: z
        .string()
        .min(1)
        .max(300)
        .refine((n) => !n.includes("/") && !n.includes(".."), "Nome de arquivo inválido."),
    })
    .safeParse(entrada);
  if (!v.success) return falha(v.error.issues[0]?.message ?? "Dados inválidos.");
  try {
    await exigirPermissao(v.data.projectId, "ata_redigir");
  } catch (e) {
    return erroPermissao(e);
  }
  const { supabase, ata } = await lerAta(v.data.projectId, v.data.meetingId);
  if (!ata) return falha(SEM_ATA);
  if (ata.status === "aprovada") return falha("A ata já foi aprovada: anexos não podem ser removidos.");
  const { data, error } = await supabase.storage
    .from("imobproj-documentos")
    .remove([`${v.data.projectId}/atas/${ata.id}/${v.data.nome}`]);
  if (error) return falha("Não foi possível remover o anexo.");
  if (!data?.length) return falha("Anexo não encontrado (ou você não tem permissão para removê-lo).");
  return sucesso(null);
}

// ---------------------------------------------------------------------------------------------
// WhatsApp e e-mail
// ---------------------------------------------------------------------------------------------
async function grupoDoProjeto(projectId: string, groupId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("wa_groups")
    .select("id, nome")
    .eq("id", groupId)
    .eq("project_id", projectId)
    .eq("ativo", true)
    .maybeSingle();
  return data as { id: string; nome: string } | null;
}

function cabecalhoAta(ata: AtaServidor) {
  const data = format(parseISO(ata.data), "dd/MM/yyyy", { locale: ptBR });
  const horario = ata.inicio ? ` · ${ata.inicio.slice(0, 5)}${ata.fim ? `–${ata.fim.slice(0, 5)}` : ""}` : "";
  return { data, linha: `${data}${horario}${ata.local ? ` · ${ata.local}` : ""}` };
}

async function linkDaAta(projectId: string, meetingId: string) {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (base) return `${base}/projetos/${projectId}/atas?ata=${meetingId}`;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return null;
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}/projetos/${projectId}/atas?ata=${meetingId}`;
}

export type ResultadoSolicitacao = {
  pendentes: string[];
  email: ResultadoEmail["status"];
  whatsapp: "enviada" | "fila" | "nao_enviada";
  erroWhatsApp?: string;
};

/**
 * "Solicitar ciência" (gerente, ata publicada): notifica os participantes que podem dar ciência (diretor e
 * usuário-chave) e ainda não deram — por e-mail (enviarEmail; sem provedor fica registrado) e no grupo do
 * WhatsApp escolhido (enfileirarMensagemWhatsApp). Registra a solicitação em meeting_ciencia_solicitacoes.
 */
export async function solicitarCiencia(entrada: {
  projectId: string;
  meetingId: string;
  groupId: string | null;
}): Promise<ResultadoAcao<ResultadoSolicitacao>> {
  const v = z.object({ projectId: uuid, meetingId: uuid, groupId: uuid.nullable() }).safeParse(entrada);
  if (!v.success) return falha("Dados inválidos.");
  const d = v.data;
  let userId: string;
  try {
    ({ userId } = await exigirPermissao(d.projectId, "ata_redigir"));
  } catch (e) {
    return erroPermissao(e);
  }
  const { supabase, ata } = await lerAta(d.projectId, d.meetingId);
  if (!ata) return falha(SEM_ATA);
  if (ata.status !== "publicada") return falha("A ciência é solicitada com a ata publicada.");

  const grupo = d.groupId ? await grupoDoProjeto(d.projectId, d.groupId) : null;
  if (d.groupId && !grupo) return falha("Grupo do WhatsApp não encontrado ou inativo neste projeto.");

  const [{ data: participantes, error: e1 }, { data: membros, error: e2 }] = await Promise.all([
    supabase
      .from("meeting_participants")
      .select("user_id, ciente_em, perfil:profiles!user_id(nome, email)")
      .eq("meeting_id", ata.id)
      .is("ciente_em", null),
    supabase
      .from("project_members")
      .select("user_id, role")
      .eq("project_id", d.projectId)
      .eq("ativo", true)
      .in("role", ["diretor", "usuario_chave"]),
  ]);
  if (e1 || e2) return falha(erroAtas(e1 ?? e2));
  const podemDarCiencia = new Set((membros ?? []).map((m) => m.user_id as string));
  const pendentes = ((participantes ?? []) as unknown as {
    user_id: string;
    perfil: { nome: string; email: string | null } | { nome: string; email: string | null }[] | null;
  }[])
    .filter((p) => podemDarCiencia.has(p.user_id))
    .map((p) => ({ userId: p.user_id, perfil: Array.isArray(p.perfil) ? p.perfil[0] : p.perfil }))
    .map((p) => ({ userId: p.userId, nome: p.perfil?.nome || "Participante", email: p.perfil?.email ?? null }));
  if (pendentes.length === 0) return falha("Nenhuma ciência pendente: todos os diretores e usuários-chave já deram ciência.");

  const { data: dataAta, linha } = cabecalhoAta(ata);
  const link = await linkDaAta(d.projectId, ata.id);
  const titulo = `Ata nº ${ata.numero} — ${ata.titulo}`;

  // E-mail
  const email = await enviarEmail({
    para: pendentes.map((p) => p.email).filter((e): e is string => !!e),
    assunto: `[IMOBPROJ] Ciência pendente: ${titulo}`,
    texto: [
      "Olá,",
      "",
      `A ${titulo} (${linha}) foi publicada e aguarda a sua ciência.`,
      link ? `Acesse: ${link}` : "Acesse o IMOBPROJ > Atas de reunião.",
      "",
      "Obrigado.",
    ].join("\n"),
  });

  // WhatsApp
  let whatsapp: ResultadoSolicitacao["whatsapp"] = "nao_enviada";
  let erroWhatsApp: string | undefined;
  let waMessageId: string | null = null;
  if (grupo) {
    const corpo = [
      `*${titulo}* (${dataAta})`,
      `Aguardando ciência de: ${pendentes.map((p) => `@${p.nome}`).join(", ")}.`,
      link ? `Para dar ciência: ${link}` : "Para dar ciência, acesse o IMOBPROJ > Atas de reunião.",
    ].join("\n");
    const r = await enfileirarMensagemWhatsApp({ groupId: grupo.id, body: corpo });
    if (r.ok) {
      whatsapp = r.dados.enviadaAgora ? "enviada" : "fila";
      waMessageId = r.dados.id;
    } else erroWhatsApp = r.erro;
  }

  // Registro (não bloqueia o retorno se falhar)
  await supabase.from("meeting_ciencia_solicitacoes").insert({
    meeting_id: ata.id,
    solicitante_id: userId,
    destinatarios: pendentes.map((p) => p.userId),
    email_status: email.status,
    email_erro: email.erro ?? null,
    wa_group_id: grupo?.id ?? null,
    wa_message_id: waMessageId,
  });

  return sucesso({ pendentes: pendentes.map((p) => p.nome), email: email.status, whatsapp, erroWhatsApp });
}

/** "Enviar ao grupo WhatsApp": resumo da ata (título, data, decisões e encaminhamentos). Ata publicada/aprovada. */
export async function enviarResumoWhatsApp(entrada: {
  projectId: string;
  meetingId: string;
  groupId: string;
}): Promise<ResultadoAcao<{ enviadaAgora: boolean }>> {
  const v = z.object({ projectId: uuid, meetingId: uuid, groupId: uuid }).safeParse(entrada);
  if (!v.success) return falha("Escolha o grupo do WhatsApp.");
  const d = v.data;
  try {
    await exigirPermissao(d.projectId, "ata_redigir");
  } catch (e) {
    return erroPermissao(e);
  }
  const { supabase, ata } = await lerAta(d.projectId, d.meetingId);
  if (!ata) return falha(SEM_ATA);
  if (ata.status === "rascunho") return falha("Publique a ata antes de enviá-la ao grupo.");
  const grupo = await grupoDoProjeto(d.projectId, d.groupId);
  if (!grupo) return falha("Grupo do WhatsApp não encontrado ou inativo neste projeto.");

  const { data: acoes } = await supabase
    .from("meeting_actions")
    .select("acao, prazo, status, responsavel:profiles!responsavel_id(nome)")
    .eq("meeting_id", ata.id)
    .order("created_at");

  const { linha } = cabecalhoAta(ata);
  const decisoes = Array.isArray(ata.decisoes) ? (ata.decisoes as unknown[]).map(String) : [];
  const encaminhamentos = ((acoes ?? []) as unknown as {
    acao: string;
    prazo: string | null;
    status: string;
    responsavel: { nome: string } | { nome: string }[] | null;
  }[]).filter((a) => a.status !== "cancelada");

  const nome = (r: (typeof encaminhamentos)[number]["responsavel"]) => (Array.isArray(r) ? r[0]?.nome : r?.nome) ?? "a definir";
  const corpo = [
    `*Ata nº ${ata.numero} — ${ata.titulo}*`,
    linha,
    "",
    "*Decisões*",
    ...(decisoes.length ? decisoes.map((t, i) => `${i + 1}. ${t}`) : ["Nenhuma decisão registrada."]),
    "",
    "*Encaminhamentos*",
    ...(encaminhamentos.length
      ? encaminhamentos.map(
          (a) =>
            `• ${a.acao} — ${nome(a.responsavel)}${a.prazo ? `, até ${format(parseISO(a.prazo), "dd/MM/yyyy")}` : ""}`,
        )
      : ["Nenhum encaminhamento."]),
  ].join("\n");

  const r = await enfileirarMensagemWhatsApp({ groupId: grupo.id, body: corpo });
  if (!r.ok) return falha(r.erro);
  return sucesso({ enviadaAgora: r.dados.enviadaAgora });
}
