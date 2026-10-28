"use client";

import { Archive, AtSign, FileText, Image as ImageIcon, Search, Users } from "lucide-react";
import Link from "next/link";
import { useId } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  ehImagem,
  horaLista,
  previa,
  resolverAutor,
  type GrupoWa,
  type PessoaProjeto,
  type ResumoConversa,
} from "./dados";
import { EsqueletoListaGrupos } from "./esqueleto";

export type FiltroConversas = "todos" | "nao_lidos" | "mencoes" | "arquivados";

export const FILTROS: { id: FiltroConversas; rotulo: string }[] = [
  { id: "todos", rotulo: "Todos" },
  { id: "nao_lidos", rotulo: "Não lidos" },
  { id: "mencoes", rotulo: "Menções" },
  { id: "arquivados", rotulo: "Arquivados" },
];

const CORES_EQUIPE = ["--sys-blue", "--sys-green", "--sys-orange", "--sys-purple", "--sys-teal", "--sys-pink", "--sys-indigo"];

/** Cor estável por equipe (mesma equipe → mesma cor em toda a tela). */
export function corEquipe(equipe: string) {
  let h = 0;
  for (const c of equipe) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `var(${CORES_EQUIPE[h % CORES_EQUIPE.length]})`;
}

export function AvatarGrupo({ grupo, tamanho = 40 }: { grupo: Pick<GrupoWa, "equipe" | "ativo">; tamanho?: number }) {
  return (
    <span
      aria-hidden="true"
      className={cn("hig-tint inline-grid shrink-0 place-items-center rounded-full", !grupo.ativo && "grayscale")}
      style={{ ["--c" as string]: corEquipe(grupo.equipe), width: tamanho, height: tamanho }}
    >
      <Users size={Math.round(tamanho * 0.45)} />
    </span>
  );
}

/**
 * Troca o grupo aberto (?grupo=) sem ida ao servidor: o Next sincroniza useSearchParams com
 * history.pushState. Ctrl/Cmd/Shift/botão do meio seguem o link normal (nova aba etc.).
 */
export function navegarRaso(e: React.MouseEvent<HTMLAnchorElement>, href: string) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  window.history.pushState(null, "", href);
}

export function passaNoFiltro(g: GrupoWa, r: ResumoConversa | undefined, filtro: FiltroConversas) {
  if (filtro === "arquivados") return !g.ativo;
  if (!g.ativo) return false;
  if (filtro === "nao_lidos") return (r?.nao_lidas ?? 0) > 0;
  if (filtro === "mencoes") return (r?.mencoes ?? 0) > 0;
  return true;
}

