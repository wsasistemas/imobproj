"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, MessageCircleMore, NotebookPen, Radio } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ehBancoDesatualizado, MSG_BANCO_DESATUALIZADO } from "@/lib/acoes";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { chavesConversas, formatarTelefone, horaLista } from "./dados";

// Monitor de conversas do projeto (D6: só gerente, diretor e super admin — a função do banco também recusa os demais).
// "Online agora" = mensagem nos últimos 15 min (D4: o motor do WhatsApp não informa presença).
// 30 dias sem mensagem = foi para Anotações da equipe (D5).

type Estado = "online" | "recente" | "anotacao";

type LinhaMonitor = {
  group_id: string;
  nome: string;
  team_id: string | null;
  equipe: string;
  session_id: string | null;
  numero: string | null;
  estado: Estado;
  anotacao_desde: string | null;
  ultima_em: string | null;
  ultima_body: string | null;
  ultima_direction: "in" | "out" | null;
  ultima_autor: string | null;
  ultima_midia: boolean;
  nao_lidas: number;
  esperando_desde: string | null;
};

type Filtro = "todas" | "online" | "anotacao";

const chaveMonitor = (p: string) => [...chavesConversas.raiz(p), "monitor"] as const;

const SECOES: { estado: Estado; titulo: string; cor: string }[] = [
  { estado: "online", titulo: "Online agora", cor: "var(--sys-green)" },
  { estado: "recente", titulo: "Recentes", cor: "var(--sys-blue)" },
  { estado: "anotacao", titulo: "Foram para Anotações da equipe", cor: "var(--sys-gray)" },
];

const CORES_AVATAR = ["var(--sys-blue)", "var(--sys-teal)", "var(--sys-pink)", "var(--sys-purple)", "var(--sys-orange)", "var(--sys-green)"];

function corDoGrupo(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return CORES_AVATAR[h % CORES_AVATAR.length];
}

function iniciais(nome: string) {
  const partes = nome.replace(/[·\-–]/g, " ").split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? "") + (partes[partes.length - 1]?.[0] ?? "")).toUpperCase() || "G";
}

function minutosDesde(iso: string, agora: number) {
  return Math.max(0, Math.round((agora - new Date(iso).getTime()) / 60_000));
}

