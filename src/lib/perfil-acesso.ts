import "server-only";
import { cache } from "react";
import { type Acao, ACOES } from "@/config/menu";
import { falha, type ResultadoAcao } from "@/lib/acoes";
import { createClient } from "@/lib/supabase/server";

// Perfil de acesso (decisão D1): o perfil define os menus e as ações no sistema todo.
// A fonte é imobproj.minhas_permissoes() / imobproj.pode() no banco; a RLS confere de novo.

export type PermissoesMenu = Record<Acao, boolean>;
export type MinhasPermissoes = { superAdmin: boolean; perfil: string | null; menus: Record<string, PermissoesMenu> };

/** Permissões do usuário logado (uma consulta por requisição). */
export const minhasPermissoes = cache(async (): Promise<MinhasPermissoes> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("minhas_permissoes");
  if (error || !data) return { superAdmin: false, perfil: null, menus: {} };
  const linhas = data as ({ super_admin: boolean; perfil: string | null; menu: string | null } & PermissoesMenu)[];
  if (linhas.some((l) => l.super_admin)) return { superAdmin: true, perfil: "super_admin", menus: {} };
  const menus: Record<string, PermissoesMenu> = {};
  for (const l of linhas) {
    if (l.menu) menus[l.menu] = Object.fromEntries(ACOES.map((a) => [a, Boolean(l[a])])) as PermissoesMenu;
  }
  return { superAdmin: false, perfil: linhas[0]?.perfil ?? null, menus };
});

/** O usuário logado pode `acao` no item `menu` do menu lateral? */
export async function pode(menu: string, acao: Acao = "ver"): Promise<boolean> {
  const p = await minhasPermissoes();
  return p.superAdmin || Boolean(p.menus[menu]?.[acao]);
}

/** Para as Server Actions: devolve a falha pronta, ou null quando pode seguir. */
export async function garantirPermissao(menu: string, acao: Acao): Promise<ResultadoAcao<never> | null> {
  return (await pode(menu, acao)) ? null : falha("Seu perfil de acesso não permite esta ação.");
}
