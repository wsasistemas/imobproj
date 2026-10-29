"use server";

import { headers } from "next/headers";
import type { z } from "zod";
import {
  esquemaAlterarAtivo,
  esquemaAlterarPapel,
  esquemaMembro,
  esquemaNovoMembro,
  esquemaProjeto,
} from "@/components/equipe/esquemas";
import { falha, mensagemErroBanco, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { exigirSuperAdmin } from "@/lib/projeto/servidor";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Equipe e permissões: só o super admin altera membros (RLS project_members_write).
// Gravação em project_members sempre com o cliente da sessão (a RLS confere de novo);
// o admin client (service_role) só para o Supabase Auth: convite e consulta de confirmação de e-mail.

/** PGRST116 = nenhuma linha afetada (membro inexistente ou bloqueado pela RLS). */
function mensagemVinculo(error: { code?: string; message?: string }) {
  return error.code === "PGRST116"
    ? "Membro não encontrado neste projeto (ou você não tem permissão para alterá-lo)."
    : mensagemErroBanco(error);
}

function primeiroErro(e: z.ZodError) {
  return e.issues[0]?.message ?? "Dados inválidos.";
}

async function garantirSuperAdmin(): Promise<ResultadoAcao<never> | null> {
  try {
    await exigirSuperAdmin();
    return null;
  } catch (e) {
    return falha(e instanceof Error ? e.message : "Sem permissão.");
  }
}

async function origemDaRequisicao() {
  const h = await headers();
  const origem = h.get("origin");
  if (origem) return origem;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const protocolo = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocolo}://${host}`;
}

async function enviarConvite(email: string, nome: string) {
  const origem = await origemDaRequisicao();
  return createAdminClient().auth.admin.inviteUserByEmail(email, {
    // "sistema" faz o trigger imobproj_on_auth_user_created criar o profile (o Auth é compartilhado).
    data: { nome, sistema: "imobproj" },
    redirectTo: `${origem}/auth/callback?next=/redefinir-senha`,
  });
}

export type ResultadoAdicionar = { tipo: "convidado" | "adicionado" | "reativado" | "atualizado"; mensagem: string };

/** Adiciona alguém ao projeto: vincula o profile existente ou convida por e-mail (Supabase Auth). */
export async function adicionarMembro(entrada: unknown): Promise<ResultadoAcao<ResultadoAdicionar>> {
  const v = esquemaNovoMembro.safeParse(entrada);
  if (!v.success) return falha(primeiroErro(v.error));
  const negado = await garantirSuperAdmin();
  if (negado) return negado;

  const { projectId, email, nome, papel } = v.data;
  const supabase = await createClient();

  const { data: perfil, error: erroPerfil } = await supabase
    .from("profiles")
    .select("id, nome")
    .eq("email", email)
    .maybeSingle();
  if (erroPerfil) return falha(mensagemErroBanco(erroPerfil));

  if (perfil) {
    const { data: vinculo, error: erroVinculo } = await supabase
      .from("project_members")
      .select("id, role, ativo")
      .eq("project_id", projectId)
      .eq("user_id", perfil.id)
      .maybeSingle();
    if (erroVinculo) return falha(mensagemErroBanco(erroVinculo));

    const quem = perfil.nome || email;
    if (vinculo) {
      if (vinculo.ativo && vinculo.role === papel)
        return falha(`${quem} já faz parte deste projeto com este papel.`);
      const { error } = await supabase
        .from("project_members")
        .update({ role: papel, ativo: true })
        .eq("id", vinculo.id)
        .select("id")
        .single();
      if (error) return falha(mensagemVinculo(error));
      return vinculo.ativo
        ? sucesso({ tipo: "atualizado", mensagem: `${quem} já estava no projeto: papel atualizado.` })
        : sucesso({ tipo: "reativado", mensagem: `${quem} foi reativado(a) no projeto.` });
    }

    const { error } = await supabase
      .from("project_members")
      .insert({ project_id: projectId, user_id: perfil.id, role: papel, ativo: true });
    if (error) return falha(mensagemErroBanco(error));
    return sucesso({ tipo: "adicionado", mensagem: `${quem} foi adicionado(a) ao projeto.` });
  }

  // Conta que já existe no Auth (de outro sistema IMOBSYSTEMS): cria o profile do IMOBPROJ e vincula,
  // sem convite — a pessoa entra com a senha que já tem.
  const { data: idExistente, error: erroExistente } = await createAdminClient().rpc("fn_garantir_profile", {
    p_email: email,
    p_nome: nome,
  });
  if (erroExistente) return falha(mensagemErroBanco(erroExistente));
  if (idExistente) {
    const { error } = await supabase
      .from("project_members")
      .insert({ project_id: projectId, user_id: idExistente as string, role: papel, ativo: true });
    if (error) return falha(mensagemErroBanco(error));
    return sucesso({
      tipo: "adicionado",
      mensagem: `${nome || email} já tinha conta nos sistemas IMOBSYSTEMS e foi adicionado(a) ao projeto (entra com a senha atual).`,
    });
  }

  // Ninguém com este e-mail: convite pelo Supabase Auth. O trigger imobproj_on_auth_user_created cria o profile.
  let convite;
  try {
    convite = await enviarConvite(email, nome);
  } catch (e) {
    return falha(e instanceof Error ? e.message : "Não foi possível enviar o convite.");
  }
  if (convite.error || !convite.data.user) {
    const msg = convite.error?.message?.toLowerCase() ?? "";
    if (msg.includes("already") || msg.includes("registered"))
      return falha("Este e-mail já tem cadastro, mas o perfil não foi encontrado. Fale com o suporte.");
    if (msg.includes("rate")) return falha("Muitos convites em pouco tempo. Aguarde alguns minutos e tente de novo.");
    return falha("Não foi possível enviar o convite. Confira o e-mail e a configuração de e-mail do Supabase.");
  }

  const { error } = await supabase
    .from("project_members")
    .insert({ project_id: projectId, user_id: convite.data.user.id, role: papel, ativo: true });
  if (error)
    return falha(`O convite foi enviado, mas não foi possível vincular ao projeto: ${mensagemErroBanco(error)}`);
  return sucesso({ tipo: "convidado", mensagem: `Convite enviado para ${email}.` });
}

