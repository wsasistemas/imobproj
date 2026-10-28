"use client";

import { useQuery } from "@tanstack/react-query";
import { Building2, CalendarRange, Clock, FolderKanban, LayoutGrid, List, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/client";
import { SITUACAO_PROJETO, type ProjectStatus, type Projeto } from "@/lib/projeto/tipos";
import { cn } from "@/lib/utils";
import { BarraAvanco } from "./barra-avanco";
import { useOrganizacoes } from "./consultas";
import { numero, periodo } from "./formatos";

type Progresso = {
  project_id: string;
  horas_orcadas_projeto: number;
  horas_orcadas_eap: number;
  horas_aprovadas: number;
  os_aguardando_aceite: number;
  percentual: number;
};

type LinhaProjeto = Projeto & {
  cliente: string | null;
  percentual: number;
  horasAprovadas: number;
  horasOrcadas: number;
  osAguardando: number;
};

type Filtro = "todos" | ProjectStatus;
type Visao = "cartoes" | "tabela";

const FILTROS: { valor: Filtro; label: string }[] = [
  { valor: "todos", label: "Todos" },
  ...(Object.keys(SITUACAO_PROJETO) as ProjectStatus[]).map((s) => ({ valor: s, label: SITUACAO_PROJETO[s].label })),
];

function useProjetos() {
  return useQuery({
    queryKey: ["projetos", "lista"],
    queryFn: async () => {
      const supabase = createClient();
      const [projetos, progresso] = await Promise.all([
        supabase.from("projects").select("*").order("codigo"),
        supabase
          .from("v_project_progress")
          .select("project_id, horas_orcadas_projeto, horas_orcadas_eap, horas_aprovadas, os_aguardando_aceite, percentual"),
      ]);
      if (projetos.error) throw projetos.error;
      if (progresso.error) throw progresso.error;
      return { projetos: (projetos.data ?? []) as Projeto[], progresso: (progresso.data ?? []) as Progresso[] };
    },
  });
}

/** Lista de projetos em cartões ou tabela, com filtro por situação. A RLS só devolve os projetos do usuário. */
export function ListaProjetos({ podeCriar }: { podeCriar: boolean }) {
  const [visao, setVisao] = useState<Visao>("cartoes");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const { data, isLoading, isError, refetch } = useProjetos();
  const { data: orgs = [] } = useOrganizacoes();

  const linhas = useMemo<LinhaProjeto[]>(() => {
    if (!data) return [];
    const prog = new Map(data.progresso.map((p) => [p.project_id, p]));
    const nomeOrg = new Map(orgs.map((o) => [o.id, o.nome]));
    return data.projetos.map((p) => {
      const g = prog.get(p.id);
      const orcadasEap = Number(g?.horas_orcadas_eap ?? 0);
      return {
        ...p,
        cliente: p.cliente_org_id ? (nomeOrg.get(p.cliente_org_id) ?? null) : null,
        percentual: Number(g?.percentual ?? 0),
        horasAprovadas: Number(g?.horas_aprovadas ?? 0),
        horasOrcadas: orcadasEap > 0 ? orcadasEap : Number(p.horas_orcadas ?? 0),
        osAguardando: Number(g?.os_aguardando_aceite ?? 0),
      };
    });
  }, [data, orgs]);

  const contagem = useMemo(() => {
    const c: Record<Filtro, number> = { todos: linhas.length, planejamento: 0, execucao: 0, homologacao: 0, encerrado: 0, suspenso: 0 };
    for (const l of linhas) c[l.status] += 1;
    return c;
  }, [linhas]);

  const visiveis = filtro === "todos" ? linhas : linhas.filter((l) => l.status === filtro);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Filtrar por situação" className="flex flex-wrap gap-2">
          {FILTROS.map((f) => {
            const ativo = filtro === f.valor;
            return (
              <button
                key={f.valor}
                type="button"
                aria-pressed={ativo}
                onClick={() => setFiltro(f.valor)}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  ativo
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                )}
              >
                {f.label}
                <span className={cn("rounded-full px-1.5 text-[11px] font-semibold tabular-nums", ativo ? "bg-primary text-white" : "bg-muted")}>
                  {isLoading ? "…" : contagem[f.valor]}
                </span>
              </button>
            );
          })}
        </div>

        <div role="group" aria-label="Modo de exibição" className="inline-flex rounded-[10px] border border-border bg-card p-0.5">
          {(
            [
              { valor: "cartoes", label: "Cartões", icone: LayoutGrid },
              { valor: "tabela", label: "Tabela", icone: List },
            ] as const
          ).map(({ valor, label, icone: Icone }) => (
            <button
              key={valor}
              type="button"
              aria-pressed={visao === valor}
              onClick={() => setVisao(valor)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-[8px] px-3 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                visao === valor ? "bg-primary-soft text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icone size={15} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <EsqueletoLista visao={visao} />
      ) : isError ? (
        <div className="rounded-[12px] border border-border bg-card px-5 py-10 text-center">
          <TriangleAlert className="mx-auto mb-2 text-warning" aria-hidden="true" />
          <p className="font-medium">Não foi possível carregar os projetos agora.</p>
          <button type="button" onClick={() => refetch()} className="mt-2 text-[13px] text-primary hover:underline">
            Tentar de novo
          </button>
        </div>
      ) : linhas.length === 0 ? (
        <EstadoVazio
          titulo="Nenhum projeto por aqui ainda"
          texto={
            podeCriar
              ? "Crie o primeiro projeto em “Novo projeto”. Depois inclua a equipe e monte a EAP."
              : "Você ainda não participa de nenhum projeto. Peça ao gerente ou ao super admin para incluir você na equipe."
          }
        />
      ) : visiveis.length === 0 ? (
        <EstadoVazio
          titulo={`Nenhum projeto em “${FILTROS.find((f) => f.valor === filtro)?.label}”`}
          texto="Escolha outra situação ou volte para “Todos”."
        />
      ) : visao === "cartoes" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visiveis.map((p) => (
            <CartaoProjeto key={p.id} p={p} />
          ))}
        </div>
      ) : (
        <TabelaProjetos linhas={visiveis} />
      )}
    </div>
  );
}

