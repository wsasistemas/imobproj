"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SITUACAO_OS } from "@/lib/projeto/tipos";
import { buscarHistorico, chavesOs, formatarDataHora } from "./dados";

/** Linha do tempo de os_status_history (mais recente primeiro). */
export function HistoricoOs({ projetoId, osId }: { projetoId: string; osId: string }) {
  const consulta = useQuery({
    queryKey: chavesOs.historico(projetoId, osId),
    queryFn: () => buscarHistorico(osId),
  });

  return (
    <section aria-labelledby="os-historico-titulo" className="grid gap-2">
      <h3 id="os-historico-titulo" className="rotulo-secao">
        Histórico
      </h3>
      {consulta.isPending ? (
        <div className="grid gap-3" aria-busy="true" aria-label="Carregando histórico">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : consulta.isError ? (
        <p role="alert" className="text-[13px] text-danger">
          {consulta.error.message}
        </p>
      ) : consulta.data.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">Nenhuma mudança de situação registrada.</p>
      ) : (
        <ol className="relative grid gap-4 border-l border-border pl-4">
          {consulta.data.map((h) => {
            const para = SITUACAO_OS[h.para];
            const de = h.de ? SITUACAO_OS[h.de] : null;
            return (
              <li key={h.id} className="relative">
                <span
                  aria-hidden="true"
                  className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-card bg-primary"
                />
                <div className="flex flex-wrap items-center gap-1.5">
                  {de ? (
                    <>
                      <Badge variant={de.variant}>{de.label}</Badge>
                      <ArrowRight className="size-3.5 text-muted-foreground" aria-label="para" />
                    </>
                  ) : null}
                  <Badge variant={para.variant}>{para.label}</Badge>
                </div>
                <p className="mt-1 text-[12.5px] text-muted-foreground">
                  {h.autor?.nome ?? "Sistema"} · <time dateTime={h.created_at}>{formatarDataHora(h.created_at)}</time>
                </p>
                {h.comentario && (
                  <p className="mt-1 rounded-md bg-muted px-2.5 py-1.5 text-[13px] whitespace-pre-line">{h.comentario}</p>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
