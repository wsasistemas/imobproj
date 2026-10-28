"use client";

import { useQuery } from "@tanstack/react-query";
import { addMonths, format, isValid, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, ChevronLeft, ChevronRight, FileSpreadsheet, FileWarning, Ruler } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { IconeMenu } from "@/components/shell/icone-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/client";
import { chavesOs, formatarDataHora, formatarHoras, um } from "./dados";

// Medição do mês: horas de OS APROVADAS cujo aceite (aceite_em) caiu no mês, por pessoa e por prestador.
// OS fora do escopo não entram nos totais; aparecem à parte.

const EQUIPE_INTERNA = "Equipe interna";
const SEM_EXECUTOR = "Sem executor";

type OsMedicao = {
  id: string;
  numero: number;
  titulo: string;
  horas: number;
  aceite_em: string;
  fora_escopo: boolean;
  executorId: string | null;
  executorNome: string;
  prestador: string; // nome da organização prestadora ou "Equipe interna"
  atividade: string | null;
};

type Org = { id: string; nome: string; tipo: "executora" | "cliente" | "prestador" };
type Bruta = {
  id: string;
  numero: number;
  titulo: string;
  horas: number | string;
  aceite_em: string;
  fora_escopo: boolean;
  executor: { id: string; nome: string; organizacao: Org | Org[] | null } | { id: string; nome: string; organizacao: Org | Org[] | null }[] | null;
  atividade: { codigo: string; titulo: string } | { codigo: string; titulo: string }[] | null;
};

function limitesDoMes(mes: string) {
  const inicio = parse(`${mes}-01`, "yyyy-MM-dd", new Date());
  return { inicio, fim: addMonths(inicio, 1) };
}

async function buscarMedicao(projetoId: string, mes: string): Promise<OsMedicao[]> {
  const { inicio, fim } = limitesDoMes(mes);
  const supabase = createClient();
  const { data, error } = await supabase
    .from("service_orders")
    .select(
      "id, numero, titulo, horas, aceite_em, fora_escopo, " +
        "executor:profiles!executor_id(id, nome, organizacao:organizations!organization_id(id, nome, tipo)), " +
        "atividade:wbs_items!wbs_item_id(codigo, titulo)",
    )
    .eq("project_id", projetoId)
    .eq("status", "aprovada")
    .gte("aceite_em", inicio.toISOString())
    .lt("aceite_em", fim.toISOString())
    .order("aceite_em", { ascending: true });
  if (error) throw new Error("Não foi possível carregar a medição do mês.");
  return ((data ?? []) as unknown as Bruta[]).map((o) => {
    const ex = um(o.executor);
    const org = um(ex?.organizacao ?? null);
    const at = um(o.atividade);
    return {
      id: o.id,
      numero: o.numero,
      titulo: o.titulo,
      horas: Number(o.horas ?? 0),
      aceite_em: o.aceite_em,
      fora_escopo: o.fora_escopo,
      executorId: ex?.id ?? null,
      executorNome: ex?.nome || SEM_EXECUTOR,
      prestador: org?.tipo === "prestador" ? org.nome : EQUIPE_INTERNA,
      atividade: at ? `${at.codigo} · ${at.titulo}` : null,
    };
  });
}

type LinhaPessoa = { chave: string; nome: string; prestador: string; os: number; horas: number };
type LinhaPrestador = { nome: string; pessoas: number; os: number; horas: number };

