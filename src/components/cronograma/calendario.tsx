"use client";

import "./calendario.css";

import type { DatesSetArg, DayHeaderContentArg, EventDropArg, EventInput, EventMountArg } from "@fullcalendar/core";
import ptBrLocale from "@fullcalendar/core/locales/pt-br";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin, { type EventResizeDoneArg } from "@fullcalendar/interaction";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { add, format, isSameDay } from "date-fns";
import { CalendarX2, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ptBR as ptBRDayPicker } from "react-day-picker/locale";
import { toast } from "sonner";
import { remarcarEvento } from "@/app/(app)/projetos/[id]/cronograma/acoes";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { COR_EVENTO, ROTULO_PAPEL, type EventTipo } from "@/lib/projeto/tipos";
import { cn } from "@/lib/utils";
import { chaveCronograma, type DadosCronograma } from "./dados";
import { DialogoJustificativa, type Remarcacao } from "./dialogo-justificativa";
import { datasParaCalendario, montarEventos, type EventoCronograma } from "./eventos";

export type VisaoCalendario = "dia" | "semana" | "mes";

const VIEW: Record<VisaoCalendario, string> = { dia: "timeGridDay", semana: "timeGridWeek", mes: "dayGridMonth" };
const TIPOS = Object.keys(COR_EVENTO) as EventTipo[];

type Duracao = { years: number; months: number; days: number; milliseconds: number };

/** Aplica o deslocamento do FullCalendar (arrastar/redimensionar) ao horário original. */
const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function aplicarDelta(iso: string, d: Duracao): string {
  const base = add(new Date(iso), { years: d.years, months: d.months, days: d.days });
  return new Date(base.getTime() + d.milliseconds).toISOString();
}

function rotuloPeriodo(e: EventoCronograma) {
  const fmt = e.diaInteiro ? "dd/MM/yyyy" : "dd/MM/yyyy HH:mm";
  const a = format(new Date(e.inicio), fmt);
  return e.fim && e.fim !== e.inicio ? `${a} – ${format(new Date(e.fim), fmt)}` : a;
}

