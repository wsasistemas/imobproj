"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { importarEap } from "@/app/(app)/projetos/[id]/documentacao/acoes-eap";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { chaves, type LinhaEap, type MembroProjeto } from "./consultas";
import { lerPlanilha, validarLinhas, type LinhaPrevia } from "./eap-planilha";
import { dataCurta, formatoHoras } from "./utilidades";

/** Importar planilha → pré-visualização com validação por linha → gravar só as linhas válidas. */
export function DialogImportarEap({
  projetoId,
  aberto,
  aoMudar,
  itens,
  membros,
}: {
  projetoId: string;
  aberto: boolean;
  aoMudar: (a: boolean) => void;
  itens: LinhaEap[];
  membros: MembroProjeto[];
}) {
  const queryClient = useQueryClient();
  const id = useId();
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);
  const [previa, setPrevia] = useState<LinhaPrevia[] | null>(null);
  const [erroLeitura, setErroLeitura] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const [soProblemas, setSoProblemas] = useState(false);

  const validas = useMemo(() => previa?.filter((p) => p.erros.length === 0) ?? [], [previa]);
  const comErro = (previa?.length ?? 0) - validas.length;
  const criar = validas.filter((p) => p.acao === "criar").length;
  const atualizar = validas.length - criar;
  const comAviso = previa?.filter((p) => p.avisos.length > 0).length ?? 0;

  function limpar() {
    setNomeArquivo(null);
    setPrevia(null);
    setErroLeitura(null);
    setSoProblemas(false);
  }

  async function escolher(arquivo: File | undefined) {
    limpar();
    if (!arquivo) return;
    setNomeArquivo(arquivo.name);
    setLendo(true);
    try {
      const { linhas, colunasFaltando } = await lerPlanilha(arquivo);
      if (colunasFaltando.length) {
        setErroLeitura(`A planilha não tem a(s) coluna(s): ${colunasFaltando.join(", ")}. Use o modelo.`);
        return;
      }
      if (linhas.length === 0) {
        setErroLeitura("A primeira aba da planilha não tem linhas preenchidas.");
        return;
      }
      const nomePorEmail = new Map(membros.filter((m) => m.email).map((m) => [m.email!.toLowerCase(), m.nome]));
      setPrevia(validarLinhas(linhas, new Set(itens.map((i) => i.codigo)), nomePorEmail));
    } catch {
      setErroLeitura("Não foi possível ler o arquivo. Confira se é uma planilha .xlsx válida.");
    } finally {
      setLendo(false);
    }
  }

  const gravar = useMutation({
    mutationFn: async () => {
      const r = await importarEap({ projectId: projetoId, linhas: validas.map((v) => v.dados) });
      if (!r.ok) throw new Error(r.erro);
      return r.dados;
    },
    onSuccess: (d) => {
      toast.success(`EAP importada: ${d.criados} criado(s), ${d.atualizados} atualizado(s).`);
      queryClient.invalidateQueries({ queryKey: chaves.eap(projetoId) });
      limpar();
      aoMudar(false);
    },
    onError: (e: Error) => {
      toast.error(e.message);
      queryClient.invalidateQueries({ queryKey: chaves.eap(projetoId) });
    },
  });

  const visiveis = soProblemas ? (previa ?? []).filter((p) => p.erros.length || p.avisos.length) : (previa ?? []);

  return (
    <Dialog
      open={aberto}
      onOpenChange={(a) => {
        if (gravar.isPending) return;
        if (!a) limpar();
        aoMudar(a);
      }}
    >
      <DialogContent className="max-h-[90vh] grid-rows-[auto_auto_minmax(0,1fr)_auto] sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Importar EAP de planilha</DialogTitle>
          <DialogDescription>
            Colunas: codigo, titulo, responsavel_email, horas_orcadas, inicio, fim, marco. Códigos existentes são atualizados;
            novos são criados; nada é excluído.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-arquivo`}>Planilha (.xlsx)</Label>
          <Input
            id={`${id}-arquivo`}
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="h-auto py-1.5"
            onChange={(e) => escolher(e.target.files?.[0])}
          />
        </div>

        <div className="min-h-0 overflow-auto">
          {lendo ? (
            <p className="flex items-center gap-2 py-6 text-muted-foreground" aria-live="polite">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Lendo {nomeArquivo}…
            </p>
          ) : erroLeitura ? (
            <p role="alert" className="rounded-[8px] bg-danger-bg px-3 py-2 text-[13px] text-danger">
              {erroLeitura}
            </p>
          ) : !previa ? (
            <div className="flex flex-col items-center gap-2 rounded-[12px] border border-dashed border-border py-10 text-center text-muted-foreground">
              <FileSpreadsheet className="size-8" aria-hidden="true" />
              <p className="max-w-sm text-[13px]">
                Escolha a planilha para ver a pré-visualização. Nada é gravado até você clicar em “Gravar”.
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              <div className="flex flex-wrap items-center gap-2 text-[13px]" aria-live="polite">
                <Badge variant="success">{criar} a criar</Badge>
                <Badge variant="info">{atualizar} a atualizar</Badge>
                {comErro > 0 && <Badge variant="danger">{comErro} com erro (ignoradas)</Badge>}
                {comAviso > 0 && <Badge variant="warning">{comAviso} com aviso</Badge>}
                {(comErro > 0 || comAviso > 0) && (
                  <label className="ml-auto flex items-center gap-2 text-muted-foreground">
                    <input type="checkbox" checked={soProblemas} onChange={(e) => setSoProblemas(e.target.checked)} className="size-4 accent-[var(--primary)]" />
                    Mostrar só linhas com problema
                  </label>
                )}
              </div>
              <div className="overflow-hidden rounded-[10px] border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Linha</TableHead>
                      <TableHead>Ação</TableHead>
                      <TableHead>Código</TableHead>
                      <TableHead>Título</TableHead>
                      <TableHead>Responsável</TableHead>
                      <TableHead className="text-right">Horas</TableHead>
                      <TableHead>Início</TableHead>
                      <TableHead>Fim</TableHead>
                      <TableHead>Marco</TableHead>
                      <TableHead>Validação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visiveis.map((p) => {
                      const invalida = p.erros.length > 0;
                      return (
                        <TableRow key={p.numero} className={cn(invalida && "bg-danger-bg/50 hover:bg-danger-bg/60")}>
                          <TableCell className="tabular-nums text-muted-foreground">{p.numero}</TableCell>
                          <TableCell>
                            {invalida ? (
                              <Badge variant="neutral">Ignorar</Badge>
                            ) : p.acao === "criar" ? (
                              <Badge variant="success">Criar</Badge>
                            ) : (
                              <Badge variant="info">Atualizar</Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-medium tabular-nums">{p.dados.codigo || "—"}</TableCell>
                          <TableCell className="max-w-[240px] truncate" title={p.dados.titulo}>
                            {p.dados.titulo || "—"}
                          </TableCell>
                          <TableCell className="max-w-[160px] truncate">{p.responsavelNome ?? "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatoHoras.format(p.dados.horas_orcadas)}</TableCell>
                          <TableCell className="tabular-nums">{dataCurta(p.dados.inicio)}</TableCell>
                          <TableCell className="tabular-nums">{dataCurta(p.dados.fim)}</TableCell>
                          <TableCell>{p.dados.marco ? "Sim" : "Não"}</TableCell>
                          <TableCell className="min-w-[220px] whitespace-normal text-[12.5px]">
                            {p.erros.length === 0 && p.avisos.length === 0 && (
                              <span className="inline-flex items-center gap-1 text-success">
                                <CheckCircle2 className="size-3.5" aria-hidden="true" /> OK
                              </span>
                            )}
                            {p.erros.map((e) => (
                              <span key={e} className="flex items-start gap-1 text-danger">
                                <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                                <span>
                                  <span className="sr-only">Erro: </span>
                                  {e}
                                </span>
                              </span>
                            ))}
                            {p.avisos.map((a) => (
                              <span key={a} className="flex items-start gap-1 text-warning">
                                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                                <span>
                                  <span className="sr-only">Aviso: </span>
                                  {a}
                                </span>
                              </span>
                            ))}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => aoMudar(false)} disabled={gravar.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => gravar.mutate()} disabled={gravar.isPending || validas.length === 0}>
            {gravar.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}
            Gravar {validas.length > 0 ? `${validas.length} linha(s) válida(s)` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
