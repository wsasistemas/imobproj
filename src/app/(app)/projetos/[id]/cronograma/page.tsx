import type { Metadata } from "next";
import { Suspense } from "react";
import { Cronograma } from "@/components/cronograma/cronograma";
import { EsqueletoCronograma } from "@/components/cronograma/esqueleto";
import { pode } from "@/lib/projeto/permissoes";
import { contextoProjeto } from "@/lib/projeto/servidor";

export const metadata: Metadata = { title: "Cronograma" };

// Cronograma: calendário (Dia | Semana | Mês, FullCalendar) e Gantt próprio. Visão em ?visao=.
export default async function CronogramaPage({ params }: { params: Promise<{ id: string }> }) {
  const { projeto, papel } = await contextoProjeto((await params).id);
  return (
    <Suspense fallback={<EsqueletoCronograma />}>
      <Cronograma
        projetoId={projeto.id}
        projetoCodigo={projeto.codigo}
        podeEditar={pode(papel, "cronograma_editar")}
        podeLinhaBase={pode(papel, "linha_base_criar")}
      />
    </Suspense>
  );
}
