// Configuração do OpenWA: openwa_config (tabela) + segredos do Supabase Vault (fn_openwa_segredo, só service_role).

import type { Cliente } from "./supabase.ts";

export type NomeSegredo =
  | "openwa_api_key"
  | "openwa_webhook_secret"
  | "openwa_functions_url"
  | "openwa_anon_key"
  | "openwa_cron_secret";

export async function lerSegredo(admin: Cliente, nome: NomeSegredo): Promise<string | null> {
  const { data, error } = await admin.rpc("fn_openwa_segredo", { p_nome: nome });
  if (error) throw new Error(`Vault: ${error.message}`);
  return typeof data === "string" && data.length > 0 ? data : null;
}

export type ConfigOpenwa = { ativo: boolean; url: string | null; apiKey: string | null };

/** Configuração global com a API key já lida do Vault. */
export async function lerConfigOpenwa(admin: Cliente): Promise<ConfigOpenwa> {
  const { data, error } = await admin.from("openwa_config").select("ativo, url").eq("id", true).maybeSingle();
  if (error) throw new Error(`openwa_config: ${error.message}`);
  const linha = data as { ativo: boolean; url: string | null } | null;
  return {
    ativo: linha?.ativo ?? false,
    url: linha?.url?.trim() || null,
    apiKey: await lerSegredo(admin, "openwa_api_key"),
  };
}

export type SessaoWa = {
  id: string;
  project_id: string;
  numero: string;
  openwa_url: string | null;
  openwa_session_id: string | null;
  api_key_secret_id: string | null;
  status: "conectado" | "desconectado" | "erro";
};

export const COLUNAS_SESSAO = "id, project_id, numero, openwa_url, openwa_session_id, api_key_secret_id, status";

/**
 * URL e chave efetivas da sessão. Um servidor OpenWA com várias sessões: valem a URL e a API key globais
 * (openwa_config + Vault). wa_sessions.openwa_url (coluna obrigatória do esquema base) é só reserva, usada
 * quando a URL global está vazia.
 */
export function credencialDaSessao(cfg: ConfigOpenwa, sessao: SessaoWa): { url: string | null; apiKey: string | null } {
  return { url: cfg.url || sessao.openwa_url?.trim() || null, apiKey: cfg.apiKey };
}
