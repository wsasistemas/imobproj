"use client";

import { useState, type ReactNode } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import type { UsuarioLogado } from "@/lib/sessao";
import { COOKIE_MENU_RECOLHIDO } from "@/lib/tema";
import { cn } from "@/lib/utils";
import { Cabecalho } from "./cabecalho";
import { MenuLateral } from "./menu-lateral";


// Abaixo de 1024px o menu vira gaveta (Sheet); acima, fica fixo e recolhível.
const MQ_DESKTOP = "(min-width: 1024px)";

export function AppShell({
  usuario,
  dataExtenso,
  recolhidoInicial,
  projetoAtualId,
  children,
}: {
  usuario: UsuarioLogado;
  dataExtenso: string;
  recolhidoInicial: boolean;
  projetoAtualId?: string;
  children: ReactNode;
}) {
  const [recolhido, setRecolhido] = useState(recolhidoInicial);
  const [gaveta, setGaveta] = useState(false);

  function alternarRecolhido() {
    setRecolhido((v) => {
      document.cookie = `${COOKIE_MENU_RECOLHIDO}=${v ? "0" : "1"}; path=/; max-age=31536000; samesite=lax`;
      return !v;
    });
  }

  function alternarMenu() {
    if (window.matchMedia(MQ_DESKTOP).matches) alternarRecolhido();
    else setGaveta(true);
  }

  return (
    <div className="flex h-dvh flex-col bg-background">
      <a
        href="#conteudo"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Pular para o conteúdo
      </a>
      <Cabecalho usuario={usuario} dataExtenso={dataExtenso} onMenu={alternarMenu} />

      <div className="flex min-h-0 flex-1">
        <aside
          className={cn(
            "hidden shrink-0 overflow-hidden transition-[width] duration-200 ease-out lg:block",
            recolhido ? "w-sidebar-recolhida" : "w-sidebar",
          )}
        >
          <MenuLateral recolhido={recolhido} projetoAtualId={projetoAtualId} onRecolher={alternarRecolhido} />
        </aside>

        <Sheet open={gaveta} onOpenChange={setGaveta}>
          <SheetContent side="left" className="w-[280px] max-w-[85vw] border-0 bg-sidebar-bg p-0" showCloseButton={false}>
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <MenuLateral projetoAtualId={projetoAtualId} onNavegar={() => setGaveta(false)} />
          </SheetContent>
        </Sheet>

        <main id="conteudo" className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-7">{children}</div>
        </main>
      </div>
    </div>
  );
}
