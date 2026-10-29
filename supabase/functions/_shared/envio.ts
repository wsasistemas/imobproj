// Envio de UMA mensagem da fila wa_messages pelo OpenWA (usado por openwa-send e pelo webhook nas respostas
// automáticas). Regras:
//   * só direction='out' com status 'pendente' ou 'falhou' e tentativas < 5;
//   * trava enviando_desde (evita envio duplo entre o portal e o cron);
//   * OpenWA desligado: não tenta nem conta tentativa (o cron tenta de novo quando religar);
//   * sucesso → status 'enviada', wa_message_id, tentativas + 1, erro null;
//   * falha   → status 'falhou', tentativas + 1, erro (na 5ª, o trigger fn_wa_alerta_falha cria o alerta).

import {
  base64DeBytes,
  enviarMidia,
  enviarTexto,
  mimeDaExtensao,
  TIMEOUT_ENVIO_MS,
  type MidiaEnvio,
  type RespostaEnvio,
  type RespostaOpenwa,
} from "./openwa.ts";
import type { Cliente } from "./supabase.ts";
import { COLUNAS_SESSAO, credencialDaSessao, lerConfigOpenwa, type SessaoWa } from "./vault.ts";

export const MAX_TENTATIVAS = 5;
/** Até este tamanho a mídia vai em base64 (evita o OpenWA baixar de uma URL que ele pode bloquear por SSRF). */
const LIMITE_BASE64 = 15 * 1_048_576;

export type ResultadoEnvio =
  | { estado: "enviada"; waMessageId: string | null }
  | { estado: "falhou"; erro: string; tentativas: number }
  | { estado: "ignorada"; motivo: string };

type MensagemFila = {
  id: string;
  group_id: string;
  direction: "in" | "out";
  status: "recebida" | "pendente" | "enviada" | "falhou";
  tentativas: number;
  body: string | null;
  media_path: string | null;
  quoted_wa_message_id: string | null;
  author_user_id: string | null;
};

type GrupoFila = { id: string; project_id: string; session_id: string | null; wa_group_id: string | null; ativo: boolean; nome: string };

const BUCKETS = new Set(["imobproj-whatsapp", "imobproj-documentos", "imobproj-evidencias"]);

/**
 * media_path = "<bucket>/<caminho>". Caminho que começa por um uuid (sem bucket, como no seed) é do bucket
 * "evidencias" (convenção <project_id>/<os_id>/<arquivo>).
 */
export function resolverMidia(mediaPath: string): { bucket: string; caminho: string } {
  const limpo = mediaPath.replace(/^\/+/, "");
  const [primeiro, ...resto] = limpo.split("/");
  if (BUCKETS.has(primeiro) && resto.length > 0) return { bucket: primeiro, caminho: resto.join("/") };
  if (/^[0-9a-f-]{36}$/i.test(primeiro)) return { bucket: "imobproj-evidencias", caminho: limpo };
  return { bucket: primeiro, caminho: resto.join("/") };
}

async function prepararMidia(admin: Cliente, mediaPath: string): Promise<MidiaEnvio> {
  const { bucket, caminho } = resolverMidia(mediaPath);
  const filename = caminho.split("/").pop() || "arquivo";
  const { data, error } = await admin.storage.from(bucket).download(caminho);
  if (error || !data) throw new Error(`Mídia não encontrada no Storage (${bucket}/${caminho})`);
  const mimetype = (data.type && data.type !== "application/octet-stream" ? data.type : mimeDaExtensao(filename)).split(";")[0];
  if (data.size <= LIMITE_BASE64) {
    return { tipo: "base64", base64: base64DeBytes(new Uint8Array(await data.arrayBuffer())), mimetype, filename };
  }
  const assinado = await admin.storage.from(bucket).createSignedUrl(caminho, 3600);
  if (assinado.error || !assinado.data) throw new Error("Não foi possível gerar a URL assinada da mídia");
  return { tipo: "url", url: assinado.data.signedUrl, mimetype, filename };
}

/** "*Fernanda:* texto" — no grupo, quem envia é o número do sistema; o nome do autor vai junto. */
async function comAutor(admin: Cliente, texto: string, autorId: string | null): Promise<string> {
  if (!autorId) return texto;
  const { data } = await admin.from("profiles").select("nome").eq("id", autorId).maybeSingle();
  const primeiro = (data as { nome: string } | null)?.nome?.trim().split(/\s+/)[0];
  return primeiro ? `*${primeiro}:* ${texto}` : texto;
}

