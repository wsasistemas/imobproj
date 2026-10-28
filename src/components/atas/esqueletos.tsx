import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function ListaSkeleton({ linhas = 5 }: { linhas?: number }) {
  return (
    <div aria-busy="true" aria-label="Carregando atas">
      {Array.from({ length: linhas }, (_, i) => (
        <div key={i} className="grid gap-2 border-b border-border px-4 py-3 last:border-0">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

export function DetalheSkeleton() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Carregando ata">
      <Card className="gap-3 p-5">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <div className="flex gap-2 pt-2">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-36" />
        </div>
      </Card>
      {[4, 3, 3].map((n, i) => (
        <Card key={i} className="gap-3 p-5">
          <Skeleton className="h-3 w-32" />
          {Array.from({ length: n }, (_, j) => (
            <Skeleton key={j} className="h-9 w-full" />
          ))}
        </Card>
      ))}
    </div>
  );
}

/** Tela inteira (loading.tsx da rota). */
export function AtasSkeleton() {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
      <Card className="gap-0 py-0">
        <div className="grid gap-3 border-b border-border p-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-9 w-28" />
          </div>
          <Skeleton className="h-9 w-full" />
        </div>
        <ListaSkeleton />
      </Card>
      <div className="hidden lg:block">
        <DetalheSkeleton />
      </div>
    </div>
  );
}
