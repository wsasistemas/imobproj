"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileText, ImageOff, Loader2, MapPin, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { registrarEvidencia } from "@/app/(app)/projetos/[id]/os/acoes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { EvidenceTipo } from "@/lib/projeto/tipos";
import { createClient } from "@/lib/supabase/client";
import {
  BUCKET_EVIDENCIAS,
  buscarEvidencias,
  chavesOs,
  formatarDataHora,
  ROTULO_EVIDENCIA,
  type EvidenciaComUrl,
} from "./dados";

const LIMITE_BYTES = 50 * 1024 * 1024; // igual ao file_size_limit do bucket

function nomeSeguro(nome: string) {
  const limpo = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(-80);
  return limpo || "arquivo";
}

export function GaleriaEvidencias({
  projetoId,
  osId,
  podeEnviar,
}: {
  projetoId: string;
  osId: string;
  podeEnviar: boolean;
}) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [aberta, setAberta] = useState<EvidenciaComUrl | null>(null);

  const consulta = useQuery({
    queryKey: chavesOs.evidencias(projetoId, osId),
    queryFn: () => buscarEvidencias(osId),
    staleTime: 30 * 60_000, // as URLs assinadas valem 1 h
  });

  const envio = useMutation({
    mutationFn: async (arquivos: File[]) => {
      const supabase = createClient();
      let enviados = 0;
      for (const arquivo of arquivos) {
        if (arquivo.size > LIMITE_BYTES) throw new Error(`"${arquivo.name}" passa de 50 MB.`);
        const caminho = `${projetoId}/${osId}/${Date.now()}-${nomeSeguro(arquivo.name)}`;
        const tipo: EvidenceTipo = arquivo.type.startsWith("image/") ? "foto" : "arquivo";
        const { error: erroUpload } = await supabase.storage
          .from(BUCKET_EVIDENCIAS)
          .upload(caminho, arquivo, { contentType: arquivo.type || undefined, upsert: false });
        if (erroUpload) throw new Error(`Não foi possível enviar "${arquivo.name}". Verifique sua permissão nesta OS.`);
        const r = await registrarEvidencia({ projectId: projetoId, osId, storagePath: caminho, tipo });
        if (!r.ok) {
          await supabase.storage.from(BUCKET_EVIDENCIAS).remove([caminho]);
          throw new Error(r.erro);
        }
        enviados++;
      }
      return enviados;
    },
    onSuccess: (n) => toast.success(n === 1 ? "Evidência enviada." : `${n} evidências enviadas.`),
    onError: (e) => toast.error(e.message),
    onSettled: () => queryClient.invalidateQueries({ queryKey: chavesOs.evidencias(projetoId, osId) }),
  });

  const lista = consulta.data ?? [];

  return (
    <section aria-labelledby="os-evidencias-titulo" className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 id="os-evidencias-titulo" className="rotulo-secao">
          Evidências {lista.length > 0 && <span className="font-medium normal-case">({lista.length})</span>}
        </h3>
        {podeEnviar && (
          <>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip"
              onChange={(e) => {
                const arquivos = Array.from(e.target.files ?? []);
                e.target.value = "";
                if (arquivos.length) envio.mutate(arquivos);
              }}
            />
            <Button size="sm" variant="outline" disabled={envio.isPending} onClick={() => inputRef.current?.click()}>
              {envio.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}
              {envio.isPending ? "Enviando…" : "Enviar evidência"}
            </Button>
          </>
        )}
      </div>

      {consulta.isPending ? (
        <div className="grid grid-cols-3 gap-2" aria-busy="true" aria-label="Carregando evidências">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="aspect-square w-full rounded-lg" />
          ))}
        </div>
      ) : consulta.isError ? (
        <p role="alert" className="text-[13px] text-danger">
          {consulta.error.message}{" "}
          <button type="button" className="underline" onClick={() => consulta.refetch()}>
            Tentar de novo
          </button>
        </p>
      ) : lista.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-[13px] text-muted-foreground">
          Nenhuma evidência ainda. Fotos, prints e arquivos enviados pelo app de campo, pelo WhatsApp ou por aqui
          aparecem nesta galeria.
        </p>
      ) : (
        <ul className="grid grid-cols-3 gap-2">
          {lista.map((ev) => (
            <li key={ev.id}>
              <button
                type="button"
                onClick={() => setAberta(ev)}
                className="group flex w-full flex-col overflow-hidden rounded-lg border border-border bg-card text-left outline-none transition-colors hover:border-primary-border focus-visible:ring-3 focus-visible:ring-ring/50"
                aria-label={`Abrir ${ROTULO_EVIDENCIA[ev.tipo].toLowerCase()} ${ev.nome}`}
              >
                <span className="grid aspect-square w-full place-items-center overflow-hidden bg-muted">
                  {ev.imagem && ev.url ? (
                    // URL assinada e temporária do Storage: next/image não otimiza esse caso.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ev.url} alt="" loading="lazy" className="size-full object-cover" />
                  ) : ev.imagem ? (
                    <ImageOff className="size-6 text-muted-foreground" aria-hidden="true" />
                  ) : (
                    <FileText className="size-7 text-muted-foreground" aria-hidden="true" />
                  )}
                </span>
                <span className="truncate px-2 py-1 text-[11.5px] text-muted-foreground">{ev.nome}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!aberta} onOpenChange={(a) => !a && setAberta(null)}>
        <DialogContent className="sm:max-w-3xl">
          {aberta && (
            <>
              <DialogHeader>
                <DialogTitle className="pr-8 break-all">{aberta.nome}</DialogTitle>
                <DialogDescription className="flex flex-wrap items-center gap-2">
                  <Badge variant="neutral">{ROTULO_EVIDENCIA[aberta.tipo]}</Badge>
                  <span>Capturada em {formatarDataHora(aberta.captured_at)}</span>
                  {aberta.lat != null && aberta.lng != null && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-3.5" aria-hidden="true" />
                      {aberta.lat.toFixed(5)}, {aberta.lng.toFixed(5)}
                    </span>
                  )}
                </DialogDescription>
              </DialogHeader>
              {aberta.imagem && aberta.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={aberta.url}
                  alt={`${ROTULO_EVIDENCIA[aberta.tipo]}: ${aberta.nome}`}
                  className="max-h-[70vh] w-full rounded-lg bg-muted object-contain"
                />
              ) : (
                <div className="grid place-items-center gap-3 rounded-lg bg-muted px-4 py-10 text-center">
                  <FileText className="size-10 text-muted-foreground" aria-hidden="true" />
                  <p className="text-muted-foreground">
                    {aberta.url
                      ? "Pré-visualização indisponível para este tipo de arquivo."
                      : "O arquivo não foi encontrado no armazenamento (pode ter sido removido)."}
                  </p>
                </div>
              )}
              {aberta.url && (
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    nativeButton={false}
                    render={<a href={aberta.url} target="_blank" rel="noopener noreferrer" download={aberta.nome} />}
                  >
                    <Download aria-hidden="true" />
                    Abrir / baixar
                  </Button>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
