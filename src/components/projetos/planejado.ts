import { differenceInCalendarDays } from "date-fns";
import { lerData } from "./formatos";

// Avanço PLANEJADO para uma data, a partir do snapshot da linha de base (baselines.snapshot).
//
// Formato do snapshot (seed / tela de Cronograma): array de itens da EAP congelados
//   { wbs_item_id, codigo, titulo, inicio, fim, horas_orcadas, is_fase, is_milestone, [parent_id] }
// Aceitamos também { itens: [...] } / { items: [...] } e "id" no lugar de "wbs_item_id".
//
// Regra: só as FOLHAS da EAP têm horas (as fases somam as filhas). Folha = item sem filhos,
// identificada por parent_id quando o snapshot traz, senão pelo código hierárquico
// (1.2 é pai de 1.2.1). Para cada folha com horas:
//   fim ≤ data            → 100% das horas previstas
//   início > data          → 0
//   em andamento           → proporcional aos dias corridos decorridos (inclusive)
//   sem datas              → entra no total, mas não conta como previsto
// planejado = soma das horas previstas até a data ÷ soma das horas das folhas × 100.

type ItemSnapshot = {
  id: string | null;
  parentId: string | null;
  codigo: string;
  inicio: string | null;
  fim: string | null;
  horas: number;
};

const texto = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v : null);

function itensDoSnapshot(snapshot: unknown): ItemSnapshot[] {
  const lista = Array.isArray(snapshot)
    ? snapshot
    : snapshot && typeof snapshot === "object"
      ? ((snapshot as Record<string, unknown>).itens ?? (snapshot as Record<string, unknown>).items)
      : null;
  if (!Array.isArray(lista)) return [];
  return lista
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x) => ({
      id: texto(x.wbs_item_id) ?? texto(x.id),
      parentId: texto(x.parent_id),
      codigo: String(x.codigo ?? ""),
      inicio: texto(x.inicio),
      fim: texto(x.fim),
      horas: Number(x.horas_orcadas ?? 0) || 0,
    }));
}

export type Planejado = { percentual: number; horasPrevistas: number; horasTotais: number };

export function avancoPlanejado(snapshot: unknown, dataISO: string): Planejado | null {
  const itens = itensDoSnapshot(snapshot);
  if (itens.length === 0) return null;

  const temParent = itens.some((i) => i.parentId);
  const pais = new Set(itens.map((i) => i.parentId).filter(Boolean));
  const ehFolha = (i: ItemSnapshot) =>
    temParent
      ? !(i.id && pais.has(i.id))
      : !itens.some((o) => o !== i && i.codigo !== "" && o.codigo.startsWith(`${i.codigo}.`));

  const data = lerData(dataISO);
  let total = 0;
  let previsto = 0;
  for (const item of itens) {
    if (!ehFolha(item) || item.horas <= 0) continue;
    total += item.horas;
    if (!item.inicio && !item.fim) continue;
    const inicio = lerData(item.inicio ?? item.fim!);
    const fim = lerData(item.fim ?? item.inicio!);
    if (differenceInCalendarDays(fim, data) <= 0) previsto += item.horas;
    else if (differenceInCalendarDays(inicio, data) > 0) continue;
    else {
      const duracao = differenceInCalendarDays(fim, inicio) + 1;
      const decorridos = differenceInCalendarDays(data, inicio) + 1;
      previsto += item.horas * Math.min(1, Math.max(0, decorridos / duracao));
    }
  }
  if (total <= 0) return null;
  return { percentual: Math.min(100, (previsto / total) * 100), horasPrevistas: previsto, horasTotais: total };
}
