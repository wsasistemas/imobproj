import type { Metadata } from "next";
import { AnotacoesEquipe } from "@/components/anotacoes/anotacoes-equipe";
import { contextoProjeto } from "@/lib/projeto/servidor";

export const metadata: Metadata = { title: "Anotações da equipe" };

// Grupos de WhatsApp com 30 dias sem mensagem (D5): saem de Conversas e ficam aqui, só leitura, por equipe.
// Quem lê (D8): membros da equipe do grupo; gerente, diretor e super admin leem todas. As funções do banco
// (anotacoes_grupos / anotacoes_mensagens) aplicam a regra. Nada desta aba aparece nem é citado na OS.
export default async function AnotacoesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { projeto } = await contextoProjeto(id);
  return <AnotacoesEquipe projetoId={projeto.id} />;
}
