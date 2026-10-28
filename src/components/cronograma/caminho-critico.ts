// Caminho crítico (CPM — Critical Path Method), função pura usada pelo Gantt.
//
// Algoritmo
// ---------
// Entrada: as FOLHAS da EAP com datas (fases/agrupadores ficam de fora; dependência que
// aponta para um item fora desse conjunto é ignorada) e as dependências (FS/SS/FF/SF com
// lag em dias corridos). O tempo é contínuo, em dias: uma atividade de `inicio` a `fim`
// ocupa [inicio, fim + 1) e dura (fim − inicio + 1) dias; um marco dura 0 e acontece no
// início do dia.
//
// 1. Ordenação topológica (Kahn) pelo grafo predecessora → sucessora. Itens presos num
//    ciclo não entram no cálculo (nunca ficam críticos).
// 2. Passo de ida (forward pass), CPM clássico: só as DURAÇÕES planejadas entram; as datas
//    saem da rede. ES = max(início do projeto, restrições das predecessoras); EF = ES + duração.
//    Início do projeto = menor início planejado. (Usar o início planejado de cada atividade como
//    "não começar antes de" esconderia o caminho crítico sempre que o plano tem folga entre
//    atividades; atividade sem predecessora que de fato não pode começar antes deve ganhar uma
//    dependência na EAP.) Restrições, para predecessora p e lag L:
//      FS: ES_s ≥ EF_p + L        SS: ES_s ≥ ES_p + L
//      FF: EF_s ≥ EF_p + L        SF: EF_s ≥ ES_p + L
//    (as duas últimas viram ES_s ≥ … − duração_s).
// 3. Término do projeto = maior EF.
// 4. Passo de volta (backward pass), em ordem topológica inversa: LF = min(término do
//    projeto, restrições das sucessoras); LS = LF − duração. Para sucessora s:
//      FS: LF_p ≤ LS_s − L        SS: LS_p ≤ LS_s − L
//      FF: LF_p ≤ LF_s − L        SF: LS_p ≤ LF_s − L
// 5. Folga total = LS − ES. Folga ≤ 0 (com tolerância) = atividade crítica.

import type { DependencyTipo } from "@/lib/projeto/tipos";

export type AtividadeCpm = {
  id: string;
  /** "AAAA-MM-DD" */
  inicio: string;
  /** "AAAA-MM-DD" (igual ao início no marco) */
  fim: string;
  marco: boolean;
};

export type DependenciaCpm = {
  predecessora_id: string;
  sucessora_id: string;
  tipo: DependencyTipo;
  lag_dias: number;
};

export type ResultadoCpm = {
  /** ids das atividades com folga total zero */
  criticas: Set<string>;
  /** folga total em dias, por atividade calculada */
  folga: Map<string, number>;
  /** término do projeto (dia contínuo desde a época Unix) */
  termino: number | null;
};

const DIA_MS = 86_400_000;
const TOLERANCIA = 1e-6;

/** "AAAA-MM-DD" → número de dias desde 1970-01-01 (UTC, sem fuso). */
export function diaCorrido(iso: string): number {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Math.round(Date.UTC(a, m - 1, d) / DIA_MS);
}

export function calcularCaminhoCritico(atividades: AtividadeCpm[], dependencias: DependenciaCpm[]): ResultadoCpm {
  const resultado: ResultadoCpm = { criticas: new Set(), folga: new Map(), termino: null };
  if (atividades.length === 0) return resultado;

  type No = { id: string; dur: number; es: number; ef: number; ls: number; lf: number };
  const nos = new Map<string, No>();
  let inicioProjeto = Infinity;
  for (const a of atividades) {
    const ini = diaCorrido(a.inicio);
    inicioProjeto = Math.min(inicioProjeto, ini);
    const dur = a.marco ? 0 : Math.max(1, diaCorrido(a.fim) - ini + 1);
    nos.set(a.id, { id: a.id, dur, es: ini, ef: ini + dur, ls: 0, lf: 0 });
  }

  const deps = dependencias.filter(
    (d) => nos.has(d.predecessora_id) && nos.has(d.sucessora_id) && d.predecessora_id !== d.sucessora_id,
  );
  const entrada = new Map<string, DependenciaCpm[]>(); // por sucessora
  const saida = new Map<string, DependenciaCpm[]>(); // por predecessora
  const grau = new Map<string, number>();
  for (const id of nos.keys()) {
    entrada.set(id, []);
    saida.set(id, []);
    grau.set(id, 0);
  }
  for (const d of deps) {
    entrada.get(d.sucessora_id)!.push(d);
    saida.get(d.predecessora_id)!.push(d);
    grau.set(d.sucessora_id, grau.get(d.sucessora_id)! + 1);
  }

  // 1. Kahn
  const fila = [...nos.keys()].filter((id) => grau.get(id) === 0);
  const ordem: string[] = [];
  while (fila.length) {
    const id = fila.shift()!;
    ordem.push(id);
    for (const d of saida.get(id)!) {
      const g = grau.get(d.sucessora_id)! - 1;
      grau.set(d.sucessora_id, g);
      if (g === 0) fila.push(d.sucessora_id);
    }
  }
  const calculados = new Set(ordem);

  // 2. Ida
  for (const id of ordem) {
    const n = nos.get(id)!;
    let es = inicioProjeto;
    for (const d of entrada.get(id)!) {
      const p = nos.get(d.predecessora_id)!;
      if (!calculados.has(p.id)) continue;
      const L = d.lag_dias ?? 0;
      const r =
        d.tipo === "FS" ? p.ef + L : d.tipo === "SS" ? p.es + L : d.tipo === "FF" ? p.ef + L - n.dur : p.es + L - n.dur;
      es = Math.max(es, r);
    }
    n.es = es;
    n.ef = es + n.dur;
  }

  // 3. Término
  let termino = -Infinity;
  for (const id of ordem) termino = Math.max(termino, nos.get(id)!.ef);
  if (!Number.isFinite(termino)) return resultado;
  resultado.termino = termino;

  // 4. Volta
  for (let i = ordem.length - 1; i >= 0; i--) {
    const n = nos.get(ordem[i])!;
    let lf = termino;
    for (const d of saida.get(n.id)!) {
      const s = nos.get(d.sucessora_id)!;
      if (!calculados.has(s.id)) continue;
      const L = d.lag_dias ?? 0;
      const r =
        d.tipo === "FS" ? s.ls - L : d.tipo === "SS" ? s.ls - L + n.dur : d.tipo === "FF" ? s.lf - L : s.lf - L + n.dur;
      lf = Math.min(lf, r);
    }
    n.lf = lf;
    n.ls = lf - n.dur;
  }

  // 5. Folga
  for (const id of ordem) {
    const n = nos.get(id)!;
    const folga = n.ls - n.es;
    resultado.folga.set(id, folga);
    if (folga <= TOLERANCIA) resultado.criticas.add(id);
  }
  return resultado;
}