function agregar(lista: OsMedicao[]) {
  const pessoas = new Map<string, LinhaPessoa>();
  const prestadores = new Map<string, LinhaPrestador & { ids: Set<string> }>();
  for (const o of lista) {
    const chave = o.executorId ?? SEM_EXECUTOR;
    const p = pessoas.get(chave) ?? { chave, nome: o.executorNome, prestador: o.prestador, os: 0, horas: 0 };
    p.os++;
    p.horas += o.horas;
    pessoas.set(chave, p);

    const g = prestadores.get(o.prestador) ?? { nome: o.prestador, pessoas: 0, os: 0, horas: 0, ids: new Set<string>() };
    g.ids.add(chave);
    g.pessoas = g.ids.size;
    g.os++;
    g.horas += o.horas;
    prestadores.set(o.prestador, g);
  }
  const porNome = (a: { nome: string }, b: { nome: string }) => a.nome.localeCompare(b.nome, "pt-BR");
  return {
    porPessoa: [...pessoas.values()].sort((a, b) => b.horas - a.horas || porNome(a, b)),
    // "Equipe interna" por último
    porPrestador: [...prestadores.values()]
      .map((g): LinhaPrestador => ({ nome: g.nome, pessoas: g.pessoas, os: g.os, horas: g.horas }))
      .sort((a, b) => Number(a.nome === EQUIPE_INTERNA) - Number(b.nome === EQUIPE_INTERNA) || b.horas - a.horas || porNome(a, b)),
    total: lista.reduce((s, o) => s + o.horas, 0),
  };
}

const mesAtual = () => format(new Date(), "yyyy-MM");
function mesValido(v: string | null) {
  return !!v && /^\d{4}-\d{2}$/.test(v) && isValid(parse(`${v}-01`, "yyyy-MM-dd", new Date()));
}

