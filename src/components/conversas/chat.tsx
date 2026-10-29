"use client";

import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { Archive, ArrowDown, ArrowLeft, Info, Loader2, Paperclip, SendHorizontal, X } from "lucide-react";
import Link from "next/link";
import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { enviarMensagem, marcarComoLido, prepararAnexo } from "@/app/(app)/projetos/[id]/conversas/acoes";
import { SeloAtendimento } from "@/components/atendimento/selo-atendimento";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { pode } from "@/lib/projeto/permissoes";
import type { Papel } from "@/lib/projeto/tipos";
import { createClient } from "@/lib/supabase/client";
import { Balao, Citacao, MensagemSistema, type AcoesBalao } from "./balao";
import {
  buscarMensagens,
  chaveDia,
  chavesConversas,
  ehSistema,
  mencionaPessoa,
  previa,
  resolverAutor,
  rotuloDia,
  type GrupoWa,
  type MensagemWa,
  type PaginaMensagens,
  type PessoaProjeto,
  type ResumoConversa,
} from "./dados";
import { DialogoPendencia, useLevarParaAta } from "./dialogo-pendencia";
import { EsqueletoMensagens } from "./esqueleto";
import { AvatarGrupo, navegarRaso } from "./lista-grupos";

type Dados = InfiniteData<PaginaMensagens, string | null>;

const PERTO_DO_FIM_PX = 140;
const INTERVALO_AGRUPAR_MS = 10 * 60 * 1000;
const TAMANHO_MAX_ANEXO = 16 * 1024 * 1024;

const reduzirMovimento = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function ordenarDesc(itens: MensagemWa[]) {
  return [...itens].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
}

