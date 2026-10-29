"use server";

import { z } from "zod";
import type { ResultadoGrupo, ResultadoTeste, SessaoOpenwaTeste } from "@/components/whatsapp-admin/tipos";
import { falha, mensagemErroBanco, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { exigirSuperAdmin } from "@/lib/projeto/servidor";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Administração › WhatsApp OpenWA. Só o super admin altera (exigirSuperAdmin + RLS de openwa_config/wa_sessions +
// funções SECURITY DEFINER do Vault). A API key e os segredos NUNCA voltam ao navegador — exceto o segredo do
// webhook no momento em que é gerado (para colar no OpenWA), uma única vez.
//
// criarGrupoWhatsApp / sincronizarGrupoWhatsApp: chamam a Edge Function openwa-groups com o JWT do usuário; a função
// confere super_admin ou gerente do projeto (fn_has_role). Podem ser importadas pela tela de Conversas.

const TIMEOUT_TESTE_MS = 10_000;

async function garantirSuperAdmin(): Promise<ResultadoAcao<never> | null> {
  try {
    await exigirSuperAdmin();
    return null;
  } catch (e) {
    return falha(e instanceof Error ? e.message : "Sem permissão.");
  }
}

const primeiroErro = (e: z.ZodError) => e.issues[0]?.message ?? "Dados inválidos.";

const esquemaUrl = z
  .string()
  .trim()
  .url("Informe uma URL válida (http:// ou https://).")
  .refine((u) => /^https?:\/\//i.test(u), "A URL deve começar com http:// ou https://.")
  .transform((u) => u.replace(/\/+$/, ""));

// ---------------------------------------------------------------- conexão

const esquemaConexao = z.object({
  url: esquemaUrl,
  apiKey: z.string().trim().max(500, "API key longa demais.").optional(),
});

/** Salva a URL (openwa_config) e, se informada, substitui a API key no Vault. */
export async function salvarConexao(entrada: unknown): Promise<ResultadoAcao<{ apiKeyAtualizadaEm: string | null }>> {
  const v = esquemaConexao.safeParse(entrada);
  if (!v.success) return falha(primeiroErro(v.error));
  const negado = await garantirSuperAdmin();
  if (negado) return negado;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("openwa_config")
    .update({ url: v.data.url, updated_by: user?.id ?? null })
    .eq("id", true);
  if (error) return falha(mensagemErroBanco(error));

  let apiKeyAtualizadaEm: string | null = null;
  if (v.data.apiKey) {
    const { data, error: erroChave } = await supabase.rpc("fn_openwa_salvar_api_key", { p_chave: v.data.apiKey });
    if (erroChave) return falha(mensagemErroBanco(erroChave));
    apiKeyAtualizadaEm = (data as string | null) ?? null;
  }
  return sucesso({ apiKeyAtualizadaEm });
}

/** Liga/desliga o OpenWA. Desligado: o webhook só registra o heartbeat e nada é enviado (a fila espera). */
export async function ligarOpenwa(ativo: boolean): Promise<ResultadoAcao<{ ativo: boolean }>> {
  if (typeof ativo !== "boolean") return falha("Valor inválido.");
  const negado = await garantirSuperAdmin();
  if (negado) return negado;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from("openwa_config").update({ ativo, updated_by: user?.id ?? null }).eq("id", true);
  if (error) return falha(mensagemErroBanco(error));
  return sucesso({ ativo });
}

type SessaoApi = { id?: unknown; name?: unknown; status?: unknown; phone?: unknown };

/** GET {url}/api/sessions com a API key do Vault (timeout de 10 s): valida endereço + chave e lista as sessões. */
export async function testarConexao(): Promise<ResultadoAcao<ResultadoTeste>> {
  const negado = await garantirSuperAdmin();
  if (negado) return negado;

  const supabase = await createClient();
  const { data: cfg, error } = await supabase.from("openwa_config").select("url").eq("id", true).maybeSingle();
  if (error) return falha(mensagemErroBanco(error));
  const url = (cfg as { url: string | null } | null)?.url;
  if (!url) return falha("Salve o endereço do OpenWA antes de testar.");

  const { data: chave, error: erroChave } = await createAdminClient().rpc("fn_openwa_segredo", { p_nome: "imobproj_openwa_api_key" });
  if (erroChave) return falha("Não foi possível ler a API key no Vault.");
  if (typeof chave !== "string" || !chave) return falha("Salve a API key antes de testar.");

  const inicio = Date.now();
  let resultado: ResultadoTeste;
  try {
    const r = await fetch(`${url}/api/sessions`, {
      headers: { "X-API-Key": chave, Accept: "application/json", "X-Tunnel-Skip-AntiPhishing-Page": "true" },
      signal: AbortSignal.timeout(TIMEOUT_TESTE_MS),
      cache: "no-store",
    });
    const latenciaMs = Date.now() - inicio;
    const texto = await r.text();
    let corpo: unknown = null;
    try {
      corpo = texto ? JSON.parse(texto) : null;
    } catch {
      corpo = null;
    }
    if (!r.ok) {
      const msg = (corpo as { message?: string | string[] } | null)?.message;
      const detalhe = Array.isArray(msg) ? msg.join("; ") : (msg ?? texto.slice(0, 200));
      resultado = {
        ok: false,
        latenciaMs,
        em: new Date().toISOString(),
        erro: r.status === 401 || r.status === 403 ? `API key recusada pelo OpenWA (${r.status}).` : `OpenWA respondeu ${r.status}: ${detalhe}`,
        sessoes: [],
      };
    } else {
      const lista = Array.isArray(corpo) ? (corpo as SessaoApi[]) : [];
      const sessoes: SessaoOpenwaTeste[] = lista.map((s) => ({
        id: String(s.id ?? ""),
        nome: typeof s.name === "string" ? s.name : null,
        status: typeof s.status === "string" ? s.status : null,
        telefone: typeof s.phone === "string" ? s.phone : null,
      }));
      resultado = { ok: true, latenciaMs, em: new Date().toISOString(), erro: null, sessoes };
    }
  } catch (e) {
    const latenciaMs = Date.now() - inicio;
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    resultado = {
      ok: false,
      latenciaMs,
      em: new Date().toISOString(),
      erro: timeout
        ? `Sem resposta em ${TIMEOUT_TESTE_MS / 1000} s.`
        : `Não foi possível conectar: ${e instanceof Error ? e.message : String(e)}`,
      sessoes: [],
    };
  }

  const { error: erroGravar } = await supabase.from("openwa_config").update({ ultimo_teste: resultado }).eq("id", true);
  if (erroGravar) console.error("openwa: falha ao gravar o último teste", erroGravar.message);
  return sucesso(resultado);
}

// ---------------------------------------------------------------- webhook e cron

/** Gera (ou regenera) o segredo do webhook no Vault e devolve o valor UMA vez, para colar no OpenWA. */
export async function gerarSegredoWebhook(): Promise<ResultadoAcao<{ segredo: string }>> {
  const negado = await garantirSuperAdmin();
  if (negado) return negado;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_openwa_gerar_webhook_secret");
  if (error || typeof data !== "string") return falha(mensagemErroBanco(error));
  return sucesso({ segredo: data });
}

/**
 * Reenvio automático: grava no Vault a URL das Edge Functions como o BANCO a enxerga (pg_net roda dentro do
 * Postgres) e a chave anon (JWT público, exigido pelo verify_jwt da função). O segredo do cron já foi gerado na migration.
 */
export async function configurarReenvio(entrada: unknown): Promise<ResultadoAcao<null>> {
  const v = z.object({ functionsUrl: esquemaUrl }).safeParse(entrada);
  if (!v.success) return falha(primeiroErro(v.error));
  const negado = await garantirSuperAdmin();
  if (negado) return negado;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anon) return falha("NEXT_PUBLIC_SUPABASE_ANON_KEY não configurada no servidor.");

  const supabase = await createClient();
  const r1 = await supabase.rpc("fn_openwa_definir_segredo", { p_nome: "imobproj_openwa_functions_url", p_valor: v.data.functionsUrl });
  if (r1.error) return falha(mensagemErroBanco(r1.error));
  const r2 = await supabase.rpc("fn_openwa_definir_segredo", { p_nome: "imobproj_openwa_anon_key", p_valor: anon });
  if (r2.error) return falha(mensagemErroBanco(r2.error));
  return sucesso(null);
}

// ---------------------------------------------------------------- sessões no OpenWA (QR / sessão existente)

const TIMEOUT_OPENWA_MS = 15_000;

/** URL global + API key do Vault. A chave fica só no servidor. */
async function credencialOpenwa(): Promise<{ url: string; chave: string } | { erro: string }> {
  const supabase = await createClient();
  const { data: cfg, error } = await supabase.from("openwa_config").select("url").eq("id", true).maybeSingle();
  if (error) return { erro: mensagemErroBanco(error) };
  const url = (cfg as { url: string | null } | null)?.url;
  if (!url) return { erro: "Salve o endereço do OpenWA antes." };
  const { data: chave, error: erroChave } = await createAdminClient().rpc("fn_openwa_segredo", { p_nome: "imobproj_openwa_api_key" });
  if (erroChave) return { erro: "Não foi possível ler a API key no Vault." };
  if (typeof chave !== "string" || !chave) return { erro: "Salve a API key antes." };
  return { url, chave };
}

/** Chama o OpenWA com a API key; devolve o JSON ou a mensagem de erro do OpenWA. */
async function chamarOpenwa<T>(metodo: "GET" | "POST", caminho: string, corpo?: unknown): Promise<ResultadoAcao<T>> {
  const cred = await credencialOpenwa();
  if ("erro" in cred) return falha(cred.erro);
  try {
    const r = await fetch(`${cred.url}/api${caminho}`, {
      method: metodo,
      headers: {
        "X-API-Key": cred.chave,
        Accept: "application/json",
        "X-Tunnel-Skip-AntiPhishing-Page": "true",
        ...(corpo ? { "Content-Type": "application/json" } : {}),
      },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_OPENWA_MS),
      cache: "no-store",
    });
    const texto = await r.text();
    let json: unknown = null;
    try {
      json = texto ? JSON.parse(texto) : null;
    } catch {
      json = null;
    }
    if (!r.ok) {
      const msg = (json as { message?: string | string[] } | null)?.message;
      const detalhe = Array.isArray(msg) ? msg.join("; ") : (msg ?? texto.slice(0, 200));
      return falha(r.status === 401 || r.status === 403 ? "API key recusada pelo OpenWA." : `OpenWA respondeu ${r.status}: ${detalhe}`);
    }
    return sucesso(json as T);
  } catch (e) {
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return falha(timeout ? "O OpenWA não respondeu a tempo." : `Não foi possível falar com o OpenWA: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Sessões que existem no OpenWA, marcando as que já estão cadastradas num projeto. */
export async function sessoesDoOpenwa(): Promise<ResultadoAcao<SessaoOpenwaTeste[]>> {
  const negado = await garantirSuperAdmin();
  if (negado) return negado;
  const r = await chamarOpenwa<SessaoApi[]>("GET", "/sessions");
  if (!r.ok) return r;
  const lista = Array.isArray(r.dados) ? r.dados : [];
  return sucesso(
    lista.map((s) => ({
      id: String(s.id ?? ""),
      nome: typeof s.name === "string" ? s.name : null,
      status: typeof s.status === "string" ? s.status : null,
      telefone: typeof s.phone === "string" ? s.phone : null,
    })),
  );
}

const esquemaNomeSessao = z
  .string()
  .trim()
  .min(3, "O nome precisa de pelo menos 3 letras.")
  .max(50, "Nome longo demais.")
  .regex(/^[A-Za-z0-9-]+$/, "Use só letras, números e hífen (ex.: torre-norte-obra).");

/** Cria a sessão no OpenWA e já inicia (o QR aparece em seguida). */
export async function novaSessaoOpenwa(nome: unknown): Promise<ResultadoAcao<{ id: string }>> {
  const v = esquemaNomeSessao.safeParse(nome);
  if (!v.success) return falha(primeiroErro(v.error));
  const negado = await garantirSuperAdmin();
  if (negado) return negado;
  const criada = await chamarOpenwa<{ id?: string }>("POST", "/sessions", { name: v.data });
  if (!criada.ok) return criada;
  const id = String(criada.dados?.id ?? "");
  if (!id) return falha("O OpenWA não devolveu o id da sessão.");
  const iniciada = await chamarOpenwa<unknown>("POST", `/sessions/${encodeURIComponent(id)}/start`);
  if (!iniciada.ok) return iniciada;
  return sucesso({ id });
}

export type EstadoQr = { status: string | null; telefone: string | null; qr: string | null };

/** Status da sessão e, enquanto espera leitura, o QR em data URL. */
export async function qrDaSessao(openwaId: unknown): Promise<ResultadoAcao<EstadoQr>> {
  const v = z.string().trim().min(1).max(120).safeParse(openwaId);
  if (!v.success) return falha("Sessão inválida.");
  const negado = await garantirSuperAdmin();
  if (negado) return negado;
  const id = encodeURIComponent(v.data);
  const s = await chamarOpenwa<SessaoApi>("GET", `/sessions/${id}`);
  if (!s.ok) return s;
  const status = typeof s.dados?.status === "string" ? s.dados.status : null;
  const telefone = typeof s.dados?.phone === "string" ? s.dados.phone : null;
  if (status !== "qr_ready") return sucesso({ status, telefone, qr: null });
  const q = await chamarOpenwa<{ qrCode?: string }>("GET", `/sessions/${id}/qr`);
  return sucesso({ status, telefone, qr: q.ok && typeof q.dados?.qrCode === "string" ? q.dados.qrCode : null });
}

// ---------------------------------------------------------------- vincular grupo existente (Fase 3)

export type GrupoDoNumero = { id: string; nome: string; vinculadoA: string | null };

/** Grupos de WhatsApp em que o número está, marcando os que já têm vínculo (um grupo, um vínculo). */
export async function gruposDoNumero(sessionId: unknown): Promise<ResultadoAcao<GrupoDoNumero[]>> {
  if (!z.guid().safeParse(sessionId).success) return falha("Número inválido.");
  const negado = await garantirSuperAdmin();
  if (negado) return negado;
  const supabase = await createClient();
  const { data: s, error } = await supabase.from("wa_sessions").select("openwa_session_id").eq("id", sessionId as string).maybeSingle();
  if (error) return falha(mensagemErroBanco(error));
  const sid = (s as { openwa_session_id: string | null } | null)?.openwa_session_id;
  if (!sid) return falha("Este número ainda não tem sessão no OpenWA.");

  const r = await chamarOpenwa<{ id?: unknown; name?: unknown }[]>("GET", `/sessions/${encodeURIComponent(sid)}/groups`);
  if (!r.ok) return r;
  const { data: ja, error: erroJa } = await supabase.from("wa_groups").select("wa_group_id, nome").not("wa_group_id", "is", null);
  if (erroJa) return falha(mensagemErroBanco(erroJa));
  const vinculados = new Map(((ja ?? []) as { wa_group_id: string; nome: string }[]).map((g) => [g.wa_group_id, g.nome]));
  return sucesso(
    (Array.isArray(r.dados) ? r.dados : [])
      .filter((g) => typeof g.id === "string" && g.id.endsWith("@g.us"))
      .map((g) => ({ id: g.id as string, nome: typeof g.name === "string" && g.name ? g.name : (g.id as string), vinculadoA: vinculados.get(g.id as string) ?? null }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
  );
}

const esquemaVinculo = z.object({
  projectId: z.guid("Escolha o projeto."),
  sessionId: z.guid("Escolha o número."),
  waGroupId: z.string().trim().regex(/@g\.us$/, "Escolha o grupo do WhatsApp."),
  nome: z.string().trim().min(1, "Informe o nome do grupo.").max(120),
  teamId: z.guid("Escolha a equipe."),
  autoEvidencia: z.boolean(),
  autoOs: z.boolean(),
});

/** Liga um grupo que já existe no WhatsApp a projeto + equipe + número (o banco confere que são do mesmo projeto). */
export async function vincularGrupo(entrada: unknown): Promise<ResultadoAcao<{ id: string }>> {
  const v = esquemaVinculo.safeParse(entrada);
  if (!v.success) return falha(primeiroErro(v.error));
  const negado = await garantirSuperAdmin();
  if (negado) return negado;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("wa_groups")
    .insert({
      project_id: v.data.projectId,
      session_id: v.data.sessionId,
      wa_group_id: v.data.waGroupId,
      nome: v.data.nome,
      team_id: v.data.teamId,
      equipe: "-", // o trigger troca pelo nome da equipe
      auto_evidencia: v.data.autoEvidencia,
      auto_os: v.data.autoOs,
    })
    .select("id")
    .single();
  if (error || !data) {
    if (error?.code === "23505") return falha("Este grupo já está vinculado a um projeto.");
    return falha(mensagemErroBanco(error));
  }
  const id = (data as { id: string }).id;

  // Importa quem já está no grupo. Sem isso, "Sincronizar" (que tira do WhatsApp quem não está cadastrado)
  // esvaziaria um grupo que acabou de ser vinculado. Se não der para ler, desfaz o vínculo.
  const { data: s } = await supabase.from("wa_sessions").select("openwa_session_id").eq("id", v.data.sessionId).maybeSingle();
  const sid = (s as { openwa_session_id: string | null } | null)?.openwa_session_id ?? "";
  const lido = await chamarOpenwa<{ participants?: { id?: string; number?: string; isAdmin?: boolean; isSuperAdmin?: boolean }[] }>(
    "GET",
    `/sessions/${encodeURIComponent(sid)}/groups/${encodeURIComponent(v.data.waGroupId)}`,
  );
  const membros = lido.ok
    ? (lido.dados?.participants ?? [])
        .map((p) => ({
          group_id: id,
          telefone: String(p.number ?? p.id ?? "").replace(/\D/g, ""),
          is_admin: !!(p.isAdmin || p.isSuperAdmin),
        }))
        .filter((m) => m.telefone.length >= 8)
    : null;
  const erroMembros = membros?.length
    ? (await supabase.from("wa_group_members").upsert(membros, { onConflict: "group_id,telefone", ignoreDuplicates: true })).error
    : null;
  if (!membros || erroMembros) {
    await supabase.from("wa_groups").delete().eq("id", id);
    return falha(
      !lido.ok
        ? `Não foi possível ler os participantes do grupo no OpenWA (${lido.erro}). Nada foi vinculado.`
        : `Não foi possível gravar os participantes (${mensagemErroBanco(erroMembros)}). Nada foi vinculado.`,
    );
  }
  return sucesso({ id });
}

// ---------------------------------------------------------------- sessões

const esquemaSessao = z.object({
  id: z.guid().optional(),
  projectId: z.guid("Escolha o projeto."),
  numero: z
    .string()
    .trim()
    .transform((s) => s.replace(/\D/g, ""))
    .refine((s) => s.length >= 10 && s.length <= 15, "Informe o número com DDI e DDD (ex.: 5511999990000)."),
  openwaSessionId: z.string().trim().min(1, "Informe o id da sessão no OpenWA.").max(120),
});

/**
 * Cria ou edita a sessão do projeto (wa_sessions; RLS só super_admin). O envio usa a URL global do OpenWA;
 * wa_sessions.openwa_url (obrigatória no esquema base) recebe a URL global atual como reserva.
 */
export async function salvarSessao(entrada: unknown): Promise<ResultadoAcao<{ id: string }>> {
  const v = esquemaSessao.safeParse(entrada);
  if (!v.success) return falha(primeiroErro(v.error));
  const negado = await garantirSuperAdmin();
  if (negado) return negado;

  const supabase = await createClient();
  const { data: cfg } = await supabase.from("openwa_config").select("url").eq("id", true).maybeSingle();
  const campos = {
    project_id: v.data.projectId,
    numero: v.data.numero,
    openwa_session_id: v.data.openwaSessionId,
    openwa_url: (cfg as { url: string | null } | null)?.url ?? "",
  };
  const consulta = v.data.id
    ? supabase.from("wa_sessions").update(campos).eq("id", v.data.id).select("id").single()
    : supabase.from("wa_sessions").insert(campos).select("id").single();
  const { data, error } = await consulta;
  if (error || !data) {
    if (error?.code === "23505") return falha("Já existe uma sessão com este id do OpenWA.");
    return falha(mensagemErroBanco(error));
  }
  return sucesso({ id: (data as { id: string }).id });
}

export async function excluirSessao(id: string): Promise<ResultadoAcao<null>> {
  if (!z.guid().safeParse(id).success) return falha("Sessão inválida.");
  const negado = await garantirSuperAdmin();
  if (negado) return negado;
  const supabase = await createClient();
  const { error } = await supabase.from("wa_sessions").delete().eq("id", id);
  if (error) return falha(mensagemErroBanco(error));
  return sucesso(null);
}

/** Marca como lidos os alertas do WhatsApp (fila que falhou 5 vezes). */
export async function marcarAlertasLidos(): Promise<ResultadoAcao<null>> {
  const negado = await garantirSuperAdmin();
  if (negado) return negado;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("alertas")
    .update({ lido_em: new Date().toISOString(), lido_por: user?.id ?? null })
    .eq("tipo", "whatsapp_envio_falhou")
    .is("lido_em", null);
  if (error) return falha(mensagemErroBanco(error));
  return sucesso(null);
}

// ---------------------------------------------------------------- grupos (Edge Function openwa-groups)

type RespostaGrupos = {
  ok?: boolean;
  erro?: string;
  wa_group_id?: string | null;
  adicionados?: string[];
  removidos?: string[];
  promovidos?: string[];
};

async function chamarOpenwaGroups(acao: "criar" | "sincronizar", groupId: string): Promise<ResultadoAcao<ResultadoGrupo>> {
  if (!z.guid().safeParse(groupId).success) return falha("Grupo inválido.");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return falha("Sua sessão expirou. Entre novamente.");

  const { data, error } = await supabase.functions.invoke<RespostaGrupos>("openwa-groups", { body: { acao, group_id: groupId } });
  if (error) {
    // FunctionsHttpError traz a Response em context: lê a mensagem da função.
    const ctx = (error as { context?: unknown }).context;
    if (ctx instanceof Response) {
      try {
        const corpo = (await ctx.json()) as RespostaGrupos;
        if (corpo.erro) return falha(corpo.erro);
      } catch {
        /* corpo não-JSON */
      }
    }
    return falha("Não foi possível falar com a função openwa-groups. Ela foi publicada?");
  }
  return sucesso({
    waGroupId: data?.wa_group_id ?? null,
    adicionados: data?.adicionados ?? [],
    removidos: data?.removidos ?? [],
    promovidos: data?.promovidos ?? [],
  });
}

/** Cria o grupo no WhatsApp com os telefones de wa_group_members e grava wa_groups.wa_group_id. Super admin ou gerente. */
export async function criarGrupoWhatsApp(groupId: string): Promise<ResultadoAcao<ResultadoGrupo>> {
  return chamarOpenwaGroups("criar", groupId);
}

/** Adiciona/remove/promove participantes do grupo no WhatsApp conforme wa_group_members. Super admin ou gerente. */
export async function sincronizarGrupoWhatsApp(groupId: string): Promise<ResultadoAcao<ResultadoGrupo>> {
  return chamarOpenwaGroups("sincronizar", groupId);
}
