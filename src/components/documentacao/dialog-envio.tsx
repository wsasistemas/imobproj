"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Upload } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { criarDocumentoComArquivo, registrarNovaVersao } from "@/app/(app)/projetos/[id]/documentacao/acoes";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TIPO_DOCUMENTO, type DocumentTipo, type Documento } from "@/lib/projeto/tipos";
import { enviarArquivo, removerArquivo } from "./arquivos";
import { chaves } from "./consultas";
import { caminhoArquivo, proximaVersaoMenor, TAMANHO_MAXIMO_ARQUIVO } from "./utilidades";

const TIPOS_ARQUIVO = (Object.keys(TIPO_DOCUMENTO) as DocumentTipo[]).filter(
  (t) => t !== "processo_asis" && t !== "processo_tobe",
);

/**
 * Envia um arquivo: cria um documento novo (versão 1.0) ou, com `documento`, uma nova versão (1.0 → 1.1).
 * Ordem: upload direto no Storage → Server Action registra (e confere que o objeto existe) → se o registro
 * falhar, o arquivo enviado é removido.
 */
export function DialogEnvio({
  projetoId,
  documento,
  aberto,
  aoMudar,
  aoCriar,
}: {
  projetoId: string;
  documento?: Documento | null;
  aberto: boolean;
  aoMudar: (aberto: boolean) => void;
  aoCriar?: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const id = useId();
  const [tipo, setTipo] = useState<DocumentTipo>("escopo");
  const [titulo, setTitulo] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const novaVersao = !!documento;

  function limpar() {
    setTipo("escopo");
    setTitulo("");
    setArquivo(null);
    setErro(null);
  }

  const envio = useMutation({
    mutationFn: async () => {
      if (!arquivo) throw new Error("Escolha um arquivo.");
      if (arquivo.size > TAMANHO_MAXIMO_ARQUIVO) throw new Error("O arquivo passa do limite de 50 MB.");
      if (documento) {
        const versao = proximaVersaoMenor(documento.versao);
        const caminho = caminhoArquivo(projetoId, documento.id, versao, arquivo.name);
        await enviarArquivo(caminho, arquivo);
        const r = await registrarNovaVersao({
          projectId: projetoId,
          documentId: documento.id,
          versaoAtual: documento.versao,
          storagePath: caminho,
          nomeArquivo: arquivo.name,
        });
        if (!r.ok) {
          await removerArquivo(caminho);
          throw new Error(r.erro);
        }
        return { id: documento.id, versao: r.dados.versao };
      }
      if (titulo.trim().length < 3) throw new Error("O título precisa de pelo menos 3 caracteres.");
      const novoId = crypto.randomUUID();
      const caminho = caminhoArquivo(projetoId, novoId, "1.0", arquivo.name);
      await enviarArquivo(caminho, arquivo);
      const r = await criarDocumentoComArquivo({
        projectId: projetoId,
        documentId: novoId,
        tipo,
        titulo,
        storagePath: caminho,
        nomeArquivo: arquivo.name,
      });
      if (!r.ok) {
        await removerArquivo(caminho);
        throw new Error(r.erro);
      }
      return { id: novoId, versao: "1.0" };
    },
    onSuccess: ({ id: docId, versao }) => {
      toast.success(novaVersao ? `Versão ${versao} enviada.` : "Documento criado na versão 1.0.");
      queryClient.invalidateQueries({ queryKey: chaves.documentos(projetoId) });
      limpar();
      aoMudar(false);
      if (!novaVersao) aoCriar?.(docId);
    },
    onError: (e: Error) => setErro(e.message),
  });

  return (
    <Dialog
      open={aberto}
      onOpenChange={(a) => {
        if (envio.isPending) return;
        if (!a) limpar();
        aoMudar(a);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{novaVersao ? "Enviar nova versão" : "Enviar documento"}</DialogTitle>
          <DialogDescription>
            {novaVersao
              ? `${documento!.titulo}: a versão passa de ${documento!.versao} para ${proximaVersaoMenor(documento!.versao)}.`
              : "O documento começa como rascunho, na versão 1.0. Arquivos de até 50 MB."}
          </DialogDescription>
        </DialogHeader>

        <form
          id={`${id}-form`}
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setErro(null);
            envio.mutate();
          }}
        >
          {!novaVersao && (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor={`${id}-tipo`}>Tipo</Label>
                <Select items={TIPO_DOCUMENTO} value={tipo} onValueChange={(v) => v && setTipo(v as DocumentTipo)}>
                  <SelectTrigger id={`${id}-tipo`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_ARQUIVO.map((t) => (
                      <SelectItem key={t} value={t}>
                        {TIPO_DOCUMENTO[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[12px] text-muted-foreground">Processos AS-IS/TO-BE são criados na aba Processos.</p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${id}-titulo`}>Título</Label>
                <Input
                  id={`${id}-titulo`}
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Ex.: Declaração de Escopo"
                  maxLength={200}
                  required
                />
              </div>
            </>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-arquivo`}>Arquivo</Label>
            <Input
              id={`${id}-arquivo`}
              type="file"
              required
              onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
              className="h-auto py-1.5"
            />
          </div>
          {erro && (
            <p role="alert" className="rounded-[8px] bg-danger-bg px-3 py-2 text-[13px] text-danger">
              {erro}
            </p>
          )}
        </form>

        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => aoMudar(false)} disabled={envio.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form={`${id}-form`} disabled={envio.isPending}>
            {envio.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}
            {envio.isPending ? "Enviando…" : "Enviar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
