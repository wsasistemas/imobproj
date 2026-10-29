import { Skeleton } from "@/components/ui/skeleton";

export default function Carregando() {
  return (
    <div aria-busy="true">
      <div className="mb-6">
        <Skeleton className="mb-3 h-3.5 w-48" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-2 h-4 w-96 max-w-full" />
        <div className="mt-4 flex gap-2">
          <Skeleton className="h-9 w-24 rounded-full" />
          <Skeleton className="h-9 w-36 rounded-full" />
          <Skeleton className="h-9 w-28 rounded-full" />
        </div>
      </div>
      <Skeleton className="h-96 w-full max-w-3xl rounded-[12px]" />
    </div>
  );
}
