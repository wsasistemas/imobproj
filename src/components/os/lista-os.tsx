"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarRange, ClipboardList, FileWarning, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { IconeMenu } from "@/components/shell/icone-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { pode, veProjetoInteiro } from "@/lib/projeto/permissoes";
import { SITUACAO_OS, type OsStatus, type Papel } from "@/lib/projeto/tipos";
import { cn } from "@/lib/utils";
import {
  buscarListaOs,
  chavesOs,
  formatarAgendamento,
  formatarHoras,
  ORDEM_SITUACOES,
  type OsLinha,
} from "./dados";
import { DialogNovaOs } from "./dialog-nova-os";
import { PainelOs } from "./painel-os";

type Props = { projetoId: string; papel: Papel; userId: string };

const VAZIO_POR_SITUACAO: Record<OsStatus, string> = {
  rascunho: "Nenhuma OS em rascunho. OS sem agendamento, ou abertas pelo WhatsApp com #OS, aparecem aqui.",
  agendada: "Nenhuma OS agendada. Ao criar uma OS com data, ela aparece aqui até o check-in do executor.",
  em_execucao: "Nenhuma OS em execução. As OS aparecem aqui quando o executor faz o check-in.",
  aguardando_aceite: "Nenhuma OS aguardando aceite. As OS aparecem aqui quando o executor faz o check-out.",
  aprovada: "Nenhuma OS aprovada ainda. As horas aprovadas são as que contam no avanço da EAP.",
  recusada: "Nenhuma OS recusada.",
};

function ehSituacao(v: string | null): v is OsStatus {
  return !!v && v in SITUACAO_OS;
}

