"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftCircle, CheckCircle2, Download, FileClock, Loader2, RefreshCcw, Send, Sparkles, Upload } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { mudarSituacaoDocumento } from "@/app/(app)/projetos/[id]/documentacao/acoes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { pode } from "@/lib/projeto/permissoes";
import { SITUACAO_DOCUMENTO, TIPO_DOCUMENTO, type DocumentStatus, type Documento, type Papel } from "@/lib/projeto/tipos";
import { baixarArquivo } from "./arquivos";
import { ComentariosDocumento } from "./comentarios-documento";
import { chaves, versoesDoDocumento, type MembroProjeto } from "./consultas";
import { DialogEnvio } from "./dialog-envio";
import { dataHora, versaoAoAprovar } from "./utilidades";

type Botao = { para: DocumentStatus; rotulo: string; icone: ReactNode; principal?: boolean };

/** Botões do fluxo por situação (espelha TRANSICOES de acoes.ts). */
function botoesSituacao(status: DocumentStatus, versao: string): Botao[] {
  switch (status) {
    case "rascunho":
      return [{ para: "revisao", rotulo: "Enviar para revisão", icone: <Send aria-hidden="true" />, principal: true }];
    case "revisao":
      return [
        { para: "aprovado", rotulo: `Aprovar (v${versaoAoAprovar(versao)})`, icone: <CheckCircle2 aria-hidden="true" />, principal: true },
        { para: "rascunho", rotulo: "Devolver para rascunho", icone: <ArrowLeftCircle aria-hidden="true" /> },
      ];
    case "aprovado":
      return [
        { para: "vivo", rotulo: "Tornar documento vivo", icone: <Sparkles aria-hidden="true" /> },
        { para: "revisao", rotulo: "Reabrir revisão", icone: <RefreshCcw aria-hidden="true" /> },
      ];
    case "vivo":
      return [{ para: "revisao", rotulo: "Reabrir revisão", icone: <RefreshCcw aria-hidden="true" /> }];
  }
}

export function PainelDocumento({
  projetoId,
  documento,
  papel,
  userId,
  membros,
  aoFechar,
}: {
  projetoId: string;
  documento: Documento | null;
  papel: Papel;
  userId: string;
  membros: MembroProjeto[];
  aoFechar: () => void;
}) {
  const queryClient = useQueryClient();
  const [envioAberto, setEnvioAberto] = useState(false);
  const podeEditar = pode(papel, "documento_editar");

  const situacao = useMutation({
    mutationFn: async (para: DocumentStatus) => {
      const r = await mudarSituacaoDocumento({ projectId: projetoId, documentId: documento!.id, para });
      if (!r.ok) throw new Error(r.erro);
      return r.dados;
    },
    onSuccess: (d) => {
      toast.success(`Situação alterada para "${SITUACAO_DOCUMENTO[d.status].label}" (v${d.versao}).`);
      queryClient.invalidateQueries({ queryKey: chaves.documentos(projetoId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function baixar(caminho: string, nome?: string | null) {
    try {
      await baixarArquivo(caminho, nome);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const nomeDe = (id: string | null) => membros.find((m) => m.user_id === id)?.nome ?? "—";
  const versoes = documento ? versoesDoDocumento(documento).slice().reverse() : [];
  const ehProcesso = documento?.tipo === "processo_asis" || documento?.tipo === "processo_tobe";

  return (
    <Sheet open={!!documento} onOpenChange={(a) => !a && aoFechar()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-lg">
        {documento && (
          <>
            <SheetHeader className="border-b border-border pr-12">
              <p className="text-[12px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
                {TIPO_DOCUMENTO[documento.tipo]}
              </p>
              <SheetTitle className="text-[17px] font-semibold">{documento.titulo}</SheetTitle>
              <SheetDescription className="flex flex-wrap items-center gap-2">
                <Badge variant={SITUACAO_DOCUMENTO[documento.status].variant}>{SITUACAO_DOCUMENTO[documento.status].label}</Badge>
                <span>Versão {documento.versao}</span>
                <span aria-hidden="true">·</span>
                <span>Atualizado em {dataHora(documento.updated_at)}</span>
              </SheetDescription>
            </SheetHeader>

            <div className="grid gap-5 p-4">
              {/* Ações */}
              <div className="flex flex-wrap gap-2">
                {documento.storage_path && (
                  <Button variant="outline" size="sm" onClick={() => baixar(documento.storage_path!, versoes.find((v) => v.storage_path === documento.storage_path)?.nome_arquivo)}>
                    <Download aria-hidden="true" /> Baixar versão atual
                  </Button>
                )}
                {podeEditar && !ehProcesso && (
                  <Button variant="outline" size="sm" onClick={() => setEnvioAberto(true)}>
                    <Upload aria-hidden="true" /> Enviar nova versão
                  </Button>
                )}
              </div>

              {podeEditar && (
                <div className="grid gap-2 rounded-[12px] border border-border bg-table-head p-3">
                  <p className="text-[12.5px] text-muted-foreground">
                    Fluxo: rascunho → em revisão → aprovado → documento vivo. Aprovar fecha a versão maior; enviar um arquivo
                    novo sobe a versão menor (e um aprovado volta para rascunho).
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {botoesSituacao(documento.status, documento.versao).map((b) => (
                      <Button
                        key={b.para}
                        size="sm"
                        variant={b.principal ? "default" : "outline"}
                        disabled={situacao.isPending}
                        onClick={() => situacao.mutate(b.para)}
                      >
                        {situacao.isPending && situacao.variables === b.para ? <Loader2 className="animate-spin" aria-hidden="true" /> : b.icone}
                        {b.rotulo}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {/* Histórico de versões */}
              <section aria-labelledby="historico-versoes" className="grid gap-2">
                <h3 id="historico-versoes" className="flex items-center gap-2 text-[14px] font-semibold">
                  <FileClock size={16} aria-hidden="true" /> Histórico de versões
                </h3>
                {versoes.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">
                    {documento.storage_path
                      ? "Este documento veio sem histórico registrado. Os próximos envios e aprovações aparecem aqui."
                      : "Nenhum arquivo enviado ainda."}
                  </p>
                ) : (
                  <ol className="grid gap-1.5">
                    {versoes.map((v, i) => (
                      <li key={`${v.versao}-${v.enviado_em}-${i}`} className="flex items-center gap-3 rounded-[10px] border border-border-soft px-3 py-2">
                        <Badge variant={v.evento === "aprovacao" ? "success" : "neutral"}>v{v.versao}</Badge>
                        <div className="min-w-0 flex-1 text-[12.5px]">
                          <p className="truncate font-medium">
                            {v.evento === "aprovacao" ? "Aprovação" : (v.nome_arquivo ?? "Arquivo")}
                          </p>
                          <p className="text-muted-foreground">
                            {dataHora(v.enviado_em)} · {nomeDe(v.enviado_por)}
                          </p>
                        </div>
                        {v.evento === "envio" && v.storage_path && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Baixar versão ${v.versao}`}
                            onClick={() => baixar(v.storage_path!, v.nome_arquivo)}
                          >
                            <Download aria-hidden="true" />
                          </Button>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              <Separator />

              <ComentariosDocumento projetoId={projetoId} documentoId={documento.id} papel={papel} userId={userId} />
            </div>

            <DialogEnvio projetoId={projetoId} documento={documento} aberto={envioAberto} aoMudar={setEnvioAberto} />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
