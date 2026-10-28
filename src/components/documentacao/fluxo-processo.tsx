"use client";

import { ArrowDown, ArrowRight, CircleStop, Play } from "lucide-react";
import { Fragment } from "react";
import type { Processo } from "./processo";

/**
 * Pré-visualização do fluxo: cartões em sequência ligados por setas; a decisão é um losango
 * depois da etapa escolhida, com os caminhos Sim/Não indicados. Só CSS/flex.
 */
export function FluxoProcesso({ processo }: { processo: Processo }) {
  const { etapas, decisao } = processo;
  const tituloDe = (id: string | null) => (id ? (etapas.find((e) => e.id === id)?.titulo || "Etapa sem título") : "Fim do processo");
  const numeroDe = (id: string | null) => (id ? etapas.findIndex((e) => e.id === id) + 1 : null);

  if (etapas.length === 0)
    return (
      <p className="rounded-[12px] border border-dashed border-border px-4 py-8 text-center text-[13px] text-muted-foreground">
        Adicione etapas para ver o fluxo.
      </p>
    );

  return (
    <div className="rounded-[12px] border border-border bg-table-head p-4">
      <ol aria-label="Fluxo do processo" className="flex flex-wrap items-center gap-2">
        <li className="flex items-center gap-2">
          <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-success-bg px-3 text-[12px] font-semibold text-success">
            <Play size={12} aria-hidden="true" /> Início
          </span>
          <ArrowRight size={16} className="text-muted-foreground" aria-hidden="true" />
        </li>
        {etapas.map((e, i) => {
          const ultima = i === etapas.length - 1;
          const temDecisao = decisao?.aposEtapaId === e.id;
          return (
            <Fragment key={e.id}>
              <li className="flex items-center gap-2">
                <div className="w-[170px] rounded-[10px] border border-border bg-card px-3 py-2 shadow-[var(--shadow-card)]">
                  <p className="text-[11px] font-semibold text-muted-foreground">Etapa {i + 1}</p>
                  <p className="line-clamp-2 text-[13px] font-medium">{e.titulo || "Etapa sem título"}</p>
                  {e.responsavel && <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{e.responsavel}</p>}
                </div>
                {(!ultima || temDecisao) && <ArrowRight size={16} className="text-muted-foreground" aria-hidden="true" />}
              </li>
              {temDecisao && decisao && (
                <li className="flex items-center gap-2">
                  <div className="flex flex-col items-center gap-1">
                    <div
                      className="flex size-[104px] rotate-45 items-center justify-center rounded-[10px] border-2 border-[var(--abobora)] bg-[var(--abobora-soft)]"
                      role="img"
                      aria-label={`Decisão: ${decisao.pergunta || "sem pergunta"}`}
                    >
                      <p className="line-clamp-3 w-[96px] -rotate-45 text-center text-[11.5px] leading-tight font-semibold">
                        {decisao.pergunta || "Pergunta?"}
                      </p>
                    </div>
                    <ArrowDown size={14} className="mt-2 text-muted-foreground" aria-hidden="true" />
                    <div className="grid gap-1 text-[11.5px]">
                      <span className="rounded-full bg-success-bg px-2 py-0.5 text-success">
                        <b>Sim</b> → {numeroDe(decisao.sim) ? `${numeroDe(decisao.sim)}. ` : ""}
                        {tituloDe(decisao.sim)}
                      </span>
                      <span className="rounded-full bg-danger-bg px-2 py-0.5 text-danger">
                        <b>Não</b> → {numeroDe(decisao.nao) ? `${numeroDe(decisao.nao)}. ` : ""}
                        {tituloDe(decisao.nao)}
                      </span>
                    </div>
                  </div>
                  {!ultima && <ArrowRight size={16} className="text-muted-foreground" aria-hidden="true" />}
                </li>
              )}
            </Fragment>
          );
        })}
        <li className="flex items-center gap-2">
          <ArrowRight size={16} className="text-muted-foreground" aria-hidden="true" />
          <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-neutral-bg px-3 text-[12px] font-semibold text-neutral">
            <CircleStop size={12} aria-hidden="true" /> Fim
          </span>
        </li>
      </ol>
    </div>
  );
}
