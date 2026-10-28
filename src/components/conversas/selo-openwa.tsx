"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { buscarStatusOpenWa, chavesConversas, formatarTelefone, LIMITE_SINAL_MS } from "./dados";

function tempoDesde(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${s % 60} s`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h} h` : `${Math.floor(h / 24)} dias`;
}

/**
 * Selo de saúde do OpenWA (fn_wa_status). Verde: sessão 'conectado' e heartbeat nos últimos 2 min.
 * O contador de segundos anda a cada 1 s; o status é relido a cada 20 s.
 */
export function SeloOpenWa({ projetoId }: { projetoId: string }) {
  const { data, isPending, isError } = useQuery({
    queryKey: chavesConversas.status(projetoId),
    queryFn: () => buscarStatusOpenWa(projetoId),
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  if (isPending) {
    return <span className="inline-flex h-7 w-52 animate-pulse rounded-full bg-muted" aria-hidden="true" />;
  }

  const hb = data?.last_heartbeat ? new Date(data.last_heartbeat).getTime() : null;
  const desde = hb === null ? null : agora - hb;
  const conectado = !!data && data.status === "conectado" && desde !== null && desde <= LIMITE_SINAL_MS;

  let texto: string;
  let detalhe: string | undefined;
  if (isError) texto = "OpenWA indisponível";
  else if (!data) {
    texto = "OpenWA não configurado";
    detalhe = "O super admin configura a sessão em Administração › WhatsApp OpenWA.";
  } else if (conectado) texto = `OpenWA conectado · sinal há ${tempoDesde(desde ?? 0)}`;
  else {
    texto = "OpenWA desconectado";
    detalhe =
      desde === null
        ? "Sem sinal registrado."
        : `Último sinal há ${tempoDesde(desde)}. As mensagens ficam na fila e são reenviadas quando voltar.`;
  }

  return (
    <span
      title={[data ? `Número ${formatarTelefone(data.numero)}` : null, detalhe].filter(Boolean).join(" · ") || undefined}
      className={cn(
        "inline-flex h-7 items-center gap-2 rounded-full px-3 text-[12.5px] font-semibold tabular-nums",
        conectado ? "bg-success-bg text-success" : "bg-danger-bg text-danger",
      )}
    >
      <span className="relative flex size-2" aria-hidden="true">
        {conectado && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60 motion-reduce:hidden" />
        )}
        <span className="relative inline-flex size-2 rounded-full bg-current" />
      </span>
      <span aria-hidden="true">{texto}</span>
      {/* Leitor de tela: só a mudança de estado, sem o contador de segundos. */}
      <span role="status" className="sr-only">
        {conectado ? "OpenWA conectado" : texto}
      </span>
    </span>
  );
}
