"use client";

import "../conversas/conversas.css";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileText, NotebookPen, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useDeferredValue, useMemo, useState } from "react";
import { urlMidiaAnotacao } from "@/app/(app)/projetos/[id]/anotacoes/acoes";
import { IconeMenu } from "@/components/shell/icone-menu";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ehBancoDesatualizado, MSG_BANCO_DESATUALIZADO } from "@/lib/acoes";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { chaveDia, chavesConversas, ehImagem, horaCurta, horaLista, nomeArquivo, rotuloDia } from "../conversas/dados";
import { ALTURA_CENTRAL, EsqueletoConversas } from "../conversas/esqueleto";

// Anotações da equipe (D5): grupos com 30 dias sem mensagem, só leitura, separados por equipe.
// De propósito, nada de OS: a função do banco não devolve status, evidência nem automação, e a tela não liga à OS.

type GrupoAnotacao = {
  group_id: string;
  nome: string;
  team_id: string | null;
  equipe: string;
  anotacao_desde: string;
  primeira_em: string | null;
  ultima_em: string | null;
  mensagens: number;
};

type MensagemAnotacao = {
  id: string;
  direction: "in" | "out";
  autor: string | null;
  autor_user_id: string | null;
  body: string | null;
  media_path: string | null;
  citada_body: string | null;
  created_at: string;
};

const chaves = {
  grupos: (p: string) => [...chavesConversas.raiz(p), "anotacoes"] as const,
  mensagens: (p: string, g: string) => [...chavesConversas.raiz(p), "anotacoes", g] as const,
  midia: (g: string, c: string) => ["anotacoes", "midia", g, c] as const,
};

const periodo = (a: string | null, b: string | null) => {
  if (!a || !b) return "";
  const ini = new Date(a).toLocaleDateString("pt-BR");
  const fim = new Date(b).toLocaleDateString("pt-BR");
  return ini === fim ? ini : `${ini} a ${fim}`;
};

export function AnotacoesEquipe({ projetoId }: { projetoId: string }) {
  return (
    <Suspense fallback={<EsqueletoConversas />}>
      <Tela projetoId={projetoId} />
    </Suspense>
  );
}

