import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_SCHEMA, SUPABASE_URL } from "./env";

/**
 * Cliente com a service_role: ignora a RLS. Só para o que o usuário não consegue fazer com a própria
 * sessão (ex.: convite por e-mail no Supabase Auth). SEMPRE chame exigirPermissao antes.
 */
export function createAdminClient() {
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !chave) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada.");
  return createClient(SUPABASE_URL, chave, {
    db: { schema: SUPABASE_SCHEMA },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
