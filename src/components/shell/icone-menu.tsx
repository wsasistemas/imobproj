import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Ícone do menu no padrão HIG: símbolo branco num tile arredondado na cor de sistema. */
export function IconeMenu({
  icon: Icone,
  cor,
  tamanho = 22,
  className,
}: {
  icon: LucideIcon;
  cor: string;
  /** Lado do tile, em px. O símbolo ocupa ~60%. */
  tamanho?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("hig-tile", className)}
      style={{ ["--c" as string]: cor, width: tamanho, height: tamanho, borderRadius: Math.round(tamanho * 0.27) }}
    >
      <Icone size={Math.round(tamanho * 0.62)} strokeWidth={2.3} />
    </span>
  );
}