function CartaoProjeto({ p }: { p: LinhaProjeto }) {
  const situacao = SITUACAO_PROJETO[p.status];
  return (
    <Link
      href={`/projetos/${p.id}`}
      className="group flex flex-col gap-3 rounded-[12px] border border-border bg-card p-4 shadow-[var(--shadow-card)] transition-colors hover:border-primary-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12.5px] font-semibold text-muted-foreground">{p.codigo}</p>
          <h2 className="truncate font-semibold group-hover:text-primary" title={p.nome}>
            {p.nome}
          </h2>
        </div>
        <Badge variant={situacao.variant}>{situacao.label}</Badge>
      </div>

      <div className="grid gap-1 text-[13px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Building2 size={14} aria-hidden="true" />
          {p.cliente ?? "Cliente não informado"}
        </span>
        <span className="flex items-center gap-1.5">
          <CalendarRange size={14} aria-hidden="true" />
          {periodo(p.inicio, p.fim)}
        </span>
      </div>

      <div>
        <div className="mb-1 flex justify-between text-[12.5px] text-muted-foreground">
          <span>Avanço físico</span>
        </div>
        <BarraAvanco valor={p.percentual} rotulo={`Avanço físico de ${p.codigo}`} />
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-3 text-[13px]">
        <span className="flex items-center gap-1.5 tabular-nums">
          <Clock size={14} className="text-muted-foreground" aria-hidden="true" />
          {numero(p.horasAprovadas)} / {numero(p.horasOrcadas)} h aprovadas
        </span>
        {p.osAguardando > 0 ? (
          <Badge variant="warning">
            {p.osAguardando} OS para aceite
          </Badge>
        ) : (
          <span className="text-muted-foreground">Sem OS para aceite</span>
        )}
      </div>
    </Link>
  );
}

function TabelaProjetos({ linhas }: { linhas: LinhaProjeto[] }) {
  const router = useRouter();
  return (
    <div className="overflow-hidden rounded-[12px] border border-border bg-card shadow-[var(--shadow-card)]">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-5">Projeto</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Período</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead className="w-[22%] min-w-40">Avanço físico</TableHead>
            <TableHead className="text-right">Horas aprovadas</TableHead>
            <TableHead className="pr-5 text-right">OS para aceite</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {linhas.map((p) => {
            const situacao = SITUACAO_PROJETO[p.status];
            return (
              <TableRow
                key={p.id}
                className="cursor-pointer"
                onClick={() => router.push(`/projetos/${p.id}`)}
              >
                <TableCell className="pl-5">
                  <Link
                    href={`/projetos/${p.id}`}
                    className="hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="font-semibold">{p.codigo}</span>
                    <span className="text-muted-foreground"> · {p.nome}</span>
                  </Link>
                </TableCell>
                <TableCell>{p.cliente ?? <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">{periodo(p.inicio, p.fim)}</TableCell>
                <TableCell>
                  <Badge variant={situacao.variant}>{situacao.label}</Badge>
                </TableCell>
                <TableCell>
                  <BarraAvanco valor={p.percentual} rotulo={`Avanço físico de ${p.codigo}`} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {numero(p.horasAprovadas)} / {numero(p.horasOrcadas)} h
                </TableCell>
                <TableCell className="pr-5 text-right">
                  {p.osAguardando > 0 ? (
                    <Badge variant="warning">{p.osAguardando}</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function EstadoVazio({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="rounded-[12px] border border-dashed border-border bg-card px-5 py-12 text-center">
      <FolderKanban className="mx-auto mb-3 size-8 text-muted-foreground" aria-hidden="true" />
      <p className="font-semibold">{titulo}</p>
      <p className="mx-auto mt-1 max-w-md text-[13.5px] text-muted-foreground">{texto}</p>
    </div>
  );
}

export function EsqueletoLista({ visao = "cartoes" }: { visao?: Visao }) {
  if (visao === "tabela") {
    return (
      <div className="space-y-2 rounded-[12px] border border-border bg-card p-4" aria-busy="true" aria-label="Carregando projetos">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Carregando projetos">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-[12px] border border-border bg-card p-4">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ))}
    </div>
  );
}
