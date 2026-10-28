"use server";

import { z } from "zod";
import { falha, mensagemErroBanco, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { pode } from "@/lib/projeto/permissoes";
import { exigirPermissao, papelNoProjeto } from "@/lib/projeto/servidor";
import type { EvidenceTipo, OsStatus } from "@/lib/projeto/tipos";
import { createClient } from "@/lib/supabase/server";

// Server Actions do módulo Ordens de Serviço. Toda ação: zod → permissão no servidor → grava com o
// cliente do usuário (a RLS e o trigger fn_os_guard conferem de novo no banco).

type ErroBanco = { code?: string; message?: string } | null | undefined;

/**
 * Como mensagemErroBanco, mas preserva as mensagens em português que os triggers/funções do módulo
 * levantam com errcode 42501/23514 (ex.: "Comentário obrigatório ao recusar a OS"), que a função
 * compartilhada troca por um texto genérico.
 */
function erroOs(error: ErroBanco): string {
  const m = error?.message ?? "";
  const generica = /row-level security|permission denied|violates check constraint|violates|syntax/i.test(m);
  if (error && ["42501", "23514", "P0001", "P0002"].includes(error.code ?? "") && m && !generica) return m;
  return mensagemErroBanco(error);
}

// Regex permissiva (e não z.uuid()): os ids do seed, como c0000000-…-000000000014, não seguem a RFC 4122.
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Identificador inválido.");

function erroPermissao(e: unknown) {
  return falha(e instanceof Error ? e.message : "Você não tem permissão para esta ação neste projeto.");
}

/** Lê a OS garantindo que pertence ao projeto informado (evita usar a permissão de outro projeto). */
async function lerOs(projectId: string, osId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("service_orders")
    .select("id, project_id, status, executor_id, fora_escopo, checkin_at")
    .eq("id", osId)
    .eq("project_id", projectId)
    .maybeSingle();
  return { supabase, os: data as null | {
    id: string;
    project_id: string;
    status: OsStatus;
    executor_id: string | null;
    fora_escopo: boolean;
    checkin_at: string | null;
  }, error };
}

// ---------------------------------------------------------------------------------------------
// Nova OS (gerente)
// ---------------------------------------------------------------------------------------------
const esquemaNovaOs = z
  .object({
    projectId: uuid,
    titulo: z.string().trim().min(3, "Informe um título com ao menos 3 caracteres.").max(200),
    descricao: z.string().trim().max(5000).optional().default(""),
    wbsItemId: uuid.nullable(),
    executorId: uuid.nullable(),
    agendadaInicio: z.iso.datetime({ offset: true, message: "Data de início inválida." }).nullable(),
    agendadaFim: z.iso.datetime({ offset: true, message: "Data de fim inválida." }).nullable(),
    horasPrevistas: z.number().min(0, "Horas não podem ser negativas.").max(9999).nullable(),
  })
  .refine((v) => !v.agendadaFim || !v.agendadaInicio || new Date(v.agendadaFim) >= new Date(v.agendadaInicio), {
    message: "O fim do agendamento deve ser depois do início.",
    path: ["agendadaFim"],
  })
  .refine((v) => !v.agendadaFim || !!v.agendadaInicio, {
    message: "Informe o início do agendamento.",
    path: ["agendadaInicio"],
  });

export type EntradaNovaOs = z.input<typeof esquemaNovaOs>;

export async function criarOs(entrada: EntradaNovaOs): Promise<ResultadoAcao<{ id: string; numero: number }>> {
  const v = esquemaNovaOs.safeParse(entrada);
  if (!v.success) return falha(v.error.issues[0]?.message ?? "Dados inválidos.");
  const d = v.data;
  try {
    await exigirPermissao(d.projectId, "os_criar");
  } catch (e) {
    return erroPermissao(e);
  }

  const supabase = await createClient();
  const base = {
    project_id: d.projectId,
    titulo: d.titulo,
    descricao: d.descricao || null,
    wbs_item_id: d.wbsItemId,
    executor_id: d.executorId,
    agendada_inicio: d.agendadaInicio,
    agendada_fim: d.agendadaFim,
    status: (d.agendadaInicio ? "agendada" : "rascunho") as OsStatus,
    origem: "portal" as const,
  };

  let { data, error } = await supabase
    .from("service_orders")
    .insert({ ...base, horas_previstas: d.horasPrevistas })
    .select("id, numero")
    .single();

  // Migration 20261029000400 (coluna horas_previstas) ainda não aplicada: grava sem a previsão.
  if (error && (error.code === "PGRST204" || error.code === "42703") && /horas_previstas/.test(error.message ?? "")) {
    ({ data, error } = await supabase.from("service_orders").insert(base).select("id, numero").single());
  }
  if (error || !data) return falha(erroOs(error));
  return sucesso({ id: data.id as string, numero: data.numero as number });
}

// ---------------------------------------------------------------------------------------------
// Aceite e recusa (diretor, usuário-chave, super_admin)
// ---------------------------------------------------------------------------------------------
const esquemaAceite = z
  .object({
    projectId: uuid,
    osId: uuid,
    decisao: z.enum(["aprovada", "recusada"]),
    comentario: z.string().trim().max(2000).optional().default(""),
  })
  .refine((v) => v.decisao === "aprovada" || v.comentario.length >= 3, {
    message: "Explique o motivo da recusa (comentário obrigatório).",
    path: ["comentario"],
  });

export type EntradaAceite = z.input<typeof esquemaAceite>;

export async function decidirAceite(entrada: EntradaAceite): Promise<ResultadoAcao<{ status: OsStatus }>> {
  const v = esquemaAceite.safeParse(entrada);
  if (!v.success) return falha(v.error.issues[0]?.message ?? "Dados inválidos.");
  const d = v.data;
  try {
    await exigirPermissao(d.projectId, "os_aceitar");
  } catch (e) {
    return erroPermissao(e);
  }

  const { supabase, os, error: erroLeitura } = await lerOs(d.projectId, d.osId);
  if (erroLeitura) return falha(erroOs(erroLeitura));
  if (!os) return falha("OS não encontrada neste projeto.");
  if (os.status !== "aguardando_aceite")
    return falha("Só é possível aprovar ou recusar uma OS que está aguardando aceite.");

  // aceite_por/aceite_em são preenchidos (e o papel validado) pelo trigger fn_os_guard.
  const { data, error } = await supabase
    .from("service_orders")
    .update({ status: d.decisao, aceite_comentario: d.comentario || null })
    .eq("id", d.osId)
    .eq("project_id", d.projectId)
    .eq("status", "aguardando_aceite") // trava otimista: outra pessoa pode ter decidido antes
    .select("id")
    .maybeSingle();
  if (error) return falha(erroOs(error));
  if (!data) return falha("A OS mudou de situação enquanto você decidia. Atualize a tela e confira.");
  return sucesso({ status: d.decisao });
}

// ---------------------------------------------------------------------------------------------
// Fora do escopo (gerente, diretor, usuário-chave)
// ---------------------------------------------------------------------------------------------
const esquemaForaEscopo = z.object({
  projectId: uuid,
  osId: uuid,
  descricao: z.string().trim().min(5, "Descreva o que está fora do escopo (ao menos 5 caracteres).").max(2000),
  horas: z.number({ message: "Informe as horas." }).min(0, "Horas não podem ser negativas.").max(99999),
  valor: z.number().min(0, "O valor não pode ser negativo.").max(9_999_999_999).nullable(),
});

export type EntradaForaEscopo = z.input<typeof esquemaForaEscopo>;

/**
 * Marca a OS como fora do escopo e cria a scope_proposal pendente.
 * Caminho preferido: RPC fn_os_marcar_fora_escopo (migration 20261029000400) — tudo numa transação.
 * Se a função ainda não existir no banco, cai para dois comandos (insere a proposta antes e a remove
 * se a marcação da OS falhar), que é o melhor possível sem transação no PostgREST.
 */
export async function marcarForaEscopo(entrada: EntradaForaEscopo): Promise<ResultadoAcao<{ propostaId: string }>> {
  const v = esquemaForaEscopo.safeParse(entrada);
  if (!v.success) return falha(v.error.issues[0]?.message ?? "Dados inválidos.");
  const d = v.data;
  try {
    await exigirPermissao(d.projectId, "os_fora_escopo");
  } catch (e) {
    return erroPermissao(e);
  }

  const { supabase, os, error: erroLeitura } = await lerOs(d.projectId, d.osId);
  if (erroLeitura) return falha(erroOs(erroLeitura));
  if (!os) return falha("OS não encontrada neste projeto.");
  if (os.fora_escopo) return falha("Esta OS já está marcada como fora do escopo.");

  const rpc = await supabase.rpc("fn_os_marcar_fora_escopo", {
    p_os_id: d.osId,
    p_descricao: d.descricao,
    p_horas: d.horas,
    p_valor: d.valor,
  });
  if (!rpc.error) return sucesso({ propostaId: rpc.data as string });
  const funcaoAusente = rpc.error.code === "PGRST202" || rpc.error.code === "42883";
  if (!funcaoAusente) return falha(erroOs(rpc.error));

  // Fallback sem a RPC
  const { data: proposta, error: erroProposta } = await supabase
    .from("scope_proposals")
    .insert({ project_id: d.projectId, os_id: d.osId, descricao: d.descricao, horas: d.horas, valor: d.valor })
    .select("id")
    .single();
  if (erroProposta || !proposta) return falha(erroOs(erroProposta));

  const { data: marcada, error: erroOsUpd } = await supabase
    .from("service_orders")
    .update({ fora_escopo: true })
    .eq("id", d.osId)
    .eq("project_id", d.projectId)
    .select("id")
    .maybeSingle();
  if (erroOsUpd || !marcada) {
    await supabase.from("scope_proposals").delete().eq("id", proposta.id);
    return falha(erroOsUpd ? erroOs(erroOsUpd) : "Não foi possível marcar a OS como fora do escopo.");
  }
  return sucesso({ propostaId: proposta.id as string });
}

// ---------------------------------------------------------------------------------------------
// Check-in / check-out pelo portal (executor da própria OS: analista ou prestador)
// Transições permitidas pelo trigger para o executor: → em_execucao e → aguardando_aceite.
// ---------------------------------------------------------------------------------------------
const esquemaApontamento = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("checkin"), projectId: uuid, osId: uuid }),
  z.object({
    tipo: z.literal("checkout"),
    projectId: uuid,
    osId: uuid,
    horas: z.number({ message: "Informe as horas trabalhadas." }).positive("Informe as horas trabalhadas.").max(9999),
  }),
]);

