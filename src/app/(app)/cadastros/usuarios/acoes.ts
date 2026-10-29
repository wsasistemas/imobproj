"use server";

import { esquemaId, esquemaUsuario } from "@/components/cadastros/esquemas";
import { primeiroErro } from "@/components/cadastros/util";
import { falha, mensagemErroBanco, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { enviarConvite, mensagemErroConvite } from "@/lib/convite";
import { garantirPermissao, minhasPermissoes } from "@/lib/perfil-acesso";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Cadastros › Usuários: dados da pessoa (profiles), equipes e convite. Grava o super admin ou quem o perfil autoriza.
// Gravação em profiles/team_members com o cliente da sessão (a RLS confere de novo);
// service_role só para o Supabase Auth (convite, conta já existente em outro sistema, convite pendente).

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function sincronizarEquipes(supabase: Supabase, userId: string, equipes: string[]) {
  const { data: atuais, error } = await supabase.from("team_members").select("team_id").eq("user_id", userId);
  if (error) return error;
  const tinha = new Set((atuais ?? []).map((a) => a.team_id as string));
  const quer = new Set(equipes);
  const sair = [...tinha].filter((t) => !quer.has(t));
  const entrar = [...quer].filter((t) => !tinha.has(t));
  if (sair.length) {
    const { error: e } = await supabase.from("team_members").delete().eq("user_id", userId).in("team_id", sair);
    if (e) return e;
  }
  if (entrar.length) {
    const { error: e } = await supabase.from("team_members").insert(entrar.map((team_id) => ({ team_id, user_id: userId })));
    if (e) return e;
  }
  return null;
}

export type ResultadoUsuario = { id: string; mensagem: string };

export async function salvarUsuario(entrada: unknown): Promise<ResultadoAcao<ResultadoUsuario>> {
  const v = esquemaUsuario.safeParse(entrada);
  if (!v.success) return falha(primeiroErro(v.error));
  const negado = await garantirPermissao("cadastros_usuarios", v.data.id ? "editar" : "criar");
  if (negado) return negado;

  const { id, email, equipes, perfil, ...campos } = v.data;
  // Perfil de acesso: só o super admin troca (o trigger trg_profiles_protege_perfil confere de novo).
  const { superAdmin } = await minhasPermissoes();
  const dados = {
    ...campos,
    organization_id: campos.organization_id ?? null,
    ...(superAdmin && perfil !== undefined ? { perfil } : {}),
  };
  const supabase = await createClient();
  let userId = id;
  let mensagem = "Usuário salvo.";

  if (!userId) {
    const { data: existente, error: erroBusca } = await supabase.from("profiles").select("id").eq("email", email).maybeSingle();
    if (erroBusca) return falha(mensagemErroBanco(erroBusca));
    if (existente) return falha("Já existe um usuário com este e-mail. Procure na lista e edite o cadastro.");

    // Conta que já existe no Auth (outro sistema IMOBSYSTEMS): cria só o profile; entra com a senha atual.
    const { data: idExistente, error: erroExistente } = await createAdminClient().rpc("fn_garantir_profile", {
      p_email: email,
      p_nome: dados.nome,
    });
    if (erroExistente) return falha(mensagemErroBanco(erroExistente));
    if (idExistente) {
      userId = idExistente as string;
      mensagem = `${dados.nome} já tinha conta nos sistemas IMOBSYSTEMS: entra com a senha atual.`;
    } else {
      let convite;
      try {
        convite = await enviarConvite(email, dados.nome);
      } catch (e) {
        return falha(e instanceof Error ? e.message : "Não foi possível enviar o convite.");
      }
      if (convite.error || !convite.data.user) return falha(mensagemErroConvite(convite.error?.message));
      userId = convite.data.user.id;
      mensagem = `Convite enviado para ${email}.`;
    }
  }

  const { error } = await supabase.from("profiles").update(dados).eq("id", userId).select("id").single();
  if (error)
    return falha(
      error.code === "PGRST116" ? "Usuário não encontrado (ou você não tem permissão para alterá-lo)." : mensagemErroBanco(error),
    );
  const erroEquipes = await sincronizarEquipes(supabase, userId, equipes);
  if (erroEquipes) return falha(`Dados salvos, mas as equipes não: ${mensagemErroBanco(erroEquipes)}`);
  return sucesso({ id: userId, mensagem });
}

/** ids dos usuários que foram convidados e ainda não confirmaram o e-mail. */
export async function convitesPendentesUsuarios(): Promise<ResultadoAcao<string[]>> {
  const negado = await garantirPermissao("cadastros_usuarios", "ver");
  if (negado) return negado;
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select("id");
  if (error) return falha(mensagemErroBanco(error));
  try {
    const admin = createAdminClient();
    const usuarios = await Promise.all((data ?? []).map(async ({ id }) => (await admin.auth.admin.getUserById(id)).data.user));
    return sucesso(usuarios.filter((u) => u && !u.email_confirmed_at && u.invited_at).map((u) => u!.id));
  } catch {
    return sucesso([]); // sem service_role configurada: só não mostra o selo "Convite enviado"
  }
}

export async function reenviarConviteUsuario(entrada: unknown): Promise<ResultadoAcao<string>> {
  const v = esquemaId.safeParse(entrada);
  if (!v.success) return falha(primeiroErro(v.error));
  const negado = await garantirPermissao("cadastros_usuarios", "criar");
  if (negado) return negado;

  const supabase = await createClient();
  const { data: perfil, error } = await supabase.from("profiles").select("nome, email").eq("id", v.data.id).maybeSingle();
  if (error) return falha(mensagemErroBanco(error));
  if (!perfil?.email) return falha("Usuário sem e-mail cadastrado.");
  try {
    const { data } = await createAdminClient().auth.admin.getUserById(v.data.id);
    if (data.user?.email_confirmed_at) return falha(`${perfil.nome || perfil.email} já confirmou o e-mail.`);
    const { error: erroConvite } = await enviarConvite(perfil.email, perfil.nome);
    if (erroConvite) return falha(mensagemErroConvite(erroConvite.message));
  } catch (e) {
    return falha(e instanceof Error ? e.message : "Não foi possível reenviar o convite.");
  }
  return sucesso(`Convite reenviado para ${perfil.email}.`);
}
