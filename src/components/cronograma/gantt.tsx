"use client";

import "./gantt.css";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addDays, format, getISOWeek, startOfISOWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { FileDown, GanttChartSquare, Snowflake } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { criarLinhaDeBase } from "@/app/(app)/projetos/[id]/cronograma/acoes";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ProgressoEap } from "@/lib/projeto/tipos";
import { cn } from "@/lib/utils";
import { calcularCaminhoCritico, diaCorrido } from "./caminho-critico";
import { chaveCronograma, type DadosCronograma, type ItemLinhaDeBase } from "./dados";

// Gantt próprio (CSS grid, sem biblioteca). Um único contêiner com rolagem nos dois eixos:
// a tabela da esquerda é "sticky left" e o cabeçalho de meses/semanas é "sticky top", então a
// linha do tempo rola na horizontal sempre alinhada com as linhas da tabela.

const PX_SEMANA = 56;
const PX_DIA = PX_SEMANA / 7;
const LARGURA_TABELA = 520;
const LARGURA_PAPEL = 1040; // A4 paisagem útil (~277 mm a 96 dpi)

const horas = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const pct = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

type Linha = {
  item: ProgressoEap;
  nivel: number;
  agrupador: boolean;
  critica: boolean;
  folga: number | undefined;
  base: ItemLinhaDeBase | undefined;
};

const dataCurta = (iso: string | null | undefined) => (iso ? format(new Date(`${iso.slice(0, 10)}T12:00:00`), "dd/MM") : "—");
const dataLonga = (iso: string | null | undefined) =>
  iso ? format(new Date(`${iso.slice(0, 10)}T12:00:00`), "dd/MM/yyyy") : "—";
const hojeIso = () => format(new Date(), "yyyy-MM-dd");

/** Ordena a EAP em árvore (pai antes dos filhos, irmãos por ordem/código). */
function emArvore(eap: ProgressoEap[]) {
  const ids = new Set(eap.map((e) => e.wbs_item_id));
  const filhos = new Map<string | null, ProgressoEap[]>();
  for (const e of eap) {
    const pai = e.parent_id && ids.has(e.parent_id) ? e.parent_id : null;
    filhos.set(pai, [...(filhos.get(pai) ?? []), e]);
  }
  for (const lista of filhos.values())
    lista.sort((a, b) => a.ordem - b.ordem || a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true }));
  const saida: { item: ProgressoEap; nivel: number }[] = [];
  const visitar = (pai: string | null, nivel: number) => {
    for (const e of filhos.get(pai) ?? []) {
      saida.push({ item: e, nivel });
      visitar(e.wbs_item_id, nivel + 1);
    }
  };
  visitar(null, 0);
  return saida;
}

