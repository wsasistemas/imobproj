"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpDown,
  Building2,
  CalendarPlus,
  CircleCheckBig,
  Clock,
  Hash,
  Hourglass,
  Inbox,
  ListOrdered,
  MessageSquare,
  Phone,
  RefreshCw,
  Ticket,
  User,
  UserCheck,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { assumirAtendimento } from "@/app/(app)/atendimento/acoes";
import { ErroBloco } from "@/components/cadastros/blocos";
import { executar, formatarTelefone } from "@/components/cadastros/util";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { MSG_BANCO_DESATUALIZADO, ehBancoDesatualizado } from "@/lib/acoes";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  buscarAtendentes,
  buscarConversas,
  buscarIndicadores,
  buscarSetoresMonitor,
  chavesMonitor,
  clienteEsperando,
  disponivel,
  duracao,
  horaDe,
  hrefConversa,
  minutos,
  variacao,
  type Indicadores,
  type MonitorAtendente,
  type MonitorConversa,
  type Periodo,
} from "./dados";
import { DialogoAtendimento } from "./dialogo-atendimento";
import { MeuStatus } from "./meu-status";

type Kpi = { titulo: string; ajuda: string; valor: (i: Indicadores) => number | null; formato: (v: number | null) => string; menorMelhor: boolean };

const KPIS: Kpi[] = [
  { titulo: "Conversas atendidas", ajuda: "Atendimentos encerrados no período", valor: (i) => i.atendidas, formato: (v) => String(v ?? 0), menorMelhor: false },
  { titulo: "Resolvidas no 1º atendimento", ajuda: "Sem transferência, sem voltar à fila e sem o cliente voltar em 24 h", valor: (i) => i.resolvidas1o, formato: (v) => String(v ?? 0), menorMelhor: false },
  { titulo: "Não resolvidas no 1º atendimento", ajuda: "Transferidas, devolvidas à fila ou reabertas em 24 h", valor: (i) => i.atendidas - i.resolvidas1o, formato: (v) => String(v ?? 0), menorMelhor: true },
  { titulo: "Recebidas fora do horário", ajuda: "Entraram com o setor fechado ou sem atendente online", valor: (i) => i.foraHorario, formato: (v) => String(v ?? 0), menorMelhor: true },
  { titulo: "Tempo médio de espera", ajuda: "Da entrada na fila até alguém assumir", valor: (i) => i.esperaMediaSeg, formato: minutos, menorMelhor: true },
  { titulo: "Tempo médio de atendimento", ajuda: "De assumir até encerrar", valor: (i) => i.atendimentoMedioSeg, formato: minutos, menorMelhor: true },
];

const PERIODOS: { value: Periodo; label: string }[] = [
  { value: "hoje", label: "Hoje" },
  { value: "semana", label: "Esta semana" },
  { value: "mes", label: "Este mês" },
];

// Esperas acima destes limites ficam em destaque (como os alertas do imobdesk).
const ALERTA_FILA_MS = 15 * 60_000;
const ALERTA_CLIENTE_MS = 5 * 60_000;

/** Relógio único do Monitor: os tempos de espera e duração andam a cada segundo. */
function useAgora(): number {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return agora;
}

const desde = (iso: string | null, agora: number) => (iso ? agora - new Date(iso).getTime() : 0);

