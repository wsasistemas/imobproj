// Edge Function openwa-send — envia UMA mensagem da fila wa_messages pelo OpenWA (timeout de 15 s).
//
// Entrada: POST { message_id }.
// Quem chama:
//   * o portal (src/lib/whatsapp/enviar.ts → supabase.functions.invoke) com o JWT do usuário: a função confere
//     que o usuário enxerga a mensagem (RLS de wa_messages) antes de enviar com a service_role;
//   * o cron (fn_openwa_processar_fila via pg_net) com "Authorization: Bearer <anon>" e o header
//     x-openwa-cron = segredo openwa_cron_secret do Vault (comparação em tempo constante);
//   * outra função/servidor com "Authorization: Bearer <service_role JWT>".
// Resposta: {estado: 'enviada'|'falhou'|'ignorada', ...} com 200 (enviada), 502 (falhou, fica na fila do cron) ou
// 409 (ignorada: já enviada, em envio, 5 tentativas ou OpenWA desligado); 401 sem autenticação; 404 mensagem invisível.

import { json, preflight } from "../_shared/cors.ts";
import { enviarMensagem } from "../_shared/envio.ts";
import { clienteServico, ehChamadaDeServico, iguaisTempoConstante, mensagemDe, usuarioDaRequisicao, type Cliente } from "../_shared/supabase.ts";
import { lerSegredo } from "../_shared/vault.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function ehCron(admin: Cliente, req: Request): Promise<boolean> {
  const recebido = req.headers.get("x-openwa-cron");
  if (!recebido) return false;
  const segredo = await lerSegredo(admin, "imobproj_openwa_cron_secret");
  return !!segredo && iguaisTempoConstante(recebido.trim(), segredo);
}

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== "POST") return json(405, { erro: "Use POST." });

  let messageId: string;
  try {
    const corpo = (await req.json()) as { message_id?: unknown };
    messageId = String(corpo.message_id ?? "");
  } catch {
    return json(400, { erro: "Corpo inválido: envie { message_id }." });
  }
  if (!UUID.test(messageId)) return json(400, { erro: "message_id inválido." });

  try {
    const admin = clienteServico();
    if (!(ehChamadaDeServico(req) || (await ehCron(admin, req)))) {
      const usuario = await usuarioDaRequisicao(req);
      if (!usuario) return json(401, { erro: "Sessão inválida." });
      // A RLS de wa_messages (select) só mostra mensagens de projetos que o usuário enxerga.
      const { data: visivel } = await usuario.cliente.from("wa_messages").select("id").eq("id", messageId).maybeSingle();
      if (!visivel) return json(404, { erro: "Mensagem não encontrada." });
    }

    const resultado = await enviarMensagem(admin, messageId);
    console.log(JSON.stringify({ evento: "openwa.send", message_id: messageId, ...resultado }));
    // Só 200 quando saiu de fato: enfileirarMensagemWhatsApp usa o erro do invoke para dizer "enviada agora".
    return json(resultado.estado === "enviada" ? 200 : resultado.estado === "falhou" ? 502 : 409, resultado);
  } catch (e) {
    console.error(JSON.stringify({ evento: "openwa.send_erro", message_id: messageId, erro: mensagemDe(e) }));
    return json(500, { erro: "Falha ao enviar.", detalhe: mensagemDe(e) });
  }
});
