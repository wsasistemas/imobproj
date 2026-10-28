"use client";

import { Info } from "lucide-react";
import { veProjetoInteiro } from "@/lib/projeto/permissoes";
import type { Papel } from "@/lib/projeto/tipos";
import { AvancoFases } from "./avanco-fases";
import { FeedAtividade } from "./feed-atividade";
import { KpisProjeto } from "./kpis";
import { PessoasProjeto } from "./pessoas";
import { ProximosEventos } from "./proximos";

/** Conteúdo da aba "Visão geral" (o cabeçalho e as abas vêm do layout do projeto). */
export function VisaoGeralProjeto({ projetoId, papel }: { projetoId: string; papel: Papel }) {
  return (
    <div className="space-y-4">
      {!veProjetoInteiro(papel) && (
        <div
          role="note"
          className="flex items-start gap-3 rounded-[12px] border border-banner-info-border bg-banner-info-bg px-4 py-3 text-[13.5px]"
        >
          <Info size={18} className="mt-px shrink-0 text-info" aria-hidden="true" />
          <p>
            Como <b>prestador</b>, você vê os dados do projeto ligados às <b>OS atribuídas a você</b>. EAP, atas e
            histórico completo ficam com a equipe do projeto.
          </p>
        </div>
      )}

      <KpisProjeto projetoId={projetoId} papel={papel} />

      <div className="grid gap-4 lg:grid-cols-3">
        <AvancoFases projetoId={projetoId} papel={papel} />
        <ProximosEventos projetoId={projetoId} papel={papel} />
        <PessoasProjeto projetoId={projetoId} />
      </div>

      <FeedAtividade projetoId={projetoId} papel={papel} />
    </div>
  );
}
