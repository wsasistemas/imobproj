import { Skeleton } from "@/components/ui/skeleton";

export default function Carregando() {
  return (
    <div aria-busy="true">
      <div className="mb-6">
        <Skeleton className="mb-3 h-3.5 w-48" />
        <Skeleton className="h-8 w-56" />
        <Skeleton className="mt-2 h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Skeleton className="h-80 w-full rounded-[12px]" />
        <Skeleton className="h-80 w-full rounded-[12px]" />
      </div>
    </div>
  );
}
