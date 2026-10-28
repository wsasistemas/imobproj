"use client";

import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** Linha de formulário: rótulo, campo e mensagem de erro ligada por aria-describedby. */
export function Campo({
  id,
  rotulo,
  erro,
  dica,
  obrigatorio,
  className,
  children,
}: {
  id: string;
  rotulo: string;
  erro?: string;
  dica?: string;
  obrigatorio?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id}>
        {rotulo}
        {obrigatorio && (
          <span className="text-danger" aria-hidden="true">
            *
          </span>
        )}
      </Label>
      {children}
      {dica && !erro && (
        <p id={`${id}-dica`} className="text-[12px] text-muted-foreground">
          {dica}
        </p>
      )}
      {erro && (
        <p id={`${id}-erro`} role="alert" className="text-[12px] font-medium text-danger">
          {erro}
        </p>
      )}
    </div>
  );
}

export type OpcaoSelect = { value: string; label: string };

/** Select do design system (Base UI): o gatilho mostra o rótulo, não o valor. */
export function CampoSelect({
  id,
  opcoes,
  valor,
  aoMudar,
  placeholder,
  desabilitado,
  rotuloAcessivel,
  className,
}: {
  id?: string;
  opcoes: OpcaoSelect[];
  valor: string;
  aoMudar: (v: string) => void;
  placeholder?: string;
  desabilitado?: boolean;
  rotuloAcessivel?: string;
  className?: string;
}) {
  return (
    <Select items={opcoes} value={valor} onValueChange={(v) => aoMudar((v as string | null) ?? "")} disabled={desabilitado}>
      <SelectTrigger id={id} className={cn("w-full", className)} aria-label={rotuloAcessivel}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {opcoes.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Rótulo de seção (PARTE B: 11.5px, maiúsculas, espaçado, 700, muted). */
export function RotuloSecao({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h3 id={id} className="text-[11.5px] font-bold tracking-[.07em] text-muted-foreground uppercase">
      {children}
    </h3>
  );
}
