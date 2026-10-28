// CORS e respostas JSON das Edge Functions do IMOBPROJ.
// As funções são chamadas pelo servidor Next (Server Actions) e pelo cron; o CORS permite também
// supabase.functions.invoke direto do navegador, se outra tela precisar.

export const cabecalhosCors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-openwa-cron",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cabecalhosCors, "Content-Type": "application/json; charset=utf-8" },
  });
}

/** Responde o preflight do navegador; devolve null para seguir com a requisição. */
export function preflight(req: Request): Response | null {
  return req.method === "OPTIONS" ? new Response("ok", { headers: cabecalhosCors }) : null;
}
