"use server";

import { z } from "zod";
import { primeiroErro } from "@/components/cadastros/util";
import { ACOES } from "@/config/menu";
import { falha, mensagemErroBanco, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { minhasPermissoes } from "@/lib/perfil-acesso";
import { createClient } from "@/lib/supabase/server";

// Configurações › Perfis e permissões. Só o super admin altera (RLS perfis_write / perfil_permissoes_write);
// o perfil fixo "super_admin" não se edita nem se exclui.

const chave = z.string().regex(/^[a-z_][a-z0-9_]{0,40}$/, "Perfil inválido.");

const esquemaSalvar = z.object({
  perfil: chave,
  linhas: z
    .array(
      z.object({
        menu: z.string().min(1).max(60),
        ...Object.fromEntries(ACOES.map((a) => [a, z.boolean()])),
      }) as z.ZodType<{ menu: string } & Record<(typeof ACOES)[number], boolean>>,
    )
    .min(1, "Nenhuma permissão mudou."),
});

async function garantirSuperAdmin() {
  return (await minhasPermissoes()).superAdmin ? null : falha("Somente o super admin altera os perfis de acesso.");
}

export async function salvarPermissoesPerfil(entrada: unknown): Promise<ResultadoAcao> {
  const v = esquemaSalvar.safeParse(entrada);
  if (!v.success) return falha(primeiroErro(v.error));
  const negado = await garantirSuperAdmin();
  if (negado) return negado;
  if (v.data.perfil === "super_admin") return falha("Super admin tem acesso total a todos os menus. Este perfil não é editável.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("perfil_permissoes")
    .upsert(v.data.linhas.map((l) => ({ ...l, perfil: v.data.perfil, updated_by: user?.id ?? null })), {
      onConflict: "perfil,menu",
    });
  return error ? falha(mensagemErroBanco(error)) : sucesso(undefined);
}

/** "Gerente de Obras" → "gerente_de_obras" (chave estável do perfil). */
function chaveDoNome(nome: string) {
  const base = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 36);
  return /^[a-z_]/.test(base) ? base : `p_${base}`;
}

export async function criarPerfil(entrada: unknown): Promise<ResultadoAcao<string>> {
  const v = z
    .object({
      nome: z.string().trim().min(3, "Dê um nome ao perfil (pelo menos 3 letras).").max(60, "Nome muito longo."),
      descricao: z.string().trim().max(120, "Descrição muito longa.").optional(),
    })
    .safeParse(entrada);
  if (!v.success) return falha(primeiroErro(v.error));
  const negado = await garantirSuperAdmin();
  if (negado) return negado;

  const supabase = await createClient();
  const nova = chaveDoNome(v.data.nome);
  const { error } = await supabase
    .from("perfis")
    .insert({ chave: nova, nome: v.data.nome, descricao: v.data.descricao || null, ordem: 60 });
  if (error?.code === "23505") return falha("Já existe um perfil com esse nome.");
  return error ? falha(mensagemErroBanco(error)) : sucesso(nova);
}

export async function excluirPerfil(entrada: unknown): Promise<ResultadoAcao> {
  const v = z.object({ chave }).safeParse(entrada);
  if (!v.success) return falha(primeiroErro(v.error));
  const negado = await garantirSuperAdmin();
  if (negado) return negado;
  const supabase = await createClient();
  // Quem estava neste perfil fica sem perfil (FK on delete set null) e passa a ver só a Página Inicial.
  const { error } = await supabase.from("perfis").delete().eq("chave", v.data.chave).select("chave").single();
  if (error?.code === "PGRST116") return falha("Este perfil não pode ser excluído.");
  return error ? falha(mensagemErroBanco(error)) : sucesso(undefined);
}
