"use client";

import "./conversas.css";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, MessagesSquare } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { IconeMenu } from "@/components/shell/icone-menu";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { pode, veProjetoInteiro } from "@/lib/projeto/permissoes";
import type { Papel } from "@/lib/projeto/tipos";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Chat } from "./chat";
import { buscarGrupos, buscarParticipantes, buscarPessoas, buscarResumo, chavesConversas } from "./dados";
import { ALTURA_CENTRAL, EsqueletoConversas } from "./esqueleto";
import { ListaGrupos, type FiltroConversas } from "./lista-grupos";
import { MonitorConversas } from "./monitor-conversas";
import { PainelGrupo } from "./painel-grupo";
import { SeloOpenWa } from "./selo-openwa";

type Props = { projetoId: string; papel: Papel; userId: string };

/** Conversas WhatsApp do projeto: grupos | mensagens em tempo real | contexto do grupo. */
export function CentralConversas(props: Props) {
  return (
    <Suspense fallback={<EsqueletoConversas />}>
      <Central {...props} />
    </Suspense>
  );
}

function Vazio({ titulo, texto, icone = MessagesSquare }: { titulo: string; texto: string; icone?: typeof MessagesSquare }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
        <IconeMenu icon={icone} cor="var(--sys-green)" tamanho={52} />
        <h2 className="mt-2 text-[17px] font-semibold">{titulo}</h2>
        <p className="max-w-md text-muted-foreground">{texto}</p>
      </CardContent>
    </Card>
  );
}

