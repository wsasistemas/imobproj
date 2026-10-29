import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

// Convite pelo Supabase Auth (service_role). Só chame depois de exigirSuperAdmin().

export async function origemDaRequisicao() {
  const h = await headers();
  const origem = h.get("origin");
  if (origem) return origem;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const protocolo = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocolo}://${host}`;
}

export async function enviarConvite(email: string, nome: string) {
  const origem = await origemDaRequisicao();
  return createAdminClient().auth.admin.inviteUserByEmail(email, {
    // "sistema" faz o trigger imobproj_on_auth_user_created criar o profile (o Auth é compartilhado).
    data: { nome, sistema: "imobproj" },
    // O convite volta com a sessão no #hash (sem PKCE): só a página de cliente /auth/confirmar consegue lê-la.
    redirectTo: `${origem}/auth/confirmar?next=${encodeURIComponent("/redefinir-senha?convite=1")}`,
  });
}

/** Mensagem amigável para os erros do convite. */
export function mensagemErroConvite(mensagem: string | undefined) {
  const msg = mensagem?.toLowerCase() ?? "";
  if (msg.includes("already") || msg.includes("registered"))
    return "Este e-mail já tem cadastro, mas o perfil não foi encontrado. Fale com o suporte.";
  if (msg.includes("rate")) return "Muitos convites em pouco tempo. Aguarde alguns minutos e tente de novo.";
  return "Não foi possível enviar o convite. Confira o e-mail e a configuração de e-mail do Supabase.";
}