/** Monitor de atendimento: indicadores, atendentes por setor, fila e conversas em atendimento, ao vivo. */
export function Monitor({ userId, podeAtender }: { userId: string; podeAtender: boolean }) {
  const ids = useId();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [setor, setSetor] = useState<string | null>(null);
  const [aberto, setAberto] = useState<MonitorConversa | null>(null);
  const agora = useAgora();

  const setores = useQuery({ queryKey: chavesMonitor.setores(), queryFn: buscarSetoresMonitor });
  const indicadores = useQuery({ queryKey: chavesMonitor.indicadores(periodo, setor), queryFn: () => buscarIndicadores(periodo, setor) });
  const atendentes = useQuery({ queryKey: chavesMonitor.atendentes(setor), queryFn: () => buscarAtendentes(setor) });
  const conversas = useQuery({ queryKey: chavesMonitor.conversas(setor), queryFn: () => buscarConversas(setor) });

  // Tempo real: qualquer mudança em atendimentos ou no status de quem atende recarrega o Monitor.
  const timer = useRef<number | null>(null);
  useEffect(() => {
    const supabase = createClient();
    const atualizar = () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void queryClient.invalidateQueries({ queryKey: chavesMonitor.tudo }), 300);
    };
    const canal = supabase
      .channel("monitor-atendimento")
      .on("postgres_changes", { event: "*", schema: "imobproj", table: "atendimentos" }, atualizar)
      .on("postgres_changes", { event: "*", schema: "imobproj", table: "atendente_status" }, atualizar)
      .subscribe();
    // "Online" vence em 5 min sem sinal: atualiza os pontos a cada minuto mesmo sem eventos.
    const relogio = window.setInterval(() => void queryClient.invalidateQueries({ queryKey: ["atendimento", "monitor", "atendentes"] }), 60_000);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
      window.clearInterval(relogio);
      void supabase.removeChannel(canal);
    };
  }, [queryClient]);

  const mAssumir = useMutation({
    mutationFn: (c: MonitorConversa) => executar(assumirAtendimento(c.atendimento_id)),
    onSuccess: (_d, c) => {
      toast.success(`Conversa assumida · ticket #${c.ticket}`);
      const href = hrefConversa(c);
      if (href) router.push(href);
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: chavesMonitor.tudo }),
  });

  const recarregar = () => void queryClient.invalidateQueries({ queryKey: chavesMonitor.tudo });

  const listaSetores = setores.data ?? [];
  const variosSetores = setor === null && listaSetores.length > 1;
  const fila = (conversas.data ?? []).filter((c) => c.status === "fila").sort((a, b) => a.entrou_fila_em.localeCompare(b.entrou_fila_em));
  const emAtendimento = (conversas.data ?? []).filter((c) => c.status === "atendimento");
  const itensSetor = [{ value: "", label: "Todos os setores" }, ...listaSetores.map((s) => ({ value: s.id, label: s.nome }))];

  if (setores.isError && ehBancoDesatualizado(setores.error)) {
    return <ErroBloco texto={MSG_BANCO_DESATUALIZADO} onTentar={() => setores.refetch()} />;
  }
  if (setores.isSuccess && listaSetores.length === 0) {
    return (
      <Card className="px-6 py-12 text-center">
        <h2 className="text-[16px] font-semibold">Nenhum setor para acompanhar</h2>
        <p className="mx-auto mt-1 max-w-lg text-muted-foreground">
          O Monitor mostra os setores que você gerencia ou atende. Cadastre um setor em Configurações › Setores e números e inclua a sua
          equipe nele.
        </p>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {listaSetores.length > 1 && (
          <Select items={itensSetor} value={setor ?? ""} onValueChange={(v) => setSetor(v ? String(v) : null)}>
            <SelectTrigger className="w-60 max-w-full" aria-label="Setor">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {itensSetor.map((i) => (
                <SelectItem key={i.value || "todos"} value={i.value}>
                  {i.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {podeAtender && <MeuStatus userId={userId} />}
      </div>

      <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <Card className="min-w-0 gap-0 py-0" aria-labelledby={`${ids}-ind`}>
          <CabecalhoCartao id={`${ids}-ind`} titulo="Principais indicadores">
            <Select items={PERIODOS} value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
              <SelectTrigger className="w-36" aria-label="Período">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIODOS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" aria-label="Atualizar" title="Atualizar" onClick={recarregar}>
              <RefreshCw aria-hidden="true" className={cn(indicadores.isFetching && "animate-spin motion-reduce:animate-none")} />
            </Button>
          </CabecalhoCartao>
          {indicadores.isError ? (
            <div className="p-4">
              <ErroBloco
                texto={ehBancoDesatualizado(indicadores.error) ? MSG_BANCO_DESATUALIZADO : "Não foi possível carregar os indicadores."}
                onTentar={() => indicadores.refetch()}
              />
            </div>
          ) : (
            <ul>
              {KPIS.map((k) => {
                const d = indicadores.data;
                const atual = d ? k.valor(d.atual) : null;
                const v = d ? variacao(atual, k.valor(d.anterior), k.menorMelhor) : null;
                return (
                  <li key={k.titulo} className="flex items-center gap-3 border-b border-border-soft px-4 py-3 last:border-b-0">
                    <div className="min-w-0 flex-1">
                      <b className="block text-[13.5px] font-semibold">{k.titulo}</b>
                      <span className="text-[12px] text-muted-foreground">{k.ajuda}</span>
                    </div>
                    <div className="text-right text-[24px] font-semibold tabular-nums">
                      {d ? k.formato(atual) : <Skeleton className="h-7 w-12" />}
                    </div>
                    <div
                      className={cn(
                        "w-16 text-right text-[11.5px] font-bold tabular-nums",
                        v?.tom === "bom" && "text-success",
                        v?.tom === "ruim" && "text-danger",
                        v?.tom === "igual" && "text-muted-foreground",
                      )}
                      title="Comparado ao mesmo trecho do período anterior"
                    >
                      {v?.texto ?? ""}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="min-w-0 gap-0 py-0" aria-labelledby={`${ids}-ag`}>
          <CabecalhoCartao id={`${ids}-ag`} titulo="Acompanhamento de atendentes" />
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-table-head">
                <tr>
                  <Th icon={UserCheck} cor="var(--sys-purple)">Atendente</Th>
                  <Th icon={Wifi} cor="var(--sys-pink)" centro>Online</Th>
                  <Th icon={CircleCheckBig} cor="var(--sys-green)" centro>Disponível</Th>
                  <Th icon={MessageSquare} cor="var(--sys-orange)" direita>Em atendimento</Th>
                  <Th icon={Hash} cor="var(--sys-indigo)" direita>Atendidas hoje</Th>
                  <Th icon={Clock} cor="var(--sys-blue)" direita>Tempo médio</Th>
                </tr>
              </thead>
              <tbody>
                {atendentes.isPending && <LinhaVazia colunas={6}>Carregando…</LinhaVazia>}
                {atendentes.isError && <LinhaVazia colunas={6}>Não foi possível carregar os atendentes.</LinhaVazia>}
                {atendentes.isSuccess && atendentes.data.length === 0 && (
                  <LinhaVazia colunas={6}>Nenhum atendente nas equipes do setor. Marque “Atende no WhatsApp” em Usuários e inclua a pessoa numa equipe do setor.</LinhaVazia>
                )}
                {agrupar(atendentes.data ?? []).map(([setorNome, lista]) => (
                  <Fragment key={setorNome}>
                    {variosSetores && (
                      <tr className="bg-table-head">
                        <td colSpan={6} className="px-3 py-2 text-[12.5px] font-semibold">
                          {setorNome}
                        </td>
                      </tr>
                    )}
                    {lista.map((a) => {
                      const disp = disponivel(a);
                      return (
                        <tr key={`${a.setor_id}-${a.usuario_id}`} className="border-t border-border-soft">
                          <td className="px-3 py-2.5 whitespace-nowrap">{a.nome}</td>
                          <td className="px-3 py-2.5 text-center">
                            <Ponto estado={a.online ? "sim" : "nao"} rotulo={a.online ? "Online" : "Offline"} />
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <Ponto estado={disp} rotulo={{ sim: "Disponível", pausa: "Em pausa", nao: "Não disponível" }[disp]} />
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {a.em_atendimento} / {a.limite}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{a.atendidas_hoje}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{minutos(a.tempo_medio_seg)}</td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border-soft px-4 py-2.5 text-[12px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Ponto estado="sim" rotulo="" decorativo />
              Sim
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Ponto estado="pausa" rotulo="" decorativo />
              Pausa
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Ponto estado="nao" rotulo="" decorativo />
              Não
            </span>
            <span>Online = tela de atendimento aberta. Disponível = apto, sem pausa, online e abaixo do limite do setor.</span>
          </div>
        </Card>
      </div>

      <Card className="min-w-0 gap-0 py-0" aria-labelledby={`${ids}-fila`}>
        <CabecalhoCartao id={`${ids}-fila`} titulo="Conversas aguardando atendimento" contagem={fila.length} />
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-table-head">
              <tr>
                <Th icon={ArrowUpDown} cor="var(--sys-blue)">Posição</Th>
                <Th icon={Ticket} cor="var(--sys-orange)">Ticket</Th>
                {variosSetores && <Th icon={Building2} cor="var(--sys-blue)">Setor</Th>}
                <Th icon={User} cor="var(--sys-purple)">Cliente</Th>
                <Th icon={Phone} cor="var(--sys-purple)">Telefone</Th>
                <Th icon={Inbox} cor="var(--sys-indigo)">Número</Th>
                <Th icon={MessageSquare} cor="var(--sys-orange)">Última mensagem</Th>
                <Th icon={ListOrdered} cor="var(--sys-blue)">Entrou na fila</Th>
                <Th icon={Hourglass} cor="var(--sys-red)">Tempo de espera</Th>
                <th className="px-3 py-2.5 text-left text-[12.5px] font-semibold text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody>
              {conversas.isError && (
                <LinhaVazia colunas={10}>
                  {ehBancoDesatualizado(conversas.error) ? MSG_BANCO_DESATUALIZADO : "Não foi possível carregar as conversas."}
                </LinhaVazia>
              )}
              {conversas.isSuccess && fila.length === 0 && <LinhaVazia colunas={10}>Ninguém aguardando.</LinhaVazia>}
              {fila.map((c, i) => {
                const espera = desde(c.entrou_fila_em, agora);
                const alerta = espera > ALERTA_FILA_MS;
                const href = hrefConversa(c);
                return (
                  <tr key={c.atendimento_id} className={cn("border-t border-border-soft", alerta && "bg-danger-bg/40")}>
                    <td className="px-3 py-2.5 tabular-nums">{i + 1}º</td>
                    <td className="px-3 py-2.5 tabular-nums">#{c.ticket}</td>
                    {variosSetores && <td className="px-3 py-2.5">{c.setor_nome}</td>}
                    <td className="px-3 py-2.5 font-semibold whitespace-nowrap">{c.cliente ?? "—"}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">{formatarTelefone(c.telefone) || "—"}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">{formatarTelefone(c.numero) || "—"}</td>
                    <td className="max-w-64 truncate px-3 py-2.5 text-muted-foreground" title={c.ultima_previa ?? undefined}>
                      {c.ultima_previa ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{horaDe(c.entrou_fila_em)}</td>
                    <td className="px-3 py-2.5">
                      <Tempo alerta={alerta}>{duracao(espera)}</Tempo>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex gap-1.5">
                        {href && (
                          <Button variant="ghost" size="sm" render={<Link href={href} />} nativeButton={false}>
                            Visualizar
                          </Button>
                        )}
                        {podeAtender && (
                          <Button size="sm" disabled={mAssumir.isPending} onClick={() => mAssumir.mutate(c)}>
                            Atender
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="min-w-0 gap-0 py-0" aria-labelledby={`${ids}-at`}>
        <CabecalhoCartao id={`${ids}-at`} titulo="Conversas em atendimento" contagem={emAtendimento.length} />
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-table-head">
              <tr>
                <Th icon={Ticket} cor="var(--sys-orange)">Ticket</Th>
                {variosSetores && <Th icon={Building2} cor="var(--sys-blue)">Setor</Th>}
                <Th icon={User} cor="var(--sys-purple)">Cliente</Th>
                <Th icon={Phone} cor="var(--sys-purple)">Telefone</Th>
                <Th icon={UserCheck} cor="var(--sys-purple)">Atendente</Th>
                <Th icon={CalendarPlus} cor="var(--sys-blue)">Início</Th>
                <Th icon={Clock} cor="var(--sys-blue)">Duração</Th>
                <Th icon={Hourglass} cor="var(--sys-red)">Cliente esperando há</Th>
                <th className="px-3 py-2.5 text-left text-[12.5px] font-semibold text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody>
              {conversas.isSuccess && emAtendimento.length === 0 && <LinhaVazia colunas={9}>Nenhuma conversa em atendimento.</LinhaVazia>}
              {emAtendimento.map((c) => {
                const esperando = clienteEsperando(c);
                const espera = esperando ? desde(c.ultima_msg_cliente_em, agora) : 0;
                const alerta = esperando && espera > ALERTA_CLIENTE_MS;
                const href = hrefConversa(c);
                return (
                  <tr key={c.atendimento_id} className={cn("border-t border-border-soft", alerta && "bg-danger-bg/40")}>
                    <td className="px-3 py-2.5 tabular-nums">#{c.ticket}</td>
                    {variosSetores && <td className="px-3 py-2.5">{c.setor_nome}</td>}
                    <td className="px-3 py-2.5 font-semibold whitespace-nowrap">{c.cliente ?? "—"}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">{formatarTelefone(c.telefone) || "—"}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {c.atendente_nome ?? "—"}
                      {c.atendente_id === userId && <span className="ml-1 text-muted-foreground">(você)</span>}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{horaDe(c.assumido_em)}</td>
                    <td className="px-3 py-2.5">
                      <Tempo>{duracao(desde(c.assumido_em, agora))}</Tempo>
                    </td>
                    <td className="px-3 py-2.5">{esperando ? <Tempo alerta={alerta}>{duracao(espera)}</Tempo> : "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex gap-1.5">
                        {href && (
                          <Button variant="ghost" size="sm" render={<Link href={href} />} nativeButton={false}>
                            Visualizar
                          </Button>
                        )}
                        <Button variant="outline" size="sm" onClick={() => setAberto(c)}>
                          Abrir / transferir
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <DialogoAtendimento
        conversa={aberto}
        atendentes={atendentes.data ?? []}
        setores={listaSetores}
        onFechar={() => setAberto(null)}
      />
    </div>
  );
}

function agrupar(lista: MonitorAtendente[]): [string, MonitorAtendente[]][] {
  const mapa = new Map<string, MonitorAtendente[]>();
  for (const a of lista) mapa.set(a.setor_nome, [...(mapa.get(a.setor_nome) ?? []), a]);
  return [...mapa.entries()];
}

function CabecalhoCartao({ id, titulo, contagem, children }: { id: string; titulo: string; contagem?: number; children?: ReactNode }) {
  return (
    <div className="flex min-h-15 flex-wrap items-center justify-between gap-2 border-b border-border-soft px-4 py-3">
      <h2 id={id} className="text-[15px] font-semibold">
        {titulo}
        {contagem !== undefined && <small className="ml-1 font-medium text-muted-foreground">· {contagem}</small>}
      </h2>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}

function Th({ icon: Icone, cor, centro, direita, children }: { icon: LucideIcon; cor: string; centro?: boolean; direita?: boolean; children: ReactNode }) {
  return (
    <th
      className={cn(
        "px-3 py-2.5 text-[12.5px] font-semibold whitespace-nowrap text-muted-foreground",
        centro ? "text-center" : direita ? "text-right" : "text-left",
      )}
    >
      <span className="inline-flex items-center gap-1.5">
        <Icone size={14} aria-hidden="true" style={{ color: cor }} />
        {children}
      </span>
    </th>
  );
}

function LinhaVazia({ colunas, children }: { colunas: number; children: ReactNode }) {
  return (
    <tr className="border-t border-border-soft">
      <td colSpan={colunas} className="px-3 py-3 text-muted-foreground">
        {children}
      </td>
    </tr>
  );
}

const COR_PONTO = { sim: "var(--sys-green)", pausa: "var(--sys-orange)", nao: "var(--sys-red)" } as const;

function Ponto({ estado, rotulo, decorativo }: { estado: "sim" | "pausa" | "nao"; rotulo: string; decorativo?: boolean }) {
  return (
    <i
      className="inline-block size-2.5 rounded-full align-middle"
      style={{ background: COR_PONTO[estado] }}
      {...(decorativo ? { "aria-hidden": true } : { role: "img", "aria-label": rotulo, title: rotulo })}
    />
  );
}

function Tempo({ alerta, children }: { alerta?: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-block rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums",
        alerta ? "bg-danger-bg text-danger" : "bg-table-head text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}