export type EntradaApontamento = z.input<typeof esquemaApontamento>;

export async function apontarOs(entrada: EntradaApontamento): Promise<ResultadoAcao<{ status: OsStatus }>> {
  const v = esquemaApontamento.safeParse(entrada);
  if (!v.success) return falha(v.error.issues[0]?.message ?? "Dados inválidos.");
  const d = v.data;
  let userId: string;
  try {
    ({ userId } = await exigirPermissao(d.projectId, "os_apontar_propria"));
  } catch (e) {
    return erroPermissao(e);
  }

  const { supabase, os, error: erroLeitura } = await lerOs(d.projectId, d.osId);
  if (erroLeitura) return falha(erroOs(erroLeitura));
  if (!os) return falha("OS não encontrada neste projeto.");
  if (os.executor_id !== userId) return falha("Só o executor da OS pode fazer check-in e check-out.");

  const agora = new Date().toISOString();
  if (d.tipo === "checkin") {
    if (os.status !== "agendada") return falha("O check-in só pode ser feito em uma OS agendada.");
    const { data, error } = await supabase
      .from("service_orders")
      .update({ status: "em_execucao", checkin_at: agora })
      .eq("id", d.osId)
      .eq("status", "agendada")
      .select("id")
      .maybeSingle();
    if (error) return falha(erroOs(error));
    if (!data) return falha("A OS mudou de situação. Atualize a tela.");
    return sucesso({ status: "em_execucao" });
  }

  if (os.status !== "em_execucao") return falha("O check-out só pode ser feito em uma OS em execução.");
  const { data, error } = await supabase
    .from("service_orders")
    .update({ status: "aguardando_aceite", checkout_at: agora, horas: d.horas })
    .eq("id", d.osId)
    .eq("status", "em_execucao")
    .select("id")
    .maybeSingle();
  if (error) return falha(erroOs(error));
  if (!data) return falha("A OS mudou de situação. Atualize a tela.");
  return sucesso({ status: "aguardando_aceite" });
}

