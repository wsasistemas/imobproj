"use client";

import { ChevronRight, KeyRound, LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { hrefDoItem, menuVisivel, projetoDoCaminho, telaPorCaminho, type AcessoMenu, type ItemMenu } from "@/config/menu";
import { cn } from "@/lib/utils";
import { DialogAlterarSenha } from "./dialog-alterar-senha";
import { IconeMenu } from "./icone-menu";
import { useSair } from "./use-sair";

// Menu lateral escuro do padrão IMOBDESK (PRD, PARTE B): 250px, recolhível para 68px, grupos com rótulo
// em maiúsculas, submenus recuados, item ativo com fundo primary e cantos de 8px. Recolhido, os submenus
// abrem num flyout ao lado do ícone. Rodapé fixo: Recolher menu, Alterar senha, Sair.

const itemCls =
  "flex w-full min-h-10 items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-[13.5px] text-sidebar-text transition-colors hover:bg-sidebar-hover hover:text-white focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white/70";
// Item ativo: degradê azul → abóbora (padrão ImobDesk), texto branco
const ativoCls = "bg-(image:--menu-ativo) text-white hover:bg-(image:--menu-ativo) hover:text-white";

export function MenuLateral({
  recolhido = false,
  projetoAtualId,
  acesso,
  onRecolher,
  onNavegar,
}: {
  recolhido?: boolean;
  /** Perfil de acesso: filtra os itens do menu (sem ele, mostra tudo). */
  acesso?: AcessoMenu;
  /** Último projeto visitado (cookie), para os subitens de Projetos quando não há projeto no caminho. */
  projetoAtualId?: string;
  /** Sem esta função (gaveta do celular) o item "Recolher menu" some. */
  onRecolher?: () => void;
  onNavegar?: () => void;
}) {
  const pathname = usePathname();
  const ativo = telaPorCaminho(pathname)?.item.id;
  const projetoId = projetoDoCaminho(pathname) ?? projetoAtualId;
  const { saindo, sair } = useSair();

  return (
    <div className="flex h-full flex-col bg-sidebar-bg text-sidebar-text">
      <nav aria-label="Menu lateral" className={cn("min-h-0 flex-1 overflow-y-auto py-5 [scrollbar-width:thin]", recolhido ? "px-3" : "px-3")}>
        {menuVisivel(acesso).map((grupo) => (
          <div key={grupo.id} className="mb-5 last:mb-0">
            {recolhido ? (
              <div className="mx-auto mb-2 h-px w-6 bg-sidebar-hover" aria-hidden="true" />
            ) : (
              <p className="mb-2 px-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-sidebar-label">{grupo.label}</p>
            )}
            <ul className="flex flex-col gap-0.5">
              {grupo.itens.map((item) =>
                item.filhos ? (
                  recolhido ? (
                    <GrupoFlyout key={item.id} item={item} ativo={ativo} projetoId={projetoId} />
                  ) : (
                    <GrupoAberto
                      key={item.id}
                      item={item}
                      ativo={ativo}
                      pathname={pathname}
                      projetoId={projetoId}
                      onNavegar={onNavegar}
                    />
                  )
                ) : (
                  <li key={item.id}>
                    <Link
                      href={hrefDoItem(item, projetoId)}
                      onClick={onNavegar}
                      aria-current={ativo === item.id ? "page" : undefined}
                      aria-label={recolhido ? item.label : undefined}
                      title={recolhido ? item.label : undefined}
                      className={cn(itemCls, recolhido && "justify-center px-0", ativo === item.id && ativoCls)}
                    >
                      <IconeMenu icon={item.icon} cor={item.cor} colorido={item.colorido} />
                      {!recolhido && <span className="truncate">{item.label}</span>}
                    </Link>
                  </li>
                ),
              )}
            </ul>
          </div>
        ))}
      </nav>

      <div className="mx-3 flex shrink-0 flex-col gap-0.5 border-t border-sidebar-hover pb-5 pt-3">
        {onRecolher && (
          <button
            type="button"
            onClick={onRecolher}
            aria-label={recolhido ? "Expandir menu" : "Recolher menu"}
            title={recolhido ? "Expandir menu" : undefined}
            className={cn(itemCls, recolhido && "justify-center px-0")}
          >
            <IconeMenu icon={recolhido ? PanelLeftOpen : PanelLeftClose} cor="var(--sys-gray)" colorido={recolhido ? "expandir" : "recolher"} />
            {!recolhido && <span>Recolher menu</span>}
          </button>
        )}
        <DialogAlterarSenha
          trigger={
            <button
              type="button"
              aria-label={recolhido ? "Alterar senha" : undefined}
              title={recolhido ? "Alterar senha" : undefined}
              className={cn(itemCls, recolhido && "justify-center px-0")}
            >
              <IconeMenu icon={KeyRound} cor="var(--sys-yellow)" colorido="senha" />
              {!recolhido && <span>Alterar senha</span>}
            </button>
          }
        />
        <button
          type="button"
          onClick={() => void sair()}
          disabled={saindo}
          aria-label={recolhido ? "Sair" : undefined}
          title={recolhido ? "Sair" : undefined}
          className={cn(itemCls, "disabled:opacity-60", recolhido && "justify-center px-0")}
        >
          <IconeMenu icon={LogOut} cor="var(--sys-red)" colorido="sair" />
          {!recolhido && <span>{saindo ? "Saindo…" : "Sair"}</span>}
        </button>
      </div>
    </div>
  );
}

function SubItens({
  itens,
  ativo,
  projetoId,
  onNavegar,
  flyout,
}: {
  itens: ItemMenu[];
  ativo?: string;
  projetoId?: string;
  onNavegar?: () => void;
  flyout?: boolean;
}) {
  return (
    <ul className={cn("flex flex-col gap-0.5", !flyout && "mb-1.5 mt-0.5")}>
      {itens.map((filho) => (
        <li key={filho.id}>
          <Link
            href={hrefDoItem(filho, projetoId)}
            onClick={onNavegar}
            aria-current={ativo === filho.id ? "page" : undefined}
            className={cn(itemCls, "min-h-9 text-[13px]", !flyout && "pl-8", ativo === filho.id && ativoCls)}
          >
            <IconeMenu icon={filho.icon} cor={filho.cor} colorido={filho.colorido} tamanho={18} />
            <span className="truncate">{filho.label}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Menu expandido: grupo com seta; abre sozinho quando a tela atual é de um dos subitens. */
function GrupoAberto({
  item,
  ativo,
  pathname,
  projetoId,
  onNavegar,
}: {
  item: ItemMenu;
  ativo?: string;
  pathname: string;
  projetoId?: string;
  onNavegar?: () => void;
}) {
  const dentro = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const [aberto, setAberto] = useState(dentro);
  const [estavaDentro, setEstavaDentro] = useState(dentro);
  // Ao entrar na área do grupo, ele expande (ajuste durante a renderização, sem efeito).
  if (dentro !== estavaDentro) {
    setEstavaDentro(dentro);
    if (dentro) setAberto(true);
  }
  const listaId = `menu-${item.id}`;

  return (
    <li>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-controls={listaId}
        className={cn(itemCls, dentro && "text-white")}
      >
        <IconeMenu icon={item.icon} cor={item.cor} colorido={item.colorido} />
        <span className="flex-1 truncate text-left">{item.label}</span>
        <ChevronRight size={16} className={cn("shrink-0 opacity-60 transition-transform", aberto && "rotate-90")} aria-hidden="true" />
      </button>
      {aberto && (
        <div id={listaId}>
          <SubItens itens={item.filhos ?? []} ativo={ativo} projetoId={projetoId} onNavegar={onNavegar} />
        </div>
      )}
    </li>
  );
}

/** Menu recolhido: os subitens abrem num flyout ao lado do ícone. */
function GrupoFlyout({ item, ativo, projetoId }: { item: ItemMenu; ativo?: string; projetoId?: string }) {
  const [aberto, setAberto] = useState(false);
  const pathname = usePathname();
  // ativo em qualquer tela da área (ex.: a lista /projetos, que não é subitem)
  const dentro = item.filhos?.some((f) => f.id === ativo) || pathname === item.href || pathname.startsWith(`${item.href}/`);
  return (
    <li>
      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverTrigger
          render={
            <button type="button" aria-label={item.label} title={item.label} className={cn(itemCls, "justify-center px-0", dentro && ativoCls)}>
              <IconeMenu icon={item.icon} cor={item.cor} colorido={item.colorido} />
            </button>
          }
        />
        <PopoverContent side="right" align="start" sideOffset={14} className="w-60 gap-1 border-0 bg-sidebar-bg p-2 ring-0 shadow-[var(--shadow-pop)]">
          <p className="px-2.5 pb-1 pt-1 text-[11px] font-bold uppercase tracking-[0.08em] text-white">{item.label}</p>
          <SubItens itens={item.filhos ?? []} ativo={ativo} projetoId={projetoId} onNavegar={() => setAberto(false)} flyout />
        </PopoverContent>
      </Popover>
    </li>
  );
}
