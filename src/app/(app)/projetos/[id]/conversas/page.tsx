import type { Metadata } from "next";
import { CentralConversas } from "@/components/conversas/central-conversas";
import { contextoProjeto } from "@/lib/projeto/servidor";

export const metadata: Metadata = { title: "Conversas" };

// Conversas dos grupos de WhatsApp do projeto (OpenWA), no layout do portal de atendimento da Calper:
// grupos à esquerda, mensagens em tempo real no centro e contexto do grupo à direita.
// A RLS filtra a leitura (prestador não vê grupos); as ações conferem a permissão no servidor (acoes.ts).
export default async function ConversasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { projeto, papel, userId } = await contextoProjeto(id);
  return <CentralConversas projetoId={projeto.id} papel={papel} userId={userId} />;
}
