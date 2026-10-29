import type { Metadata } from "next";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { SemAcesso } from "@/components/shell/sem-acesso";
import { GerenciarTutoriais } from "@/components/treinamento/gerenciar-tutoriais";
import { minhasPermissoes } from "@/lib/perfil-acesso";

export const metadata: Metadata = { title: "Gerenciar tutoriais" };

// Centro de Treinamento › Gerenciar tutoriais: só o super admin (as funções tr_admin_* conferem de novo no banco).
export default async function GerenciarTutoriaisPage() {
  const permissoes = await minhasPermissoes();
  if (!permissoes.superAdmin) return <SemAcesso menu="treinamento_gerenciar" />;
  return (
    <>
      <CabecalhoPagina
        migalhas={[{ label: "Centro de Treinamento", href: "/treinamento/meus" }, { label: "Gerenciar tutoriais" }]}
        titulo="Centro de Treinamento"
        subtitulo="Módulos, balões, a trilha de cada perfil e o progresso de quem já fez."
        abas={[
          { label: "Meus treinamentos", href: "/treinamento/meus" },
          { label: "Gerenciar tutoriais", href: "/treinamento/gerenciar", ativa: true },
        ]}
      />
      <GerenciarTutoriais />
    </>
  );
}
