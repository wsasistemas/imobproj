"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  CheckCheck,
  ChevronDown,
  ClipboardList,
  Clock,
  Copy,
  Download,
  FileText,
  NotebookPen,
  Reply,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROTULO_PAPEL } from "@/lib/projeto/tipos";
import { cn } from "@/lib/utils";
import {
  buscarMensagemPorWaId,
  chavesConversas,
  ehImagem,
  horaCurta,
  MAX_TENTATIVAS,
  nomeArquivo,
  previa,
  resolverAutor,
  urlAssinadaMidia,
  type Autor,
  type MensagemWa,
  type PessoaProjeto,
} from "./dados";

// ---------------------------------------------------------------------------------------------
// Mídia: URL assinada (1 h) do Storage
// ---------------------------------------------------------------------------------------------
function useUrlMidia(projetoId: string, caminho: string | null) {
  return useQuery({
    queryKey: chavesConversas.midia(projetoId, caminho ?? ""),
    queryFn: () => urlAssinadaMidia(caminho!),
    enabled: !!caminho,
    staleTime: 50 * 60 * 1000,
    gcTime: 55 * 60 * 1000,
  });
}

function Midia({ projetoId, caminho }: { projetoId: string; caminho: string }) {
  const url = useUrlMidia(projetoId, caminho);
  const nome = nomeArquivo(caminho);
  if (ehImagem(caminho)) {
    if (url.isPending) return <span className="block h-44 w-64 max-w-full animate-pulse rounded-md bg-(--cv-citacao)" aria-label="Carregando imagem" />;
    if (!url.data)
      return (
        <span className="flex items-center gap-2 rounded-md bg-(--cv-citacao) px-3 py-2 text-[12.5px] text-(--cv-meta)">
          <AlertTriangle size={14} aria-hidden="true" /> Imagem indisponível ({nome})
        </span>
      );
    return (
      <a href={url.data} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md focus-visible:ring-2 focus-visible:ring-ring">
        {/* URL assinada e temporária do Storage: next/image não se aplica. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url.data} alt={`Imagem: ${nome}`} loading="lazy" className="max-h-72 w-auto max-w-full object-cover" />
      </a>
    );
  }
  return (
    <div className="flex min-w-56 items-center gap-2.5 rounded-md bg-(--cv-citacao) px-3 py-2">
      <FileText size={28} aria-hidden="true" className="shrink-0 text-(--cv-meta)" />
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium" title={nome}>
        {nome}
      </span>
      {url.data ? (
        <a
          href={url.data}
          target="_blank"
          rel="noreferrer"
          aria-label={`Abrir arquivo ${nome}`}
          className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-(--cv-citacao) focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Download size={16} aria-hidden="true" />
        </a>
      ) : (
        <span className="text-[11.5px] text-(--cv-meta)">{url.isPending ? "…" : "Indisponível"}</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Citação (quoted_wa_message_id → trecho da mensagem citada)
// ---------------------------------------------------------------------------------------------
export function Citacao({
  projetoId,
  waId,
  carregada,
  pessoas,
  userId,
  onIr,
  compacta,
}: {
  projetoId: string;
  waId: string;
  carregada: MensagemWa | undefined;
  pessoas: PessoaProjeto[];
  userId: string;
  onIr?: (waId: string) => void;
  compacta?: boolean;
}) {
  const busca = useQuery({
    queryKey: chavesConversas.citada(projetoId, waId),
    queryFn: () => buscarMensagemPorWaId(waId),
    enabled: !carregada,
    staleTime: Infinity,
  });
  const m = carregada ?? busca.data ?? null;
  const autor = m ? (m.author_user_id === userId ? "Você" : resolverAutor(m, pessoas).nome) : null;
  const conteudo = (
    <>
      <span className="block truncate text-[12px] font-semibold text-(--cv-citacao-borda)">{autor ?? "Mensagem citada"}</span>
      <span className={cn("block text-[12.5px] text-(--cv-meta)", compacta ? "truncate" : "line-clamp-2")}>
        {m ? previa(m) : busca.isPending && !carregada ? "Carregando…" : "Mensagem não disponível"}
      </span>
    </>
  );
  const cls = "block w-full min-w-0 rounded-md border-l-4 border-(--cv-citacao-borda) bg-(--cv-citacao) px-2.5 py-1.5 text-left";
  if (onIr && m)
    return (
      <button type="button" onClick={() => onIr(waId)} className={cn(cls, "hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none")}>
        <span className="sr-only">Ir para a mensagem citada: </span>
        {conteudo}
      </button>
    );
  return <div className={cls}>{conteudo}</div>;
}

// ---------------------------------------------------------------------------------------------
// Situação da mensagem de saída
// ---------------------------------------------------------------------------------------------
function SituacaoSaida({ m }: { m: MensagemWa }) {
  if (m.status === "enviada")
    return (
      <span title="Enviada ao WhatsApp" className="inline-flex text-(--cv-lido)">
        <CheckCheck size={15} aria-hidden="true" />
        <span className="sr-only">Enviada</span>
      </span>
    );
  if (m.status === "falhou")
    return (
      <span
        title={m.erro ?? "Falha ao enviar"}
        className="inline-flex items-center gap-1 font-semibold text-danger"
      >
        <AlertTriangle size={13} aria-hidden="true" />
        Falhou · tentativa {Math.min(m.tentativas, MAX_TENTATIVAS)} de {MAX_TENTATIVAS}
      </span>
    );
  if (m.status === "pendente")
    return (
      <span title="Na fila de envio" className="inline-flex items-center gap-1">
        <Clock size={13} aria-hidden="true" />
        {m.tentativas > 0 ? `Reenviando · tentativa ${m.tentativas} de ${MAX_TENTATIVAS}` : <span className="sr-only">Pendente</span>}
      </span>
    );
  return (
    <span className="inline-flex">
      <Check size={14} aria-hidden="true" />
    </span>
  );
}

// ---------------------------------------------------------------------------------------------
// Balão
// ---------------------------------------------------------------------------------------------
export type AcoesBalao = {
  onResponder?: (m: MensagemWa) => void;
  onCriarPendencia?: (m: MensagemWa) => void;
  onLevarAta?: (m: MensagemWa) => void;
  onIrCitada: (waId: string) => void;
};

export function MensagemSistema({ m }: { m: MensagemWa }) {
  return (
    <div className="my-1 flex justify-center px-6">
      <p className="max-w-[85%] rounded-lg bg-(--cv-sistema) px-3 py-1 text-center text-[12px] text-(--cv-sistema-texto) shadow-(--cv-sombra)">
        {m.body ?? "Evento do grupo"} <span className="ml-1 tabular-nums opacity-80">{horaCurta(m.created_at)}</span>
      </p>
    </div>
  );
}

export function Balao({
  projetoId,
  m,
  autor,
  meu,
  mostrarAutor,
  mencionaMe,
  citada,
  pessoas,
  userId,
  acoes,
  destacada,
}: {
  projetoId: string;
  m: MensagemWa;
  autor: Autor;
  meu: boolean;
  mostrarAutor: boolean;
  mencionaMe: boolean;
  citada: MensagemWa | undefined;
  pessoas: PessoaProjeto[];
  userId: string;
  acoes: AcoesBalao;
  destacada: boolean;
}) {
  const [menu, setMenu] = useState(false);
  const saida = m.direction === "out";
  const temAcoes = !!(acoes.onResponder || acoes.onCriarPendencia || acoes.onLevarAta || m.body);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(m.body ?? "");
      toast.success("Texto copiado.");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  }

  const rotuloAutor = meu ? "Você" : autor.nome;
  return (
    <div
      className={cn("group/msg flex px-3 sm:px-[6%]", saida ? "justify-end" : "justify-start", mostrarAutor ? "mt-2" : "mt-0.5")}
      onContextMenu={(e) => {
        if (!temAcoes) return;
        e.preventDefault();
        setMenu(true);
      }}
    >
      <div
        data-rabicho={mostrarAutor ? (saida ? "out" : "in") : undefined}
        className={cn(
          "cv-balao relative max-w-[min(85%,560px)] min-w-24 rounded-lg px-2.5 pt-1.5 pb-1 text-[14px] leading-snug",
          saida ? "bg-(--cv-enviado) text-(--cv-enviado-texto)" : "bg-(--cv-balao) text-(--cv-balao-texto)",
          mostrarAutor && (saida ? "rounded-tr-none" : "rounded-tl-none"),
          mencionaMe && !saida && "ring-2 ring-success/50",
          destacada && "cv-pulso",
        )}
      >
        {temAcoes && (
          <DropdownMenu open={menu} onOpenChange={setMenu}>
            <DropdownMenuTrigger
              aria-label={`Ações da mensagem de ${rotuloAutor} às ${horaCurta(m.created_at)}`}
              className={cn(
                "absolute top-1 right-1 z-10 grid size-7 place-items-center rounded-full text-(--cv-meta) opacity-0 transition-opacity outline-none",
                "group-hover/msg:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring data-popup-open:opacity-100 pointer-coarse:opacity-70",
                saida ? "bg-(--cv-enviado)" : "bg-(--cv-balao)",
              )}
            >
              <ChevronDown size={16} aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-60">
              {acoes.onResponder && (
                <DropdownMenuItem onClick={() => acoes.onResponder?.(m)}>
                  <Reply aria-hidden="true" /> Responder citando
                </DropdownMenuItem>
              )}
              {m.body && (
                <DropdownMenuItem onClick={copiar}>
                  <Copy aria-hidden="true" /> Copiar texto
                </DropdownMenuItem>
              )}
              {(acoes.onCriarPendencia || acoes.onLevarAta) && <DropdownMenuSeparator />}
              {acoes.onCriarPendencia && (
                <DropdownMenuItem onClick={() => acoes.onCriarPendencia?.(m)}>
                  <ClipboardList aria-hidden="true" /> Criar pendência
                </DropdownMenuItem>
              )}
              {acoes.onLevarAta && (
                <DropdownMenuItem onClick={() => acoes.onLevarAta?.(m)}>
                  <NotebookPen aria-hidden="true" /> Levar para a próxima ata
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {mostrarAutor && (
          <p className="mb-0.5 flex flex-wrap items-baseline gap-x-1.5 pr-6 text-[12.5px] leading-tight">
            <span className={cn("font-semibold", meu ? "text-(--cv-citacao-borda)" : "text-primary")}>{rotuloAutor}</span>
            {autor.papel && !meu && <span className="text-[11.5px] text-(--cv-meta)">{ROTULO_PAPEL[autor.papel]}</span>}
            {!autor.conhecido && autor.telefone && <span className="text-[11.5px] text-(--cv-meta)">fora da equipe</span>}
          </p>
        )}

        {m.quoted_wa_message_id && (
          <div className="mb-1">
            <Citacao
              projetoId={projetoId}
              waId={m.quoted_wa_message_id}
              carregada={citada}
              pessoas={pessoas}
              userId={userId}
              onIr={acoes.onIrCitada}
            />
          </div>
        )}

        {m.media_path && (
          <div className="mb-1">
            <Midia projetoId={projetoId} caminho={m.media_path} />
          </div>
        )}

        {m.body && <p className="pr-6 break-words whitespace-pre-wrap">{m.body}</p>}

        <p className="mt-0.5 flex items-center justify-end gap-1 text-[11px] leading-none text-(--cv-meta) tabular-nums">
          <time dateTime={m.created_at}>{horaCurta(m.created_at)}</time>
          {saida && <SituacaoSaida m={m} />}
        </p>
      </div>
    </div>
  );
}
