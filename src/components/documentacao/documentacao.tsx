"use client";

import { FileText, ListTree, Workflow } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Papel } from "@/lib/projeto/tipos";
import { AbaDocumentos } from "./aba-documentos";
import { AbaEap } from "./aba-eap";
import { AbaProcessos } from "./aba-processos";

export type AbaDocumentacao = "documentos" | "eap" | "processos";

export type PropsModulo = { projetoId: string; papel: Papel; userId: string };

/** Sub-abas em pílula. A aba ativa fica em ?aba= (link compartilhável) sem recarregar a página. */
export function Documentacao({ abaInicial, ...props }: PropsModulo & { abaInicial: AbaDocumentacao }) {
  const [aba, setAba] = useState<AbaDocumentacao>(abaInicial);
  const pathname = usePathname();

  function trocar(valor: AbaDocumentacao) {
    setAba(valor);
    const url = valor === "documentos" ? pathname : `${pathname}?aba=${valor}`;
    window.history.replaceState(null, "", url);
  }

  return (
    <Tabs value={aba} onValueChange={(v) => trocar(v as AbaDocumentacao)} className="gap-4">
      <TabsList variant="pill" aria-label="Seções da documentação">
        <TabsTrigger value="documentos">
          <FileText aria-hidden="true" /> Documentos
        </TabsTrigger>
        <TabsTrigger value="eap">
          <ListTree aria-hidden="true" /> EAP
        </TabsTrigger>
        <TabsTrigger value="processos">
          <Workflow aria-hidden="true" /> Processos
        </TabsTrigger>
      </TabsList>
      <TabsContent value="documentos">
        <AbaDocumentos {...props} />
      </TabsContent>
      <TabsContent value="eap">
        <AbaEap {...props} />
      </TabsContent>
      <TabsContent value="processos">
        <AbaProcessos {...props} />
      </TabsContent>
    </Tabs>
  );
}
