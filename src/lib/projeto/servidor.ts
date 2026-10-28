import "server-only";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { pode, type Acao } from "./permissoes";
import type { Papel, Projeto } from "./tipos";

/** Papel do usuário logado no projeto (fn_user_role: super_admin, papel ativo ou null). */
export const papelNoProjeto = cache(async (projectId: string): Promise<Papel | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_user_role", { p_project_id: projectId });
  if (error) return null;
  return (data as Papel | null) ?? null;
});

export type ContextoProjeto = { projeto: Projeto; papel: Papel; userId: string };

/**
 * Para páginas de /projetos/[id]: projeto + papel do usuário. Sem acesso ao projeto → 404
 * (não revelamos que o projeto existe).
 */
export const contextoProjeto = cache(async (projectId: string): Promise<ContextoProjeto> => {
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [papel, { data: projeto }] = await Promise.all([
    papelNoProjeto(projectId),
    supabase.from("projects").select("*").eq("id", projectId).maybeSingle(),
  ]);
  if (!papel || !projeto) notFound();
  return { projeto: projeto as Projeto, papel, userId: user.id };
});

/** Usuário logado é super admin (vale fora de um projeto, ex.: criar projeto, administração). */
export async function ehSuperAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_is_super_admin");
  return !error && data === true;
}

export class SemPermissao extends Error {
  constructor(mensagem = "Você não tem permissão para esta ação neste projeto.") {
    super(mensagem);
    this.name = "SemPermissao";
  }
}

/**
 * Para Server Actions: confere no servidor se o usuário pode executar `acao` no projeto.
 * Lança SemPermissao (trate com try/catch e devolva falha(e.message)). A RLS confere de novo no banco.
 */
export async function exigirPermissao(projectId: string, acao: Acao): Promise<{ papel: Papel; userId: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new SemPermissao("Sua sessão expirou. Entre novamente.");
  const papel = await papelNoProjeto(projectId);
  if (!pode(papel, acao)) throw new SemPermissao();
  return { papel: papel as Papel, userId: user.id };
}

/** Igual a exigirPermissao, para ações fora de projeto que só o super admin faz. */
export async function exigirSuperAdmin(): Promise<{ userId: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new SemPermissao("Sua sessão expirou. Entre novamente.");
  if (!(await ehSuperAdmin())) throw new SemPermissao("Apenas o super admin pode fazer isto.");
  return { userId: user.id };
}
