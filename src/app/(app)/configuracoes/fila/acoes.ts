"use server";

import { primeiroErro } from "@/components/cadastros/util";
import {
  esquemaFeriado,
  esquemaFeriadoChave,
  esquemaHorarios,
  esquemaMensagens,
  esquemaRegras,
} from "@/components/configuracoes/esquemas-setores";
import { falha, mensagemErroBanco, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { garantirPermissao } from "@/lib/perfil-acesso";
import { createClient } from "@/lib/supabase/server";

// Configurações › Fila e horários (Fase 3): horário, feriados, regras da fila e mensagens automáticas de cada setor.
// Grava o super admin ou quem o perfil autoriza em config_fila (RLS setor_*_write).

export async function salvarHorarios(entrada: unknown): Promise<ResultadoAcao> {
  const v = esquemaHorarios.safeParse(entrada);
  if (!v.success) return falha(primeiroErro(v.error));
  const negado = await garantirPermissao("config_fila", "editar");
  if (negado) return negado;
  const supabase = await createClient();
  const { error } = await supabase
    .from("setor_horarios")
    .upsert(v.data.horarios.map((h) => ({ ...h, setor_id: v.data.setor_id })), { onConflict: "setor_id,dia_semana" });
  return error ? falha(mensagemErroBanco(error)) : sucesso(undefined);
}

export async function adicionarFeriado(entrada: unknown): Promise<ResultadoAcao> {
  const v = esquemaFeriado.safeParse(entrada);
  if (!v.success) return falha(primeiroErro(v.error));
  const negado = await garantirPermissao("config_fila", "editar");
  if (negado) return negado;
  const supabase = await createClient();
  const { error } = await supabase.from("setor_feriados").insert(v.data);
  if (error?.code === "23505") return falha("Esta data já está na lista de feriados.");
  return error ? falha(mensagemErroBanco(error)) : sucesso(undefined);
}

export async function removerFeriado(entrada: unknown): Promise<ResultadoAcao> {
  const v = esquemaFeriadoChave.safeParse(entrada);
  if (!v.success) return falha(primeiroErro(v.error));
  const negado = await garantirPermissao("config_fila", "editar");
  if (negado) return negado;
  const supabase = await createClient();
  const { error } = await supabase
    .from("setor_feriados")
    .delete()
    .eq("setor_id", v.data.setor_id)
    .eq("data", v.data.data)
    .select("data")
    .single();
  return error ? falha(mensagemErroBanco(error)) : sucesso(undefined);
}

export async function salvarRegras(entrada: unknown): Promise<ResultadoAcao> {
  const v = esquemaRegras.safeParse(entrada);
  if (!v.success) return falha(primeiroErro(v.error));
  const negado = await garantirPermissao("config_fila", "editar");
  if (negado) return negado;
  const supabase = await createClient();
  const { error } = await supabase.from("setor_regras").upsert(v.data, { onConflict: "setor_id" });
  return error ? falha(mensagemErroBanco(error)) : sucesso(undefined);
}

export async function salvarMensagens(entrada: unknown): Promise<ResultadoAcao> {
  const v = esquemaMensagens.safeParse(entrada);
  if (!v.success) return falha(primeiroErro(v.error));
  const negado = await garantirPermissao("config_fila", "editar");
  if (negado) return negado;
  const supabase = await createClient();
  const { error } = await supabase
    .from("setor_mensagens")
    .upsert(v.data.mensagens.map((m) => ({ ...m, setor_id: v.data.setor_id })), { onConflict: "setor_id,tipo" });
  return error ? falha(mensagemErroBanco(error)) : sucesso(undefined);
}
