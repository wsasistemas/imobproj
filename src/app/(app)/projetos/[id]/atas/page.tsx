import type { Metadata } from "next";
import { Suspense } from "react";
import { Atas } from "@/components/atas/atas";
import { AtasSkeleton } from "@/components/atas/esqueletos";
import { contextoProjeto } from "@/lib/projeto/servidor";

export const metadata: Metadata = { title: "Atas de reunião" };

// Mestre-detalhe das atas (?ata=<id>): participantes com presença/ciência, pauta, decisões, encaminhamentos
// (com toggle "No cronograma"), anexos, PDF e envio ao WhatsApp. A RLS filtra a leitura; as ações conferem
// permissão no servidor (acoes.ts).
export default async function AtasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { projeto, papel, userId } = await contextoProjeto(id);
  return (
    <Suspense fallback={<AtasSkeleton />}>
      <Atas projeto={{ id: projeto.id, codigo: projeto.codigo, nome: projeto.nome }} papel={papel} userId={userId} />
    </Suspense>
  );
}
