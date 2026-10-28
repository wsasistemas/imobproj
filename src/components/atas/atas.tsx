"use client";

import { useQuery } from "@tanstack/react-query";
import { NotebookPen, Search, X } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { IconeMenu } from "@/components/shell/icone-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { pode } from "@/lib/projeto/permissoes";
import { SITUACAO_ATA, type Papel } from "@/lib/projeto/tipos";
import { cn } from "@/lib/utils";
import { buscarAtas, chavesAtas, formatarData, formatarHorario, type AtaResumo } from "./dados";
import { DetalheAta } from "./detalhe-ata";
import { DialogDadosAta } from "./dialog-dados-ata";
import { ListaSkeleton } from "./esqueletos";

export type ProjetoAta = { id: string; codigo: string; nome: string };

type Props = { projeto: ProjetoAta; papel: Papel; userId: string };

/** Mestre-detalhe: lista de atas à esquerda e a ata aberta (?ata=<id>) à direita. No celular, uma de cada vez. */
export function Atas({ projeto, papel, userId }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ataSelecionada = searchParams.get("ata");
  const [busca, setBusca] = useState("");

  const irPara = useCallback(
    (ataId: string | null) => {
      const p = new URLSearchParams(searchParams.toString());
      if (ataId) p.set("ata", ataId);
      else p.delete("ata");
      const qs = p.toString();
      // History API nativa (o Next 15 sincroniza useSearchParams): trocar de ata não precisa ir ao servidor.
      // Com router.replace a transição ficava presa e a ata não abria.
      window.history.pushState(null, "", qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, searchParams],
  );

  const consulta = useQuery({ queryKey: chavesAtas.lista(projeto.id), queryFn: () => buscarAtas(projeto.id) });
  const todas = useMemo(() => consulta.data ?? [], [consulta.data]);
  const filtradas = useMemo(() => {
    const termo = busca
      .trim()
      .toLowerCase()
      .replace(/^(ata\s*(n[º°o]\s*)?|#)/, "");
    if (!termo) return todas;
    return todas.filter(
      (a) =>
        String(a.numero) === termo ||
        a.titulo.toLowerCase().includes(termo) ||
        (a.local ?? "").toLowerCase().includes(termo) ||
        formatarData(a.data).includes(termo),
    );
  }, [todas, busca]);

  const podeRedigir = pode(papel, "ata_redigir");

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
      {/* Lista */}
      <Card className={cn("gap-0 py-0", ataSelecionada && "hidden lg:flex")}>
        <div className="grid gap-3 border-b border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[15px] font-semibold">
              Atas <span className="font-normal text-muted-foreground">({todas.length})</span>
            </h2>
            {podeRedigir && <DialogDadosAta projetoId={projeto.id} aoSalvar={(id) => irPara(id)} />}
          </div>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nº, título, local ou data"
              aria-label="Buscar atas"
              className="pr-9 pl-8"
            />
            {busca && (
              <button
                type="button"
                onClick={() => setBusca("")}
                aria-label="Limpar busca"
                className="absolute top-1/2 right-1 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {consulta.isPending ? (
          <ListaSkeleton />
        ) : consulta.isError ? (
          <CardContent className="py-10 text-center">
            <p role="alert" className="text-danger">
              {consulta.error.message}
            </p>
            <Button variant="outline" className="mt-3" onClick={() => consulta.refetch()}>
              Tentar de novo
            </Button>
          </CardContent>
        ) : todas.length === 0 ? (
          <CardContent className="py-10 text-center">
            <p className="font-medium">Nenhuma ata ainda</p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {podeRedigir
                ? "Crie a primeira em “Nova ata”: ela nasce em rascunho e você inclui participantes, pauta, decisões e encaminhamentos."
                : "Quando o gerente registrar as reuniões do projeto, as atas aparecem aqui."}
            </p>
          </CardContent>
        ) : filtradas.length === 0 ? (
          <CardContent className="py-10 text-center">
            <p className="font-medium">Nada encontrado</p>
            <p className="mt-1 text-[13px] text-muted-foreground">Nenhuma ata com “{busca.trim()}” no número, título, local ou data.</p>
          </CardContent>
        ) : (
          <ul aria-label="Atas de reunião" className="max-h-[calc(100vh-280px)] min-h-40 overflow-y-auto">
            {filtradas.map((a) => (
              <ItemLista key={a.id} ata={a} ativa={a.id === ataSelecionada} aoAbrir={() => irPara(a.id)} />
            ))}
          </ul>
        )}
      </Card>

      {/* Detalhe */}
      {ataSelecionada ? (
        <DetalheAta
          key={ataSelecionada}
          projeto={projeto}
          ataId={ataSelecionada}
          papel={papel}
          userId={userId}
          aoVoltar={() => irPara(null)}
        />
      ) : (
        <Card className="hidden lg:flex">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <IconeMenu icon={NotebookPen} cor="var(--sys-purple)" tamanho={48} />
            <p className="mt-1 text-[16px] font-semibold">Selecione uma ata</p>
            <p className="max-w-sm text-[13.5px] text-muted-foreground">
              Escolha uma ata na lista para ver participantes, pauta, decisões, encaminhamentos e anexos.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ItemLista({ ata, ativa, aoAbrir }: { ata: AtaResumo; ativa: boolean; aoAbrir: () => void }) {
  const situacao = SITUACAO_ATA[ata.status];
  const horario = formatarHorario(ata.inicio, ata.fim);
  return (
    <li className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={aoAbrir}
        aria-current={ativa ? "true" : undefined}
        className={cn(
          "grid w-full gap-1 px-4 py-3 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-inset",
          ativa && "bg-primary-soft hover:bg-primary-soft",
        )}
      >
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="mr-1.5 text-[12.5px] font-semibold text-muted-foreground tabular-nums">nº {ata.numero}</span>
            <span className={cn("font-medium", ativa && "text-primary")}>{ata.titulo}</span>
          </span>
          <Badge variant={situacao.variant} className="shrink-0">
            {situacao.label}
          </Badge>
        </span>
        <span className="text-[12.5px] text-muted-foreground">
          {formatarData(ata.data)}
          {horario && ` · ${horario}`}
          {ata.local && ` · ${ata.local}`}
        </span>
      </button>
    </li>
  );
}
