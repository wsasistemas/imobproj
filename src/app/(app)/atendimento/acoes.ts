"use server";

import { z } from "zod";
import { ehBancoDesatualizado, falha, MSG_BANCO_DESATUALIZADO, mensagemErroBanco, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { createClient } from "@/lib/supabase/server";

// Atendimento (Fase 4): assumir, transferir, devolver à fila, encerrar e o meu status (online/pausa).
// Quem pode cada ação é decidido no banco (imobproj.at_*: fn_pode_atender / fn_pode_gerir_setor), que devolve a
// frase em português; aqui só validamos a entrada e repassamos o resultado.

const id = z.guid("Atendimento inválido.");

function erroDoBanco(error: { code?: string; message?: string }): string {
  if (ehBancoDesatualizado(error)) return MSG_BANCO_DESATUALIZADO;
  if (["P0001", "P0002", "22023"].includes(error.code ?? "") && error.message) return error.message;
  return mensagemErroBanco(error);
}

async function rpc(nome: string, args: Record<string, unknown>): Promise<ResultadoAcao<unknown>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(nome, args);
  return error ? falha(erroDoBanco(error)) : sucesso(data);
}

export async function assumirAtendimento(entrada: unknown): Promise<ResultadoAcao> {
  const v = id.safeParse(entrada);
  if (!v.success) return falha("Atendimento inválido.");
  const r = await rpc("at_assumir", { p_atendimento: v.data });
  return r.ok ? sucesso(undefined) : r;
}

export async function assumirConversa(entrada: unknown): Promise<ResultadoAcao<{ atendimentoId: string }>> {
  const v = z.guid().safeParse(entrada);
  if (!v.success) return falha("Conversa inválida.");
  const r = await rpc("at_assumir_conversa", { p_group_id: v.data });
  return r.ok ? sucesso({ atendimentoId: r.dados as string }) : r;
}

const esquemaTransferir = z
  .object({ id, atendenteId: z.guid().nullable().optional(), setorId: z.guid().nullable().optional() })
  .refine((d) => d.atendenteId || d.setorId, { message: "Escolha a pessoa ou o setor de destino." });

export async function transferirAtendimento(entrada: unknown): Promise<ResultadoAcao> {
  const v = esquemaTransferir.safeParse(entrada);
  if (!v.success) return falha(v.error.issues[0]?.message ?? "Dados inválidos.");
  const r = await rpc("at_transferir", {
    p_atendimento: v.data.id,
    p_atendente: v.data.atendenteId ?? null,
    p_setor: v.data.setorId ?? null,
  });
  return r.ok ? sucesso(undefined) : r;
}

export async function devolverAtendimento(entrada: unknown): Promise<ResultadoAcao> {
  const v = id.safeParse(entrada);
  if (!v.success) return falha("Atendimento inválido.");
  const r = await rpc("at_devolver_fila", { p_atendimento: v.data });
  return r.ok ? sucesso(undefined) : r;
}

export async function encerrarAtendimento(entrada: unknown): Promise<ResultadoAcao> {
  const v = id.safeParse(entrada);
  if (!v.success) return falha("Atendimento inválido.");
  const r = await rpc("at_encerrar", { p_atendimento: v.data });
  return r.ok ? sucesso(undefined) : r;
}

const esquemaStatus = z.object({ online: z.boolean().nullable().optional(), pausa: z.boolean().nullable().optional() });

/** Sem campos = sinal de vida da tela aberta (mantém "online"). */
export async function atualizarMeuStatus(entrada: unknown): Promise<ResultadoAcao<{ online: boolean; pausa: boolean }>> {
  const v = esquemaStatus.safeParse(entrada ?? {});
  if (!v.success) return falha("Status inválido.");
  const r = await rpc("at_meu_status", { p_online: v.data.online ?? null, p_pausa: v.data.pausa ?? null });
  if (!r.ok) return r;
  const s = r.dados as { online: boolean; pausa: boolean };
  return sucesso({ online: s.online, pausa: s.pausa });
}
