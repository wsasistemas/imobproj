import "server-only";
import { falha, mensagemErroBanco, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { createClient } from "@/lib/supabase/server";

// Contrato único de envio para grupos do WhatsApp (Atas, Conversas e o que vier depois).
//
// 1. Grava a mensagem em wa_messages como saída 'pendente' com a sessão do usuário (RLS wa_messages_insert:
//    direction='out', status='pendente', tentativas=0, author_user_id = auth.uid(), quem vê o projeto).
// 2. Chama a Edge Function `openwa-send` com { message_id }; ela envia pelo OpenWA (timeout 15 s) e atualiza
//    status/tentativas/erro com a service_role.
// 3. Se a chamada falhar (função fora do ar, OpenWA desligado), a mensagem continua na fila e o job pg_cron
//    (a cada 2 min, até 5 tentativas) reenvia. Por isso o retorno é "enfileirada", não "entregue".
//
// Mídia: suba antes o arquivo para o Storage e passe `mediaPath` (caminho no bucket, ex.: "documentos/<project>/...").

export type NovaMensagemWhatsApp = {
  groupId: string;
  body?: string;
  mediaPath?: string;
  quotedWaMessageId?: string;
};

export async function enfileirarMensagemWhatsApp(
  msg: NovaMensagemWhatsApp,
): Promise<ResultadoAcao<{ id: string; enviadaAgora: boolean }>> {
  if (!msg.body?.trim() && !msg.mediaPath) return falha("A mensagem está vazia.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return falha("Sua sessão expirou. Entre novamente.");

  const { data, error } = await supabase
    .from("wa_messages")
    .insert({
      group_id: msg.groupId,
      direction: "out",
      status: "pendente",
      tentativas: 0,
      author_user_id: user.id,
      body: msg.body?.trim() || null,
      media_path: msg.mediaPath ?? null,
      quoted_wa_message_id: msg.quotedWaMessageId ?? null,
    })
    .select("id")
    .single();
  if (error || !data) return falha(mensagemErroBanco(error));

  const { error: erroEnvio } = await supabase.functions.invoke("openwa-send", { body: { message_id: data.id } });
  return sucesso({ id: data.id as string, enviadaAgora: !erroEnvio });
}
