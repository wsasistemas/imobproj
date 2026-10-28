"use server";

// Server Actions da EAP (wbs_items): edição inline, criar filho/irmão, excluir e importação em lote.
// Todas exigem "eap_editar" (gerente/super_admin); a RLS wbs_items_write confere de novo.
import { z } from "zod";
import { falha, mensagemErroBanco, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { exigirPermissao } from "@/lib/projeto/servidor";
import { createClient } from "@/lib/supabase/server";
import { codigoPai, compararCodigos, proximoCodigoFilho, REGEX_CODIGO_EAP } from "@/components/documentacao/utilidades";

// z.guid (e não uuid): os ids do seed (c0000000-…) não seguem a RFC 4122.
const uuid = z.guid("Identificador inválido.");
const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");

type Supa = Awaited<ReturnType<typeof createClient>>;

async function permitir(projectId: string) {
  try {
    return { ok: true as const, ...(await exigirPermissao(projectId, "eap_editar")) };
  } catch (e) {
    return { ok: false as const, erro: e instanceof Error ? e.message : "Sem permissão." };
  }
}

const erroValidacao = (e: z.ZodError) => e.issues[0]?.message ?? "Dados inválidos.";

/**
 * Recalcula `ordem` de todo o projeto pela ordem natural dos códigos (pré-ordem da árvore), de 10 em 10.
 * Assim o cronograma/Gantt, que ordenam por `ordem`, ficam na mesma sequência da EAP. Só grava o que mudou.
 */
async function renumerarOrdem(supabase: Supa, projectId: string) {
  const { data } = await supabase.from("wbs_items").select("id, codigo, ordem").eq("project_id", projectId);
  const itens = ((data ?? []) as { id: string; codigo: string; ordem: number }[]).sort((a, b) =>
    compararCodigos(a.codigo, b.codigo),
  );
  const mudancas = itens.map((i, idx) => ({ id: i.id, ordem: (idx + 1) * 10, antiga: i.ordem })).filter((i) => i.ordem !== i.antiga);
  for (let i = 0; i < mudancas.length; i += 20) {
    await Promise.all(
      mudancas.slice(i, i + 20).map((m) => supabase.from("wbs_items").update({ ordem: m.ordem }).eq("id", m.id).eq("project_id", projectId)),
    );
  }
}

/** Membros ativos do projeto por e-mail (minúsculo) → user_id. */
async function membrosPorEmail(supabase: Supa, projectId: string) {
  const { data } = await supabase
    .from("project_members")
    .select("user_id, profiles(email)")
    .eq("project_id", projectId)
    .eq("ativo", true);
  const mapa = new Map<string, string>();
  for (const m of (data ?? []) as unknown as { user_id: string; profiles: { email: string | null } | null }[]) {
    if (m.profiles?.email) mapa.set(m.profiles.email.toLowerCase(), m.user_id);
  }
  return mapa;
}

// ---------------------------------------------------------------------------------------------
// Edição inline de um campo
// ---------------------------------------------------------------------------------------------
const esquemaCampo = z.discriminatedUnion("campo", [
  z.object({ campo: z.literal("titulo"), valor: z.string().trim().min(1, "O título não pode ficar vazio.").max(200) }),
  z.object({
    campo: z.literal("horas_orcadas"),
    valor: z.number({ error: "Informe um número de horas." }).min(0, "Horas não podem ser negativas.").max(99_999_999),
  }),
  z.object({ campo: z.literal("inicio"), valor: dataIso.nullable() }),
  z.object({ campo: z.literal("fim"), valor: dataIso.nullable() }),
  z.object({ campo: z.literal("responsavel_id"), valor: uuid.nullable() }),
  z.object({ campo: z.literal("is_fase"), valor: z.boolean() }),
  z.object({ campo: z.literal("is_milestone"), valor: z.boolean() }),
]);

const esquemaAtualizar = z.object({ projectId: uuid, itemId: uuid, alteracao: esquemaCampo });

export async function atualizarCampoEap(entrada: z.input<typeof esquemaAtualizar>): Promise<ResultadoAcao<null>> {
  const v = esquemaAtualizar.safeParse(entrada);
  if (!v.success) return falha(erroValidacao(v.error));
  const { projectId, itemId, alteracao } = v.data;
  const perm = await permitir(projectId);
  if (!perm.ok) return falha(perm.erro);

  const supabase = await createClient();
  const { data: item } = await supabase
    .from("wbs_items")
    .select("id, inicio, fim")
    .eq("id", itemId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!item) return falha("Item da EAP não encontrado.");

  const inicio = alteracao.campo === "inicio" ? alteracao.valor : (item.inicio as string | null);
  const fim = alteracao.campo === "fim" ? alteracao.valor : (item.fim as string | null);
  if (inicio && fim && fim < inicio) return falha("O fim não pode ser antes do início.");

  if (alteracao.campo === "responsavel_id" && alteracao.valor) {
    const { data: membro } = await supabase
      .from("project_members")
      .select("user_id")
      .eq("project_id", projectId)
      .eq("user_id", alteracao.valor)
      .eq("ativo", true)
      .maybeSingle();
    if (!membro) return falha("O responsável precisa ser membro ativo do projeto.");
  }

  const { error } = await supabase
    .from("wbs_items")
    .update({ [alteracao.campo]: alteracao.valor })
    .eq("id", itemId)
    .eq("project_id", projectId);
  if (error) return falha(mensagemErroBanco(error));
  return sucesso(null);
}

// ---------------------------------------------------------------------------------------------
// Criar item (filho de um item, irmão de um item ou nova fase na raiz) — código gerado aqui
// ---------------------------------------------------------------------------------------------
const esquemaCriar = z.object({
  projectId: uuid,
  /** Pai do novo item; null = raiz (nova fase). */
  parentId: uuid.nullable(),
  titulo: z.string().trim().min(1).max(200).optional(),
  isFase: z.boolean().optional(),
  isMilestone: z.boolean().optional(),
});

export async function criarItemEap(entrada: z.input<typeof esquemaCriar>): Promise<ResultadoAcao<{ id: string; codigo: string }>> {
  const v = esquemaCriar.safeParse(entrada);
  if (!v.success) return falha(erroValidacao(v.error));
  const { projectId, parentId, titulo, isFase, isMilestone } = v.data;
  const perm = await permitir(projectId);
  if (!perm.ok) return falha(perm.erro);

  const supabase = await createClient();
  const { data: itens, error: erroLeitura } = await supabase
    .from("wbs_items")
    .select("id, codigo, inicio, fim")
    .eq("project_id", projectId);
  if (erroLeitura) return falha(mensagemErroBanco(erroLeitura));
  const lista = (itens ?? []) as { id: string; codigo: string; inicio: string | null; fim: string | null }[];

  let codigoDoPai: string | null = null;
  let pai: (typeof lista)[number] | undefined;
  if (parentId) {
    pai = lista.find((i) => i.id === parentId);
    if (!pai) return falha("Item pai não encontrado.");
    codigoDoPai = pai.codigo;
  }

  const raiz = !parentId;
  const fase = isFase ?? raiz;
  // Até 3 tentativas para o caso raro de outra pessoa criar o mesmo código ao mesmo tempo.
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const codigos = lista.map((i) => i.codigo);
    const codigo = proximoCodigoFilho(codigoDoPai, codigos);
    const { data, error } = await supabase
      .from("wbs_items")
      .insert({
        project_id: projectId,
        parent_id: parentId,
        codigo,
        titulo: titulo ?? (fase ? "Nova fase" : isMilestone ? "Novo marco" : "Nova atividade"),
        is_fase: fase,
        is_milestone: isMilestone ?? false,
        horas_orcadas: 0,
        inicio: pai?.inicio ?? null,
        fim: isMilestone ? (pai?.inicio ?? null) : (pai?.fim ?? null),
      })
      .select("id, codigo")
      .single();
    if (!error) {
      await renumerarOrdem(supabase, projectId);
      return sucesso({ id: data.id as string, codigo: data.codigo as string });
    }
    if (error.code !== "23505") return falha(mensagemErroBanco(error));
    lista.push({ id: "", codigo, inicio: null, fim: null });
  }
  return falha("Não foi possível gerar um código livre. Tente novamente.");
}