export function ListaOs({ projetoId, papel, userId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const situacaoUrl = searchParams.get("situacao");
  const situacao = ehSituacao(situacaoUrl) ? situacaoUrl : null;
  const osSelecionada = searchParams.get("os");
  const [busca, setBusca] = useState(searchParams.get("q") ?? "");

  const atualizarUrl = useCallback(
    (mudancas: Record<string, string | null>) => {
      const p = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(mudancas)) {
        if (v) p.set(k, v);
        else p.delete(k);
      }
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  // Busca vai para a URL com um pequeno atraso (filtragem local é imediata).
  useEffect(() => {
    const atual = searchParams.get("q") ?? "";
    if (busca.trim() === atual) return;
    const t = setTimeout(() => atualizarUrl({ q: busca.trim() || null }), 350);
    return () => clearTimeout(t);
  }, [busca, searchParams, atualizarUrl]);

  const consulta = useQuery({ queryKey: chavesOs.lista(projetoId), queryFn: () => buscarListaOs(projetoId) });
  const todas = useMemo(() => consulta.data ?? [], [consulta.data]);

  const contagem = useMemo(() => {
    const c = Object.fromEntries(ORDEM_SITUACOES.map((s) => [s, 0])) as Record<OsStatus, number>;
    for (const o of todas) c[o.status]++;
    return c;
  }, [todas]);

  const filtradas = useMemo(() => {
    const termo = busca
      .trim()
      .toLowerCase()
      .replace(/^(os\s*|#)/, "");
    return todas.filter((o) => {
      if (situacao && o.status !== situacao) return false;
      if (!termo) return true;
      return String(o.numero).includes(termo) || o.titulo.toLowerCase().includes(termo);
    });
  }, [todas, situacao, busca]);

  const linhaInicial = osSelecionada ? todas.find((o) => o.id === osSelecionada) : undefined;
  const abrir = (o: OsLinha) => atualizarUrl({ os: o.id });

  return (
    <div className="grid gap-4">
      {/* Filtros + ações */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div role="group" aria-label="Filtrar por situação" className="flex flex-wrap gap-2">
          <Pilula ativa={!situacao} onClick={() => atualizarUrl({ situacao: null })} rotulo="Todas" total={todas.length} />
          {ORDEM_SITUACOES.map((s) => (
            <Pilula
              key={s}
              ativa={situacao === s}
              onClick={() => atualizarUrl({ situacao: s })}
              rotulo={SITUACAO_OS[s].label}
              total={contagem[s]}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {pode(papel, "medicao_ver") && (
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={`/projetos/${projetoId}/os/medicao`} />}
            >
              <CalendarRange aria-hidden="true" />
              Medição do mês
            </Button>
          )}
          {pode(papel, "os_criar") && <DialogNovaOs projetoId={projetoId} aoCriar={(id) => atualizarUrl({ os: id })} />}
        </div>
      </div>

      <Card className="gap-0 py-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
          <div className="relative w-full max-w-sm">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por número ou título"
              aria-label="Buscar OS por número ou título"
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
          {!veProjetoInteiro(papel) && (
            <p className="text-[12.5px] text-muted-foreground">Você vê apenas as OS atribuídas a você.</p>
          )}
        </div>

        {consulta.isPending ? (
          <TabelaSkeleton />
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
          <Vazio
            titulo="Nenhuma Ordem de Serviço ainda"
            texto={
              pode(papel, "os_criar")
                ? "Crie a primeira OS em “Nova OS”: ligue-a a uma atividade da EAP e escolha o executor. OS abertas pelo WhatsApp (#OS) também aparecem aqui."
                : veProjetoInteiro(papel)
                  ? "Quando o gerente abrir OS neste projeto, elas aparecem aqui."
                  : "Quando uma OS for atribuída a você, ela aparece aqui."
            }
          />
        ) : filtradas.length === 0 ? (
          <Vazio
            titulo="Nada encontrado"
            texto={
              busca.trim()
                ? `Nenhuma OS${situacao ? ` "${SITUACAO_OS[situacao].label.toLowerCase()}"` : ""} com “${busca.trim()}” no número ou título.`
                : situacao
                  ? VAZIO_POR_SITUACAO[situacao]
                  : "Nenhuma OS."
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[72px] pl-4">Nº</TableHead>
                <TableHead>Título</TableHead>
                <TableHead className="hidden lg:table-cell">Atividade da EAP</TableHead>
                <TableHead className="hidden md:table-cell">Executor</TableHead>
                <TableHead className="hidden xl:table-cell">Agendada</TableHead>
                <TableHead className="text-right">Horas</TableHead>
                <TableHead className="pr-4">Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map((o) => {
                const s = SITUACAO_OS[o.status];
                const selecionada = o.id === osSelecionada;
                return (
                  <TableRow
                    key={o.id}
                    aria-selected={selecionada}
                    onClick={() => abrir(o)}
                    className={cn("cursor-pointer", selecionada && "bg-primary-soft hover:bg-primary-soft")}
                  >
                    <TableCell className="pl-4 font-semibold tabular-nums">{o.numero}</TableCell>
                    <TableCell className="max-w-[320px]">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          abrir(o);
                        }}
                        className="block max-w-full truncate rounded-sm text-left font-medium hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                        aria-label={`Abrir OS ${o.numero}: ${o.titulo}`}
                      >
                        {o.titulo}
                      </button>
                      {o.fora_escopo && (
                        <Badge variant="warning" className="mt-1">
                          <FileWarning aria-hidden="true" />
                          Fora do escopo
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden max-w-[240px] truncate text-muted-foreground lg:table-cell">
                      {o.atividade ? `${o.atividade.codigo} · ${o.atividade.titulo}` : "—"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{o.executor?.nome ?? "—"}</TableCell>
                    <TableCell className="hidden text-muted-foreground xl:table-cell">
                      {formatarAgendamento(o.agendada_inicio, o.agendada_fim)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{o.horas ? formatarHoras(o.horas) : "—"}</TableCell>
                    <TableCell className="pr-4">
                      <Badge variant={s.variant}>{s.label}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <PainelOs
        projetoId={projetoId}
        osId={osSelecionada}
        papel={papel}
        userId={userId}
        inicial={linhaInicial}
        aoFechar={() => atualizarUrl({ os: null })}
      />
    </div>
  );
}

function Pilula({ ativa, onClick, rotulo, total }: { ativa: boolean; onClick: () => void; rotulo: string; total: number }) {
  return (
    <button
      type="button"
      aria-pressed={ativa}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        ativa
          ? "border-primary bg-primary-soft text-primary"
          : "border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground",
      )}
    >
      {rotulo}
      <span
        className={cn(
          "min-w-5 rounded-full px-1.5 text-[11.5px] font-semibold tabular-nums",
          ativa ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        {total}
      </span>
    </button>
  );
}

function Vazio({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
      <IconeMenu icon={ClipboardList} cor="var(--sys-orange)" tamanho={44} />
      <h2 className="mt-2 text-[15px] font-semibold">{titulo}</h2>
      <p className="max-w-md text-muted-foreground">{texto}</p>
    </CardContent>
  );
}

export function TabelaSkeleton({ linhas = 6 }: { linhas?: number }) {
  return (
    <div className="grid gap-0" aria-busy="true" aria-label="Carregando Ordens de Serviço">
      <div className="h-10 border-b border-border bg-table-head" />
      {Array.from({ length: linhas }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-0">
          <Skeleton className="h-4 w-10" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="hidden h-4 w-40 lg:block" />
          <Skeleton className="hidden h-4 w-28 md:block" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
      ))}
    </div>
  );
}
