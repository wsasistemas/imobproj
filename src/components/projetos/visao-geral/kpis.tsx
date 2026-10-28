"use client";

import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Clock, NotebookPen, TrendingUp } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { veProjetoInteiro } from "@/lib/projeto/permissoes";
import { SITUACAO_OS, type OsStatus, type Papel, type VarianteSituacao } from "@/lib/projeto/tipos";
import { createClient } from "@/lib/supabase/client";
import { BarraAvanco } from "../barra-avanco";
import { dataCurta, hojeISO, numero } from "../formatos";
import { avancoPlanejado } from "../planejado";
import { Bloco, ErroBloco } from "./bloco";

const COR_VARIANTE: Record<VarianteSituacao, string> = {
  success: "var(--success)",
  warning: "var(--warning)",
  info: "var(--info)",
  danger: "var(--danger)",
  purple: "var(--purple)",
  neutral: "var(--neutral)",
  primary: "var(--primary)",
};

type Props = { projetoId: string; papel: Papel };

/** Os quatro cartões de KPI (grid 1/2/4 colunas), cada um com a própria consulta e skeleton. */
export function KpisProjeto({ projetoId, papel }: Props) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiAvanco projetoId={projetoId} papel={papel} />
      <KpiHoras projetoId={projetoId} papel={papel} />
      <KpiOs projetoId={projetoId} papel={papel} />
      <KpiAtas projetoId={projetoId} papel={papel} />
    </div>
  );
}

type Progresso = {
  horas_orcadas_projeto: number;
  horas_orcadas_eap: number;
  horas_aprovadas: number;
  horas_apontadas: number;
  horas_fora_escopo: number;
  os_aguardando_aceite: number;
  percentual: number;
};

/** v_project_progress do projeto (compartilhada pelos KPIs de avanço e de horas). */
export function useProgressoProjeto(projetoId: string) {
  return useQuery({
    queryKey: ["projeto", projetoId, "visao-geral", "progresso"],
    queryFn: async (): Promise<Progresso | null> => {
      const { data, error } = await createClient()
        .from("v_project_progress")
        .select(
          "horas_orcadas_projeto, horas_orcadas_eap, horas_aprovadas, horas_apontadas, horas_fora_escopo, os_aguardando_aceite, percentual",
        )
        .eq("project_id", projetoId)
        .maybeSingle();
      if (error) throw error;
      return (data as Progresso | null) ?? null;
    },
  });
}

function useUltimaLinhaDeBase(projetoId: string) {
  return useQuery({
    queryKey: ["projeto", projetoId, "visao-geral", "linha-de-base"],
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("baselines")
        .select("id, numero, congelada_em, snapshot")
        .eq("project_id", projetoId)
        .order("numero", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; numero: number; congelada_em: string; snapshot: unknown } | null;
    },
  });
}

function Valor({ children, sufixo }: { children: React.ReactNode; sufixo?: string }) {
  return (
    <p className="text-[28px] leading-none font-semibold tracking-[-0.02em] tabular-nums">
      {children}
      {sufixo && <span className="ml-1 text-[15px] font-medium text-muted-foreground">{sufixo}</span>}
    </p>
  );
}

