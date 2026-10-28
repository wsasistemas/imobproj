import { Skeleton } from "@/components/ui/skeleton";

/** Esqueleto do cronograma: seletor, painel lateral e grade do calendário. */
export function EsqueletoCronograma() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Carregando cronograma">
      <Skeleton className="h-9 w-72 rounded-full" />
      <div className="grid gap-4 lg:grid-cols-[264px_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-72 rounded-[12px]" />
          <Skeleton className="h-56 rounded-[12px]" />
        </div>
        <div className="rounded-[12px] border border-border bg-card p-4">
          <div className="mb-4 flex items-center gap-2">
            <Skeleton className="h-9 w-16" />
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-6 w-48" />
          </div>
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 7 }, (_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
          <div className="mt-3 grid gap-2">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
