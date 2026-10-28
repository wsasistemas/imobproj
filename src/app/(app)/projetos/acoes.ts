"use server";

import { revalidatePath } from "next/cache";
import { esquemaNovoProjeto, type DadosNovoProjeto } from "@/components/projetos/esquema-projeto";
import { falha, mensagemErroBanco, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { exigirSuperAdmin } from "@/lib/projeto/servidor";
import { createClient } from "@/lib/supabase/server";

/** Cria um projeto. Só o super admin (RLS projects_insert confere de novo no banco). */
export async function criarProjeto(entrada: DadosNovoProjeto): Promise<ResultadoAcao<{ id: string }>> {
  const validacao = esquemaNovoProjeto.safeParse(entrada);
  if (!validacao.success) return falha(validacao.error.issues[0]?.message ?? "Dados inválidos.");
  const d = validacao.data;

  try {
    await exigirSuperAdmin();
  } catch (e) {
    return falha(e instanceof Error ? e.message : "Sem permissão.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({
      codigo: d.codigo.toUpperCase(),
      nome: d.nome,
      cliente_org_id: d.cliente_org_id,
      executora_org_id: d.executora_org_id || null,
      inicio: d.inicio || null,
      fim: d.fim || null,
      horas_orcadas: d.horas_orcadas,
      status: d.status,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return falha(`Já existe um projeto com o código ${d.codigo.toUpperCase()}.`);
    return falha(mensagemErroBanco(error));
  }

  revalidatePath("/projetos");
  revalidatePath("/");
  return sucesso({ id: data.id as string });
}
