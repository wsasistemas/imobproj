"use server";

import { esquemaEquipe, esquemaId, esquemaMembroEquipe, esquemaProjetoEquipe } from "@/components/cadastros/esquemas";
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

/** Liga a equipe a um projeto que ela atende (project_teams). Os grupos do WhatsApp do projeto só aceitam essas equipes. */
export async function adicionarProjetoEquipe(entrada: unknown): Promise<ResultadoAcao> {
  const v = esquemaProjetoEquipe.safeParse(entrada);
  if (!v.success) return falha(primeiroErro(v.error));
  const negado = await garantirPermissao("cadastros_equipes", "editar");
  if (negado) return negado;
  const supabase = await createClient();
  const { error } = await supabase.from("project_teams").insert(v.data);
  if (error?.code === "23505") return falha("A equipe já atende este projeto.");
  return error ? falha(mensagemErroBanco(error)) : sucesso(undefined);
}

export async function removerProjetoEquipe(entrada: unknown): Promise<ResultadoAcao> {
  const v = esquemaProjetoEquipe.safeParse(entrada);
  if (!v.success) return falha(primeiroErro(v.error));
  const negado = await garantirPermissao("cadastros_equipes", "editar");
  if (negado) return negado;
  const supabase = await createClient();
  const { count, error: erroGrupos } = await supabase
    .from("wa_groups")
    .select("id", { count: "exact", head: true })
    .eq("project_id", v.data.project_id)
    .eq("team_id", v.data.team_id);
  if (erroGrupos) return falha(mensagemErroBanco(erroGrupos));
  if (count) return falha(`A equipe tem ${count} grupo(s) de WhatsApp neste projeto. Troque a equipe desses grupos antes.`);
  const { error } = await supabase
    .from("project_teams")
    .delete()
    .eq("team_id", v.data.team_id)
    .eq("project_id", v.data.project_id)
    .select("team_id")
    .single();
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
