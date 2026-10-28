"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, GitBranch, Loader2, Plus, Save, Trash2, Undo2 } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { salvarProcesso } from "@/app/(app)/projetos/[id]/documentacao/acoes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { pode } from "@/lib/projeto/permissoes";
import { SITUACAO_DOCUMENTO, TIPO_DOCUMENTO, type Documento, type Papel } from "@/lib/projeto/tipos";
import { ComentariosDocumento } from "./comentarios-documento";
import { chaves } from "./consultas";
import { FluxoProcesso } from "./fluxo-processo";
import { esquemaProcesso, normalizarProcesso, novoIdEtapa, type Processo } from "./processo";

const FIM = "__fim__";

const estiloSelect =
  "h-9 w-full rounded-[8px] border border-input bg-card px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

/**
 * Editor de processo: etapas em sequência (adicionar, renomear, reordenar ↑↓, remover) e um ponto de decisão.
 * Monte com key={documento.id + documento.updated_at} para recarregar depois de salvar.
 */
export function EditorProcesso({
  projetoId,
  documento,
  papel,
  userId,
}: {
  projetoId: string;
  documento: Documento;
  papel: Papel;
  userId: string;
}) {
  const queryClient = useQueryClient();
  const id = useId();
  const podeEditar = pode(papel, "documento_editar");
  const original = useMemo(() => normalizarProcesso(documento.conteudo), [documento.conteudo]);
  const [processo, setProcesso] = useState<Processo>(original);
  const [titulo, setTitulo] = useState(documento.titulo);
  const alterado = titulo !== documento.titulo || JSON.stringify(processo) !== JSON.stringify(original);

  const salvar = useMutation({
    mutationFn: async () => {
      const valido = esquemaProcesso.safeParse(processo);
      if (!valido.success) throw new Error(valido.error.issues[0]?.message ?? "Processo inválido.");
      const r = await salvarProcesso({ projectId: projetoId, documentId: documento.id, titulo, processo });
      if (!r.ok) throw new Error(r.erro);
    },
    onSuccess: () => {
      toast.success("Processo salvo.");
      queryClient.invalidateQueries({ queryKey: chaves.documentos(projetoId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ---- operações nas etapas ----
  const mudarEtapa = (etapaId: string, campo: "titulo" | "responsavel", valor: string) =>
    setProcesso((p) => ({ ...p, etapas: p.etapas.map((e) => (e.id === etapaId ? { ...e, [campo]: valor } : e)) }));

  const mover = (indice: number, delta: -1 | 1) =>
    setProcesso((p) => {
      const etapas = [...p.etapas];
      const alvo = indice + delta;
      if (alvo < 0 || alvo >= etapas.length) return p;
      [etapas[indice], etapas[alvo]] = [etapas[alvo], etapas[indice]];
      return { ...p, etapas };
    });

  const adicionar = () =>
    setProcesso((p) => ({ ...p, etapas: [...p.etapas, { id: novoIdEtapa(), titulo: "", responsavel: "" }] }));

  const remover = (etapaId: string) =>
    setProcesso((p) => {
      const etapas = p.etapas.filter((e) => e.id !== etapaId);
      let decisao = p.decisao;
      if (decisao) {
        if (decisao.aposEtapaId === etapaId) decisao = null;
        else
          decisao = {
            ...decisao,
            sim: decisao.sim === etapaId ? null : decisao.sim,
            nao: decisao.nao === etapaId ? null : decisao.nao,
          };
      }
      return { etapas, decisao };
    });

  const decisao = processo.decisao;
  const setDecisao = (d: Partial<NonNullable<Processo["decisao"]>> | null) =>
    setProcesso((p) => ({ ...p, decisao: d === null ? null : { ...p.decisao!, ...d } }));

  const rotuloEtapa = (i: number, t: string) => `${i + 1}. ${t || "Etapa sem título"}`;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">{TIPO_DOCUMENTO[documento.tipo]}</p>
          {podeEditar ? (
            <>
              <label htmlFor={`${id}-titulo`} className="sr-only">
                Título do processo
              </label>
              <Input
                id={`${id}-titulo`}
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                maxLength={200}
                className="mt-1 h-10 text-[16px] font-semibold"
              />
            </>
          ) : (
            <h2 className="mt-1 text-[17px] font-semibold">{documento.titulo}</h2>
          )}
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
            <Badge variant={SITUACAO_DOCUMENTO[documento.status].variant}>{SITUACAO_DOCUMENTO[documento.status].label}</Badge>
            Versão {documento.versao} · a situação e a versão mudam na aba Documentos.
          </p>
        </div>
        {podeEditar && (
          <div className="flex gap-2">
            {alterado && (
              <Button
                variant="ghost"
                onClick={() => {
                  setProcesso(original);
                  setTitulo(documento.titulo);
                }}
                disabled={salvar.isPending}
              >
                <Undo2 aria-hidden="true" /> Descartar
              </Button>
            )}
            <Button onClick={() => salvar.mutate()} disabled={!alterado || salvar.isPending}>
              {salvar.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
              Salvar processo
            </Button>
          </div>
        )}
      </div>

      {podeEditar && (
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Etapas */}
          <section aria-labelledby={`${id}-etapas`} className="grid content-start gap-2">
            <h3 id={`${id}-etapas`} className="text-[14px] font-semibold">
              Etapas em sequência
            </h3>
            {processo.etapas.length === 0 && (
              <p className="text-[13px] text-muted-foreground">Nenhuma etapa. Adicione a primeira abaixo.</p>
            )}
            <ol className="grid gap-2">
              {processo.etapas.map((e, i) => (
                <li key={e.id} className="flex items-start gap-2 rounded-[10px] border border-border bg-card p-2">
                  <span className="mt-2 w-6 shrink-0 text-center text-[12px] font-semibold text-muted-foreground tabular-nums">{i + 1}</span>
                  <div className="grid min-w-0 flex-1 gap-1.5 sm:grid-cols-[1fr_150px]">
                    <Input
                      aria-label={`Título da etapa ${i + 1}`}
                      value={e.titulo}
                      placeholder="O que acontece nesta etapa?"
                      maxLength={200}
                      onChange={(ev) => mudarEtapa(e.id, "titulo", ev.target.value)}
                    />
                    <Input
                      aria-label={`Responsável da etapa ${i + 1}`}
                      value={e.responsavel}
                      placeholder="Responsável"
                      maxLength={120}
                      onChange={(ev) => mudarEtapa(e.id, "responsavel", ev.target.value)}
                    />
                  </div>
                  <div className="flex shrink-0">
                    <Button variant="ghost" size="icon" aria-label={`Subir etapa ${i + 1}`} disabled={i === 0} onClick={() => mover(i, -1)}>
                      <ArrowUp aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Descer etapa ${i + 1}`}
                      disabled={i === processo.etapas.length - 1}
                      onClick={() => mover(i, 1)}
                    >
                      <ArrowDown aria-hidden="true" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label={`Remover etapa ${i + 1}`} onClick={() => remover(e.id)}>
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
            <Button variant="outline" className="justify-self-start" onClick={adicionar} disabled={processo.etapas.length >= 100}>
              <Plus aria-hidden="true" /> Adicionar etapa
            </Button>
          </section>

          {/* Decisão */}
          <section aria-labelledby={`${id}-decisao`} className="grid content-start gap-3">
            <h3 id={`${id}-decisao`} className="flex items-center gap-2 text-[14px] font-semibold">
              <GitBranch size={16} aria-hidden="true" /> Ponto de decisão
            </h3>
            {!decisao ? (
              <div className="grid gap-2 rounded-[10px] border border-dashed border-border p-4 text-[13px] text-muted-foreground">
                <p>O processo pode ter um ponto de decisão (pergunta com caminhos Sim e Não) depois de uma etapa.</p>
                <Button
                  variant="outline"
                  className="justify-self-start"
                  disabled={processo.etapas.length === 0}
                  onClick={() =>
                    setProcesso((p) => ({
                      ...p,
                      decisao: { aposEtapaId: p.etapas[0].id, pergunta: "", sim: p.etapas[1]?.id ?? null, nao: null },
                    }))
                  }
                >
                  <Plus aria-hidden="true" /> Adicionar decisão
                </Button>
              </div>
            ) : (
              <div className="grid gap-3 rounded-[10px] border border-border bg-card p-3">
                <div className="grid gap-1.5">
                  <Label htmlFor={`${id}-apos`}>Depois da etapa</Label>
                  <select
                    id={`${id}-apos`}
                    className={estiloSelect}
                    value={decisao.aposEtapaId}
                    onChange={(e) => setDecisao({ aposEtapaId: e.target.value })}
                  >
                    {processo.etapas.map((e, i) => (
                      <option key={e.id} value={e.id}>
                        {rotuloEtapa(i, e.titulo)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`${id}-pergunta`}>Pergunta</Label>
                  <Input
                    id={`${id}-pergunta`}
                    value={decisao.pergunta}
                    maxLength={200}
                    placeholder="Ex.: Problema resolvido no 1º nível?"
                    onChange={(e) => setDecisao({ pergunta: e.target.value })}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(["sim", "nao"] as const).map((caminho) => (
                    <div key={caminho} className="grid gap-1.5">
                      <Label htmlFor={`${id}-${caminho}`}>{caminho === "sim" ? "Se sim, vai para" : "Se não, vai para"}</Label>
                      <select
                        id={`${id}-${caminho}`}
                        className={estiloSelect}
                        value={decisao[caminho] ?? FIM}
                        onChange={(e) => setDecisao({ [caminho]: e.target.value === FIM ? null : e.target.value })}
                      >
                        {processo.etapas.map((e, i) => (
                          <option key={e.id} value={e.id}>
                            {rotuloEtapa(i, e.titulo)}
                          </option>
                        ))}
                        <option value={FIM}>Fim do processo</option>
                      </select>
                    </div>
                  ))}
                </div>
                <Button variant="ghost" className="justify-self-start text-danger" onClick={() => setDecisao(null)}>
                  <Trash2 aria-hidden="true" /> Remover decisão
                </Button>
              </div>
            )}
          </section>
        </div>
      )}

      <section aria-label="Pré-visualização do fluxo" className="grid gap-2">
        <h3 className="text-[14px] font-semibold">Fluxo</h3>
        <FluxoProcesso processo={processo} />
      </section>

      <Separator />

      <ComentariosDocumento projetoId={projetoId} documentoId={documento.id} papel={papel} userId={userId} />
    </div>
  );
}
