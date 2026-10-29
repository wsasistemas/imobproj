import { Skeleton } from "@/components/ui/skeleton";

export default function Carregando() {
  return (
    <div aria-busy="true">
      <div className="mb-6">
        <Skeleton className="mb-3 h-3.5 w-56" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="mt-2 h-4 w-[30rem] max-w-full" />
      </div>
      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <Skeleton className="h-96 w-full rounded-[12px]" />
        <Skeleton className="h-96 w-full rounded-[12px]" />
      </div>
      <Skeleton className="mt-4 h-40 w-full rounded-[12px]" />
      <Skeleton className="mt-4 h-40 w-full rounded-[12px]" />
    </div>
  );
}
