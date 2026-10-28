"use client";

import { useQueryClient } from "@tanstack/react-query";
import { FileDown, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { PapelMembro } from "@/lib/projeto/tipos";
import type { ProjetoAta } from "./atas";
import { buscarMembros, chavesAtas, type AtaDetalhe } from "./dados";

/** "Gerar PDF": monta o documento no navegador (react-pdf carregado só no clique) e baixa ata-<nº>-<codigo>.pdf. */
export function BotaoGerarPdf({ projeto, ata }: { projeto: ProjetoAta; ata: AtaDetalhe }) {
  const [gerando, setGerando] = useState(false);
  const queryClient = useQueryClient();

  const gerar = async () => {
    setGerando(true);
    try {
      const [{ pdf }, { PdfAta }, membros] = await Promise.all([
        import("@react-pdf/renderer"),
        import("./pdf-ata"),
        queryClient.fetchQuery({ queryKey: chavesAtas.membros(projeto.id), queryFn: () => buscarMembros(projeto.id) }),
      ]);
      const papeis: Record<string, PapelMembro> = Object.fromEntries(membros.map((m) => [m.id, m.papel]));
      const blob = await pdf(
        <PdfAta projeto={{ codigo: projeto.codigo, nome: projeto.nome }} ata={ata} papeis={papeis} geradoEm={new Date()} />,
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ata-${ata.numero}-${projeto.codigo.replace(/[^\w-]+/g, "_")}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      toast.error("Não foi possível gerar o PDF. Tente de novo.");
    } finally {
      setGerando(false);
    }
  };

  return (
    <Button variant="outline" size="sm" className="h-9" onClick={gerar} disabled={gerando}>
      {gerando ? <Loader2 className="animate-spin" aria-hidden="true" /> : <FileDown aria-hidden="true" />}
      {gerando ? "Gerando…" : "Gerar PDF"}
    </Button>
  );
}
