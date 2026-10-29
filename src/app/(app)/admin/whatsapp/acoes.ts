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
