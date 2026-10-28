import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function CarregandoMedicao() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Carregando medição do mês">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-10 w-80" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[76px] rounded-[12px]" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {[0, 1].map((i) => (
          <Card key={i} className="gap-3 p-4">
            <Skeleton className="h-5 w-32" />
            {[0, 1, 2, 3].map((j) => (
              <Skeleton key={j} className="h-5 w-full" />
            ))}
          </Card>
        ))}
      </div>
    </div>
  );
}
