import type { Metadata } from "next";
import { Equipes } from "@/components/cadastros/equipes";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { ehSuperAdmin } from "@/lib/projeto/servidor";

export const metadata: Metadata = { title: "Equipes" };

// Cadastros › Equipes. Todos os logados consultam; só o super admin altera (RLS teams_write).
export default async function EquipesPage() {
  const superAdmin = await ehSuperAdmin();
  return (
    <>
      <CabecalhoPagina
        migalhas={[{ label: "Cadastros" }, { label: "Equipes" }]}
        titulo="Equipes"
        subtitulo="Grupos de pessoas dentro de um setor. Uma pessoa pode estar em várias equipes."
      />
      <Equipes superAdmin={superAdmin} />
    </>
  );
}
