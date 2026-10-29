// Central de Acessos (schema `acessos` no Supabase compartilhado, criada pelo imobdesk). Decisão D3: o IMOBPROJ
// só usa os atalhos públicos (pode_acessar_app e pa_*); não existe modelo paralelo aqui.

export const MSG_SEM_ACESSO = "Você não tem acesso ao IMOBPROJ. Peça liberação ao administrador.";

/** Chave do IMOBPROJ na Central de Acessos (acessos.aplicativos.schema_name). */
export const APP_CENTRAL = "imobproj";

/**
 * public.pode_acessar_app (Central de Acessos, compartilhada pelos sistemas IMOBSYSTEMS).
 * true/false; null quando a função não existe ou falha (aí deixa entrar e registra o aviso, para não travar).
 */
export async function podeEntrarNoApp(supabase: {
  schema: (s: "public") => { rpc: (f: string, a: object) => PromiseLike<{ data: unknown; error: { message: string } | null }> };
}): Promise<boolean | null> {
  const { data, error } = await supabase.schema("public").rpc("pode_acessar_app", { p_app: APP_CENTRAL });
  if (error) {
    console.warn(`[central-acessos] pode_acessar_app falhou; entrada liberada: ${error.message}`);
    return null;
  }
  return data === true ? true : data === false ? false : null;
}
