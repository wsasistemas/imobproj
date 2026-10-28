"use server";

// Server Actions de Documentos, Comentários e Processos.
// Padrão: zod → exigirPermissao → gravar com o cliente do servidor (a RLS confere de novo) → ResultadoAcao.
//
// Upload: o arquivo vai do NAVEGADOR direto para o Storage (bucket privado "documentos", política
// documentos_insert só aceita gerente/super_admin no 1º segmento = project_id). A action só registra o
// documento/versão depois de conferir que o objeto existe no caminho esperado. Motivo: Server Actions têm limite
// de corpo de 1 MB por padrão (o bucket aceita 50 MB) e o upload direto não passa o arquivo duas vezes pela rede.
import { z } from "zod";
import { falha, mensagemErroBanco, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { exigirPermissao } from "@/lib/projeto/servidor";
import type { DocumentStatus, DocumentTipo } from "@/lib/projeto/tipos";
import { createClient } from "@/lib/supabase/server";
import { esquemaProcesso } from "@/components/documentacao/processo";
import { proximaVersaoMenor, versaoAoAprovar } from "@/components/documentacao/utilidades";

const TIPOS = [
  "termo_abertura",
  "escopo",
  "processo_asis",
  "processo_tobe",
  "raci",
  "plano_comunicacao",
  "requisitos",
  "outro",
] as const satisfies readonly DocumentTipo[];

const SITUACOES = ["rascunho", "revisao", "aprovado", "vivo"] as const satisfies readonly DocumentStatus[];

/** Fluxo de situação permitido (de → para). */
const TRANSICOES: Record<DocumentStatus, DocumentStatus[]> = {
  rascunho: ["revisao"],
  revisao: ["aprovado", "rascunho"],
  aprovado: ["vivo", "revisao"],
  vivo: ["revisao"],
};

// z.guid (e não uuid): os ids do seed (c0000000-…) não seguem a RFC 4122.
const uuid = z.guid("Identificador inválido.");

function erroValidacao(e: z.ZodError) {
  return e.issues[0]?.message ?? "Dados inválidos.";
}

async function permitir(projectId: string, acao: "documento_editar" | "documento_comentar") {
  try {
    return { ok: true as const, ...(await exigirPermissao(projectId, acao)) };
  } catch (e) {
    return { ok: false as const, erro: e instanceof Error ? e.message : "Sem permissão." };
  }
}

/** Confere se o objeto existe no bucket (o upload foi feito pelo navegador). */
async function arquivoExiste(supabase: Awaited<ReturnType<typeof createClient>>, caminho: string) {
  const i = caminho.lastIndexOf("/");
  const pasta = caminho.slice(0, i);
  const nome = caminho.slice(i + 1);
  const { data, error } = await supabase.storage.from("documentos").list(pasta, { search: nome, limit: 100 });
  return !error && (data ?? []).some((o) => o.name === nome);
}

function entradaVersao(versao: string, storagePath: string | null, nomeArquivo: string | null, evento: "envio" | "aprovacao", userId: string) {
  return { versao, storage_path: storagePath, nome_arquivo: nomeArquivo, evento, enviado_em: new Date().toISOString(), enviado_por: userId };
}

// ---------------------------------------------------------------------------------------------
// Documentos
// ---------------------------------------------------------------------------------------------
const esquemaCriar = z.object({
  projectId: uuid,
  documentId: uuid,
  tipo: z.enum(TIPOS),
  titulo: z.string().trim().min(3, "O título precisa de pelo menos 3 caracteres.").max(200),
  storagePath: z.string().min(1).max(400),
  nomeArquivo: z.string().min(1).max(255),
});

/** Cria o documento (versão 1.0, rascunho) depois que o navegador enviou o arquivo para o Storage. */
export async function criarDocumentoComArquivo(entrada: z.input<typeof esquemaCriar>): Promise<ResultadoAcao<{ id: string }>> {
  const v = esquemaCriar.safeParse(entrada);
  if (!v.success) return falha(erroValidacao(v.error));
  const { projectId, documentId, tipo, titulo, storagePath, nomeArquivo } = v.data;
  const perm = await permitir(projectId, "documento_editar");
  if (!perm.ok) return falha(perm.erro);

  if (!storagePath.startsWith(`${projectId}/${documentId}/1.0-`)) return falha("Caminho do arquivo inválido.");
  const supabase = await createClient();
  if (!(await arquivoExiste(supabase, storagePath))) return falha("O arquivo não chegou ao armazenamento. Envie de novo.");

  const { error } = await supabase.from("documents").insert({
    id: documentId,
    project_id: projectId,
    tipo,
    titulo,
    versao: "1.0",
    status: "rascunho",
    storage_path: storagePath,
    conteudo: { versoes: [entradaVersao("1.0", storagePath, nomeArquivo, "envio", perm.userId)] },
  });
  if (error) return falha(mensagemErroBanco(error));
  return sucesso({ id: documentId });
}

const esquemaNovaVersao = z.object({
  projectId: uuid,
  documentId: uuid,
  versaoAtual: z.string().min(1).max(20),
  storagePath: z.string().min(1).max(400),
  nomeArquivo: z.string().min(1).max(255),
});

/**
 * Registra um novo arquivo para o documento: versão menor + 1. Se o documento estava aprovado, volta para
 * rascunho (a alteração ainda não foi aprovada); "documento vivo" continua vivo.
 */
export async function registrarNovaVersao(
  entrada: z.input<typeof esquemaNovaVersao>,
): Promise<ResultadoAcao<{ versao: string }>> {
  const v = esquemaNovaVersao.safeParse(entrada);
  if (!v.success) return falha(erroValidacao(v.error));
  const { projectId, documentId, versaoAtual, storagePath, nomeArquivo } = v.data;
  const perm = await permitir(projectId, "documento_editar");
  if (!perm.ok) return falha(perm.erro);

  const supabase = await createClient();
  const { data: doc, error: erroLeitura } = await supabase
    .from("documents")
    .select("id, versao, status, conteudo")
    .eq("id", documentId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (erroLeitura) return falha(mensagemErroBanco(erroLeitura));
  if (!doc) return falha("Documento não encontrado.");
  if (doc.versao !== versaoAtual)
    return falha("O documento foi alterado por outra pessoa enquanto você enviava. Atualize a tela e envie de novo.");

  const versao = proximaVersaoMenor(doc.versao);
  if (!storagePath.startsWith(`${projectId}/${documentId}/${versao}-`)) return falha("Caminho do arquivo inválido.");
  if (!(await arquivoExiste(supabase, storagePath))) return falha("O arquivo não chegou ao armazenamento. Envie de novo.");

  const conteudo = (doc.conteudo ?? {}) as Record<string, unknown>;
  const versoes = Array.isArray(conteudo.versoes) ? conteudo.versoes : [];
  const status: DocumentStatus = doc.status === "aprovado" ? "rascunho" : (doc.status as DocumentStatus);

  const { error } = await supabase
    .from("documents")
    .update({
      versao,
      status,
      storage_path: storagePath,
      conteudo: { ...conteudo, versoes: [...versoes, entradaVersao(versao, storagePath, nomeArquivo, "envio", perm.userId)] },
    })
    .eq("id", documentId)
    .eq("project_id", projectId)
    .eq("versao", versaoAtual); // concorrência otimista
  if (error) return falha(mensagemErroBanco(error));
  return sucesso({ versao });
}

const esquemaSituacao = z.object({ projectId: uuid, documentId: uuid, para: z.enum(SITUACOES) });

/** rascunho → revisão → aprovado → documento vivo (e voltas). Aprovar fecha a versão maior (1.2 → 2.0). */
export async function mudarSituacaoDocumento(
  entrada: z.input<typeof esquemaSituacao>,
): Promise<ResultadoAcao<{ status: DocumentStatus; versao: string }>> {
  const v = esquemaSituacao.safeParse(entrada);
  if (!v.success) return falha(erroValidacao(v.error));
  const { projectId, documentId, para } = v.data;
  const perm = await permitir(projectId, "documento_editar");
  if (!perm.ok) return falha(perm.erro);

  const supabase = await createClient();
  const { data: doc, error: erroLeitura } = await supabase
    .from("documents")
    .select("id, versao, status, storage_path, conteudo")
    .eq("id", documentId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (erroLeitura) return falha(mensagemErroBanco(erroLeitura));
  if (!doc) return falha("Documento não encontrado.");
  const de = doc.status as DocumentStatus;
  if (!TRANSICOES[de].includes(para)) return falha("Essa mudança de situação não é permitida a partir da situação atual.");

  const mudancas: Record<string, unknown> = { status: para };
  let versao = doc.versao as string;
  if (para === "aprovado") {
    versao = versaoAoAprovar(doc.versao);
    const conteudo = (doc.conteudo ?? {}) as Record<string, unknown>;
    const versoes = Array.isArray(conteudo.versoes) ? conteudo.versoes : [];
    mudancas.versao = versao;
    mudancas.conteudo = {
      ...conteudo,
      versoes: [...versoes, entradaVersao(versao, doc.storage_path, null, "aprovacao", perm.userId)],
    };
  }

  const { error } = await supabase
    .from("documents")
    .update(mudancas)
    .eq("id", documentId)
    .eq("project_id", projectId)
    .eq("status", de);
  if (error) return falha(mensagemErroBanco(error));
  return sucesso({ status: para, versao });
}

// ---------------------------------------------------------------------------------------------
// Comentários (diretor, gerente e usuário-chave comentam; autor ou gerente resolvem/reabrem — RLS)
// ---------------------------------------------------------------------------------------------
const esquemaComentar = z.object({
  projectId: uuid,
  documentId: uuid,
  texto: z.string().trim().min(2, "Escreva o comentário.").max(4000),
});

export async function comentarDocumento(entrada: z.input<typeof esquemaComentar>): Promise<ResultadoAcao<{ id: string }>> {
  const v = esquemaComentar.safeParse(entrada);
  if (!v.success) return falha(erroValidacao(v.error));
  const { projectId, documentId, texto } = v.data;
  const perm = await permitir(projectId, "documento_comentar");
  if (!perm.ok) return falha(perm.erro);

  const supabase = await createClient();
  const { data: doc } = await supabase.from("documents").select("id").eq("id", documentId).eq("project_id", projectId).maybeSingle();
  if (!doc) return falha("Documento não encontrado.");

  const { data, error } = await supabase
    .from("document_comments")
    .insert({ document_id: documentId, autor_id: perm.userId, texto })
    .select("id")
    .single();
  if (error) return falha(mensagemErroBanco(error));
  return sucesso({ id: data.id as string });
}

const esquemaResolver = z.object({ projectId: uuid, commentId: uuid, resolvido: z.boolean() });

export async function alternarComentarioResolvido(entrada: z.input<typeof esquemaResolver>): Promise<ResultadoAcao<null>> {
  const v = esquemaResolver.safeParse(entrada);
  if (!v.success) return falha(erroValidacao(v.error));
  const { projectId, commentId, resolvido } = v.data;
  const perm = await permitir(projectId, "documento_comentar");
  if (!perm.ok) return falha(perm.erro);

  const supabase = await createClient();
  // Garante que o comentário é de um documento deste projeto.
  const { data: c } = await supabase
    .from("document_comments")
    .select("id, autor_id, documents!inner(project_id)")
    .eq("id", commentId)
    .eq("documents.project_id", projectId)
    .maybeSingle();
  if (!c) return falha("Comentário não encontrado.");
  if (c.autor_id !== perm.userId && perm.papel !== "gerente" && perm.papel !== "super_admin")
    return falha("Só o autor ou o gerente do projeto podem resolver este comentário.");

  const { data, error } = await supabase.from("document_comments").update({ resolvido }).eq("id", commentId).select("id");
  if (error) return falha(mensagemErroBanco(error));
  if (!data?.length) return falha("Você não tem permissão para esta ação neste projeto.");
  return sucesso(null);
}

// ---------------------------------------------------------------------------------------------
// Processos (documents tipo processo_asis / processo_tobe; conteúdo em documents.conteudo)
// ---------------------------------------------------------------------------------------------
const esquemaNovoProcesso = z.object({
  projectId: uuid,
  tipo: z.enum(["processo_asis", "processo_tobe"]),
  titulo: z.string().trim().min(3, "O título precisa de pelo menos 3 caracteres.").max(200),
});

export async function criarProcesso(entrada: z.input<typeof esquemaNovoProcesso>): Promise<ResultadoAcao<{ id: string }>> {
  const v = esquemaNovoProcesso.safeParse(entrada);
  if (!v.success) return falha(erroValidacao(v.error));
  const { projectId, tipo, titulo } = v.data;
  const perm = await permitir(projectId, "documento_editar");
  if (!perm.ok) return falha(perm.erro);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .insert({
      project_id: projectId,
      tipo,
      titulo,
      versao: "0.1",
      status: "rascunho",
      conteudo: {
        formato: 2,
        etapas: [
          { id: "e1", titulo: "Início do processo", responsavel: "" },
          { id: "e2", titulo: "Fim do processo", responsavel: "" },
        ],
        decisao: null,
      },
    })
    .select("id")
    .single();
  if (error) return falha(mensagemErroBanco(error));
  return sucesso({ id: data.id as string });
}

const esquemaSalvarProcesso = z.object({
  projectId: uuid,
  documentId: uuid,
  titulo: z.string().trim().min(3, "O título precisa de pelo menos 3 caracteres.").max(200),
  processo: esquemaProcesso,
});

/** Salva etapas/decisão preservando o resto de conteudo (ex.: versoes). Não muda a versão. */
export async function salvarProcesso(entrada: z.input<typeof esquemaSalvarProcesso>): Promise<ResultadoAcao<null>> {
  const v = esquemaSalvarProcesso.safeParse(entrada);
  if (!v.success) return falha(erroValidacao(v.error));
  const { projectId, documentId, titulo, processo } = v.data;
  const perm = await permitir(projectId, "documento_editar");
  if (!perm.ok) return falha(perm.erro);

  const supabase = await createClient();
  const { data: doc, error: erroLeitura } = await supabase
    .from("documents")
    .select("id, tipo, conteudo")
    .eq("id", documentId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (erroLeitura) return falha(mensagemErroBanco(erroLeitura));
  if (!doc || (doc.tipo !== "processo_asis" && doc.tipo !== "processo_tobe")) return falha("Processo não encontrado.");

  const conteudo = (doc.conteudo ?? {}) as Record<string, unknown>;
  const { error } = await supabase
    .from("documents")
    .update({ titulo, conteudo: { ...conteudo, formato: 2, etapas: processo.etapas, decisao: processo.decisao } })
    .eq("id", documentId)
    .eq("project_id", projectId);
  if (error) return falha(mensagemErroBanco(error));
  return sucesso(null);
}
