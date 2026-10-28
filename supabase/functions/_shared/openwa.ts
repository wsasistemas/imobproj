// Cliente HTTP do OpenWA (gateway do WhatsApp; código em C:\Projetos VSCODE\Outros\OpenWA, docs/06-api-specification.md).
//
// Contratos usados (todas as rotas sob {url}/api, autenticação pelo header X-API-Key):
//   GET    /sessions                                         lista as sessões [{id, name, status, phone, ...}]
//   GET    /sessions/:sid                                    uma sessão
//   POST   /sessions/:sid/messages/send-text                 {chatId, text, quotedMessageId?} → 201 {messageId, timestamp}
//   POST   /sessions/:sid/messages/send-image|video|audio|document
//                                                            {chatId, url | base64+mimetype, filename?, caption?, quotedMessageId?}
//   GET    /sessions/:sid/messages/:chatId/:messageId/media  bytes da mídia recebida
//   POST   /sessions/:sid/groups                             {name, participants: ["<tel>@c.us"]} → {id: "...@g.us", name}
//   GET    /sessions/:sid/groups/:gid                        {id, name, participants: [{id, number, isAdmin, isSuperAdmin}]}
//   POST   /sessions/:sid/groups/:gid/participants           {participants} (adicionar)
//   DELETE /sessions/:sid/groups/:gid/participants           {participants} (remover)
//   POST   /sessions/:sid/groups/:gid/participants/promote   {participants}
// Webhook: {event, timestamp, sessionId, idempotencyKey, deliveryId, data}; com "secret" cadastrado, o OpenWA assina o
// corpo bruto em X-OpenWA-Signature: sha256=<hex>; os "headers" cadastrados (ex.: x-openwa-secret) vão em toda entrega.

import { iguaisTempoConstante } from "./supabase.ts";

export const TIMEOUT_ENVIO_MS = 15_000;

export type RespostaOpenwa<T> =
  | { ok: true; status: number; dados: T; latenciaMs: number }
  | { ok: false; status: number; erro: string; latenciaMs: number };

const base = (url: string) => url.trim().replace(/\/+$/, "");