// ---------------------------------------------------------------------------------------------
// Excluir (a FK parent_id on delete cascade remove os subitens; OS ligadas ficam sem item)
// ---------------------------------------------------------------------------------------------
const esquemaExcluir = z.object({ projectId: uuid, itemId: uuid });

export async function excluirItemEap(entrada: z.input<typeof esquemaExcluir>): Promise<ResultadoAcao<null>> {
  const v = esquemaExcluir.safeParse(entrada);
  if (!v.success) return falha(erroValidacao(v.error));
  const { projectId, itemId } = v.data;
  const perm = await permitir(projectId);
  if (!perm.ok) return falha(perm.erro);

  const supabase = await createClient();
  const { data, error } = await supabase.from("wbs_items").delete().eq("id", itemId).eq("project_id", projectId).select("id");
  if (error) return falha(mensagemErroBanco(error));
  if (!data?.length) return falha("Item da EAP não encontrado.");
  await renumerarOrdem(supabase, projectId);
  return sucesso(null);
}

// ---------------------------------------------------------------------------------------------
// Importação em lote (.xlsx lido no navegador; aqui chegam só as linhas válidas da pré-visualização)
// ---------------------------------------------------------------------------------------------
const esquemaLinha = z
  .object({
    codigo: z.string().trim().regex(REGEX_CODIGO_EAP, "Código inválido (use 1, 1.2, 1.2.3)."),
    titulo: z.string().trim().min(1, "Título obrigatório.").max(200),
    responsavel_email: z.string().trim().toLowerCase().email().nullable(),
    horas_orcadas: z.number().min(0).max(99_999_999),
    inicio: dataIso.nullable(),
    fim: dataIso.nullable(),
    marco: z.boolean(),
  })
  .refine((l) => !l.inicio || !l.fim || l.fim >= l.inicio, { message: "O fim não pode ser antes do início." });