function rotuloEspera(min: number) {
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}`;
}

export function MonitorConversas({ projetoId, hrefGrupo }: { projetoId: string; hrefGrupo: (id: string) => string }) {
  const queryClient = useQueryClient();
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [equipe, setEquipe] = useState("todas");
  const [numero, setNumero] = useState("todos");
  const [agora, setAgora] = useState(() => Date.now());

  const monitor = useQuery({
    queryKey: chaveMonitor(projetoId),
    queryFn: async () => {
      const { data, error } = await createClient().rpc("conversas_monitor", { p_project_id: projetoId });
      if (error) throw error;
      return (data ?? []) as LinhaMonitor[];
    },
    refetchInterval: 60_000, // "online" envelhece sozinho
  });

  // Relógio da espera e tempo real: mensagem nova em qualquer grupo do projeto atualiza o Monitor.
  useEffect(() => {
    const t = window.setInterval(() => setAgora(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const ids = (monitor.data ?? []).map((l) => l.group_id).sort().join(",");
  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (!ids) return;
    const supabase = createClient();
    const canal = supabase
      .channel(`wa-monitor-${projetoId}`)
      .on("postgres_changes", { event: "INSERT", schema: "imobproj", table: "wa_messages", filter: `group_id=in.(${ids})` }, () => {
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => void queryClient.invalidateQueries({ queryKey: chaveMonitor(projetoId) }), 400);
      })
      .subscribe();
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
      void supabase.removeChannel(canal);
    };
  }, [ids, projetoId, queryClient]);

  const linhas = useMemo(() => monitor.data ?? [], [monitor.data]);
  const equipes = useMemo(() => Array.from(new Set(linhas.map((l) => l.equipe))).sort((a, b) => a.localeCompare(b, "pt-BR")), [linhas]);
  const numeros = useMemo(() => Array.from(new Set(linhas.map((l) => l.numero).filter((n): n is string => !!n))), [linhas]);
  const visiveis = linhas.filter((l) => (equipe === "todas" || l.equipe === equipe) && (numero === "todos" || l.numero === numero));

  if (monitor.isPending) {
    return (
      <div aria-busy="true" className="grid gap-3">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }
  if (monitor.isError) {
    const msg = ehBancoDesatualizado(monitor.error)
      ? MSG_BANCO_DESATUALIZADO
      : (monitor.error as { message?: string }).message || "Não foi possível carregar o Monitor.";
    return <p className="rounded-xl border border-border bg-card p-6 text-center text-[13.5px] text-danger">{msg}</p>;
  }

  const indicadores = [
    { rotulo: "Online agora", detalhe: "mensagem nos últimos 15 min", valor: visiveis.filter((l) => l.estado === "online").length, icone: Radio, cor: "var(--sys-green)" },
    { rotulo: "Mensagens não lidas", detalhe: "por você", valor: visiveis.filter((l) => l.estado !== "anotacao").reduce((s, l) => s + l.nao_lidas, 0), icone: MessageCircleMore, cor: "var(--sys-blue)" },
    { rotulo: "Esperando resposta", detalhe: "há mais de 30 min", valor: visiveis.filter((l) => l.esperando_desde && l.estado !== "anotacao").length, icone: Clock, cor: "var(--sys-red)" },
    { rotulo: "Foram para Anotações", detalhe: "30 dias sem mensagem", valor: visiveis.filter((l) => l.estado === "anotacao").length, icone: NotebookPen, cor: "var(--sys-gray)" },
  ];

  const selectCls = "h-9 rounded-md border border-input bg-background px-2 text-[13.5px]";

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Filtrar o Monitor" className="inline-flex overflow-hidden rounded-[9px] border border-border">
          {(
            [
              ["todas", "Todas"],
              ["online", "Online agora"],
              ["anotacao", "Foram para Anotações"],
            ] as const
          ).map(([f, rotulo]) => (
            <button
              key={f}
              type="button"
              aria-pressed={filtro === f}
              onClick={() => setFiltro(f)}
              className={cn("px-3 py-1.5 text-[13.5px] font-semibold text-muted-foreground", filtro === f && "bg-primary-soft text-primary")}
            >
              {rotulo}
            </button>
          ))}
        </div>
        <select aria-label="Filtrar por equipe" className={selectCls} value={equipe} onChange={(e) => setEquipe(e.target.value)}>
          <option value="todas">Todas as equipes</option>
          {equipes.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        {numeros.length > 1 && (
          <select aria-label="Filtrar por número" className={selectCls} value={numero} onChange={(e) => setNumero(e.target.value)}>
            <option value="todos">Todos os números</option>
            {numeros.map((n) => (
              <option key={n} value={n}>
                {formatarTelefone(n)}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {indicadores.map((k) => (
          <Card key={k.rotulo} className="flex-row items-center gap-3 p-3.5">
            <k.icone className="size-5 shrink-0" style={{ color: k.cor }} aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[22px] font-bold leading-none tabular-nums">{k.valor}</p>
              <p className="mt-1 text-[12.5px] leading-tight text-muted-foreground">
                {k.rotulo} · {k.detalhe}
              </p>
            </div>
          </Card>
        ))}
      </div>

      {visiveis.length === 0 && <p className="text-[13.5px] text-muted-foreground">Nenhum grupo neste filtro.</p>}

      {SECOES.filter((s) => filtro === "todas" || s.estado === filtro).map((s) => {
        const lista = visiveis.filter((l) => l.estado === s.estado);
        if (lista.length === 0) return null;
        return (
          <section key={s.estado} aria-label={s.titulo} className="grid gap-2.5">
            <h3 className="flex items-center gap-2 text-[12.5px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
              <span className="size-2 rounded-full" style={{ background: s.cor }} aria-hidden="true" />
              {s.titulo} · {lista.length}
            </h3>
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(290px,1fr))]">
              {lista.map((l) => (
                <CartaoConversa
                  key={l.group_id}
                  linha={l}
                  agora={agora}
                  href={l.estado === "anotacao" ? `/projetos/${projetoId}/anotacoes?grupo=${l.group_id}` : hrefGrupo(l.group_id)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function CartaoConversa({ linha: l, agora, href }: { linha: LinhaMonitor; agora: number; href: string }) {
  const esperaMin = l.esperando_desde && l.estado !== "anotacao" ? minutosDesde(l.esperando_desde, agora) : null;
  const previa = l.ultima_body?.replace(/\s+/g, " ").trim() || (l.ultima_midia ? "Foto ou arquivo" : "Sem mensagens ainda");
  const autor = l.ultima_direction === "out" ? "Portal" : l.ultima_autor;
  return (
    <Link
      href={href}
      className={cn(
        "grid gap-2 rounded-xl border border-border bg-card p-3.5 text-left transition-colors hover:border-primary-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        l.estado === "anotacao" && "opacity-80",
      )}
    >
      <div className="flex items-center gap-2.5">
        <span
          className="grid size-9 shrink-0 place-items-center rounded-full text-[13px] font-bold text-white"
          style={{ background: corDoGrupo(l.group_id) }}
          aria-hidden="true"
        >
          {iniciais(l.nome)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold">{l.nome}</span>
          <span className="block truncate text-[12px] text-muted-foreground">
            Equipe {l.equipe}
            {l.numero && ` · ${formatarTelefone(l.numero)}`}
          </span>
        </span>
        {l.nao_lidas > 0 && l.estado !== "anotacao" && (
          <span className="rounded-full bg-[#00a884] px-2 py-0.5 text-[11px] font-bold text-white" aria-label={`${l.nao_lidas} não lidas`}>
            {l.nao_lidas}
          </span>
        )}
      </div>
      <p className="line-clamp-2 min-h-[38px] text-[13px] text-muted-foreground">
        {autor && <span className="font-semibold text-foreground">{autor}: </span>}
        {previa}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {l.estado === "online" ? (
          <Badge variant="success">Online · {horaLista(l.ultima_em)}</Badge>
        ) : l.estado === "anotacao" ? (
          <Badge variant="neutral">Em Anotações · desde {horaLista(l.anotacao_desde)}</Badge>
        ) : (
          <Badge variant="info">Última: {horaLista(l.ultima_em) || "—"}</Badge>
        )}
        {esperaMin !== null && <Badge variant="danger">Esperando há {rotuloEspera(esperaMin)}</Badge>}
      </div>
    </Link>
  );
}
