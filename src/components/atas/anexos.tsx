"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileText, Loader2, Paperclip, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { removerAnexo } from "@/app/(app)/projetos/[id]/atas/acoes";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { pode } from "@/lib/projeto/permissoes";
import type { Papel } from "@/lib/projeto/tipos";
import { createClient } from "@/lib/supabase/client";
import { RotuloSecao } from "./campos";
import {
  BUCKET_ATAS,
  buscarAnexos,
  chavesAtas,
  formatarDataHora,
  formatarTamanho,
  pastaAnexos,
  type Anexo,
  type AtaDetalhe,
} from "./dados";
import { useAcaoAta } from "./use-acao";

// Anexos ficam só no Storage (bucket "documentos", caminho <project_id>/atas/<meeting_id>/<arquivo>): a lista
// vem do `list` da pasta, sem coluna extra em meetings. Upload direto do navegador (RLS de storage: gerente e
// super admin escrevem; quem vê o projeto lê); remoção pela Server Action removerAnexo.

const LIMITE = 50 * 1024 * 1024;

/** Nome seguro para o Storage, com prefixo de tempo (13 dígitos) para não sobrescrever arquivos de mesmo nome. */
function nomeArquivo(original: string) {
  const ponto = original.lastIndexOf(".");
  const base = (ponto > 0 ? original.slice(0, ponto) : original)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._ -]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 120);
  const ext = ponto > 0 ? original.slice(ponto).toLowerCase().replace(/[^a-z0-9.]/g, "") : "";
  return `${Date.now()}-${base || "arquivo"}${ext}`;
}

export function Anexos({ projetoId, ata, papel }: { projetoId: string; ata: AtaDetalhe; papel: Papel }) {
  const queryClient = useQueryClient();
  const entrada = useRef<HTMLInputElement>(null);
  const [remover, setRemover] = useState<Anexo | null>(null);
  const podeEnviar = pode(papel, "ata_redigir") && ata.status !== "aprovada";

  const consulta = useQuery({
    queryKey: chavesAtas.anexos(projetoId, ata.id),
    queryFn: () => buscarAnexos(projetoId, ata.id),
  });

  const envio = useMutation({
    mutationFn: async (arquivos: File[]) => {
      const supabase = createClient();
      let enviados = 0;
      for (const arquivo of arquivos) {
        if (arquivo.size > LIMITE) throw new Error(`“${arquivo.name}” passa do limite de 50 MB.`);
        const { error } = await supabase.storage
          .from(BUCKET_ATAS)
          .upload(`${pastaAnexos(projetoId, ata.id)}/${nomeArquivo(arquivo.name)}`, arquivo, {
            contentType: arquivo.type || "application/octet-stream",
            upsert: false,
          });
        if (error) {
          const m = error.message.toLowerCase();
          if (m.includes("row-level security") || m.includes("unauthorized") || m.includes("403"))
            throw new Error("Você não tem permissão para anexar arquivos nesta ata.");
          throw new Error(`Não foi possível enviar “${arquivo.name}”. Verifique a conexão e tente de novo.`);
        }
        enviados++;
      }
      return enviados;
    },
    onSuccess: (n) => toast.success(n === 1 ? "Anexo enviado." : `${n} anexos enviados.`),
    onError: (e) => toast.error(e.message),
    onSettled: () => {
      if (entrada.current) entrada.current.value = "";
      queryClient.invalidateQueries({ queryKey: chavesAtas.anexos(projetoId, ata.id) });
    },
  });

  const removerMut = useAcaoAta(projetoId, removerAnexo, "Anexo removido.", () => setRemover(null));

  const baixar = async (a: Anexo) => {
    const { data, error } = await createClient()
      .storage.from(BUCKET_ATAS)
      .createSignedUrl(a.caminho, 60, { download: a.exibicao });
    if (error || !data?.signedUrl) {
      toast.error("Não foi possível gerar o link do anexo. Ele pode ter sido removido.");
      return;
    }
    const link = document.createElement("a");
    link.href = data.signedUrl;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const anexos = consulta.data ?? [];

  return (
    <Card className="gap-0 py-0" aria-labelledby={`anexos-${ata.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
        <RotuloSecao id={`anexos-${ata.id}`}>Anexos</RotuloSecao>
        {podeEnviar && (
          <>
            <input
              ref={entrada}
              type="file"
              multiple
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                const arquivos = Array.from(e.target.files ?? []);
                if (arquivos.length) envio.mutate(arquivos);
              }}
            />
            <Button variant="outline" size="sm" onClick={() => entrada.current?.click()} disabled={envio.isPending}>
              {envio.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}
              {envio.isPending ? "Enviando…" : "Anexar arquivo"}
            </Button>
          </>
        )}
      </div>

      {consulta.isPending ? (
        <div className="grid gap-2 p-5" aria-busy="true" aria-label="Carregando anexos">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-2/3" />
        </div>
      ) : consulta.isError ? (
        <CardContent className="py-6 text-center">
          <p role="alert" className="text-[13px] text-danger">
            {consulta.error.message}
          </p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => consulta.refetch()}>
            Tentar de novo
          </Button>
        </CardContent>
      ) : anexos.length === 0 ? (
        <CardContent className="flex flex-col items-center gap-1 py-8 text-center">
          <Paperclip className="size-6 text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">Nenhum anexo</p>
          <p className="max-w-md text-[13px] text-muted-foreground">
            {podeEnviar
              ? "Anexe apresentações, listas de presença assinadas ou documentos discutidos (até 50 MB por arquivo)."
              : "Nenhum arquivo foi anexado a esta ata."}
          </p>
        </CardContent>
      ) : (
        <ul className="grid">
          {anexos.map((a) => (
            <li key={a.nome} className="flex items-center gap-3 border-b border-border px-5 py-2 last:border-0">
              <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium" title={a.exibicao}>
                  {a.exibicao}
                </p>
                <p className="text-[12px] text-muted-foreground">
                  {[formatarTamanho(a.tamanho), a.criadoEm ? formatarDataHora(a.criadoEm) : null].filter(Boolean).join(" · ")}
                </p>
              </div>
              <Button variant="ghost" size="icon" aria-label={`Baixar ${a.exibicao}`} onClick={() => baixar(a)}>
                <Download aria-hidden="true" />
              </Button>
              {podeEnviar && (
                <Button variant="ghost" size="icon" aria-label={`Remover ${a.exibicao}`} onClick={() => setRemover(a)}>
                  <Trash2 aria-hidden="true" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <AlertDialog open={!!remover} onOpenChange={(a) => !a && !removerMut.isPending && setRemover(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover anexo?</AlertDialogTitle>
            <AlertDialogDescription>“{remover?.exibicao}” será apagado do armazenamento. Não é possível desfazer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removerMut.isPending}>Cancelar</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={removerMut.isPending}
              onClick={() => remover && removerMut.mutate({ projectId: projetoId, meetingId: ata.id, nome: remover.nome })}
            >
              {removerMut.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Remover
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
