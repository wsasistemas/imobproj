"use server";

import { revalidatePath } from "next/cache";
import { primeiroErro } from "@/components/cadastros/util";
import {
  esquemaEmpresa,
  esquemaIntegracoes,
  esquemaNotificacoes,
  esquemaOs,
} from "@/components/configuracoes/esquemas-gerais";
import { falha, MSG_BANCO_DESATUALIZADO, ehBancoDesatualizado, mensagemErroBanco, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { garantirPermissao } from "@/lib/perfil-acesso";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Configurações › Configurações gerais (Fase 6). Uma linha em imobproj.configuracoes; grava quem tem
// "editar" em config_gerais (a RLS configuracoes_update confere de novo).

const ESQUEMAS = {
  empresa: esquemaEmpresa,
  os: esquemaOs,
  notificacoes: esquemaNotificacoes,
  integracoes: esquemaIntegracoes,
} as const;

export async function salvarConfiguracoes(aba: keyof typeof ESQUEMAS, entrada: unknown): Promise<ResultadoAcao> {
  const esquema = ESQUEMAS[aba];
  if (!esquema) return falha("Aba desconhecida.");
  const v = esquema.safeParse(entrada);
  if (!v.success) return falha(primeiroErro(v.error));
  const negado = await garantirPermissao("config_gerais", "editar");
  if (negado) return negado;
  const supabase = await createClient();
  const { error } = await supabase.from("configuracoes").update(v.data).eq("id", true).select("id").single();
  if (error) return falha(ehBancoDesatualizado(error) ? MSG_BANCO_DESATUALIZADO : mensagemErroBanco(error));
  revalidatePath("/", "layout");
  return sucesso(undefined);
}

const TIPOS_LOGO: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

/** Logo no bucket público imobproj-marca (service_role, depois de checar a permissão). */
export async function enviarLogo(dados: FormData): Promise<ResultadoAcao<{ logo_path: string }>> {
  const arquivo = dados.get("logo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return falha("Escolha uma imagem.");
  const ext = TIPOS_LOGO[arquivo.type];
  if (!ext) return falha("Use uma imagem PNG, JPG, WEBP ou SVG.");
  if (arquivo.size > 2 * 1_048_576) return falha("A imagem pode ter no máximo 2 MB.");
  const negado = await garantirPermissao("config_gerais", "editar");
  if (negado) return negado;

  const caminho = `logo-${Date.now()}.${ext}`;
  const admin = createAdminClient();
  const envio = await admin.storage.from("imobproj-marca").upload(caminho, arquivo, { contentType: arquivo.type, upsert: false });
  if (envio.error) return falha("Não foi possível enviar a imagem. Tente de novo.");

  const supabase = await createClient();
  const { data: antes } = await supabase.from("configuracoes").select("logo_path").eq("id", true).maybeSingle();
  const { error } = await supabase.from("configuracoes").update({ logo_path: caminho }).eq("id", true).select("id").single();
  if (error) {
    await admin.storage.from("imobproj-marca").remove([caminho]);
    return falha(ehBancoDesatualizado(error) ? MSG_BANCO_DESATUALIZADO : mensagemErroBanco(error));
  }
  if (antes?.logo_path) await admin.storage.from("imobproj-marca").remove([antes.logo_path]);
  revalidatePath("/", "layout");
  return sucesso({ logo_path: caminho });
}

export async function removerLogo(): Promise<ResultadoAcao> {
  const negado = await garantirPermissao("config_gerais", "editar");
  if (negado) return negado;
  const supabase = await createClient();
  const { data: antes } = await supabase.from("configuracoes").select("logo_path").eq("id", true).maybeSingle();
  const { error } = await supabase.from("configuracoes").update({ logo_path: null }).eq("id", true).select("id").single();
  if (error) return falha(ehBancoDesatualizado(error) ? MSG_BANCO_DESATUALIZADO : mensagemErroBanco(error));
  if (antes?.logo_path) await createAdminClient().storage.from("imobproj-marca").remove([antes.logo_path]);
  revalidatePath("/", "layout");
  return sucesso(undefined);
}
