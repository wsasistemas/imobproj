import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { IconeMenu } from "@/components/shell/icone-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Moldura comum dos blocos da visão geral: título com ícone HIG, ação opcional e conteúdo. */
export function Bloco({
  titulo,
  icone,
  cor,
  acao,
  children,
  className,
}: {
  titulo: string;
  icone: LucideIcon;
  cor: string;
  acao?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={titulo}
      className={cn(
        "flex min-w-0 flex-col rounded-[12px] border border-border bg-card p-4 shadow-[var(--shadow-card)]",
        className,
      )}
    >
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[14px] font-semibold">
          <IconeMenu icon={icone} cor={cor} tamanho={26} />
          {titulo}
        </h2>
        {acao}
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

/** Texto de estado vazio/aviso dentro de um bloco. */
export function Vazio({ children }: { children: ReactNode }) {
  return <p className="py-4 text-[13px] text-muted-foreground">{children}</p>;
}

export function ErroBloco({ tentar }: { tentar: () => void }) {
  return (
    <p className="py-4 text-[13px] text-muted-foreground">
      Não foi possível carregar agora.{" "}
      <button type="button" onClick={tentar} className="font-medium text-primary hover:underline">
        Tentar de novo
      </button>
    </p>
  );
}

export function EsqueletoLinhas({ linhas = 3 }: { linhas?: number }) {
  return (
    <div className="space-y-2.5" aria-busy="true">
      {Array.from({ length: linhas }).map((_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  );
}
