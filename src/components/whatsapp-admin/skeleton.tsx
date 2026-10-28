import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Formato da tela: banner, cartão de conexão, webhook/reenvio e tabela de sessões. */
export function SkeletonPainelOpenwa() {
  return (
    <div className="grid gap-4">
      <Skeleton className="h-16 w-full rounded-[12px]" />
      <Card>
        <CardContent className="grid gap-4">
          <div className="flex items-start justify-between gap-4">
            <div className="grid gap-2">
              <Skeleton className="h-5 w-52" />
              <Skeleton className="h-4 w-96 max-w-full" />
            </div>
            <Skeleton className="h-9 w-36" />
          </div>
          <Skeleton className="h-14 w-full rounded-[10px]" />
          <div className="flex flex-wrap gap-3">
            <Skeleton className="h-9 w-72" />
            <Skeleton className="h-9 w-60" />
            <Skeleton className="h-9 w-24" />
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-44 w-full rounded-[12px]" />
        <Skeleton className="h-44 w-full rounded-[12px]" />
      </div>
      <Card>
        <CardContent className="grid gap-3">
          <Skeleton className="h-5 w-48" />
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
