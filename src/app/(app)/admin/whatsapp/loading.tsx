import { SkeletonPainelOpenwa } from "@/components/whatsapp-admin/skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function CarregandoWhatsapp() {
  return (
    <div aria-busy="true">
      <div className="mb-6">
        <Skeleton className="mb-3 h-3.5 w-64" />
        <Skeleton className="h-8 w-60" />
        <Skeleton className="mt-2 h-4 w-96 max-w-full" />
      </div>
      <SkeletonPainelOpenwa />
    </div>
  );
}
