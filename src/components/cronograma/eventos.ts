import { addDays, format, isSameDay } from "date-fns";
import type { EventTipo } from "@/lib/projeto/tipos";
import type { DadosCronograma } from "./dados";

// Monta a lista única de eventos do calendário.
//
// Fonte principal: calendar_events (já trazem tipo e vínculos). O seed não cobre tudo
// (só parte das atividades, OS e reuniões tem calendar_event), então completamos com:
//   * folhas da EAP com datas (atividade, ou marco se is_milestone);
//   * OS com agendada_inicio;
//   * reuniões (atas) com data;
// sempre que NÃO houver um calendar_event apontando para o mesmo registro (sem duplicar).

export type OrigemEvento = "evento" | "atividade" | "os" | "reuniao";

export type EventoCronograma = {
  /** id único no calendário: "<origem>:<uuid>" */
  chave: string;
  origem: OrigemEvento;
  /** id do registro de origem (calendar_events, wbs_items, service_orders ou meetings) */
  origemId: string;
  tipo: EventTipo;
  titulo: string;
  /** ISO com fuso */
  inicio: string;
  fim: string | null;
  /** exibido na faixa "Dia todo" (atividade, marco ou evento de vários dias) */
  diaInteiro: boolean;
  local: string | null;
  /** pessoas ligadas: responsável da atividade, executor da OS, participantes da reunião */
  pessoas: string[];
  /** marcos não mudam de duração */
  redimensionavel: boolean;
};

/** "AAAA-MM-DD" + "HH:MM[:SS]" no fuso do navegador → ISO */
function isoLocal(data: string, hora = "00:00"): string {
  const [a, m, d] = data.slice(0, 10).split("-").map(Number);
  const [h, min, s] = hora.split(":").map(Number);
  return new Date(a, m - 1, d, h || 0, min || 0, s || 0).toISOString();
}

function ehDiaInteiro(tipo: EventTipo, inicio: string, fim: string | null) {
  if (tipo === "atividade" || tipo === "marco") return true;
  return !!fim && !isSameDay(new Date(inicio), new Date(fim));
}

export function montarEventos(dados: DadosCronograma): EventoCronograma[] {
  const eapPorId = new Map(dados.eap.map((w) => [w.wbs_item_id, w]));
  const osPorId = new Map(dados.os.map((o) => [o.id, o]));
  const reuniaoPorId = new Map(dados.reunioes.map((r) => [r.id, r]));

  const comEvento = { wbs: new Set<string>(), os: new Set<string>(), reuniao: new Set<string>() };
  const lista: EventoCronograma[] = [];

  const pessoasDe = (wbsId: string | null, osId: string | null, reuniaoId: string | null) => {
    const ids = new Set<string>();
    const resp = wbsId ? eapPorId.get(wbsId)?.responsavel_id : null;
    if (resp) ids.add(resp);
    const exec = osId ? osPorId.get(osId)?.executor_id : null;
    if (exec) ids.add(exec);
    if (reuniaoId) reuniaoPorId.get(reuniaoId)?.participantes.forEach((p) => ids.add(p));
    return [...ids];
  };

  for (const e of dados.eventos) {
    if (e.wbs_item_id) comEvento.wbs.add(e.wbs_item_id);
    if (e.os_id) comEvento.os.add(e.os_id);
    if (e.meeting_id) comEvento.reuniao.add(e.meeting_id);
    lista.push({
      chave: `evento:${e.id}`,
      origem: "evento",
      origemId: e.id,
      tipo: e.tipo,
      titulo: e.titulo,
      inicio: e.inicio,
      fim: e.fim,
      diaInteiro: ehDiaInteiro(e.tipo, e.inicio, e.fim),
      local: e.local,
      pessoas: pessoasDe(e.wbs_item_id, e.os_id, e.meeting_id),
      redimensionavel: e.tipo !== "marco",
    });
  }

  for (const w of dados.eap) {
    if (!w.is_folha || w.is_fase || !w.inicio || comEvento.wbs.has(w.wbs_item_id)) continue;
    const marco = w.is_milestone;
    lista.push({
      chave: `atividade:${w.wbs_item_id}`,
      origem: "atividade",
      origemId: w.wbs_item_id,
      tipo: marco ? "marco" : "atividade",
      titulo: marco ? w.titulo : `${w.codigo} ${w.titulo}`,
      inicio: isoLocal(w.inicio, marco ? "00:00" : "08:00"),
      fim: marco ? null : isoLocal(w.fim ?? w.inicio, "18:00"),
      diaInteiro: true,
      local: null,
      pessoas: w.responsavel_id ? [w.responsavel_id] : [],
      redimensionavel: !marco,
    });
  }

  for (const o of dados.os) {
    if (!o.agendada_inicio || comEvento.os.has(o.id)) continue;
    lista.push({
      chave: `os:${o.id}`,
      origem: "os",
      origemId: o.id,
      tipo: "os",
      titulo: `OS ${o.numero} · ${o.titulo}`,
      inicio: o.agendada_inicio,
      fim: o.agendada_fim,
      diaInteiro: ehDiaInteiro("os", o.agendada_inicio, o.agendada_fim),
      local: null,
      pessoas: o.executor_id ? [o.executor_id] : [],
      redimensionavel: true,
    });
  }

  for (const r of dados.reunioes) {
    if (comEvento.reuniao.has(r.id)) continue;
    const semHora = !r.inicio;
    lista.push({
      chave: `reuniao:${r.id}`,
      origem: "reuniao",
      origemId: r.id,
      tipo: "reuniao",
      titulo: r.titulo,
      inicio: isoLocal(r.data, r.inicio ?? "00:00"),
      fim: r.inicio && r.fim ? isoLocal(r.data, r.fim) : null,
      diaInteiro: semHora,
      local: r.local,
      pessoas: r.participantes,
      redimensionavel: !semHora,
    });
  }

  return lista;
}

/** Datas para o FullCalendar: dia inteiro usa "AAAA-MM-DD" com fim exclusivo. */
export function datasParaCalendario(e: EventoCronograma): { start: string; end?: string } {
  if (!e.diaInteiro) return { start: e.inicio, end: e.fim ?? undefined };
  const ini = new Date(e.inicio);
  const fim = e.fim ? new Date(e.fim) : ini;
  return { start: format(ini, "yyyy-MM-dd"), end: format(addDays(fim, 1), "yyyy-MM-dd") };
}