// ---------------------------------------------------------------------------------------------
// Evidências: o arquivo vai do navegador direto para o Storage (bucket "evidencias", políticas
// por projeto/OS); aqui registramos a linha em os_evidences depois de conferir permissão e caminho.
// ---------------------------------------------------------------------------------------------
const esquemaEvidencia = z.object({
  projectId: uuid,
  osId: uuid,
  storagePath: z.string().min(1).max(500),
  tipo: z.enum(["foto", "arquivo", "print", "assinatura"]),
});

export type EntradaEvidencia = z.input<typeof esquemaEvidencia>;

/** Gerente (ou super_admin) em qualquer OS do projeto; analista/prestador só na OS em que é executor. */
async function podeEnviarEvidencia(projectId: string, executorId: string | null) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const papel = await papelNoProjeto(projectId);
  if (pode(papel, "os_editar")) return true;
  return pode(papel, "os_apontar_propria") && executorId === user.id;
}

export async function registrarEvidencia(entrada: EntradaEvidencia): Promise<ResultadoAcao<{ id: string }>> {
  const v = esquemaEvidencia.safeParse(entrada);
  if (!v.success) return falha(v.error.issues[0]?.message ?? "Dados inválidos.");
  const d = v.data;

  const { supabase, os, error: erroLeitura } = await lerOs(d.projectId, d.osId);
  if (erroLeitura) return falha(erroOs(erroLeitura));
  if (!os) return falha("OS não encontrada neste projeto.");
  if (!(await podeEnviarEvidencia(d.projectId, os.executor_id)))
    return falha("Você não tem permissão para enviar evidências nesta OS.");

  const prefixo = `${d.projectId}/${d.osId}/`;
  if (!d.storagePath.startsWith(prefixo) || d.storagePath.slice(prefixo.length).includes("/"))
    return falha("Caminho do arquivo inválido para esta OS.");

  const { data, error } = await supabase
    .from("os_evidences")
    .insert({ os_id: d.osId, tipo: d.tipo as EvidenceTipo, storage_path: d.storagePath, origem: "portal" })
    .select("id")
    .single();
  if (error || !data) return falha(erroOs(error));
  return sucesso({ id: data.id as string });
}
