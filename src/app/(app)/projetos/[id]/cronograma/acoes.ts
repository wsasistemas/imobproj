"use server";

import { z } from "zod";
import { falha, mensagemErroBanco, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { exigirPermissao } from "@/lib/projeto/servidor";
import { createClient } from "@/lib/supabase/server";

// Escrita do cronograma. Sempre: zod → exigirPermissao → cliente da sessão (a RLS confere de novo).

// z.guid (e não uuid): os ids do seed (c0000000-…) não seguem a RFC 4122.
const uuid = z.guid("Identificador inválido.");

const esquemaRemarcar = z
  .object({
    projectId: uuid,
    origem: z.enum(["evento", "atividade", "os", "reuniao"]),
    id: uuid,
    inicio: z.string().datetime({ offset: true, message: "Início inválido." }),
    fim: z.string().datetime({ offset: true, message: "Fim inválido." }).nullable(),
    justificativa: z
      .string()
      .trim()
      .min(5, "Escreva a justificativa (mínimo de 5 caracteres).")
      .max(1000, "Justificativa muito longa (máximo de 1000 caracteres)."),
  })
  .refine((v) => !v.fim || new Date(v.fim) >= new Date(v.inicio), { message: "O fim precisa ser depois do início." });

export type EntradaRemarcar = z.input<typeof esquemaRemarcar>;

/**
 * Arrastar/redimensionar no calendário: atualiza as datas (calendar_event e o que estiver ligado:
 * atividade da EAP, OS ou reunião) e grava schedule_changes — tudo na função
 * fn_cronograma_remarcar (uma transação).
 */
export async function remarcarEvento(entrada: EntradaRemarcar): Promise<ResultadoAcao<{ id: string }>> {
  const v = esquemaRemarcar.safeParse(entrada);
  if (!v.success) return falha(v.error.issues[0]?.message ?? "Dados inválidos.");
  const { projectId, origem, id, inicio, fim, justificativa } = v.data;

  try {
    await exigirPermissao(projectId, "cronograma_editar");
  } catch (e) {
    return falha(e instanceof Error ? e.message : "Sem permissão.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_cronograma_remarcar", {
    p_project_id: projectId,
    p_origem: origem,
    p_id: id,
    p_inicio: inicio,
    p_fim: fim,
    p_justificativa: justificativa,
  });
  if (error) return falha(mensagemErroBanco(error));
  return sucesso({ id: data as string });
}

/**
 * Nova linha de base: congela as folhas da EAP (id, código, título, datas e horas orçadas).
 * O número é gerado pelo trigger trg_baselines_numero.
 */
export async function criarLinhaDeBase(projectId: string): Promise<ResultadoAcao<{ numero: number }>> {
  if (!uuid.safeParse(projectId).success) return falha("Projeto inválido.");
  try {
    await exigirPermissao(projectId, "linha_base_criar");
  } catch (e) {
    return falha(e instanceof Error ? e.message : "Sem permissão.");
  }

  const supabase = await createClient();
  const { data: folhas, error: erroEap } = await supabase
    .from("v_wbs_progress")
    .select("wbs_item_id, codigo, titulo, inicio, fim, horas_orcadas, is_fase, is_milestone, ordem")
    .eq("project_id", projectId)
    .eq("is_folha", true)
    .order("ordem");
  if (erroEap) return falha(mensagemErroBanco(erroEap));
  if (!folhas?.length) return falha("A EAP não tem atividades para congelar. Cadastre a EAP em Documentação e EAP.");

  // Mesmo formato da linha de base do seed (wbs_item_id + dados da atividade).
  const snapshot = folhas.map((f) => ({
    wbs_item_id: f.wbs_item_id,
    codigo: f.codigo,
    titulo: f.titulo,
    inicio: f.inicio,
    fim: f.fim,
    horas_orcadas: Number(f.horas_orcadas),
    is_fase: f.is_fase,
    is_milestone: f.is_milestone,
  }));

  const { data, error } = await supabase
    .from("baselines")
    .insert({ project_id: projectId, snapshot })
    .select("numero")
    .single();
  if (error) return falha(mensagemErroBanco(error));
  return sucesso({ numero: data.numero as number });
}
