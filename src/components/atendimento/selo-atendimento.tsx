"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, Headset } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";
import { assumirConversa, encerrarAtendimento } from "@/app/(app)/atendimento/acoes";
import { executar } from "@/components/cadastros/util";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

type Situacao = {
  setor: string | null;
  atendimento: { id: string; ticket: number; status: "fila" | "atendimento"; atendente_id: string | null; atendente: string | null } | null;
};

const chave = (grupoId: string) => ["atendimento", "conversa", grupoId] as const;

/**
 * Cabeçalho da conversa (Fase 4): setor da fila, quem está atendendo e o botão "Assumir".
 * Banco sem a Fase 4: não mostra nada (a tela de Conversas continua igual).
 */
export function SeloAtendimento({ grupoId, userId }: { grupoId: string; userId: string }) {
  const queryClient = useQueryClient();
  const situacao = useQuery({
    queryKey: chave(grupoId),
    queryFn: async (): Promise<Situacao> => {
      const supabase = createClient();
      const [{ data: g, error: e1 }, { data: a, error: e2 }] = await Promise.all([
        supabase.from("wa_groups").select("setor_id, setores(nome)").eq("id", grupoId).maybeSingle(),
        supabase
          .from("atendimentos")
          .select("id, ticket, status, atendente_id, atendente:profiles!atendimentos_atendente_id_fkey(nome)")
          .eq("group_id", grupoId)
          .neq("status", "encerrado")
          .maybeSingle(),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      const setor = (g as { setores: { nome: string } | null } | null)?.setores?.nome ?? null;
      const at = a as { id: string; ticket: number; status: "fila" | "atendimento"; atendente_id: string | null; atendente: { nome: string } | null } | null;
      return { setor, atendimento: at ? { ...at, atendente: at.atendente?.nome ?? null } : null };
    },
    retry: false,
  });

  useEffect(() => {
    const supabase = createClient();
    const canal = supabase
      .channel(`atendimento-conversa-${grupoId}`)
      .on("postgres_changes", { event: "*", schema: "imobproj", table: "atendimentos", filter: `group_id=eq.${grupoId}` }, () =>
        void queryClient.invalidateQueries({ queryKey: chave(grupoId) }),
      )
      .subscribe();
    return () => void supabase.removeChannel(canal);
  }, [grupoId, queryClient]);

  const mAssumir = useMutation({
    mutationFn: () => executar(assumirConversa(grupoId)),
    onSuccess: () => toast.success("Conversa assumida. Ela aparece como sua no Monitor."),
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: chave(grupoId) }),
  });
  const mEncerrar = useMutation({
    mutationFn: (id: string) => executar(encerrarAtendimento(id)),
    onSuccess: () => toast.success("Atendimento encerrado"),
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: chave(grupoId) }),
  });

  const d = situacao.data;
  if (!d || !d.setor) return null;
  const at = d.atendimento;
  const meu = at?.status === "atendimento" && at.atendente_id === userId;
  const texto = !at ? d.setor : at.status === "fila" ? `${d.setor} · na fila (#${at.ticket})` : `${d.setor} · ${meu ? "com você" : `com ${at.atendente ?? "—"}`}`;

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <span
        className="hidden max-w-56 items-center gap-1.5 truncate rounded-full border border-border bg-table-head px-2.5 py-1 text-[12px] font-medium text-muted-foreground 2xl:inline-flex"
        title={texto}
      >
        <Headset size={13} aria-hidden="true" style={{ color: "var(--sys-teal)" }} />
        <span className="truncate">{texto}</span>
      </span>
      {meu ? (
        <Button size="sm" variant="outline" disabled={mEncerrar.isPending} onClick={() => at && mEncerrar.mutate(at.id)}>
          <CheckCheck aria-hidden="true" />
          Encerrar
        </Button>
      ) : (
        <Button size="sm" disabled={mAssumir.isPending} onClick={() => mAssumir.mutate()} aria-label={`Assumir a conversa (${texto})`}>
          Assumir
        </Button>
      )}
    </div>
  );
}