function Tela({ projetoId }: { projetoId: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const [busca, setBusca] = useState("");
  const [equipe, setEquipe] = useState("todas");
  const buscaAdiada = useDeferredValue(busca.trim());

  const grupos = useQuery({
    queryKey: [...chaves.grupos(projetoId), buscaAdiada],
    queryFn: async () => {
      const { data, error } = await createClient().rpc("anotacoes_grupos", { p_project_id: projetoId, p_busca: buscaAdiada || null });
      if (error) throw error;
      return (data ?? []) as GrupoAnotacao[];
    },
    placeholderData: (anterior) => anterior,
  });

  const lista = useMemo(() => grupos.data ?? [], [grupos.data]);
  const equipes = useMemo(() => Array.from(new Set(lista.map((g) => g.equipe))).sort((a, b) => a.localeCompare(b, "pt-BR")), [lista]);
  const visiveis = lista.filter((g) => equipe === "todas" || g.equipe === equipe);
  const porEquipe = useMemo(() => {
    const m = new Map<string, GrupoAnotacao[]>();
    for (const g of visiveis) m.set(g.equipe, [...(m.get(g.equipe) ?? []), g]);
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b, "pt-BR"));
  }, [visiveis]);
  const grupo = lista.find((g) => g.group_id === params.get("grupo")) ?? null;

  if (grupos.isPending) return <EsqueletoConversas />;
  if (grupos.isError) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-[13.5px] text-danger">
          {ehBancoDesatualizado(grupos.error) ? MSG_BANCO_DESATUALIZADO : "Não foi possível carregar as anotações."}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="cv-raiz grid gap-3">
      <div className="grid gap-1">
        <h2 className="text-[15px] font-semibold">Anotações da equipe</h2>
        <p className="text-[13px] text-muted-foreground">
          Grupos que ficaram 30 dias sem mensagem saem de Conversas e ficam guardados aqui, só para leitura. Se o grupo voltar a
          conversar, ele volta para Conversas. Nada daqui aparece nem é citado na Ordem de Serviço.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            aria-label="Buscar nas anotações"
            placeholder="Buscar grupo ou texto das mensagens"
            className="pl-8"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <select
          aria-label="Filtrar por equipe"
          className="h-9 rounded-md border border-input bg-background px-2 text-[13.5px]"
          value={equipe}
          onChange={(e) => setEquipe(e.target.value)}
        >
          <option value="todas">Todas as equipes</option>
          {equipes.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
      </div>

      {lista.length === 0 && !buscaAdiada ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <IconeMenu icon={NotebookPen} cor="var(--sys-purple)" tamanho={52} />
            <h3 className="mt-2 text-[17px] font-semibold">Nenhuma anotação ainda</h3>
            <p className="max-w-md text-muted-foreground">
              Quando um grupo das suas equipes passar 30 dias sem mensagem, a conversa fica guardada aqui.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div
          className={cn(
            "grid overflow-hidden rounded-xl border border-border bg-card shadow-(--shadow-card)",
            "grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]",
            ALTURA_CENTRAL,
          )}
        >
          <aside aria-label="Grupos em anotações" className={cn("min-h-0 overflow-y-auto border-r border-border", grupo ? "hidden lg:block" : "block")}>
            {porEquipe.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">Nada encontrado.</p>
            ) : (
              porEquipe.map(([nomeEquipe, itens]) => (
                <section key={nomeEquipe} aria-label={`Equipe ${nomeEquipe}`}>
                  <h3 className="sticky top-0 z-10 bg-table-head px-4 py-2 text-[11.5px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
                    Equipe {nomeEquipe} · {itens.length}
                  </h3>
                  <ul>
                    {itens.map((g) => (
                      <li key={g.group_id}>
                        <Link
                          href={`${pathname}?grupo=${g.group_id}`}
                          aria-current={g.group_id === grupo?.group_id ? "true" : undefined}
                          className={cn(
                            "block border-b border-border-soft px-4 py-3 hover:bg-table-head",
                            g.group_id === grupo?.group_id && "bg-primary-soft",
                          )}
                        >
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-[14px] font-medium">{g.nome}</span>
                            <span className="shrink-0 text-[12px] text-muted-foreground">{horaLista(g.ultima_em)}</span>
                          </span>
                          <span className="block text-[12.5px] text-muted-foreground">
                            {g.mensagens} mensage{g.mensagens === 1 ? "m" : "ns"} · {periodo(g.primeira_em, g.ultima_em)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
          </aside>

          <div className={cn("min-h-0 min-w-0 flex-col", grupo ? "flex" : "hidden lg:flex")}>
            {grupo ? (
              <Leitura key={grupo.group_id} projetoId={projetoId} grupo={grupo} hrefLista={pathname} />
            ) : (
              <div className="cv-mensagens grid flex-1 place-items-center p-6">
                <p className="rounded-xl bg-(--cv-dia) px-6 py-4 text-center text-[13px] text-(--cv-sistema-texto) shadow-(--cv-sombra)">
                  Escolha um grupo para ler as anotações.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Leitura({ projetoId, grupo, hrefLista }: { projetoId: string; grupo: GrupoAnotacao; hrefLista: string }) {
  const mensagens = useQuery({
    queryKey: chaves.mensagens(projetoId, grupo.group_id),
    queryFn: async () => {
      const { data, error } = await createClient().rpc("anotacoes_mensagens", { p_group_id: grupo.group_id });
      if (error) throw error;
      return (data ?? []) as MensagemAnotacao[];
    },
  });

  return (
    <>
      <header className="flex items-center gap-3 border-b border-border px-4 py-2.5">
        <Link href={hrefLista} className="rounded-md p-1 text-muted-foreground hover:text-foreground lg:hidden" aria-label="Voltar para a lista">
          <ArrowLeft className="size-5" aria-hidden="true" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-semibold">{grupo.nome}</p>
          <p className="truncate text-[12px] text-muted-foreground">
            Equipe {grupo.equipe} · em Anotações desde {new Date(grupo.anotacao_desde).toLocaleDateString("pt-BR")}
          </p>
        </div>
      </header>

      <div className="cv-mensagens min-h-0 flex-1 overflow-y-auto px-[5%] py-4" aria-live="polite">
        {mensagens.isPending ? (
          <p className="text-center text-[13px] text-(--cv-meta)">Carregando…</p>
        ) : mensagens.isError ? (
          <p className="text-center text-[13px] text-danger">Não foi possível carregar as mensagens.</p>
        ) : (
          <ol className="grid gap-1.5">
            {mensagens.data.map((m, i) => {
              const novoDia = i === 0 || chaveDia(mensagens.data[i - 1].created_at) !== chaveDia(m.created_at);
              const sistema = m.direction === "in" && !m.autor && !m.autor_user_id;
              return (
                <li key={m.id} className="grid">
                  {novoDia && (
                    <span className="my-2 justify-self-center rounded-lg bg-(--cv-dia) px-3 py-1 text-[12px] text-(--cv-meta) shadow-(--cv-sombra)">
                      {rotuloDia(m.created_at)}
                    </span>
                  )}
                  {sistema ? (
                    <span className="justify-self-center rounded-lg bg-(--cv-sistema) px-3 py-1 text-[12px] text-(--cv-sistema-texto)">
                      {m.body}
                    </span>
                  ) : (
                    <div
                      className={cn(
                        "cv-balao max-w-[75%] rounded-lg px-2.5 pt-1.5 pb-1 text-[14px] shadow-(--cv-sombra)",
                        m.direction === "out"
                          ? "justify-self-end bg-(--cv-enviado) text-(--cv-enviado-texto)"
                          : "justify-self-start bg-(--cv-balao) text-(--cv-balao-texto)",
                      )}
                    >
                      {m.direction === "in" && <span className="block text-[12.5px] font-semibold text-primary">{m.autor ?? "Participante"}</span>}
                      {m.citada_body && (
                        <span className="mb-1 block rounded-md border-l-4 border-(--cv-citacao-borda) bg-(--cv-citacao) px-2 py-1 text-[12.5px] text-(--cv-meta)">
                          {m.citada_body}
                        </span>
                      )}
                      {m.media_path && <MidiaAnotacao grupoId={grupo.group_id} caminho={m.media_path} />}
                      {m.body && <span className="whitespace-pre-wrap break-words">{m.body}</span>}
                      <span className="float-right mt-1.5 ml-2.5 text-[11px] text-(--cv-meta)">{horaCurta(m.created_at)}</span>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <p className="border-t border-border bg-warning-bg px-4 py-2.5 text-[13px] text-warning">
        Anotação da equipe: só leitura. Se o grupo mandar mensagem nova, ele volta para Conversas.
      </p>
    </>
  );
}

function MidiaAnotacao({ grupoId, caminho }: { grupoId: string; caminho: string }) {
  const url = useQuery({
    queryKey: chaves.midia(grupoId, caminho),
    queryFn: async () => {
      const r = await urlMidiaAnotacao(grupoId, caminho);
      return r.ok ? r.dados : null;
    },
    staleTime: 50 * 60 * 1000,
  });
  const nome = nomeArquivo(caminho);
  if (ehImagem(caminho) && url.data) {
    return (
      <a href={url.data} target="_blank" rel="noreferrer" className="mb-1 block overflow-hidden rounded-md">
        {/* URL assinada do Storage: next/image não otimiza */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url.data} alt={`Imagem: ${nome}`} loading="lazy" className="max-h-72 w-auto max-w-full object-cover" />
      </a>
    );
  }
  return (
    <a
      href={url.data ?? undefined}
      target="_blank"
      rel="noreferrer"
      aria-disabled={!url.data}
      className="mb-1 flex items-center gap-2 rounded-md bg-(--cv-citacao) px-2 py-1.5 text-[13px] hover:underline"
    >
      <FileText className="size-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{nome}</span>
    </a>
  );
}
