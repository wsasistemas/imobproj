"use client";

import { AlertTriangle, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { IconeMenu } from "@/components/shell/icone-menu";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Estado vazio: o que é e o que fazer. */
export function EstadoVazio({
  icone,
  cor = "var(--sys-blue)",
  titulo,
  children,
  acao,
}: {
  icone: LucideIcon;
  cor?: string;
  titulo: string;
  children: ReactNode;
  acao?: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <IconeMenu icon={icone} cor={cor} tamanho={48} />
        <h2 className="mt-1 text-[16px] font-semibold">{titulo}</h2>
        <p className="max-w-md text-[13.5px] text-muted-foreground">{children}</p>
        {acao && <div className="mt-2">{acao}</div>}
      </CardContent>
    </Card>
  );
}

export function ErroCarregar({ mensagem, tentar }: { mensagem: string; tentar: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-[12px] border border-border bg-danger-bg px-4 py-3 text-danger">
      <AlertTriangle size={18} aria-hidden="true" />
      <span className="flex-1 text-[13.5px]">{mensagem}</span>
      <Button variant="outline" size="sm" onClick={tentar}>
        Tentar de novo
      </Button>
    </div>
  );
}

/** Esqueleto de tabela usado enquanto cada bloco carrega. */
export function EsqueletoTabela({ linhas = 6, rotulo }: { linhas?: number; rotulo: string }) {
  return (
    <div aria-busy="true" aria-label={rotulo} className="overflow-hidden rounded-[12px] border border-border bg-card">
      <Skeleton className="h-10 w-full rounded-none" />
      {Array.from({ length: linhas }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-t border-border-soft px-3 py-3">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}