function Central({ projetoId, papel, userId }: Props) {
  const pathname = usePathname();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const permitido = veProjetoInteiro(papel);
  // Monitor (D6): só gerente, diretor e super admin. Abre por ?modo=monitor, para o link poder ser compartilhado.
  const podeMonitor = pode(papel, "conversas_monitor");
  const noMonitor = podeMonitor && params.get("modo") === "monitor";

  const grupos = useQuery({ queryKey: chavesConversas.grupos(projetoId), queryFn: () => buscarGrupos(projetoId), enabled: permitido });
  const resumo = useQuery({ queryKey: chavesConversas.resumo(projetoId), queryFn: () => buscarResumo(projetoId), enabled: permitido });
  const pessoas = useQuery({ queryKey: chavesConversas.pessoas(projetoId), queryFn: () => buscarPessoas(projetoId), enabled: permitido });

  const [filtro, setFiltro] = useState<FiltroConversas>("todos");
  const [busca, setBusca] = useState("");
  const [painel, setPainel] = useState(false);

  const lista = useMemo(() => grupos.data ?? [], [grupos.data]);
  const grupoParam = params.get("grupo");
  const grupo = lista.find((g) => g.id === grupoParam) ?? null;

  const participantes = useQuery({
    queryKey: chavesConversas.participantes(projetoId, grupo?.id ?? ""),
    queryFn: () => buscarParticipantes(grupo!.id),
    enabled: !!grupo,
  });

  const hrefGrupo = (id: string) => `${pathname}?grupo=${id}`;

  const alternarModo = podeMonitor && (
    <div role="group" aria-label="Modo da aba Conversas" className="inline-flex overflow-hidden rounded-[9px] border border-border">
      {(
        [
          [false, "Conversas", pathname],
          [true, "Monitor", `${pathname}?modo=monitor`],
        ] as const
      ).map(([monitor, rotulo, href]) => (
        <Link
          key={rotulo}
          href={href}
          aria-current={noMonitor === monitor ? "page" : undefined}
          className={cn(
            "px-3.5 py-1.5 text-[13.5px] font-semibold text-muted-foreground",
            noMonitor === monitor && "bg-primary-soft text-primary",
          )}
        >
          {rotulo}
        </Link>
      ))}
    </div>
  );

  // Tempo real da lista: qualquer mensagem nova/atualizada em grupos do projeto atualiza prévia, hora e contadores.
  const idsGrupos = lista.map((g) => g.id).sort().join(",");
  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (!idsGrupos) return;
    const supabase = createClient();
    const atualizar = () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: chavesConversas.resumo(projetoId) });
      }, 400);
    };
    const canal = supabase
      .channel(`wa-lista-${projetoId}`)
      .on("postgres_changes", { event: "*", schema: "imobproj", table: "wa_messages", filter: `group_id=in.(${idsGrupos})` }, atualizar)
      .subscribe();
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
      void supabase.removeChannel(canal);
    };
  }, [idsGrupos, projetoId, queryClient]);

  if (!permitido) {
    return (
      <Vazio
        icone={Lock}
        titulo="Conversas não disponíveis para o seu papel"
        texto="Prestadores acompanham as próprias Ordens de Serviço. As conversas dos grupos ficam com a equipe do projeto."
      />
    );
  }

  if (noMonitor) {
    return (
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {alternarModo}
          <SeloOpenWa projetoId={projetoId} />
        </div>
        <MonitorConversas projetoId={projetoId} hrefGrupo={hrefGrupo} />
      </div>
    );
  }

  if (grupos.isPending) return <EsqueletoConversas />;

  if (grupos.isError) {
    return <Vazio titulo="Não foi possível carregar as conversas" texto="Verifique sua conexão e recarregue a página." />;
  }

  if (lista.length === 0) {
    return (
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {alternarModo || <span />}
          <SeloOpenWa projetoId={projetoId} />
        </div>
        <Vazio
          titulo="Nenhum grupo de WhatsApp neste projeto"
          texto="Nenhum grupo de WhatsApp neste projeto. O super admin cria os grupos em Administração › WhatsApp OpenWA."
        />
      </div>
    );
  }

  const resumoAtual = resumo.data ?? {};
  const naoLidasTotal = lista.filter((g) => g.ativo).reduce((s, g) => s + (resumoAtual[g.id]?.nao_lidas ?? 0), 0);

  const painelGrupo = grupo && (
    <PainelGrupo projetoId={projetoId} papel={papel} grupo={grupo} resumo={resumoAtual[grupo.id]} pessoas={pessoas.data ?? []} />
  );

  return (
    <div className="cv-raiz grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex flex-wrap items-center gap-3 text-[15px] font-semibold">
          {alternarModo}
          Conversas do WhatsApp
          {naoLidasTotal > 0 && (
            <span className="ml-2 text-[13px] font-normal text-muted-foreground">
              · {naoLidasTotal} não lida{naoLidasTotal > 1 ? "s" : ""}
            </span>
          )}
        </h2>
        <SeloOpenWa projetoId={projetoId} />
      </div>

      <div
        className={cn(
          "grid overflow-hidden rounded-xl border border-border bg-card shadow-(--shadow-card)",
          "grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_300px]",
          ALTURA_CENTRAL,
        )}
      >
        {/* Esquerda: grupos (no celular some quando há um grupo aberto) */}
        <div className={cn("min-h-0", grupo ? "hidden lg:flex" : "flex", "flex-col [&>aside]:flex-1")}>
          <ListaGrupos
            grupos={lista}
            resumo={resumoAtual}
            pessoas={pessoas.data ?? []}
            userId={userId}
            filtro={filtro}
            onFiltro={setFiltro}
            busca={busca}
            onBusca={setBusca}
            selecionadoId={grupo?.id ?? null}
            hrefGrupo={hrefGrupo}
            carregando={resumo.isPending}
          />
        </div>

        {/* Centro: mensagens */}
        <div className={cn("min-h-0 min-w-0 flex-col", grupo ? "flex" : "hidden lg:flex")}>
          {grupo ? (
            <Chat
              key={grupo.id}
              projetoId={projetoId}
              papel={papel}
              userId={userId}
              grupo={grupo}
              pessoas={pessoas.data ?? []}
              participantes={participantes.data?.length ?? null}
              hrefLista={pathname}
              onAbrirPainel={() => setPainel(true)}
            />
          ) : (
            <div className="cv-mensagens grid flex-1 place-items-center p-6">
              <div className="max-w-sm rounded-xl bg-(--cv-dia) px-6 py-5 text-center shadow-(--cv-sombra)">
                <MessagesSquare size={28} aria-hidden="true" className="mx-auto text-(--cv-meta)" />
                <p className="mt-2 text-[14px] font-semibold text-(--cv-balao-texto)">Escolha um grupo</p>
                <p className="mt-1 text-[12.5px] text-(--cv-sistema-texto)">
                  As mensagens dos grupos por equipe chegam aqui em tempo real. Responda, cite mensagens e leve assuntos para a
                  próxima ata.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Direita: contexto do grupo (telas largas) */}
        <aside aria-label="Dados do grupo" className="hidden min-h-0 overflow-y-auto border-l border-border xl:block">
          {painelGrupo ?? (
            <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">
              Os dados do grupo, os participantes e a automação aparecem aqui.
            </p>
          )}
        </aside>
      </div>

      {/* Telas menores: o contexto abre numa gaveta */}
      <Sheet open={painel && !!grupo} onOpenChange={setPainel}>
        <SheetContent side="right" className="w-[340px] max-w-[90vw] overflow-y-auto p-0">
          <SheetTitle className="sr-only">Dados do grupo</SheetTitle>
          {painelGrupo}
        </SheetContent>
      </Sheet>
    </div>
  );
}
