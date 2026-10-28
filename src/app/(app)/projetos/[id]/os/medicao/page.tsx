import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Medicao } from "@/components/os/medicao";
import { pode } from "@/lib/projeto/permissoes";
import { contextoProjeto } from "@/lib/projeto/servidor";
import CarregandoMedicao from "./loading";

export const metadata: Metadata = { title: "Medição do mês" };

// Medição do mês: só diretor, gerente e super_admin (medicao_ver). Demais papéis → 404.
export default async function MedicaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { projeto, papel } = await contextoProjeto(id);
  if (!pode(papel, "medicao_ver")) notFound();
  return (
    <Suspense fallback={<CarregandoMedicao />}>
      <Medicao projetoId={projeto.id} codigo={projeto.codigo} />
    </Suspense>
  );
}
