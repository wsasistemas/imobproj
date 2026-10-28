"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Activity, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { pode } from "@/lib/projeto/permissoes";
import { ROTULO_PAPEL, type Papel, type PapelMembro, type RegistroAuditoria } from "@/lib/projeto/tipos";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Bloco, ErroBloco, EsqueletoLinhas, Vazio } from "./bloco";
import { fraseAuditoria } from "./frases-auditoria";
import { Avatar } from "./pessoas";

const LIMITE = 20;

type Autor = { nome: string; papel: string | null };
type Feed = { itens: RegistroAuditoria[]; autores: Record<string, Autor> };

/** Nome e papel (no projeto) de cada autor. Super admin não é membro: aparece como "Super admin". */
async function buscarAutores(projetoId: string, ids: string[]): Promise<Record<string, Autor>> {
  if (ids.length === 0) return {};
  const supabase = createClient();
  const [perfis, membros] = await Promise.all([
    supabase.from("profiles").select("id, nome, is_super_admin").in("id", ids),
    supabase.from("project_members").select("user_id, role").eq("project_id", projetoId).in("user_id", ids),
  ]);
  const papelDe = new Map(((membros.data ?? []) as { user_id: string; role: PapelMembro }[]).map((m) => [m.user_id, m.role]));
  const autores: Record<string, Autor> = {};
  for (const p of (perfis.data ?? []) as { id: string; nome: string; is_super_admin: boolean }[]) {
    const papel = papelDe.get(p.id);
    autores[p.id] = { nome: p.nome || "Sem nome", papel: papel ? ROTULO_PAPEL[papel] : p.is_super_admin ? ROTULO_PAPEL.super_admin : null };
  }
  return autores;
}

/**
 * Feed de atividade recente (audit_log, últimos 20) com Supabase Realtime: INSERTs do projeto
 * entram no topo. A RLS só libera audit_log a super admin, diretor e gerente.
 */
export function FeedAtividade({ projetoId, papel }: { projetoId: string; papel: Papel }) {
  const permitido = pode(papel, "auditoria_ver");
  const queryClient = useQueryClient();
  const chave = ["projeto", projetoId, "visao-geral", "atividade"] as const;
  const [novos, setNovos] = useState<Set<string>>(() => new Set());
  const [aoVivo, setAoVivo] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: chave,
    queryFn: async (): Promise<Feed> => {
      const { data, error } = await createClient()
        .from("audit_log")
        .select("id, project_id, tabela, registro_id, acao, autor_id, dados, created_at")
        .eq("project_id", projetoId)
        .order("created_at", { ascending: false })
        .limit(LIMITE);
      if (error) throw error;
      const itens = (data ?? []) as RegistroAuditoria[];
      const ids = [...new Set(itens.map((i) => i.autor_id).filter((x): x is string => !!x))];
      return { itens, autores: await buscarAutores(projetoId, ids) };
    },
    enabled: permitido,
  });

  useEffect(() => {
    if (!permitido) return;
    const supabase = createClient();
    const canal = supabase
      .channel(`audit-log-${projetoId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "audit_log", filter: `project_id=eq.${projetoId}` },
        async (payload) => {
          const item = payload.new as RegistroAuditoria;
          const atual = queryClient.getQueryData<Feed>(["projeto", projetoId, "visao-geral", "atividade"]);
          let autores = atual?.autores ?? {};
          if (item.autor_id && !autores[item.autor_id]) {
            autores = { ...autores, ...(await buscarAutores(projetoId, [item.autor_id])) };
          }
          queryClient.setQueryData<Feed>(["projeto", projetoId, "visao-geral", "atividade"], (antes) => {
            const itens = antes?.itens ?? [];
            if (itens.some((i) => i.id === item.id)) return antes;
            return { itens: [item, ...itens].slice(0, LIMITE), autores: { ...(antes?.autores ?? {}), ...autores } };
          });
          setNovos((s) => new Set(s).add(item.id));
          // Os números da visão geral (OS, avanço, fases, marcos) podem ter mudado com o evento.
          queryClient.invalidateQueries({
            predicate: (q) =>
              q.queryKey[0] === "projeto" &&
              q.queryKey[1] === projetoId &&
              q.queryKey[2] === "visao-geral" &&
              q.queryKey[3] !== "atividade",
          });
        },
      )
      .subscribe((status) => setAoVivo(status === "SUBSCRIBED"));
    return () => {
      supabase.removeChannel(canal);
    };
  }, [permitido, projetoId, queryClient]);

  return (
    <Bloco
      titulo="Atividade recente"
      icone={Activity}
      cor="var(--sys-pink)"
      acao={
        permitido ? (
          <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground" aria-live="polite">
            <span
              className={cn("size-2 rounded-full", aoVivo ? "animate-pulse bg-success" : "bg-muted-foreground/40")}
              aria-hidden="true"
            />
            {aoVivo ? "Ao vivo" : "Conectando…"}
          </span>
        ) : undefined
      }
    >
      {!permitido ? (
        <div className="flex items-start gap-2.5 rounded-[10px] bg-muted/60 px-3 py-3 text-[13px] text-muted-foreground">
          <Lock size={16} className="mt-px shrink-0" aria-hidden="true" />
          <p>O histórico de alterações do projeto fica visível só para diretor, gerente e super admin.</p>
        </div>
      ) : isLoading ? (
        <EsqueletoLinhas linhas={6} />
      ) : isError ? (
        <ErroBloco tentar={() => refetch()} />
      ) : !data || data.itens.length === 0 ? (
        <Vazio>Nenhuma alteração registrada ainda. Mudanças em OS, documentos, EAP, atas e no projeto aparecem aqui em tempo real.</Vazio>
      ) : (
        <ol className="space-y-3" aria-label="Últimas alterações">
          {data.itens.map((item) => {
            const autor = item.autor_id ? data.autores[item.autor_id] : undefined;
            const quando = new Date(item.created_at);
            return (
              <li
                key={item.id}
                className={cn(
                  "flex items-start gap-2.5 rounded-[8px]",
                  novos.has(item.id) && "animate-in fade-in slide-in-from-top-2 bg-primary-soft/60 duration-500",
                )}
              >
                {autor && item.autor_id ? (
                  <Avatar id={item.autor_id} nome={autor.nome} tamanho={28} />
                ) : (
                  <span className="inline-grid size-7 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground" aria-hidden="true">
                    <Activity size={14} />
                  </span>
                )}
                <div className="min-w-0 text-[13px]">
                  <p>
                    <b className="font-semibold">{autor?.nome ?? (item.autor_id ? "Alguém" : "Sistema")}</b>
                    {autor?.papel && <span className="text-muted-foreground"> ({autor.papel})</span>} {fraseAuditoria(item)}
                  </p>
                  <time dateTime={item.created_at} title={quando.toLocaleString("pt-BR")} className="text-[12px] text-muted-foreground">
                    {formatDistanceToNow(quando, { addSuffix: true, locale: ptBR })}
                  </time>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Bloco>
  );
}
