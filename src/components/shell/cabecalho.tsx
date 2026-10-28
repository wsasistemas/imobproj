"use client";

import { Bell, Cloud, LogOut, Menu, UserRound } from "lucide-react";
import Image from "next/image";
import { BotaoTema } from "@/components/tema/botao-tema";
import type { UsuarioLogado } from "@/lib/sessao";
import { useSair } from "./use-sair";

const botaoIconeCls =
  "relative inline-grid size-9 shrink-0 place-items-center rounded-[8px] border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** Cabeçalho do padrão IMOBDESK: hambúrguer, logo redonda, nome do sistema; à direita sincronização,
 *  data por extenso, cartão do usuário com sair, tema claro/escuro e sino de notificações. */
export function Cabecalho({
  usuario,
  dataExtenso,
  onMenu,
}: {
  usuario: UsuarioLogado;
  dataExtenso: string;
  onMenu: () => void;
}) {
  const { saindo, sair } = useSair();

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <button type="button" onClick={onMenu} className={botaoIconeCls} aria-label="Alternar menu lateral">
          <Menu size={18} />
        </button>
        <Image
          src="/wsa-logo.png"
          alt="WSA Sistemas"
          width={38}
          height={38}
          className="size-[30px] shrink-0 rounded-full bg-white sm:size-[38px]"
          priority
        />
        <span className="hidden h-6 w-px bg-border sm:block" aria-hidden="true" />
        <span className="hidden truncate text-[15px] font-bold tracking-[0.06em] sm:block">IMOBPROJ</span>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
        <span className="hidden items-center gap-1.5 text-[12px] text-muted-foreground lg:inline-flex" title="Dados no Supabase">
          <Cloud size={14} className="text-success" aria-hidden="true" />
          Sincronizado
        </span>
        <span className="hidden text-[12px] text-muted-foreground first-letter:uppercase lg:inline-block">{dataExtenso}</span>

        <div
          className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-border bg-card pl-3 pr-1 text-muted-foreground"
          title={`${usuario.nome} · ${usuario.rotuloPapel}`}
        >
          <UserRound size={14} aria-hidden="true" />
          <span className="hidden min-w-0 max-w-[180px] flex-col leading-tight sm:flex">
            <strong className="truncate text-[12px] text-foreground">{usuario.nome}</strong>
            <small className="truncate text-[10.5px]">{usuario.rotuloPapel}</small>
          </span>
          <button
            type="button"
            onClick={() => void sair()}
            disabled={saindo}
            aria-label="Sair"
            title="Sair"
            className="inline-grid size-7 place-items-center rounded-[6px] transition-colors hover:bg-primary-soft hover:text-primary disabled:opacity-50"
          >
            <LogOut size={14} />
          </button>
        </div>

        <BotaoTema />

        <button type="button" className={botaoIconeCls} aria-label="Notificações">
          <Bell size={18} />
          <span className="absolute right-2 top-[7px] size-1.5 rounded-full bg-primary" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
