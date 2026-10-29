import type { Metadata } from "next";
import { Equipes } from "@/components/cadastros/equipes";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { SemAcesso } from "@/components/shell/sem-acesso";
import { pode } from "@/lib/perfil-acesso";

export const metadata: Metadata = { title: "Equipes" };

// Cadastros › Equipes. Todos os logados consultam; altera o super admin ou quem o perfil autoriza (RLS teams_write).
export default async function EquipesPage() {
  const [podeVer, podeEditar] = await Promise.all([pode("cadastros_equipes"), pode("cadastros_equipes", "editar")]);
  if (!podeVer) return <SemAcesso menu="cadastros_equipes" />;
  return (
    <>
      <CabecalhoPagina
        migalhas={[{ label: "Cadastros" }, { label: "Equipes" }]}
        titulo="Equipes"
        subtitulo="Grupos de pessoas dentro de um setor. Uma pessoa pode estar em várias equipes."
      />
      <Equipes podeEditar={podeEditar} />
    </>
  );
}
