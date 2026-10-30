// Edge Function openwa-saude — pergunta ao OpenWA o status das sessões e atualiza wa_sessions.
//
// Por quê: o OpenWA só manda webhook quando acontece algo (mensagem, mudança de status). Sem isso, o selo
// "OpenWA conectado" (sinal nos últimos 2 min) ficava vermelho com a sessão funcionando, só por silêncio.
//
// Entrada: POST {}. Quem chama: o pg_cron imobproj-openwa-saude (fn_openwa_saude_disparar via pg_net, 1 min),
// com "Authorization: Bearer <anon>" + x-openwa-cron = openwa_cron_secret do Vault; ou a service_role.
// Sessão "ready" no OpenWA → conectado + last_heartbeat = agora. failed/action_required → erro. Outro status ou
// sessão que sumiu do OpenWA → desconectado (sem mexer no last_heartbeat). OpenWA fora do ar: não altera nada
// (o selo já fica vermelho sozinho quando o sinal envelhece).

import { json, preflight } from "../_shared/cors.ts";
import { listarSessoes } from "../_shared/openwa.ts";
import { clienteServico, ehChamadaDeServico, iguaisTempoConstante, mensagemDe, type Cliente } from "../_shared/supabase.ts";
import { lerConfigOpenwa, lerSegredo } from "../_shared/vault.ts";

type Status = "conectado" | "desconectado" | "erro";

async function ehCron(admin: Cliente, req: Request): Promise<boolean> {
  const recebido = req.headers.get("x-openwa-cron");
  if (!recebido) return false;
  const segredo = await lerSegredo(admin, "imobproj_openwa_cron_secret");
  return !!segredo && iguaisTempoConstante(recebido.trim(), segredo);
}

function statusDe(s: string | undefined): Status {
  if (s === "ready") return "conectado";
  if (s === "failed" || s === "action_required") return "erro";
  return "desconectado";
}

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== "POST") return json(405, { erro: "Use POST." });

  try {
    const admin = clienteServico();
    if (!(ehChamadaDeServico(req) || (await ehCron(admin, req)))) return json(401, { erro: "Não autorizado." });

    const cfg = await lerConfigOpenwa(admin);
    if (!cfg.ativo || !cfg.url || !cfg.apiKey) return json(200, { estado: "ignorado", motivo: "OpenWA desligado ou sem configuração" });

    const r = await listarSessoes(cfg.url, cfg.apiKey);
    if (!r.ok) {
      console.error(JSON.stringify({ evento: "openwa.saude_sem_resposta", erro: r.erro, ms: r.latenciaMs }));
      return json(502, { estado: "openwa_sem_resposta", erro: r.erro });
    }
    const doOpenwa = new Map((Array.isArray(r.dados) ? r.dados : []).map((s) => [String(s.id), s.status]));

    const { data, error } = await admin
      .from("wa_sessions")
      .select("id, openwa_session_id, status")
      .not("openwa_session_id", "is", null);
    if (error) throw new Error(error.message);

    const agora = new Date().toISOString();
    let conectadas = 0;
    for (const s of (data ?? []) as { id: string; openwa_session_id: string; status: Status }[]) {
      const novo = statusDe(doOpenwa.get(s.openwa_session_id));
      if (novo === "conectado") conectadas++;
      if (novo === "conectado") {
        await admin.from("wa_sessions").update({ status: novo, last_heartbeat: agora }).eq("id", s.id);
      } else if (novo !== s.status) {
        await admin.from("wa_sessions").update({ status: novo }).eq("id", s.id);
      }
    }
    return json(200, { estado: "ok", sessoes: data?.length ?? 0, conectadas, latenciaMs: r.latenciaMs });
  } catch (e) {
    console.error(JSON.stringify({ evento: "openwa.saude_erro", erro: mensagemDe(e) }));
    return json(500, { erro: "Falha ao verificar o OpenWA.", detalhe: mensagemDe(e) });
  }
});
