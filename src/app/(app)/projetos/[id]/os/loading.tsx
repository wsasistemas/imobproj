import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function CarregandoOs() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Carregando Ordens de Serviço">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {[64, 92, 92, 108, 140, 92, 92].map((w, i) => (
            <Skeleton key={i} className="h-9 rounded-full" style={{ width: w }} />
          ))}
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
      <Card className="gap-0 py-0">
        <div className="border-b border-border p-3">
          <Skeleton className="h-9 w-full max-w-sm" />
        </div>
        <div className="h-10 border-b border-border bg-table-head" />
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-0">
            <Skeleton className="h-4 w-10" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="hidden h-4 w-40 lg:block" />
            <Skeleton className="hidden h-4 w-28 md:block" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
        ))}
      </Card>
    </div>
  );
}