export function GanttCronograma({
  projetoId,
  projetoCodigo,
  dados,
  podeLinhaBase,
}: {
  projetoId: string;
  projetoCodigo: string;
  dados: DadosCronograma;
  podeLinhaBase: boolean;
}) {
  const queryClient = useQueryClient();
  const rolagemRef = useRef<HTMLDivElement>(null);
  const impressaoRef = useRef<HTMLDivElement>(null);
  const nomes = useMemo(() => new Map(dados.pessoas.map((p) => [p.id, p.nome])), [dados.pessoas]);
  const lb = dados.linhaDeBase;

  const { linhas, inicioEscala, semanas, meses, larguraTempo, xHoje } = useMemo(() => {
    // Caminho crítico sobre as folhas com datas
    const folhas = dados.eap.filter((e) => e.is_folha && !e.is_fase && e.inicio);
    const cpm = calcularCaminhoCritico(
      folhas.map((e) => ({ id: e.wbs_item_id, inicio: e.inicio!, fim: e.fim ?? e.inicio!, marco: e.is_milestone })),
      dados.dependencias,
    );

    const linhas: Linha[] = emArvore(dados.eap).map(({ item, nivel }) => ({
      item,
      nivel,
      agrupador: item.is_fase || !item.is_folha,
      critica: cpm.criticas.has(item.wbs_item_id),
      folga: cpm.folga.get(item.wbs_item_id),
      base: lb?.itens.get(item.wbs_item_id),
    }));

    // Escala: da semana do menor início à semana do maior fim (EAP + linha de base), com folga de 1 semana
    const datas = linhas.flatMap((l) => [l.item.inicio, l.item.fim, l.base?.inicio, l.base?.fim]).filter(Boolean) as string[];
    if (datas.length === 0)
      return { linhas, inicioEscala: 0, semanas: [], meses: [], larguraTempo: 0, xHoje: null as number | null };
    const dias = datas.map(diaCorrido);
    const menor = new Date(Math.min(...dias) * 86_400_000);
    const ini = addDays(startOfISOWeek(new Date(menor.getUTCFullYear(), menor.getUTCMonth(), menor.getUTCDate())), -7);
    const inicioEscala = diaCorrido(format(ini, "yyyy-MM-dd"));
    const nSemanas = Math.ceil((Math.max(...dias) + 1 - inicioEscala) / 7) + 1;

    const semanas = Array.from({ length: nSemanas }, (_, i) => {
      const d = addDays(ini, i * 7);
      return { chave: format(d, "yyyy-MM-dd"), rotulo: `S${getISOWeek(d)}`, data: format(d, "dd/MM") };
    });
    const meses: { chave: string; rotulo: string; x: number; largura: number }[] = [];
    for (let i = 0; i < nSemanas * 7; i++) {
      const d = addDays(ini, i);
      const chave = format(d, "yyyy-MM");
      const ultimo = meses.at(-1);
      if (ultimo?.chave === chave) ultimo.largura += PX_DIA;
      else meses.push({ chave, rotulo: format(d, "MMM yyyy", { locale: ptBR }), x: i * PX_DIA, largura: PX_DIA });
    }

    const larguraTempo = nSemanas * PX_SEMANA;
    const h = (diaCorrido(hojeIso()) - inicioEscala) * PX_DIA + PX_DIA / 2;
    return { linhas, inicioEscala, semanas, meses, larguraTempo, xHoje: h >= 0 && h <= larguraTempo ? h : null };
  }, [dados.eap, dados.dependencias, lb]);

  const temDatas = larguraTempo > 0;
  const x = (iso: string) => (diaCorrido(iso) - inicioEscala) * PX_DIA;

  // Abre já mostrando a semana atual
  useEffect(() => {
    const el = rolagemRef.current;
    if (el && xHoje !== null) el.scrollLeft = Math.max(0, xHoje - 3 * PX_SEMANA);
  }, [xHoje]);

  const mutacaoBase = useMutation({
    mutationFn: () => criarLinhaDeBase(projetoId),
    onSuccess: (r) => {
      if (!r.ok) return void toast.error(r.erro);
      toast.success(`Linha de base nº ${r.dados.numero} congelada.`);
      queryClient.invalidateQueries({ queryKey: chaveCronograma(projetoId) });
    },
    onError: () => toast.error("Não foi possível criar a linha de base. Tente novamente."),
  });

  function exportarPdf() {
    const el = impressaoRef.current;
    if (el) el.style.setProperty("--cron-zoom", String(Math.min(1, LARGURA_PAPEL / (LARGURA_TABELA + larguraTempo))));
    window.print();
  }

  if (!temDatas) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
          <GanttChartSquare size={40} className="text-muted-foreground" aria-hidden="true" />
          <h2 className="text-[17px] font-semibold">Nenhuma atividade com datas na EAP.</h2>
          <p className="max-w-md text-muted-foreground">
            Cadastre datas em Documentação e EAP. O Gantt mostra fases, atividades, marcos, linha de base e o caminho crítico
            calculado pelas dependências.
          </p>
          <Link href={`/projetos/${projetoId}/documentacao`} className={buttonVariants({ variant: "outline" })}>
            Ir para Documentação e EAP
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div ref={impressaoRef} className="cron-impressao grid gap-3">
      {/* Cabeçalho só na impressão */}
      <div className="cron-so-impressao">
        <h1 className="text-[16px] font-bold">{projetoCodigo} · Cronograma (Gantt)</h1>
        <p className="text-[11px]">
          Emitido em {format(new Date(), "dd/MM/yyyy HH:mm")}
          {lb ? ` · Linha de base nº ${lb.numero} (${format(new Date(lb.congelada_em), "dd/MM/yyyy")})` : ""}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Legenda />
        <div className="cron-sem-impressao ml-auto flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] text-muted-foreground">
            {lb
              ? `Linha de base nº ${lb.numero} · ${format(new Date(lb.congelada_em), "dd/MM/yyyy")}`
              : "Sem linha de base"}
          </span>
          {podeLinhaBase && (
            <AlertDialog>
              <AlertDialogTrigger render={<Button variant="outline" disabled={mutacaoBase.isPending} />}>
                <Snowflake aria-hidden="true" />
                {mutacaoBase.isPending ? "Congelando…" : "Nova linha de base"}
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Congelar nova linha de base?</AlertDialogTitle>
                  <AlertDialogDescription>
                    As datas e horas orçadas atuais de todas as atividades da EAP viram a linha de base nº{" "}
                    {(lb?.numero ?? 0) + 1}. {lb ? `A nº ${lb.numero} continua guardada no histórico. ` : ""}A linha de base
                    não pode ser alterada depois.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => mutacaoBase.mutate()}>Congelar linha de base</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <Button variant="outline" onClick={exportarPdf}>
            <FileDown aria-hidden="true" />
            Exportar PDF
          </Button>
        </div>
      </div>

      <Card className="gap-0 p-0">
        <div
          ref={rolagemRef}
          className="cron-gantt"
          style={
            {
              "--tabela": `${LARGURA_TABELA}px`,
              "--tempo": `${larguraTempo}px`,
              "--sem": `${PX_SEMANA}px`,
            } as React.CSSProperties
          }
        >
          <div className="cron-gantt-grade" role="table" aria-label="Gantt do cronograma" aria-rowcount={linhas.length + 1}>
            {/* Cabeçalho */}
            <div className="cron-g-cab" role="row">
              <div className="cron-g-esq cron-g-cab-esq" role="columnheader">
                <span>Atividade</span>
                <span>Responsável</span>
                <span>Período</span>
                <span className="text-right">%</span>
              </div>
              <div className="cron-g-tempo cron-g-cab-tempo" role="columnheader" aria-label="Linha do tempo semanal">
                <div className="cron-g-meses">
                  {meses.map((m) => (
                    <span key={m.chave} style={{ left: m.x, width: m.largura }}>
                      {m.rotulo}
                    </span>
                  ))}
                </div>
                <div className="cron-g-semanas">
                  {semanas.map((s) => (
                    <span key={s.chave} title={`Semana ${s.rotulo.slice(1)} · início ${s.data}`}>
                      <b>{s.rotulo}</b>
                      {s.data}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Linhas */}
            <div className="cron-g-corpo">
              {linhas.map((l) => (
                <LinhaGantt key={l.item.wbs_item_id} linha={l} x={x} responsavel={nomes.get(l.item.responsavel_id ?? "")} />
              ))}
              {xHoje !== null && (
                <span className="cron-g-hoje" style={{ left: `calc(var(--tabela) + ${xHoje}px)` }} aria-hidden="true">
                  <i>Hoje</i>
                </span>
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function LinhaGantt({
  linha,
  x,
  responsavel,
}: {
  linha: Linha;
  x: (iso: string) => number;
  responsavel: string | undefined;
}) {
  const { item, nivel, agrupador, critica, folga, base } = linha;
  const ini = item.inicio;
  const fim = item.fim ?? item.inicio;
  const marco = item.is_milestone && !agrupador;

  const dica = (
    <div className="grid gap-0.5 py-0.5 text-left">
      <b className="font-semibold">
        {item.codigo} {item.titulo}
      </b>
      <span>
        {marco ? `Data: ${dataLonga(ini)}` : `${dataLonga(ini)} a ${dataLonga(fim)}`}
      </span>
      {!marco && (
        <span>
          Horas: {horas.format(item.horas_aprovadas)} aprovadas de {horas.format(item.horas_orcadas)} orçadas ·{" "}
          {pct.format(item.percentual)}%
        </span>
      )}
      {base && (
        <span>
          Linha de base: {dataLonga(base.inicio)}
          {base.fim && base.fim !== base.inicio ? ` a ${dataLonga(base.fim)}` : ""}
        </span>
      )}
      {!agrupador && folga !== undefined && (
        <span>{critica ? "Caminho crítico (folga 0)" : `Folga: ${horas.format(folga)} dia(s)`}</span>
      )}
    </div>
  );

  const rotuloAcessivel = `${item.codigo} ${item.titulo}: ${marco ? dataLonga(ini) : `${dataLonga(ini)} a ${dataLonga(fim)}`}${
    marco ? "" : `, ${pct.format(item.percentual)}%`
  }${critica ? ", caminho crítico" : ""}`;

  let barra: React.ReactElement | null = null;
  if (ini && fim) {
    const esquerda = x(ini);
    const largura = x(fim) + PX_DIA - esquerda;
    if (marco) {
      barra = (
        <div
          tabIndex={0}
          aria-label={rotuloAcessivel}
          className={cn("cron-g-marco", critica && "cron-g-marco--critico")}
          style={{ left: esquerda + PX_DIA / 2 - 7 }}
        />
      );
    } else if (agrupador) {
      barra = (
        <div tabIndex={0} aria-label={rotuloAcessivel} className="cron-g-fase" style={{ left: esquerda, width: largura }} />
      );
    } else {
      barra = (
        <div
          tabIndex={0}
          aria-label={rotuloAcessivel}
          className={cn("cron-g-barra", critica && "cron-g-barra--critica")}
          style={{ left: esquerda, width: Math.max(largura, 4) }}
        >
          <i style={{ width: `${Math.min(100, item.percentual)}%` }} />
        </div>
      );
    }
  }

  return (
    <div className={cn("cron-g-linha", agrupador && "cron-g-linha--fase")} role="row">
      <div className="cron-g-esq" role="rowheader">
        <span
          className={cn("truncate", agrupador && "font-semibold", critica && "text-danger")}
          style={{ paddingLeft: nivel * 16 }}
          title={`${item.codigo} ${item.titulo}`}
        >
          <span className="mr-1.5 tabular-nums text-muted-foreground">{item.codigo}</span>
          {item.titulo}
        </span>
        <span className="truncate text-muted-foreground" title={responsavel}>
          {responsavel ?? "—"}
        </span>
        <span className="tabular-nums text-muted-foreground">
          {marco ? dataCurta(ini) : ini ? `${dataCurta(ini)} – ${dataCurta(fim)}` : "—"}
        </span>
        <span className="text-right tabular-nums">{marco ? "" : `${pct.format(item.percentual)}%`}</span>
      </div>
      <div className="cron-g-tempo" role="cell">
        {barra && (
          <Tooltip>
            <TooltipTrigger render={barra} />
            <TooltipContent>{dica}</TooltipContent>
          </Tooltip>
        )}
        {base?.inicio && !marco && (
          <span
            className="cron-g-base"
            aria-hidden="true"
            style={{ left: x(base.inicio), width: Math.max(x(base.fim ?? base.inicio) + PX_DIA - x(base.inicio), 3) }}
          />
        )}
        {base?.inicio && marco && (
          <span className="cron-g-base-marco" aria-hidden="true" style={{ left: x(base.inicio) + PX_DIA / 2 - 4 }} />
        )}
      </div>
    </div>
  );
}

function Legenda() {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-muted-foreground" aria-label="Legenda">
      <li className="flex items-center gap-1.5">
        <span className="cron-leg cron-g-fase" aria-hidden="true" /> Fase
      </li>
      <li className="flex items-center gap-1.5">
        <span className="cron-leg cron-g-barra" aria-hidden="true">
          <i style={{ width: "55%" }} />
        </span>
        Atividade (avanço)
      </li>
      <li className="flex items-center gap-1.5">
        <span className="cron-leg cron-g-barra cron-g-barra--critica" aria-hidden="true">
          <i style={{ width: "55%" }} />
        </span>
        Caminho crítico
      </li>
      <li className="flex items-center gap-1.5">
        <span className="cron-leg cron-g-base" aria-hidden="true" /> Linha de base
      </li>
      <li className="flex items-center gap-1.5">
        <span className="cron-leg cron-g-marco" aria-hidden="true" /> Marco
      </li>
      <li className="flex items-center gap-1.5">
        <span className="cron-leg cron-leg-hoje" aria-hidden="true" /> Hoje
      </li>
    </ul>
  );
}
