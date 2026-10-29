"use server";

import { esquemaEquipe, esquemaId, esquemaMembroEquipe } from "@/components/cadastros/esquemas";
import { primeiroErro } from "@/components/cadastros/util";
import { falha, mensagemErroBanco, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { garantirPermissao } from "@/lib/perfil-acesso";
import { createClient } from "@/lib/supabase/server";

// Cadastros › Equipes: grupos de pessoas (teams/team_members). Grava o super admin ou quem o perfil autoriza (RLS teams_write + *_perfil).

export async function salvarEquipe(entrada: unknown): Promise<ResultadoAcao> {
  const v = esquemaEquipe.safeParse(entrada);
  if (!v.success) return falha(primeiroErro(v.error));
  const negado = await garantirPermissao("cadastros_equipes", v.data.id ? "editar" : "criar");
  if (negado) return negado;

  const { id, ...dados } = v.data;
  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("teams").update(dados).eq("id", id).select("id").single()
    : await supabase.from("teams").insert(dados).select("id").single();
  if (error) {
    if (error.code === "23505") return falha("Já existe uma equipe com este nome.");
    return falha(mensagemErroBanco(error));
  }
  // O líder também é membro da equipe.
  if (dados.lider_id) {
    const { error: erroLider } = await supabase
      .from("team_members")
      .upsert({ team_id: data.id, user_id: dados.lider_id }, { onConflict: "team_id,user_id", ignoreDuplicates: true });
    if (erroLider) return falha(mensagemErroBanco(erroLider));
  }
  return sucesso(undefined);
}

export async function removerEquipe(entrada: unknown): Promise<ResultadoAcao> {
  const v = esquemaId.safeParse(entrada);
  if (!v.success) return falha(primeiroErro(v.error));
  const negado = await garantirPermissao("cadastros_equipes", "excluir");
  if (negado) return negado;
  const supabase = await createClient();
  const { error } = await supabase.from("teams").delete().eq("id", v.data.id).select("id").single();
  return error ? falha(mensagemErroBanco(error)) : sucesso(undefined);
}

export async function adicionarMembroEquipe(entrada: unknown): Promise<ResultadoAcao> {
  const v = esquemaMembroEquipe.safeParse(entrada);
  if (!v.success) return falha(primeiroErro(v.error));
  const negado = await garantirPermissao("cadastros_equipes", "editar");
  if (negado) return negado;
  const supabase = await createClient();
  const { error } = await supabase.from("team_members").insert(v.data);
  if (error?.code === "23505") return falha("Esta pessoa já está na equipe.");
  return error ? falha(mensagemErroBanco(error)) : sucesso(undefined);
}

export async function removerMembroEquipe(entrada: unknown): Promise<ResultadoAcao> {
  const v = esquemaMembroEquipe.safeParse(entrada);
  if (!v.success) return falha(primeiroErro(v.error));
  const negado = await garantirPermissao("cadastros_equipes", "editar");
  if (negado) return negado;
  const supabase = await createClient();
  const { error } = await supabase
    .from("team_members")
    .delete()
    .eq("team_id", v.data.team_id)
    .eq("user_id", v.data.user_id)
    .select("team_id")
    .single();
  return error ? falha(mensagemErroBanco(error)) : sucesso(undefined);
}
