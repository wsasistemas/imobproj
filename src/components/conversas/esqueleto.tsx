import "./conversas.css";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Altura útil da central (cabeçalho do app + cabeçalho do projeto ficam acima). */
export const ALTURA_CENTRAL = "h-[calc(100dvh-18.5rem)] min-h-[540px]";

export function EsqueletoListaGrupos() {
  return (
    <div className="grid" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-border px-3 py-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="grid flex-1 gap-1.5">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-full" />
          </div>
          <Skeleton className="h-3 w-8" />
        </div>
      ))}
    </div>
  );
}

export function EsqueletoMensagens() {
  const linhas = [
    { lado: "in", w: "w-56" },
    { lado: "in", w: "w-72" },
    { lado: "out", w: "w-64" },
    { lado: "in", w: "w-40" },
    { lado: "out", w: "w-80" },
    { lado: "out", w: "w-48" },
  ];
  return (
    <div className="flex flex-col gap-2 p-4" aria-hidden="true">
      {linhas.map((l, i) => (
        <div key={i} className={cn("flex", l.lado === "out" ? "justify-end" : "justify-start")}>
          <Skeleton className={cn("h-12 max-w-[80%] rounded-lg bg-(--cv-balao)/70", l.w)} />
        </div>
      ))}
    </div>
  );
}

export function EsqueletoConversas() {
  return (
    <div className="cv-raiz grid gap-3" aria-busy="true" aria-label="Carregando conversas">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-7 w-56 rounded-full" />
      </div>
      <div
        className={cn(
          "grid overflow-hidden rounded-xl border border-border bg-card lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_300px]",
          ALTURA_CENTRAL,
        )}
      >
        <div className="border-r border-border">
          <div className="grid gap-2 border-b border-border p-3">
            <Skeleton className="h-9 w-full" />
            <div className="flex gap-1.5">
              {[48, 84, 80, 84].map((w, i) => (
                <Skeleton key={i} className="h-7 rounded-full" style={{ width: w }} />
              ))}
            </div>
          </div>
          <EsqueletoListaGrupos />
        </div>
        <div className="cv-mensagens hidden flex-col lg:flex">
          <div className="flex h-15 items-center gap-3 border-b border-border bg-card px-4">
            <Skeleton className="size-10 rounded-full" />
            <Skeleton className="h-4 w-48" />
          </div>
          <div className="flex-1">
            <EsqueletoMensagens />
          </div>
        </div>
        <div className="hidden gap-3 border-l border-border p-4 xl:grid xl:content-start">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="mt-4 h-24 w-full" />
        </div>
      </div>
    </div>
  );
}
