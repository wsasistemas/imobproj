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

/** Select do design system (Base UI) com rótulos: o gatilho mostra o label, não o valor. */
export function CampoSelect({
  id,
  opcoes,
  valor,
  aoMudar,
  placeholder,
  invalido,
  desabilitado,
}: {
  id: string;
  opcoes: OpcaoSelect[];
  valor: string;
  aoMudar: (v: string) => void;
  placeholder?: string;
  invalido?: boolean;
  desabilitado?: boolean;
}) {
  return (
    <Select
      items={opcoes}
      value={valor}
      onValueChange={(v) => aoMudar((v as string | null) ?? "")}
      disabled={desabilitado}
    >
      <SelectTrigger id={id} className="w-full" aria-invalid={invalido || undefined}>
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