export function Medicao({ projetoId, codigo }: { projetoId: string; codigo: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const mesUrl = searchParams.get("mes");
  const mes = mesValido(mesUrl) ? mesUrl! : mesAtual();
  const { inicio } = limitesDoMes(mes);
  const rotuloMes = format(inicio, "MMMM 'de' yyyy", { locale: ptBR });
  const ehMesAtual = mes === mesAtual();

  const irPara = (delta: number) => {
    const novo = format(addMonths(inicio, delta), "yyyy-MM");
    router.replace(novo === mesAtual() ? pathname : `${pathname}?mes=${novo}`, { scroll: false });
  };

  const consulta = useQuery({ queryKey: chavesOs.medicao(projetoId, mes), queryFn: () => buscarMedicao(projetoId, mes) });

  const { consideradas, foraEscopo, agregado, horasFora } = useMemo(() => {
    const todas = consulta.data ?? [];
    const consideradas = todas.filter((o) => !o.fora_escopo);
    const foraEscopo = todas.filter((o) => o.fora_escopo);
    return {
      consideradas,
      foraEscopo,
      agregado: agregar(consideradas),
      horasFora: foraEscopo.reduce((s, o) => s + o.horas, 0),
    };
  }, [consulta.data]);

  function exportar() {
    try {
      const wb = XLSX.utils.book_new();
      const abaPessoa = XLSX.utils.json_to_sheet([
        ...agregado.porPessoa.map((p) => ({ Pessoa: p.nome, Prestador: p.prestador, OS: p.os, Horas: p.horas })),
        { Pessoa: "Total", Prestador: "", OS: consideradas.length, Horas: agregado.total },
      ]);
      const abaPrestador = XLSX.utils.json_to_sheet([
        ...agregado.porPrestador.map((g) => ({ Prestador: g.nome, Pessoas: g.pessoas, OS: g.os, Horas: g.horas })),
        { Prestador: "Total", Pessoas: agregado.porPessoa.length, OS: consideradas.length, Horas: agregado.total },
      ]);
      const abaOs = XLSX.utils.json_to_sheet(
        [...consideradas, ...foraEscopo].map((o) => ({
          "Nº": o.numero,
          Título: o.titulo,
          "Atividade da EAP": o.atividade ?? "",
          Executor: o.executorNome,
          Prestador: o.prestador,
          "Aprovada em": formatarDataHora(o.aceite_em),
          Horas: o.horas,
          "Fora do escopo": o.fora_escopo ? "Sim (não somada)" : "Não",
        })),
      );
      abaPessoa["!cols"] = [{ wch: 32 }, { wch: 28 }, { wch: 6 }, { wch: 10 }];
      abaPrestador["!cols"] = [{ wch: 32 }, { wch: 9 }, { wch: 6 }, { wch: 10 }];
      abaOs["!cols"] = [{ wch: 6 }, { wch: 48 }, { wch: 36 }, { wch: 26 }, { wch: 26 }, { wch: 17 }, { wch: 8 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, abaPessoa, "Por pessoa");
      XLSX.utils.book_append_sheet(wb, abaPrestador, "Por prestador");
      XLSX.utils.book_append_sheet(wb, abaOs, "OS");
      XLSX.writeFile(wb, `medicao-${codigo}-${mes}.xlsx`);
    } catch {
      toast.error("Não foi possível gerar a planilha.");
    }
  }

  const vazio = !consulta.isPending && !consulta.isError && (consulta.data?.length ?? 0) === 0;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" nativeButton={false} render={<Link href={`/projetos/${projetoId}/os`} />}>
            <ArrowLeft aria-hidden="true" />
            Ordens de Serviço
          </Button>
          <h2 className="text-[17px] font-semibold">Medição do mês</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Mês da medição" className="flex items-center gap-1 rounded-[10px] border border-border bg-card p-0.5">
            <Button variant="ghost" size="icon" aria-label="Mês anterior" onClick={() => irPara(-1)}>
              <ChevronLeft aria-hidden="true" />
            </Button>
            <span aria-live="polite" className="min-w-[150px] inline-block text-center text-[14px] font-semibold first-letter:uppercase">
              {rotuloMes}
            </span>
            <Button variant="ghost" size="icon" aria-label="Próximo mês" onClick={() => irPara(1)}>
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
          {!ehMesAtual && (
            <Button variant="outline" onClick={() => router.replace(pathname, { scroll: false })}>
              Mês atual
            </Button>
          )}
          <Button onClick={exportar} disabled={consulta.isPending || consulta.isError || vazio}>
            <FileSpreadsheet aria-hidden="true" />
            Exportar .xlsx
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="Horas aprovadas" valor={formatarHoras(agregado.total)} carregando={consulta.isPending} destaque />
        <Kpi rotulo="OS consideradas" valor={String(consideradas.length)} carregando={consulta.isPending} />
        <Kpi rotulo="Pessoas" valor={String(agregado.porPessoa.length)} carregando={consulta.isPending} />
        <Kpi
          rotulo="Fora do escopo (não somadas)"
          valor={`${formatarHoras(horasFora)} · ${foraEscopo.length} OS`}
          carregando={consulta.isPending}
        />
      </div>

      {consulta.isError ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p role="alert" className="text-danger">
              {consulta.error.message}
            </p>
            <Button variant="outline" className="mt-3" onClick={() => consulta.refetch()}>
              Tentar de novo
            </Button>
          </CardContent>
        </Card>
      ) : vazio ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <IconeMenu icon={Ruler} cor="var(--sys-teal)" tamanho={44} />
            <h3 className="mt-2 text-[15px] font-semibold">Nenhuma OS aprovada em {rotuloMes}</h3>
            <p className="max-w-md text-muted-foreground">
              A medição soma as horas das OS aprovadas pelo usuário-chave ou diretor no mês (pela data do aceite). Use ‹ ›
              para ver outros meses.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            <BlocoTabela titulo="Por pessoa" carregando={consulta.isPending}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Pessoa</TableHead>
                    <TableHead>Prestador</TableHead>
                    <TableHead className="text-right">OS</TableHead>
                    <TableHead className="pr-4 text-right">Horas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agregado.porPessoa.map((p) => (
                    <TableRow key={p.chave}>
                      <TableCell className="pl-4 font-medium">{p.nome}</TableCell>
                      <TableCell className="text-muted-foreground">{p.prestador}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.os}</TableCell>
                      <TableCell className="pr-4 text-right tabular-nums">{formatarHoras(p.horas)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="pl-4 font-semibold" colSpan={2}>
                      Total
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{consideradas.length}</TableCell>
                    <TableCell className="pr-4 text-right font-semibold tabular-nums">{formatarHoras(agregado.total)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </BlocoTabela>

            <BlocoTabela titulo="Por prestador" carregando={consulta.isPending}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Prestador</TableHead>
                    <TableHead className="text-right">Pessoas</TableHead>
                    <TableHead className="text-right">OS</TableHead>
                    <TableHead className="pr-4 text-right">Horas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agregado.porPrestador.map((g) => (
                    <TableRow key={g.nome}>
                      <TableCell className="pl-4 font-medium">{g.nome}</TableCell>
                      <TableCell className="text-right tabular-nums">{g.pessoas}</TableCell>
                      <TableCell className="text-right tabular-nums">{g.os}</TableCell>
                      <TableCell className="pr-4 text-right tabular-nums">{formatarHoras(g.horas)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="pl-4 font-semibold">Total</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{agregado.porPessoa.length}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{consideradas.length}</TableCell>
                    <TableCell className="pr-4 text-right font-semibold tabular-nums">{formatarHoras(agregado.total)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </BlocoTabela>
          </div>

          <BlocoTabela titulo="OS consideradas" carregando={consulta.isPending}>
            {consideradas.length === 0 ? (
              <p className="px-4 py-6 text-center text-muted-foreground">
                Todas as OS aprovadas neste mês estão fora do escopo; nenhuma entra na medição.
              </p>
            ) : (
              <TabelaOs projetoId={projetoId} lista={consideradas} />
            )}
          </BlocoTabela>

          {foraEscopo.length > 0 && (
            <BlocoTabela
              titulo="Fora do escopo (não somadas)"
              icone={<FileWarning className="size-4 text-warning" aria-hidden="true" />}
              carregando={false}
            >
              <TabelaOs projetoId={projetoId} lista={foraEscopo} />
            </BlocoTabela>
          )}
        </>
      )}
    </div>
  );
}

function TabelaOs({ projetoId, lista }: { projetoId: string; lista: OsMedicao[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[72px] pl-4">Nº</TableHead>
          <TableHead>Título</TableHead>
          <TableHead className="hidden lg:table-cell">Atividade da EAP</TableHead>
          <TableHead className="hidden md:table-cell">Executor</TableHead>
          <TableHead className="hidden md:table-cell">Aprovada em</TableHead>
          <TableHead className="pr-4 text-right">Horas</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lista.map((o) => (
          <TableRow key={o.id}>
            <TableCell className="pl-4 font-semibold tabular-nums">{o.numero}</TableCell>
            <TableCell className="max-w-[340px]">
              <Link href={`/projetos/${projetoId}/os?os=${o.id}`} className="block truncate font-medium hover:underline">
                {o.titulo}
              </Link>
              {o.fora_escopo && (
                <Badge variant="warning" className="mt-1">
                  Fora do escopo
                </Badge>
              )}
            </TableCell>
            <TableCell className="hidden max-w-[240px] truncate text-muted-foreground lg:table-cell">{o.atividade ?? "—"}</TableCell>
            <TableCell className="hidden md:table-cell">
              {o.executorNome}
              <span className="block text-[12px] text-muted-foreground">{o.prestador}</span>
            </TableCell>
            <TableCell className="hidden text-muted-foreground md:table-cell">{formatarDataHora(o.aceite_em)}</TableCell>
            <TableCell className="pr-4 text-right tabular-nums">{formatarHoras(o.horas)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function Kpi({ rotulo, valor, carregando, destaque }: { rotulo: string; valor: string; carregando: boolean; destaque?: boolean }) {
  return (
    <Card size="sm" className="gap-1 px-4">
      <p className="text-[12.5px] text-muted-foreground">{rotulo}</p>
      {carregando ? (
        <Skeleton className="h-7 w-24" />
      ) : (
        <p className={destaque ? "text-[22px] font-bold text-primary tabular-nums" : "text-[20px] font-semibold tabular-nums"}>
          {valor}
        </p>
      )}
    </Card>
  );
}

function BlocoTabela({
  titulo,
  icone,
  carregando,
  children,
}: {
  titulo: string;
  icone?: React.ReactNode;
  carregando: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b border-border py-3">
        <CardTitle className="flex items-center gap-2 text-[14px] font-semibold">
          {icone}
          {titulo}
        </CardTitle>
      </CardHeader>
      {carregando ? (
        <div className="grid gap-3 p-4" aria-busy="true" aria-label={`Carregando ${titulo.toLowerCase()}`}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      ) : (
        children
      )}
    </Card>
  );
}
