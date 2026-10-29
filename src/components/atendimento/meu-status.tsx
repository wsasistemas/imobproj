"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Coffee, Power, Wifi } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";
import { atualizarMeuStatus } from "@/app/(app)/atendimento/acoes";
import { executar } from "@/components/cadastros/util";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Status = { online: boolean; pausa: boolean; atualizado_em: string };

export const chaveMeuStatus = (userId: string) => ["atendimento", "meu-status", userId] as const;

const SINAL_MS = 60_000;

/**
 * Meu status de atendimento (online / pausa / offline). Enquanto estiver online, a tela manda um sinal por minuto:
 * sem sinal por 5 min, a pessoa passa a contar como offline no Monitor e na distribuição automática.
 */
export function MeuStatus({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: chaveMeuStatus(userId),
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("atendente_status")
        .select("online, pausa, atualizado_em")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return (data as Status | null) ?? { online: false, pausa: false, atualizado_em: new Date(0).toISOString() };
    },
  });

  const mudar = useMutation({
    mutationFn: (novo: { online?: boolean; pausa?: boolean }) => executar(atualizarMeuStatus(novo)),
    onSuccess: (s) => {
      queryClient.setQueryData(chaveMeuStatus(userId), { ...s, atualizado_em: new Date().toISOString() });
      toast.success(!s.online ? "Você está offline" : s.pausa ? "Pausa iniciada" : "Você está online para atender");
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["atendimento", "monitor"] }),
  });

  const online = status.data?.online ?? false;
  const pausa = status.data?.pausa ?? false;

  useEffect(() => {
    if (!online) return;
    void atualizarMeuStatus({});
    const id = window.setInterval(() => void atualizarMeuStatus({}), SINAL_MS);
    return () => window.clearInterval(id);
  }, [online]);

  if (status.isPending || status.isError) return null;

  const rotulo = !online ? "Offline" : pausa ? "Em pausa" : "Online";
  const cor = !online ? "var(--sys-red)" : pausa ? "var(--sys-orange)" : "var(--sys-green)";

  return (
    <div role="group" aria-label="Meu status de atendimento" className="flex flex-wrap items-center gap-2 rounded-[10px] border border-border bg-card px-3 py-1.5">
      <span className="inline-flex items-center gap-2 text-[13px] font-semibold" aria-live="polite">
        <i aria-hidden="true" className="inline-block size-2.5 rounded-full" style={{ background: cor }} />
        Meu status: {rotulo}
      </span>
      {!online ? (
        <Button size="sm" disabled={mudar.isPending} onClick={() => mudar.mutate({ online: true, pausa: false })}>
          <Wifi aria-hidden="true" />
          Ficar online
        </Button>
      ) : (
        <>
          <Button
            size="sm"
            variant="outline"
            disabled={mudar.isPending}
            onClick={() => mudar.mutate({ pausa: !pausa })}
            className={cn(pausa && "border-[var(--sys-orange)]")}
          >
            <Coffee aria-hidden="true" />
            {pausa ? "Voltar da pausa" : "Pausar"}
          </Button>
          <Button size="sm" variant="ghost" disabled={mudar.isPending} onClick={() => mudar.mutate({ online: false })}>
            <Power aria-hidden="true" />
            Ficar offline
          </Button>
        </>
      )}
    </div>
  );
}