const esquemaImportar = z.object({
  projectId: uuid,
  linhas: z
    .array(esquemaLinha)
    .min(1, "Nenhuma linha válida para gravar.")
    .max(2000, "No máximo 2.000 linhas por importação.")
    .refine((ls) => new Set(ls.map((l) => l.codigo)).size === ls.length, { message: "Há códigos repetidos na planilha." }),
});

export type ResumoImportacao = { criados: number; atualizados: number; semResponsavel: number };

export async function importarEap(entrada: z.input<typeof esquemaImportar>): Promise<ResultadoAcao<ResumoImportacao>> {
  const v = esquemaImportar.safeParse(entrada);
  if (!v.success) return falha(erroValidacao(v.error));
  const { projectId, linhas } = v.data;
  const perm = await permitir(projectId);
  if (!perm.ok) return falha(perm.erro);

  const supabase = await createClient();
  const [{ data: existentes, error: erroLeitura }, emails] = await Promise.all([
    supabase.from("wbs_items").select("id, codigo").eq("project_id", projectId),
    membrosPorEmail(supabase, projectId),
  ]);
  if (erroLeitura) return falha(mensagemErroBanco(erroLeitura));

  const idPorCodigo = new Map(((existentes ?? []) as { id: string; codigo: string }[]).map((i) => [i.codigo, i.id]));
  const codigosNaPlanilha = new Set(linhas.map((l) => l.codigo));

  // Revalida a hierarquia no servidor: todo pai precisa existir (no banco ou na própria planilha).
  for (const l of linhas) {
    const p = codigoPai(l.codigo);
    if (p && !idPorCodigo.has(p) && !codigosNaPlanilha.has(p))
      return falha(`O item ${l.codigo} não tem o pai ${p} na EAP nem na planilha.`);
  }

  let semResponsavel = 0;
  const responsavel = (email: string | null) => {
    if (!email) return null;
    const id = emails.get(email) ?? null;
    if (!id) semResponsavel++;
    return id;
  };

  const ordenadas = [...linhas].sort((a, b) => compararCodigos(a.codigo, b.codigo));
  const atualizar = ordenadas.filter((l) => idPorCodigo.has(l.codigo));
  const criar = ordenadas.filter((l) => !idPorCodigo.has(l.codigo));

  // Atualizações (match por código)
  for (let i = 0; i < atualizar.length; i += 20) {
    const resultados = await Promise.all(
      atualizar.slice(i, i + 20).map((l) =>
        supabase
          .from("wbs_items")
          .update({
            titulo: l.titulo,
            responsavel_id: responsavel(l.responsavel_email),
            horas_orcadas: l.horas_orcadas,
            inicio: l.inicio,
            fim: l.fim,
            is_milestone: l.marco,
          })
          .eq("id", idPorCodigo.get(l.codigo)!)
          .eq("project_id", projectId),
      ),
    );
    const erro = resultados.find((r) => r.error)?.error;
    if (erro) return falha(`${mensagemErroBanco(erro)} (nada foi desfeito: confira a EAP e importe de novo).`);
  }

  // Criações por nível, para conhecer o id do pai antes de inserir os filhos.
  const porNivel = new Map<number, typeof criar>();
  for (const l of criar) {
    const n = l.codigo.split(".").length;
    porNivel.set(n, [...(porNivel.get(n) ?? []), l]);
  }
  for (const nivel of [...porNivel.keys()].sort((a, b) => a - b)) {
    const registros = porNivel.get(nivel)!.map((l) => {
      const p = codigoPai(l.codigo);
      return {
        project_id: projectId,
        parent_id: p ? (idPorCodigo.get(p) ?? null) : null,
        codigo: l.codigo,
        titulo: l.titulo,
        responsavel_id: responsavel(l.responsavel_email),
        horas_orcadas: l.horas_orcadas,
        inicio: l.inicio,
        fim: l.fim,
        is_milestone: l.marco,
        is_fase: nivel === 1,
      };
    });
    const { data, error } = await supabase.from("wbs_items").insert(registros).select("id, codigo");
    if (error) return falha(`${mensagemErroBanco(error)} (níveis anteriores já foram gravados: confira a EAP).`);
    for (const r of (data ?? []) as { id: string; codigo: string }[]) idPorCodigo.set(r.codigo, r.id);
  }

  await renumerarOrdem(supabase, projectId);
  return sucesso({ criados: criar.length, atualizados: atualizar.length, semResponsavel });
}
