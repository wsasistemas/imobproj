import { CheckCircle2, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// Cena da tela de entrada (no lugar do boleto do Imobenviomassa): quadro de cronograma em Gantt inclinado
// sobre a base abóbora, com quadros desfocados nas bordas, um cartão de OS aprovada e um balão do grupo
// de WhatsApp. Dados fictícios. Estilos .ent-* em globals.css.

type Linha =
  | { tipo: "fase"; nome: string; ini: number; fim: number }
  | { tipo: "tarefa"; nome: string; ini: number; fim: number; avanco: number; critica?: boolean }
  | { tipo: "marco"; nome: string; em: number };

const LINHAS: Linha[] = [
  { tipo: "fase", nome: "1 · Levantamento", ini: 0, fim: 30 },
  { tipo: "tarefa", nome: "1.1 Processos AS-IS", ini: 0, fim: 18, avanco: 100 },
  { tipo: "tarefa", nome: "1.2 Requisitos", ini: 12, fim: 30, avanco: 70 },
  { tipo: "marco", nome: "Escopo aprovado", em: 31 },
  { tipo: "fase", nome: "2 · Desenvolvimento", ini: 32, fim: 92 },
  { tipo: "tarefa", nome: "2.1 Portal de tickets", ini: 32, fim: 70, avanco: 45, critica: true },
  { tipo: "tarefa", nome: "2.2 Integração e-mail", ini: 48, fim: 80, avanco: 20 },
  { tipo: "tarefa", nome: "2.3 Relatórios", ini: 62, fim: 92, avanco: 0, critica: true },
];
const SEMANAS = ["S40", "S41", "S42", "S43", "S44", "S45"];
const VISOES = ["Dia", "Semana", "Mês", "Gantt"];

function QuadroGantt({ linhas = LINHAS, hoje = 52 }: { linhas?: Linha[]; hoje?: number }) {
  return (
    <>
      <div className="flex items-center justify-between border-b border-[#e6e4df] px-3 py-2">
        <span className="text-[10px] font-bold">PRJ-014 · Cronograma</span>
        <span className="flex gap-1 text-[7px] font-semibold">
          {VISOES.map((v) => (
            <span
              key={v}
              className={cn(
                "rounded-full border px-1.5 py-px",
                v === "Gantt" ? "border-[oklch(0.55_0.11_250)] bg-[oklch(0.95_0.022_250)] text-[oklch(0.46_0.1_252)]" : "border-[#e2e0db] text-[#7a7670]",
              )}
            >
              {v}
            </span>
          ))}
        </span>
      </div>
      <div className="ent-gantt">
        <div className="border-r border-[#e6e4df]">
          <div className="ent-gantt-semanas !grid-cols-1">
            <span className="!border-l-0">Atividade</span>
          </div>
          {linhas.map((l) => (
            <div key={l.nome} className={cn("ent-gantt-nome", l.tipo === "fase" && "font-bold")}>
              {l.nome}
            </div>
          ))}
        </div>
        <div className="relative">
          <div className="ent-gantt-semanas">
            {SEMANAS.map((s) => (
              <span key={s}>{s}</span>
            ))}
          </div>
          {linhas.map((l) => (
            <div key={l.nome} className="ent-gantt-linha">
              {l.tipo === "fase" && (
                <span className="ent-barra ent-barra--fase" style={{ left: `${l.ini}%`, width: `${l.fim - l.ini}%` }} />
              )}
              {l.tipo === "tarefa" && (
                <span
                  className={cn("ent-barra", l.critica && "ent-barra--critica")}
                  style={{ left: `${l.ini}%`, width: `${l.fim - l.ini}%` }}
                >
                  <i style={{ width: `${l.avanco}%` }} />
                </span>
              )}
              {l.tipo === "marco" && <span className="ent-marco" style={{ left: `calc(${l.em}% - 5px)` }} />}
            </div>
          ))}
          <span className="ent-hoje" style={{ left: `${hoje}%` }} />
        </div>
      </div>
    </>
  );
}

const corTile = (c: string) => ({ ["--c" as string]: c });

/** Cena em tela cheia do painel esquerdo da entrada. Decorativa (aria-hidden). */
export function GanttIlustracao({ className }: { className?: string }) {
  return (
    <div className={cn("ent-cena overflow-hidden", className)} aria-hidden="true">
      {/* quadros desfocados nas bordas */}
      <div className="ent-quadro ent-quadro-fundo absolute -left-[12%] top-[6%] w-[46%] -rotate-[14deg]">
        <QuadroGantt linhas={LINHAS.slice(0, 5)} hoje={30} />
      </div>
      <div className="ent-quadro ent-quadro-fundo absolute -right-[14%] bottom-[8%] w-[48%] rotate-[12deg]">
        <QuadroGantt linhas={LINHAS.slice(3)} hoje={70} />
      </div>

      {/* base abóbora curva */}
      <div className="ent-base absolute bottom-[-30%] left-1/2 h-[62%] w-[120%] -translate-x-1/2 rounded-[50%]">
        <div className="ent-base-topo absolute inset-x-[6%] top-0 h-[38%] rounded-[50%]" />
      </div>

      {/* quadro principal, inclinado e flutuando */}
      <div className="absolute left-1/2 top-1/2 w-[min(78%,620px)] -translate-x-1/2 -translate-y-1/2">
        <div className="ent-flutua">
          <div className="ent-quadro [transform:rotateX(14deg)_rotateZ(-6deg)]">
            <QuadroGantt />
          </div>
        </div>

        {/* cartão: OS aprovada */}
        <div className="ent-chip ent-flutua absolute -right-[6%] -top-[16%] flex items-center gap-2 px-3 py-2 [animation-delay:-2s]">
          <span className="hig-tile size-7 rounded-lg" style={corTile("#34c759")}>
            <CheckCircle2 className="size-4" strokeWidth={2.4} />
          </span>
          <span className="leading-tight">
            <b className="block text-[11px]">OS #231 aprovada</b>
            <small className="text-[9.5px] text-[#6b6760]">+12 h no avanço físico</small>
          </span>
        </div>

        {/* balão: evidência recebida pelo grupo do WhatsApp */}
        <div className="ent-chip ent-flutua absolute -bottom-[18%] -left-[8%] flex max-w-[230px] items-start gap-2 px-3 py-2 [animation-delay:-4s]">
          <span className="hig-tile size-7 rounded-full" style={corTile("#25d366")}>
            <MessageCircle className="size-4" strokeWidth={2.4} />
          </span>
          <span className="leading-tight">
            <b className="block text-[11px]">Grupo Desenvolvimento</b>
            <small className="text-[9.5px] text-[#6b6760]">Foto da OS 233 virou evidência</small>
          </span>
        </div>
      </div>

      {/* moedas de horas */}
      <span className="ent-moeda absolute left-[14%] top-[64%] grid size-11 place-items-center rounded-full text-[12px] font-extrabold text-[oklch(0.35_0.08_45)]">
        h
      </span>
      <span className="ent-moeda absolute right-[16%] top-[22%] grid size-8 place-items-center rounded-full text-[10px] font-extrabold text-[oklch(0.35_0.08_45)] [animation-delay:-3s]">
        h
      </span>
    </div>
  );
}
