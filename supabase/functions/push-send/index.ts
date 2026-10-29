// Edge Function push-send — envia UM item de push_outbox para os aparelhos do usuário (Expo Push API).
//
// Entrada: POST { id } (id de push_outbox).
// Quem chama: o trigger de push_outbox e o cron push-reenvio (fn_push_disparar via pg_net), com
// "Authorization: Bearer <anon>" + x-openwa-cron = openwa_cron_secret do Vault; ou outra função com a service_role.
// Resposta: {estado: 'enviada'|'falhou'|'sem_aparelho'|'ignorada'}. Falha fica na fila (até 5 tentativas).

import { json, preflight } from "../_shared/cors.ts";
import { clienteServico, ehChamadaDeServico, iguaisTempoConstante, mensagemDe, type Cliente } from "../_shared/supabase.ts";
import { lerSegredo } from "../_shared/vault.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXPO_PUSH = "https://exp.host/--/api/v2/push/send";
const TIMEOUT_MS = 15_000;

type ItemFila = {
  id: string;
  user_id: string;
  titulo: string;
  corpo: string;
  dados: Record<string, unknown>;
  status: string;
  tentativas: number;
};

type Ticket = { status: "ok"; id: string } | { status: "error"; message: string; details?: { error?: string } };

async function ehCron(admin: Cliente, req: Request): Promise<boolean> {
  const recebido = req.headers.get("x-openwa-cron");
  if (!recebido) return false;
  const segredo = await lerSegredo(admin, "imobproj_openwa_cron_secret");
  return !!segredo && iguaisTempoConstante(recebido.trim(), segredo);
}

async function marcar(admin: Cliente, item: ItemFila, status: string, erro: string | null) {
  await admin
    .from("push_outbox")
    .update({ status, erro, tentativas: item.tentativas + (status === "sem_aparelho" ? 0 : 1) })
    .eq("id", item.id);
}

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== "POST") return json(405, { erro: "Use POST." });

  let id: string;
  try {
    id = String(((await req.json()) as { id?: unknown }).id ?? "");
  } catch {
    return json(400, { erro: "Corpo inválido: envie { id }." });
  }
  if (!UUID.test(id)) return json(400, { erro: "id inválido." });

  try {
    const admin = clienteServico();
    if (!(ehChamadaDeServico(req) || (await ehCron(admin, req)))) return json(401, { erro: "Não autorizado." });

    const { data: linha, error } = await admin
      .from("push_outbox")
      .select("id, user_id, titulo, corpo, dados, status, tentativas")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const item = linha as ItemFila | null;
    if (!item) return json(404, { erro: "Item não encontrado." });
    if (item.status === "enviada" || item.status === "sem_aparelho" || item.tentativas >= 5)
      return json(409, { estado: "ignorada" });

    const { data: aparelhos } = await admin
      .from("push_tokens")
      .select("token")
      .eq("user_id", item.user_id)
      .eq("ativo", true);
    const tokens = (aparelhos ?? []).map((a) => (a as { token: string }).token);
    if (tokens.length === 0) {
      await marcar(admin, item, "sem_aparelho", null);
      return json(200, { estado: "sem_aparelho" });
    }

    let tickets: Ticket[];
    try {
      const resp = await fetch(EXPO_PUSH, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify(
          tokens.map((to) => ({
            to,
            title: item.titulo,
            body: item.corpo,
            data: item.dados,
            sound: "default",
            channelId: "os",
            priority: "high",
          })),
        ),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const corpo = (await resp.json()) as { data?: Ticket[]; errors?: { message: string }[] };
      if (!resp.ok || !corpo.data) throw new Error(corpo.errors?.[0]?.message ?? `Expo respondeu ${resp.status}`);
      tickets = corpo.data;
    } catch (e) {
      await marcar(admin, item, "falhou", mensagemDe(e));
      return json(502, { estado: "falhou", erro: mensagemDe(e) });
    }

    // Aparelho desinstalado/sem permissão: desativa o token para não tentar de novo.
    const mortos = tokens.filter((_, i) => {
      const t = tickets[i];
      return t?.status === "error" && t.details?.error === "DeviceNotRegistered";
    });
    if (mortos.length) await admin.from("push_tokens").update({ ativo: false }).in("token", mortos);

    const algumOk = tickets.some((t) => t.status === "ok");
    const erros = tickets.filter((t) => t.status === "error").map((t) => (t as { message: string }).message);
    await marcar(admin, item, algumOk ? "enviada" : mortos.length === tokens.length ? "sem_aparelho" : "falhou", erros.join("; ") || null);
    console.log(JSON.stringify({ evento: "push.send", id, aparelhos: tokens.length, ok: algumOk, erros: erros.length }));
    return json(algumOk ? 200 : 502, { estado: algumOk ? "enviada" : "falhou" });
  } catch (e) {
    console.error(JSON.stringify({ evento: "push.send_erro", id, erro: mensagemDe(e) }));
    return json(500, { erro: "Falha ao enviar.", detalhe: mensagemDe(e) });
  }
});
