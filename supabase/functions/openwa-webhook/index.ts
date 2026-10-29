// Edge Function openwa-webhook — recebe os eventos do OpenWA (verify_jwt = false no config.toml).
//
// Autenticação: segredo do webhook (Vault: openwa_webhook_secret) no header x-openwa-secret (custom header
// cadastrado no webhook do OpenWA) OU assinatura HMAC X-OpenWA-Signature (campo "secret" do webhook).
// Comparação em tempo constante. Sem segredo válido → 401.
//
// Responde 200 assim que valida o segredo; o processamento segue em segundo plano (EdgeRuntime.waitUntil):
//   * qualquer evento da sessão → wa_sessions.last_heartbeat = agora; status pelos eventos session.*;
//   * conversa sem setor → fila do setor dono do número (imobproj.fn_rotear_conversa; número sem setor: nada muda);
//   * message.received em grupo cadastrado (wa_groups.wa_group_id) → wa_messages (direction 'in',
//     idempotente por wa_message_id: on conflict do nothing); autor pelo telefone (wa_group_members → profiles);
//   * mídia → bucket "whatsapp" (<project>/<group>/<AAAA-MM>/<id>.<ext>), media_path = "whatsapp/<caminho>";
//     se o texto/legenda cita uma OS aberta do projeto (#231 ou "OS 231") e o grupo tem auto_evidencia →
//     cópia no bucket "evidencias" (<project>/<os>/whatsapp-<id>.<ext>) + os_evidences (origem whatsapp);
//   * group.join/leave/update → mensagem de sistema (direction 'in' sem author_phone/author_user_id);
//   * texto começando com "#OS" e grupo com auto_os → service_orders em rascunho (origem whatsapp,
//     título = resto da linha) + resposta no grupo citando a mensagem ("OS 238 registrada…").
// Com o OpenWA desligado na administração, só o heartbeat é gravado.

import { json, preflight } from "../_shared/cors.ts";
import { enviarMensagem } from "../_shared/envio.ts";
import {
  baixarMidia,
  bytesDeBase64,
  extensaoDoMime,
  lerMensagemDeGrupo,
  mesmoTelefone,
  nomeSeguro,
  statusDaSessao,
  telefoneDoJid,
  variantesTelefone,
  webhookAutentico,
  type EnvelopeOpenwa,
  type MensagemGrupo,
} from "../_shared/openwa.ts";
import { clienteServico, mensagemDe, type Cliente } from "../_shared/supabase.ts";
import { COLUNAS_SESSAO, credencialDaSessao, lerConfigOpenwa, lerSegredo, type ConfigOpenwa, type SessaoWa } from "../_shared/vault.ts";

const BUCKET_WHATSAPP = "imobproj-whatsapp";
const BUCKET_EVIDENCIAS = "imobproj-evidencias";
const MIDIA_MAX = 50 * 1_048_576;

type Grupo = {
  id: string;
  project_id: string;
  session_id: string | null;
  nome: string;
  auto_evidencia: boolean;
  auto_os: boolean;
};

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

function emSegundoPlano(p: Promise<unknown>): Promise<unknown> | null {
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
    EdgeRuntime.waitUntil(p);
    return null;
  }
  return p; // fora do Edge Runtime (testes): espera terminar
}