async function atualizarVinculo(membroId: string, alteracao: { role?: string; ativo?: boolean }) {
  const supabase = await createClient();
  const { error } = await supabase.from("project_members").update(alteracao).eq("id", membroId).select("id").single();
  return error ? falha(mensagemVinculo(error)) : sucesso(undefined);
}

export async function alterarPapel(entrada: unknown): Promise<ResultadoAcao> {
  const v = esquemaAlterarPapel.safeParse(entrada);
  if (!v.success) return falha(primeiroErro(v.error));
  const negado = await garantirSuperAdmin();
  if (negado) return negado;
  return atualizarVinculo(v.data.membroId, { role: v.data.papel });
}

export async function alterarAtivo(entrada: unknown): Promise<ResultadoAcao> {
  const v = esquemaAlterarAtivo.safeParse(entrada);
  if (!v.success) return falha(primeiroErro(v.error));
  const negado = await garantirSuperAdmin();
  if (negado) return negado;
  return atualizarVinculo(v.data.membroId, { ativo: v.data.ativo });
}

export async function removerMembro(entrada: unknown): Promise<ResultadoAcao> {
  const v = esquemaMembro.safeParse(entrada);
  if (!v.success) return falha(primeiroErro(v.error));
  const negado = await garantirSuperAdmin();
  if (negado) return negado;
  const supabase = await createClient();
  const { error } = await supabase.from("project_members").delete().eq("id", v.data.membroId).select("id").single();
  return error ? falha(mensagemVinculo(error)) : sucesso(undefined);
}

/** user_ids dos membros do projeto que foram convidados e ainda não confirmaram o e-mail. */
export async function convitesPendentes(entrada: unknown): Promise<ResultadoAcao<string[]>> {
  const v = esquemaProjeto.safeParse(entrada);
  if (!v.success) return falha(primeiroErro(v.error));
  const negado = await garantirSuperAdmin();
  if (negado) return negado;

  const supabase = await createClient();
  const { data: membros, error } = await supabase
    .from("project_members")
    .select("user_id")
    .eq("project_id", v.data.projectId);
  if (error) return falha(mensagemErroBanco(error));

  try {
    const admin = createAdminClient();
    const usuarios = await Promise.all(
      (membros ?? []).map(async ({ user_id }) => (await admin.auth.admin.getUserById(user_id)).data.user),
    );
    return sucesso(usuarios.filter((u) => u && !u.email_confirmed_at && u.invited_at).map((u) => u!.id));
  } catch {
    return sucesso([]); // sem service_role configurada: só não mostra o selo de convite pendente
  }
}

/** Reenvia o convite para quem ainda não confirmou o e-mail. */
export async function reenviarConvite(entrada: unknown): Promise<ResultadoAcao<string>> {
  const v = esquemaMembro.safeParse(entrada);
  if (!v.success) return falha(primeiroErro(v.error));
  const negado = await garantirSuperAdmin();
  if (negado) return negado;

  const supabase = await createClient();
  const { data: membro, error } = await supabase
    .from("project_members")
    .select("user_id, profiles(nome, email)")
    .eq("id", v.data.membroId)
    .maybeSingle();
  if (error) return falha(mensagemErroBanco(error));
  const perfil = membro?.profiles as unknown as { nome: string; email: string | null } | null;
  if (!membro || !perfil?.email) return falha("Membro sem e-mail cadastrado.");

  try {
    const { data } = await createAdminClient().auth.admin.getUserById(membro.user_id);
    if (data.user?.email_confirmed_at) return falha(`${perfil.nome || perfil.email} já confirmou o e-mail.`);
    const { error: erroConvite } = await enviarConvite(perfil.email, perfil.nome);
    if (erroConvite) {
      if (erroConvite.message.toLowerCase().includes("rate"))
        return falha("Muitos convites em pouco tempo. Aguarde alguns minutos e tente de novo.");
      return falha("Não foi possível reenviar o convite.");
    }
  } catch (e) {
    return falha(e instanceof Error ? e.message : "Não foi possível reenviar o convite.");
  }
  return sucesso(`Convite reenviado para ${perfil.email}.`);
}
