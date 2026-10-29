import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconeColorido } from "./icone-colorido";
import type { ChaveIcone } from "./icones-menu.data";

/**
 * Ícone do menu. Com `colorido`, desenha o ícone Fluent Color do Portal Atendimento; sem ele, o padrão HIG:
 * símbolo branco num tile arredondado na cor de sistema.
 */
export function IconeMenu({
  icon: Icone,
  cor,
  colorido,
  tamanho = 22,
  className,
}: {
  icon: LucideIcon;
  cor: string;
  colorido?: ChaveIcone;
  /** Lado do tile, em px. O símbolo ocupa ~60%. */
  tamanho?: number;
  className?: string;
}) {
  if (colorido)
    return (
      <span aria-hidden="true" className={cn("inline-flex shrink-0", className)} style={{ width: tamanho, height: tamanho }}>
        <IconeColorido nome={colorido} tamanho={tamanho} />
      </span>
    );
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
