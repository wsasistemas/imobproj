"use client";

// Leituras do módulo com React Query + cliente Supabase do navegador (a RLS filtra o que cada papel vê).
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { ComentarioDocumento, Documento, ItemEap, PapelMembro, Perfil } from "@/lib/projeto/tipos";
import { compararCodigos } from "./utilidades";

export const chaves = {
  modulo: (projetoId: string) => ["projeto", projetoId, "documentacao"] as const,
  documentos: (projetoId: string) => ["projeto", projetoId, "documentacao", "documentos"] as const,
  comentarios: (projetoId: string, documentoId: string) =>
    ["projeto", projetoId, "documentacao", "comentarios", documentoId] as const,
  eap: (projetoId: string) => ["projeto", projetoId, "documentacao", "eap"] as const,
  membros: (projetoId: string) => ["projeto", projetoId, "documentacao", "membros"] as const,
};

/** Entrada do histórico de versões (documents.conteudo.versoes[]). */
export type VersaoDocumento = {
  versao: string;
  storage_path: string | null;
  nome_arquivo: string | null;
  evento: "envio" | "aprovacao";
  enviado_em: string;
  enviado_por: string | null;
};

export function versoesDoDocumento(doc: Pick<Documento, "conteudo">): VersaoDocumento[] {
  const v = doc.conteudo?.versoes;
  return Array.isArray(v) ? (v as VersaoDocumento[]) : [];
}

export function useDocumentos(projetoId: string) {
  return useQuery({
    queryKey: chaves.documentos(projetoId),
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("project_id", projetoId)
        .order("updated_at", { ascending: false });
      if (error) throw new Error("Não foi possível carregar os documentos.");
      return (data ?? []) as Documento[];
    },
  });
}

export type ComentarioComAutor = ComentarioDocumento & { autor: Pick<Perfil, "id" | "nome"> | null };

export function useComentarios(projetoId: string, documentoId: string | null) {
  return useQuery({
    queryKey: chaves.comentarios(projetoId, documentoId ?? "-"),
    enabled: !!documentoId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("document_comments")
        .select("id, document_id, autor_id, texto, resolvido, created_at, autor:profiles(id, nome)")
        .eq("document_id", documentoId!)
        .order("created_at", { ascending: true });
      if (error) throw new Error("Não foi possível carregar os comentários.");
      return (data ?? []) as unknown as ComentarioComAutor[];
    },
  });
}

export type MembroProjeto = { user_id: string; role: PapelMembro; nome: string; email: string | null };

export function useMembros(projetoId: string) {
  return useQuery({
    queryKey: chaves.membros(projetoId),
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("project_members")
        .select("user_id, role, profiles(id, nome, email)")
        .eq("project_id", projetoId)
        .eq("ativo", true);
      if (error) throw new Error("Não foi possível carregar a equipe do projeto.");
      const linhas = (data ?? []) as unknown as {
        user_id: string;
        role: PapelMembro;
        profiles: Pick<Perfil, "id" | "nome" | "email"> | null;
      }[];
      return linhas
        .map((m) => ({ user_id: m.user_id, role: m.role, nome: m.profiles?.nome ?? "Sem nome", email: m.profiles?.email ?? null }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")) as MembroProjeto[];
    },
  });
}

/** Item da EAP + avanço (v_wbs_progress) + profundidade na árvore. */
export type LinhaEap = ItemEap & {
  percentual: number;
  horas_aprovadas: number;
  nivel: number;
  temFilhos: boolean;
};

export function useEap(projetoId: string) {
  return useQuery({
    queryKey: chaves.eap(projetoId),
    queryFn: async () => {
      const supabase = createClient();
      const [itens, progresso] = await Promise.all([
        supabase
          .from("wbs_items")
          .select("id, project_id, parent_id, codigo, titulo, responsavel_id, horas_orcadas, inicio, fim, ordem, is_milestone, is_fase")
          .eq("project_id", projetoId),
        supabase.from("v_wbs_progress").select("wbs_item_id, percentual, horas_aprovadas").eq("project_id", projetoId),
      ]);
      if (itens.error) throw new Error("Não foi possível carregar a EAP.");
      const avanco = new Map(
        ((progresso.data ?? []) as { wbs_item_id: string; percentual: number; horas_aprovadas: number }[]).map((p) => [
          p.wbs_item_id,
          p,
        ]),
      );
      return montarArvore((itens.data ?? []) as ItemEap[], avanco);
    },
  });
}

/** Ordena em pré-ordem (pai antes dos filhos, irmãos por código) e calcula nível/filhos. */
export function montarArvore(
  itens: ItemEap[],
  avanco: Map<string, { percentual: number; horas_aprovadas: number }> = new Map(),
): LinhaEap[] {
  const ids = new Set(itens.map((i) => i.id));
  const filhos = new Map<string | null, ItemEap[]>();
  for (const i of itens) {
    const pai = i.parent_id && ids.has(i.parent_id) ? i.parent_id : null;
    const lista = filhos.get(pai) ?? [];
    lista.push(i);
    filhos.set(pai, lista);
  }
  const saida: LinhaEap[] = [];
  const visitar = (pai: string | null, nivel: number) => {
    const lista = (filhos.get(pai) ?? []).sort((a, b) => compararCodigos(a.codigo, b.codigo));
    for (const i of lista) {
      const p = avanco.get(i.id);
      saida.push({
        ...i,
        horas_orcadas: Number(i.horas_orcadas),
        percentual: Number(p?.percentual ?? 0),
        horas_aprovadas: Number(p?.horas_aprovadas ?? 0),
        nivel,
        temFilhos: (filhos.get(i.id)?.length ?? 0) > 0,
      });
      visitar(i.id, nivel + 1);
    }
  };
  visitar(null, 0);
  return saida;
}
