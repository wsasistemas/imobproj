import { Skeleton } from "@/components/ui/skeleton";

function EsqueletoBloco({ altura }: { altura: string }) {
  return (
    <div className="space-y-3 rounded-[12px] border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Skeleton className="size-[26px] rounded-[7px]" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className={`${altura} w-full`} />
    </div>
  );
}

// Esqueleto da visão geral (o cabeçalho do projeto vem do layout).
export default function CarregandoVisaoGeral() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Carregando visão geral do projeto">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <EsqueletoBloco key={i} altura="h-20" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <EsqueletoBloco altura="h-48" />
        <EsqueletoBloco altura="h-48" />
        <EsqueletoBloco altura="h-48" />
      </div>
      <EsqueletoBloco altura="h-64" />
    </div>
  );
}
