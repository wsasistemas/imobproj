"use client";

import { AlertTriangle } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CalendarioCronograma } from "./calendario";
import { useDadosCronograma } from "./dados";
import { EsqueletoCronograma } from "./esqueleto";
import { GanttCronograma } from "./gantt";

type Visao = "dia" | "semana" | "mes" | "gantt";

const VISOES: { valor: Visao; rotulo: string }[] = [
  { valor: "dia", rotulo: "Dia" },
  { valor: "semana", rotulo: "Semana" },
  { valor: "mes", rotulo: "Mês" },
  { valor: "gantt", rotulo: "Gantt" },
];

function lerVisao(v: string | null): Visao {
  return VISOES.some((o) => o.valor === v) ? (v as Visao) : "semana";
}

/** Tela do cronograma: seletor segmentado (estado em ?visao=) + calendário ou Gantt. */
export function Cronograma({
  projetoId,
  projetoCodigo,
  podeEditar,
  podeLinhaBase,
}: {
  projetoId: string;
  projetoCodigo: string;
  podeEditar: boolean;
  podeLinhaBase: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const busca = useSearchParams();
  const visao = lerVisao(busca.get("visao"));
  const [data, setData] = useState(() => new Date());
  const consulta = useDadosCronograma(projetoId);

  function trocarVisao(v: Visao) {
    const params = new URLSearchParams(busca.toString());
    params.set("visao", v);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  if (consulta.isPending) return <EsqueletoCronograma />;

  return (
    <div className="grid gap-4">
      <div className="cron-sem-impressao flex flex-wrap items-center gap-3">
        <div
          role="group"
          aria-label="Visão do cronograma"
          className="inline-flex rounded-full border border-border bg-card p-1 shadow-[var(--shadow-card)]"
        >
          {VISOES.map((o) => (
            <button
              key={o.valor}
              type="button"
              aria-pressed={visao === o.valor}
              onClick={() => trocarVisao(o.valor)}
              className={cn(
                "inline-flex h-9 min-w-[72px] items-center justify-center rounded-full px-4 text-[13px] font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                visao === o.valor
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {o.rotulo}
            </button>
          ))}
        </div>
      </div>

      {consulta.isError ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <AlertTriangle size={36} className="text-warning" aria-hidden="true" />
            <h2 className="text-[17px] font-semibold">Não foi possível carregar o cronograma.</h2>
            <p className="max-w-md text-muted-foreground">Verifique a conexão e tente de novo.</p>
            <Button variant="outline" onClick={() => consulta.refetch()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      ) : visao === "gantt" ? (
        <GanttCronograma
          projetoId={projetoId}
          projetoCodigo={projetoCodigo}
          dados={consulta.data}
          podeLinhaBase={podeLinhaBase}
        />
      ) : (
        <CalendarioCronograma
          projetoId={projetoId}
          dados={consulta.data}
          podeEditar={podeEditar}
          visao={visao}
          data={data}
          onData={setData}
        />
      )}
    </div>
  );
}