export function ListaGrupos({
  grupos,
  resumo,
  pessoas,
  userId,
  filtro,
  onFiltro,
  busca,
  onBusca,
  selecionadoId,
  hrefGrupo,
  carregando,
}: {
  grupos: GrupoWa[];
  resumo: Record<string, ResumoConversa>;
  pessoas: PessoaProjeto[];
  userId: string;
  filtro: FiltroConversas;
  onFiltro: (f: FiltroConversas) => void;
  busca: string;
  onBusca: (v: string) => void;
  selecionadoId: string | null;
  hrefGrupo: (id: string) => string;
  carregando: boolean;
}) {
  const ids = useId();
  const q = busca.trim().toLowerCase();
  const contagem: Record<FiltroConversas, number> = {
    todos: grupos.filter((g) => g.ativo).length,
    nao_lidos: grupos.filter((g) => passaNoFiltro(g, resumo[g.id], "nao_lidos")).length,
    mencoes: grupos.filter((g) => passaNoFiltro(g, resumo[g.id], "mencoes")).length,
    arquivados: grupos.filter((g) => !g.ativo).length,
  };

  const visiveis = grupos
    .filter((g) => passaNoFiltro(g, resumo[g.id], filtro))
    .filter((g) => !q || `${g.nome} ${g.equipe} ${resumo[g.id]?.ultima_body ?? ""}`.toLowerCase().includes(q))
    .sort((a, b) => {
      const ea = resumo[a.id]?.ultima_em ?? "";
      const eb = resumo[b.id]?.ultima_em ?? "";
      return eb.localeCompare(ea) || a.nome.localeCompare(b.nome, "pt-BR");
    });

  const vazio =
    filtro === "nao_lidos"
      ? "Tudo lido. Os grupos com mensagens novas aparecem aqui."
      : filtro === "mencoes"
        ? "Ninguém citou você. Aparecem aqui os grupos com mensagens que trazem seu nome, @nome ou telefone."
        : filtro === "arquivados"
          ? "Nenhum grupo arquivado. Grupos desativados pelo super admin ficam aqui, só para consulta."
          : "Nenhum grupo ativo.";

  return (
    <aside aria-label="Grupos de WhatsApp" className="flex min-h-0 flex-col border-border bg-card lg:border-r">
      <div className="grid gap-2.5 border-b border-border p-3">
        <label htmlFor={`${ids}-busca`} className="sr-only">
          Buscar grupo ou mensagem
        </label>
        <div className="relative">
          <Search size={16} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            id={`${ids}-busca`}
            type="search"
            value={busca}
            onChange={(e) => onBusca(e.target.value)}
            placeholder="Buscar grupo, equipe ou mensagem"
            className="h-9 pl-9"
          />
        </div>
        <div role="group" aria-label="Filtrar grupos" className="flex flex-wrap gap-1.5">
          {FILTROS.map((f) => {
            const ativo = filtro === f.id;
            const n = contagem[f.id];
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={ativo}
                onClick={() => onFiltro(f.id)}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  ativo
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                )}
              >
                {f.rotulo}
                {f.id !== "todos" && n > 0 && (
                  <span className={cn("rounded-full px-1.5 text-[11px] tabular-nums", ativo ? "bg-primary text-primary-foreground" : "bg-muted")}>
                    {n}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <nav aria-label="Lista de grupos" className="min-h-0 flex-1 overflow-y-auto">
        {carregando ? (
          <EsqueletoListaGrupos />
        ) : visiveis.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">
            {q ? `Nenhum grupo encontrado para “${busca.trim()}”.` : vazio}
          </p>
        ) : (
          <ul role="list">
            {visiveis.map((g) => {
              const r = resumo[g.id];
              const ativo = g.id === selecionadoId;
              const naoLidas = r?.nao_lidas ?? 0;
              const mencoes = r?.mencoes_nao_lidas ?? 0;
              const autor =
                r?.ultima_id && (r.ultima_autor_user_id || r.ultima_autor_phone)
                  ? r.ultima_autor_user_id === userId
                    ? "Você"
                    : resolverAutor({ author_user_id: r.ultima_autor_user_id, author_phone: r.ultima_autor_phone }, pessoas).nome.split(" ")[0]
                  : null;
              const textoPrevia = r?.ultima_id ? previa({ body: r.ultima_body, media_path: r.ultima_media_path }) : "Nenhuma mensagem ainda";
              const rotuloAcessivel = [
                g.nome,
                `equipe ${g.equipe}`,
                !g.ativo ? "arquivado" : null,
                naoLidas > 0 ? `${naoLidas} não lida${naoLidas > 1 ? "s" : ""}` : null,
                mencoes > 0 ? "você foi mencionado" : null,
              ]
                .filter(Boolean)
                .join(", ");
              return (
                <li key={g.id}>
                  <Link
                    href={hrefGrupo(g.id)}
                    scroll={false}
                    onClick={(e) => navegarRaso(e, hrefGrupo(g.id))}
                    aria-current={ativo ? "true" : undefined}
                    aria-label={rotuloAcessivel}
                    className={cn(
                      "grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 border-b border-border px-3 py-2.5 outline-none transition-colors focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset",
                      ativo ? "bg-primary-soft" : "hover:bg-muted/60",
                    )}
                  >
                    <span className="row-span-2">
                      <AvatarGrupo grupo={g} />
                    </span>
                    <span className={cn("flex min-w-0 items-center gap-1.5 truncate text-[14px]", naoLidas > 0 ? "font-bold" : "font-semibold")}>
                      <span className="truncate">{g.nome}</span>
                      {!g.ativo && <Archive size={13} aria-hidden="true" className="shrink-0 text-muted-foreground" />}
                    </span>
                    <span className={cn("text-[11.5px] tabular-nums", naoLidas > 0 ? "font-semibold text-success" : "text-muted-foreground")}>
                      {horaLista(r?.ultima_em ?? null)}
                    </span>
                    <span className="flex min-w-0 items-center gap-1 text-[12.5px] text-muted-foreground">
                      <span className="shrink-0 rounded bg-muted px-1.5 text-[11px] font-medium">{g.equipe}</span>
                      {r?.ultima_media_path &&
                        (ehImagem(r.ultima_media_path) ? (
                          <ImageIcon size={13} aria-hidden="true" className="shrink-0" />
                        ) : (
                          <FileText size={13} aria-hidden="true" className="shrink-0" />
                        ))}
                      <span className={cn("truncate", naoLidas > 0 && "text-foreground")}>
                        {autor && <span className="font-medium">{autor}: </span>}
                        {textoPrevia}
                      </span>
                    </span>
                    <span className="flex items-center justify-end gap-1">
                      {mencoes > 0 && (
                        <span className="grid size-5 place-items-center rounded-full bg-success text-success-bg" aria-hidden="true">
                          <AtSign size={12} />
                        </span>
                      )}
                      {naoLidas > 0 && (
                        <span
                          aria-hidden="true"
                          className="grid h-5 min-w-5 place-items-center rounded-full bg-success px-1.5 text-[11px] font-bold text-success-bg tabular-nums"
                        >
                          {naoLidas > 99 ? "99+" : naoLidas}
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </nav>
    </aside>
  );
}
