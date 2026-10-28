"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Workflow } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { criarProcesso } from "@/app/(app)/projetos/[id]/documentacao/acoes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { pode } from "@/lib/projeto/permissoes";
import { SITUACAO_DOCUMENTO, TIPO_DOCUMENTO } from "@/lib/projeto/tipos";
import { cn } from "@/lib/utils";
import { EstadoVazio, ErroCarregar } from "./comum";
import { chaves, useDocumentos } from "./consultas";
import type { PropsModulo } from "./documentacao";
import { EditorProcesso } from "./editor-processo";
import { normalizarProcesso } from "./processo";

type TipoProcesso = "processo_asis" | "processo_tobe";

export function AbaProcessos({ projetoId, papel, userId }: PropsModulo) {
  const { data: documentos, isPending, isError, error, refetch } = useDocumentos(projetoId);
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [novoAberto, setNovoAberto] = useState(false);
  const podeEditar = pode(papel, "documento_editar");

  const processos = (documentos ?? [])
    .filter((d) => d.tipo === "processo_asis" || d.tipo === "processo_tobe")
    .sort((a, b) => a.tipo.localeCompare(b.tipo) || a.titulo.localeCompare(b.titulo, "pt-BR"));
  const selecionado = processos.find((p) => p.id === selecionadoId) ?? processos[0] ?? null;

  if (isPending)
    return (
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]" aria-busy="true" aria-label="Carregando processos">
        <div className="grid content-start gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    );
  if (isError) return <ErroCarregar mensagem={error.message} tentar={() => refetch()} />;

  return (
    <div className="grid gap-4">
      {processos.length === 0 ? (
        <EstadoVazio
          icone={Workflow}
          cor="var(--sys-teal)"
          titulo="Nenhum processo mapeado"
          acao={
            podeEditar && (
              <Button onClick={() => setNovoAberto(true)}>
                <Plus aria-hidden="true" /> Mapear o primeiro processo
              </Button>
            )
          }
        >
          Mapeie como o processo funciona hoje (AS-IS) e como vai funcionar (TO-BE): etapas em sequência e um ponto de decisão.
          {!podeEditar && " O gerente do projeto cria os processos; você pode comentar."}
        </EstadoVazio>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[280px_1fr]">
          <nav aria-label="Processos do projeto" className="grid gap-2">
            {podeEditar && (
              <Button variant="outline" onClick={() => setNovoAberto(true)}>
                <Plus aria-hidden="true" /> Novo processo
              </Button>
            )}
            <ul className="grid gap-2">
              {processos.map((p) => {
                const ativo = p.id === selecionado?.id;
                const etapas = normalizarProcesso(p.conteudo).etapas.length;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      aria-current={ativo ? "true" : undefined}
                      onClick={() => setSelecionadoId(p.id)}
                      className={cn(
                        "grid w-full gap-1 rounded-[12px] border px-3 py-2.5 text-left transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                        ativo ? "border-primary bg-primary-soft" : "border-border bg-card hover:bg-muted/50",
                      )}
                    >
                      <span className="text-[11.5px] font-semibold text-muted-foreground">{TIPO_DOCUMENTO[p.tipo]}</span>
                      <span className={cn("text-[13.5px] font-medium", ativo && "text-primary")}>{p.titulo}</span>
                      <span className="flex items-center gap-2 text-[12px] text-muted-foreground">
                        <Badge variant={SITUACAO_DOCUMENTO[p.status].variant}>{SITUACAO_DOCUMENTO[p.status].label}</Badge>
                        {etapas} etapa{etapas === 1 ? "" : "s"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          {selecionado && (
            <Card>
              <CardContent>
                <EditorProcesso
                  key={`${selecionado.id}-${selecionado.updated_at}`}
                  projetoId={projetoId}
                  documento={selecionado}
                  papel={papel}
                  userId={userId}
                />
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {podeEditar && (
        <DialogNovoProcesso projetoId={projetoId} aberto={novoAberto} aoMudar={setNovoAberto} aoCriar={setSelecionadoId} />
      )}
    </div>
  );
}

function DialogNovoProcesso({
  projetoId,
  aberto,
  aoMudar,
  aoCriar,
}: {
  projetoId: string;
  aberto: boolean;
  aoMudar: (a: boolean) => void;
  aoCriar: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const id = useId();
  const [tipo, setTipo] = useState<TipoProcesso>("processo_asis");
  const [titulo, setTitulo] = useState("");

  const criar = useMutation({
    mutationFn: async () => {
      const r = await criarProcesso({ projectId: projetoId, tipo, titulo });
      if (!r.ok) throw new Error(r.erro);
      return r.dados.id;
    },
    onSuccess: async (novoId) => {
      toast.success("Processo criado.");
      await queryClient.invalidateQueries({ queryKey: chaves.documentos(projetoId) });
      aoCriar(novoId);
      setTitulo("");
      aoMudar(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={aberto} onOpenChange={(a) => !criar.isPending && aoMudar(a)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo processo</DialogTitle>
          <DialogDescription>Começa em rascunho, versão 0.1, com etapas de início e fim para você editar.</DialogDescription>
        </DialogHeader>
        <form
          id={`${id}-form`}
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            criar.mutate();
          }}
        >
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Tipo</legend>
            <div className="flex flex-wrap gap-2">
              {(["processo_asis", "processo_tobe"] as const).map((t) => (
                <label
                  key={t}
                  className={cn(
                    "flex h-9 cursor-pointer items-center gap-2 rounded-full border px-3.5 text-[13px] has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                    tipo === t ? "border-primary bg-primary-soft text-primary" : "border-border bg-card text-muted-foreground",
                  )}
                >
                  <input type="radio" name={`${id}-tipo`} value={t} checked={tipo === t} onChange={() => setTipo(t)} className="sr-only" />
                  {t === "processo_asis" ? "AS-IS (como é hoje)" : "TO-BE (como será)"}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-titulo`}>Título</Label>
            <Input
              id={`${id}-titulo`}
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex.: Abertura de chamados"
              maxLength={200}
              required
              minLength={3}
            />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => aoMudar(false)} disabled={criar.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form={`${id}-form`} disabled={criar.isPending}>
            {criar.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
            Criar processo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
