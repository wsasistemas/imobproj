"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { ROTULO_PAPEL, SITUACAO_PROJETO, type Papel, type Projeto } from "@/lib/projeto/tipos";
import { COOKIE_PROJETO_ATUAL } from "@/lib/tema";
import { cn } from "@/lib/utils";

const ABAS = [
  { label: "Visão geral", trecho: "" },
  { label: "Documentação e EAP", trecho: "/documentacao" },
  { label: "Cronograma", trecho: "/cronograma" },
  { label: "Atas de reunião", trecho: "/atas" },
  { label: "Ordens de Serviço", trecho: "/os" },
  { label: "Conversas", trecho: "/conversas" },
];

const data = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR") : "—");

/** Cabeçalho comum às telas de um projeto (breadcrumb, título, situação e abas em pílula). */
export function CabecalhoProjeto({ projeto, papel }: { projeto: Projeto; papel: Papel }) {
  const pathname = usePathname();
  const base = `/projetos/${projeto.id}`;
  const resto = pathname.slice(base.length);
  const abaAtiva = ABAS.filter((a) => (a.trecho === "" ? resto === "" : resto.startsWith(a.trecho))).at(-1) ?? ABAS[0];
  const situacao = SITUACAO_PROJETO[projeto.status];

  // Lembra o último projeto aberto: os subitens de "Projetos" no menu passam a apontar para ele.
  useEffect(() => {
    document.cookie = `${COOKIE_PROJETO_ATUAL}=${projeto.id}; path=/; max-age=31536000; samesite=lax`;
  }, [projeto.id]);

  return (
    <div className="mb-6">
      <nav aria-label="Você está em" className="mb-2">
        <ol className="flex flex-wrap items-center gap-1 text-[12.5px] text-muted-foreground">
          <li>
            <Link href="/" className="hover:text-foreground hover:underline">
              Início
            </Link>
          </li>
          <li className="flex items-center gap-1">
            <ChevronRight size={13} aria-hidden="true" />
            <Link href="/projetos" className="hover:text-foreground hover:underline">
              Projetos
            </Link>
          </li>
          <li className="flex items-center gap-1">
            <ChevronRight size={13} aria-hidden="true" />
            {resto === "" ? (
              <span aria-current="page" className="text-foreground">
                {projeto.codigo}
              </span>
            ) : (
              <Link href={base} className="hover:text-foreground hover:underline">
                {projeto.codigo}
              </Link>
            )}
          </li>
          {resto !== "" && (
            <li className="flex items-center gap-1">
              <ChevronRight size={13} aria-hidden="true" />
              <span aria-current="page" className="text-foreground">
                {abaAtiva.label}
              </span>
            </li>
          )}
        </ol>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-titulo-pagina tracking-[-0.01em]">
            {projeto.codigo} · {projeto.nome}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-muted-foreground">
            <Badge variant={situacao.variant}>{situacao.label}</Badge>
            <span>
              {data(projeto.inicio)} a {data(projeto.fim)}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Seu papel: <b className="font-semibold text-foreground">{ROTULO_PAPEL[papel]}</b>
            </span>
          </p>
        </div>
      </div>

      <nav aria-label="Seções do projeto" className="mt-5 flex flex-wrap gap-2">
        {ABAS.map((aba) => {
          const ativa = aba === abaAtiva;
          return (
            <Link
              key={aba.trecho}
              href={`${base}${aba.trecho}`}
              aria-current={ativa ? "page" : undefined}
              className={cn(
                "inline-flex h-8 items-center rounded-full border px-3.5 text-[13px] font-medium transition-colors",
                ativa
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground",
              )}
            >
              {aba.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
