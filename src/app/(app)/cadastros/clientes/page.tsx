import type { Metadata } from "next";
import { Clientes } from "@/components/cadastros/clientes";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { SemAcesso } from "@/components/shell/sem-acesso";
import { pode } from "@/lib/perfil-acesso";

export const metadata: Metadata = { title: "Clientes" };

// Cadastros › Clientes. Todos os logados consultam; altera o super admin ou quem o perfil autoriza (Server Actions + RLS organizations_write).
export default async function ClientesPage() {
  const [podeVer, podeEditar] = await Promise.all([pode("cadastros_clientes"), pode("cadastros_clientes", "editar")]);
  if (!podeVer) return <SemAcesso menu="cadastros_clientes" />;
  return (
    <>
      <CabecalhoPagina
        migalhas={[{ label: "Cadastros" }, { label: "Clientes" }]}
        titulo="Clientes"
        subtitulo="Empresas atendidas, contatos principais e os projetos de cada uma."
      />
      <Clientes podeEditar={podeEditar} />
    </>
  );
}
