import type { Metadata } from "next";
import { CabecalhoProjeto } from "@/components/projeto/cabecalho-projeto";
import { contextoProjeto } from "@/lib/projeto/servidor";

type Props = { params: Promise<{ id: string }>; children: React.ReactNode };

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { projeto } = await contextoProjeto((await params).id);
  return { title: { default: projeto.codigo, template: `%s · ${projeto.codigo} · IMOBPROJ` } };
}

// Toda tela de um projeto: breadcrumb, código + nome, situação, papel do usuário e as abas em pílula.
// As páginas filhas renderizam só o conteúdo da aba. Sem acesso ao projeto → 404 (contextoProjeto).
export default async function LayoutProjeto({ params, children }: Props) {
  const { projeto, papel } = await contextoProjeto((await params).id);
  return (
    <>
      <CabecalhoProjeto projeto={projeto} papel={papel} />
      {children}
    </>
  );
}
