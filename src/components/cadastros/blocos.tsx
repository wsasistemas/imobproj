"use client";

import type { ReactNode } from "react";
import { IconeMenu } from "@/components/shell/icone-menu";
import type { ChaveIcone } from "@/components/shell/icones-menu.data";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";

export function EstadoVazio({ titulo, texto, icone, acao }: { titulo: string; texto: string; icone: ChaveIcone; acao?: ReactNode }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
        <IconeMenu icon={Users} cor="var(--sys-teal)" colorido={icone} tamanho={44} />
        <h2 className="mt-2 text-[15px] font-semibold">{titulo}</h2>
        <p className="max-w-md text-[13.5px] text-muted-foreground">{texto}</p>
        {acao && <div className="mt-2">{acao}</div>}
      </CardContent>
    </Card>
  );
}

export function ErroBloco({ texto, onTentar }: { texto: string; onTentar: () => void }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center" role="alert">
        <p className="text-[13.5px] text-danger">{texto}</p>
        <Button variant="outline" size="sm" onClick={onTentar}>
          Tentar de novo
        </Button>
      </CardContent>
    </Card>
  );
}

/** Pílula de filtro (mesmo visual das abas do cabeçalho). */
export function PilulaFiltro({ ativa, onClick, children }: { ativa: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativa}
      className={cn(
        "min-h-9 rounded-full border px-3.5 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        ativa ? "border-primary bg-primary-soft font-semibold text-primary" : "border-border bg-card text-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

/** Rótulo de seção (11.5px, maiúsculas). */
export function RotuloSecao({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-[11.5px] font-bold uppercase tracking-[0.07em] text-muted-foreground", className)}>{children}</p>;
}

export function ErroCampo({ id, mensagem }: { id: string; mensagem?: string }) {
  if (!mensagem) return null;
  return (
    <p id={id} className="text-[13px] text-danger">
      {mensagem}
    </p>
  );
}

/** Lista + painel lateral (formulário), como no mockup aprovado. */
export function SkeletonListaPainel({ linhas = 5 }: { linhas?: number }) {
  return (
    <div aria-busy="true" className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <Card className="p-0">
        <div className="flex gap-3 border-b border-border p-4">
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-9 w-28 rounded-full" />
        </div>
        <div className="grid gap-3 p-4">
          {Array.from({ length: linhas }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </Card>
      <Card className="p-4">
        <div className="grid gap-4">
          <Skeleton className="h-6 w-48" />
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </Card>
    </div>
  );
}
