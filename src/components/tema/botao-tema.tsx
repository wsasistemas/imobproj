"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

const assinarNada = () => () => {};

/** Botão sol/lua: alterna entre o tema claro e o escuro (fica salvo neste navegador). */
export function BotaoTema({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  // O tema só é conhecido no navegador; no servidor o botão sai neutro (sem piscar o ícone errado).
  const montado = useSyncExternalStore(assinarNada, () => true, () => false);
  const escuro = montado && resolvedTheme === "dark";
  const rotulo = escuro ? "Usar tema claro" : "Usar tema escuro";

  return (
    <button
      type="button"
      onClick={() => setTheme(escuro ? "light" : "dark")}
      aria-label={rotulo}
      title={rotulo}
      className={cn(
        "inline-grid size-9 shrink-0 place-items-center rounded-[8px] border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
    >
      {!montado ? <span className="size-[18px]" /> : escuro ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
    </button>
  );
}