const log = (evento: string, dados: Record<string, unknown>) => console.log(JSON.stringify({ evento, ...dados }));
const logErro = (evento: string, dados: Record<string, unknown>) => console.error(JSON.stringify({ evento, ...dados }));

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== "POST") return json(405, { erro: "Use POST." });

  // Corpo bruto ANTES do JSON.parse: a assinatura HMAC é sobre os bytes recebidos.
  const bruto = await req.text();
  let admin: Cliente;
  let segredo: string | null;
  try {
    admin = clienteServico();
    segredo = await lerSegredo(admin, "imobproj_openwa_webhook_secret");
  } catch (e) {
    logErro("openwa.webhook_config", { erro: mensagemDe(e) });
    return json(500, { erro: "Webhook sem configuração." });
  }
  if (!segredo) return json(503, { erro: "Segredo do webhook não configurado (Administração › WhatsApp OpenWA)." });
  if (!(await webhookAutentico(segredo, bruto, req.headers))) return json(401, { erro: "Segredo inválido." });

  let envelope: EnvelopeOpenwa;
  try {
    envelope = JSON.parse(bruto) as EnvelopeOpenwa;
    if (!envelope || typeof envelope.event !== "string") throw new Error("sem event");
  } catch {
    return json(400, { erro: "Corpo inválido." });
  }

  const tarefa = processar(admin, envelope).catch((e) =>
    logErro("openwa.webhook_falhou", { event: envelope.event, chave: envelope.idempotencyKey ?? null, erro: mensagemDe(e) }),
  );
  const aguardar = emSegundoPlano(tarefa);
  if (aguardar) await aguardar;
  return json(200, { ok: true });
});

// ---------------------------------------------------------------- processamento

