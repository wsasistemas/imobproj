import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type Papel = "super_admin" | "diretor" | "gerente" | "usuario_chave" | "analista" | "prestador";

export const ROTULO_PAPEL: Record<Papel, string> = {
  super_admin: "Super admin",
  diretor: "Diretor",
  gerente: "Gerente de projeto",
  usuario_chave: "Usuário-chave",
  analista: "Analista",
  prestador: "Prestador",
};

// Papel mais alto entre os projetos do usuário, para o cartão do cabeçalho.
const ORDEM: Papel[] = ["diretor", "gerente", "usuario_chave", "analista", "prestador"];

export type UsuarioLogado = { id: string; nome: string; email: string; papel: Papel | null; rotuloPapel: string };

/** Usuário logado + perfil (profiles) + papel. Sem sessão, volta para /login. */
export const usuarioLogado = cache(async (): Promise<UsuarioLogado> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: perfil }, { data: vinculos }] = await Promise.all([
    supabase.from("profiles").select("nome, email, is_super_admin").eq("id", user.id).maybeSingle(),
    supabase.from("project_members").select("role").eq("user_id", user.id).eq("ativo", true),
  ]);

  const papeis = (vinculos ?? []).map((v) => v.role as Papel);
  const papel: Papel | null = perfil?.is_super_admin ? "super_admin" : (ORDEM.find((p) => papeis.includes(p)) ?? null);
  const email = perfil?.email ?? user.email ?? "";

  return {
    id: user.id,
    nome: perfil?.nome || email.split("@")[0] || "Usuário",
    email,
    papel,
    rotuloPapel: papel ? ROTULO_PAPEL[papel] : "Sem projeto",
  };
});
