import type { Metadata } from "next";
import { DialogNovoProjeto } from "@/components/projetos/dialog-novo-projeto";
import { ListaProjetos } from "@/components/projetos/lista-projetos";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { ehSuperAdmin } from "@/lib/projeto/servidor";

export const metadata: Metadata = { title: "Projetos" };

// Lista de projetos do usuário (a RLS filtra). "Novo projeto" só aparece para o super admin;
// a Server Action criarProjeto confere de novo (exigirSuperAdmin) e a RLS projects_insert também.
export default async function PaginaProjetos() {
  const superAdmin = await ehSuperAdmin();
  return (
    <>
      <CabecalhoPagina
        migalhas={[{ label: "Projetos", href: "/projetos" }]}
        titulo="Projetos"
        subtitulo="Acompanhe situação, avanço físico, horas aprovadas e OS aguardando aceite de cada projeto."
        acoes={superAdmin ? <DialogNovoProjeto /> : undefined}
      />
      <ListaProjetos podeCriar={superAdmin} />
    </>
  );
}
