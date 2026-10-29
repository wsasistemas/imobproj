// Clientes Supabase das Edge Functions.
//   clienteServico(): service_role — ignora a RLS. Só depois de autenticar quem chamou.
//   usuarioDaRequisicao(req): confere o JWT do usuário (Authorization: Bearer <access_token>) e devolve um
//   cliente com a sessão dele (a RLS vale) para checar papel com fn_has_role.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Cliente = SupabaseClient<any, "imobproj">;

function env(nome: string): string {
  const v = Deno.env.get(nome);
  if (!v) throw new Error(`Variável de ambiente ${nome} ausente na Edge Function.`);
  return v;
}

// Banco compartilhado pelos sistemas IMOBSYSTEMS: as tabelas do IMOBPROJ ficam no schema "imobproj".
const semSessao = { db: { schema: "imobproj" }, auth: { autoRefreshToken: false, persistSession: false } } as const;

export function clienteServico(): Cliente {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), semSessao);
}

export function tokenDa(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : null;
}

/** Chamada interna (cron/pg_net ou outra função) com a chave service_role como Bearer. */
export function ehChamadaDeServico(req: Request): boolean {
  const token = tokenDa(req);
  const chave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return !!token && !!chave && iguaisTempoConstante(token, chave);
}

export type Usuario = { id: string; cliente: Cliente };

/** Valida o JWT do usuário com o Auth. null se ausente/inválido. */
export async function usuarioDaRequisicao(req: Request): Promise<Usuario | null> {
  const token = tokenDa(req);
  if (!token) return null;
  const cliente = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    ...semSessao,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await cliente.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, cliente };
}

/** Compara sem atalho (tempo constante para tamanhos iguais). */
export function iguaisTempoConstante(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length === 0 || ea.length !== eb.length) return false;
  let dif = 0;
  for (let i = 0; i < ea.length; i++) dif |= ea[i] ^ eb[i];
  return dif === 0;
}

export function mensagemDe(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
