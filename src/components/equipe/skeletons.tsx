import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Esqueleto da tabela de membros (opcionalmente com os seletores de projeto e papel). */
export function SkeletonTabelaMembros({ comSeletor = false }: { comSeletor?: boolean }) {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Carregando a equipe">
      {comSeletor && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex gap-3">
            <Skeleton className="h-9 w-[300px]" />
            <Skeleton className="h-9 w-[200px]" />
          </div>
          <Skeleton className="h-9 w-40" />
        </div>
      )}
      <Card className="gap-0 p-0">
        <Skeleton className="h-10 rounded-none" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-t border-border px-4 py-3">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-52" />
            <Skeleton className="h-6 w-28 rounded-full" />
            <Skeleton className="h-5 w-10 rounded-full" />
            <Skeleton className="ml-auto h-4 w-20" />
          </div>
        ))}
      </Card>
    </div>
  );
}