export function Chat({
  projetoId,
  papel,
  userId,
  grupo,
  pessoas,
  participantes,
  hrefLista,
  onAbrirPainel,
}: {
  projetoId: string;
  papel: Papel;
  userId: string;
  grupo: GrupoWa;
  pessoas: PessoaProjeto[];
  participantes: number | null;
  hrefLista: string;
  onAbrirPainel: () => void;
}) {
  const queryClient = useQueryClient();
  const chave = chavesConversas.mensagens(projetoId, grupo.id);
  const eu = pessoas.find((p) => p.userId === userId) ?? null;
  const podeResponder = pode(papel, "whatsapp_responder") && grupo.ativo;
  const podeAta = pode(papel, "ata_redigir");

  // ------------------------------------------------------------------ mensagens (paginadas)
  const consulta = useInfiniteQuery({
    queryKey: chave,
    queryFn: ({ pageParam }) => buscarMensagens(grupo.id, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (ultima) => (ultima.temMais ? (ultima.itens.at(-1)?.created_at ?? null) : undefined),
    staleTime: 60_000,
  });

  const mensagens = useMemo(() => {
    const vistos = new Set<string>();
    const lista: MensagemWa[] = [];
    for (const p of consulta.data?.pages ?? [])
      for (const m of p.itens)
        if (!vistos.has(m.id)) {
          vistos.add(m.id);
          lista.push(m);
        }
    return lista.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  }, [consulta.data]);

  const porWaId = useMemo(() => {
    const mapa = new Map<string, MensagemWa>();
    for (const m of mensagens) if (m.wa_message_id) mapa.set(m.wa_message_id, m);
    return mapa;
  }, [mensagens]);

  // ------------------------------------------------------------------ marcar como lido
  const marcar = useMutation({
    mutationFn: async () => {
      const r = await marcarComoLido({ projectId: projetoId, groupId: grupo.id });
      if (!r.ok) throw new Error(r.erro);
      return r.dados.lidoEm;
    },
    onSuccess: (lidoEm) => {
      queryClient.setQueryData<Record<string, ResumoConversa>>(chavesConversas.resumo(projetoId), (r) =>
        r?.[grupo.id] ? { ...r, [grupo.id]: { ...r[grupo.id], nao_lidas: 0, mencoes_nao_lidas: 0, last_read_at: lidoEm } } : r,
      );
    },
  });
  const marcarRef = useRef(marcar.mutate);
  useEffect(() => {
    marcarRef.current = marcar.mutate;
  }, [marcar.mutate]);
  const timerLido = useRef<number | null>(null);
  const agendarLido = useCallback(() => {
    if (timerLido.current) window.clearTimeout(timerLido.current);
    timerLido.current = window.setTimeout(() => {
      if (document.visibilityState === "visible") marcarRef.current();
    }, 700);
  }, []);
  useEffect(() => {
    agendarLido();
    const aoVoltar = () => document.visibilityState === "visible" && agendarLido();
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      if (timerLido.current) window.clearTimeout(timerLido.current);
    };
  }, [agendarLido]);

  // ------------------------------------------------------------------ rolagem
  const rolagemRef = useRef<HTMLDivElement>(null);
  const conteudoRef = useRef<HTMLDivElement>(null);
  const pertoRef = useRef(true);
  const iniciadoRef = useRef(false);
  const primeiroIdRef = useRef<string | null>(null);
  const ultimoIdRef = useRef<string | null>(null);
  const ancoraRef = useRef<{ altura: number; topo: number } | null>(null);
  const [novasAbaixo, setNovasAbaixo] = useState(0);
  const [destacada, setDestacada] = useState<string | null>(null);

  const irParaFim = useCallback((suave: boolean) => {
    const el = rolagemRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: suave && !reduzirMovimento() ? "smooth" : "auto" });
  }, []);

  useLayoutEffect(() => {
    const el = rolagemRef.current;
    if (!el || mensagens.length === 0) return;
    const primeiro = mensagens[0].id;
    const ultimo = mensagens[mensagens.length - 1];
    if (!iniciadoRef.current) {
      el.scrollTop = el.scrollHeight;
      iniciadoRef.current = true;
    } else if (primeiro !== primeiroIdRef.current && ancoraRef.current) {
      // Carregou mensagens antigas no topo: mantém o que estava na tela no mesmo lugar.
      el.scrollTop = el.scrollHeight - ancoraRef.current.altura + ancoraRef.current.topo;
      ancoraRef.current = null;
    } else if (ultimo.id !== ultimoIdRef.current) {
      if (pertoRef.current || ultimo.author_user_id === userId) irParaFim(true);
      else setNovasAbaixo((n) => n + 1);
    }
    primeiroIdRef.current = primeiro;
    ultimoIdRef.current = ultimo.id;
  }, [mensagens, userId, irParaFim]);

  // Imagens que terminam de carregar mudam a altura: se o usuário estava no fim, continua no fim.
  useEffect(() => {
    const conteudo = conteudoRef.current;
    if (!conteudo || typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver(() => {
      if (pertoRef.current && !ancoraRef.current) irParaFim(false);
    });
    obs.observe(conteudo);
    return () => obs.disconnect();
  }, [irParaFim]);

  function aoRolar() {
    const el = rolagemRef.current;
    if (!el) return;
    const perto = el.scrollHeight - el.scrollTop - el.clientHeight < PERTO_DO_FIM_PX;
    if (perto && !pertoRef.current && novasAbaixo > 0) {
      setNovasAbaixo(0);
      agendarLido();
    }
    pertoRef.current = perto;
  }

  function carregarAntigas() {
    const el = rolagemRef.current;
    if (el) ancoraRef.current = { altura: el.scrollHeight, topo: el.scrollTop };
    void consulta.fetchNextPage();
  }

  function irParaCitada(waId: string) {
    const alvo = rolagemRef.current?.querySelector<HTMLElement>(`[data-wa="${CSS.escape(waId)}"]`);
    if (!alvo) {
      toast.info(
        consulta.hasNextPage
          ? "A mensagem citada é mais antiga. Use “Carregar mensagens anteriores” no topo."
          : "A mensagem citada não está neste grupo.",
      );
      return;
    }
    alvo.scrollIntoView({ block: "center", behavior: reduzirMovimento() ? "auto" : "smooth" });
    const id = alvo.dataset.id ?? null;
    setDestacada(id);
    window.setTimeout(() => setDestacada((d) => (d === id ? null : d)), 1400);
  }

  // ------------------------------------------------------------------ tempo real (só este grupo)
  const [anuncio, setAnuncio] = useState("");
  const [aoVivo, setAoVivo] = useState(false);
  const pessoasRef = useRef(pessoas);
  useEffect(() => {
    pessoasRef.current = pessoas;
  }, [pessoas]);

  useEffect(() => {
    const supabase = createClient();
    const aplicar = (row: MensagemWa, tipo: "INSERT" | "UPDATE") => {
      queryClient.setQueryData<Dados>(chave, (d) => {
        if (!d || d.pages.length === 0) return d;
        const existe = d.pages.some((p) => p.itens.some((i) => i.id === row.id));
        if (existe)
          return { ...d, pages: d.pages.map((p) => ({ ...p, itens: p.itens.map((i) => (i.id === row.id ? { ...i, ...row } : i)) })) };
        if (tipo === "UPDATE") return d;
        const [primeira, ...resto] = d.pages;
        return { ...d, pages: [{ ...primeira, itens: ordenarDesc([row, ...primeira.itens]) }, ...resto] };
      });
    };
    const canal = supabase
      .channel(`wa-mensagens-${grupo.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "imobproj", table: "wa_messages", filter: `group_id=eq.${grupo.id}` },
        (payload) => {
          const row = payload.new as MensagemWa;
          aplicar(row, "INSERT");
          if (row.author_user_id !== userId) {
            const autor = ehSistema(row) ? "Aviso do grupo" : resolverAutor(row, pessoasRef.current).nome;
            setAnuncio(`Nova mensagem de ${autor}: ${previa(row).slice(0, 140)}`);
            if (pertoRef.current) agendarLido();
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "imobproj", table: "wa_messages", filter: `group_id=eq.${grupo.id}` },
        (payload) => aplicar(payload.new as MensagemWa, "UPDATE"),
      )
      .subscribe((status) => setAoVivo(status === "SUBSCRIBED"));
    return () => {
      void supabase.removeChannel(canal);
    };
    // chave é derivada de projetoId + grupo.id
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grupo.id, projetoId, userId, queryClient, agendarLido]);

  // ------------------------------------------------------------------ ações nas mensagens
  const [citando, setCitando] = useState<MensagemWa | null>(null);
  const [pendencia, setPendencia] = useState<MensagemWa | null>(null);
  const levar = useLevarParaAta(projetoId);
  const campoRef = useRef<HTMLTextAreaElement>(null);

  const acoes: AcoesBalao = {
    onResponder: podeResponder
      ? (m) => {
          if (!m.wa_message_id) {
            toast.info("Esta mensagem ainda não chegou ao WhatsApp; não dá para citá-la.");
            return;
          }
          setCitando(m);
          campoRef.current?.focus();
        }
      : undefined,
    onCriarPendencia: podeAta ? (m) => setPendencia(m) : undefined,
    onLevarAta: podeAta ? (m) => levar.mutate(m) : undefined,
    onIrCitada: irParaCitada,
  };

  // ------------------------------------------------------------------ render
  const tituloId = useId();
  // Separador por dia e agrupamento de balões seguidos do mesmo autor (nome só no primeiro).
  const itens = useMemo(() => {
    const chaveAutor = (x: MensagemWa) => x.author_user_id ?? x.author_phone ?? x.direction;
    return mensagens.map((m, i) => {
      const anterior = i > 0 ? mensagens[i - 1] : null;
      const novoDia = !anterior || chaveDia(anterior.created_at) !== chaveDia(m.created_at);
      const mostrarAutor =
        !anterior ||
        novoDia ||
        ehSistema(anterior) ||
        chaveAutor(anterior) !== chaveAutor(m) ||
        anterior.direction !== m.direction ||
        new Date(m.created_at).getTime() - new Date(anterior.created_at).getTime() > INTERVALO_AGRUPAR_MS;
      return { m, novoDia, mostrarAutor };
    });
  }, [mensagens]);

  return (
    <section aria-labelledby={tituloId} className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex h-15 shrink-0 items-center gap-2 border-b border-border bg-card px-2 sm:px-3">
        <Link
          href={hrefLista}
          scroll={false}
          onClick={(e) => navegarRaso(e, hrefLista)}
          aria-label="Voltar para a lista de grupos"
          className="grid size-9 shrink-0 place-items-center rounded-md hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none lg:hidden"
        >
          <ArrowLeft size={18} aria-hidden="true" />
        </Link>
        <AvatarGrupo grupo={grupo} />
        <div className="min-w-0 flex-1">
          <h2 id={tituloId} className="truncate text-[15px] leading-tight font-semibold">
            {grupo.nome}
          </h2>
          <p className="truncate text-[12px] text-muted-foreground">
            Equipe {grupo.equipe}
            {participantes !== null && ` · ${participantes} participante${participantes === 1 ? "" : "s"}`}
            {!aoVivo && consulta.isSuccess && " · reconectando…"}
          </p>
        </div>
        <SeloAtendimento grupoId={grupo.id} userId={userId} />
        <Button variant="ghost" size="icon" onClick={onAbrirPainel} aria-label="Dados do grupo" className="xl:hidden">
          <Info aria-hidden="true" />
        </Button>
      </header>

      <div className="relative min-h-0 flex-1">
        <div
          ref={rolagemRef}
          onScroll={aoRolar}
          role="region"
          aria-label={`Mensagens de ${grupo.nome}`}
          tabIndex={0}
          className="cv-mensagens absolute inset-0 overflow-y-auto overscroll-contain py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
        >
          <div ref={conteudoRef} className="pb-2">
            {consulta.isPending ? (
              <EsqueletoMensagens />
            ) : consulta.isError ? (
              <div className="m-6 rounded-lg bg-(--cv-balao) p-4 text-center text-[13px] shadow-(--cv-sombra)">
                <p className="text-danger">Não foi possível carregar as mensagens.</p>
                <Button size="sm" variant="outline" className="mt-3" onClick={() => void consulta.refetch()}>
                  Tentar de novo
                </Button>
              </div>
            ) : mensagens.length === 0 ? (
              <div className="mx-auto mt-10 max-w-sm rounded-lg bg-(--cv-dia) px-4 py-3 text-center text-[13px] text-(--cv-sistema-texto) shadow-(--cv-sombra)">
                Nenhuma mensagem neste grupo ainda. As mensagens do WhatsApp aparecem aqui em tempo real
                {podeResponder ? "; você também pode escrever abaixo." : "."}
              </div>
            ) : (
              <>
                {consulta.hasNextPage ? (
                  <div className="flex justify-center py-2">
                    <Button size="sm" variant="outline" onClick={carregarAntigas} disabled={consulta.isFetchingNextPage} className="rounded-full">
                      {consulta.isFetchingNextPage ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                      {consulta.isFetchingNextPage ? "Carregando…" : "Carregar mensagens anteriores"}
                    </Button>
                  </div>
                ) : (
                  <p className="mx-auto my-2 w-fit rounded-lg bg-(--cv-sistema) px-3 py-1 text-center text-[11.5px] text-(--cv-sistema-texto) shadow-(--cv-sombra)">
                    Início da conversa
                  </p>
                )}
                {itens.map(({ m, novoDia, mostrarAutor }) => {
                  const sistema = ehSistema(m);
                  const meu = m.author_user_id === userId;
                  return (
                    <Fragment key={m.id}>
                      {novoDia && (
                        <div className="sticky top-1 z-[1] my-2 flex justify-center" role="separator" aria-label={rotuloDia(m.created_at)}>
                          <span className="rounded-lg bg-(--cv-dia) px-3 py-1 text-[12px] font-medium text-(--cv-sistema-texto) inline-block first-letter:uppercase shadow-(--cv-sombra)">
                            {rotuloDia(m.created_at)}
                          </span>
                        </div>
                      )}
                      <div data-wa={m.wa_message_id ?? undefined} data-id={m.id}>
                        {sistema ? (
                          <MensagemSistema m={m} />
                        ) : (
                          <Balao
                            projetoId={projetoId}
                            m={m}
                            autor={resolverAutor(m, pessoas)}
                            meu={meu}
                            mostrarAutor={mostrarAutor}
                            mencionaMe={!meu && mencionaPessoa(m.body, eu)}
                            citada={m.quoted_wa_message_id ? porWaId.get(m.quoted_wa_message_id) : undefined}
                            pessoas={pessoas}
                            userId={userId}
                            acoes={acoes}
                            destacada={destacada === m.id}
                          />
                        )}
                      </div>
                    </Fragment>
                  );
                })}
              </>
            )}
          </div>
        </div>

        {novasAbaixo > 0 && (
          <button
            type="button"
            onClick={() => {
              irParaFim(true);
              setNovasAbaixo(0);
              agendarLido();
            }}
            className="absolute right-4 bottom-4 inline-flex h-9 items-center gap-1.5 rounded-full bg-card px-3 text-[12.5px] font-semibold shadow-(--shadow-pop) ring-1 ring-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <ArrowDown size={15} aria-hidden="true" />
            {novasAbaixo} nova{novasAbaixo > 1 ? "s" : ""}
          </button>
        )}
      </div>

      {/* Leitor de tela: avisa só as mensagens novas que chegam em tempo real. */}
      <p aria-live="polite" role="status" className="sr-only">
        {anuncio}
      </p>

      <Composer
        projetoId={projetoId}
        grupo={grupo}
        papel={papel}
        podeResponder={podeResponder}
        citando={citando}
        onLimparCitacao={() => setCitando(null)}
        pessoas={pessoas}
        userId={userId}
        campoRef={campoRef}
        aoEnviar={(aoVivoAgora) => {
          pertoRef.current = true;
          if (!aoVivoAgora) void queryClient.invalidateQueries({ queryKey: chave });
        }}
        aoVivo={aoVivo}
      />

      <DialogoPendencia
        projetoId={projetoId}
        mensagem={pendencia}
        autorNome={pendencia ? (pendencia.author_user_id === userId ? "Você" : resolverAutor(pendencia, pessoas).nome) : ""}
        pessoas={pessoas}
        onFechar={() => setPendencia(null)}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Campo de envio
// ---------------------------------------------------------------------------------------------
function Composer({
  projetoId,
  grupo,
  papel,
  podeResponder,
  citando,
  onLimparCitacao,
  pessoas,
  userId,
  campoRef,
  aoEnviar,
  aoVivo,
}: {
  projetoId: string;
  grupo: GrupoWa;
  papel: Papel;
  podeResponder: boolean;
  citando: MensagemWa | null;
  onLimparCitacao: () => void;
  pessoas: PessoaProjeto[];
  userId: string;
  campoRef: React.RefObject<HTMLTextAreaElement | null>;
  aoEnviar: (aoVivo: boolean) => void;
  aoVivo: boolean;
}) {
  const ids = useId();
  const [texto, setTexto] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);

  const ajustarAltura = useCallback(() => {
    const el = campoRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [campoRef]);
  useLayoutEffect(ajustarAltura, [texto, ajustarAltura]);

  const envio = useMutation({
    mutationFn: async (v: { texto: string; arquivo: File | null; citando: MensagemWa | null }) => {
      let mediaPath: string | null = null;
      if (v.arquivo) {
        const prep = await prepararAnexo({
          projectId: projetoId,
          groupId: grupo.id,
          nomeArquivo: v.arquivo.name,
          tamanho: v.arquivo.size,
        });
        if (!prep.ok) throw new Error(prep.erro);
        const { error } = await createClient()
          .storage.from(prep.dados.bucket)
          .uploadToSignedUrl(prep.dados.caminho, prep.dados.token, v.arquivo, { contentType: v.arquivo.type || undefined });
        if (error) throw new Error("Não foi possível subir o arquivo. Tente de novo.");
        mediaPath = prep.dados.mediaPath;
      }
      const r = await enviarMensagem({
        projectId: projetoId,
        groupId: grupo.id,
        body: v.texto,
        mediaPath,
        quotedWaMessageId: v.citando?.wa_message_id ?? null,
      });
      if (!r.ok) throw new Error(r.erro);
      return r.dados;
    },
    onSuccess: (r) => {
      setTexto("");
      setArquivo(null);
      onLimparCitacao();
      aoEnviar(aoVivo);
      if (!r.enviadaAgora)
        toast.info("Mensagem na fila. O OpenWA não respondeu agora: reenviamos a cada 2 minutos, até 5 tentativas.");
      campoRef.current?.focus();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível enviar a mensagem."),
  });

  function enviar() {
    if (envio.isPending) return;
    if (!texto.trim() && !arquivo) return;
    envio.mutate({ texto, arquivo, citando });
  }

  function teclas(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      enviar();
    }
    if (e.key === "Escape" && citando) onLimparCitacao();
  }

  if (!podeResponder) {
    return (
      <div className="flex min-h-14 shrink-0 items-center justify-center gap-2 border-t border-border bg-card px-4 py-3 text-center text-[13px] text-muted-foreground">
        {!grupo.ativo ? (
          <>
            <Archive size={15} aria-hidden="true" /> Grupo arquivado: só consulta. O super admin reativa em Administração › WhatsApp OpenWA.
          </>
        ) : (
          <>
            {papel === "prestador" ? "Prestadores" : "Seu papel"} não responde{papel === "prestador" ? "m" : ""} pelo portal. Acompanhe a
            conversa aqui ou responda pelo WhatsApp.
          </>
        )}
      </div>
    );
  }

  return (
    <form
      className="shrink-0 border-t border-border bg-card px-2 py-2 sm:px-3"
      onSubmit={(e) => {
        e.preventDefault();
        enviar();
      }}
    >
      {(citando || arquivo) && (
        <div className="mb-2 grid gap-1.5">
          {citando && (
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <Citacao
                  projetoId={projetoId}
                  waId={citando.wa_message_id ?? ""}
                  carregada={citando}
                  pessoas={pessoas}
                  userId={userId}
                  compacta
                />
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={onLimparCitacao} aria-label="Cancelar resposta citada">
                <X aria-hidden="true" />
              </Button>
            </div>
          )}
          {arquivo && (
            <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-1.5 text-[12.5px]">
              <Paperclip size={14} aria-hidden="true" className="shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{arquivo.name}</span>
              <span className="shrink-0 text-muted-foreground tabular-nums">
                {new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(arquivo.size / 1024 / 1024)} MB
              </span>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => setArquivo(null)} aria-label={`Remover anexo ${arquivo.name}`}>
                <X aria-hidden="true" />
              </Button>
            </div>
          )}
        </div>
      )}
      <div className="flex items-end gap-1.5">
        <input
          ref={arquivoRef}
          id={`${ids}-arquivo`}
          type="file"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            e.target.value = "";
            if (f && f.size > TAMANHO_MAX_ANEXO) {
              toast.error("O arquivo passa de 16 MB.");
              return;
            }
            setArquivo(f);
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Anexar arquivo"
          onClick={() => arquivoRef.current?.click()}
          disabled={envio.isPending}
        >
          <Paperclip aria-hidden="true" />
        </Button>
        <label htmlFor={`${ids}-texto`} className="sr-only">
          Mensagem para {grupo.nome}
        </label>
        <Textarea
          ref={campoRef}
          id={`${ids}-texto`}
          rows={1}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={teclas}
          placeholder="Escreva uma mensagem (Enter envia, Shift+Enter quebra a linha)"
          maxLength={4000}
          className="max-h-40 min-h-9 flex-1 resize-none py-2"
          aria-describedby={`${ids}-dica`}
        />
        <span id={`${ids}-dica`} className="sr-only">
          Enter envia; Shift+Enter quebra a linha. A mensagem entra na fila e é enviada pelo OpenWA.
        </span>
        <Button
          type="submit"
          size="icon"
          aria-label="Enviar mensagem"
          disabled={envio.isPending || (!texto.trim() && !arquivo)}
          className="rounded-full"
        >
          {envio.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <SendHorizontal aria-hidden="true" />}
        </Button>
      </div>
    </form>
  );
}
