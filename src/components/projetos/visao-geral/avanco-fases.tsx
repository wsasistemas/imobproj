"use client";

import { useQuery } from "@tanstack/react-query";
import { Layers } from "lucide-react";
import Link from "next/link";
import { veProjetoInteiro } from "@/lib/projeto/permissoes";
import type { Papel } from "@/lib/projeto/tipos";
import { createClient } from "@/lib/supabase/client";
import { BarraAvanco } from "../barra-avanco";
import { dataCurta, numero } from "../formatos";
import { Bloco, ErroBloco, EsqueletoLinhas, Vazio } from "./bloco";

type Fase = {
  fase_id: string;
  codigo: string;
  titulo: string;
  inicio: string | null;
  fim: string | null;
  horas_orcadas: number;
  horas_aprovadas: number;
  percentual: number;
};

/** Barras de avanço por fase da EAP (v_fase_progress), com horas aprovadas/orçadas. */
export function AvancoFases({ projetoId, papel }: { projetoId: string; papel: Papel }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["projeto", projetoId, "visao-geral", "fases"],
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("v_fase_progress")
        .select("fase_id, codigo, titulo, inicio, fim, horas_orcadas, horas_aprovadas, percentual")
        .eq("project_id", projetoId)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as Fase[];
    },
  });

  return (
    <Bloco
      titulo="Avanço por fase"
      icone={Layers}
      cor="var(--sys-indigo)"
      acao={
        veProjetoInteiro(papel) ? (
          <Link href={`/projetos/${projetoId}/documentacao`} className="text-[12.5px] font-medium text-primary hover:underline">
            Ver EAP
          </Link>
        ) : undefined
      }
    >
      {isLoading ? (
        <EsqueletoLinhas linhas={4} />
      ) : isError ? (
        <ErroBloco tentar={() => refetch()} />
      ) : !data || data.length === 0 ? (
        <Vazio>
          {veProjetoInteiro(papel)
            ? "A EAP ainda não tem fases. O gerente marca os itens de primeiro nível como fase em Documentação e EAP."
            : "A EAP do projeto não fica visível para o seu papel."}
        </Vazio>
      ) : (
        <ul className="space-y-3.5">
          {data.map((f) => (
            <li key={f.fase_id}>
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[13px]">
                <span className="min-w-0 font-medium">
                  <span className="text-muted-foreground">{f.codigo}</span> {f.titulo}
                </span>
                <span className="text-[12px] text-muted-foreground tabular-nums">
                  {numero(f.horas_aprovadas)} / {numero(f.horas_orcadas)} h · {dataCurta(f.inicio)} a {dataCurta(f.fim)}
                </span>
              </div>
              <BarraAvanco valor={Number(f.percentual)} rotulo={`Avanço da fase ${f.codigo} ${f.titulo}`} />
            </li>
          ))}
        </ul>
      )}
    </Bloco>
  );
}