export async function enviarMensagem(admin: Cliente, messageId: string): Promise<ResultadoEnvio> {
  // 1. Trava: só uma execução por mensagem (portal × cron). Trava velha (> 2 min) é retomada.
  const limite = new Date(Date.now() - 120_000).toISOString();
  const { data: travada, error: erroTrava } = await admin
    .from("wa_messages")
    .update({ enviando_desde: new Date().toISOString() })
    .eq("id", messageId)
    .eq("direction", "out")
    .in("status", ["pendente", "falhou"])
    .lt("tentativas", MAX_TENTATIVAS)
    .or(`enviando_desde.is.null,enviando_desde.lt."${limite}"`)
    .select("id, group_id, direction, status, tentativas, body, media_path, quoted_wa_message_id, author_user_id")
    .maybeSingle();
  if (erroTrava) throw new Error(`wa_messages: ${erroTrava.message}`);
  if (!travada) return { estado: "ignorada", motivo: "Mensagem inexistente, já enviada, com 5 tentativas ou em envio." };
  const msg = travada as MensagemFila;

  const liberar = async (campos: Record<string, unknown>) => {
    const { error } = await admin.from("wa_messages").update({ ...campos, enviando_desde: null }).eq("id", msg.id);
    if (error) console.error(JSON.stringify({ evento: "openwa.send_gravar_falhou", id: msg.id, erro: error.message }));
  };
  const falhar = async (erro: string): Promise<ResultadoEnvio> => {
    const tentativas = msg.tentativas + 1;
    await liberar({ status: "falhou", tentativas, erro: erro.slice(0, 1000) });
    return { estado: "falhou", erro, tentativas };
  };

  try {
    const cfg = await lerConfigOpenwa(admin);
    if (!cfg.ativo) {
      await liberar({ erro: "OpenWA desligado na administração — a mensagem sai quando religar." });
      return { estado: "ignorada", motivo: "OpenWA desligado." };
    }

    const { data: g } = await admin
      .from("wa_groups")
      .select("id, project_id, session_id, wa_group_id, ativo, nome")
      .eq("id", msg.group_id)
      .maybeSingle();
    const grupo = g as GrupoFila | null;
    if (!grupo) return await falhar("Grupo não encontrado.");
    if (!grupo.wa_group_id) return await falhar("Grupo ainda não foi criado no WhatsApp (sem wa_group_id).");

    let sessao: SessaoWa | null = null;
    if (grupo.session_id) {
      const { data } = await admin.from("wa_sessions").select(COLUNAS_SESSAO).eq("id", grupo.session_id).maybeSingle();
      sessao = data as SessaoWa | null;
    }
    if (!sessao) {
      const { data } = await admin.from("wa_sessions").select(COLUNAS_SESSAO).eq("project_id", grupo.project_id).limit(1).maybeSingle();
      sessao = data as SessaoWa | null;
    }
    if (!sessao) return await falhar("Projeto sem sessão do OpenWA.");
    if (!sessao.openwa_session_id) return await falhar("Sessão sem o id da sessão no OpenWA (Administração › WhatsApp OpenWA).");
    const cred = credencialDaSessao(cfg, sessao);
    if (!cred.url || !cred.apiKey) return await falhar("OpenWA sem endereço ou API key configurados.");

    const texto = msg.body?.trim() ? await comAutor(admin, msg.body.trim(), msg.author_user_id) : null;
    let r: RespostaOpenwa<RespostaEnvio>;
    if (msg.media_path) {
      let midia: MidiaEnvio;
      try {
        midia = await prepararMidia(admin, msg.media_path);
      } catch (e) {
        return await falhar(e instanceof Error ? e.message : String(e));
      }
      r = await enviarMidia(cred.url, cred.apiKey, sessao.openwa_session_id, grupo.wa_group_id, midia, texto, msg.quoted_wa_message_id);
    } else if (texto) {
      r = await enviarTexto(cred.url, cred.apiKey, sessao.openwa_session_id, grupo.wa_group_id, texto, msg.quoted_wa_message_id);
    } else {
      return await falhar("Mensagem vazia.");
    }

    if (!r.ok) return await falhar(r.erro);
    const waMessageId = r.dados?.messageId ?? r.dados?.id ?? null;
    await liberar({ status: "enviada", wa_message_id: waMessageId, tentativas: msg.tentativas + 1, erro: null });
    await admin
      .from("wa_sessions")
      .update({ status: "conectado", last_heartbeat: new Date().toISOString() })
      .eq("id", sessao.id);
    return { estado: "enviada", waMessageId };
  } catch (e) {
    return await falhar(e instanceof Error ? e.message : String(e));
  }
}

export { TIMEOUT_ENVIO_MS };
