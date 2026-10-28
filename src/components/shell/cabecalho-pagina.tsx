import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Migalha = { label: string; href?: string };
export type AbaPagina = { label: string; href: string; ativa?: boolean; contador?: number };

/** Topo de toda página do portal: breadcrumb "Início / …", título, subtítulo, ações e abas em pílula. */
export function CabecalhoPagina({
  migalhas = [],
  titulo,
  subtitulo,
  acoes,
  abas,
}: {
  migalhas?: Migalha[];
  titulo: string;
  subtitulo?: string;
  acoes?: ReactNode;
  abas?: AbaPagina[];
}) {
  return (
    <div className="mb-6">
      <nav aria-label="Você está em" className="mb-2">
        <ol className="flex flex-wrap items-center gap-1 text-[12.5px] text-muted-foreground">
          <li>
            <Link href="/" className="hover:text-foreground hover:underline">
              Início
            </Link>
          </li>
          {migalhas.map((m, i) => (
            <li key={`${m.label}-${i}`} className="flex items-center gap-1">
              <ChevronRight size={13} aria-hidden="true" />
              {m.href && i < migalhas.length - 1 ? (
                <Link href={m.href} className="hover:text-foreground hover:underline">
                  {m.label}
                </Link>
              ) : (
                <span aria-current={i === migalhas.length - 1 ? "page" : undefined} className="text-foreground">
                  {m.label}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-titulo-pagina tracking-[-0.01em]">{titulo}</h1>
          {subtitulo && <p className="mt-1 text-[14px] text-muted-foreground">{subtitulo}</p>}
        </div>
        {acoes && <div className="flex shrink-0 flex-wrap items-center gap-2">{acoes}</div>}
      </div>

      {abas && abas.length > 0 && (
        <nav aria-label="Seções da página" className="mt-5 flex flex-wrap gap-2">
          {abas.map((aba) => (
            <Link
              key={aba.href}
              href={aba.href}
              aria-current={aba.ativa ? "page" : undefined}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors",
                aba.ativa
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground",
              )}
            >
              {aba.label}
              {aba.contador !== undefined && (
                <span className={cn("rounded-full px-1.5 text-[11px] font-semibold", aba.ativa ? "bg-primary text-white" : "bg-muted")}>
                  {aba.contador}
                </span>
              )}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