async function processar(admin: Cliente, env: EnvelopeOpenwa): Promise<void> {
  const cfg = await lerConfigOpenwa(admin);
  let sessao: SessaoWa | null = null;
  if (env.sessionId) {
    const { data } = await admin.from("wa_sessions").select(COLUNAS_SESSAO).eq("openwa_session_id", env.sessionId).maybeSingle();
    sessao = data as SessaoWa | null;
  }
  const status = statusDaSessao(env);
  if (sessao) await heartbeat(admin, sessao.id, status);

  if (!cfg.ativo) return log("openwa.webhook_ignorado", { motivo: "OpenWA desligado", event: env.event });

  if (env.event === "group.join" || env.event === "group.leave" || env.event === "group.update") {
    return await registrarEventoDeGrupo(admin, env);
  }

  const msg = lerMensagemDeGrupo(env);
  if (!msg) return;

  const { data: g } = await admin
    .from("wa_groups")
    .select("id, project_id, session_id, nome, auto_evidencia, auto_os")
    .eq("wa_group_id", msg.chatId)
    .eq("ativo", true)
    .maybeSingle();
  const grupo = g as Grupo | null;
  if (!grupo) return log("openwa.webhook_ignorado", { motivo: "grupo não cadastrado", chatId: msg.chatId });

  // Sessão desconhecida pelo sessionId (ex.: id ainda não preenchido): usa a do grupo para o heartbeat.
  if (!sessao && grupo.session_id) {
    const { data } = await admin.from("wa_sessions").select(COLUNAS_SESSAO).eq("id", grupo.session_id).maybeSingle();
    sessao = data as SessaoWa | null;
    if (sessao) await heartbeat(admin, sessao.id, status);
  }

  await rotearConversa(admin, grupo.id, sessao?.id ?? null);

  const autorId = msg.autorTelefone ? await resolverAutor(admin, grupo.id, msg.autorTelefone) : null;

  // Idempotência: a mesma mensagem (retry do OpenWA) não entra duas vezes nem repete evidência/OS.
  const { data: inseridas, error } = await admin
    .from("wa_messages")
    .upsert(
      {
        group_id: grupo.id,
        wa_message_id: msg.waMessageId,
        direction: "in",
        author_phone: msg.autorTelefone,
        author_user_id: autorId,
        body: msg.texto || null,
        quoted_wa_message_id: msg.citadoId,
        status: "recebida",
        tentativas: 0,
        created_at: msg.timestamp.toISOString(),
      },
      { onConflict: "wa_message_id", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw new Error(`wa_messages: ${error.message}`);
  const linha = (inseridas as { id: string }[] | null)?.[0];
  if (!linha) return log("openwa.webhook_duplicado", { wa_message_id: msg.waMessageId });

  // Mídia
  let arquivo: { bytes: Uint8Array; mime: string; ext: string } | null = null;
  if (msg.midia) {
    try {
      arquivo = await guardarMidia(admin, cfg, sessao, env, grupo, msg, linha.id);
    } catch (e) {
      logErro("openwa.midia_falhou", { wa_message_id: msg.waMessageId, erro: mensagemDe(e) });
    }
  }

  // Evidência automática: mídia que cita uma OS aberta do projeto
  if (arquivo && grupo.auto_evidencia) {
    const numero = numeroOsCitada(msg.texto);
    if (numero !== null) {
      try {
        await criarEvidencia(admin, grupo, msg, numero, arquivo);
      } catch (e) {
        logErro("openwa.evidencia_falhou", { wa_message_id: msg.waMessageId, numero, erro: mensagemDe(e) });
      }
    }
  }

  // #OS → OS em rascunho
  if (grupo.auto_os && /^#OS\b/i.test(msg.texto)) {
    try {
      await criarOsRascunho(admin, grupo, msg, autorId);
    } catch (e) {
      logErro("openwa.os_falhou", { wa_message_id: msg.waMessageId, erro: mensagemDe(e) });
    }
  }
}

/**
 * Mensagem de sistema (entrou/saiu/mudou nome ou descrição): direction 'in' SEM author_phone e SEM author_user_id —
 * é assim que a tela de Conversas reconhece. Idempotente por wa_message_id = "evt:<idempotencyKey>".
 */
async function registrarEventoDeGrupo(admin: Cliente, env: EnvelopeOpenwa): Promise<void> {
  const d = env.data ?? {};
  const groupId = String(d.groupId ?? "");
  if (!groupId.endsWith("@g.us")) return;
  const { data: g } = await admin.from("wa_groups").select("id").eq("wa_group_id", groupId).eq("ativo", true).maybeSingle();
  const grupo = g as { id: string } | null;
  if (!grupo) return log("openwa.webhook_ignorado", { motivo: "grupo não cadastrado", chatId: groupId });

  const ids = Array.isArray(d.participantIds) ? (d.participantIds as unknown[]).map(String) : [];
  const nomes: string[] = [];
  for (const jid of ids) {
    const tel = telefoneDoJid(jid);
    if (!tel) continue;
    const uid = await resolverAutor(admin, grupo.id, tel);
    let nome: string | null = null;
    if (uid) {
      const { data } = await admin.from("profiles").select("nome").eq("id", uid).maybeSingle();
      nome = (data as { nome: string } | null)?.nome?.trim() || null;
    }
    nomes.push(nome ?? `+${tel}`);
  }
  const quem = nomes.length ? nomes.join(", ") : "Um participante";
  let texto: string;
  if (env.event === "group.join") texto = `${quem} ${nomes.length > 1 ? "entraram" : "entrou"} no grupo`;
  else if (env.event === "group.leave") texto = `${quem} ${nomes.length > 1 ? "saíram" : "saiu"} do grupo`;
  else {
    const c = (d.changes ?? {}) as { subject?: string; description?: string; announce?: boolean; locked?: boolean };
    if (c.subject) texto = `O nome do grupo mudou para "${c.subject}"`;
    else if (c.description !== undefined) texto = "A descrição do grupo foi alterada";
    else if (c.announce !== undefined) texto = c.announce ? "Só administradores podem enviar mensagens" : "Todos podem enviar mensagens";
    else if (c.locked !== undefined) texto = c.locked ? "Só administradores podem editar os dados do grupo" : "Todos podem editar os dados do grupo";
    else texto = "Os dados do grupo foram alterados";
  }
  const chave = env.idempotencyKey ?? env.deliveryId ?? `${env.event}:${groupId}:${String(d.timestamp ?? env.timestamp ?? "")}`;
  const ts = typeof d.timestamp === "number" ? new Date(d.timestamp * (d.timestamp < 1e12 ? 1000 : 1)) : new Date();
  const { error } = await admin.from("wa_messages").upsert(
    {
      group_id: grupo.id,
      wa_message_id: `evt:${chave}`.slice(0, 250),
      direction: "in",
      author_phone: null,
      author_user_id: null,
      body: texto,
      status: "recebida",
      tentativas: 0,
      created_at: (Number.isNaN(ts.getTime()) ? new Date() : ts).toISOString(),
    },
    { onConflict: "wa_message_id", ignoreDuplicates: true },
  );
  if (error) throw new Error(`wa_messages (sistema): ${error.message}`);
}

/**
 * Fila por setor (Fase 3): conversa sem setor entra na fila do setor dono do número que recebeu a mensagem.
 * Número sem setor, ou banco ainda sem a migration de setores: segue como antes (só registra no log).
 */
async function rotearConversa(admin: Cliente, grupoId: string, sessaoId: string | null): Promise<void> {
  const { error } = await admin.rpc("fn_rotear_conversa", { p_group_id: grupoId, p_session_id: sessaoId });
  if (error) log("openwa.roteamento_ignorado", { grupo: grupoId, erro: error.message });
}

async function heartbeat(admin: Cliente, sessaoId: string, status: SessaoWa["status"] | null): Promise<void> {
  const { error } = await admin
    .from("wa_sessions")
    .update({ last_heartbeat: new Date().toISOString(), status: status ?? "conectado" })
    .eq("id", sessaoId);
  if (error) logErro("openwa.heartbeat_falhou", { sessao: sessaoId, erro: error.message });
}

/** Autor pelo telefone: membro do grupo (wa_group_members) e, se não houver, profiles.telefone_whatsapp. */
async function resolverAutor(admin: Cliente, grupoId: string, telefone: string): Promise<string | null> {
  const { data: membros } = await admin.from("wa_group_members").select("user_id, telefone").eq("group_id", grupoId);
  const membro = ((membros as { user_id: string | null; telefone: string }[] | null) ?? []).find(
    (m) => m.user_id && mesmoTelefone(m.telefone, telefone),
  );
  if (membro?.user_id) return membro.user_id;
  const { data: perfis } = await admin
    .from("profiles")
    .select("id")
    .in("telefone_whatsapp", variantesTelefone(telefone))
    .limit(1);
  return (perfis as { id: string }[] | null)?.[0]?.id ?? null;
}

async function guardarMidia(
  admin: Cliente,
  cfg: ConfigOpenwa,
  sessao: SessaoWa | null,
  env: EnvelopeOpenwa,
  grupo: Grupo,
  msg: MensagemGrupo,
  linhaId: string,
): Promise<{ bytes: Uint8Array; mime: string; ext: string }> {
  const midia = msg.midia!;
  let bytes: Uint8Array;
  let mime = midia.mimetype;
  if (midia.data) {
    bytes = bytesDeBase64(midia.data);
  } else {
    const cred = sessao ? credencialDaSessao(cfg, sessao) : { url: cfg.url, apiKey: cfg.apiKey };
    const idSessao = sessao?.openwa_session_id ?? env.sessionId;
    if (!cred.url || !cred.apiKey || !idSessao) throw new Error("sem URL/API key/sessão para baixar a mídia");
    const baixada = await baixarMidia(cred.url, cred.apiKey, idSessao, msg.chatId, msg.waMessageId, MIDIA_MAX);
    bytes = baixada.bytes;
    if (mime === "application/octet-stream") mime = baixada.mime;
  }
  if (bytes.byteLength > MIDIA_MAX) throw new Error("mídia maior que 50 MB");
  mime = mime.split(";")[0].trim();
  const ext = midia.filename?.includes(".") ? midia.filename.split(".").pop()!.toLowerCase().slice(0, 8) : extensaoDoMime(mime);
  const caminho = `${grupo.project_id}/${grupo.id}/${msg.timestamp.toISOString().slice(0, 7)}/${nomeSeguro(msg.waMessageId)}.${ext}`;
  const up = await admin.storage.from(BUCKET_WHATSAPP).upload(caminho, bytes, { contentType: mime, upsert: true });
  if (up.error) throw new Error(`Storage: ${up.error.message}`);
  const { error } = await admin.from("wa_messages").update({ media_path: `${BUCKET_WHATSAPP}/${caminho}` }).eq("id", linhaId);
  if (error) throw new Error(`wa_messages.media_path: ${error.message}`);
  return { bytes, mime, ext };
}

/** "#231", "OS 231", "OS #231", "OS nº 231" → 231. Ignora "#OS". */
export function numeroOsCitada(texto: string): number | null {
  const m = /(?:^|[^\w#])#(\d{1,6})\b|\bOS\s*(?:n[º°o.]?\s*)?#?\s*(\d{1,6})\b/i.exec(texto);
  const n = m ? Number(m[1] ?? m[2]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function criarEvidencia(
  admin: Cliente,
  grupo: Grupo,
  msg: MensagemGrupo,
  numero: number,
  arquivo: { bytes: Uint8Array; mime: string; ext: string },
): Promise<void> {
  const { data } = await admin
    .from("service_orders")
    .select("id, status")
    .eq("project_id", grupo.project_id)
    .eq("numero", numero)
    .not("status", "in", "(aprovada,recusada)")
    .maybeSingle();
  const os = data as { id: string; status: string } | null;
  if (!os) return log("openwa.evidencia_ignorada", { motivo: "OS inexistente ou encerrada", numero });

  const caminho = `${grupo.project_id}/${os.id}/whatsapp-${nomeSeguro(msg.waMessageId)}.${arquivo.ext}`;
  const up = await admin.storage.from(BUCKET_EVIDENCIAS).upload(caminho, arquivo.bytes, { contentType: arquivo.mime, upsert: true });
  if (up.error) throw new Error(`Storage evidencias: ${up.error.message}`);
  const { error } = await admin.from("os_evidences").insert({
    os_id: os.id,
    tipo: arquivo.mime.startsWith("image/") ? "foto" : "arquivo",
    storage_path: caminho,
    captured_at: msg.timestamp.toISOString(),
    origem: "whatsapp",
  });
  if (error) throw new Error(`os_evidences: ${error.message}`);
  log("openwa.evidencia_criada", { os_id: os.id, numero });
}

async function criarOsRascunho(admin: Cliente, grupo: Grupo, msg: MensagemGrupo, autorId: string | null): Promise<void> {
  const [primeira, ...resto] = msg.texto.split(/\r?\n/);
  const titulo = primeira.replace(/^#OS\b[\s:.\-–—]*/i, "").trim().slice(0, 200) || "OS aberta pelo WhatsApp";
  let quem = msg.autorTelefone ?? "telefone desconhecido";
  if (autorId) {
    const { data } = await admin.from("profiles").select("nome").eq("id", autorId).maybeSingle();
    const nome = (data as { nome: string } | null)?.nome;
    if (nome) quem = `${nome} (${quem})`;
  }
  const descricao = [resto.join("\n").trim(), `Aberta pelo WhatsApp no grupo "${grupo.nome}" por ${quem}.`]
    .filter(Boolean)
    .join("\n\n");

  const { data, error } = await admin
    .from("service_orders")
    .insert({ project_id: grupo.project_id, titulo, descricao, status: "rascunho", origem: "whatsapp" })
    .select("id, numero")
    .single();
  if (error || !data) throw new Error(`service_orders: ${error?.message ?? "sem retorno"}`);
  const os = data as { id: string; numero: number };
  log("openwa.os_criada", { os_id: os.id, numero: os.numero });

  // Confirmação no grupo, citando a mensagem (vai pela fila; se falhar, o cron reenvia).
  const { data: resposta, error: erroResp } = await admin
    .from("wa_messages")
    .insert({
      group_id: grupo.id,
      direction: "out",
      status: "pendente",
      tentativas: 0,
      body: `OS ${os.numero} registrada como rascunho: ${titulo}`,
      quoted_wa_message_id: msg.waMessageId,
    })
    .select("id")
    .single();
  if (erroResp || !resposta) return logErro("openwa.os_resposta_falhou", { erro: erroResp?.message ?? "sem retorno" });
  await enviarMensagem(admin, (resposta as { id: string }).id);
}
