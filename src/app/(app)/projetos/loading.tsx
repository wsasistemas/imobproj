import { EsqueletoLista } from "@/components/projetos/lista-projetos";
import { Skeleton } from "@/components/ui/skeleton";

export default function CarregandoProjetos() {
  return (
    <div aria-busy="true" aria-label="Carregando projetos">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-28 rounded-full" />
        ))}
      </div>
      <EsqueletoLista />
    </div>
  );
}
