import { SkeletonTabelaMembros } from "@/components/equipe/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function CarregandoEquipe() {
  return (
    <div aria-busy="true">
      <div className="mb-6">
        <Skeleton className="mb-3 h-3.5 w-64" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="mt-2 h-4 w-96 max-w-full" />
        <div className="mt-5 flex gap-2">
          <Skeleton className="h-8 w-24 rounded-full" />
          <Skeleton className="h-8 w-44 rounded-full" />
        </div>
      </div>
      <SkeletonTabelaMembros comSeletor />
    </div>
  );
}