/** Chamada genérica com timeout (AbortController). Nunca lança: devolve ok/erro. */
export async function chamarOpenwa<T>(
  url: string,
  apiKey: string,
  metodo: "GET" | "POST" | "PUT" | "DELETE",
  caminho: string,
  corpo?: unknown,
  timeoutMs = TIMEOUT_ENVIO_MS,
): Promise<RespostaOpenwa<T>> {
  const inicio = performance.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let r: Response;
  try {
    r = await fetch(`${base(url)}/api${caminho}`, {
      method: metodo,
      headers: {
        "X-API-Key": apiKey,
        Accept: "application/json",
        // Túnel do VS Code (devtunnels.ms): pula a página de aviso. Fora dele é ignorado.
        "X-Tunnel-Skip-AntiPhishing-Page": "true",
        ...(corpo === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: ctrl.signal,
    });
  } catch (e) {
    const latenciaMs = Math.round(performance.now() - inicio);
    const abortou = e instanceof DOMException && e.name === "AbortError";
    return {
      ok: false,
      status: 0,
      latenciaMs,
      erro: abortou
        ? `Timeout de ${Math.round(timeoutMs / 1000)} s ao chamar o OpenWA`
        : `OpenWA sem resposta: ${e instanceof Error ? e.message : String(e)}`,
    };
  } finally {
    clearTimeout(timer);
  }
  const texto = await r.text();
  const latenciaMs = Math.round(performance.now() - inicio);
  let json: unknown = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    json = null;
  }
  if (!r.ok) {
    const msg = (json as { message?: string | string[] } | null)?.message ?? texto.slice(0, 300);
    return { ok: false, status: r.status, latenciaMs, erro: `OpenWA ${r.status}: ${Array.isArray(msg) ? msg.join("; ") : msg}` };
  }
  return { ok: true, status: r.status, latenciaMs, dados: json as T };
}

// ---------------------------------------------------------------- envio

export type RespostaEnvio = { messageId?: string; id?: string; timestamp?: number };

export function enviarTexto(url: string, apiKey: string, sessao: string, chatId: string, texto: string, citar?: string | null) {
  return chamarOpenwa<RespostaEnvio>(url, apiKey, "POST", `/sessions/${encodeURIComponent(sessao)}/messages/send-text`, {
    chatId,
    text: texto.slice(0, 4096),
    ...(citar ? { quotedMessageId: citar } : {}),
  });
}

export type MidiaEnvio =
  | { tipo: "base64"; base64: string; mimetype: string; filename: string }
  | { tipo: "url"; url: string; mimetype: string; filename: string };

export function rotaDaMidia(mime: string): "send-image" | "send-video" | "send-audio" | "send-document" {
  if (/^image\/(jpeg|png|webp|gif)$/i.test(mime)) return "send-image";
  if (/^video\//i.test(mime)) return "send-video";
  if (/^audio\//i.test(mime)) return "send-audio";
  return "send-document";
}

export function enviarMidia(
  url: string,
  apiKey: string,
  sessao: string,
  chatId: string,
  midia: MidiaEnvio,
  legenda?: string | null,
  citar?: string | null,
) {
  const rota = rotaDaMidia(midia.mimetype);
  return chamarOpenwa<RespostaEnvio>(url, apiKey, "POST", `/sessions/${encodeURIComponent(sessao)}/messages/${rota}`, {
    chatId,
    ...(midia.tipo === "base64" ? { base64: midia.base64, mimetype: midia.mimetype } : { url: midia.url, mimetype: midia.mimetype }),
    filename: midia.filename.slice(0, 255),
    ...(legenda && rota !== "send-audio" ? { caption: legenda.slice(0, 1024) } : {}),
    ...(citar ? { quotedMessageId: citar } : {}),
  });
}

/** Bytes de uma mídia recebida que não veio inline no webhook. */
export async function baixarMidia(
  url: string,
  apiKey: string,
  sessao: string,
  chatId: string,
  mensagemId: string,
  limiteBytes: number,
): Promise<{ bytes: Uint8Array; mime: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const r = await fetch(
      `${base(url)}/api/sessions/${encodeURIComponent(sessao)}/messages/${encodeURIComponent(chatId)}/${encodeURIComponent(mensagemId)}/media`,
      { headers: { "X-API-Key": apiKey, "X-Tunnel-Skip-AntiPhishing-Page": "true" }, signal: ctrl.signal },
    );
    if (!r.ok) throw new Error(`OpenWA ${r.status} ao baixar a mídia`);
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (bytes.byteLength > limiteBytes) throw new Error(`mídia maior que ${Math.round(limiteBytes / 1_048_576)} MB`);
    return { bytes, mime: r.headers.get("content-type")?.split(";")[0]?.trim() || "application/octet-stream" };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------- sessões e grupos

export type SessaoOpenwa = { id: string; name?: string; status?: string; phone?: string | null; pushName?: string | null };
export type ParticipanteOpenwa = { id: string; number?: string; isAdmin?: boolean; isSuperAdmin?: boolean };
export type GrupoOpenwa = { id: string; name?: string; participants?: ParticipanteOpenwa[] };
export type ResultadoParticipantes = { success?: boolean; message?: string; results?: unknown };

export const listarSessoes = (url: string, apiKey: string, timeoutMs = 10_000) =>
  chamarOpenwa<SessaoOpenwa[]>(url, apiKey, "GET", "/sessions", undefined, timeoutMs);

export const criarGrupo = (url: string, apiKey: string, sessao: string, nome: string, participantes: string[]) =>
  chamarOpenwa<GrupoOpenwa>(url, apiKey, "POST", `/sessions/${encodeURIComponent(sessao)}/groups`, {
    name: nome.slice(0, 100),
    participants: participantes,
  }, 30_000);

export const lerGrupo = (url: string, apiKey: string, sessao: string, grupo: string) =>
  chamarOpenwa<GrupoOpenwa>(url, apiKey, "GET", `/sessions/${encodeURIComponent(sessao)}/groups/${encodeURIComponent(grupo)}`, undefined, 20_000);

export const adicionarParticipantes = (url: string, apiKey: string, sessao: string, grupo: string, participantes: string[]) =>
  chamarOpenwa<ResultadoParticipantes>(url, apiKey, "POST", `/sessions/${encodeURIComponent(sessao)}/groups/${encodeURIComponent(grupo)}/participants`, { participants: participantes }, 30_000);

export const removerParticipantes = (url: string, apiKey: string, sessao: string, grupo: string, participantes: string[]) =>
  chamarOpenwa<ResultadoParticipantes>(url, apiKey, "DELETE", `/sessions/${encodeURIComponent(sessao)}/groups/${encodeURIComponent(grupo)}/participants`, { participants: participantes }, 30_000);

export const promoverParticipantes = (url: string, apiKey: string, sessao: string, grupo: string, participantes: string[]) =>
  chamarOpenwa<ResultadoParticipantes>(url, apiKey, "POST", `/sessions/${encodeURIComponent(sessao)}/groups/${encodeURIComponent(grupo)}/participants/promote`, { participants: participantes }, 30_000);

// ---------------------------------------------------------------- telefones

export const soDigitos = (s: string | null | undefined) => String(s ?? "").replace(/\D/g, "");

/** "5511900000003" → "5511900000003@c.us". */
export const jidDoTelefone = (tel: string) => `${soDigitos(tel)}@c.us`;

/** Telefone (só dígitos) de um JID "55…@c.us" / "@s.whatsapp.net"; "@lid" usa o senderPhone resolvido. */
export function telefoneDoJid(jid: string | null | undefined, senderPhone?: string | null): string | null {
  const j = String(jid ?? "");
  if (j.endsWith("@lid") || !j) {
    const d = soDigitos(senderPhone);
    return d.length >= 10 ? d : null;
  }
  if (!/@(c\.us|s\.whatsapp\.net)$/.test(j)) return null;
  const d = soDigitos(j.split("@")[0].split(":")[0]);
  return d.length >= 10 ? d : null;
}

/**
 * Variantes de um telefone brasileiro com e sem o nono dígito (o WhatsApp ainda devolve números antigos
 * sem o 9: 55 11 9xxxx-xxxx ↔ 55 11 xxxx-xxxx).
 */
export function variantesTelefone(tel: string): string[] {
  const d = soDigitos(tel);
  const v = new Set<string>([d]);
  if (d.startsWith("55") && d.length === 13 && d[4] === "9") v.add(d.slice(0, 4) + d.slice(5));
  if (d.startsWith("55") && d.length === 12) v.add(d.slice(0, 4) + "9" + d.slice(4));
  return [...v];
}

export const mesmoTelefone = (a: string, b: string) => {
  const vb = variantesTelefone(b);
  return variantesTelefone(a).some((x) => vb.includes(x));
};

// ---------------------------------------------------------------- webhook

/** Confere o segredo: header x-openwa-secret (custom header do webhook) OU assinatura HMAC X-OpenWA-Signature. */
export async function webhookAutentico(segredo: string, corpoBruto: string, headers: Headers): Promise<boolean> {
  if (!segredo) return false;
  const direto = headers.get("x-openwa-secret");
  if (direto && iguaisTempoConstante(direto.trim(), segredo)) return true;
  const assinatura = headers.get("x-openwa-signature");
  if (!assinatura) return false;
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(corpoBruto)));
  const esperado = Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
  return iguaisTempoConstante(assinatura.trim().toLowerCase().replace(/^sha256=/, ""), esperado);
}

export type EnvelopeOpenwa = {
  event: string;
  timestamp?: string;
  sessionId?: string;
  idempotencyKey?: string;
  deliveryId?: string;
  data?: Record<string, unknown>;
};

export type MidiaRecebida = { mimetype: string; filename: string | null; data: string | null; omitted: boolean };

export type MensagemGrupo = {
  waMessageId: string;
  chatId: string;
  autorTelefone: string | null;
  texto: string;
  tipo: string;
  timestamp: Date;
  citadoId: string | null;
  midia: MidiaRecebida | null;
};

const TIPOS_MIDIA = new Set(["image", "sticker", "audio", "voice", "ptt", "video", "document"]);

/** Mensagem recebida em grupo (message.received com isGroup) ou null se for outra coisa. */
export function lerMensagemDeGrupo(env: EnvelopeOpenwa): MensagemGrupo | null {
  if (env.event !== "message.received") return null;
  const d = env.data ?? {};
  if (d.fromMe === true) return null;
  const chatId = String(d.chatId ?? d.from ?? "");
  const ehGrupo = d.isGroup === true || d.kind === "group" || chatId.endsWith("@g.us");
  if (!ehGrupo || !chatId.endsWith("@g.us")) return null;
  const waMessageId = String(d.id ?? "");
  if (!waMessageId) return null;
  const tipo = String(d.type ?? "text");
  const m = d.media as { mimetype?: string; filename?: string; data?: string; omitted?: boolean } | undefined;
  const midia: MidiaRecebida | null =
    TIPOS_MIDIA.has(tipo) || m
      ? {
          mimetype: m?.mimetype ?? "application/octet-stream",
          filename: m?.filename ?? null,
          data: m?.data && !m.omitted ? m.data : null,
          omitted: m?.omitted === true || !m?.data,
        }
      : null;
  const ts = typeof d.timestamp === "number" ? new Date(d.timestamp * 1000) : new Date();
  const q = d.quotedMessage as { id?: string } | undefined;
  return {
    waMessageId,
    chatId,
    autorTelefone: telefoneDoJid(d.author as string | undefined, d.senderPhone as string | undefined),
    texto: String(d.body ?? d.caption ?? "").trim(),
    tipo,
    timestamp: Number.isNaN(ts.getTime()) ? new Date() : ts,
    citadoId: q?.id ? String(q.id) : null,
    midia,
  };
}

/** Status da sessão a partir dos eventos session.*; null quando o evento não diz nada sobre o status. */
export function statusDaSessao(env: EnvelopeOpenwa): "conectado" | "desconectado" | "erro" | null {
  const d = env.data ?? {};
  if (env.event === "session.authenticated") return "conectado";
  if (env.event === "session.disconnected") return "desconectado";
  if (env.event === "session.status") {
    const s = String(d.status ?? "");
    if (s === "ready") return "conectado";
    if (s === "failed" || s === "action_required") return "erro";
    if (s) return "desconectado";
  }
  return null;
}

/** Base64 (com ou sem prefixo data:) → bytes. */
export function bytesDeBase64(b64: string): Uint8Array {
  const bin = atob(b64.replace(/^data:[^,]*,/, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function base64DeBytes(bytes: Uint8Array): string {
  let bin = "";
  const passo = 0x8000;
  for (let i = 0; i < bytes.length; i += passo) bin += String.fromCharCode(...bytes.subarray(i, i + passo));
  return btoa(bin);
}

const EXTENSOES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "video/mp4": "mp4",
  "text/plain": "txt",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

const MIMES: Record<string, string> = Object.fromEntries(Object.entries(EXTENSOES).map(([m, e]) => [e, m]));
MIMES.jpeg = "image/jpeg";

export const extensaoDoMime = (mime: string) => EXTENSOES[mime.split(";")[0].trim().toLowerCase()] ?? "bin";
export const mimeDaExtensao = (nome: string) => MIMES[(nome.split(".").pop() ?? "").toLowerCase()] ?? "application/octet-stream";

/** Nome seguro para o Storage a partir do id da mensagem do WhatsApp. */
export const nomeSeguro = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "_").slice(-80);
