import "server-only";
import { cache } from "react";
import { type Acao, ACOES } from "@/config/menu";
import { falha, type ResultadoAcao } from "@/lib/acoes";
import { createClient } from "@/lib/supabase/server";

// Perfil de acesso (decisão D1): o perfil define os menus e as ações no sistema todo.
// A fonte é imobproj.minhas_permissoes() / imobproj.pode() no banco; a RLS confere de novo.
//
// Banco ainda sem a migration 20261031000200_perfis (ex.: a nuvem antes do scripts/migrar-nuvem.sh):
// `legado` = comportamento de antes da Fase 2 — todos veem todos os menus (a RLS continua protegendo)
// e só o super admin (profiles.is_super_admin) altera. Nenhuma tela some por causa disso.

export type PermissoesMenu = Record<Acao, boolean>;
export type MinhasPermissoes = {
  superAdmin: boolean;
  perfil: string | null;
  menus: Record<string, PermissoesMenu>;
  /** Banco sem perfis de acesso: vale a regra antiga (ver tudo; alterar só o super admin). */
  legado: boolean;
};

/** Permissões do usuário logado (uma consulta por requisição). */
export const minhasPermissoes = cache(async (): Promise<MinhasPermissoes> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("minhas_permissoes");
  if (error || !data) {
    console.warn(
      `[perfil-acesso] minhas_permissoes indisponível (${error?.code ?? "sem dados"}: ${error?.message ?? ""}); usando a regra anterior à Fase 2.`,
    );
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: perfil } = user
      ? await supabase.from("profiles").select("is_super_admin").eq("id", user.id).maybeSingle()
      : { data: null };
    const superAdmin = Boolean(perfil?.is_super_admin);
    return { superAdmin, perfil: superAdmin ? "super_admin" : null, menus: {}, legado: true };
  }
  const linhas = data as ({ super_admin: boolean; perfil: string | null; menu: string | null } & PermissoesMenu)[];
  if (linhas.some((l) => l.super_admin)) return { superAdmin: true, perfil: "super_admin", menus: {}, legado: false };
  const menus: Record<string, PermissoesMenu> = {};
  for (const l of linhas) {
    if (l.menu) menus[l.menu] = Object.fromEntries(ACOES.map((a) => [a, Boolean(l[a])])) as PermissoesMenu;
  }
  return { superAdmin: false, perfil: linhas[0]?.perfil ?? null, menus, legado: false };
});

/** O usuário logado pode `acao` no item `menu` do menu lateral? */
export async function pode(menu: string, acao: Acao = "ver"): Promise<boolean> {
  const p = await minhasPermissoes();
  if (p.superAdmin) return true;
  if (p.legado) return acao === "ver";
  return Boolean(p.menus[menu]?.[acao]);
}

/** Para as Server Actions: devolve a falha pronta, ou null quando pode seguir. */
export async function garantirPermissao(menu: string, acao: Acao): Promise<ResultadoAcao<never> | null> {
  return (await pode(menu, acao)) ? null : falha("Seu perfil de acesso não permite esta ação.");
}

