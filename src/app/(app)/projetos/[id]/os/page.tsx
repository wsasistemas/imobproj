import type { Metadata } from "next";
import { Suspense } from "react";
import { ListaOs, TabelaSkeleton } from "@/components/os/lista-os";
import { Card } from "@/components/ui/card";
import { contextoProjeto } from "@/lib/projeto/servidor";

export const metadata: Metadata = { title: "Ordens de Serviço" };

// Lista de OS com filtros em pílula, busca e painel de detalhe (?os=<id>). A RLS filtra o que cada
// papel vê (prestador: só as próprias OS); as ações conferem permissão no servidor (acoes.ts).
export default async function OrdensServicoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { projeto, papel, userId } = await contextoProjeto(id);
  return (
    <Suspense
      fallback={
        <Card className="py-0">
          <TabelaSkeleton />
        </Card>
      }
    >
      <ListaOs projetoId={projeto.id} papel={papel} userId={userId} />
    </Suspense>
  );
}