export function CalendarioCronograma({
  projetoId,
  dados,
  podeEditar,
  visao,
  data,
  onData,
}: {
  projetoId: string;
  dados: DadosCronograma;
  podeEditar: boolean;
  visao: VisaoCalendario;
  data: Date;
  onData: (d: Date) => void;
}) {
  const calRef = useRef<FullCalendar>(null);
  const queryClient = useQueryClient();
  const [titulo, setTitulo] = useState("");
  const [mesMini, setMesMini] = useState(data);
  const [tipos, setTipos] = useState<Record<EventTipo, boolean>>({ atividade: true, reuniao: true, os: true, marco: true });
  const [pessoas, setPessoas] = useState<Set<string>>(new Set());
  const [pendente, setPendente] = useState<{ remarcacao: Remarcacao; reverter: () => void } | null>(null);

  // Rolagem inicial: uma hora antes de agora (dentro do horário 07–20).
  const [scrollTime] = useState(() => `${String(Math.min(19, Math.max(7, new Date().getHours() - 1))).padStart(2, "0")}:00:00`);

  const todos = useMemo(() => montarEventos(dados), [dados]);
  const pessoasComEventos = useMemo(() => {
    const ids = new Set(todos.flatMap((e) => e.pessoas));
    return dados.pessoas.filter((p) => ids.has(p.id));
  }, [todos, dados.pessoas]);

  const eventos: EventInput[] = useMemo(
    () =>
      todos
        .filter((e) => tipos[e.tipo])
        .filter((e) => pessoas.size === 0 || e.pessoas.some((p) => pessoas.has(p)))
        .map((e) => ({
          id: e.chave,
          title: e.titulo,
          ...datasParaCalendario(e),
          allDay: e.diaInteiro,
          backgroundColor: COR_EVENTO[e.tipo].cor,
          borderColor: COR_EVENTO[e.tipo].cor,
          textColor: "#fff",
          classNames: ["cron-ev", `cron-ev--${e.tipo}`],
          editable: podeEditar,
          durationEditable: podeEditar && e.redimensionavel,
          extendedProps: { evento: e },
        })),
    [todos, tipos, pessoas, podeEditar],
  );

  // Visão e data controladas de fora (seletor e minicalendário).
  useEffect(() => {
    const api = calRef.current?.getApi();
    if (api && api.view.type !== VIEW[visao]) api.changeView(VIEW[visao]);
  }, [visao]);
  useEffect(() => {
    const api = calRef.current?.getApi();
    if (api && !isSameDay(api.getDate(), data)) api.gotoDate(data);
  }, [data]);

  const mutacao = useMutation({
    mutationFn: remarcarEvento,
    onSuccess: (r) => {
      if (!r.ok) {
        pendente?.reverter();
        toast.error(r.erro);
        return;
      }
      toast.success("Cronograma atualizado e mudança registrada no histórico.");
      queryClient.invalidateQueries({ queryKey: chaveCronograma(projetoId) });
    },
    onError: () => {
      pendente?.reverter();
      toast.error("Não foi possível salvar a mudança. Tente novamente.");
    },
    onSettled: () => setPendente(null),
  });

  const api = () => calRef.current?.getApi();

  function aoMudarDatas(d: DatesSetArg) {
    setTitulo(d.view.title);
    const atual = d.view.calendar.getDate();
    if (!isSameDay(atual, data)) onData(atual);
    setMesMini(atual);
  }

  function aoSoltar(info: EventDropArg) {
    const e = info.event.extendedProps.evento as EventoCronograma;
    setPendente({
      remarcacao: {
        evento: e,
        novoInicio: aplicarDelta(e.inicio, info.delta),
        novoFim: e.fim ? aplicarDelta(e.fim, info.delta) : null,
      },
      reverter: info.revert,
    });
  }

  function aoRedimensionar(info: EventResizeDoneArg) {
    const e = info.event.extendedProps.evento as EventoCronograma;
    setPendente({
      remarcacao: {
        evento: e,
        novoInicio: aplicarDelta(e.inicio, info.startDelta),
        novoFim: e.fim ? aplicarDelta(e.fim, info.endDelta) : (info.event.end?.toISOString() ?? null),
      },
      reverter: info.revert,
    });
  }

  function aoMontarEvento(arg: EventMountArg) {
    const e = arg.event.extendedProps.evento as EventoCronograma;
    const local = e.local ? ` · ${e.local}` : "";
    arg.el.setAttribute("title", `${COR_EVENTO[e.tipo].label}: ${e.titulo}\n${rotuloPeriodo(e)}${local}`);
  }

  function cabecalhoDia(arg: DayHeaderContentArg) {
    // arg.date chega como marcador UTC (meia-noite UTC): formatar no fuso local volta um dia (UTC-3).
    // Use o dia da semana (dow) e a data UTC.
    const semana = SEMANA[arg.dow];
    if (arg.view.type === "dayGridMonth") return <span className="cron-cab-semana">{semana}</span>;
    return (
      <span className="cron-cab-dia">
        <span className="cron-cab-semana">{semana}</span>
        <span className={cn("cron-cab-numero", arg.isToday && "cron-cab-numero--hoje")}>{arg.date.getUTCDate()}</span>
      </span>
    );
  }

  const alternarPessoa = (id: string, marcado: boolean) =>
    setPessoas((atual) => {
      const novo = new Set(atual);
      if (marcado) novo.add(id);
      else novo.delete(id);
      return novo;
    });

  return (
    <div className="grid gap-4 lg:grid-cols-[264px_minmax(0,1fr)]">
      {/* Painel lateral: minicalendário e filtros */}
      <aside aria-label="Navegação e filtros do calendário" className="flex flex-col gap-4">
        <Card className="items-center p-2">
          <Calendar
            mode="single"
            locale={ptBRDayPicker}
            selected={data}
            onSelect={(d) => d && onData(d)}
            month={mesMini}
            onMonthChange={setMesMini}
            className="bg-transparent"
          />
        </Card>

        <Card className="gap-0 p-4">
          <h3 className="rotulo-secao mb-2">Tipos</h3>
          <ul className="grid gap-0.5">
            {TIPOS.map((t) => (
              <li key={t}>
                <label className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-1.5 text-[13.5px] hover:bg-muted">
                  <Checkbox
                    checked={tipos[t]}
                    onCheckedChange={(v) => setTipos((atual) => ({ ...atual, [t]: !!v }))}
                    className="data-checked:border-transparent"
                    style={tipos[t] ? { background: COR_EVENTO[t].cor, borderColor: COR_EVENTO[t].cor } : { borderColor: COR_EVENTO[t].cor }}
                  />
                  {COR_EVENTO[t].label}
                </label>
              </li>
            ))}
          </ul>

          <div className="mb-2 mt-5 flex items-center justify-between">
            <h3 className="rotulo-secao">Pessoas</h3>
            {pessoas.size > 0 && (
              <Button variant="link" size="xs" className="h-auto px-0" onClick={() => setPessoas(new Set())}>
                Mostrar todas
              </Button>
            )}
          </div>
          {pessoasComEventos.length === 0 ? (
            <p className="text-[12.5px] text-muted-foreground">
              Nenhuma pessoa ligada aos eventos. O filtro usa o responsável da atividade, o executor da OS e os participantes
              da reunião.
            </p>
          ) : (
            <ul className="grid gap-0.5">
              {pessoasComEventos.map((p) => (
                <li key={p.id}>
                  <label className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-1.5 text-[13.5px] hover:bg-muted">
                    <Checkbox checked={pessoas.has(p.id)} onCheckedChange={(v) => alternarPessoa(p.id, !!v)} />
                    <span className="min-w-0 flex-1 truncate">{p.nome}</span>
                    <span className="text-[11.5px] text-muted-foreground">{ROTULO_PAPEL[p.papel]}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {pessoas.size === 0 && pessoasComEventos.length > 0 && (
            <p className="mt-2 text-[12px] text-muted-foreground">Nenhuma marcada: mostrando todas as pessoas.</p>
          )}
        </Card>
      </aside>

      {/* Calendário */}
      <Card className="cron-calendario min-w-0 gap-0 overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <Button variant="outline" onClick={() => api()?.today()}>
            Hoje
          </Button>
          <div className="flex">
            <Button variant="ghost" size="icon" aria-label="Período anterior" onClick={() => api()?.prev()}>
              <ChevronLeft />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Próximo período" onClick={() => api()?.next()}>
              <ChevronRight />
            </Button>
          </div>
          <h2 className="text-[18px] font-semibold first-letter:uppercase" aria-live="polite">
            {titulo}
          </h2>
          {!podeEditar && (
            <span className="ml-auto text-[12.5px] text-muted-foreground">Somente leitura para o seu papel.</span>
          )}
        </div>

        {todos.length === 0 && (
          <div className="flex items-center gap-2 border-b border-border bg-table-head px-4 py-2.5 text-[13px] text-muted-foreground">
            <CalendarX2 size={16} aria-hidden="true" />
            Nenhum evento no cronograma. Cadastre datas em Documentação e EAP, agende OS ou registre reuniões em Atas.
          </div>
        )}

        <div className="px-2 pb-2">
          <FullCalendar
            ref={calRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            locale={ptBrLocale}
            initialView={VIEW[visao]}
            initialDate={data}
            headerToolbar={false}
            height={visao === "mes" ? "auto" : 720}
            events={eventos}
            editable={podeEditar}
            eventAllow={(destino, arrastado) => !!arrastado && destino.allDay === arrastado.allDay}
            eventDrop={aoSoltar}
            eventResize={aoRedimensionar}
            eventDidMount={aoMontarEvento}
            datesSet={aoMudarDatas}
            dayHeaderContent={cabecalhoDia}
            nowIndicator
            slotMinTime="07:00:00"
            slotMaxTime="20:00:00"
            scrollTime={scrollTime}
            scrollTimeReset={false}
            slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
            eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
            allDayText="Dia todo"
            dayMaxEvents
            fixedWeekCount={false}
            expandRows
          />
        </div>
      </Card>

      <DialogoJustificativa
        remarcacao={pendente?.remarcacao ?? null}
        salvando={mutacao.isPending}
        onCancelar={() => {
          pendente?.reverter();
          setPendente(null);
        }}
        onConfirmar={(justificativa) => {
          if (!pendente) return;
          const { evento, novoInicio, novoFim } = pendente.remarcacao;
          mutacao.mutate({
            projectId: projetoId,
            origem: evento.origem,
            id: evento.origemId,
            inicio: novoInicio,
            fim: novoFim,
            justificativa,
          });
        }}
      />
    </div>
  );
}
