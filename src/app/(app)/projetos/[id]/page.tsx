import type { Metadata } from "next";
import { VisaoGeralProjeto } from "@/components/projetos/visao-geral/visao-geral";
import { contextoProjeto } from "@/lib/projeto/servidor";

export const metadata: Metadata = { title: "Visão geral" };

// Visão geral do projeto. O layout já mostra breadcrumb, título, situação e abas;
// aqui só o conteúdo. contextoProjeto devolve 404 sem acesso (cache por requisição, sem custo extra).
export default async function PaginaVisaoGeral({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { papel } = await contextoProjeto(id);
  return <VisaoGeralProjeto projetoId={id} papel={papel} />;
}
