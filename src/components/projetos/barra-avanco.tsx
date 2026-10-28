import { cn } from "@/lib/utils";
import { numero } from "./formatos";

/** Barra de avanço físico (mesmo visual da Página Inicial), com marcador opcional do planejado. */
export function BarraAvanco({
  valor,
  rotulo,
  planejado,
  mostrarValor = true,
  className,
}: {
  valor: number;
  rotulo: string;
  planejado?: number | null;
  mostrarValor?: boolean;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, Number(valor) || 0));
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div
        className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={rotulo}
      >
        <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${pct}%` }} />
        {planejado != null && (
          <div
            className="absolute inset-y-0 w-0.5 bg-foreground/60"
            style={{ left: `calc(${Math.min(100, planejado)}% - 1px)` }}
            title={`Planejado: ${numero(planejado)}%`}
            aria-hidden="true"
          />
        )}
      </div>
      {mostrarValor && <span className="w-12 text-right text-[13px] tabular-nums">{numero(pct)}%</span>}
    </div>
  );
}