function EsqueletoKpi() {
  return (
    <div className="space-y-3" aria-busy="true">
      <Skeleton className="h-7 w-24" />
      <Skeleton className="h-2 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  );
}

// (a) Avanço físico real × planejado pela última linha de base -----------------------------------
function KpiAvanco({ projetoId, papel }: Props) {
  const progresso = useProgressoProjeto(projetoId);
  const base = useUltimaLinhaDeBase(projetoId);
  const carregando = progresso.isLoading || base.isLoading;

  const real = Number(progresso.data?.percentual ?? 0);
  const planejado = base.data ? avancoPlanejado(base.data.snapshot, hojeISO()) : null;
  const diferenca = planejado ? real - planejado.percentual : null;

  return (
    <Bloco titulo="Avanço físico" icone={TrendingUp} cor="var(--sys-blue)">
      {carregando ? (
        <EsqueletoKpi />
      ) : progresso.isError ? (
        <ErroBloco tentar={() => progresso.refetch()} />
      ) : (
        <div className="space-y-2.5">
          <div className="flex items-end justify-between gap-2">
            <Valor sufixo="%">{numero(real)}</Valor>
            {diferenca != null && (
              <Badge variant={Math.abs(diferenca) < 1 ? "info" : diferenca > 0 ? "success" : "danger"}>
                {Math.abs(diferenca) < 1
                  ? "No ritmo"
                  : `${diferenca > 0 ? "Adiantado" : "Atrasado"} ${numero(Math.abs(diferenca))} p.p.`}
              </Badge>
            )}
          </div>
          <BarraAvanco valor={real} planejado={planejado?.percentual} rotulo="Avanço físico real" mostrarValor={false} />
          {planejado && base.data ? (
            <p className="text-[12.5px] text-muted-foreground">
              Planejado para hoje: <b className="font-semibold text-foreground tabular-nums">{numero(planejado.percentual)}%</b>{" "}
              (linha de base nº {base.data.numero}, de {dataCurta(base.data.congelada_em)}). O traço na barra marca o planejado.
            </p>
          ) : (
            <p className="text-[12.5px] text-muted-foreground">
              {veProjetoInteiro(papel)
                ? "Sem linha de base para comparar. O gerente cria uma em Cronograma → Nova linha de base."
                : "Considera só as OS atribuídas a você; a comparação com a linha de base fica com a equipe do projeto."}
            </p>
          )}
        </div>
      )}
    </Bloco>
  );
}

// (b) Horas apontadas / orçadas --------------------------------------------------------------------
function KpiHoras({ projetoId, papel }: Props) {
  const { data, isLoading, isError, refetch } = useProgressoProjeto(projetoId);
  const orcadasEap = Number(data?.horas_orcadas_eap ?? 0);
  const orcadas = orcadasEap > 0 ? orcadasEap : Number(data?.horas_orcadas_projeto ?? 0);
  const apontadas = Number(data?.horas_apontadas ?? 0);
  const pct = orcadas > 0 ? (apontadas / orcadas) * 100 : 0;

  return (
    <Bloco titulo="Horas apontadas" icone={Clock} cor="var(--sys-teal)">
      {isLoading ? (
        <EsqueletoKpi />
      ) : isError ? (
        <ErroBloco tentar={() => refetch()} />
      ) : (
        <div className="space-y-2.5">
          <Valor sufixo={`/ ${numero(orcadas)} h`}>{numero(apontadas)}</Valor>
          <BarraAvanco valor={pct} rotulo="Horas apontadas sobre as orçadas" mostrarValor={false} />
          <p className="text-[12.5px] text-muted-foreground">
            <b className="font-semibold text-foreground tabular-nums">{numero(data?.horas_aprovadas)} h</b> aprovadas
            {Number(data?.horas_fora_escopo ?? 0) > 0 && <> · {numero(data?.horas_fora_escopo)} h fora do escopo</>}
            {orcadasEap === 0 && orcadas > 0 && <> · base: horas do projeto (EAP vazia)</>}
            {!veProjetoInteiro(papel) && <> · só as suas OS</>}
          </p>
        </div>
      )}
    </Bloco>
  );
}

// (c) OS por situação ------------------------------------------------------------------------------
function KpiOs({ projetoId, papel }: Props) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["projeto", projetoId, "visao-geral", "os-por-situacao"],
    queryFn: async () => {
      const { data, error } = await createClient().from("service_orders").select("status").eq("project_id", projetoId);
      if (error) throw error;
      const contagem = Object.fromEntries(Object.keys(SITUACAO_OS).map((s) => [s, 0])) as Record<OsStatus, number>;
      for (const os of (data ?? []) as { status: OsStatus }[]) contagem[os.status] = (contagem[os.status] ?? 0) + 1;
      return contagem;
    },
  });
  const total = data ? Object.values(data).reduce((a, b) => a + b, 0) : 0;
  const maior = data ? Math.max(1, ...Object.values(data)) : 1;

  return (
    <Bloco
      titulo="Ordens de Serviço"
      icone={ClipboardList}
      cor="var(--sys-orange)"
      acao={
        <Link href={`/projetos/${projetoId}/os`} className="text-[12.5px] font-medium text-primary hover:underline">
          Ver OS
        </Link>
      }
    >
      {isLoading ? (
        <EsqueletoKpi />
      ) : isError ? (
        <ErroBloco tentar={() => refetch()} />
      ) : total === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          {veProjetoInteiro(papel)
            ? "Nenhuma OS aberta ainda. O gerente cria as OS na aba Ordens de Serviço."
            : "Nenhuma OS atribuída a você neste projeto."}
        </p>
      ) : (
        <ul className="space-y-1.5" aria-label={`${total} OS por situação`}>
          {(Object.keys(SITUACAO_OS) as OsStatus[]).map((s) => {
            const n = data![s];
            return (
              <li key={s} className="grid grid-cols-[7.5rem_1fr_1.75rem] items-center gap-2 text-[12.5px]">
                <span className="truncate text-muted-foreground">{SITUACAO_OS[s].label}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${(n / maior) * 100}%`, backgroundColor: COR_VARIANTE[SITUACAO_OS[s].variant] }}
                  />
                </span>
                <span className={n > 0 ? "text-right font-semibold tabular-nums" : "text-right text-muted-foreground tabular-nums"}>
                  {n}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Bloco>
  );
}

// (d) Pendências de atas ---------------------------------------------------------------------------
function KpiAtas({ projetoId, papel }: Props) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["projeto", projetoId, "visao-geral", "pendencias-atas"],
    queryFn: async () => {
      const supabase = createClient();
      const [acoes, ciencias] = await Promise.all([
        supabase
          .from("meeting_actions")
          .select("id, prazo, meetings!inner(project_id)")
          .eq("meetings.project_id", projetoId)
          .in("status", ["aberta", "em_andamento"]),
        supabase
          .from("meeting_participants")
          .select("id, meetings!inner(project_id, status)", { count: "exact", head: true })
          .eq("meetings.project_id", projetoId)
          .eq("meetings.status", "publicada")
          .is("ciente_em", null),
      ]);
      if (acoes.error) throw acoes.error;
      if (ciencias.error) throw ciencias.error;
      const hoje = hojeISO();
      const lista = (acoes.data ?? []) as { id: string; prazo: string | null }[];
      return {
        encaminhamentos: lista.length,
        vencidos: lista.filter((a) => a.prazo && a.prazo < hoje).length,
        ciencias: ciencias.count ?? 0,
      };
    },
    enabled: veProjetoInteiro(papel),
  });
  const total = (data?.encaminhamentos ?? 0) + (data?.ciencias ?? 0);

  return (
    <Bloco
      titulo="Pendências de atas"
      icone={NotebookPen}
      cor="var(--sys-purple)"
      acao={
        veProjetoInteiro(papel) ? (
          <Link href={`/projetos/${projetoId}/atas`} className="text-[12.5px] font-medium text-primary hover:underline">
            Ver atas
          </Link>
        ) : undefined
      }
    >
      {isLoading ? (
        <EsqueletoKpi />
      ) : isError ? (
        <ErroBloco tentar={() => refetch()} />
      ) : !veProjetoInteiro(papel) ? (
        <p className="text-[13px] text-muted-foreground">As atas deste projeto não ficam visíveis para o seu papel.</p>
      ) : (
        <div className="space-y-2.5">
          <Valor sufixo={total === 1 ? "pendência" : "pendências"}>{total}</Valor>
          {total === 0 ? (
            <p className="text-[12.5px] text-muted-foreground">
              Tudo em dia: nenhum encaminhamento aberto e todos deram ciência nas atas publicadas.
            </p>
          ) : (
            <ul className="space-y-1 text-[12.5px]">
              <li className="flex justify-between gap-2">
                <span className="text-muted-foreground">Encaminhamentos abertos</span>
                <span className="font-semibold tabular-nums">
                  {data!.encaminhamentos}
                  {data!.vencidos > 0 && (
                    <Badge variant="danger" className="ml-1.5 h-5 px-1.5">
                      {data!.vencidos} vencido{data!.vencidos > 1 ? "s" : ""}
                    </Badge>
                  )}
                </span>
              </li>
              <li className="flex justify-between gap-2">
                <span className="text-muted-foreground">Ciências pendentes</span>
                <span className="font-semibold tabular-nums">{data!.ciencias}</span>
              </li>
            </ul>
          )}
        </div>
      )}
    </Bloco>
  );
}
