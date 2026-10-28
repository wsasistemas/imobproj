"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, MessageSquare, RotateCcw, Send } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { alternarComentarioResolvido, comentarDocumento } from "@/app/(app)/projetos/[id]/documentacao/acoes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { pode } from "@/lib/projeto/permissoes";
import type { Papel } from "@/lib/projeto/tipos";
import { cn } from "@/lib/utils";
import { chaves, useComentarios } from "./consultas";
import { dataHora } from "./utilidades";

/** Lista de comentários do documento + novo comentário + resolver/reabrir. Reusado em Documentos e Processos. */
export function ComentariosDocumento({
  projetoId,
  documentoId,
  papel,
  userId,
}: {
  projetoId: string;
  documentoId: string;
  papel: Papel;
  userId: string;
}) {
  const queryClient = useQueryClient();
  const id = useId();
  const [texto, setTexto] = useState("");
  const { data: comentarios, isPending, isError, refetch } = useComentarios(projetoId, documentoId);
  const podeComentar = pode(papel, "documento_comentar");
  const ehGerente = pode(papel, "documento_editar");
  const chave = chaves.comentarios(projetoId, documentoId);

  const novo = useMutation({
    mutationFn: async () => {
      const r = await comentarDocumento({ projectId: projetoId, documentId: documentoId, texto });
      if (!r.ok) throw new Error(r.erro);
    },
    onSuccess: () => {
      setTexto("");
      toast.success("Comentário publicado.");
      queryClient.invalidateQueries({ queryKey: chave });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const alternar = useMutation({
    mutationFn: async (v: { commentId: string; resolvido: boolean }) => {
      const r = await alternarComentarioResolvido({ projectId: projetoId, ...v });
      if (!r.ok) throw new Error(r.erro);
    },
    onSuccess: (_, v) => {
      toast.success(v.resolvido ? "Comentário resolvido." : "Comentário reaberto.");
      queryClient.invalidateQueries({ queryKey: chave });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const abertos = comentarios?.filter((c) => !c.resolvido).length ?? 0;

  return (
    <section aria-labelledby={`${id}-titulo`} className="grid gap-3">
      <h3 id={`${id}-titulo`} className="flex items-center gap-2 text-[14px] font-semibold">
        <MessageSquare size={16} aria-hidden="true" /> Comentários
        {abertos > 0 && <Badge variant="warning">{abertos} em aberto</Badge>}
      </h3>

      {isPending ? (
        <div className="grid gap-2" aria-busy="true" aria-label="Carregando comentários">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : isError ? (
        <p role="alert" className="text-[13px] text-danger">
          Não foi possível carregar os comentários.{" "}
          <button type="button" className="underline" onClick={() => refetch()}>
            Tentar de novo
          </button>
        </p>
      ) : comentarios.length === 0 ? (
        <p className="rounded-[10px] border border-dashed border-border px-3 py-4 text-center text-[13px] text-muted-foreground">
          Nenhum comentário ainda.{" "}
          {podeComentar ? "Use o campo abaixo para pedir ajustes ou registrar a validação." : "Diretor, gerente e usuário-chave podem comentar."}
        </p>
      ) : (
        <ul className="grid gap-2">
          {comentarios.map((c) => {
            const podeAlternar = podeComentar && (ehGerente || c.autor_id === userId);
            return (
              <li
                key={c.id}
                className={cn(
                  "rounded-[10px] border border-border px-3 py-2.5",
                  c.resolvido ? "bg-muted/40 text-muted-foreground" : "bg-card",
                )}
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
                  <b className="font-semibold text-foreground">{c.autor?.nome ?? "Usuário removido"}</b>
                  <span className="text-muted-foreground">{dataHora(c.created_at)}</span>
                  {c.resolvido && (
                    <Badge variant="success">
                      <CheckCircle2 aria-hidden="true" /> Resolvido
                    </Badge>
                  )}
                  {podeAlternar && (
                    <Button
                      variant="ghost"
                      size="xs"
                      className="ml-auto"
                      disabled={alternar.isPending}
                      onClick={() => alternar.mutate({ commentId: c.id, resolvido: !c.resolvido })}
                    >
                      {c.resolvido ? <RotateCcw aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
                      {c.resolvido ? "Reabrir" : "Resolver"}
                    </Button>
                  )}
                </div>
                <p className={cn("mt-1 text-[13.5px] whitespace-pre-wrap", c.resolvido && "line-through decoration-1")}>{c.texto}</p>
              </li>
            );
          })}
        </ul>
      )}

      {podeComentar && (
        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (texto.trim().length >= 2) novo.mutate();
          }}
        >
          <label htmlFor={`${id}-novo`} className="sr-only">
            Novo comentário
          </label>
          <Textarea
            id={`${id}-novo`}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escreva um comentário…"
            rows={3}
            maxLength={4000}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                if (texto.trim().length >= 2) novo.mutate();
              }
            }}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] text-muted-foreground">Ctrl + Enter publica</span>
            <Button type="submit" size="sm" disabled={novo.isPending || texto.trim().length < 2}>
              {novo.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
              Comentar
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
